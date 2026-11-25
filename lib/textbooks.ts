import type { Grade } from './types';

/** Official unit titles only. All teaching prose and examples below are original. */
export type TextbookEdition = 'revised';
export interface TeachingStep { title: string; text: string; prompt: string }
export interface TransferCheck { text: string; options: string[]; answer: string; explanation: string }
export interface CoachingCard {
  id: 'words' | 'sentences' | 'reading';
  title: string;
  objective: string;
  diagnosticQuestion: string;
  steps: TeachingStep[];
  expressionPrompt: string;
  transfer: TransferCheck;
  originalPassage?: string;
}
export interface OriginalLesson {
  goals: string[];
  diagnosticQuestion: string;
  steps: TeachingStep[];
  expressionPrompt: string;
  transfer: TransferCheck;
  grounding: string;
  cards: CoachingCard[];
}
export interface TextbookUnit {
  id: string;
  number: number;
  title: string;
  topic: string;
  theme: string;
  summary: string;
  learningGoals: string[];
  guideReady: boolean;
  sourceUrl: string;
  guide?: { bigQuestion: string; understand: string[]; language: string[]; apply: string[]; reflect: string[] };
  lesson?: OriginalLesson;
}
export interface Textbook {
  id: string;
  title: string;
  grade: Grade;
  term: '上册';
  series: '人教 PEP 小学英语';
  edition: TextbookEdition;
  editionLabel: string;
  yearNote: string;
  sourceUrl: string;
  sourceUrls: string[];
  electronicTextbookUrl: string;
  verifiedAt: string;
  verificationNote: string;
  units: TextbookUnit[];
}

const officialIntroduction = 'https://www.pep.com.cn/xw/zt/hd/12/xjcjs/xx/202409/t20240920_1995564.html';
const officialLibrary = 'https://jc.pep.com.cn/?filed=%E5%B0%8F%E5%AD%A6&subject=%E8%8B%B1%E8%AF%AD';
const grounding = '单元名称与册别依据人教社官网目录核对。以下目标、词句、短文、问题和讲解均为教材主题配套的原创辅导，不是课本原文，也不声称覆盖本单元全部词表或考点。尚未读取这位学生的课本页；需要解释具体课文或试卷时，请先提供对应页或题目，再核对版本、页码与原文证据。';

