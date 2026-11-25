import type { Grade, Phase, Question, Skill, Story, Student } from './types';

// Original demonstration content inspired by primary-school English themes.
// These samples are not represented as questions from a particular PEP edition.
export const students: Student[] = [
  { id: 's1', name: '林小满', grade: 4, avatar: '🌱', color: '#ddf2e4' },
  { id: 's2', name: '陈星宇', grade: 4, avatar: '🚀', color: '#e1ebff' },
  { id: 's3', name: '周可可', grade: 4, avatar: '🌼', color: '#fff0ce' },
  { id: 's4', name: '李沐阳', grade: 5, avatar: '🦊', color: '#ffe8d9' },
  { id: 's5', name: '王子涵', grade: 5, avatar: '🐳', color: '#dff1f8' },
  { id: 's6', name: '赵一诺', grade: 5, avatar: '🍀', color: '#e6e5fb' },
];

export const skills: Skill[] = [
  { id: 'g4-words', grade: 4, name: '教室词汇', description: '认识教室中的常见物品，并理解它们的用途。' },
  { id: 'g4-location', grade: 4, name: '方位表达', description: '区分 in、on、under、near，准确描述物品位置。' },
  { id: 'g4-actions', grade: 4, name: '课堂指令', description: '读懂开关、整理、清洁等简单课堂指令。' },
  { id: 'g4-reading', grade: 4, name: '短文找信息', description: '从教室主题短文中找到人物、数量和位置。' },
  { id: 'g5-appearance', grade: 5, name: '外貌描述', description: '用 tall、short、long 等词描述人物外貌。' },
  { id: 'g5-personality', grade: 5, name: '性格特点', description: '根据行为线索理解 kind、helpful、shy 等词。' },
  { id: 'g5-language', grade: 5, name: 'is / has 运用', description: '区分描述特点的 be 和表达拥有的 have / has。' },
  { id: 'g5-reading', grade: 5, name: '人物阅读', description: '结合人物介绍定位细节，理解简单行为与特点。' },
  { id: 'g4-home-chores', grade: 4, name: '家务动作词组', description: '在家庭分工情境中理解家务动作词组及其对象；用于新版第一单元原创辅导方向，不代表覆盖完整教材词表。' },
  { id: 'g4-can-ability', grade: 4, name: 'can 能力表达', description: '用 I can ...、Can you ...? 表达和询问能做的事，理解 can 后接动作原形；用于新版第一单元原创辅导方向，不代表覆盖完整教材句型。' },
  { id: 'g4-family-evidence', grade: 4, name: '家庭短文证据', description: '从家庭主题短文中对应人物、动作与结果，找到支持回答的原句；用于新版第一单元原创辅导方向，不代表覆盖完整教材阅读要求。' },
  { id: 'g5-interest-ability', grade: 5, name: '喜好与能力表达', description: '介绍朋友时区分特点、喜好和能力，理解 is、likes 与 can 各自表达的信息；用于新版第一单元原创辅导方向，不代表覆盖完整教材句型。' },
];

const classroomA = 'This is our classroom. It has six windows. A blue bag is under a desk. Three red books are on the teacher’s desk. Lily cleans the blackboard. Ben opens the door.';
const classroomB = 'We have a bright classroom. A map is near the window. A green bag is on a chair. A ruler is in the bag. Two boys clean the floor. Amy closes the window. We help together.';
const peopleA = 'Meet our new teacher, Mr Green. He is tall and has short black hair. He is kind. He helps us read new words. His friend Ms May is funny. She tells us stories on Friday.';
const peopleB = 'Mia and Tom are my friends. Mia is short and has long brown hair. She is helpful and carries books for our teacher. Tom is tall and has short hair. He is shy in class, but he likes playing football after school.';

function make(
  grade: Grade, phase: Phase, number: number, skillId: string,
  text: string, answer: string, options: string[], explanation: string,
  steps: string[], passage?: string,
): Question {
  return {
    id: `g${grade}-${phase}-${String(number).padStart(2, '0')}`, version: 1, grade, phase,
    unit: grade === 4 ? 'My classroom · 教室与位置' : 'Meet my friends · 人物与特点',
    skillId, text, answer, options, type: options.length ? 'choice' : 'fill',
    explanation, steps, ...(passage ? { passage } : {}),
    approved: true, source: 'sample', caseSensitive: false,
  };
}

const g4 = (phase: Phase, n: number, skill: string, text: string, answer: string, options: string[], explanation: string, steps: string[], passage?: string) => make(4, phase, n, `g4-${skill}`, text, answer, options, explanation, steps, passage);
const g5 = (phase: Phase, n: number, skill: string, text: string, answer: string, options: string[], explanation: string, steps: string[], passage?: string) => make(5, phase, n, `g5-${skill}`, text, answer, options, explanation, steps, passage);

