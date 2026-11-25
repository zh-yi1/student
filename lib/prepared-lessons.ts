import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { AnimatedLesson } from './animated-lessons';

export const preparedLessonRoot = () => path.resolve('content/prepared-lessons');
export const preparedLessonKey = (original: AnimatedLesson) => createHash('sha256').update(JSON.stringify(original)).digest('hex').slice(0,32);
export function readPreparedLesson(original: AnimatedLesson, directory = preparedLessonRoot()): AnimatedLesson | undefined {
  try {
    const lesson = JSON.parse(readFileSync(path.join(directory,preparedLessonKey(original)+'.json'),'utf8')) as AnimatedLesson;
    if (lesson.scenes.length !== original.scenes.length || !lesson.scenes.every(scene => scene.audio && scene.audio.duration > 0 && /^\/api\/lesson-audio\/lesson-[45]-[a-f0-9]{32}\.wav$/.test(scene.audio.url) && existsSync(path.join(directory,'audio',path.basename(scene.audio.url))) && existsSync(path.join(directory,'audio',path.basename(scene.audio.url,'.wav')+'.json')))) return undefined;
    return lesson;
  } catch { return undefined; }
}
