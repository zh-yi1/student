import { getTextbookUnit } from './textbooks';
import type { Grade } from './types';

export type LessonScene = { title: string; text: string; narration: string; words: string[]; visual: 'table' | 'plant' | 'friends' | 'reading'; prompt: string; audio?: { url: string; source: string; duration: number } };
export type AnimatedLesson = { title: string; unitTitle: string; source: 'offline' | 'deepseek'; sourceUrl: string; scenes: LessonScene[] };

export function originalAnimatedLesson(grade: Grade, bookId: string, unitId: string, mode: string): AnimatedLesson {
  const found = getTextbookUnit(bookId, unitId);
  if (!found || found.book.grade !== grade || !found.unit.lesson || !found.unit.guideReady) throw new Error('这个单元的动画课尚未准备好，请先选择第一单元。');
  const card = found.unit.lesson.cards.find(card => card.id === mode);
  if (!card) throw new Error('请选择单词、句型或阅读动画课。');
  const words = grade === 4
    ? mode === 'words' ? [['set the table'], ['water the plants', 'put away the toys'], ['I', 'can', 'put away the toys.']]
      : mode === 'reading' ? [['Saturday', 'family'], ['Dad → cook', 'Mei → set the table', 'brother → put away toys'], ['help at home', 'play together']]
        : [['I', 'can', 'set the table.'], ['Can', 'you', 'water the plants?'], ['She', 'can', 'help.']]
    : mode === 'words' ? [['helpful'], ['quiet', 'active'], ['Ming is helpful.', 'He carries books.']]
      : mode === 'reading' ? [['friends'], ['Find the action.', 'Find the evidence.'], ['different', 'together']]
        : [['She is kind.', 'She likes drawing.', 'She can draw.'], ['is → kind', 'likes → reading', 'can → read'], ['different friends', 'help each other']];
  const scenes: LessonScene[] = card.steps.map((step, index) => ({ title: step.title, text: step.text, narration: step.text, words: words[index] || [], visual: mode === 'reading' ? 'reading' : grade === 5 ? 'friends' : index === 1 ? 'plant' : 'table', prompt: step.prompt }));
  if (card.originalPassage) scenes.unshift({ title: '先听原创小故事', text: card.originalPassage, narration: card.originalPassage, words: ['Read', 'Think', 'Find evidence'], visual: 'reading', prompt: '先听懂故事大意，再找人物和动作。' });
  return { title: card.title, unitTitle: found.unit.title, source: 'offline', sourceUrl: found.unit.sourceUrl, scenes };
}
