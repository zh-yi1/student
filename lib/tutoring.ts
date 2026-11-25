import { randomUUID } from 'node:crypto';
import { canAccessQuestion, getDb, getQuestion, skills } from './db';
import { ApiError, getStudent, normalizeAnswer, requireNoAssessment } from './learning';
import { getTextbookUnit } from './textbooks';
import { coachingReply } from './ai';
import type { Question } from './types';

export type CoachingIntent = 'vocabulary' | 'sentence' | 'reading' | 'exam';
export type CoachingStage = 'diagnose' | 'explain' | 'express' | 'transfer' | 'reflect' | 'completed';
export type LearnerSelfCheck = 'understood' | 'needs_practice' | 'need_help';
export interface CoachingStep { title: string; text: string; prompt: string }
export interface CoachingTransfer { text: string; options: string[]; answer: string; explanation: string }
export interface CoachingLesson { goals: string[]; diagnosticQuestion: string; steps: CoachingStep[]; expressionPrompt: string; transfer: CoachingTransfer; grounding: string; originalPassage?: string }
export interface CoachingMessage { id: string; role: 'assistant' | 'user'; stage: CoachingStage; text: string; source: 'offline' | 'deepseek' | 'student'; createdAt: string }
export interface CoachingGrounding { scope: 'catalog_original_lesson'; note: string; sourceUrl: string; questionId?: string; questionVersion?: number; questionApproved?: boolean }
export interface CoachingContext { bookTitle: string; unitTitle: string; intent: CoachingIntent; topic: string; concern: string; lesson: CoachingLesson; grounding: CoachingGrounding; question?: Question }
export interface CoachingTransferResult { correct: boolean; submittedAnswer: string; answer: string; explanation: string; practiceOnly: true; assisted: boolean }
interface SessionState { stepIndex: number; transferResult: CoachingTransferResult | null; transferAssisted: boolean; learnerSelfCheck: LearnerSelfCheck | null; summary: string | null; pending: string | null }
interface SessionRow { id: string; student_id: string; book_id: string; unit_id: string; intent: CoachingIntent; topic: string; context: string; state: string; status: 'active' | 'completed'; stage: CoachingStage; created_at: string; updated_at: string; completed_at: string | null }
export interface CoachingSession { id: string; studentId: string; bookId: string; unitId: string; bookTitle: string; unitTitle: string; intent: CoachingIntent; topic: string; status: 'active' | 'completed'; stage: CoachingStage; stepIndex: number; grounding: CoachingGrounding; messages: CoachingMessage[]; transferResult: CoachingTransferResult | null; learnerSelfCheck: LearnerSelfCheck | null; summary: string | null; createdAt: string; updatedAt: string; completedAt: string | null; practiceOnly: true }
export interface CoachingTarget { stage: CoachingStage; stepIndex: number; offlineText: string }
const intents: CoachingIntent[] = ['vocabulary', 'sentence', 'reading', 'exam'];
const selfChecks: LearnerSelfCheck[] = ['understood', 'needs_practice', 'need_help'];
const now = () => new Date().toISOString();

