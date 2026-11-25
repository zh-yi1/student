import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, statSync, createReadStream, unlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import path from 'node:path';
import type { Job, Question, Scene } from './types';
import { getQuestion, getJob, stories, updateJob, saveQuestionVersion, assignQuestionOwner } from './db';
import { explanationScenes, generateQwenImage, generateVariants, ProviderError } from './ai';

const require = createRequire(path.join(process.cwd(),'package.json'));
const portable = () => process.env.SPROUT_PORTABLE === '1';
const allowSystemVoice = () => !portable() && process.env.ALLOW_DEMO_SYSTEM_VOICE !== 'false';
const root = () => path.resolve('data/media');
const jobsRoot = () => path.resolve('data/cache/jobs');
export const voiceModelDir = () => path.resolve(process.env.KOKORO_MODEL_DIR || 'data/models/kokoro-multi-lang-v1_1');
const voiceReady = () => ['model.onnx','voices.bin','tokens.txt','lexicon-us-en.txt','lexicon-zh.txt'].every(file=>{const full=path.join(voiceModelDir(),file);return existsSync(full)&&statSync(full).size>0;}) && (Boolean(process.env.KOKORO_MODEL_DIR)||existsSync(path.join(voiceModelDir(),'installation.json')));
const ensure = (dir: string) => { mkdirSync(dir, { recursive: true }); return dir; };
const atomicJson = (file: string, value: unknown) => { const tmp = `${file}.${randomUUID()}.tmp`; writeFileSync(tmp, JSON.stringify(value)); renameSync(tmp, file); };
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32);
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]!));
function binary(which: 'ffmpeg' | 'ffprobe'): string {
  const configured = which === 'ffmpeg' ? process.env.FFMPEG_PATH : process.env.FFPROBE_PATH;
  if (configured && !portable()) return configured;
  return which === 'ffmpeg' ? require('ffmpeg-static') : require('ffprobe-static').path;
}
export function getSystemStatus() {
  let ffmpeg = false; try { ffmpeg = existsSync(binary('ffmpeg')) && existsSync(binary('ffprobe')); } catch { /* setup status */ }
  return { deepseek: Boolean(process.env.DEEPSEEK_API_KEY), qwen: Boolean(process.env.DASHSCOPE_API_KEY), tts: voiceReady(), ffmpeg, ttsMode: voiceReady() ? 'kokoro' : allowSystemVoice() ? 'demo-system-voice' : 'not-configured', models: { text: 'deepseek-flash', image: 'qwen-image-2.1-turbo', speech: 'kokoro-multi-lang-v1_1' } };
}
export async function runProcess(command: string, args: string[], timeout = 300_000, env?: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, shell: false, env: env || process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = ''; const timer = setTimeout(() => { child.kill(); reject(new Error('本地媒体处理超时；已保留中间文件，可以重试。')); }, timeout);
    child.stdout.on('data', data => { stdout = (stdout + data.toString()).slice(-100_000); });
    child.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-10_000); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); if (code === 0) resolve(stdout); else reject(new Error(`${path.basename(command)} 处理失败 (${code}): ${stderr.slice(-1500)}`)); });
  });
}
export async function probe(file: string): Promise<{ duration: number; streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number }> }> {
  const out = JSON.parse(await runProcess(binary('ffprobe'), ['-v','error','-show_entries','format=duration:stream=codec_type,codec_name,width,height','-of','json',file], 30_000));
  return { duration: Number(out.format?.duration || 0), streams: out.streams || [] };
}
export async function normalizeRecording(bytes: Buffer) {
  const supported=bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))||bytes.subarray(0,4).toString()==='OggS'||(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WAVE')||bytes.subarray(4,8).toString()==='ftyp';
  if(!supported)throw new ProviderError('请上传真实的 WebM、Ogg、WAV 或 MP4 录音文件。',400);
  const dir = ensure(path.resolve('data/cache/recordings')); const id = randomUUID(); const source = path.join(dir, id + '.input'); const output = path.join(dir, id + '.wav');
  writeFileSync(source, bytes);
  try {
    const info = await probe(source);
    if (!info.streams.some(s => s.codec_type === 'audio')) throw new ProviderError('上传内容没有音轨。', 400);
    // WebM captured by MediaRecorder may omit duration. Decode at most 31 seconds, then verify PCM length.
    if (info.duration > 30.25) throw new ProviderError('每次录音最多 30 秒。请缩短后重试。', 400);
    await runProcess(binary('ffmpeg'), ['-y','-v','error','-i',source,'-t','31','-vn','-ac','1','-ar','16000','-c:a','pcm_s16le',output], 40_000);
    const checked = await probe(output);
    if (!checked.duration || checked.duration > 30.25) throw new ProviderError('每次录音最多 30 秒。请缩短后重试。', 400);
    return { wav: readFileSync(output), duration: checked.duration };
  } catch(error) { if(error instanceof ProviderError)throw error;throw new ProviderError('录音内容无法解码，请重新录制有效的 WebM、Ogg、WAV 或 MP4 音频。',400); }
  finally { for (const file of [source, output]) if (existsSync(file)) unlinkSync(file); }
}

