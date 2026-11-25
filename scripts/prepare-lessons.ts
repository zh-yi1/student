import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { textbooks } from '../lib/textbooks';
import { originalAnimatedLesson } from '../lib/animated-lessons';
import { narrateAnimatedLesson } from '../lib/ai';
import { preparedLessonKey, preparedLessonRoot, readPreparedLesson } from '../lib/prepared-lessons';
import { synthesizeSpeech, voiceModelDir, speechSegments } from '../lib/media';

async function main() {
  const root = preparedLessonRoot(); mkdirSync(path.join(root,'audio'),{recursive:true});
  const lexicon = new Set([path.join(voiceModelDir(),'lexicon-us-en.txt'),path.resolve('content/voice-lexicon.txt')].flatMap(file=>readFileSync(file,'utf8').split(/\r?\n/).map(line=>line.split(' ')[0].toLowerCase())));
  let lessons=0, scenes=0;
  for (const book of textbooks) for (const unit of book.units.filter(unit=>unit.guideReady)) for (const mode of ['words','sentences','reading']) {
    const original = originalAnimatedLesson(book.grade,book.id,unit.id,mode);
    const existing = readPreparedLesson(original);
    if (existing) { lessons++; scenes+=existing.scenes.length; console.log(`Already prepared: ${book.grade}/${mode}`); continue; }
    const lesson = await narrateAnimatedLesson(book.grade===4?'s1':'s4', original);
    // Do not publish a course with words silently omitted by the local lexicon frontend.
    const words=lesson.scenes.flatMap(scene=>speechSegments(scene.narration).filter(piece=>piece.language==='en').flatMap(piece=>piece.text.toLowerCase().match(/[a-z]+(?:'[a-z]+)*/g)||[]));
    const missing=[...new Set(words.filter(word=>!lexicon.has(word)))];
    if (missing.length) throw new Error(`Pronunciation entries needed (${book.grade}/${mode}): ${missing.join(', ')}`);
    for (const [index,scene] of lesson.scenes.entries()) {
      const speech=await synthesizeSpeech('sample',scene.narration);
      const digest=createHash('sha256').update(JSON.stringify([scene.narration,speech.id])).digest('hex').slice(0,32);
      const id=`lesson-${book.grade}-${digest}`;
      copyFileSync(path.resolve('data/media',speech.id+'.wav'),path.join(root,'audio',id+'.wav'));
      writeFileSync(path.join(root,'audio',id+'.json'),JSON.stringify({studentId:'sample',grade:book.grade,source:speech.source,duration:speech.duration}));
      scene.audio={url:`/api/lesson-audio/${id}.wav`,source:speech.source,duration:speech.duration};
      console.log(`Prepared ${book.grade}/${mode}: ${index+1}/${lesson.scenes.length} (${speech.duration.toFixed(1)}s)`);
      scenes++;
    }
    const output=path.join(root,preparedLessonKey(original)+'.json'),temp=output+'.'+randomUUID()+'.tmp';
    writeFileSync(temp,JSON.stringify({...lesson,preparedAt:new Date().toISOString()},null,2)); renameSync(temp,output); lessons++;
  }
  console.log(JSON.stringify({prepared:true,lessons,scenes}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
