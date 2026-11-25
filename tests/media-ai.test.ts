import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import path from 'node:path';
import { budget, createJob, updateJob } from '../lib/db';
import { chatWithTutor, recognizeImage, generateQwenImage } from '../lib/ai';
import { getMediaResponse, processMediaJob, normalizeRecording, speechSegments, missingSpeechWords } from '../lib/media';

process.env.DEMO_DB_PATH=path.resolve('data/tests',`media-${randomUUID()}.db`);
const realFetch=globalThis.fetch;
const initialKey=process.env.DEEPSEEK_API_KEY;

test('Unrecognized English words are caught before native synthesis; curly quotes preserve complete sentences',()=>{
  const lexicon=new Set(['mei','puts','away','toys',"can't"]);
  assert.deepEqual(missingSpeechWords('Mei puts away toys. 她说：“Mei can’t.”',lexicon),[]);
  assert.deepEqual(missingSpeechWords('Unknownname puts away toys. Unknownname.',lexicon),['unknownname']);
  assert.ok(speechSegments('Mei says “We can help.”').filter(piece=>piece.language==='en').length===1);
});
test.after(()=>{globalThis.fetch=realFetch;if(initialKey)process.env.DEEPSEEK_API_KEY=initialKey;else delete process.env.DEEPSEEK_API_KEY;});

