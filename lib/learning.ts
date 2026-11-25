import { randomUUID } from 'node:crypto';
import { allQuestions, assignQuestionOwner, budget, canAccessQuestion, getDb, getQuestion, saveQuestionVersion, skills, stories, students } from './db';
import type { Attempt, Feedback, Phase, PublicQuestion, Question, Student } from './types';

export class ApiError extends Error {
  constructor(message: string, public status = 400) { super(message); this.name = 'ApiError'; }
}
export function getStudent(id: string): Student {
  const student = students.find(s => s.id === id);
  if (!student) throw new ApiError('学生不存在', 404);
  return student;
}
export function publicQuestion(question: Question): PublicQuestion {
  const { answer: _answer, alternatives: _alternatives, explanation: _explanation, steps: _steps, ...safe } = question;
  return safe;
}
export function normalizeAnswer(value: string, caseSensitive = false): string {
  const normalized = value.normalize('NFKC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim().replace(/\s+/g, ' ').replace(/[.。!?！？]+$/, '');
  return caseSensitive ? normalized : normalized.toLocaleLowerCase('en-US');
}
export function gradeAnswer(question: Question, answer: string): boolean {
  const normalized = normalizeAnswer(answer, question.caseSensitive);
  if (!normalized) return false;
  return [question.answer, ...(question.alternatives || [])].some(expected => normalizeAnswer(expected, question.caseSensitive) === normalized);
}

type AttemptRow = { id: string; student_id: string; question_id: string; version: number; answer: string; correct: number; assisted: number; phase: Phase; created_at: string; sample: number; provisional: number; assessment_id: string | null };
type ReviewRow = { student_id: string; question_id: string; attempt_id: string; stage: number; due_at: string; corrected_at: string | null; resolved: number };
type AssessmentRow = { id: string; student_id: string; phase: Phase; questions: string; created_at: string; completed_at: string | null; result: string | null; cancelled: number };
type ReviewSourceRow = { question_id: string; source_question_id: string; source_version: number; assessment_id: string; student_id: string; attempt_id: string };
function asAttempt(row: AttemptRow, effective = true): Attempt & { rawCorrect: boolean; provisional: boolean } {
  const question = getQuestion(row.question_id);
  return { id: row.id, studentId: row.student_id, questionId: row.question_id, version: row.version, answer: row.answer, correct: effective && question?.approved ? gradeAnswer(question, row.answer) : Boolean(row.correct), rawCorrect: Boolean(row.correct), assisted: Boolean(row.assisted), phase: row.phase, createdAt: row.created_at, sample: Boolean(row.sample), provisional: !question?.approved };
}
function rowsFor(studentId: string): AttemptRow[] {
  return getDb().prepare('SELECT * FROM attempts WHERE student_id=? ORDER BY created_at,rowid').all(studentId) as unknown as AttemptRow[];
}
function officialRows(studentId: string): AttemptRow[] { return rowsFor(studentId).filter(row => getQuestion(row.question_id)?.approved); }
function addDays(iso: string, days: number): string { return new Date(Date.parse(iso) + days * 86400000).toISOString(); }
function independentFirstAttempts(attempts: Attempt[]): Attempt[] {
  const first = new Map<string, Attempt>();
  for (const attempt of attempts) {
    if (attempt.sample) continue;
    const source = getDb().prepare('SELECT source_question_id,source_version FROM review_sources WHERE question_id=?').get(attempt.questionId);
    const key = source ? `${source.source_question_id}@${source.source_version}` : `${attempt.questionId}@${attempt.version}`;
    if (!first.has(key)) first.set(key, attempt);
  }
  return [...first.values()].filter(attempt => !attempt.assisted);
}

export function activeAssessment(studentId: string) {
  const row = getDb().prepare('SELECT * FROM assessments WHERE student_id=? AND completed_at IS NULL AND cancelled=0 ORDER BY created_at DESC LIMIT 1').get(studentId) as unknown as AssessmentRow | undefined;
  if (!row) return null;
  const questions = (JSON.parse(row.questions) as { id: string; version: number }[]).map(ref => publicQuestion(getQuestion(ref.id, ref.version)!));
  return { id: row.id, phase: row.phase, createdAt: row.created_at, questions };
}
export function requireNoAssessment(studentId: string): void {
  if (activeAssessment(studentId)) throw new ApiError('测评进行中，请先提交或退出测评，再使用练习、讲解与错题本。', 409);
}
export function practiceQuestions(studentId: string, skillId?: string) {
  requireNoAssessment(studentId);
  const student = getStudent(studentId);
  return allQuestions().filter(q => q.grade === student.grade && q.phase === 'practice' && canAccessQuestion(studentId, q.id) && (!skillId || skillId === 'all' || q.skillId === skillId)).map(publicQuestion);
}

function adjustReview(studentId: string, question: Question, attempt: Attempt) {
  if (!question.approved || attempt.phase !== 'practice') return;
  const db = getDb();
  const current = db.prepare('SELECT * FROM reviews WHERE student_id=? AND question_id=?').get(studentId, question.id) as unknown as ReviewRow | undefined;
  if (!attempt.correct) {
    db.prepare('INSERT INTO reviews(student_id,question_id,attempt_id,stage,due_at,corrected_at,resolved) VALUES(?,?,?,0,?,NULL,0) ON CONFLICT(student_id,question_id) DO UPDATE SET attempt_id=excluded.attempt_id,stage=0,resolved=0,due_at=excluded.due_at,corrected_at=NULL').run(studentId, question.id, attempt.id, addDays(attempt.createdAt, 1));
  } else if (current && !current.resolved && !attempt.assisted) {
    if (!current.corrected_at) {
      // Correction is immediate; retention is checked on days 1, 3 and 7 after it.
      db.prepare('UPDATE reviews SET stage=0,corrected_at=?,due_at=? WHERE student_id=? AND question_id=?').run(attempt.createdAt, addDays(attempt.createdAt, 1), studentId, question.id);
    } else if (current.due_at <= attempt.createdAt) {
      const stage = current.stage + 1;
      db.prepare('UPDATE reviews SET stage=?,due_at=?,resolved=? WHERE student_id=? AND question_id=?').run(stage, stage >= 3 ? attempt.createdAt : addDays(current.corrected_at, [1, 3, 7][stage]), Number(stage >= 3), studentId, question.id);
    }
  }
}

export function submitAttempt(studentId: string, body: Record<string, unknown>): Feedback {
  requireNoAssessment(studentId);
  const student = getStudent(studentId);
  if (typeof body.questionId !== 'string' || typeof body.answer !== 'string' || body.answer.length > 2000) throw new ApiError('请提供题目与有效答案');
  if (body.phase && body.phase !== 'practice') throw new ApiError('测评答案必须通过整卷提交');
  const version = Number(body.version);
  const question = getQuestion(body.questionId, version);
  if (!question || question.grade !== student.grade || question.phase !== 'practice' || !canAccessQuestion(studentId, question.id)) throw new ApiError('练习题不存在', 404);
  const latest = getQuestion(question.id)!;
  if (version !== latest.version) throw new ApiError('题目已被老师修订，请刷新后重新作答。', 409);
  const attempt: Attempt = { id: randomUUID(), studentId, questionId: question.id, version, answer: body.answer.trim(), correct: gradeAnswer(question, body.answer), assisted: body.assisted === true, phase: 'practice', createdAt: new Date().toISOString(), sample: false };
  const db = getDb(); db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT INTO attempts(id,student_id,question_id,version,answer,correct,assisted,phase,created_at,sample,provisional) VALUES(?,?,?,?,?,?,?,?,?,0,?)').run(attempt.id, studentId, question.id, version, attempt.answer, Number(attempt.correct), Number(attempt.assisted), 'practice', attempt.createdAt, Number(!question.approved));
    adjustReview(studentId, question, attempt); db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return { attempt, correct: attempt.correct, answer: question.answer, explanation: question.explanation, steps: question.steps, provisional: !question.approved };
}

export function mistakes(studentId: string, teacherView = false) {
  if (!teacherView) requireNoAssessment(studentId);
  // Backfill older completed exams without adding any new graded attempts.
  for (const attempt of rowsFor(studentId).filter(row => row.phase !== 'practice' && row.assessment_id)) {
    const question = getQuestion(attempt.question_id);
    if (question?.approved && !gradeAnswer(question, attempt.answer) && !getDb().prepare('SELECT question_id FROM review_sources WHERE attempt_id=?').get(attempt.id)) {
      const copy = ensureAssessmentReview(attempt, question);
      rebuildReview(copy.id);
    }
  }
  const rows = getDb().prepare('SELECT * FROM reviews WHERE student_id=? ORDER BY resolved,due_at').all(studentId) as unknown as ReviewRow[];
  const mistakes = rows.flatMap(row => {
    const question = getQuestion(row.question_id);
    const attempt = getDb().prepare('SELECT * FROM attempts WHERE id=? AND student_id=?').get(row.attempt_id, studentId) as unknown as AttemptRow | undefined;
    if (!question?.approved || !attempt || gradeAnswer(question, attempt.answer)) return [];
    const source = getDb().prepare('SELECT * FROM review_sources WHERE question_id=?').get(question.id) as unknown as ReviewSourceRow | undefined;
    return [{ question: publicQuestion(question), attempt: asAttempt(attempt), answer: question.answer, explanation: question.explanation, steps: question.steps, dueAt: row.due_at, corrected: Boolean(row.corrected_at), correctedAt: row.corrected_at, resolved: Boolean(row.resolved), stage: row.stage, reviewDay: [1, 3, 7][Math.min(row.stage, 2)], intervalDays: [1, 3, 7][Math.min(row.stage, 2)], sourceAssessment: source ? { id: source.assessment_id, questionId: source.source_question_id, version: source.source_version, phase: getQuestion(source.source_question_id, source.source_version)?.phase } : null }];
  });
  return { mistakes, dueCount: mistakes.filter(item => !item.resolved && item.dueAt <= new Date().toISOString()).length };
}

export function startAssessment(studentId: string, phase: unknown) {
  if (phase !== 'pre' && phase !== 'post' && phase !== 'delayed') throw new ApiError('测评类型无效');
  const student = getStudent(studentId);
  const active = activeAssessment(studentId);
  if (active) { if (active.phase === phase) return active; throw new ApiError('请先完成或退出当前测评', 409); }
  const history = assessmentHistory(studentId);
  if (history.some(item => item.phase === phase)) throw new ApiError('本轮该测评已完成，避免重复试题影响测评结果。', 409);
  if (phase === 'post' && !history.some(item => item.phase === 'pre')) throw new ApiError('请先完成前测', 409);
  if (phase === 'delayed' && !history.some(item => item.phase === 'post')) throw new ApiError('请先完成后测', 409);
  const pool = allQuestions().filter(q => q.grade === student.grade && q.phase === phase && q.approved);
  if (!pool.length) throw new ApiError('该年级暂未配置此测评', 404);
  const id = randomUUID();
  getDb().prepare('INSERT INTO assessments(id,student_id,phase,questions,created_at) VALUES(?,?,?,?,?)').run(id, studentId, phase, JSON.stringify(pool.map(q => ({ id: q.id, version: q.version }))), new Date().toISOString());
  return activeAssessment(studentId)!;
}

export function submitAssessment(studentId: string, id: string, answers: unknown) {
  const row = getDb().prepare('SELECT * FROM assessments WHERE id=? AND student_id=?').get(id, studentId) as unknown as AssessmentRow | undefined;
  if (!row || row.cancelled) throw new ApiError('测评不存在', 404);
  if (row.completed_at) throw new ApiError('该测评已提交', 409);
  if (!Array.isArray(answers)) throw new ApiError('请提交答案列表');
  const refs = JSON.parse(row.questions) as { id: string; version: number }[];
  const answerMap = new Map<string, string>();
  for (const item of answers) {
    if (!item || typeof item.questionId !== 'string' || typeof item.answer !== 'string' || item.answer.length > 2000 || !refs.some(ref => ref.id === item.questionId) || answerMap.has(item.questionId)) throw new ApiError('答案列表与本次试卷不符');
    answerMap.set(item.questionId, item.answer.trim());
  }
  if (answerMap.size !== refs.length) throw new ApiError('请完成全部题目后提交');
  const timestamp = new Date().toISOString();
  const results = refs.map(ref => {
    const question = getQuestion(ref.id, ref.version)!; const answer = answerMap.get(ref.id)!;
    return { questionId: question.id, question: publicQuestion(question), version: question.version, submittedAnswer: answer, correct: gradeAnswer(question, answer), answer: question.answer, explanation: question.explanation, steps: question.steps };
  });
  const result = { id, phase: row.phase, score: results.filter(r => r.correct).length, total: results.length, results, completedAt: timestamp };
  const db = getDb(); db.exec('BEGIN IMMEDIATE');
  try {
    for (const item of results) {
      const attemptId = randomUUID();
      db.prepare('INSERT INTO attempts(id,student_id,question_id,version,answer,correct,assisted,phase,created_at,sample,assessment_id) VALUES(?,?,?,?,?,?,0,?,?,0,?)').run(attemptId, studentId, item.questionId, item.version, item.submittedAnswer, Number(item.correct), row.phase, timestamp, id);
      const effective = getQuestion(item.questionId)!;
      if (effective.approved && !gradeAnswer(effective, item.submittedAnswer)) {
        const attempt = db.prepare('SELECT * FROM attempts WHERE id=?').get(attemptId) as unknown as AttemptRow;
        const copy = ensureAssessmentReview(attempt, effective);
        adjustReview(studentId, copy, { ...asAttempt(attempt), questionId: copy.id, phase: 'practice', correct: false });
      }
    }
    db.prepare('UPDATE assessments SET completed_at=?,result=? WHERE id=? AND completed_at IS NULL').run(timestamp, JSON.stringify(result), id);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return result;
}
export function cancelAssessment(studentId: string, id: string) {
  const result = getDb().prepare('UPDATE assessments SET cancelled=1 WHERE id=? AND student_id=? AND completed_at IS NULL AND cancelled=0').run(id, studentId);
  if (!result.changes) throw new ApiError('未找到进行中的测评', 404);
  return { cancelled: true };
}
export function assessmentHistory(studentId: string) {
  const rows = getDb().prepare('SELECT * FROM assessments WHERE student_id=? AND completed_at IS NOT NULL AND cancelled=0 ORDER BY completed_at').all(studentId) as unknown as AssessmentRow[];
  return rows.map(row => {
    const stored = JSON.parse(row.result!);
    const attempts = getDb().prepare('SELECT * FROM attempts WHERE assessment_id=? AND student_id=?').all(row.id, studentId) as unknown as AttemptRow[];
    const score = attempts.filter(a => { const q = getQuestion(a.question_id); return q?.approved && gradeAnswer(q, a.answer); }).length;
    return { id: row.id, phase: row.phase, score, rawScore: stored.score, total: stored.total as number, accuracy: stored.total ? Math.round(score / stored.total * 100) : 0, completedAt: row.completed_at, createdAt: row.created_at };
  });
}

export function dashboard(studentId: string) {
  const student = getStudent(studentId);
  const attempts = officialRows(studentId).map(row => asAttempt(row));
  const answered = attempts.length, correct = attempts.filter(a => a.correct).length;
  const activeDays = new Set(attempts.map(a => a.createdAt.slice(0, 10)));
  let streak = 0; const cursor = new Date();
  if (!activeDays.has(cursor.toISOString().slice(0, 10))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (activeDays.has(cursor.toISOString().slice(0, 10))) { streak++; cursor.setUTCDate(cursor.getUTCDate() - 1); }
  const independent = independentFirstAttempts(attempts);
  const stats = { answered, correct, accuracy: answered ? Math.round(correct / answered * 100) : 0, streak, minutes: Math.round(answered * 1.5), minutesEstimated: true, sampleCount: attempts.filter(a => a.sample).length, realCount: attempts.filter(a => !a.sample).length, provisionalCount: rowsFor(studentId).filter(r => !getQuestion(r.question_id)?.approved).length, independentCount: independent.length, independentCorrect: independent.filter(a => a.correct).length, independentAccuracy: independent.length ? Math.round(independent.filter(a => a.correct).length / independent.length * 100) : 0, assistedCount: attempts.filter(a => a.assisted).length };
  const skillStats = skills.filter(skill => skill.grade === student.grade).map(skill => {
    const matching = attempts.filter(a => getQuestion(a.questionId)?.skillId === skill.id);
    const right = matching.filter(a => a.correct).length;
    const first = independent.filter(a => getQuestion(a.questionId)?.skillId === skill.id);
    const independentCorrect = first.filter(a => a.correct).length;
    return { id: skill.id, name: skill.name, total: matching.length, correct: right, accuracy: matching.length ? Math.round(right / matching.length * 100) : 0, sampleCount: matching.filter(a => a.sample).length, independentCount: first.length, independentCorrect, independentAccuracy: first.length ? Math.round(independentCorrect / first.length * 100) : 0 };
  });
  const weekly = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.now() - (6 - index) * 86400000); const day = date.toISOString().slice(0, 10);
    const items = attempts.filter(a => a.createdAt.startsWith(day));
    return { label: `${date.getMonth() + 1}/${date.getDate()}`, date: day, count: items.length, correct: items.filter(a => a.correct).length, sampleCount: items.filter(a => a.sample).length };
  });
  const dueRows = getDb().prepare('SELECT * FROM reviews WHERE student_id=? AND resolved=0 AND due_at<=?').all(studentId, new Date().toISOString()) as unknown as ReviewRow[];
  const dueReviews = dueRows.filter(r => { const q = getQuestion(r.question_id); const a = getDb().prepare('SELECT answer FROM attempts WHERE id=?').get(r.attempt_id); return q?.approved && a && !gradeAnswer(q, String(a.answer)); }).length;
  const recent = attempts.slice(-8).reverse().map(a => ({ ...a, question: publicQuestion(getQuestion(a.questionId)!), skillName: skills.find(s => s.id === getQuestion(a.questionId)?.skillId)?.name || '' }));
  const history = assessmentHistory(studentId);
  const pre = history.find(a => a.phase === 'pre'), post = history.find(a => a.phase === 'post'), delayed = history.find(a => a.phase === 'delayed');
  return { stats, skills: skillStats, recent, dueReviews, weekly, assessment: { pre: pre || null, post: post || null, delayed: delayed || null, improvement: pre && post ? post.accuracy - pre.accuracy : null, retention: post && delayed ? delayed.accuracy - post.accuracy : null, active: activeAssessment(studentId)?.phase || null } };
}