const helpingCards: CoachingCard[] = [
  {
    id: 'words', title: '在动作中理解家务词组', objective: '把家务动作、英文短语和帮助家人的目的连起来。',
    diagnosticQuestion: '你在家会帮忙做什么？可以先用中文说一件事，再试着说你认识的英文。',
    steps: [
      { title: '先看正在做什么', text: '想象晚饭前，你把碗和勺放到桌上。我们用 set the table 表示摆好餐具。不要把它逐字理解成“设置桌子”。', prompt: '如果桌上已经摆好碗和勺，你觉得这项任务完成了吗？' },
      { title: '用动作把词组记住', text: 'water the plants 是给植物浇水；put away the toys 是把玩具收好。试着做动作，再说整个词组。词组比孤立背一个词更能帮助你表达。', prompt: '拿起水壶给花浇水时，你会选择哪一个词组？' },
      { title: '把词组放回自己的生活', text: '选择你实际能做的一件事，连成 I can ...。例如：I can put away the toys. 只需用一个你理解的词组。', prompt: '今晚你能做哪件小事？试着用 I can 开头。' },
    ],
    expressionPrompt: '选一件你会做的家务，用英文说一句，再用中文解释它能帮助谁。',
    transfer: { text: 'Mei can put plates and spoons on the table for dinner. What can she do?', options: ['She can set the table.', 'She can water the plants.', 'She can put away the toys.'], answer: 'She can set the table.', explanation: 'plates 和 spoons 是盘子、勺子；为吃饭摆好餐具，对应 set the table。先抓动作的对象，再选词组。' },
  },
  {
    id: 'sentences', title: '说出我能帮什么忙', objective: '在真实分工中理解并使用 I can ... 与 Can you ...?。',
    diagnosticQuestion: 'I can water the plants. 这句话是在说“我能做什么”，还是在问别人能不能做？你从哪里看出来？',
    steps: [
      { title: '先理解说话目的', text: 'I can ... 用来表达自己能做的事。I can set the table. 是主动说自己可以摆餐具。', prompt: '如果你愿意收好玩具，你可以怎样开口？' },
      { title: '比较陈述和询问', text: 'Can you water the plants? 把 Can 放在句首，是在询问对方。可以回答 Yes, I can. 或 No, I can’t.。表达要符合真实能力。', prompt: '请把“我能浇花”换成向朋友询问能否浇花。' },
      { title: '关注 can 后面的动作', text: 'can 后面直接接动作原形：can help、can clean。即使主语换成 She，仍然说 She can help.，不用 helps。', prompt: 'She can cleans the desk. 里哪个词需要改一改？为什么？' },
    ],
    expressionPrompt: '演一小段家务分工对话：先问一个 Can you ...?，再给出真实回答，最后说出自己能做的一件事。',
    transfer: { text: 'Choose the sentence that asks for a partner’s ability.', options: ['You can clean the desk.', 'Can you clean the desk?', 'She cleans the desk.'], answer: 'Can you clean the desk?', explanation: '问对方能不能做某事，使用 Can you + 动作原形 + ...?。第一句是在陈述，第三句在描述她的行为。' },
  },
  {
    id: 'reading', title: '读懂一家人的小分工', objective: '用人物、动作与结果组织信息，并从原文寻找证据。',
    diagnosticQuestion: '读这段原创短文时，你准备先找人物，还是先猜答案？你可以用什么方法记住每个人做的事？',
    originalPassage: 'It is Saturday. Dad is cooking lunch. Mei sets the table. Her brother puts away the toys. Mei says, “We can help at home.” After lunch, they have time to play together.',
    steps: [
      { title: '先抓整体情境', text: '先读一遍，回答谁在什么时间做事情。短文发生在星期六，一家人正在分工。遇到不懂的词，先联系前后动作，不急着逐字翻译。', prompt: '这段短文主要讲一家人吃什么，还是一家人怎样帮忙？' },
      { title: '给每个人找证据', text: '做一个“人物—动作”小表：Dad 对应 cooking lunch；Mei 对应 sets the table；brother 对应 puts away the toys。答案要能在原文中指给别人看。', prompt: '如果问谁收玩具，你会指向原文哪一句？' },
      { title: '由事实理解意义', text: '最后一句说他们午饭后有时间一起玩。我们可以据此讨论：一起分担事情，会给家庭带来什么？这是基于文本作理解，不是随意猜人物心情。', prompt: '请用中文说出一个事实和一个你由此得到的想法，并区分两者。' },
    ],
    expressionPrompt: '用两句简单英文复述其中两个人做的事，再说说你想加入哪项任务。',
    transfer: { text: 'In this story, who puts away the toys?', options: ['Dad.', 'Mei.', 'Mei’s brother.'], answer: 'Mei’s brother.', explanation: '原文 Her brother puts away the toys. 直接说明动作执行者。Her 指 Mei，因此是 Mei 的兄弟。' },
  },
];

