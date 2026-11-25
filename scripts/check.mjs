import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const require=createRequire(import.meta.url);
const portable=process.argv.includes('--portable')||process.env.SPROUT_PORTABLE==='1';
if(!portable)for(const name of ['.env.local','.env'])if(existsSync(name))for(const line of readFileSync(name,'utf8').split(/\r?\n/)){const m=line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');}
const portableRoot=process.env.SPROUT_PORTABLE_ROOT?path.resolve(process.env.SPROUT_PORTABLE_ROOT):null;
const inside=(file,root)=>{const relative=path.relative(root,path.resolve(file));return relative===''||(!relative.startsWith('..')&&!path.isAbsolute(relative));};
let failed=false;
async function check(name,fn,required=true){try{const value=await fn();console.log(`${value?'OK':'SETUP'} ${name}${typeof value==='string'?': '+value:''}`);if(!value&&required)failed=true;}catch(error){console.log(`SETUP ${name}: ${error.message}`);if(required)failed=true;}}
await check('Node 22.13 or newer',()=>{const [major,minor]=process.versions.node.split('.').map(Number);return major>22||(major===22&&minor>=13);});
if(portable){await check('Windows x64 portable target',()=>process.platform==='win32'&&process.arch==='x64');if(portableRoot)await check('Bundled Node executable',()=>inside(process.execPath,portableRoot)?process.execPath:false);}
await check('SQLite',()=>Boolean(require('node:sqlite').DatabaseSync));
await check('FFmpeg',()=>{const executable=portable?require('ffmpeg-static'):process.env.FFMPEG_PATH||require('ffmpeg-static');if(portable&&!inside(executable,process.cwd()))throw new Error('FFmpeg must be inside this application');return spawnSync(executable,['-version'],{windowsHide:true}).status===0?executable:false;});
await check('FFprobe',()=>{const executable=portable?require('ffprobe-static').path:process.env.FFPROBE_PATH||require('ffprobe-static').path;if(portable&&!inside(executable,process.cwd()))throw new Error('FFprobe must be inside this application');return spawnSync(executable,['-version'],{windowsHide:true}).status===0?executable:false;});
await check('Playwright browser launch',async()=>{
  if(portable)process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('data/browsers');else process.env.PLAYWRIGHT_BROWSERS_PATH||=path.resolve('data/browsers');
  const {chromium}=require('playwright');const bundled=chromium.executablePath();const system=!portable?['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(existsSync):undefined;
  const executable=existsSync(bundled)?bundled:system;if(!executable)throw new Error('Bundled Chromium missing; no system-browser fallback in portable mode');
  const browser=await chromium.launch({headless:true,executablePath:executable,args:['--disable-gpu']});try{const page=await browser.newPage();await page.setContent('<p>Sprout portable browser check</p>');await page.screenshot();}finally{await browser.close();}return executable;
});
await check('sherpa-onnx native runtime',()=>Boolean(require('sherpa-onnx-node').OfflineTts));
const model=path.resolve(process.env.KOKORO_MODEL_DIR||'data/models/kokoro-multi-lang-v1_1');
await check('Complete Kokoro bilingual model',()=>{if(portable&&!inside(model,process.cwd()))throw new Error('Kokoro model must be inside this application');return ['model.onnx','voices.bin','tokens.txt','lexicon-us-en.txt','lexicon-zh.txt','installation.json'].every(file=>existsSync(path.join(model,file)));},portable);
await check('Bundled Chinese font and license',()=>existsSync('public/fonts/NotoSansSC.ttf')&&existsSync('public/fonts/OFL.txt'),portable);
if(portable)await check('Real Kokoro synthesis (system voice disabled)',()=>{
  const sherpa=require('sherpa-onnx-node');const engine=new sherpa.OfflineTts({model:{kokoro:{model:path.join(model,'model.onnx'),voices:path.join(model,'voices.bin'),tokens:path.join(model,'tokens.txt'),lexicon:`${path.join(model,'lexicon-us-en.txt')},${path.join(model,'lexicon-zh.txt')}`},numThreads:2,provider:'cpu',debug:false},maxNumSentences:1});
  const audio=engine.generate({text:'Hello.',sid:0,speed:1});return audio.samples.length>0&&audio.sampleRate>0;
});
await check('DeepSeek key: chat, vision, ASR',()=>Boolean(process.env.DEEPSEEK_API_KEY),false);
await check('DashScope Beijing key: Qwen images',()=>Boolean(process.env.DASHSCOPE_API_KEY),false);
console.log(portable?'Portable checks require bundled browser, font and real Kokoro; system browser and Windows speech do not count as success.':'Missing cloud keys keep explicit sample mode; photo/ASR generation returns a setup message.');
console.log('Keys are never printed. No cloud API request was made.');process.exitCode=failed?1:0;
