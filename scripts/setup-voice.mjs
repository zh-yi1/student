import { existsSync, mkdirSync, createWriteStream, createReadStream, readFileSync, writeFileSync, statSync, unlinkSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { Transform } from 'node:stream';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const name='kokoro-multi-lang-v1_1';
const parent=path.resolve('data/models');const target=path.join(parent,name);mkdirSync(parent,{recursive:true});
const files=['model.onnx','voices.bin','tokens.txt','lexicon-us-en.txt','lexicon-zh.txt'];
if(files.every(file=>existsSync(path.join(target,file)))&&existsSync(path.join(target,'installation.json'))){console.log('Kokoro bilingual model already installed:',target);process.exit(0);}
const url=`https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/${name}.tar.bz2`;
const archive=path.join(parent,`${name}.tar.bz2`);
console.log('Downloading the official Kokoro bilingual model (several hundred MB). No API key or inference charge.');
console.log(url);
const head=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(60_000)});
if(!head.ok)throw new Error(`Model download metadata failed: ${head.status}`);
const total=Number(head.headers.get('content-length'));
let have=existsSync(archive)?statSync(archive).size:0;
if(!Number.isSafeInteger(total)||total<=0)throw new Error('Official archive size unavailable; download stopped.');
if(have>total)throw new Error('Local archive is larger than the official artifact; inspect it before retrying.');
if(have<total){
  console.log(`Resuming at ${(have/1048576).toFixed(1)} / ${(total/1048576).toFixed(1)} MiB using four verified HTTP byte ranges.`);
  const width=Math.ceil((total-have)/4);let downloaded=have;let lastPrinted=Date.now();
  const parts=Array.from({length:4},(_,i)=>({start:have+i*width,end:Math.min(total-1,have+(i+1)*width-1),file:`${archive}.range-${i}`})).filter(part=>part.start<=part.end);
  await Promise.all(parts.map(async part=>{
    const expected=part.end-part.start+1;
    const response=await fetch(url,{headers:{Range:`bytes=${part.start}-${part.end}`},signal:AbortSignal.timeout(2*60*60*1000)});
    if(response.status!==206||response.headers.get('content-range')!==`bytes ${part.start}-${part.end}/${total}`||!response.body)throw new Error(`Server did not honor byte range ${part.start}-${part.end}; partial archive retained.`);
    const progress=new Transform({transform(chunk,_encoding,callback){downloaded+=chunk.length;if(Date.now()-lastPrinted>10_000){console.log(`Downloaded ${(downloaded/1048576).toFixed(1)} / ${(total/1048576).toFixed(1)} MiB`);lastPrinted=Date.now();}callback(null,chunk);}});
    await pipeline(Readable.fromWeb(response.body),progress,createWriteStream(part.file));
    if(statSync(part.file).size!==expected)throw new Error('Downloaded range size mismatch.');
  }));
  for(const part of parts){await pipeline(createReadStream(part.file),createWriteStream(archive,{flags:'a'}));unlinkSync(part.file);}
  have=statSync(archive).size;if(have!==total)throw new Error('Combined archive size mismatch.');
}
console.log('Computing archive SHA-256 and validating archive paths...');
const sha256=createHash('sha256').update(readFileSync(archive)).digest('hex');
if(process.env.KOKORO_ARCHIVE_SHA256&&sha256!==process.env.KOKORO_ARCHIVE_SHA256.toLowerCase())throw new Error('Model archive SHA-256 mismatch.');
const listing=spawnSync('tar',['-tjf',archive],{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
if(listing.status!==0)throw new Error('Archive cannot be read. Remove the incomplete archive and run setup again.');
if(listing.stdout.split(/\r?\n/).filter(Boolean).some(entry=>entry.startsWith('/')||entry.includes('..')||!entry.startsWith(name+'/')))throw new Error('Archive contains unexpected paths; extraction stopped.');
console.log('Extracting the local model. This may take a few minutes...');
const extract=spawnSync('tar',['-xjf',archive,'-C',parent],{stdio:'inherit',windowsHide:true});
if(extract.status!==0||!files.every(file=>existsSync(path.join(target,file))))throw new Error('Model extraction incomplete.');
writeFileSync(path.join(target,'installation.json'),JSON.stringify({source:url,sha256,checkedAt:new Date().toISOString(),expectedHashProvided:Boolean(process.env.KOKORO_ARCHIVE_SHA256)},null,2));
console.log('Installed:',target);console.log('SHA-256 (local provenance digest):',sha256);console.log('English speaker 0 / Chinese speaker 3. Restart npm run dev to use Kokoro.');