const friendCards: CoachingCard[] = [
  {
    id: 'words', title: '用行为认识朋友的特点', objective: '根据可观察的行为理解性格词，同时尊重人与人的不同。',
    diagnosticQuestion: '介绍朋友时，除了高矮和头发，你还能从哪些事情了解这个人？请举一个行为例子。',
    steps: [
      { title: '特点需要行为来支持', text: '朋友主动帮你搬书，可以用 helpful。说出一个具体行为，别人更容易理解你为什么这样介绍。', prompt: '如果只知道一个人很高，能判断他一定 helpful 吗？为什么？' },
      { title: '不同不等于好坏', text: 'quiet 可以描述安静的表现，active 可以描述积极参与活动的表现。喜欢安静阅读和喜欢运动都可以是朋友的特点，没有谁因此更好。', prompt: '你能分别想出 quiet 和 active 可能出现的一个情境吗？' },
      { title: '把词用于真实介绍', text: '先选一个你能举出证据的特点，再补充事实。例如：Ming is helpful. He carries books for our group. 这是原创示例句。', prompt: '请选择一个特点，用中文说明你会用哪件事作为证据。' },
    ],
    expressionPrompt: '用英文描述朋友的一个特点，再说一个支持它的行为；不要仅凭外貌判断性格。',
    transfer: { text: 'Nora helps a new classmate find the library. Which word fits this action?', options: ['Helpful.', 'Tall.', 'Brown.'], answer: 'Helpful.', explanation: '帮助新同学找到图书馆是具体的助人行为，支持 helpful。tall 是身高，brown 是颜色，都不能概括这件事。' },
  },
  {
    id: 'sentences', title: '把特点、喜好和能力说清楚', objective: '在介绍朋友时区分“是什么样”“喜欢什么”和“能做什么”。',
    diagnosticQuestion: 'She is quiet. 和 She likes reading. 分别告诉了你哪一类信息？它们能互相替代吗？',
    steps: [
      { title: '先决定你要表达哪类信息', text: 'She is kind. 描述特点；She likes drawing. 描述喜好；She can draw. 描述能力。喜欢做某事与能做好某事不是同一条信息。', prompt: '如果你只知道她喜欢画画，能直接断言她画得很好吗？' },
      { title: '观察句子怎样连接', text: 'is 后可以接特点词。likes 后可以接活动，如 reading。can 后接动作原形，如 read。先知道自己要表达的意思，再选句框。', prompt: '表达“他会游泳”时，应选 He is ...、He likes ... 还是 He can ...？' },
      { title: '把两个人放在一起介绍', text: '可以分别说两个人的特点和喜好，再找共同点。原创示例：I like reading. My friend likes running. We help each other. 不需要让朋友和自己完全一样。', prompt: '请说出你和朋友一处不同，再说一件你们能一起做的事。' },
    ],
    expressionPrompt: '用三句英文介绍朋友：一个特点、一项喜好或能力、你们能一起做的一件事。',
    transfer: { text: 'You want to tell us what Leo enjoys. Which sentence does that?', options: ['Leo is tall.', 'Leo likes drawing.', 'Leo can draw a map.'], answer: 'Leo likes drawing.', explanation: 'enjoys 指喜欢做什么。likes drawing 直接表达喜好；is tall 说外貌，can draw a map 说能力。' },
  },
  {
    id: 'reading', title: '不同的朋友怎样相互帮助', objective: '比较人物信息，理解差异与合作，并把推断和原文事实分开。',
    diagnosticQuestion: '两个朋友爱好不同，会不会仍然合作得很好？请带着这个问题读原创短文。',
    originalPassage: 'Nina likes reading. Omar likes running. On Friday, they make a class poster. Nina writes the words. Omar draws the pictures. They listen to each other. The poster is ready, and both friends are happy.',
    steps: [
      { title: '先找相同与不同', text: '先把 Nina 和 Omar 分两栏，记录各自喜欢什么。再找他们一起做的事：制作班级海报。不同爱好与共同任务可以同时存在。', prompt: '他们各自喜欢什么？这次共同的目标是什么？' },
      { title: '把分工与证据对应', text: 'Nina writes the words 是写文字，Omar draws the pictures 是画图。问谁做什么时，回到这些明确的行为句。', prompt: '如果有人说 Omar 写文字，你会用原文哪一句帮他修正？' },
      { title: '由合作过程理解主题', text: 'listen to each other 说明他们愿意听对方的想法。我们可以据此讨论合作为什么顺利，但不能因为 Nina 喜欢阅读就断言她一定安静。', prompt: '哪句话能支持“他们尊重彼此的想法”？哪一种性格判断还缺少证据？' },
    ],
    expressionPrompt: '用两句英文复述分工，再用自己的话说明：不同爱好的朋友怎样一起完成任务？',
    transfer: { text: 'Which sentence is supported by the story?', options: ['Nina and Omar like the same activity.', 'Omar writes all the words.', 'They work together on a poster.'], answer: 'They work together on a poster.', explanation: '两人分别写字、画画，并倾听彼此，共同完成海报。原文明确写了不同爱好，也没有说 Omar 写全部文字。' },
  },
];

function lessonFor(cards: CoachingCard[], bigQuestion: string, goals: string[]): OriginalLesson {
  return {
    goals, diagnosticQuestion: bigQuestion, grounding, cards,
    steps: [
      { title: '把词语放到情境中', text: `${cards[0].steps[0].text}\n${cards[0].steps[1].text}`, prompt: cards[0].steps[1].prompt },
      { title: '比较句子表达的信息', text: `${cards[1].steps[0].text}\n${cards[1].steps[1].text}`, prompt: cards[1].steps[2].prompt },
      { title: '读原创短文，再自己说', text: `原创短文（非课本原文）：\n${cards[2].originalPassage}\n\n${cards[2].steps[1].text}`, prompt: cards[2].expressionPrompt },
    ],
    expressionPrompt: cards[1].expressionPrompt,
    transfer: cards[2].transfer,
  };
}

