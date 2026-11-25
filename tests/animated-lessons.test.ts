import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { readPreparedLesson, preparedLessonKey } from '../lib/prepared-lessons';
import { originalAnimatedLesson } from '../lib/animated-lessons';
import { narrateAnimatedLesson } from '../lib/ai';
import { claimNextJob, createJob, updateJob } from '../lib/db';

process.env.DEMO_DB_PATH = path.resolve('data/tests', `animated-${randomUUID()}.db`);

test('Prepared lessons require every audio and metadata file and track changes to the original material', () => {
  const directory=path.resolve('data/tests',`prepared-${randomUUID()}`); mkdirSync(path.join(directory,'audio'),{recursive:true});
  const original=originalAnimatedLesson(4,'pep-4-upper-revised','pep-4-upper-revised-u1','words');
  const id='lesson-4-'+'a'.repeat(32);
  const ready={...original,scenes:original.scenes.map(scene=>({...scene,audio:{url:`/api/lesson-audio/${id}.wav`,source:'kokoro',duration:2}}))};
  writeFileSync(path.join(directory,preparedLessonKey(original)+'.json'),JSON.stringify(ready));
  assert.equal(readPreparedLesson(original,directory),undefined);
  writeFileSync(path.join(directory,'audio',id+'.wav'),'test fixture');
  assert.equal(readPreparedLesson(original,directory),undefined);
  writeFileSync(path.join(directory,'audio',id+'.json'),'{}');
  assert.equal(readPreparedLesson(original,directory)?.scenes.length,3);
  assert.equal(readPreparedLesson({...original,title:'Changed material'},directory),undefined);
  unlinkSync(path.join(directory,'audio',id+'.wav'));
  assert.equal(readPreparedLesson(original,directory),undefined);
});

test('Only prepared units of the selected grade can supply an animation lesson', () => {
  for (const grade of [4, 5] as const) for (const mode of ['words','sentences','reading']) {
    const plan = originalAnimatedLesson(grade, `pep-${grade}-upper-revised`, `pep-${grade}-upper-revised-u1`, mode);
    assert.ok(plan.scenes.length >= 3);
    assert.ok(plan.scenes.every(scene => scene.text && scene.narration && scene.prompt));
    if (mode === 'reading') assert.equal(plan.scenes[0].title, '先听原创小故事');
  }
  assert.throws(() => originalAnimatedLesson(4, 'pep-5-upper-revised', 'pep-5-upper-revised-u1', 'words'));
  assert.throws(() => originalAnimatedLesson(4, 'pep-4-upper-revised', 'pep-4-upper-revised-u2', 'words'));
  assert.throws(() => originalAnimatedLesson(4, 'pep-4-upper-revised', 'pep-4-upper-revised-u1', 'invalid'));
});

test('Live narration is validated, cached, and preserves the original lesson structure', async () => {
  const originalFetch = globalThis.fetch, originalKey = process.env.DEEPSEEK_API_KEY;
  const lesson = originalAnimatedLesson(4, 'pep-4-upper-revised', 'pep-4-upper-revised-u1', 'sentences');
  try {
    delete process.env.DEEPSEEK_API_KEY;
    assert.equal((await narrateAnimatedLesson('s1', lesson)).source, 'offline');
    process.env.DEEPSEEK_API_KEY = 'test-only-key';
    let calls = 0;
    globalThis.fetch = async () => { calls++; return Response.json({ choices: [{ message: { content: JSON.stringify({ narrations: lesson.scenes.map(scene => scene.narration) }) } }], usage: { prompt_tokens: 100, completion_tokens: 30 } }); };
    const unique = { ...lesson, title: `test-${randomUUID()}` };
    const live = await narrateAnimatedLesson('s1', unique);
    assert.equal(live.source, 'deepseek'); assert.deepEqual(live.scenes, lesson.scenes);
    await narrateAnimatedLesson('s1', unique); assert.equal(calls, 1);
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: '{"narrations":["only one scene"]}' } }], usage: { prompt_tokens: 100, completion_tokens: 10 } });
    await assert.rejects(() => narrateAnimatedLesson('s1', { ...unique, title: randomUUID() }));
  } finally { globalThis.fetch = originalFetch; if (originalKey) process.env.DEEPSEEK_API_KEY = originalKey; else delete process.env.DEEPSEEK_API_KEY; }
});

test('Waiting speech runs before a queued video without interrupting a running task', () => {
  const video = createJob('s1','board',{ questionId: 'test' });
  const voice = createJob('s1','tts',{ text: 'Hello.' });
  assert.equal(claimNextJob()?.id, voice.id);
  updateJob(voice.id, { status: 'completed' });
  assert.equal(claimNextJob()?.id, video.id);
});
