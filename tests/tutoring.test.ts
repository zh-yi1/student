import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDb, getDb } from '../lib/db';
import { cancelAssessment, confirmQuestion, dashboard, startAssessment } from '../lib/learning';
import { chatWithTutor } from '../lib/ai';
import { completeCoaching, getCoaching, listCoaching, sendCoaching, startCoaching, validateDraftSkill } from '../lib/tutoring';
import { getTextbookUnit } from '../lib/textbooks';

const directory=mkdtempSync(join(tmpdir(),'sprout-coaching-test-'));
process.env.DEMO_DB_PATH=join(directory,'coaching.db');
const originalKey=process.env.DEEPSEEK_API_KEY;
const originalFetch=globalThis.fetch;
delete process.env.DEEPSEEK_API_KEY;
after(()=>{globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=originalKey;closeDb();rmSync(directory,{recursive:true,force:true});});
const selection={bookId:'pep-4-upper-revised',unitId:'pep-4-upper-revised-u1',intent:'vocabulary',message:'我不明白 set the table，为什么不是设置桌子？'};

test('offline coaching persists concern and a source-limited diagnostic conversation',async()=>{
  const session=await startCoaching('s1',selection);
  assert.equal(session.stage,'diagnose');assert.equal(session.status,'active');
  assert.equal(session.grounding.scope,'catalog_original_lesson');assert.match(session.grounding.note,/原创/);assert.match(session.grounding.note,/未读取/);
  assert.equal(session.messages[0].text,selection.message);assert.equal(session.messages[0].role,'user');assert.equal(session.messages[1].source,'offline');
  assert.equal(session.transferResult,null);assert.equal('context' in session,false);
  assert.deepEqual(getCoaching('s1',session.id).messages,session.messages);
  assert.ok(listCoaching('s1').some(item=>item.id===session.id));
});

test('stepwise tutoring records expression and one transfer check without changing official metrics',async()=>{
  const before=dashboard('s1').stats;const countBefore=getDb().prepare('SELECT COUNT(*) AS count FROM attempts').get()!.count;
  let session=await startCoaching('s1',selection);
  const say=async(message:string)=>{session=await sendCoaching('s1',{sessionId:session.id,message});};
  await say('我会把碗放好');assert.equal(session.stage,'explain');assert.equal(session.stepIndex,0);
  await say('还是不明白，为什么？');assert.equal(session.stage,'explain');assert.equal(session.stepIndex,0,'a request for clarification must not rush the learner ahead');
  await say('摆好了就可以吃饭');assert.equal(session.stepIndex,1);
  await say('water the plants');assert.equal(session.stepIndex,2);
  await say('I can put away the toys.');assert.equal(session.stage,'express');
  await say('我不会说，能给提示吗');assert.equal(session.stage,'express');assert.equal(session.transferResult,null);
  await say('我可以收玩具，帮助家里保持整洁');assert.equal(session.stage,'transfer');assert.equal(session.transferResult,null);
  await say('我不懂这道题，请提示');assert.equal(session.stage,'transfer');assert.equal(session.transferResult,null,'asking for help is not a wrong answer');
  for(const request of ['给我一个提示','给点提示','提示一下']){await say(request);assert.equal(session.stage,'transfer',request);assert.equal(session.transferResult,null,'hint requests must never be graded');}
  const answer=getTextbookUnit(selection.bookId,selection.unitId)!.unit.lesson!.cards.find(card=>card.id==='words')!.transfer.answer;
  await say(answer);assert.equal(session.stage,'reflect');assert.equal(session.transferResult!.correct,true);assert.equal(session.transferResult!.practiceOnly,true);assert.equal(session.transferResult!.assisted,true);
  await say('还不太明白，能再讲一遍吗');assert.equal(session.stage,'reflect');assert.equal(session.transferResult!.correct,true);
  const completed=completeCoaching('s1',{sessionId:session.id,learnerSelfCheck:'understood'});
  assert.equal(completed.status,'completed');assert.equal(completed.learnerSelfCheck,'understood');assert.match(completed.summary!,/不代表已掌握/);
  assert.equal(dashboard('s1').stats.answered,before.answered);assert.equal(dashboard('s1').stats.independentCount,before.independentCount);
  assert.equal(getDb().prepare('SELECT COUNT(*) AS count FROM attempts').get()!.count,countBefore);
});

test('coaching sessions, grades, and unimplemented units are isolated and validated',async()=>{
  const session=await startCoaching('s1',selection);
  assert.throws(()=>getCoaching('s2',session.id),/不存在/);
  await assert.rejects(()=>sendCoaching('s2',{sessionId:session.id,message:'hello'}),/不存在/);
  assert.equal(listCoaching('s2').some(item=>item.id===session.id),false);
  await assert.rejects(()=>startCoaching('s4',selection),/年级不匹配/);
  await assert.rejects(()=>startCoaching('s1',{...selection,bookId:'pep-4-upper-previous'}),/不匹配/);
  await assert.rejects(()=>startCoaching('s1',{...selection,unitId:'pep-4-upper-revised-u2'}),/只有目录/);
});