const lessons: Record<string, OriginalLesson> = {
  'pep-4-upper-revised': lessonFor(helpingCards, '家里有很多事情要做，你能怎样参与，并让家人知道你能帮什么忙？', ['在情境中理解家务动作词组。', '用简单句询问与表达可以做的事。', '读懂人物分工，并用自己的生活例子说明合作。']),
  'pep-5-upper-revised': lessonFor(friendCards, '朋友与我有哪些不同？我们怎样在理解彼此的基础上一起做事？', ['用具体行为支持人物特点。', '区分特点、喜好和能力的表达。', '比较人物信息，读懂分工并尊重差异。']),
};

const unitLists: Record<string, Array<[string, string]>> = {
  'pep-4-upper-revised': [
    ['Helping at home', '家庭分工与帮助'], ['My friends', '认识与理解朋友'], ['Places we live in', '居住环境'],
    ['Helping in the community', '社区互助'], ['The weather and us', '天气与生活'], ['Changing for the seasons', '季节变化与生活调整'],
  ],
  'pep-5-upper-revised': [
    ['Different friends', '朋友的差异与合作'], ['My feelings', '情绪与自我认识'], ['Work and play', '学习与休闲'],
    ['Healthy habits', '健康习惯'], ['Food we eat', '饮食生活'], ['Nature and us', '自然与生活'],
  ],
};

function makeBook(grade: Grade, edition: TextbookEdition): Textbook {
  const id = `pep-${grade}-upper-${edition}`;
  const sourceUrl = `https://www.pep.com.cn/zslth/yyptzy/xypep/${grade}s/`;
  const lesson = lessons[id];
  return {
    id, title: `人教 PEP ${grade === 4 ? '四' : '五'}年级上册（新版）`, grade, term: '上册', series: '人教 PEP 小学英语', edition,
    editionLabel: '新版目录 · 2022 课标修订体系',
    yearNote: '人教社于 2024 年 9 月发布本轮 PEP 新教材简介；本册单元以官网当前资源目录为依据。未以网页年份代替本册版权页的版次或印次。',
    sourceUrl, sourceUrls: [sourceUrl, officialIntroduction],
    electronicTextbookUrl: officialLibrary,
    verifiedAt: '2026-11-18',
    verificationNote: '按已选择的新版上册，以人教 PEP 官网目录组织学习。尚未核对学生实物课本的封面、版权页、印次与页码；讲解具体课文时仍应以实际材料为准。官网电子教材入口可能需要浏览器打开。',
    units: unitLists[id].map(([title, theme], index) => {
      const ready = index === 0;
      return {
        id: `${id}-u${index + 1}`, number: index + 1, title, topic: theme, theme, sourceUrl,
        summary: ready ? '已配置三张教材主题配套原创辅导卡：词汇、句型、阅读。讲解不等同于课本原文。' : '单元目录已核验；本地原创教案尚未配置。可提供课本页或具体问题，再进行有依据的辅导。',
        learningGoals: ready ? lesson.goals : [], guideReady: ready,
        ...(ready ? {
          lesson,
          guide: {
            bigQuestion: lesson.diagnosticQuestion,
            understand: ['先说出已知与困惑。', '读原创示例，并从材料中找事实与依据。'],
            language: lesson.cards.slice(0, 2).map(card => card.objective),
            apply: [lesson.expressionPrompt],
            reflect: ['用自己的话复述一条理解。', '完成一题迁移确认，解释选择依据；需要时回到讲解。'],
          },
        } : {}),
      };
    }),
  };
}

/** The user selected the revised upper-semester books; only those two are exposed. */
export const textbooks: Textbook[] = [makeBook(4, 'revised'), makeBook(5, 'revised')];
export function getTextbook(grade: Grade, edition: TextbookEdition = 'revised'): Textbook | undefined {
  return textbooks.find(book => book.grade === grade && book.edition === edition);
}
export function getTextbookUnit(bookId: string, unitId: string): { book: Textbook; unit: TextbookUnit } | undefined {
  const book = textbooks.find(item => item.id === bookId);
  const unit = book?.units.find(item => item.id === unitId);
  return book && unit ? { book, unit } : undefined;
}
