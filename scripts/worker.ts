import { existsSync, readFileSync, openSync, closeSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { claimNextJob, recoverStaleJobs, updateJob } from '../lib/db';
import { processMediaJob,warmVoice } from '../lib/media';

async function main(){
if(process.env.SPROUT_PORTABLE!=='1')for(const name of ['.env.local','.env'])if(existsSync(name))for(const line of readFileSync(name,'utf8').split(/\r?\n/)){const m=line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');}
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve('data/browsers');
mkdirSync('data',{recursive:true});const lock=path.resolve('data/worker.lock');
if(existsSync(lock)){let alive=false;try{const pid=Number(readFileSync(lock,'utf8'));process.kill(pid,0);alive=true;}catch{}if(alive){console.log('A media worker is already running.');process.exit(0);}unlinkSync(lock);}
const fd=openSync(lock,'wx');writeFileSync(fd,String(process.pid));closeSync(fd);
let stopping=false;const cleanup=()=>{try{if(readFileSync(lock,'utf8')===String(process.pid))unlinkSync(lock);}catch{}};
process.on('exit',cleanup);process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
recoverStaleJobs();
try{const elapsed=warmVoice();if(elapsed)console.log(`Kokoro model warmed in ${elapsed} ms before accepting jobs.`);}catch(error){console.error('Kokoro warm-up failed:',error);}
console.log('Local media worker ready; concurrency=1.');
while(!stopping){
  const job=claimNextJob();
  if(!job){if(process.argv.includes('--once'))break;await new Promise(resolve=>setTimeout(resolve,1000));continue;}
  const heartbeat=setInterval(()=>{try{updateJob(job.id,{});}catch{}},20_000);
  try{const result=await processMediaJob(job);updateJob(job.id,{status:'completed',progress:100,message:'已完成，可以播放',result,error:null});}
  catch(error){const message=error instanceof Error?error.message:'任务失败';console.error(`Job ${job.id}: ${message}`);updateJob(job.id,{status:'failed',message:'处理失败，可重试；已完成的阶段会复用',error:message});}
  finally{clearInterval(heartbeat);}
  if(process.argv.includes('--once'))break;
}
cleanup();
}
main().catch(error=>{console.error(error);process.exitCode=1;});
