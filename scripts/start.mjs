import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
const mode = process.argv[2] === 'start' ? 'start' : 'dev';
const root=process.cwd();
for(const name of ['.env.local','.env']) {if(existsSync(name)){for(const line of readFileSync(name,'utf8').split(/\r?\n/)){const m=line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);if(m && !process.env[m[1]])process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');}}}
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(root,'data','browsers');
const children=[];
let stopping=false;
let finalExitCode=0;
function run(args){
  const child=spawn(process.execPath,args,{cwd:root,env:process.env,stdio:'inherit',windowsHide:true});
  children.push(child);
  child.on('error',error=>{console.error('无法启动子进程:',error.message);void stop(1);});
  child.on('exit',(code,signal)=>{
    if(!stopping && (code!==0 || signal)){
      console.error('子进程异常退出:',code ?? signal);
      void stop(Number.isInteger(code) && code>0 && code<256 ? code : 1);
    }
  });
  return child;
}
function terminateOwnedChild(child){
  // Only target live process IDs returned by this launcher's own spawn calls.
  if(!Number.isInteger(child.pid) || child.pid<=0 || child.exitCode!==null || child.signalCode!==null)return Promise.resolve(true);
  if(process.platform==='win32'){
    return new Promise(resolve=>{
      const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,shell:false,stdio:'ignore'});
      let settled=false;
      const finish=ok=>{if(settled)return;settled=true;clearTimeout(timer);resolve(ok);};
      const timer=setTimeout(()=>{killer.kill();finish(false);},8000);
      killer.once('error',error=>{console.error(`无法结束本次启动的进程树 ${child.pid}:`,error.message);finish(false);});
      killer.once('exit',code=>finish(code===0 || child.exitCode!==null || child.signalCode!==null));
    });
  }
  return new Promise(resolve=>{
    const timer=setTimeout(()=>{child.kill('SIGKILL');resolve(false);},5000);
    child.once('exit',()=>{clearTimeout(timer);resolve(true);});
    child.kill('SIGTERM');
  });
}
async function stop(exitCode=0){
  if(exitCode)finalExitCode=exitCode;
  if(stopping)return;
  stopping=true;
  const results=await Promise.allSettled(children.map(terminateOwnedChild));
  if(results.some(result=>result.status==='rejected' || result.value!==true)){
    console.error('部分本次启动的子进程未能确认退出。');
    finalExitCode ||= 1;
  }
  process.exit(finalExitCode);
}
process.on('SIGINT',()=>{void stop(0);});process.on('SIGTERM',()=>{void stop(0);});
run([path.join(root,'node_modules','next','dist','bin','next'),mode,'--hostname','127.0.0.1','--port',process.env.PORT || '3000']);
run(['--import','tsx',path.join(root,'scripts','worker.ts')]);
