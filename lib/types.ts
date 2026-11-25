export type Grade = 4 | 5;
export type Phase = "pre" | "practice" | "post" | "delayed";
export type Source = "sample" | "photo" | "generated";
export interface Student {
  id: string;
  name: string;
  grade: Grade;
  avatar: string;
  color: string;
}
export interface Skill {
  id: string;
  name: string;
  grade: Grade;
  description: string;
}
export interface Question {
  id: string;
  version: number;
  grade: Grade;
  unit: string;
  text: string;
  type: "choice" | "fill";
  options: string[];
  answer: string;
  alternatives?: string[];
  caseSensitive?: boolean;
  explanation: string;
  steps: string[];
  skillId: string;
  phase: Phase;
  approved: boolean;
  source: Source;
  passage?: string;
}
export type PublicQuestion = Omit<
  Question,
  "answer" | "alternatives" | "explanation" | "steps"
>;
export interface Scene {
  title: string;
  text: string;
  narration: string;
  highlight?: string;
  image?: string;
  duration?: number;
}
export interface Story {
  id: string;
  grade: Grade;
  title: string;
  subtitle: string;
  description: string;
  cover: string;
  skillIds: string[];
  scenes: Scene[];
  questions: { text: string; options: string[]; answer: string }[];
  source: Source;
}
export interface Attempt {
  id: string;
  studentId: string;
  questionId: string;
  version: number;
  answer: string;
  correct: boolean;
  assisted: boolean;
  phase: Phase;
  createdAt: string;
  sample: boolean;
}
export type JobKind =
  "board" | "story" | "tts" | "explanation" | "variants" | "illustrations";
export interface Job {
  id: string;
  studentId: string;
  kind: JobKind;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  message: string;
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface Feedback {
  attempt: Attempt;
  correct: boolean;
  answer: string;
  explanation: string;
  steps: string[];
  provisional?: boolean;
}
export interface Session {
  studentId: string;
  role: "student" | "teacher";
}
