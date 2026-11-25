import { createJob, updateJob, listJobs } from '../lib/db';
import { processMediaJob } from '../lib/media';
import { questions } from '../lib/curriculum';
async function main(){
  for(const kind of ['story','board'] as const){
    const old=listJobs('s1').find(j=>j.kind===kind&&j.status==='completed');
    if(old){console.log(`Existing ${kind}: ${old.result?.url}`);continue;}
    const job=createJob('s1',kind,kind==='story'?{storyId:'story4'}:{questionId:questions.find(q=>q.grade===4&&q.phase==='practice')!.id});
    updateJob(job.id,{status:'running'});
    try{const result=await processMediaJob(job);updateJob(job.id,{status:'completed',progress:100,message:'示例视频已就绪',result});console.log(JSON.stringify(result));}
    catch(error){updateJob(job.id,{status:'failed',error:String(error)});throw error;}
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