let tts: { generate: (input: unknown) => { samples: Float32Array; sampleRate: number } } | undefined;
let pronunciationWords: Set<string> | undefined;
export function missingSpeechWords(text: string, lexicon: Set<string>): string[] {
  return [...new Set(speechSegments(text).filter(piece=>piece.language==='en').flatMap(piece=>piece.text.toLowerCase().match(/[a-z]+(?:'[a-z]+)*/g)||[]).filter(word=>!lexicon.has(word)))];
}
function checkPronunciation(text: string) {
  if (!pronunciationWords) {
    const files=[path.join(voiceModelDir(),'lexicon-us-en.txt'),path.resolve('content/voice-lexicon.txt')].filter(file=>existsSync(file));
    pronunciationWords=new Set(files.flatMap(file=>readFileSync(file,'utf8').split(/\r?\n/).map(line=>line.split(' ')[0].toLowerCase())));
  }
  const missing=missingSpeechWords(text,pronunciationWords);
  if(missing.length) throw new ProviderError(`本地音色缺少这些词的发音资料：${missing.slice(0,6).join('、')}。本次没有跳过词语朗读，请由老师补充发音词典后重试。`,400);
}
function loadTts() {
  if (tts) return tts;
  const dir = voiceModelDir();
  for (const file of ['model.onnx','voices.bin','tokens.txt','lexicon-us-en.txt','lexicon-zh.txt']) if (!existsSync(path.join(dir,file))) throw new ProviderError('Kokoro 模型未安装。请运行 npm run setup:voice。', 503);
  const sherpa = require('sherpa-onnx-node');
  const threads=Math.max(1,Math.min(8,Number(process.env.KOKORO_THREADS||4)));
  const supplement = path.resolve('content/voice-lexicon.txt');
  const lexicon = [path.join(dir,'lexicon-us-en.txt'),path.join(dir,'lexicon-zh.txt'),...(existsSync(supplement)?[supplement]:[])].join(',');
  tts = new sherpa.OfflineTts({ model: { kokoro: { model: path.join(dir,'model.onnx'), voices: path.join(dir,'voices.bin'), tokens: path.join(dir,'tokens.txt'), lexicon }, numThreads: threads, provider: 'cpu', debug: false }, maxNumSentences: 1 });
  return tts!;
}
export function warmVoice():number{
  if(!voiceReady()||process.env.KOKORO_PREWARM==='false')return 0;
  const start=Date.now();loadTts().generate({text:'Hello.',sid:Number(process.env.KOKORO_EN_SPEAKER||0),speed:.94});return Date.now()-start;
}
function wavePcm(samples: Float32Array, sampleRate: number): Buffer {
  const bytes = Buffer.alloc(44 + samples.length * 2); bytes.write('RIFF',0); bytes.writeUInt32LE(bytes.length-8,4); bytes.write('WAVEfmt ',8); bytes.writeUInt32LE(16,16); bytes.writeUInt16LE(1,20); bytes.writeUInt16LE(1,22); bytes.writeUInt32LE(sampleRate,24); bytes.writeUInt32LE(sampleRate*2,28); bytes.writeUInt16LE(2,32); bytes.writeUInt16LE(16,34); bytes.write('data',36); bytes.writeUInt32LE(samples.length*2,40);
  samples.forEach((value,i) => bytes.writeInt16LE(Math.round(Math.max(-1,Math.min(1,value))*32767),44+i*2)); return bytes;
}
export function speechSegments(text:string):Array<{text:string;language:'en'|'zh';sid:number}>{
  const normalized = text.replace(/[“”]/g,' ').replace(/[‘’]/g,"'");
  const pieces=normalized.match(/[A-Za-z][A-Za-z0-9\s'.,!?;:()\/-]*|[^A-Za-z]+/g)||[normalized];
  return pieces.filter(piece=>/[A-Za-z\u3400-\u9fff0-9]/.test(piece)).map(piece=>{const language=/[\u3400-\u9fff]/.test(piece)?'zh' as const:'en' as const;return {text:piece.trim(),language,sid:Number(language==='zh'?process.env.KOKORO_ZH_SPEAKER||3:process.env.KOKORO_EN_SPEAKER||0)};});
}
async function systemVoice(text: string, file: string) {
  if (process.platform !== 'win32') throw new ProviderError('请先安装 Kokoro 模型：npm run setup:voice。当前系统没有示例语音引擎。', 503);
  const script = `Add-Type -AssemblyName System.Speech\n$speech = New-Object System.Speech.Synthesis.SpeechSynthesizer\ntry {\n$culture = if ($env:DEMO_VOICE_LANG -eq 'zh') {'zh-CN'} else {'en-US'}\n$voice = $speech.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq $culture } | Select-Object -First 1\nif ($null -eq $voice) { throw ('No installed system voice for ' + $culture) }\n$speech.SelectVoice($voice.VoiceInfo.Name)\n$speech.Rate = -1\n$speech.SetOutputToWaveFile($env:DEMO_VOICE_OUTPUT)\n$speech.Speak($env:DEMO_VOICE_TEXT)\n} finally { $speech.Dispose() }`;
  await runProcess('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],90_000,{...process.env,DEMO_VOICE_TEXT:text,DEMO_VOICE_OUTPUT:file,DEMO_VOICE_LANG:/[\u3400-\u9fff]/.test(text)?'zh':'en'});
}
function speechIdentity(studentId: string, clean: string) {
  const source = voiceReady() ? 'kokoro' : 'demo-system-voice';
  const segments = speechSegments(clean);
  const speed = Math.max(.6,Math.min(1.3,Number(process.env.KOKORO_SPEED||.94)));
  const lexiconVersion = existsSync(path.resolve('content/voice-lexicon.txt')) ? hash(readFileSync(path.resolve('content/voice-lexicon.txt'),'utf8')) : 'none';
  return { source, segments, speed, id: `speech-${hash([studentId,clean,source,segments.map(s=>s.sid),speed,'v4',lexiconVersion])}` };
}
// Read-only fast path: cached audio must not wait behind video rendering or load the model.
export function cachedSpeech(studentId: string, text: string) {
  const { id } = speechIdentity(studentId, text.trim());
  const metadata = path.join(root(), id + '.json');
  if (!existsSync(path.join(root(), id + '.wav')) || !existsSync(metadata)) return undefined;
  try { const saved = JSON.parse(readFileSync(metadata,'utf8')); return saved.studentId === studentId ? saved : undefined; } catch { return undefined; }
}
export async function synthesizeSpeech(studentId: string, text: string): Promise<{url:string;source:string;duration:number;id:string}> {
  const clean = text.trim(); if (!clean || clean.length > 2000) throw new ProviderError('朗读文本长度应在 1–2000 字以内。',400);
  ensure(root()); const hasModel = voiceReady();
  const source = hasModel ? 'kokoro' : 'demo-system-voice';
  if (!hasModel && !allowSystemVoice()) throw new ProviderError(portable()?'便携包缺少完整 Kokoro 模型，请重新解压完整环境包；不会切换到系统语音。':'Kokoro 模型未安装，请运行 npm run setup:voice。',503);
  const {segments,speed,id} = speechIdentity(studentId,clean);
  const output = path.join(root(), id + '.wav'); const metadata = path.join(root(),id+'.json');
  if (existsSync(output) && existsSync(metadata)) return JSON.parse(readFileSync(metadata,'utf8'));
  const temp = path.join(root(),id+'.part.wav');
  if (hasModel) {
    // sherpa 2.x has no automatic pronunciation fallback. Never pass all-OOV
    // English into the native engine: it may drop words or terminate the worker.
    checkPronunciation(clean);
    const clips=segments.map(segment=>loadTts().generate({text:segment.text,sid:segment.sid,speed}));
    if(!clips.length||clips.some(audio=>!audio.samples?.length))throw new ProviderError('本地语音引擎返回空音频。');
    const sampleRate=clips[0].sampleRate;const silence=Math.round(sampleRate*.08);const samples=new Float32Array(clips.reduce((sum,a)=>sum+a.samples.length+silence,0));let offset=0;
    for(const clip of clips){samples.set(clip.samples,offset);offset+=clip.samples.length+silence;}writeFileSync(temp,wavePcm(samples,sampleRate));
  }
  else await systemVoice(clean,temp);
  const info = await probe(temp); if (info.duration <= 0 || !info.streams.some(s=>s.codec_type==='audio')) throw new ProviderError('本地语音音频校验失败。');
  renameSync(temp,output); const result = {id,url:`/api/media/${id}.wav`,source,duration:info.duration,studentId,...(hasModel?{speed,segments:segments.map(s=>({language:s.language,speaker:s.sid}))}:{}),createdAt:new Date().toISOString()}; atomicJson(metadata,result); return result;
}

export async function getMediaResponse(id: string, request: Request, studentId?: string, directory = root()): Promise<Response> {
  if (!/^[a-zA-Z0-9_-]+\.(mp4|wav|png|jpg)$/.test(id)) return new Response('Not found',{status:404});
  const file = path.join(directory,id); const metaFile=path.join(directory,id.replace(/\.[^.]+$/,'.json'));
  if (!existsSync(file) || !existsSync(metaFile)) return new Response('Not found',{status:404});
  const metadata=JSON.parse(readFileSync(metaFile,'utf8'));
  if (studentId && metadata.studentId !== studentId && metadata.studentId !== 'sample') return new Response('Forbidden',{status:403});
  const total=statSync(file).size; const type=id.endsWith('.mp4')?'video/mp4':id.endsWith('.wav')?'audio/wav':id.endsWith('.png')?'image/png':'image/jpeg';
  const headers:Record<string,string>={'Content-Type':type,'Accept-Ranges':'bytes','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'};
  const range=request.headers.get('range'); let start=0,end=total-1,status=200;
  if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${total}`}}); if(!match[1]){start=Math.max(0,total-Number(match[2]));}else{start=Number(match[1]);if(match[2])end=Math.min(total-1,Number(match[2]));}if(start>end||start>=total)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${total}`}});status=206;headers['Content-Range']=`bytes ${start}-${end}/${total}`;}
  headers['Content-Length']=String(end-start+1);
  if(request.method==='HEAD')return new Response(null,{status,headers});
  return new Response(Readable.toWeb(createReadStream(file,{start,end})) as ReadableStream,{status,headers});
}

async function imageData(image?: string): Promise<string> {
  if (!image) return '';
  const file = image.startsWith('/api/media/') ? path.resolve(root(),image.slice('/api/media/'.length)) : image.startsWith('/') && !image.startsWith('//') ? path.resolve('public',image.slice(1)) : path.isAbsolute(image) ? image : path.resolve('public',image);
  const allowed=[path.resolve('public')+path.sep,path.resolve('data/cache/ai')+path.sep,root()+path.sep];
  if(!allowed.some(p=>file.startsWith(p)) || !existsSync(file))return '';
  const ext=path.extname(file).toLowerCase(); const mime=ext==='.svg'?'image/svg+xml':ext==='.jpg'?'image/jpeg':'image/png';
  return `data:${mime};base64,${readFileSync(file).toString('base64')}`;
}
export async function screenshotScene(scene:Scene,index:number,total:number,file:string,story:boolean,source:string) {
  if(existsSync(file))return;
  if(portable())process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('data/browsers');
  else process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve('data/browsers');
  const {chromium}=await import('playwright');
  const bundled=chromium.executablePath();
  const edge=!portable()&&process.platform==='win32'?['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(existsSync):undefined;
  const executablePath=existsSync(bundled)?bundled:edge;
  if(!executablePath)throw new ProviderError('缺少随包 Chromium 浏览器，请重新解压完整环境包或运行 Playwright Chromium 安装命令。',503);
  const fontFile=path.resolve('public/fonts/NotoSansSC.ttf');
  if(portable()&&!existsSync(fontFile))throw new ProviderError('便携包缺少中文字体 public/fonts/NotoSansSC.ttf，请重新解压完整环境包。',503);
  const browser=await chromium.launch({headless:true,executablePath,args:['--disable-gpu']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
    // Templates are fixed and all model text is escaped. No model-supplied HTML, JS or URLs execute.
    const img=await imageData(scene.image);
    const text=esc(scene.text).replace(/\n/g,'<br>');
    await page.setContent(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;width:1280px;height:720px;overflow:hidden;font-family:'Segoe UI','Microsoft YaHei',sans-serif;background:${story?'#f9f3e6':'#123c37'};color:${story?'#183c34':'#f3f5df'}}.frame{position:absolute;inset:30px;border:1px solid ${story?'#d9deca':'#44655d'};border-radius:26px;overflow:hidden}.top{position:absolute;top:28px;left:36px;right:36px;display:flex;justify-content:space-between;font-size:17px;letter-spacing:2px;font-weight:700;color:${story?'#447358':'#9dc4ad'}}.content{position:absolute;left:48px;right:${img?'600px':'48px'};top:110px;bottom:100px;display:flex;flex-direction:column;justify-content:center}h1{font-size:35px;line-height:1.25;margin:0 0 28px;color:${story?'#2b5441':'#d6eca0'}}.text{font-size:${scene.text.length>170?30:scene.text.length>90?36:44}px;line-height:1.6;font-weight:600;word-break:normal;overflow-wrap:anywhere}.highlight{margin-top:28px;display:inline-block;align-self:flex-start;padding:10px 20px;border-radius:10px;background:${story?'#e2edb9':'#d6eca0'};color:#234438;font-size:30px;font-weight:700}.art{position:absolute;right:28px;top:93px;width:530px;height:450px;object-fit:cover;border-radius:24px}.foot{position:absolute;bottom:30px;left:48px;right:48px;display:flex;justify-content:space-between;font-size:17px;color:${story?'#6b7969':'#a6c5b6'}}.dot{display:inline-block;width:12px;height:12px;margin-left:8px;border-radius:50%;background:#8ba987}.active{background:#e8bd61}</style></head><body><div class="frame"><div class="top"><span>SPROUT · ${story?'STORY TIME':'ENGLISH LAB'}</span><span>${String(index+1).padStart(2,'0')} / ${String(total).padStart(2,'0')}</span></div><div class="content"><h1>${esc(scene.title)}</h1><div class="text">${text}</div>${scene.highlight?`<div class="highlight">${esc(scene.highlight)}</div>`:''}</div>${img?`<img class="art" src="${img}">`:''}<div class="foot"><span>${source==='demo-system-voice'?'本地示例语音 · System voice':'本地 Kokoro 语音'} · 跟着声音，一起读</span><span>${Array.from({length:total},(_,i)=>`<i class="dot ${index===i?'active':''}"></i>`).join('')}</span></div></div></body></html>`);
    if(existsSync(fontFile)){
      const embedded=readFileSync(fontFile).toString('base64');
      await page.addStyleTag({content:`@font-face{font-family:'Sprout Noto';font-style:normal;font-weight:100 900;src:url(data:font/ttf;base64,${embedded}) format('truetype')}body{font-family:'Sprout Noto',sans-serif}`});
      await page.evaluate(async()=>{await document.fonts.load('600 36px "Sprout Noto"','英语学习');await document.fonts.ready;});
    }
    await page.screenshot({path:file});
  }finally{await browser.close();}
}

export async function processMediaJob(job:Job):Promise<Record<string,unknown>> {
  const dir=ensure(path.join(jobsRoot(),job.id)); ensure(root());
  if(job.kind==='tts')return {...await synthesizeSpeech(job.studentId,String(job.input.text||'')),kind:'tts'};
  const question=job.input.questionId?getQuestion(String(job.input.questionId),job.input.version?Number(job.input.version):undefined):undefined;
  if(job.kind==='variants'){
    if(!question)throw new Error('题目不存在');
    const questions=await generateVariants(job.studentId,question);
    const saved=questions.map((q,i)=>{const saved=saveQuestionVersion({...q,id:`variant-${job.id}-${i}`,version:1} as Question);assignQuestionOwner(saved.id,job.studentId);return saved;});
    return {questions:saved,source:'deepseek',message:'变式题已保存为待审核草稿，老师审核后才能练习。'};
  }
  if(job.kind==='explanation'){
    if(!question)throw new Error('题目不存在');return {scenes:await explanationScenes(job.studentId,question),source:process.env.DEEPSEEK_API_KEY?'deepseek':'sample'};
  }
  const story=stories.find(s=>s.id===job.input.storyId);
  if(job.kind==='illustrations'){
    if(!story)throw new Error('绘本不存在');const assets=[];
    for(const [i,scene] of story.scenes.entries()){
      updateJob(job.id,{progress:5+Math.round(i/story.scenes.length*85),message:`绘制第 ${i+1} / ${story.scenes.length} 幕`});
      const image=await generateQwenImage(job.studentId,`${story.description}. Scene ${i+1}: ${scene.text}`,`${story.id}:${i}`);
      const id=`image-${hash([job.studentId,story.id,i])}`;writeFileSync(path.join(root(),id+'.png'),readFileSync(image.path));atomicJson(path.join(root(),id+'.json'),{studentId:job.studentId,source:'qwen'});assets.push(`/api/media/${id}.png`);
    }return {images:assets,source:'qwen',storyId:story.id,sceneCount:story.scenes.length,model:'qwen-image-2.1-turbo',message:'请逐张检查人物、画面与文字情节，确认后使用这组插图制作绘本。'};
  }
  let selectedImages:string[]|undefined;
  if(job.kind==='story'&&job.input.illustrationJobId){
    const illustrationJob=getJob(String(job.input.illustrationJobId));
    if(!illustrationJob||illustrationJob.studentId!==job.studentId||illustrationJob.kind!=='illustrations'||illustrationJob.status!=='completed'||illustrationJob.input.storyId!==story?.id)throw new ProviderError('这组插图不属于当前学生或绘本，或尚未生成完成。',400);
    const images=illustrationJob.result?.images;
    if(!Array.isArray(images)||images.length!==story?.scenes.length||images.some(image=>typeof image!=='string'||!/^\/api\/media\/image-[a-f0-9]+\.png$/.test(image)))throw new ProviderError('插图数量或格式与绘本场景不一致。',400);
    selectedImages=images as string[];
    for(const image of selectedImages){const id=path.basename(image,'.png');const meta=path.join(root(),id+'.json');if(!existsSync(meta)||JSON.parse(readFileSync(meta,'utf8')).studentId!==job.studentId)throw new ProviderError('插图访问校验失败。',403);}
  }
  let scenes:Scene[];const scenesFile=path.join(dir,'scenes.json');
  if(existsSync(scenesFile))scenes=JSON.parse(readFileSync(scenesFile,'utf8'));
  else{
    if(job.kind==='board'){if(!question)throw new Error('题目不存在'); scenes=await explanationScenes(job.studentId,question);}
    else if(job.kind==='story'){if(!story)throw new Error('绘本不存在');scenes=story.scenes.map((scene,index)=>({...scene,...(selectedImages?{image:selectedImages[index]}:{})}));}
    else throw new Error('不支持的任务类型');
    atomicJson(scenesFile,scenes);
  }
  const total=scenes.length;const sourceTypes=new Set<string>();const rendered=[];let totalDuration=0;
  if(job.kind==='board')updateJob(job.id,{progress:5,message:'讲解步骤已就绪，正在生成本地语音与视频',result:{scenes,sceneCount:scenes.length,source:process.env.DEEPSEEK_API_KEY?'deepseek':'sample'}});
  for(const [i,scene] of scenes.entries()){
    updateJob(job.id,{progress:5+Math.round(i/total*80),message:`制作第 ${i+1} / ${total} 幕：本地朗读与画面`});
    const speech=await synthesizeSpeech(job.studentId,scene.narration);sourceTypes.add(speech.source);
    const duration=Math.max(2.5,speech.duration+0.35);totalDuration+=duration;
    const png=path.join(dir,`scene-${i}.png`);const clip=path.join(dir,`scene-${i}.mp4`);
    await screenshotScene(scene,i,total,png,job.kind==='story',speech.source);
    if(!existsSync(clip)){
      // Gentle pan/zoom plus a time-progress highlight; text remains baked into trusted keyframes.
      const vf=`scale=2560:1440,zoompan=z='min(zoom+0.00014,1.025)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=${Math.ceil(duration*24)}:s=1280x720:fps=24,drawbox=x=48:y=666:w=1184:h=4:color=0x86ad8a:t=fill,drawbox=x=48:y=666:w=1184:h=4:color=0xe8bd61:t=fill:enable='gte(t,${Math.max(0.5,duration*0.6).toFixed(2)})',format=yuv420p`;
      const part=path.join(dir,`scene-${i}.part.mp4`);
      await runProcess(binary('ffmpeg'),['-y','-v','error','-i',png,'-i',path.join(root(),speech.id+'.wav'),'-vf',vf,'-af','apad','-t',duration.toFixed(3),'-c:v','libx264','-preset','veryfast','-crf','23','-threads','2','-c:a','aac','-ar','48000','-ac','1','-b:a','96k','-movflags','+faststart',part]);
      const info=await probe(part);if(!info.streams.some(s=>s.codec_name==='h264')||!info.streams.some(s=>s.codec_name==='aac'))throw new Error('分镜音视频校验失败');renameSync(part,clip);
    }
    rendered.push(clip);
    atomicJson(path.join(dir,'progress.json'),{completedScenes:i+1,total,source:[...sourceTypes]});
  }
  updateJob(job.id,{progress:90,message:'合并视频并验证 H.264 / AAC 音视频'});
  const concat=path.join(dir,'concat.txt');writeFileSync(concat,rendered.map(f=>`file '${f.replace(/\\/g,'/').replace(/'/g,"'\\''")}'`).join('\n'));
  const id=`${job.kind}-${job.id}`;const output=path.join(root(),id+'.mp4');const partial=path.join(root(),id+'.part.mp4');
  await runProcess(binary('ffmpeg'),['-y','-v','error','-f','concat','-safe','0','-i',concat,'-c','copy','-movflags','+faststart',partial]);
  const info=await probe(partial);if(!info.streams.some(s=>s.codec_name==='h264')||!info.streams.some(s=>s.codec_name==='aac')||info.duration<=0)throw new Error('最终视频验证失败');renameSync(partial,output);
  const result={id,url:`/api/media/${id}.mp4`,kind:job.kind,duration:info.duration,scenes,sceneCount:scenes.length,source:selectedImages?'qwen':process.env.DEEPSEEK_API_KEY&&job.kind==='board'?'deepseek':'sample',scriptSource:process.env.DEEPSEEK_API_KEY&&job.kind==='board'?'deepseek':'sample',illustrationJobId:selectedImages?job.input.illustrationJobId:undefined,voiceSource:[...sourceTypes].join(','),studentId:job.studentId,storyId:story?.id,questionId:question?.id,createdAt:new Date().toISOString(),codecs:'H.264 + AAC'};
  atomicJson(path.join(root(),id+'.json'),result);return result;
}