export const questions: Question[] = [
  g4('pre', 1, 'words', 'We write with chalk on the ___.', 'blackboard', ['blackboard', 'floor', 'window', 'door'], 'chalk 是粉笔。用粉笔书写的地方是 blackboard（黑板）。', ['找出用途线索 write with chalk（用粉笔写）。', '把物品与用途对应：blackboard 是黑板。', '代入句子：We write with chalk on the blackboard.']),
  g4('pre', 2, 'words', 'Which one is a place for the teacher’s books?', 'teacher’s desk', ['window', 'teacher’s desk', 'fan', 'wall'], 'teacher’s desk 是讲台或老师的书桌，可以放老师的书。', ['先看题目中的 teacher’s books。', 'desk 表示书桌，teacher’s 说明它属于老师。', '选择 teacher’s desk，检查是否符合放书的场景。']),
  g4('pre', 3, 'location', 'The book is resting on top of the desk. It is ___ the desk.', 'on', ['under', 'in', 'on', 'near'], 'on top of 表示在上面并接触表面，对应 on。', ['找到位置线索 on top of。', 'on 表示在表面上，under 表示在下面。', '读一遍完整表达：on the desk。']),
  g4('pre', 4, 'location', 'The cat is below the chair. It is ___ the chair.', 'under', ['on', 'near', 'in', 'under'], 'below 表示在下方。本题应用 under the chair。', ['找到 below the chair（椅子下方）。', '将 below 与方位词 under 对应。', '代入检查：The cat is under the chair.']),
  g4('pre', 5, 'actions', 'It is hot. Please ___ the door to let air in.', 'open', ['clean', 'open', 'draw', 'read'], '让空气进来需要打开门，所以用 open。', ['理解 let air in 是让空气进来。', 'open the door 表示开门。', '选择 open，检查动作与场景是否一致。']),
  g4('pre', 6, 'actions', 'There is old writing on the blackboard. Let’s ___ it.', 'clean', ['close', 'sit', 'clean', 'open'], '要去掉黑板上的旧字，需要 clean（擦干净）。', ['定位 old writing（旧的板书）。', 'clean 表示清洁，符合擦黑板的动作。', '连起来读：Let’s clean it.']),
  g4('pre', 7, 'reading', 'How many windows are in the classroom?', 'Six.', ['Three.', 'Four.', 'Five.', 'Six.'], '短文直接写着 It has six windows，所以有六扇窗户。', ['圈出问题关键词 how many windows。', '回到短文找到 six windows。', '选择 Six.，不要把书的数量当成窗户数量。'], classroomA),
  g4('pre', 8, 'reading', 'Where are the red books?', 'On the teacher’s desk.', ['Under a desk.', 'On the teacher’s desk.', 'Near the door.', 'In the blue bag.'], '短文说 Three red books are on the teacher’s desk，红书在老师的书桌上。', ['先找 red books。', '沿着同一句找到位置 on the teacher’s desk。', '选择完整对应的位置，注意不是蓝书包的位置。'], classroomA),

  g4('practice', 1, 'words', 'We go into the classroom through the ___.', 'door', ['fan', 'wall', 'door', 'light'], 'through 表示穿过；我们通过门进入教室。', ['读懂 go into the classroom（进入教室）。', '判断能让人进出的物品是 door。', '完整读句，确认 through the door 搭配正确。']),
  g4('practice', 2, 'words', 'We can see the playground through the ___.', 'window', ['floor', 'window', 'desk', 'bag'], '透过窗户可以看到操场，window 表示窗户。', ['注意 see the playground（看见操场）。', '把 through 与可透视的窗户联系起来。', '选择 window，再读完整句子。']),
  g4('practice', 3, 'words', 'The ___ moves air and keeps us cool.', 'fan', ['fan', 'picture', 'door', 'book'], 'fan 是风扇，能带动空气，让人感觉凉快。', ['找出 moves air（让空气流动）。', '找出 keeps us cool（使我们凉快）。', '两个用途都对应 fan。']),
  g4('practice', 4, 'words', 'It is dark. Turn on the ___.', 'light', [], '光线暗时要开灯，light 在这里指灯。', ['理解 It is dark（天色或光线暗）。', 'turn on 表示打开电器，结合场景想到灯。', '填入 light，检查拼写 l-i-g-h-t。']),
  g4('practice', 5, 'location', 'The pencils are inside the box. They are ___ the box.', 'in', ['near', 'on', 'under', 'in'], 'inside 表示在内部，与 in 含义一致。', ['找到 inside the box。', 'in 表示在里面，不能换成 on。', '代入：The pencils are in the box.']),
  g4('practice', 6, 'location', 'My desk is close to the door. It is ___ the door.', 'near', ['under', 'near', 'in', 'on'], 'close to 表示靠近，用 near 描述两个物体相距不远。', ['找到 close to（靠近）。', 'near 表示在附近，不表示接触表面。', '完整读出 near the door。']),
  g4('practice', 7, 'location', 'A cup is resting on top of a table. The cup is ___ the table.', 'on', [], '杯子放在桌子表面上，应该用 on。', ['看清杯子与桌面接触的位置关系。', 'on top of 可用 on 来表达。', '填 on，读完整短语 on the table。']),
  g4('practice', 8, 'location', 'The ball is below the bed. The ball is ___ the bed.', 'under', [], '床的下方是 under the bed。', ['找到 below the bed 这一提示。', '选择表示在下面的方位词 under。', '检查拼写 u-n-d-e-r，再读整句。']),
  g4('practice', 9, 'actions', 'Please ___ the window. It is cold outside.', 'close', ['read', 'close', 'write', 'draw'], '外面冷时，可以把窗户关上。close the window 表示关窗。', ['先理解 cold outside（外面冷）。', '关窗用 close the window。', '选 close，确认动作符合场景。']),
  g4('practice', 10, 'actions', 'The classroom is dark. Please ___ the lights.', 'turn on', ['sit down', 'turn on', 'stand up', 'look at'], '教室里暗，需要 turn on the lights（开灯）。', ['定位 dark（暗）。', 'lights 是灯，turn on 表示打开。', '把 turn on the lights 连起来读。']),
  g4('practice', 11, 'actions', 'There is dust on the desks. Let’s ___ the desks.', 'clean', [], 'dust 是灰尘。桌上有灰尘，需要 clean the desks。', ['找到 dust on the desks（桌上的灰尘）。', '判断需要做清洁动作，用 clean。', '填入 clean，检查完整句意。']),
  g4('practice', 12, 'actions', 'Your books are on the floor. Please ___ them on the desk.', 'put', ['open', 'put', 'close', 'sing'], 'put ... on ... 表示把某物放到某处。这里应把书放在桌上。', ['them 指的是前句的 books。', 'put them on the desk 表示把它们放在桌上。', '选择 put，检查动作对象是书。']),
  g4('practice', 13, 'reading', 'Where is the blue bag?', 'Under a desk.', ['On a chair.', 'Near the window.', 'Under a desk.', 'On the blackboard.'], 'A blue bag is under a desk 说明蓝书包在一张桌子下面。', ['找关键词 blue bag。', '在同一句中定位 under a desk。', '选择对应位置，注意 under 与 on 的区别。'], classroomA),
  g4('practice', 14, 'reading', 'What colour is the bag in this classroom?', 'Blue.', ['Red.', 'Blue.', 'Green.', 'Yellow.'], '短文中的书包是 a blue bag，所以颜色为 blue。', ['问题问的是 bag 的颜色。', '在 bag 前找到形容词 blue。', '选择 Blue.，不要把红书的颜色混入。'], classroomA),
  g4('practice', 15, 'reading', 'Where is the map?', 'Near the window.', ['Under a desk.', 'In the bag.', 'On the floor.', 'Near the window.'], 'A map is near the window 说明地图在窗户附近。', ['圈出 map。', '回到短文找到地图所在的句子。', '读取 near the window 并选择对应答案。'], classroomB),
  g4('practice', 16, 'reading', 'What is in the bag?', 'A ruler.', ['A ruler.', 'A map.', 'A chair.', 'A window.'], '短文写着 A ruler is in the bag，袋里有一把尺子。', ['题目询问袋子里的物品。', '找到 in the bag 所在的句子。', '读出句子的主语 A ruler，选出答案。'], classroomB),

  g4('post', 1, 'words', 'The picture hangs on the classroom ___.', 'wall', ['light', 'wall', 'fan', 'bag'], '图片挂在教室的墙上，wall 表示墙。', ['找到 hangs on（挂在……上）。', '判断适合挂图片的地方是墙。', '选择 wall，读出 on the classroom wall。']),
  g4('post', 2, 'words', 'We walk on the classroom ___.', 'floor', ['ceiling', 'window', 'floor', 'blackboard'], '我们在教室地面上行走，floor 表示地面或地板。', ['找到 walk on（在……上行走）。', '根据日常场景选择 floor。', '检查 floor 与 ceiling（天花板）的区别。']),
  g4('post', 3, 'location', 'The plant is close to the window. It is ___ the window.', 'near', ['in', 'under', 'on', 'near'], 'close to 可以换成 near，表示植物靠近窗户。', ['找到 close to the window。', '判断描述的是距离近，而非在里面。', '用 near 补全句子。']),
  g4('post', 4, 'location', 'The keys are inside my schoolbag. They are ___ my schoolbag.', 'in', [], '钥匙在书包内部，用 in my schoolbag。', ['注意 inside 是在里面。', '选择相同含义的方位词 in。', '填入 in，并确认没有误用 on。']),
  g4('post', 5, 'actions', 'It is time to leave. Please ___ the lights.', 'turn off', ['turn off', 'turn on', 'write on', 'read aloud'], '离开教室时应关灯，turn off the lights 表示关灯。', ['理解 time to leave（该离开了）。', 'turn off 表示关闭电器。', '选择 turn off，确认与 turn on 区分。']),
  g4('post', 6, 'actions', 'The door is shut. To come in, please ___ it.', 'open', [], '门关着，想进来需要 open it（打开它）。', ['shut 表示关着，it 指代 door。', '为了 come in，需要开门。', '填 open，并读完整句子。']),
  g4('post', 7, 'reading', 'Who cleans the floor?', 'Two boys.', ['Amy.', 'Two boys.', 'The teacher.', 'Lily.'], 'Two boys clean the floor 说明是两个男孩清洁地面。', ['问题中的 Who 要求找人物。', '定位 clean the floor 所在句。', '读取主语 Two boys，选出答案。'], classroomB),
  g4('post', 8, 'reading', 'What colour is the bag on the chair?', 'Green.', ['Blue.', 'Black.', 'Green.', 'Red.'], 'A green bag is on a chair 说明椅子上的书包是绿色的。', ['将 bag 和 chair 两个线索一起定位。', '在同一句找到 green。', '选择 Green.，避免套用其他短文的颜色。'], classroomB),

  g4('delayed', 1, 'words', 'We draw a ___ of our classroom and hang it up.', 'picture', ['fan', 'picture', 'door', 'floor'], 'draw a picture 表示画一幅画；画好后可以挂起来。', ['找出 draw（画）和 hang it up（挂起来）。', 'picture 同时符合这两个动作。', '选择 picture，读出 draw a picture。']),
  g4('delayed', 2, 'words', 'We type on the keyboard of a ___.', 'computer', ['chair', 'window', 'computer', 'wall'], 'keyboard 是键盘，通常是电脑的一部分。', ['圈出 keyboard（键盘）。', '把键盘与 computer（电脑）对应。', '检查整句：在电脑键盘上打字。']),
  g4('delayed', 3, 'location', 'The shoes are below the bench. They are ___ the bench.', 'under', ['on', 'in', 'near', 'under'], 'below the bench 表示长凳下方，对应 under the bench。', ['找到 below 这个位置提示。', '选择表示下方的 under。', '读完整句，确认没有误用在表面上的 on。']),
  g4('delayed', 4, 'location', 'The notebook rests on top of the chair. It is ___ the chair.', 'on', [], '笔记本放在椅子的表面上，应用 on。', ['理解 on top of（在上面）。', '此处与椅面接触，使用 on。', '填 on，检查句意与提示相同。']),
  g4('delayed', 5, 'actions', 'Rain is coming through the open window. Please ___ it.', 'close', ['draw', 'read', 'close', 'clean'], '雨从开着的窗户进来，需要 close it（关上它）。', ['it 指代前面的 window。', '根据雨水进入的场景判断要关窗。', '选择 close，读出 close the window。']),
  g4('delayed', 6, 'actions', 'There are dirty marks on the wall. Let’s ___ the wall.', 'clean', [], '墙上有脏印，需要 clean the wall（清洁墙面）。', ['dirty marks 表示脏印。', '匹配动作 clean（清洁）。', '填入 clean，检查 c-l-e-a-n 的拼写。']),
  g4('delayed', 7, 'reading', 'Who cleans the blackboard?', 'Lily.', ['Ben.', 'Amy.', 'Lily.', 'Mr Green.'], '短文明确写道 Lily cleans the blackboard，所以答案是 Lily。', ['题目询问擦黑板的人。', '找到 cleans the blackboard。', '读取动作前的人名 Lily。'], classroomA),
  g4('delayed', 8, 'reading', 'How many boys clean the floor?', 'Two.', ['One.', 'Two.', 'Three.', 'Six.'], '短文中的 Two boys 表示两个男孩。', ['圈出 how many boys，确认问数量。', '定位 Two boys clean the floor。', '选择 Two.，不要选窗户或书的数量。'], classroomB),

  g5('pre', 1, 'appearance', 'Ben is 170 cm. Leo is 130 cm. Ben is ___, and Leo is short.', 'tall', ['tall', 'young', 'funny', 'kind'], '身高较高的 Ben 与 short 对应，应用 tall。', ['题目比较的是身高。', 'tall 与 short 是一组高矮反义词。', '选择 tall，检查与给定身高关系一致。']),
  g5('pre', 2, 'appearance', 'Mia’s hair does not reach her ears. Her hair is ___.', 'short', ['long', 'short', 'kind', 'tall'], '头发未到耳朵，表示头发短，应选 short。', ['确认描述对象是 hair。', 'does not reach her ears 提示头发长度短。', '选择 short，区分人物身高与头发长度。']),
  g5('pre', 3, 'personality', 'Sam helps a new pupil find the classroom. Sam is ___.', 'helpful', ['sleepy', 'helpful', 'tall', 'old'], 'helpful 表示乐于助人。帮助新同学找教室正符合这一特点。', ['找到 helps a new pupil 这一行为。', '将帮助他人的行为与 helpful 对应。', '选择 helpful，确认描述的是性格。']),
  g5('pre', 4, 'personality', 'Our teacher tells jokes and makes us laugh. She is ___.', 'funny', ['strict', 'short', 'funny', 'shy'], 'tells jokes 和 makes us laugh 都指向 funny（有趣、逗人笑的）。', ['圈出 tells jokes（讲笑话）。', '再看 makes us laugh（笑起来）。', '两条线索共同支持 funny。']),
  g5('pre', 5, 'language', 'My brother ___ tall.', 'is', ['has', 'have', 'are', 'is'], 'tall 是形容词，用 be 动词连接；My brother 是第三人称单数，用 is。', ['tall 描述特点，不表示拥有物品。', 'My brother 是一个人，属于第三人称单数。', '填 is：My brother is tall.']),
  g5('pre', 6, 'language', 'She ___ long hair.', 'has', [], 'long hair 是她拥有的外貌特征。主语 She 对应 has。', ['空格后是名词短语 long hair。', '表达拥有用 have / has。', 'She 是第三人称单数，所以填 has。']),
  g5('pre', 7, 'reading', 'What does Mr Green look like?', 'He is tall.', ['He is short.', 'He is tall.', 'He has long hair.', 'He has brown hair.'], '短文说 Mr Green is tall，其他外貌选项与短文不符。', ['问题问 look like，关注外貌。', '定位 Mr Green 的外貌描述。', '选择 He is tall.，不把性格当成外貌。'], peopleA),
  g5('pre', 8, 'reading', 'Who tells the pupils stories?', 'Ms May.', ['Mr Green.', 'Tom.', 'Mia.', 'Ms May.'], 'She tells us stories 中的 She 指的是前一句的 Ms May。', ['定位 tells us stories。', '回看上一句，确认 She 指向 Ms May。', '选择 Ms May.，检查人物对应。'], peopleA),

  g5('practice', 1, 'appearance', 'Amy’s hair reaches her shoulders. She has ___ hair.', 'long', ['tall', 'long', 'helpful', 'strict'], '头发长到肩膀，可以用 long hair 描述。', ['找到 reaches her shoulders（到达肩膀）。', 'hair 的长度用 long 或 short。', '根据线索选择 long。']),
  g5('practice', 2, 'appearance', 'Which word is the opposite of “tall”?', 'short', ['kind', 'strong', 'short', 'young'], '描述身高时，tall（高的）的反义词是 short（矮的）。', ['opposite 要求找反义词。', '确认 tall 的含义是高的。', '选择表示矮的 short。']),
  g5('practice', 3, 'appearance', 'My baby sister has two big, round ___. She uses them to see.', 'eyes', ['hands', 'eyes', 'ears', 'feet'], '用来看东西的身体部位是 eyes（眼睛）。', ['找到用途线索 uses them to see。', '眼睛对应 eyes，耳朵用于听。', '选择 eyes，检查 two 后用复数。']),
  g5('practice', 4, 'appearance', 'My grandpa has white ___. He combs it every morning.', 'hair', [], 'comb 是梳理。爷爷每天梳理的白色外貌特征是 hair（头发）。', ['找到 combs it（梳理它）。', '结合 white 判断此处描述头发。', '填 hair，注意 hair 在这里不加 s。']),
  g5('practice', 5, 'personality', 'Nina feels nervous and speaks quietly to new people. She is ___.', 'shy', ['funny', 'shy', 'tall', 'strong'], '面对陌生人紧张、小声说话，符合 shy（害羞的）这一描述。', ['定位 nervous（紧张的）。', '结合 speaks quietly to new people。', '选择 shy，描述该场景中的表现。']),
  g5('practice', 6, 'personality', 'Mr Li asks us to follow every class rule. He is ___.', 'strict', ['short', 'funny', 'strict', 'young'], 'strict 表示严格的。要求遵守每条课堂规则符合这一特点。', ['理解 follow every class rule（遵守每条课堂规则）。', '判断这里描述老师的要求与做事方式。', '选择 strict，而非外貌形容词。']),
  g5('practice', 7, 'personality', 'Lily shares her umbrella with a classmate in the rain. She is ___.', 'kind', ['kind', 'tall', 'old', 'short'], '主动与同学分享雨伞，体现 kind（友善的、体贴的）。', ['找出 shares her umbrella（分享雨伞）。', '结合 in the rain 理解她在照顾别人。', '选择 kind，与行为线索对应。']),
  g5('practice', 8, 'personality', 'Mark studies carefully and practises every day. He is ___.', 'hard-working', ['shy', 'funny', 'hard-working', 'tall'], '认真学习并每天练习，体现 hard-working（勤奋的）。', ['圈出 studies carefully（认真学习）。', '再看 practises every day（每天练习）。', '选择能概括这两种行为的 hard-working。']),
  g5('practice', 9, 'language', 'He ___ very kind.', 'is', ['has', 'are', 'is', 'have'], 'kind 是形容词；主语 He 后用 is 来描述特点。', ['判断 kind 描述性格。', '性格形容词前使用 be 动词。', 'He 对应 is，选出正确形式。']),
  g5('practice', 10, 'language', 'Tom ___ two big eyes.', 'has', ['is', 'has', 'are', 'am'], 'two big eyes 是名词短语，表示拥有；Tom 是第三人称单数，用 has。', ['看空格后的 two big eyes。', '表达拥有某个外貌特征用 has。', '代入：Tom has two big eyes.']),
  g5('practice', 11, 'language', 'They ___ helpful.', 'are', [], 'They 是复数主语，描述特点 helpful 时使用 are。', ['helpful 是形容词，需要 be 动词。', 'They 表示他们，不用单数 is。', '填 are：They are helpful.']),
  g5('practice', 12, 'language', 'I ___ short black hair.', 'have', [], 'I 后表示拥有用 have，不能用 has。', ['short black hair 是名词短语。', '确定这里表达拥有头发这一特征。', '主语 I 对应 have，填入并读整句。']),
  g5('practice', 13, 'reading', 'What colour is Mr Green’s hair?', 'Black.', ['Brown.', 'White.', 'Black.', 'Red.'], '短文描述 Mr Green has short black hair，所以头发是黑色的。', ['问题只问头发颜色。', '找到 short black hair。', '提取颜色词 black，忽略长度词 short。'], peopleA),
  g5('practice', 14, 'reading', 'When does Ms May tell stories?', 'On Friday.', ['On Monday.', 'On Friday.', 'On Sunday.', 'Every morning.'], '短文最后一句给出时间 on Friday。', ['When 询问时间。', '定位 Ms May tells stories 对应的句子。', '读取 on Friday，选择正确时间。'], peopleA),
  g5('practice', 15, 'reading', 'Who carries books for the teacher?', 'Mia.', ['Tom.', 'Mr Green.', 'Ms May.', 'Mia.'], 'Mia is helpful and carries books for our teacher 说明帮老师拿书的是 Mia。', ['定位 carries books。', '回看 She 的指代对象 Mia。', '选择 Mia.，确认人物与行为对应。'], peopleB),
  g5('practice', 16, 'reading', 'What does Tom like doing after school?', 'Playing football.', ['Reading stories.', 'Playing football.', 'Drawing pictures.', 'Carrying books.'], '短文说 Tom likes playing football after school。', ['找出 after school 这一时间线索。', '读取相应行为 playing football。', '选择 Playing football.，不要混入 Mia 的行为。'], peopleB),

  g5('post', 1, 'appearance', 'Ava is 165 cm. May is 125 cm. May is ___, and Ava is tall.', 'short', ['kind', 'long', 'short', 'funny'], '这里比较身高。May 相比 Ava 较矮，因此用 short。', ['确认数值描述的是身高。', '将 May 与 Ava 比较，May 较矮。', '选择 short，与后面的 tall 对应。']),
  g5('post', 2, 'appearance', 'Which sentence describes someone’s hair?', 'She has long brown hair.', ['She is kind.', 'She has long brown hair.', 'She is helpful.', 'She likes music.'], 'long brown hair 说明头发的长度和颜色，属于外貌描述。', ['题目要求找到关于 hair 的描述。', 'long 是长度，brown 是颜色。', '选择包含完整头发描述的句子。']),
  g5('post', 3, 'personality', 'Kai helps me carry a heavy box. He is ___.', 'helpful', ['helpful', 'shy', 'short', 'old'], '帮助搬重箱子体现 helpful（乐于助人）。', ['找到 helps me carry（帮我搬）。', '将帮助他人的行为与 helpful 对应。', '选择 helpful，确认词义符合场景。']),
  g5('post', 4, 'personality', 'Eva tells a silly story. Everyone laughs. Eva is ___.', 'funny', ['strict', 'tall', 'young', 'funny'], '讲有趣的故事让大家发笑，可以用 funny 描述。', ['读懂 Everyone laughs（大家都笑了）。', '结合 tells a silly story 判断特点。', '选择 funny，不要选择无关的身高词。']),
  g5('post', 5, 'language', 'Our new teacher ___ friendly.', 'is', ['are', 'have', 'is', 'has'], 'friendly 描述性格，单数主语 Our new teacher 后用 is。', ['friendly 是形容词，需要 be 动词。', 'Our new teacher 指一位老师。', '选择单数形式 is。']),
  g5('post', 6, 'language', 'My friend ___ short brown hair.', 'has', [], 'My friend 是第三人称单数，表达拥有短棕发用 has。', ['确定空格后是名词短语 short brown hair。', '这里需要表达拥有。', 'My friend 是单数，填 has。']),
  g5('post', 7, 'reading', 'What is Mia’s hair like?', 'Long and brown.', ['Short and black.', 'Long and brown.', 'Short and white.', 'Long and black.'], '短文介绍 Mia has long brown hair，所以是棕色长发。', ['先定位 Mia 的外貌句。', '分别提取长度 long 和颜色 brown。', '选择同时符合两条信息的答案。'], peopleB),
  g5('post', 8, 'reading', 'How does Tom behave in class?', 'He is shy.', ['He is funny.', 'He is strict.', 'He is shy.', 'He is angry.'], '短文直接写着 He is shy in class，He 指 Tom。', ['问题限定场景 in class。', '找到对应句，确认 He 指代 Tom。', '选择 He is shy.，区分课堂表现与课后爱好。'], peopleB),

  g5('delayed', 1, 'appearance', 'Which pair of words describes height?', 'Tall and short.', ['Kind and helpful.', 'Tall and short.', 'Funny and shy.', 'Black and brown.'], 'height 是身高。tall 和 short 描述高矮。', ['先理解 height（身高）。', '排除性格词和颜色词。', '选择 Tall and short.，对应高与矮。']),
  g5('delayed', 2, 'appearance', 'Sara has hair down to her back. She has ___ hair.', 'long', [], '头发长到背部，可用 long hair 描述。', ['找到 down to her back（长到背部）。', '判断此处需要描述头发长度。', '填 long，检查与 hair 的搭配。']),
  g5('delayed', 3, 'personality', 'Owen speaks very quietly when he meets a new class. He is ___.', 'shy', ['tall', 'funny', 'shy', 'strong'], '在新班级里说话很小声，与 shy（害羞的）这一场景描述相符。', ['注意 meets a new class（遇到新班级）。', '结合 speaks very quietly（说话很小声）。', '选择 shy，概括题目中的表现。']),
  g5('delayed', 4, 'personality', 'Miss Wu checks that everyone follows the rules. She is ___.', 'strict', ['young', 'strict', 'short', 'funny'], '检查每个人是否遵守规则，体现 strict（严格的）。', ['找出 follows the rules（遵守规则）。', '注意老师会逐一检查。', '选择 strict，匹配做事要求。']),
  g5('delayed', 5, 'language', 'My sisters ___ kind.', 'are', ['has', 'is', 'are', 'am'], 'My sisters 是复数主语，kind 前用 are。', ['sisters 的 s 表明不止一个姐姐或妹妹。', 'kind 是特点，使用 be 动词。', '复数主语搭配 are。']),
  g5('delayed', 6, 'language', 'We ___ brown eyes.', 'have', [], 'We 是复数主语，表示拥有棕色眼睛用 have。', ['brown eyes 是名词短语。', '表达拥有用 have / has。', 'We 对应 have，填入后读整句。']),
  g5('delayed', 7, 'reading', 'What does Mr Green help the pupils do?', 'Read new words.', ['Play football.', 'Carry a box.', 'Read new words.', 'Close the door.'], 'He helps us read new words 中 He 指 Mr Green，帮助内容是读新单词。', ['问题寻找 help 后面的动作。', '找到 He helps us read new words。', '提取 Read new words.，选择对应答案。'], peopleA),
  g5('delayed', 8, 'reading', 'Which sentence about Mia is true?', 'She is short and helpful.', ['She is tall and shy.', 'She has short black hair.', 'She likes football.', 'She is short and helpful.'], '短文分别说明 Mia is short 和 She is helpful，两条信息均支持正确选项。', ['先定位 Mia，避免混入 Tom 的信息。', '核对身高 short 与性格 helpful。', '选择两项细节都与原文一致的句子。'], peopleB),
];

