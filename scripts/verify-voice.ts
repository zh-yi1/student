import { getSystemStatus, synthesizeSpeech, probe } from '../lib/media';
import path from 'node:path';
async function main(){
  if(!getSystemStatus().tts)throw new Error('Install Kokoro with npm run setup:voice before this verification.');
  for(const [language,text] of [['en','Good morning. My book is on the desk. Can you find my blue schoolbag?'],['zh','我们一起学习英语。先找到题目中的关键词，再检查答案。'],['mixed','My book is on the desk. 我的书在桌子上。 Now you try.']]){
    const started=Date.now();const result=await synthesizeSpeech('sample',text);if(result.source!=='kokoro')throw new Error('Verification requires the real Kokoro engine.');
    const info=await probe(path.resolve('data/media',result.id+'.wav'));
    if(!info.streams.some(stream=>stream.codec_type==='audio')||info.duration<1)throw new Error('Speech verification failed.');
    console.log(JSON.stringify({language,source:result.source,url:result.url,duration:info.duration,elapsedMs:Date.now()-started}));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