test('ordinary help and why expressions advance while explicit requests still pause tutoring',async()=>{
  let session=await startCoaching('s1',{...selection,intent:'sentence'});
  const say=async(message:string)=>{session=await sendCoaching('s1',{sessionId:session.id,message});};
  await say('I can help at home.');assert.equal(session.stage,'explain');assert.equal(session.stepIndex,0);
  await say('I understand why we use can.');assert.equal(session.stepIndex,1);
  await say('I can help my family.');assert.equal(session.stepIndex,2);
  await say('I can explain why we use can.');assert.equal(session.stage,'express');
  await say('I need help with this sentence.');assert.equal(session.stage,'express');
  await say('我不懂，可以再讲吗');assert.equal(session.stage,'express');
  await say('Can you set the table? Yes, I can. I can help.');assert.equal(session.stage,'transfer');
});

test('active independent assessments lock starting, reading, sending, and completing coaching',async()=>{
  const session=await startCoaching('s2',selection);const assessment=startAssessment('s2','pre');
  await assert.rejects(()=>startCoaching('s2',selection),/测评进行中/);
  assert.throws(()=>listCoaching('s2'),/测评进行中/);assert.throws(()=>getCoaching('s2',session.id),/测评进行中/);
  await assert.rejects(()=>sendCoaching('s2',{sessionId:session.id,message:'help'}),/测评进行中/);
  assert.throws(()=>completeCoaching('s2',{sessionId:session.id,learnerSelfCheck:'understood'}),/测评进行中/);
  cancelAssessment('s2',assessment.id);
});

test('question context checks ownership, retains pending-review labels, and rejects unknown skill mappings',async()=>{
  const created=confirmQuestion('s1',{draft:{grade:4,type:'choice',text:'They ___ helpful.',options:['is','are'],answer:'are',skillId:'g4-location'}});
  const questionId=created.question.id;
  const session=await startCoaching('s1',{...selection,intent:'exam',questionId});
  assert.equal(session.grounding.questionId,questionId);assert.equal(session.grounding.questionApproved,false);assert.match(session.grounding.note,/尚未审核/);
  await assert.rejects(()=>startCoaching('s2',{...selection,intent:'exam',questionId}),/不可访问/);
  assert.throws(()=>validateDraftSkill('s1',{draft:{skillId:'invented-topic'}}),/不会自动归入/);
  const raw=JSON.parse(String(getDb().prepare('SELECT context FROM coaching_sessions WHERE id=?').get(session.id)!.context));
  const reply=await chatWithTutor('s1','解释一下',raw.question);
  assert.match(reply.text,/尚未由老师确认/);assert.doesNotMatch(reply.text,/教师核对答案/);
});

test('reading coaching includes the original passage instead of pretending to quote a textbook page',async()=>{
  const session=await startCoaching('s1',{...selection,intent:'reading',message:'我想知道怎么找阅读依据'});
  const passage=getTextbookUnit(selection.bookId,selection.unitId)!.unit.lesson!.cards.find(card=>card.id==='reading')!.originalPassage!;
  assert.ok(session.messages.at(-1)!.text.includes(passage));assert.match(session.messages.at(-1)!.text,/原创短文/);
});

test('live coaching sends real multi-turn context and identical client turn retries do not pay twice',async()=>{
  process.env.DEEPSEEK_API_KEY='test-only-key';const bodies:Record<string,unknown>[]=[];
  globalThis.fetch=async(_url,options)=>{bodies.push(JSON.parse(String(options?.body)));return Response.json({choices:[{message:{content:'你刚才提到摆餐具。我们把动作和词组连起来：set the table。你能说说它帮助了谁吗？'}}],usage:{prompt_tokens:100,completion_tokens:40}});};
  try{
    let session=await startCoaching('s1',selection);assert.equal(session.messages.at(-1)!.source,'deepseek');
    session=await sendCoaching('s1',{sessionId:session.id,message:'我以为 set 是设置',clientTurnId:'context-turn-001'});
    const last=bodies.at(-1)!;const messages=last.messages as {role:string;content:string}[];
    assert.ok(messages.some(message=>message.role==='user'&&message.content===selection.message));
    assert.ok(messages.some(message=>message.role==='assistant'&&message.content.includes('你刚才提到摆餐具')));
    assert.ok(messages.some(message=>message.role==='user'&&message.content==='我以为 set 是设置'));
    assert.ok(messages.some(message=>message.role==='system'&&message.content.includes('严禁编造教材原句、页码')));
    assert.equal(last.max_tokens,600);
    const calls=bodies.length,count=session.messages.length;
    const repeated=await sendCoaching('s1',{sessionId:session.id,message:'我以为 set 是设置',clientTurnId:'context-turn-001'});
    assert.equal(bodies.length,calls);assert.equal(repeated.messages.length,count);
    await assert.rejects(()=>sendCoaching('s1',{sessionId:session.id,message:'不同内容',clientTurnId:'context-turn-001'}),/不同内容/);
  }finally{delete process.env.DEEPSEEK_API_KEY;globalThis.fetch=originalFetch;}
});

test('self-assessed understanding can close an unfinished session but creates no mastery evidence',async()=>{
  const before=dashboard('s3').stats;
  const session=await startCoaching('s3',selection);
  const completed=completeCoaching('s3',{sessionId:session.id,learnerSelfCheck:'understood'});
  assert.equal(completed.transferResult,null);assert.match(completed.summary!,/尚未完成迁移核对/);
  assert.equal(dashboard('s3').stats.independentCount,before.independentCount);assert.equal(dashboard('s3').stats.correct,before.correct);
});
