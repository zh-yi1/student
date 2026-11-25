import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {inspectPe} from './audit-native.mjs';
const require=createRequire(import.meta.url);
const browser='data/browsers/chromium-1255/chrome-win64';
const native='node_modules/sherpa-onnx-win-x64';
const model='data/models/kokoro-multi-lang-v1_1';
const ffmpeg=require('ffmpeg-static'),ffprobe=require('ffprobe-static').path;
const relative=file=>path.relative(process.cwd(),file).replaceAll('\\','/');
const binaries=[...fs.readdirSync(native).filter(f=>/\.(node|dll)$/.test(f)).map(f=>`${native}/${f}`),`${browser}/chrome.exe`,`${browser}/chrome.dll`,`${browser}/chrome_elf.dll`,`${browser}/vk_swiftshader.dll`,`${browser}/vulkan-1.dll`,relative(ffmpeg),relative(ffprobe)];
const imports=binaries.map(file=>inspectPe(file));
const evidence=JSON.parse(fs.readFileSync('../../work/portable-media-smoke/verification.json','utf8'));
const assets=[];
for(const file of [`${model}/model.onnx`,`${model}/voices.bin`,'public/fonts/NotoSansSC.ttf',...binaries]){
 const buffer=fs.readFileSync(file);assets.push({path:file,bytes:buffer.length,sha256:crypto.createHash('sha256').update(buffer).digest('hex')});
}
const manifest={
 schemaVersion:1,generatedAt:new Date().toISOString(),target:'Windows x64',
 purpose:'Media runtime files to retain in the portable application; Node and the launcher are packaged separately.',
 requiredDirectories:['data/browsers/chromium-1255','data/browsers/ffmpeg-1013','data/browsers/winldd-1007',model,'public/fonts','node_modules/playwright','node_modules/playwright-core','node_modules/sherpa-onnx-node',native,'node_modules/ffmpeg-static','node_modules/ffprobe-static','node_modules/tsx','node_modules/@esbuild/win32-x64'],
 packages:[
  {name:'Chrome for Testing (bundled Chromium)',version:'159.0.8154.6',playwrightRevision:1255,source:'https://cdn.playwright.dev/builds/cft/159.0.8154.6/win64/chrome-win64.zip',licenses:['Chromium-credits.html','Chromium-terms.html']},
  {name:'Playwright',version:require('playwright/package.json').version,source:'https://github.com/microsoft/playwright',license:'Apache-2.0; bundled dependency licenses retained in node_modules',licenses:['Playwright-LICENSE.txt','Playwright-NOTICE.txt','Playwright-ThirdPartyNotices.txt']},
  {name:'sherpa-onnx',version:require('sherpa-onnx-node/package.json').version,source:'https://github.com/k2-fsa/sherpa-onnx/releases/tag/v2.0.1',license:'Apache-2.0',licenses:['sherpa-onnx-LICENSE.txt']},
  {name:'ONNX Runtime',version:'1.28.2',source:'https://github.com/csukuangfj/onnxruntime-libs/releases/tag/v1.28.2',license:'MIT and included third-party notices',licenses:['onnxruntime-LICENSE.txt','onnxruntime-ThirdPartyNotices.txt']},
  {name:'Kokoro bilingual model',version:'multi-lang-v1_1',source:JSON.parse(fs.readFileSync(`${model}/installation.json`)).source,license:'Apache-2.0; espeak-ng data GPL-3.0-or-later',licenses:['Kokoro-LICENSE.txt','espeak-ng-COPYING.txt']},
  {name:'Noto Sans SC variable font',source:'https://github.com/google/fonts/tree/main/ofl/notosanssc',license:'SIL Open Font License 1.1',licenses:['NotoSansSC-OFL.txt']},
  {name:'FFmpeg static executable',version:'6.1.1-essentials_build-www.gyan.dev',source:'https://github.com/FFmpeg/FFmpeg/commit/e38092ef93',license:'GPL-3.0',wrapperVersion:require('ffmpeg-static/package.json').version,licenses:['FFmpeg-GPL-3.0.txt','FFmpeg-build-README.txt','ffmpeg-static-LICENSE.txt']},
  {name:'FFprobe static executable',version:'4.0.2',source:'https://github.com/FFmpeg/FFmpeg/tree/n4.0.2',license:'GPL-3.0 (binary); MIT (ffprobe-static wrapper)',wrapperVersion:require('ffprobe-static/package.json').version,licenses:['FFmpeg-GPL-3.0.txt','ffprobe-static-LICENSE.txt']},
 ],
 nativeAudit:{imports,vcRuntimeDynamicImports:imports.flatMap(item=>[...item.imports,...item.delayImports].filter(dll=>/^(vcruntime|msvcp)\d/i.test(dll)).map(dll=>({file:item.file,dll}))),note:'Inspected PE imports/delay imports have no external VCRUNTIME/MSVCP dependency. Standard Windows system DLLs remain required; this is not a clean-VM compatibility claim.'},
 behavior:{portableEnvironment:'SPROUT_PORTABLE=1',systemBrowserFallback:false,windowsSpeechFallback:false,systemPythonRequired:false,systemNodeRequired:false,note:'The launcher supplies bundled Node. Cloud features need user-provided keys; no cloud key is needed for the local examples.'},
 verification:{...evidence,node:'Invoked Node 24.13.0 explicitly; parent package supplies its own Node',browser:`${browser}/chrome.exe`,font:'public/fonts/NotoSansSC.ttf',video:'work/portable-media-smoke/portable-smoke.mp4',note:'PATH contained only Windows System32. Real bundled Chromium rendering, embedded font, Kokoro synthesis and FFmpeg/FFprobe passed. Relocated package verification is performed separately.'},
 assets
};
fs.writeFileSync('PORTABLE-MEDIA-MANIFEST.json',JSON.stringify(manifest,null,2)+'\n');
for(const [name,executable] of [['FFmpeg',ffmpeg],['FFprobe',ffprobe]]){const info=spawnSync(executable,['-version'],{encoding:'utf8',windowsHide:true});fs.writeFileSync(`licenses/media/${name}-version-build.txt`,info.stdout+info.stderr);}
fs.copyFileSync(`${browser}/ABOUT`,'licenses/media/Chromium-ABOUT.txt');
console.log(JSON.stringify({assets:assets.length,vcRuntimeDynamicImports:manifest.nativeAudit.vcRuntimeDynamicImports,output:'PORTABLE-MEDIA-MANIFEST.json'}));
