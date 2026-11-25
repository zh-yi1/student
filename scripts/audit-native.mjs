import fs from 'node:fs';
import path from 'node:path';
export function inspectPe(filename){
  const data=fs.readFileSync(filename);if(data.toString('ascii',0,2)!=='MZ')throw new Error('Not a PE binary');
  const pe=data.readUInt32LE(0x3c);if(data.toString('ascii',pe,pe+4)!=='PE\0\0')throw new Error('Invalid PE signature');
  const count=data.readUInt16LE(pe+6),optionalSize=data.readUInt16LE(pe+20),optional=pe+24,plus=data.readUInt16LE(optional)===0x20b;
  const directory=optional+(plus?112:96);const sections=[];
  for(let i=0;i<count;i++){const offset=optional+optionalSize+i*40;sections.push({rva:data.readUInt32LE(offset+12),size:Math.max(data.readUInt32LE(offset+8),data.readUInt32LE(offset+16)),raw:data.readUInt32LE(offset+20)});}
  const offsetOf=rva=>{const section=sections.find(s=>rva>=s.rva&&rva<s.rva+s.size);return section?section.raw+rva-section.rva:rva;};
  const stringAt=rva=>{const offset=offsetOf(rva);let end=offset;while(end<data.length&&data[end])end++;return data.toString('ascii',offset,end);};
  const imports=[],delayImports=[];const importRva=data.readUInt32LE(directory+8);
  if(importRva)for(let offset=offsetOf(importRva),i=0;i<500;i++,offset+=20){const name=data.readUInt32LE(offset+12);if(!name)break;imports.push(stringAt(name));}
  const delayRva=data.readUInt32LE(directory+13*8),imageBase=plus?Number(data.readBigUInt64LE(optional+24)):data.readUInt32LE(optional+28);
  if(delayRva)for(let offset=offsetOf(delayRva),i=0;i<500;i++,offset+=32){const attrs=data.readUInt32LE(offset),name=data.readUInt32LE(offset+4);if(!name)break;delayImports.push(stringAt(attrs&1?name:name-imageBase));}
  return {file:filename,machine:data.readUInt16LE(pe+4).toString(16),imports,delayImports};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'))){
  const files=process.argv.slice(2);console.log(JSON.stringify(files.map(inspectPe),null,2));
}
