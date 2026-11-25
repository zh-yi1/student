import type { Grade } from "./types";

export interface ExamResource {
  id: string;
  title: string;
  grade: Grade;
  bookId?: string;
  unitId?: string;
  url: string;
  sourceName: string;
  kind: string;
  edition: string;
  publicationDate: string;
  verifiedAt: string;
  alignmentStatus: "unit-title-matched" | "theme-inferred" | "unmatched";
  alignmentNote: string;
  accessNote: string;
  questionTypes: string[];
  tutoringFocus: string[];
  originalExample: {
    label: "小芽原创平行示例 · 非原卷题目";
    text: string;
    teachingHint: string;
    learnerPrompt: string;
  };
}

// The linked papers were read on the public preview pages. Only provenance and
// concise teaching observations are stored here; no paper, answer key or audio
// is redistributed. A matching topic is not proof of a particular school's exam.
const accessNote =
  "已核验公开网页文字预览；原图、音频和下载附件未核验，下载权限以源站为准。";

export const examResources: ExamResource[] = [
  {
    id: "pep4-revised-unit1-21cnjy-23449047",
    title: "四上 Unit 1 · 家庭与家务单元样卷",
    grade: 4,
    bookId: "pep-4-upper-revised",
    unitId: "pep-4-upper-revised-u1",
    url: "https://zy.21cnjy.com/23449047",
    sourceName: "二一教育 / 21世纪教育网",
    kind: "第三方教学样卷 · 单元卷",
    edition: "人教 PEP 新目录 · Helping at home",
    publicationDate: "2025-07-14",
    verifiedAt: "2026-11-18",
    alignmentStatus: "unit-title-matched",
    alignmentNote:
      "预览明确标注四上 Unit 1 Helping at home，与人教社新目录单元名一致。未核验学校实际使用或逐页覆盖。",
    accessNote,
    questionTypes: ["听力辨词与应答", "语音辨析", "情景对话", "阅读信息定位"],
    tutoringFocus: [
      "先分清问的是谁、职业还是能做的事",
      "把职业和家务词放进完整句子中理解",
      "阅读时找到支持答案的原句，再用自己的话解释",
    ],
    originalExample: {
      label: "小芽原创平行示例 · 非原卷题目",
      text: "My aunt works in a school. She teaches art. On Sunday, I help her water the flowers.",
      teachingHint:
        "先分清职业和周末活动。works in a school 和 teaches art 是职业线索；water the flowers 是帮忙做的事。",
      learnerPrompt: "What does the child do to help? 先说出你找到的线索，再回答。",
    },
  },
  {
    id: "pep5-revised-unit1-21cnjy-26331342",
    title: "五上 Unit 1 · 朋友描写单元样卷",
    grade: 5,
    bookId: "pep-5-upper-revised",
    unitId: "pep-5-upper-revised-u1",
    url: "https://zy.21cnjy.com/26331342",
    sourceName: "二一教育 / 21世纪教育网",
    kind: "第三方教学样卷 · 单元卷",
    edition: "人教 PEP 新目录 · Different friends",
    publicationDate: "2026-08-09",
    verifiedAt: "2026-11-18",
    alignmentStatus: "unit-title-matched",
    alignmentNote:
      "预览明确标注五上 Unit 1 Different friends，与人教社新目录单元名一致。未核验学校实际使用或逐页覆盖。",
    accessNote,
    questionTypes: ["听力理解", "词汇与句型选择", "补全对话", "阅读理解", "人物短文写作"],
    tutoringFocus: [
      "把外貌、性格和能力分开描述",
      "理解 can 后的动词与 be good at 后的表达",
      "先列人物信息，再组织有内容的短文",
    ],
    originalExample: {
      label: "小芽原创平行示例 · 非原卷题目",
      text: "Mia is quiet. She can draw birds. She often makes cards for her classmates.",
      teachingHint:
        "quiet 描述性格，can draw 表达能力。先按‘是什么样的人、能做什么、会做什么事’整理信息。",
      learnerPrompt: "用两句英语介绍你的一位朋友，说一项性格和一项能力。",
    },
  },
];
