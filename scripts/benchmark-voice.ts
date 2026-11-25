import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { voiceModelDir,speechSegments } from '../lib/media';
const require=createRequire(path.resolve('package.json'));const sherpa=require('sherpa-onnx-node');const dir=voiceModelDir();
const result=[];
for(const threads of [2,4]){
  const start=Date.now();
  const engine=new sherpa.OfflineTts({model:{kokoro:{model:path.join(dir,'model.onnx'),voices:path.join(dir,'voices.bin'),tokens:path.join(dir,'tokens.txt'),lexicon:`${path.join(dir,'lexicon-us-en.txt')},${path.join(dir,'lexicon-zh.txt')}`},numThreads:threads,provider:'cpu',debug:false},maxNumSentences:1});
  const loadMs=Date.now()-start;const samples=[];
  for(const [language,text] of [['en','Look at the desk. The book is on the desk.'],['zh','先找到关键词，再检查答案。'],['mixed','My book is on the desk. 我的书在桌子上。']]){
    for(let run=0;run<2;run++){
      const started=Date.now();let duration=0;
      for(const segment of speechSegments(text)){const audio=engine.generate({text:segment.text,sid:segment.sid,speed:.94});duration+=audio.samples.length/audio.sampleRate;}
      const sample={language,run,duration,elapsedMs:Date.now()-started};samples.push(sample);console.log(JSON.stringify({threads,loadMs,...sample}));
    }
  }
  result.push({threads,loadMs,samples});
}
writeFileSync('data/voice-benchmark.json',JSON.stringify({date:new Date().toISOString(),model:'kokoro-multi-lang-v1_1',results:result},null,2));
