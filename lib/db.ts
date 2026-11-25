import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { students, skills, questions, stories } from './curriculum';
import type { Job, JobKind, Question } from './types';

export { students, skills, stories };
let database: DatabaseSync | undefined;
let databasePath = '';
const now = () => new Date().toISOString();

export function closeDb(): void { database?.close(); database = undefined; databasePath = ''; }

export function getDb(): DatabaseSync {
  const path = process.env.DEMO_DB_PATH || join(process.cwd(), 'data', 'local.db');
  if (database && databasePath === path) return database;
  if (database) database.close();
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  database = new DatabaseSync(path);
  databasePath = path;
  database.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS questions (id TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(id,version));
    CREATE TABLE IF NOT EXISTS question_owners (question_id TEXT PRIMARY KEY,student_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS review_sources (question_id TEXT PRIMARY KEY,source_question_id TEXT NOT NULL,source_version INTEGER NOT NULL,assessment_id TEXT NOT NULL,student_id TEXT NOT NULL,attempt_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, student_id TEXT NOT NULL, question_id TEXT NOT NULL, version INTEGER NOT NULL, answer TEXT NOT NULL, correct INTEGER NOT NULL, assisted INTEGER NOT NULL, phase TEXT NOT NULL, created_at TEXT NOT NULL, sample INTEGER NOT NULL DEFAULT 0, provisional INTEGER NOT NULL DEFAULT 0, assessment_id TEXT);
    CREATE INDEX IF NOT EXISTS attempt_student ON attempts(student_id, created_at);
    CREATE TABLE IF NOT EXISTS reviews (student_id TEXT NOT NULL, question_id TEXT NOT NULL, attempt_id TEXT NOT NULL, stage INTEGER NOT NULL DEFAULT 0, due_at TEXT NOT NULL, corrected_at TEXT, resolved INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(student_id,question_id));
    CREATE TABLE IF NOT EXISTS reading_attempts (id TEXT PRIMARY KEY,student_id TEXT NOT NULL,story_id TEXT NOT NULL,answers TEXT NOT NULL,result TEXT NOT NULL,score INTEGER NOT NULL,total INTEGER NOT NULL,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS reading_student ON reading_attempts(student_id,created_at);
    CREATE TABLE IF NOT EXISTS coaching_sessions (id TEXT PRIMARY KEY,student_id TEXT NOT NULL,book_id TEXT NOT NULL,unit_id TEXT NOT NULL,intent TEXT NOT NULL,topic TEXT NOT NULL,context TEXT NOT NULL,state TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',stage TEXT NOT NULL DEFAULT 'diagnose',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,completed_at TEXT);
    CREATE INDEX IF NOT EXISTS coaching_student ON coaching_sessions(student_id,updated_at);
    CREATE TABLE IF NOT EXISTS coaching_messages (id TEXT PRIMARY KEY,session_id TEXT NOT NULL,student_id TEXT NOT NULL,role TEXT NOT NULL,stage TEXT NOT NULL,text TEXT NOT NULL,source TEXT NOT NULL,request_id TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(session_id) REFERENCES coaching_sessions(id),UNIQUE(session_id,request_id,role));
    CREATE TABLE IF NOT EXISTS assessments (id TEXT PRIMARY KEY, student_id TEXT NOT NULL, phase TEXT NOT NULL, questions TEXT NOT NULL, created_at TEXT NOT NULL, completed_at TEXT, result TEXT, cancelled INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, student_id TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0, message TEXT NOT NULL DEFAULT '', input TEXT NOT NULL, result TEXT, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS job_queue ON jobs(status,created_at);
    CREATE TABLE IF NOT EXISTS usage (id TEXT PRIMARY KEY, student_id TEXT NOT NULL, kind TEXT NOT NULL, estimated REAL NOT NULL, actual REAL NOT NULL DEFAULT 0, status TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  if (!database.prepare('PRAGMA table_info(reviews)').all().some(column => column.name === 'corrected_at')) database.exec('ALTER TABLE reviews ADD COLUMN corrected_at TEXT');
  const insert = database.prepare('INSERT OR IGNORE INTO questions(id,version,data,created_at) VALUES(?,?,?,?)');
  for (const question of questions) insert.run(question.id, question.version || 1, JSON.stringify(question), now());
  if (!database.prepare("SELECT value FROM metadata WHERE key='seed-v1'").get()) {
    database.exec('BEGIN IMMEDIATE');
    try {
      for (const [studentIndex, student] of students.entries()) {
        const pool = questions.filter(q => q.grade === student.grade && q.phase === 'practice' && q.approved).slice(0, 6);
        for (const [index, question] of pool.entries()) {
          const id = `sample-${student.id}-${question.id}`;
          const correct = (studentIndex + index) % 3 !== 0;
          const answer = correct ? question.answer : question.options.find(value => value !== question.answer) || '...';
          const createdAt = new Date(Date.now() - ((6 - index) * 86400000 + studentIndex * 300000)).toISOString();
          database.prepare('INSERT OR IGNORE INTO attempts(id,student_id,question_id,version,answer,correct,assisted,phase,created_at,sample) VALUES(?,?,?,?,?,?,?,?,?,1)').run(id, student.id, question.id, question.version, answer, Number(correct), 0, 'practice', createdAt);
          if (!correct) database.prepare('INSERT OR IGNORE INTO reviews(student_id,question_id,attempt_id,due_at) VALUES(?,?,?,?)').run(student.id, question.id, id, new Date(Date.now() - 86400000).toISOString());
        }
      }
      database.prepare("INSERT INTO metadata(key,value) VALUES('seed-v1',?)").run(now());
      database.exec('COMMIT');
    } catch (error) { database.exec('ROLLBACK'); throw error; }
  }
  return database;
}

export function getQuestion(id: string, version?: number): Question | undefined {
  const row = (version === undefined
    ? getDb().prepare('SELECT data FROM questions WHERE id=? ORDER BY version DESC LIMIT 1').get(id)
    : getDb().prepare('SELECT data FROM questions WHERE id=? AND version=?').get(id, version)) as { data: string } | undefined;
  return row ? JSON.parse(row.data) as Question : undefined;
}

export function allQuestions(): Question[] {
  return (getDb().prepare('SELECT q.data FROM questions q JOIN (SELECT id,MAX(version) AS v FROM questions GROUP BY id) latest ON q.id=latest.id AND q.version=latest.v').all() as { data: string }[]).map(row => JSON.parse(row.data));
}

export function canAccessQuestion(studentId: string, questionId: string): boolean {
  const owner = getDb().prepare('SELECT student_id FROM question_owners WHERE question_id=?').get(questionId);
  return !owner || owner.student_id === studentId;
}
export function assignQuestionOwner(questionId: string, studentId: string): void {
  getDb().prepare('INSERT OR IGNORE INTO question_owners(question_id,student_id) VALUES(?,?)').run(questionId, studentId);
}

export function saveQuestionVersion(question: Question): Question {
  const current = getQuestion(question.id);
  const saved = { ...question, version: (current?.version || 0) + 1 };
  getDb().prepare('INSERT INTO questions(id,version,data,created_at) VALUES(?,?,?,?)').run(saved.id, saved.version, JSON.stringify(saved), now());
  return saved;
}

function asJob(row: Record<string, unknown> | undefined): Job | undefined {
  if (!row) return undefined;
  return { id: String(row.id), studentId: String(row.student_id), kind: row.kind as JobKind, status: row.status as Job['status'], progress: Number(row.progress), message: String(row.message), input: JSON.parse(String(row.input)), result: row.result ? JSON.parse(String(row.result)) : null, error: row.error ? String(row.error) : null, createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}
export function createJob(studentId: string, kind: JobKind, input: Record<string, unknown>): Job {
  const id = randomUUID(); const timestamp = now();
  getDb().prepare("INSERT INTO jobs(id,student_id,kind,status,input,created_at,updated_at,message) VALUES(?,?,?,'queued',?,?,?,?)").run(id, studentId, kind, JSON.stringify(input), timestamp, timestamp, '已加入本地任务队列');
  return getJob(id)!;
}
export function getJob(id: string): Job | undefined { return asJob(getDb().prepare('SELECT * FROM jobs WHERE id=?').get(id)); }
export function listJobs(studentId: string): Job[] { return getDb().prepare('SELECT * FROM jobs WHERE student_id=? ORDER BY created_at DESC LIMIT 50').all(studentId).map(row => asJob(row)!); }
export function updateJob(id: string, patch: Partial<Job>): Job {
  const current = getJob(id); if (!current) throw new Error('任务不存在');
  const next = { ...current, ...patch, id: current.id, studentId: current.studentId, updatedAt: now() };
  getDb().prepare('UPDATE jobs SET status=?,progress=?,message=?,input=?,result=?,error=?,updated_at=? WHERE id=?').run(next.status, next.progress, next.message, JSON.stringify(next.input), next.result ? JSON.stringify(next.result) : null, next.error, next.updatedAt, id);
  return next;
}
export function claimNextJob(): Job | undefined {
  const db = getDb(); db.exec('BEGIN IMMEDIATE');
  try {
    const row = db.prepare("SELECT * FROM jobs WHERE status='queued' ORDER BY CASE WHEN kind='tts' THEN 0 ELSE 1 END, created_at LIMIT 1").get();
    if (!row) { db.exec('COMMIT'); return undefined; }
    const job = updateJob(String(row.id), { status: 'running', progress: 1, message: '开始处理' });
    db.exec('COMMIT'); return job;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function recoverStaleJobs(): number {
  // Called only after the worker acquires its exclusive process lock.
  return Number(getDb().prepare("UPDATE jobs SET status='queued',error=NULL,message='恢复中断任务，将复用已完成阶段',updated_at=? WHERE status='running'").run(now()).changes);
}

export class BudgetError extends Error { status = 429; constructor(message: string) { super(message); this.name = 'BudgetError'; } }
const categoryCaps: Record<string, number> = { text: 80, asr: 5, images: 5 };
function budgetSummary(studentId?: string) {
  const rows = getDb().prepare('SELECT kind,status,estimated,actual FROM usage' + (studentId ? ' WHERE student_id=?' : '')).all(...(studentId ? [studentId] : []));
  const limit = Number(process.env.PROJECT_BUDGET_CNY || 90);
  let spent = 0, reserved = 0;
  const categories = Object.fromEntries(Object.entries(categoryCaps).map(([kind, cap]) => [kind, { limit: cap, spent: 0, reserved: 0, remaining: cap }]));
  for (const row of rows) {
    const actual = row.status === 'settled' ? Number(row.actual) : 0;
    const estimate = row.status === 'reserved' ? Number(row.estimated) : 0;
    spent += actual; reserved += estimate;
    const category = categories[String(row.kind)];
    if (category) { category.spent += actual; category.reserved += estimate; category.remaining = Math.max(0, category.limit - category.spent - category.reserved); }
  }
  return { limit, spent, reserved, remaining: Math.max(0, limit - spent - reserved), reserve: 10, total: limit + 10, currency: 'CNY' as const, period: 'project' as const, categories };
}
export const budget = {
  summary: budgetSummary,
  reserve(studentId: string, kind: string, estimatedCost: number): string {
    if (!Number.isFinite(estimatedCost) || estimatedCost < 0) throw new BudgetError('费用估算无效');
    if (!(kind in categoryCaps)) throw new BudgetError('费用类别无效');
    const db = getDb(); db.exec('BEGIN IMMEDIATE');
    try {
      const summary = budgetSummary(); const category = summary.categories[kind];
      if (estimatedCost > summary.remaining + 1e-9 || estimatedCost > category.remaining + 1e-9) throw new BudgetError('预算不足，已停止付费请求；可继续使用示例内容。');
      const id = randomUUID();
      db.prepare("INSERT INTO usage(id,student_id,kind,estimated,status,created_at) VALUES(?,?,?,?,'reserved',?)").run(id, studentId, kind, estimatedCost, now());
      db.exec('COMMIT'); return id;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  },
  settle(id: string, actualCost: number): void {
    if (!Number.isFinite(actualCost) || actualCost < 0) throw new BudgetError('实际费用无效');
    const reservation = getDb().prepare("SELECT estimated FROM usage WHERE id=? AND status='reserved'").get(id);
    if (!reservation) throw new BudgetError('预算预留不存在或已结算');
    // The provider request must be bounded by its reservation; an overage is recorded, never hidden.
    getDb().prepare("UPDATE usage SET status='settled',actual=? WHERE id=? AND status='reserved'").run(actualCost, id);
  },
  release(id: string): void { getDb().prepare("UPDATE usage SET status='released' WHERE id=? AND status='reserved'").run(id); },
};