function sessionRow(studentId: string, id: string): SessionRow {
  const row = getDb().prepare('SELECT * FROM coaching_sessions WHERE id=? AND student_id=?').get(id, studentId) as unknown as SessionRow | undefined;
  if (!row) throw new ApiError('辅导记录不存在', 404);
  return row;
}
function messagesFor(id: string): CoachingMessage[] {
  return getDb().prepare('SELECT * FROM coaching_messages WHERE session_id=? ORDER BY rowid').all(id).map(row => ({ id: String(row.id), role: row.role as CoachingMessage['role'], stage: row.stage as CoachingStage, text: String(row.text), source: row.source as CoachingMessage['source'], createdAt: String(row.created_at) }));
}
function publicSession(row: SessionRow): CoachingSession {
  const context = JSON.parse(row.context) as CoachingContext;
  const state = JSON.parse(row.state) as SessionState;
  return { id: row.id, studentId: row.student_id, bookId: row.book_id, unitId: row.unit_id, bookTitle: context.bookTitle, unitTitle: context.unitTitle, intent: row.intent, topic: row.topic, status: row.status, stage: row.stage, stepIndex: state.stepIndex, grounding: context.grounding, messages: messagesFor(row.id), transferResult: state.transferResult, learnerSelfCheck: state.learnerSelfCheck, summary: state.summary, createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at, practiceOnly: true };
}
export function listCoaching(studentId: string): CoachingSession[] {
  requireNoAssessment(studentId);
  return (getDb().prepare('SELECT * FROM coaching_sessions WHERE student_id=? ORDER BY updated_at DESC,rowid DESC LIMIT 30').all(studentId) as unknown as SessionRow[]).map(publicSession);
}
export function getCoaching(studentId: string, id: string): CoachingSession {
  requireNoAssessment(studentId);
  return publicSession(sessionRow(studentId, id));
}
export function validateDraftSkill(studentId: string, body: Record<string, unknown>): void {
  const draft = body.draft && typeof body.draft === 'object' ? body.draft as Record<string, unknown> : body;
  if (!skills.some(skill => skill.id === draft.skillId && skill.grade === getStudent(studentId).grade)) throw new ApiError('这道题尚未对应已审核的知识点，请先由老师确认并选择；不会自动归入第一个知识点。');
}
function inputMessage(value: unknown, required = true): string {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > 1600) throw new ApiError('请用 1—1600 字说说你的想法');
  return value.trim();
}
function requestId(body: Record<string, unknown>): string {
  if (body.clientTurnId === undefined) return randomUUID();
  if (typeof body.clientTurnId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(body.clientTurnId)) throw new ApiError('本轮请求编号无效');
  return body.clientTurnId;
}
function buildContext(studentId: string, body: Record<string, unknown>): { context: CoachingContext; bookId: string; unitId: string } {
  if (typeof body.bookId !== 'string' || typeof body.unitId !== 'string') throw new ApiError('请先选择教材版本与单元');
  const selected = getTextbookUnit(body.bookId, body.unitId);
  if (!selected || selected.book.grade !== getStudent(studentId).grade) throw new ApiError('所选教材或单元与当前学生年级不匹配', 404);
  if (!selected.unit.guideReady || !selected.unit.lesson) throw new ApiError('该单元目前只有目录，原创辅导教案尚未配置。请先选择标有可辅导的单元。', 409);
  if (!intents.includes(body.intent as CoachingIntent)) throw new ApiError('请选择词汇、句型、阅读或试卷辅导');
  const intent = body.intent as CoachingIntent;
  const baseLesson = selected.unit.lesson;
  const cardKey = { vocabulary: 'words', sentence: 'sentences', reading: 'reading', exam: '' }[intent];
  const card = cardKey ? baseLesson.cards.find(item => item.id === cardKey || item.id.endsWith(`-${cardKey}`)) : undefined;
  const lesson: CoachingLesson = card ? { goals: [card.objective], diagnosticQuestion: card.diagnosticQuestion, steps: card.steps, expressionPrompt: card.expressionPrompt, transfer: card.transfer, grounding: baseLesson.grounding, originalPassage: card.originalPassage } : { goals: baseLesson.goals, diagnosticQuestion: baseLesson.diagnosticQuestion, steps: baseLesson.steps, expressionPrompt: baseLesson.expressionPrompt, transfer: baseLesson.transfer, grounding: baseLesson.grounding };
  let question: Question | undefined;
  if (body.questionId !== undefined) {
    if (typeof body.questionId !== 'string') throw new ApiError('题目编号无效');
    question = getQuestion(body.questionId);
    if (!question || question.grade !== getStudent(studentId).grade || question.phase !== 'practice' || !canAccessQuestion(studentId, question.id)) throw new ApiError('当前学生不可访问这道辅导题', 404);
  }
  const grounding: CoachingGrounding = { scope: 'catalog_original_lesson', note: `${baseLesson.grounding} 当前只有教材目录与应用原创教案，未读取完整教材或整份真实试卷，不能推定页码。学生输入的材料只按本次提供的内容讨论。`, sourceUrl: selected.unit.sourceUrl || selected.book.sourceUrl };
  if (question) {
    grounding.questionId = question.id; grounding.questionVersion = question.version; grounding.questionApproved = question.approved;
    grounding.note += question.approved ? ' 附带练习题答案已审核；其与教材单元的对应由本次选择提供，不代表已核验试卷出处。' : ' 附带题目及拟定答案尚未审核，不能当作老师核对结论。';
    if (intent === 'exam') {
      lesson.diagnosticQuestion = '先不急着填答案：这道题要求你找什么？请说说最不明白的词或句子。';
      lesson.steps = [
        { title: '读清题目要求', text: `${question.passage ? `给定阅读材料：${question.passage.slice(0,700)}\n` : ''}你提供的题目：${question.text}`, prompt: '请用自己的话说出题目要我们找什么。' },
        { title: '找到依据', text: question.approved ? (question.steps[0] || '回到题干或给定材料，圈出能支持判断的词句。') : '这道题还未审核。先圈出主语、动作、时间或方位等已知信息，不把拟定答案当结论。', prompt: '你找到的依据是哪一个词或哪一句？' },
        { title: '解释为什么', text: question.approved ? question.explanation : '请把“我找到的线索”和“我的推理”连起来说。标准答案与解析仍待老师核对。', prompt: '如果换一个人物或位置，你的判断会怎样变化？' },
      ];
      lesson.expressionPrompt = '请不用照抄答案，用“我从……看出……，所以……”解释一次。';
    }
  }
  const topic = typeof body.topic === 'string' && body.topic.trim() ? body.topic.trim().slice(0,120) : card?.title || selected.unit.topic;
  return { bookId: body.bookId, unitId: body.unitId, context: { bookTitle: selected.book.title, unitTitle: selected.unit.title, intent, topic, concern: inputMessage(body.message, false), lesson, grounding, question } };
}
function appendMessage(studentId: string, id: string, role: CoachingMessage['role'], stage: CoachingStage, text: string, source: CoachingMessage['source'], turnId: string) {
  getDb().prepare('INSERT INTO coaching_messages(id,session_id,student_id,role,stage,text,source,request_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(), id, studentId, role, stage, text, source, turnId, now());
}
function stepText(context: CoachingContext, index: number): string {
  const step = context.lesson.steps[index];
  return `第 ${index + 1} 步 · ${step.title}\n${step.text}\n\n${step.prompt}`;
}
function transferText(context: CoachingContext): string {
  const check = context.lesson.transfer;
  return `现在只换一个情境试一试。这是原创迁移练习，用来看看还需要哪里帮助，不是正式测评。\n${check.text}\n${check.options.map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`).join('\n')}`;
}
function requestsCoachingHelp(text: string): boolean {
  const normalized = text.normalize('NFKC').replace(/[‘’]/g,"'");
  // Match explicit requests, not curricular words such as "help" or "why".
  const chinese = /(不懂|不明白|没听懂|不会说|不会做|不会表达|不会回答|不知道怎么|不知道如何|说不出来|想不出|不确定)|(?:请|能不能|能否|可以|能|麻烦).{0,10}(再讲|解释|举例|提示)|再讲(?:一遍|一下)|给(?:我)?(?:一个|个|一些|一点|点|些)?提示|提示(?:一下|一点)/;
  const english = /(?:^|\s)(?:help\s+me|i\s+(?:still\s+)?need\s+(?:some\s+)?help|(?:can|could|would)\s+you\s+(?:please\s+)?help\s+me|please\s+(?:help|explain|give\s+me\s+(?:a\s+)?hint)|i\s+(?:still\s+)?(?:do\s+not|don't)\s+(?:understand|know)|i(?:'m| am)\s+(?:still\s+)?confused)\b/i;
  return chinese.test(normalized) || english.test(normalized);
}
function nextTarget(row: SessionRow, context: CoachingContext, state: SessionState, text: string): CoachingTarget {
  const asksForHelp = requestsCoachingHelp(text);
  if (row.stage === 'diagnose') return { stage: 'explain', stepIndex: 0, offlineText: `我记下了你的想法：“${text.slice(0,70)}”。我们一次只看一个要点。\n\n${stepText(context,0)}` };
  if (row.stage === 'explain') {
    if (asksForHelp) return { stage: 'explain', stepIndex: state.stepIndex, offlineText: `我们先停在这一步，把例子和你的疑问对照着看。\n\n${stepText(context,state.stepIndex)}\n你可以先指出其中一个看得懂的词。` };
    const next = state.stepIndex + 1;
    if (next < context.lesson.steps.length) return { stage: 'explain', stepIndex: next, offlineText: `收到你的表达：“${text.slice(0,70)}”。接着看下一步。\n\n${stepText(context,next)}` };
    return { stage: 'express', stepIndex: state.stepIndex, offlineText: `刚才的讲解结束了，接下来换你来说明。\n${context.lesson.expressionPrompt}\n你的表达会被记录下来；说过或听过不等于已经掌握。` };
  }
  if (row.stage === 'express') {
    if (asksForHelp) return { stage: 'express', stepIndex: state.stepIndex, offlineText: `先不进入核对题。你可以先用中文补全：“我想说的是……；我找到的词或线索是……”。再只选一个你理解的英文词或句子。\n${context.lesson.expressionPrompt}\n不用一次说完整，我们先听你能表达的一小部分。` };
    return { stage: 'transfer', stepIndex: state.stepIndex, offlineText: `我保留了你的原话：“${text.slice(0,100)}”。\n\n${transferText(context)}` };
  }
  if (row.stage === 'transfer') {
    if (asksForHelp) {
      state.transferAssisted = true;
      return { stage: 'transfer', stepIndex: state.stepIndex, offlineText: `求助不是答错，暂不核对答案。先看题目问的是人物、动作还是说话目的，再回到刚才的原创材料找一处依据。\n${context.lesson.transfer.text}\n你可以说出选项内容或字母。这次已记录使用提示，之后的核对也仍只是辅导记录。` };
    }
    const check = context.lesson.transfer;
    const option = /^[A-Fa-f]$/.test(text.trim()) ? check.options[text.trim().toUpperCase().charCodeAt(0)-65] : undefined;
    const correct = normalizeAnswer(option || text) === normalizeAnswer(check.answer);
    state.transferResult = { correct, submittedAnswer: text, answer: check.answer, explanation: check.explanation, practiceOnly: true, assisted: Boolean(state.transferAssisted) };
    return { stage: 'reflect', stepIndex: state.stepIndex, offlineText: `${correct ? '这一道迁移练习与你的判断一致。' : '这一道提示我们还需要回看依据。'}\n参考答案：${check.answer}\n${check.explanation}\n\n它只记录本次辅导后的表现，不计作掌握分。你现在觉得哪一步还需要再讲？也可以完成自评，保存这次辅导记录。` };
  }
  if (asksForHelp) return { stage: 'reflect', stepIndex: state.stepIndex, offlineText: `可以继续回讲，不必急着结束。我们先重新看最前面的依据：\n${stepText(context,0)}\n刚才那一道核对结果会保留，不会因为重新讲过就改成已掌握。` };
  return { stage: 'reflect', stepIndex: state.stepIndex, offlineText: `我记下了你的补充：“${text.slice(0,100)}”。可以回看刚才的依据：${context.lesson.steps[Math.min(state.stepIndex,context.lesson.steps.length-1)].text}\n你可以说说仍然困惑的地方，或完成自评保存记录。` };
}
async function replyAndSave(studentId: string, row: SessionRow, context: CoachingContext, state: SessionState, target: CoachingTarget, turnId: string) {
  let reply;
  try { reply = await coachingReply(studentId, row.id, turnId, context, messagesFor(row.id), target); }
  catch { reply = { text: `本轮云服务未完成，以下是离线原创引导。\n${target.offlineText}`, source: 'offline' as const }; }
  const db = getDb(); db.exec('BEGIN IMMEDIATE');
  try {
    appendMessage(studentId, row.id, 'assistant', target.stage, reply.text, reply.source, turnId);
    state.stepIndex = target.stepIndex; state.pending = null;
    db.prepare('UPDATE coaching_sessions SET stage=?,state=?,updated_at=? WHERE id=? AND student_id=?').run(target.stage, JSON.stringify(state), now(), row.id, studentId);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return getCoaching(studentId, row.id);
}
export async function startCoaching(studentId: string, body: Record<string, unknown>): Promise<CoachingSession> {
  requireNoAssessment(studentId);
  const selected = buildContext(studentId, body);
  const id = randomUUID(), timestamp = now(), turnId = requestId(body);
  const state: SessionState = { stepIndex: 0, transferResult: null, transferAssisted: false, learnerSelfCheck: null, summary: null, pending: turnId };
  getDb().prepare('INSERT INTO coaching_sessions(id,student_id,book_id,unit_id,intent,topic,context,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, studentId, selected.bookId, selected.unitId, selected.context.intent, selected.context.topic, JSON.stringify(selected.context), JSON.stringify(state), timestamp, timestamp);
  if (selected.context.concern) appendMessage(studentId, id, 'user', 'diagnose', selected.context.concern, 'student', turnId);
  const target: CoachingTarget = { stage: 'diagnose', stepIndex: 0, offlineText: `我们从“${selected.context.topic}”开始。这里使用目录信息和原创辅导教案，不是教材原文。\n${selected.context.concern ? `你想问：“${selected.context.concern.slice(0,100)}”。\n` : ''}${selected.context.lesson.originalPassage ? `\n原创短文：\n${selected.context.lesson.originalPassage}\n\n` : ''}${selected.context.lesson.diagnosticQuestion}` };
  return replyAndSave(studentId, sessionRow(studentId,id), selected.context, state, target, turnId);
}
export async function sendCoaching(studentId: string, body: Record<string, unknown>): Promise<CoachingSession> {
  requireNoAssessment(studentId);
  if (typeof body.sessionId !== 'string') throw new ApiError('请先开始一次辅导');
  const text = inputMessage(body.message), turnId = requestId(body);
  const row = sessionRow(studentId, body.sessionId);
  if (row.status !== 'active') throw new ApiError('本次辅导已保存，请开始新的辅导',409);
  const duplicate = getDb().prepare('SELECT text FROM coaching_messages WHERE session_id=? AND request_id=? AND role=\'user\'').get(row.id,turnId);
  if (duplicate) {
    if (duplicate.text !== text) throw new ApiError('同一请求编号不能重复提交不同内容',409);
    if (getDb().prepare('SELECT id FROM coaching_messages WHERE session_id=? AND request_id=? AND role=\'assistant\'').get(row.id,turnId)) return getCoaching(studentId,row.id);
    throw new ApiError('本轮仍在处理或结果尚未确定，请稍后查看记录，避免重复请求',409);
  }
  if (messagesFor(row.id).length >= 60) throw new ApiError('本次辅导已较长，请保存记录后开始新的问题',409);
  const context = JSON.parse(row.context) as CoachingContext, state = JSON.parse(row.state) as SessionState;
  if (state.pending) throw new ApiError('上一轮尚未完成，请稍后查看记录',409);
  if (context.question && !canAccessQuestion(studentId,context.question.id)) throw new ApiError('当前学生不可访问附带题目',403);
  const target = nextTarget(row,context,state,text);
  const db = getDb(); db.exec('BEGIN IMMEDIATE');
  try {
    const latest = JSON.parse(sessionRow(studentId,row.id).state) as SessionState;
    if (latest.pending) throw new ApiError('上一轮尚未完成',409);
    state.pending = turnId;
    appendMessage(studentId,row.id,'user',row.stage,text,'student',turnId);
    db.prepare('UPDATE coaching_sessions SET state=?,updated_at=? WHERE id=? AND student_id=?').run(JSON.stringify(state),now(),row.id,studentId);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return replyAndSave(studentId,row,context,state,target,turnId);
}
export function completeCoaching(studentId: string, body: Record<string, unknown>): CoachingSession {
  requireNoAssessment(studentId);
  if (typeof body.sessionId !== 'string' || !selfChecks.includes(body.learnerSelfCheck as LearnerSelfCheck)) throw new ApiError('请先选择本次自评');
  const row = sessionRow(studentId,body.sessionId);
  if (row.status === 'completed') return getCoaching(studentId,row.id);
  const state = JSON.parse(row.state) as SessionState;
  if (state.pending) throw new ApiError('请等待当前回复完成后保存记录',409);
  const context = JSON.parse(row.context) as CoachingContext;
  state.learnerSelfCheck = body.learnerSelfCheck as LearnerSelfCheck;
  const labels = { understood:'我暂时听懂了', needs_practice:'我还想再练习', need_help:'我还需要帮助' };
  const turns = messagesFor(row.id).filter(message=>message.role==='user').length;
  state.summary = `围绕“${context.topic}”记录了 ${turns} 次学生表达。${state.transferResult ? `已做 1 道原创迁移核对${state.transferResult.assisted?'（使用过提示）':''}：${state.transferResult.correct?'本次答对':'仍需回看依据'}。` : '尚未完成迁移核对。'}学生自评：${labels[state.learnerSelfCheck]}。这是辅导过程记录，不代表已掌握，也不改变独立测评成绩。`;
  const timestamp=now(),turnId=randomUUID();
  const db=getDb();db.exec('BEGIN IMMEDIATE');
  try{
    appendMessage(studentId,row.id,'user','reflect',`本次自评：${labels[state.learnerSelfCheck]}`,'student',turnId);
    appendMessage(studentId,row.id,'assistant','completed',state.summary,'offline',turnId);
    db.prepare("UPDATE coaching_sessions SET state=?,status='completed',stage='completed',updated_at=?,completed_at=? WHERE id=? AND student_id=?").run(JSON.stringify(state),timestamp,timestamp,row.id,studentId);
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  return getCoaching(studentId,row.id);
}
