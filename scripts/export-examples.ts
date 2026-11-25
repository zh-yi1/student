import { listJobs } from '../lib/db';
import { mkdirSync,copyFileSync,writeFileSync,readFileSync } from 'node:fs';
import path from 'node:path';
const choices:Array<{student:string;kind:string;storyId?:string;name:string;voiceSource:string;jobId?:string}>=[{student:'s1',kind:'story',storyId:'story4',name:'grade-4-story-kokoro',voiceSource:'kokoro'},{student:'s4',kind:'story',storyId:'story5',name:'grade-5-story-kokoro',voiceSource:'kokoro'},{student:'s1',kind:'board',name:'board-demo-system-voice',voiceSource:'demo-system-voice'},{student:'s1',kind:'board',name:'board-kokoro',voiceSource:'kokoro',jobId:'3af38584-50cb-4f4b-b048-aa19d89c4eb3'}];
mkdirSync('examples',{recursive:true});const manifest=[];
for(const choice of choices){
  const job=listJobs(choice.student).find(j=>j.kind===choice.kind&&j.status==='completed'&&typeof j.result?.url==='string'&&j.result.voiceSource===choice.voiceSource&&(!choice.jobId||j.id===choice.jobId)&&(!choice.storyId||j.input.storyId===choice.storyId));
  if(!job)throw new Error(`Missing completed sample: ${choice.name}`);
  const source=path.resolve('data/media',path.basename(String(job.result!.url)));const destination=path.resolve('examples',choice.name+'.mp4');copyFileSync(source,destination);
  const record={filename:choice.name+'.mp4',duration:job.result!.duration,voiceSource:job.result!.voiceSource,contentSource:job.result!.source,jobId:job.id,createdAt:job.createdAt,completedAt:job.updatedAt,elapsedSeconds:(Date.parse(job.updatedAt)-Date.parse(job.createdAt))/1000,codecs:job.result!.codecs};
  manifest.push(record);console.log(JSON.stringify(record));
}
writeFileSync('examples/manifest.json',JSON.stringify(manifest,null,2));
for(const [language,id] of [['english','speech-0cdaab5461574fbcb020419bcdd43dec'],['chinese','speech-dd54e72a63e8a4de231bdd39e003fdaf'],['mixed','speech-e962e02ce0936d5ad10cf45bb2f8e707']]){
  const source=path.resolve('data/media',id+'.wav');const metadata=JSON.parse(readFileSync(path.resolve('data/media',id+'.json'),'utf8'));
  if(metadata.source!=='kokoro')throw new Error('Expected real Kokoro verification audio.');
  copyFileSync(source,path.resolve('examples',language+'-kokoro.wav'));
  writeFileSync(path.resolve('examples',language+'-kokoro.json'),JSON.stringify(metadata,null,2));
}