test('No credentials: explicit sample chat, photo import cannot pretend success',async()=>{
  delete process.env.DEEPSEEK_API_KEY;const before=budget.summary();const reply=await chatWithTutor('s1','hello');assert.equal(reply.source,'sample');
  await assert.rejects(()=>recognizeImage('s1',new File(['fake'],'photo.png',{type:'image/png'})),/配置 DEEPSEEK_API_KEY/);
  assert.equal(budget.summary().spent,before.spent);assert.equal(budget.summary().reserved,before.reserved);
});
test('Successful live chat reserves before request, then settles provider token usage',async()=>{
  process.env.DEEPSEEK_API_KEY='test-only-key';const before=budget.summary();let called=false;
  globalThis.fetch=async(_url,options)=>{called=true;assert.ok(budget.summary().reserved>before.reserved);const body=JSON.parse(String(options?.body));assert.equal(body.model,'deepseek-flash');assert.equal(body.thinking.type,'disabled');return Response.json({choices:[{message:{content:'Look for the subject.'}}],usage:{prompt_tokens:100,completion_tokens:20}});};
  const reply=await chatWithTutor('s1','Help with is and has');assert.ok(called);assert.equal(reply.source,'deepseek');assert.ok(Math.abs(budget.summary().spent-before.spent-0.00036)<1e-8);assert.equal(budget.summary().reserved,before.reserved);
});
test('Uncertain network failure preserves reservation; explicit rejected request releases it',async()=>{
  process.env.DEEPSEEK_API_KEY='test-only-key';const before=budget.summary();globalThis.fetch=async()=>{throw new Error('network uncertain');};
  await assert.rejects(()=>chatWithTutor('s1','hello'),/uncertain/);assert.ok(budget.summary().reserved>before.reserved);
  const reserved=budget.summary().reserved;globalThis.fetch=async()=>new Response(null,{status:401});await assert.rejects(()=>chatWithTutor('s1','hello'),/401/);assert.equal(budget.summary().reserved,reserved);
});
test('Photo recognition sends every attachment together and preserves the reading passage',async()=>{
  process.env.DEEPSEEK_API_KEY='test-only-key';let imageCount=0;
  globalThis.fetch=async(_url,options)=>{const body=JSON.parse(String(options?.body));imageCount=body.messages[0].content.filter((part:{type:string})=>part.type==='image_url').length;return Response.json({choices:[{message:{content:JSON.stringify({questions:[{text:'Where is the book?',grade:4,type:'choice',options:['On the desk.','Under the chair.'],answer:'On the desk.',explanation:'原文说明位置。',skillId:'g4-location',passage:'The book is on the desk.'}]})}}],usage:{prompt_tokens:200,completion_tokens:100}});};
  const bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.from(randomUUID())]);
  const files=[new File([bytes],'question.png',{type:'image/png'}),new File([bytes],'passage.png',{type:'image/png'})];
  const reply=await recognizeImage('s1',files);assert.equal(imageCount,2);assert.equal(reply.draft.passage,'The book is on the desk.');assert.equal(reply.draft.approved,false);
  await assert.rejects(()=>recognizeImage('s1',[...files,...files]),/1–3/);
});
test('Qwen retry polls its persisted task ID, without a second paid generation',async()=>{
  process.env.DASHSCOPE_API_KEY='test-only-key';const asset=randomUUID();let submissions=0,queries=0,failQuery=true;
  globalThis.fetch=async(url,options)=>{
    if(String(url).endsWith('/generation')){submissions++;const body=JSON.parse(String(options?.body));assert.equal(body.model,'qwen-image-2.1-turbo');assert.equal((options?.headers as Record<string,string>)['X-DashScope-Async'],'enable');return Response.json({output:{task_id:'mock-task'}});}
    if(String(url).includes('/tasks/')){queries++;if(failQuery)return new Response(null,{status:503});return Response.json({output:{task_status:'SUCCEEDED',choices:[{message:{content:[{image:'https://example.test/image.png'}]}}]},usage:{image_count:1}});}
    return new Response(new Uint8Array([137,80,78,71,13,10,26,10,1,2,3,4]));
  };
  await assert.rejects(()=>generateQwenImage('s1','A tree',asset),/查询失败/);failQuery=false;
  const image=await generateQwenImage('s1','A tree',asset);assert.equal(image.source,'qwen');assert.equal(submissions,1);assert.equal(queries,2);for(const file of [image.path,image.path.replace(/\.png$/,'.json')])if(existsSync(file))unlinkSync(file);delete process.env.DASHSCOPE_API_KEY;
});
test('Private media validates owner, ranges and traversal',async()=>{
  const id=`test-${randomUUID()}`;mkdirSync('data/media',{recursive:true});const file=path.resolve('data/media',id+'.wav'),meta=path.resolve('data/media',id+'.json');writeFileSync(file,Buffer.from('0123456789'));writeFileSync(meta,JSON.stringify({studentId:'s1'}));
  try{
    assert.equal((await getMediaResponse(id+'.wav',new Request('http://localhost'),'s2')).status,403);
    const response=await getMediaResponse(id+'.wav',new Request('http://localhost',{headers:{range:'bytes=2-5'}}),'s1');assert.equal(response.status,206);assert.equal(response.headers.get('Content-Range'),'bytes 2-5/10');assert.equal(await response.text(),'2345');
    assert.equal((await getMediaResponse(id+'.wav',new Request('http://localhost',{headers:{range:'bytes=99-100'}}),'s1')).status,416);
    assert.equal((await getMediaResponse('../local.db',new Request('http://localhost'),'s1')).status,404);
  }finally{for(const f of [file,meta])if(existsSync(f))unlinkSync(f);}
});
test('A student cannot render another student’s generated illustrations',async()=>{
  const illustrations=createJob('s2','illustrations',{storyId:'story4'});updateJob(illustrations.id,{status:'completed',result:{images:Array(6).fill('/api/media/image-1234.png')}});
  const story=createJob('s1','story',{storyId:'story4',illustrationJobId:illustrations.id});
  await assert.rejects(()=>processMediaJob(story),/不属于当前学生/);
});
test('ASR rejects disguised non-audio content before invoking a decoder or cloud API',async()=>{
  await assert.rejects(()=>normalizeRecording(Buffer.from('#EXTM3U\nhttps://example.test/private.wav')),/真实的 WebM/);
});
test('Bilingual narration switches English and Chinese speaker IDs in reading order',()=>{
  const segments=speechSegments('The book is on the desk. 书在桌上。 Now you try.');
  assert.deepEqual(segments.map(s=>s.language),['en','zh','en']);assert.deepEqual(segments.map(s=>s.sid),[0,3,0]);assert.equal(segments[1].text,'书在桌上。');
});