export function submitStoryQuiz(studentId: string, body: Record<string, unknown>) {
  requireNoAssessment(studentId);
  const story = stories.find(item => item.id === body.storyId && item.grade === getStudent(studentId).grade);
  if (!story || !Array.isArray(body.answers) || body.answers.length !== story.questions.length || body.answers.some(answer => typeof answer !== 'string' || !answer.trim() || answer.length > 2000)) throw new ApiError('请完成绘本阅读练习');
  const answers = body.answers as string[];
  const results = story.questions.map((question, index) => ({ correct: normalizeAnswer(question.answer) === normalizeAnswer(answers[index]), answer: question.answer, submittedAnswer: answers[index], text: question.text }));
  const id = randomUUID(); const score = results.filter(item => item.correct).length;
  getDb().prepare('INSERT INTO reading_attempts(id,student_id,story_id,answers,result,score,total,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id, studentId, story.id, JSON.stringify(answers), JSON.stringify(results), score, results.length, new Date().toISOString());
  return { id, attemptId: id, score, total: results.length, results, practiceOnly: true };
}
export function readingSummary(studentId: string) {
  const rows = getDb().prepare('SELECT * FROM reading_attempts WHERE student_id=? ORDER BY created_at DESC,rowid DESC').all(studentId);
  const correct = rows.reduce((sum, row) => sum + Number(row.score), 0);
  const total = rows.reduce((sum, row) => sum + Number(row.total), 0);
  return { attempts: rows.length, correct, total, accuracy: total ? Math.round(correct / total * 100) : 0, practiceOnly: true, history: rows.slice(0, 30).map(row => ({ id: String(row.id), storyId: String(row.story_id), title: stories.find(story => story.id === row.story_id)?.title || '阅读练习', score: Number(row.score), total: Number(row.total), answers: JSON.parse(String(row.answers)) as string[], results: JSON.parse(String(row.result)), createdAt: String(row.created_at) })) };
}

export function report(studentId: string, teacherView = false) {
  const view = dashboard(studentId);
  const weak = [...view.skills].filter(s => s.independentCount > 0).sort((a, b) => a.independentAccuracy - b.independentAccuracy).slice(0, 3);
  return { student: getStudent(studentId), summary: view.stats, skills: view.skills, assessments: assessmentHistory(studentId), recommendations: weak.map(skill => `${skill.name}：先独立完成 3 道新题，订正后第 1 / 3 / 7 天复习。独立首答正确率 ${skill.independentAccuracy}%（${skill.independentCount} 题，不含示例与提示后作答）。`), mistakes: mistakes(studentId, teacherView).mistakes, assessment: view.assessment, reading: readingSummary(studentId), generatedAt: new Date().toISOString() };
}
export function teacherDashboard() {
  return { students: students.map(student => ({ ...student, ...dashboard(student.id).stats, dueReviews: dashboard(student.id).dueReviews, assessment: dashboard(student.id).assessment, reading: readingSummary(student.id) })), reviewQuestions: allQuestions().filter(q => !q.approved), budget: budget.summary() };
}

function ensureAssessmentReview(attempt: AttemptRow, effective: Question): Question {
  const original = getQuestion(attempt.question_id, attempt.version)!;
  const id = `review-${attempt.assessment_id}-${attempt.question_id}`;
  const existing = getQuestion(id);
  const copy = { ...original, id, phase: 'practice' as const, unit: `${original.unit} · 测后订正`, answer: effective.answer, alternatives: effective.alternatives, approved: effective.approved, explanation: effective.explanation, steps: effective.steps };
  const changed = !existing || existing.answer !== copy.answer || existing.approved !== copy.approved || existing.explanation !== copy.explanation || JSON.stringify(existing.alternatives) !== JSON.stringify(copy.alternatives) || JSON.stringify(existing.steps) !== JSON.stringify(copy.steps);
  const saved = changed ? saveQuestionVersion(copy) : existing!;
  assignQuestionOwner(id, attempt.student_id);
  getDb().prepare('INSERT OR IGNORE INTO review_sources(question_id,source_question_id,source_version,assessment_id,student_id,attempt_id) VALUES(?,?,?,?,?,?)').run(id, original.id, original.version, attempt.assessment_id!, attempt.student_id, attempt.id);
  return saved;
}

function rebuildReview(questionId: string) {
  const question = getQuestion(questionId)!;
  for (const student of students) {
    const rows = rowsFor(student.id).filter(row => row.question_id === questionId && row.phase === 'practice');
    const source = getDb().prepare('SELECT * FROM review_sources WHERE question_id=? AND student_id=?').get(questionId, student.id) as unknown as ReviewSourceRow | undefined;
    if (source) {
      const originalAttempt = getDb().prepare('SELECT * FROM attempts WHERE id=? AND student_id=?').get(source.attempt_id, student.id) as unknown as AttemptRow | undefined;
      if (originalAttempt) rows.unshift(originalAttempt);
    }
    getDb().prepare('DELETE FROM reviews WHERE student_id=? AND question_id=?').run(student.id, questionId);
    if (question.approved) for (const row of rows) adjustReview(student.id, question, { ...asAttempt(row), questionId, phase: 'practice', correct: gradeAnswer(question, row.answer) });
  }
}
export function teacherReview(body: Record<string, unknown>) {
  if (typeof body.questionId !== 'string' || typeof body.approved !== 'boolean') throw new ApiError('请提供题目与审核结果');
  const question = getQuestion(body.questionId);
  if (!question) throw new ApiError('题目不存在', 404);
  if (body.answer !== undefined && (typeof body.answer !== 'string' || !body.answer.trim() || body.answer.length > 2000)) throw new ApiError('标准答案无效');
  const answer = typeof body.answer === 'string' ? body.answer.trim() : question.answer;
  const changed = normalizeAnswer(answer, question.caseSensitive) !== normalizeAnswer(question.answer, question.caseSensitive);
  const next = saveQuestionVersion({ ...question, approved: body.approved, answer,
    alternatives: changed ? [] : question.alternatives,
    explanation: typeof body.explanation === 'string' ? body.explanation : changed ? `老师已将本题标准答案修订为「${answer}」。详细解析待老师补充。` : question.explanation,
    steps: Array.isArray(body.steps) ? body.steps.filter((item): item is string => typeof item === 'string').slice(0, 8) : changed ? ['核对题干与选项。', `按老师审核后的标准答案「${answer}」订正。`] : question.steps,
  });
  rebuildReview(next.id);
  // A corrected assessment key also updates its learner-owned review copies.
  const assessmentAttempts = getDb().prepare("SELECT * FROM attempts WHERE question_id=? AND phase!='practice' AND assessment_id IS NOT NULL").all(next.id) as unknown as AttemptRow[];
  for (const attempt of assessmentAttempts) {
    const existing = getDb().prepare('SELECT question_id FROM review_sources WHERE attempt_id=?').get(attempt.id);
    if (existing || (next.approved && !gradeAnswer(next, attempt.answer))) {
      const copy = ensureAssessmentReview(attempt, next);
      rebuildReview(copy.id);
    }
  }
  return { question: next, recomputed: true, message: '已保存新版本；原始作答保留，派生统计按审核后的答案重算。' };
}

export function confirmQuestion(studentId: string, body: Record<string, unknown>) {
  requireNoAssessment(studentId);
  const student = getStudent(studentId);
  const draft = body.draft && typeof body.draft === 'object' ? body.draft as Record<string, unknown> : body;
  if (typeof body.questionId === 'string' && !canAccessQuestion(studentId, body.questionId)) throw new ApiError('无法修改其他学生的导入题目', 403);
  if (typeof draft.text !== 'string' || !draft.text.trim() || draft.text.length > 8000 || typeof draft.answer !== 'string' || !draft.answer.trim()) throw new ApiError('请确认题干与拟定答案');
  const grade = Number(draft.grade) === 5 ? 5 : 4;
  if (grade !== student.grade) throw new ApiError('题目年级与当前学生不一致');
  const skillId = typeof draft.skillId === 'string' && skills.some(s => s.id === draft.skillId && s.grade === grade) ? draft.skillId : null;
  if (!skillId) throw new Error('请选择经核对且属于当前年级的知识点，不能自动归类。');
  const question: Question = { id: typeof body.questionId === 'string' && body.questionId.startsWith('photo-') ? body.questionId : `photo-${randomUUID()}`, version: 1, grade, unit: typeof draft.unit === 'string' ? draft.unit : '拍题导入', text: draft.text.trim(), type: draft.type === 'fill' ? 'fill' : 'choice', options: Array.isArray(draft.options) ? draft.options.filter((o): o is string => typeof o === 'string').slice(0, 6) : [], answer: draft.answer.trim(), alternatives: Array.isArray(draft.alternatives) ? draft.alternatives.filter((o): o is string => typeof o === 'string').slice(0, 10) : [], explanation: typeof draft.explanation === 'string' ? draft.explanation : '待老师确认解析', steps: Array.isArray(draft.steps) ? draft.steps.filter((s): s is string => typeof s === 'string').slice(0, 8) : [], skillId, phase: 'practice', approved: false, source: 'photo', ...(typeof draft.passage === 'string' ? { passage: draft.passage } : {}) };
  if (question.type === 'choice' && question.options.length < 2) throw new ApiError('选择题至少需要两个选项');
  const saved = saveQuestionVersion(question);
  getDb().prepare('INSERT OR IGNORE INTO question_owners(question_id,student_id) VALUES(?,?)').run(saved.id, studentId);
  return { question: publicQuestion(saved), provisional: true, message: '已保存，等待老师审核；练习结果暂不计入正式统计。' };
}
