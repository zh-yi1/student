"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronRight, ExternalLink, FileText, GraduationCap, Leaf, Loader2, MessageCircle, Send, Sparkles, Volume2 } from "lucide-react";
import AnimatedLessonPlayer from "./AnimatedLessonPlayer";
import SpeechButton from "./SpeechButton";
import { textbooks } from "@/lib/textbooks";
import { examResources } from "@/lib/exam-resources";
import type { Student } from "@/lib/types";

type Intent = "vocabulary" | "sentence" | "reading" | "exam";
type Session = {
  id: string; bookId: string; unitId: string; bookTitle: string; unitTitle: string;
  intent: Intent; topic: string; status: string; stage: string;
  grounding: { note: string; sourceUrl: string };
  messages: { id: string; role: string; text: string; source: string; stage: string }[];
  transferResult: null | { correct: boolean; submittedAnswer: string; answer: string; explanation: string; assisted?: boolean };
  learnerSelfCheck: string | null; summary: string | null; updatedAt: string;
};
const modes: { id: Intent; title: string; subtitle: string; prompt: string }[] = [
  { id: "vocabulary", title: "单词怎么用", subtitle: "联系情境，理解词义", prompt: "我能读出单词，但不知道怎么在句子里用。" },
  { id: "sentence", title: "句子怎么说", subtitle: "拆开句型，自己表达", prompt: "我想知道这个单元的句子为什么这样说。" },
  { id: "reading", title: "文章怎么读", subtitle: "读懂意思，寻找依据", prompt: "读短文时，我常常看懂单词却不明白意思。" },
  { id: "exam", title: "试卷怎么分析", subtitle: "找出卡点，回到知识", prompt: "我做题时容易出错，想先弄清楚应该怎样思考。" },
];
const stages: Record<string, string> = { diagnose: "找到困惑", explain: "一起理解", express: "自己表达", transfer: "换个情境", reflect: "回顾收获", completed: "辅导记录" };
const selfChecks: Record<string, string> = { understood: "我暂时听懂了", needs_practice: "还想再试一次", need_help: "希望老师再讲讲" };

function TeachingText({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : part)}</>;
}

async function request(path: string, body?: unknown) {
  const res = await fetch(`/api/${path}`, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "暂时没有连接上，请重试");
  return data;
}

export function CoachingHistory({ studentId }: { studentId: string }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { let alive = true; request("coaching").then(d => alive && setSessions(d.sessions)).catch(e => alive && setError(e.message)); return () => { alive = false; }; }, [studentId]);
  return <section className="panel coach-report">
    <div className="section-heading"><div><h2>学过什么，哪里还需要帮助</h2><p>辅导过程与孩子的自我表达单独记录，不计入独立测评成绩。</p></div><MessageCircle size={24} /></div>
    {error && <p role="alert">{error}</p>}
    {!sessions.length && !error && <p className="muted">还没有辅导记录。从课本中的一个问题开始，小芽会陪你一步步理解。</p>}
    {sessions.slice(0, 6).map(s => <details key={s.id} className="coach-history-row"><summary><span><strong>{s.unitTitle}</strong><small>{modes.find(m => m.id === s.intent)?.title} · {new Date(s.updatedAt).toLocaleDateString("zh-CN")}</small></span><span className="badge neutral">{s.status === "completed" ? "已记录" : stages[s.stage]}</span></summary><p>{s.summary || s.topic}</p>{s.learnerSelfCheck && <p>孩子自评：{selfChecks[s.learnerSelfCheck]}</p>}{s.transferResult && <p>辅导后的单题尝试：{s.transferResult.correct ? "答对" : "还需讲解"}（{s.transferResult.assisted ? "获得提示后尝试，" : ""}不作为独立掌握证据）</p>}<blockquote>{s.messages.filter(m => m.role === "user").slice(-2).map(m => m.text).join("\n") || "还未留下自己的表达"}</blockquote></details>)}
  </section>;
}

