import { mkdirSync,writeFileSync,readFileSync,existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const destination=path.resolve('public/fonts');mkdirSync(destination,{recursive:true});
const root='https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/';
for(const [remote,local] of [['NotoSansSC%5Bwght%5D.ttf','NotoSansSC.ttf'],['OFL.txt','OFL.txt']]){
  const target=path.join(destination,local);
  if(!existsSync(target)){const response=await fetch(root+remote,{signal:AbortSignal.timeout(300_000)});if(!response.ok)throw new Error(`Official font download failed: ${response.status}`);const bytes=Buffer.from(await response.arrayBuffer());if(local.endsWith('.ttf')&&bytes.readUInt32BE(0)!==0x00010000)throw new Error('Unexpected font format');writeFileSync(target,bytes);}
  console.log(`${local}: ${readFileSync(target).length} bytes`);
}
writeFileSync(path.join(destination,'source.json'),JSON.stringify({family:'Noto Sans SC',source:'https://github.com/google/fonts/tree/main/ofl/notosanssc',license:'SIL Open Font License 1.1',sha256:createHash('sha256').update(readFileSync(path.join(destination,'NotoSansSC.ttf'))).digest('hex')},null,2));