export const stories: Story[] = [
  {
    id: 'story4', grade: 4, title: '小书包在哪里？', subtitle: 'Where Is My Little Bag?',
    description: '和 Lily 一起寻找蓝色小书包，在教室里练习 on、under、in 和 near。原创演示绘本，待机构审核。',
    cover: '/story-4-1.svg', skillIds: ['g4-words', 'g4-location', 'g4-actions', 'g4-reading'], source: 'sample',
    scenes: [
      { title: '早上好，教室', text: 'Good morning! I am Lily. This is our bright classroom.', narration: 'Good morning! I am Lily. This is our bright classroom.', highlight: 'classroom', image: '/story-4-1.svg', duration: 6 },
      { title: '桌子上有什么', text: 'My book is on the desk. But where is my blue bag?', narration: 'My book is on the desk. But where is my blue bag?', highlight: 'on the desk', image: '/story-4-2.svg', duration: 7 },
      { title: '看看椅子下面', text: 'Is it under the chair? No. A little ball is under the chair.', narration: 'Is it under the chair? No. A little ball is under the chair.', highlight: 'under the chair', image: '/story-4-3.svg', duration: 8 },
      { title: '窗边的发现', text: 'Look near the window! My blue bag is on a small table.', narration: 'Look near the window! My blue bag is on a small table.', highlight: 'near the window', image: '/story-4-4.svg', duration: 7 },
      { title: '打开小书包', text: 'I open my bag. My pencil box and ruler are in the bag.', narration: 'I open my bag. My pencil box and ruler are in the bag.', highlight: 'in the bag', image: '/story-4-5.svg', duration: 7 },
      { title: '一起准备好', text: 'I put my bag under my desk. We clean the classroom. Now we are ready!', narration: 'I put my bag under my desk. We clean the classroom. Now we are ready!', highlight: 'under my desk', image: '/story-4-6.svg', duration: 8 },
    ],
    questions: [
      { text: 'Where does Lily find her blue bag?', options: ['On a small table.', 'Under the chair.', 'In a box.'], answer: 'On a small table.' },
      { text: 'What is under the chair?', options: ['A book.', 'A little ball.', 'A ruler.'], answer: 'A little ball.' },
      { text: 'What is in the bag?', options: ['A ball and a book.', 'A pencil box and a ruler.', 'A fan and a light.'], answer: 'A pencil box and a ruler.' },
    ],
  },
  {
    id: 'story5', grade: 5, title: '花园里的新朋友', subtitle: 'A New Friend in the Garden',
    description: '认识 Lily 和 Ben，用外貌与性格词介绍朋友，在一段互相帮助的小故事中理解 kind 与 helpful。原创演示绘本，待机构审核。',
    cover: '/story-5-1.svg', skillIds: ['g5-appearance', 'g5-personality', 'g5-language', 'g5-reading'], source: 'sample',
    scenes: [
      { title: '花园里的初次见面', text: 'I am Lily. Today I meet Ben in the school garden. He is my new classmate.', narration: 'I am Lily. Today I meet Ben in the school garden. He is my new classmate.', highlight: 'new classmate', image: '/story-5-1.svg', duration: 8 },
      { title: '认识 Ben', text: 'Ben is tall. He has short black hair and big brown eyes.', narration: 'Ben is tall. He has short black hair and big brown eyes.', highlight: 'He has', image: '/story-5-2.svg', duration: 7 },
      { title: '轻轻的一声你好', text: 'Ben is shy. He smiles and says a quiet hello. I smile, too.', narration: 'Ben is shy. He smiles and says a quiet hello. I smile, too.', highlight: 'shy', image: '/story-5-3.svg', duration: 7 },
      { title: '一起帮忙', text: 'Our teacher has a heavy box of books. Ben helps her carry it. He is helpful.', narration: 'Our teacher has a heavy box of books. Ben helps her carry it. He is helpful.', highlight: 'helpful', image: '/story-5-4.svg', duration: 8 },
      { title: '分享一把雨伞', text: 'Oh, it is raining! Ben shares his umbrella with me. He is kind.', narration: 'Oh, it is raining! Ben shares his umbrella with me. He is kind.', highlight: 'kind', image: '/story-5-5.svg', duration: 7 },
      { title: '这是我的新朋友', text: 'This is my friend Ben. He is tall, shy, helpful and kind. We walk to class together.', narration: 'This is my friend Ben. He is tall, shy, helpful and kind. We walk to class together.', highlight: 'my friend', image: '/story-5-6.svg', duration: 8 },
    ],
    questions: [
      { text: 'What is Ben’s hair like?', options: ['Long and brown.', 'Short and black.', 'Long and white.'], answer: 'Short and black.' },
      { text: 'Why is Ben helpful?', options: ['He is tall.', 'He has brown eyes.', 'He helps carry the books.'], answer: 'He helps carry the books.' },
      { text: 'What does Ben share with Lily?', options: ['His umbrella.', 'His ruler.', 'His schoolbag.'], answer: 'His umbrella.' },
    ],
  },
];