export default function LearningCompanion({ student, compact = false, onWorkspace, onAsk, onPhoto, onReport, onCheck, speak }: {
  student: Student; compact?: boolean; onWorkspace: () => void; onAsk: () => void; onPhoto: () => void; onReport: () => void; onCheck: () => void; speak: (text: string) => void;
}) {
  const books = textbooks.filter(b => b.grade === student.grade);
  const [bookId, setBookId] = useState(books[0]?.id || "");
  const book = books.find(b => b.id === bookId) || books[0];
  const [unitId, setUnitId] = useState(book?.units[0]?.id || "");
  const unit = book?.units.find(u => u.id === unitId) || book?.units[0];
  const [animationMode, setAnimationMode] = useState<string | null>(null);
  const [intent, setIntent] = useState<Intent>("sentence");
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [attached, setAttached] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"textbook" | "exam">("textbook");
  const [ready, setReady] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    try { const saved = JSON.parse(localStorage.getItem(`sprout-book-${student.id}`) || "null"); if (saved && books.some(b => b.id === saved.bookId)) { setBookId(saved.bookId); setUnitId(saved.unitId); } } catch { /* A missing or outdated preference is safe to ignore. */ }
    if (!compact) {
      const animation = sessionStorage.getItem(`sprout-animation-${student.id}`);
      try { const draft = JSON.parse(sessionStorage.getItem(`sprout-draft-${student.id}`) || "null"); if (draft) { setIntent(draft.intent); setQuestion(draft.question); } } catch { /* Ignore an outdated local draft. */ }
      try { const incoming = JSON.parse(sessionStorage.getItem(`sprout-question-${student.id}`) || "null"); if (incoming?.id) { setAttached(incoming); setIntent("exam"); setQuestion("我想先读懂这道题，再弄清楚应该怎样思考。"); } } catch { /* Ignore an outdated question link. */ }
      if (animation && ["words", "sentences", "reading"].includes(animation)) { setAnimationMode(animation); setIntent(animation === "words" ? "vocabulary" : animation === "reading" ? "reading" : "sentence"); sessionStorage.removeItem(`sprout-animation-${student.id}`); }
    }
    request("coaching").then(d => { if (alive.current) { setSessions(d.sessions); if (!compact) { const resumeId = sessionStorage.getItem(`sprout-resume-${student.id}`); const resume = d.sessions.find((s: Session) => s.id === resumeId); if (resume) setSession(resume); sessionStorage.removeItem(`sprout-resume-${student.id}`); } } }).catch(e => alive.current && setError(e.message));
    setReady(true);
    return () => { alive.current = false; };
    // This component is keyed by the student in the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id]);
  useEffect(() => { if (ready && book && unit) localStorage.setItem(`sprout-book-${student.id}`, JSON.stringify({ bookId: book.id, unitId: unit.id })); }, [ready, book, unit, student.id]);
  useEffect(() => { if (session) end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [session, busy]);
  function retain(s: Session) { setSession(s); setSessions(list => [s, ...list.filter(x => x.id !== s.id)]); }
  function enterWorkspace() { sessionStorage.setItem(`sprout-draft-${student.id}`, JSON.stringify({ intent, question })); onWorkspace(); }
  async function begin(concern?: string) {
    if (busy || !unit?.guideReady) return;
    setBusy(true); setError("");
    try { const d = await request("coaching", { action: "start", bookId: book.id, unitId: unit.id, intent, ...(attached ? { questionId: attached.id } : {}), message: concern || question.trim() || modes.find(m => m.id === intent)!.prompt }); if (alive.current) { retain(d.session); setReply(""); sessionStorage.removeItem(`sprout-question-${student.id}`); setAttached(null); } }
    catch (e) { if (alive.current) setError((e as Error).message); }
    finally { if (alive.current) setBusy(false); }
  }
  async function send() {
    if (busy || !reply.trim() || !session) return;
    setBusy(true); setError("");
    try { const d = await request("coaching", { action: "send", sessionId: session.id, message: reply, clientTurnId: crypto.randomUUID() }); if (alive.current) { retain(d.session); setReply(""); } }
    catch (e) { if (alive.current) setError((e as Error).message); }
    finally { if (alive.current) setBusy(false); }
  }
  async function finish(learnerSelfCheck: string) {
    if (busy || !session) return;
    setBusy(true); setError("");
    try { const d = await request("coaching", { action: "complete", sessionId: session.id, learnerSelfCheck }); if (alive.current) retain(d.session); }
    catch (e) { if (alive.current) setError((e as Error).message); }
    finally { if (alive.current) setBusy(false); }
  }
  if (!book || !unit) return <p>正在准备教材目录…</p>;
  if (animationMode && !compact) return <AnimatedLessonPlayer key={`${student.id}:${unit.id}:${animationMode}`} bookId={book.id} unitId={unit.id} mode={animationMode} onClose={() => setAnimationMode(null)} onAsk={() => { setAnimationMode(null); setQuestion("刚才的动画课还有不懂的地方，请带我一步一步理解。"); void begin("刚才的动画课还有不懂的地方，请先问问我哪一点没有听明白。"); }} />;
  if (session && !compact) return <div className="coach-workspace">
    <div className="coach-topline"><button className="btn secondary" disabled={busy} onClick={() => { setSession(null); setError(""); }}><ArrowLeft size={16} /> 回到课本</button><span>{session.bookTitle} · {session.unitTitle}</span></div>
    <div className="coach-session-grid">
      <aside className="coach-lesson-context panel"><span className="eyebrow">本次辅导</span><h2>{session.unitTitle}</h2><p>{session.topic}</p><ol className="coach-steps">{Object.entries(stages).filter(([k]) => k !== "completed").map(([k, label], i) => <li key={k} className={session.stage === k ? "current" : ""}><span>{i + 1}</span>{label}</li>)}</ol><p className="coach-source-note">{session.grounding.note}</p><a href={session.grounding.sourceUrl} target="_blank" rel="noreferrer">核对教材目录 <ExternalLink size={13} /></a></aside>
      <section className="coach-conversation panel"><div className="coach-conversation-title"><img src="/mascot.svg" alt="小芽" /><div><h2>陪你把这一点弄明白</h2><p>{stages[session.stage]} · 可以说“不懂”，也可以提出自己的想法</p></div></div>
        <div className="coach-messages" aria-live="polite">{session.messages.map(m => <article key={m.id} className={`coach-message ${m.role}`}><div className="coach-message-label">{m.role === "user" ? "我的想法" : `小芽 · ${m.source === "deepseek" ? "AI 辅导" : "离线原创教案"}`}</div><p><TeachingText text={m.text} /></p>{m.role === "assistant" && <SpeechButton prefetch={m.id === session.messages.at(-1)?.id} className="coach-read" label="听一听" text={m.text.replace(/\*\*/g, "")} />}</article>)}{busy && <p className="coach-thinking"><Loader2 size={17} className="spin" /> 小芽正在整理讲解…</p>}<div ref={end} /></div>
        {error && <p className="error-box" role="alert">{error}</p>}
        {session.status === "completed" ? <div className="coach-completed"><CheckCircle2 size={24} /><div><h3>今天的收获已记下</h3><p>{session.summary}</p><p>自评：{selfChecks[session.learnerSelfCheck || ""]}</p></div><button className="btn secondary" onClick={onReport}>查看成长记录</button></div> : <>
          {session.stage === "reflect" ? <div className="coach-reflect"><h3>现在，你觉得怎么样？</h3><p>这是自己的感受，不会变成考试分数。</p><div>{Object.entries(selfChecks).map(([value, label]) => <button key={value} className="btn secondary" disabled={busy} onClick={() => finish(value)}>{label}</button>)}</div></div> : null}
          <form className="coach-compose" onSubmit={e => { e.preventDefault(); send(); }}><label htmlFor="coach-answer">{session.stage === "transfer" ? "试着独立完成这一个新情境" : "说说你的想法，或者告诉小芽哪里还不懂"}</label><textarea id="coach-answer" maxLength={1600} value={reply} onChange={e => setReply(e.target.value)} placeholder="我觉得… / 这一步我不明白…" disabled={busy} /><div><span>不着急，我们一步一步来</span><button className="btn primary" disabled={busy || !reply.trim()} type="submit"><Send size={16} /> 发给小芽</button></div></form>
        </>}
      </section>
    </div>
  </div>;

  return <div className="companion-home">
    {attached && <section className="panel"><span className="badge neutral">本次带入的题目 · 单元对应待核对</span><p>{attached.text}</p><p className="coach-source-note">先核对下方单元是否对应这道题。未审核答案仍按待核对内容讨论。</p><button className="btn secondary" onClick={() => { setAttached(null); sessionStorage.removeItem(`sprout-question-${student.id}`); }}>本次不带入题目</button></section>}
    <div className="coach-heading"><span className="eyebrow">LEARN WITH UNDERSTANDING</span><h1>{compact ? `${student.name}，今天哪里还没弄懂？` : "翻开课本，和小芽一起学"}</h1><p>从课堂上的一个疑问开始，理解知识，再把它用出来。</p></div>
    {compact && <section className="coach-welcome"><div><span className="badge green">{student.grade} 年级 · 人教 PEP · 上册</span><h2>学明白，才有进步的底气。</h2><p>课本是主线，试卷帮我们找到薄弱的地方。<br />小芽陪你读、陪你想，也听你说一说。</p><button className="btn primary" onClick={enterWorkspace}>进入课本辅导 <ArrowRight size={17} /></button></div><button type="button" className="coach-welcome-art" onClick={onAsk} aria-label="和小芽聊一聊"><img src="/mascot.svg" alt="陪你学习的小芽" /><span>点我提问 · 陪你一起想明白</span></button></section>}
    <div className="coach-tabs" role="tablist" aria-label="辅导材料"><button role="tab" aria-selected={tab === "textbook"} onClick={() => setTab("textbook")} className={tab === "textbook" ? "active" : ""}><BookOpen size={18} /> 跟着课本学</button><button role="tab" aria-selected={tab === "exam"} onClick={() => setTab("exam")} className={tab === "exam" ? "active" : ""}><FileText size={18} /> 从试卷找卡点</button></div>
    {error && <p className="error-box" role="alert">{error}</p>}
    {tab === "textbook" ? <div className="coach-curriculum-grid"><section className="panel coach-book-panel"><div className="section-heading compact"><h2>我的英语课本</h2><BookOpen size={22} /></div><div className="coach-edition"><span className="badge green">新版人教 PEP · {student.grade} 年级上册</span><p>第一单元：{book.units[0].title}</p></div><p className="coach-source-note">{book.yearNote} 以孩子手中课本的目录为准。</p><a href={book.sourceUrl} target="_blank" rel="noreferrer">人教社官方目录 <ExternalLink size={13} /></a><div className="coach-unit-list">{book.units.map(u => <button key={u.id} className={u.id === unit.id ? "selected" : ""} onClick={() => setUnitId(u.id)}><span className="coach-unit-number">{String(u.number).padStart(2, "0")}</span><span><strong>{u.title}</strong><small>{u.guideReady ? "原创辅导课已准备" : "目录已核对 · 教案待补充"}</small></span><ChevronRight size={16} /></button>)}</div></section>
      <section className="panel coach-unit-panel"><span className="eyebrow">UNIT {unit.number} · {unit.theme}</span><h2>{unit.title}</h2><p>{unit.summary}</p><div className="coach-goals"><h3>这一单元，我们一起学会</h3>{unit.learningGoals.map((goal, i) => <p key={i}><CheckCircle2 size={16} />{goal}</p>)}</div><p className="coach-material-label">目录来自人教社；下方讲解与例句为原创配套辅导，不是课本原文。</p>
        {unit.guideReady ? <><div className="lesson-entry"><span className="badge green">先看动画，再开口表达</span><h3>观看动画讲解</h3><p>跟着画面听讲解，词句一步步出现；不懂的地方可以暂停问小芽。</p><div className="lesson-entry-buttons">{[{ id: "words", label: "单词情境动画", intent: "vocabulary" }, { id: "sentences", label: "句型动画讲解", intent: "sentence" }, { id: "reading", label: "阅读故事讲解", intent: "reading" }].map(item => <button key={item.id} className="btn primary" onClick={() => { setIntent(item.intent as Intent); if (compact) { sessionStorage.setItem(`sprout-animation-${student.id}`, item.id); enterWorkspace(); } else setAnimationMode(item.id); }}><Sparkles size={17} />{item.label}</button>)}</div></div><h3>看完还有疑问？和小芽一起弄懂</h3><div className="coach-mode-grid">{modes.map(m => <button key={m.id} aria-pressed={intent === m.id} className={intent === m.id ? "active" : ""} onClick={() => setIntent(m.id)}><strong>{m.title}</strong><small>{m.subtitle}</small></button>)}</div><label className="coach-question-label" htmlFor="coach-question">告诉小芽你的困惑<textarea id="coach-question" maxLength={1600} placeholder={modes.find(m => m.id === intent)?.prompt} value={question} onChange={e => setQuestion(e.target.value)} /></label><div className="coach-start-line"><span><Leaf size={15} /> 理解 → 表达 → 一题确认</span><button className="btn primary" disabled={busy} onClick={compact ? enterWorkspace : () => begin()}>{busy ? <Loader2 className="spin" size={17} /> : <MessageCircle size={17} />}{compact ? "去和小芽聊聊" : "开始这次辅导"}</button></div></> : <div className="coach-pending"><BookOpen size={25} /><h3>这个单元的辅导教案还在准备</h3><p>可以先查看官方目录，或拍下正在困惑的题目。已准备的第一单元可以体验完整辅导。</p><button className="btn secondary" onClick={onPhoto}>带着题目来请教</button></div>}
      </section></div> : <section className="panel coach-exams"><div className="section-heading"><div><h2>看试卷，是为了找到该怎么学</h2><p>先判断是词义、句型还是阅读方法不清楚，再回到课本讲解。试卷来源与教材版本分别标注。</p></div></div><div className="coach-paper-grid">{examResources.filter(p => p.grade === student.grade && p.bookId === book.id).map(p => <article key={p.id} className="coach-paper"><span className="badge neutral">{p.kind}</span><h3>{p.title}</h3><p>{p.sourceName} · {p.edition}</p><p className="coach-source-note">{p.alignmentNote}</p><div className="coach-paper-tags">{p.questionTypes.map(t => <span key={t}>{t}</span>)}</div><h4>辅导时重点观察</h4><ul>{p.tutoringFocus.map(t => <li key={t}>{t}</li>)}</ul><details className="coach-example"><summary>看看怎么从题目回到学习</summary><small>{p.originalExample.label}</small><p>{p.originalExample.text}</p><p>{p.originalExample.teachingHint}</p><p><strong>试着说一说：</strong>{p.originalExample.learnerPrompt}</p></details><p className="coach-source-note">{p.accessNote}</p><a className="btn secondary" href={p.url} target="_blank" rel="noreferrer">查看原始试卷来源 <ExternalLink size={15} /></a></article>)}</div><div className="coach-exam-next"><div><h3>把不会的那一道拿来，我们一起拆开看</h3><p>拍题后先核对识别内容，再讲题意、知识和方法。公开试卷不会自动变成你已做过的题。</p></div><button className="btn primary" onClick={onPhoto}>拍题 / 导入题目 <ArrowRight size={17} /></button></div></section>}
    {sessions.length > 0 && <section className="panel coach-recent"><div className="section-heading"><div><h2>接着上次的疑问</h2><p>学习进度会保存下来，下次可以继续。</p></div></div>{sessions.slice(0, 3).map(s => <button key={s.id} onClick={() => { if (compact) { sessionStorage.setItem(`sprout-resume-${student.id}`, s.id); onWorkspace(); } else { retain(s); setError(""); } }}><MessageCircle size={19} /><span><strong>{s.unitTitle}</strong><small>{s.topic}</small></span><span className="badge neutral">{stages[s.stage]}</span><ChevronRight size={17} /></button>)}</section>}
    <div className="coach-support-links"><button onClick={onPhoto}><FileText size={20} /><span><strong>这道题为什么这样做</strong><small>拍照提问，听讲解、看步骤</small></span><ArrowRight size={17} /></button><button onClick={onReport}><GraduationCap size={20} /><span><strong>看看这周学懂了什么</strong><small>辅导记录与独立测评分别查看</small></span><ArrowRight size={17} /></button><button onClick={onCheck}><CheckCircle2 size={20} /><span><strong>独立试一试</strong><small>通用演示样题，非新版同步题库</small></span><ArrowRight size={17} /></button></div>
  </div>;
}
