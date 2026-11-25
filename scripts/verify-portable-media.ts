import { mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import path from 'node:path';
import { screenshotScene,synthesizeSpeech,probe,runProcess } from '../lib/media';
import { createRequire } from 'node:module';
const require=createRequire(path.resolve('package.json'));
async function main(){
  process.env.SPROUT_PORTABLE='1';process.env.ALLOW_DEMO_SYSTEM_VOICE='false';process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('data/browsers');
  const output=path.resolve('../../work/portable-media-smoke');mkdirSync(output,{recursive:true});
  const picture=path.join(output,'portable-scene.png');
  await screenshotScene({title:'便携环境验证',text:'The book is on the desk.\n中文字体随包提供，无需安装。',narration:'The book is on the desk.',highlight:'on the desk',image:'/story-4-2.svg'},0,1,picture,true,'kokoro');
  const speech=await synthesizeSpeech('sample','This is a portable voice check. 本地语音已经准备好了。');if(speech.source!=='kokoro')throw new Error('System voice fallback is not allowed.');
  const movie=path.join(output,'portable-smoke.mp4');
  await runProcess(require('ffmpeg-static'),['-y','-v','error','-loop','1','-i',picture,'-i',path.resolve('data/media',speech.id+'.wav'),'-t','5','-c:v','libx264','-pix_fmt','yuv420p','-threads','2','-c:a','aac','-movflags','+faststart',movie]);
  const checked=await probe(movie);if(!checked.streams.some(s=>s.codec_name==='h264')||!checked.streams.some(s=>s.codec_name==='aac'))throw new Error('Portable codec verification failed');
  const report={node:process.execPath,path:process.env.PATH,browser:require('playwright').chromium.executablePath(),font:path.resolve('public/fonts/NotoSansSC.ttf'),voice:speech.source,video:movie,...checked};writeFileSync(path.join(output,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
