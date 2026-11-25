import fs from 'node:fs/promises';
import path from 'node:path';
const output=path.resolve('licenses/media');
await fs.mkdir(output,{recursive:true});
const copies={
  'Kokoro-LICENSE.txt':'data/models/kokoro-multi-lang-v1_1/LICENSE',
  'NotoSansSC-OFL.txt':'public/fonts/OFL.txt',
  'FFmpeg-GPL-3.0.txt':'node_modules/ffmpeg-static/ffmpeg.exe.LICENSE',
  'FFmpeg-build-README.txt':'node_modules/ffmpeg-static/ffmpeg.exe.README',
  'ffmpeg-static-LICENSE.txt':'node_modules/ffmpeg-static/LICENSE',
  'ffprobe-static-LICENSE.txt':'node_modules/ffprobe-static/LICENSE',
  'Playwright-LICENSE.txt':'node_modules/playwright/LICENSE',
  'Playwright-NOTICE.txt':'node_modules/playwright/NOTICE',
  'Playwright-ThirdPartyNotices.txt':'node_modules/playwright/ThirdPartyNotices.txt',
  'PlaywrightCore-LICENSE.txt':'node_modules/playwright-core/LICENSE',
  'PlaywrightCore-NOTICE.txt':'node_modules/playwright-core/NOTICE',
  'PlaywrightCore-ThirdPartyNotices.txt':'node_modules/playwright-core/ThirdPartyNotices.txt',
};
for(const [name,source] of Object.entries(copies))await fs.copyFile(source,path.join(output,name));
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('data/browsers');
const {chromium}=await import('playwright');
const browser=await chromium.launch({headless:true,executablePath:chromium.executablePath(),args:['--disable-gpu']});
try{
  const page=await browser.newPage();
  for(const [name,url] of [['Chromium-credits.html','chrome://credits/'],['Chromium-terms.html','chrome://terms/']]){
    await page.goto(url,{waitUntil:'load'});
    await fs.writeFile(path.join(output,name),await page.content());
    console.log(`${name}: ${await page.title()}`);
  }
}finally{await browser.close();}
const downloads={
  'espeak-ng-COPYING.txt':'https://raw.githubusercontent.com/espeak-ng/espeak-ng/master/COPYING',
  'espeak-ng-dictionary-license.txt':'https://raw.githubusercontent.com/espeak-ng/espeak-ng/master/dictsource/README.md',
};
for(const [name,url] of Object.entries(downloads)){
  const response=await fetch(url);if(!response.ok){console.warn(`${name}: HTTP ${response.status}`);continue;}
  await fs.writeFile(path.join(output,name),await response.text());console.log(name);
}
