import { createJob,updateJob } from '../lib/db';
import { getSystemStatus,processMediaJob } from '../lib/media';
async function main(){
  if(!getSystemStatus().tts)throw new Error('Kokoro must be installed.');
  const storyId=process.argv[2]||'story4';if(!['story4','story5'].includes(storyId))throw new Error('Expected story4 or story5.');
  const job=createJob(storyId==='story5'?'s4':'s1','story',{storyId});updateJob(job.id,{status:'running',message:'验证本地 Kokoro 绘本视频'});
  try{const result=await processMediaJob(job);if(result.voiceSource!=='kokoro')throw new Error('Expected Kokoro narration.');updateJob(job.id,{status:'completed',progress:100,result,message:'Kokoro 本地语音绘本已就绪'});console.log(JSON.stringify(result));}
  catch(error){updateJob(job.id,{status:'failed',error:String(error)});throw error;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
