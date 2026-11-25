"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowRight,
  ArrowLeft,
  BookOpen,
  Camera,
  ChartNoAxesCombined,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flame,
  GraduationCap,
  Headphones,
  House,
  Leaf,
  LogOut,
  MessageCircle,
  Mic,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Upload,
  Volume2,
  X,
  AlertCircle,
  Download,
  FileText,
  Users,
  Video,
  Wallet,
  Loader2,
  CalendarDays,
  NotebookPen,
  Search,
  StopCircle,
  ChevronDown,
} from "lucide-react";
import PhotoCropper from "./components/PhotoCropper";
import SpeechButton from "./components/SpeechButton";
import { prepareSpeech as speechResult, playSpeech, stopSpeech } from "./components/speech";
import LearningCompanion, { CoachingHistory } from "./components/LearningCompanion";
import type {
  PublicQuestion,
  Feedback,
  Student,
  Skill,
  Story,
  Job,
  Phase,
} from "@/lib/types";

type Obj = Record<string, any>;
type View =
  | "home"
  | "coaching"
  | "study"
  | "mistakes"
  | "photo"
  | "stories"
  | "report"
  | "teacher"
  | "settings";
type StudyConfig = { phase: Phase; skillId?: string; questionId?: string };
async function api(path: string, body?: unknown, method?: string) {
  const res = await fetch("/api/" + path, {
    method: method || (body ? "POST" : "GET"),
    headers:
      body instanceof FormData
        ? undefined
        : body
          ? { "Content-Type": "application/json" }
          : undefined,
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  }).catch(() => {
    throw new Error("无法连接本地学习服务。请重新启动小芽英语，保持启动程序运行，再刷新网页重试。");
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error || data.message || "请求未完成，请重试");
  return data;
}
const pct = (v: unknown) =>
  Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0;
const phaseName: Record<string, string> = {
  pre: "课前小测",
  practice: "巩固练习",
  post: "课后检测",
  delayed: "延迟复测",
};
const date = (s: string) =>
  new Date(s).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
const icons = {
  home: House,
  coaching: MessageCircle,
  study: BookOpen,
  mistakes: NotebookPen,
  photo: Camera,
  stories: Video,
  report: ChartNoAxesCombined,
  teacher: Users,
  settings: Settings2,
};
const navs: { id: View; label: string; sub?: string }[] = [
  { id: "home", label: "学习首页" },
  { id: "coaching", label: "课本辅导" },
  { id: "study", label: "独立检测" },
  { id: "mistakes", label: "错题与复习" },
  { id: "photo", label: "拍题讲解", sub: "AI" },
  { id: "stories", label: "故事放映室" },
  { id: "report", label: "成长报告" },
];

function IconBadge({
  icon: Icon,
  color = "green",
}: {
  icon: any;
  color?: string;
}) {
  return (
    <span className={"icon-badge " + color}>
      <Icon size={21} />
    </span>
  );
}
function Empty({
  icon: Icon = BookOpen,
  title,
  desc,
  children,
}: {
  icon?: any;
  title: string;
  desc?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Icon size={34} />
      <h3>{title}</h3>
      <p>{desc}</p>
      {children}
    </div>
  );
}
function Loading() {
  return (
    <div className="loading">
      <Loader2 className="spin" size={25} />
      <span>正在准备你的课堂…</span>
    </div>
  );
}
function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div className="error-box" role="alert">
      <AlertCircle size={17} />
      {message}
    </div>
  ) : null;
}
function SourceBadge({ source }: { source?: string }) {
  const cloud = ["live", "deepseek", "qwen"].includes(source || "");
  return (
    <span className={"badge " + (cloud ? "green" : "neutral")}>
      {cloud ? "实时 AI" : "演示内容"}
    </span>
  );
}

export default function App() {
  const [boot, setBoot] = useState<Obj | null>(null),
    [dash, setDash] = useState<Obj | null>(null),
    [view, setView] = useState<View>("home"),
    [study, setStudy] = useState<StudyConfig>({ phase: "practice" }),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [refresh, setRefresh] = useState(0),
    [tutorOpen, setTutorOpen] = useState(false),
    [context, setContext] = useState<PublicQuestion | null>(null);
  const showToast = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(""), 4200);
  };
  const reload = useCallback(async () => {
    try {
      const b = await api("bootstrap");
      setBoot(b);
      setDash(await api("dashboard"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload, refresh]);
  useEffect(() => {
    const listener = () => {
      const v = location.hash.slice(1) as View;
      if ([...navs.map((n) => n.id), "teacher", "settings"].includes(v))
        setView(v);
    };
    listener();
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  function go(v: View) {
    stopSpeech();
    setView(v);
    location.hash = v;
    if (v !== "study") setContext(null);
  }
  function start(config: StudyConfig) {
    setStudy(config);
    go("study");
  }
  async function switchStudent(id: string) {
    stopSpeech();
    setTutorOpen(false);
    try {
      await api("session", { studentId: id, role: boot?.role || "student" });
      setContext(null);
      setRefresh((x) => x + 1);
      go("home");
    } catch (e) {
      showToast((e as Error).message);
    }
  }
  async function role() {
    try {
      await api("session", {
        studentId: boot?.student?.id || "s1",
        role: boot?.role === "teacher" ? "student" : "teacher",
      });
      setRefresh((x) => x + 1);
      go(boot?.role === "teacher" ? "home" : "teacher");
    } catch (e) {
      showToast((e as Error).message);
    }
  }
  if (!boot)
    return (
      <div className="boot-screen">
        <div className="brand">
          <span className="brand-icon">
            <Leaf />
          </span>
          小芽英语<span className="brand-en">SPROUT</span>
        </div>
        {error ? (
          <>
            <ErrorBox message={error} />
            <button className="btn primary" onClick={reload}>
              重新连接
            </button>
          </>
        ) : (
          <Loading />
        )}
      </div>
    );
  const student: Student = boot.student || boot.students[0];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => go("home")}
          aria-label="小芽英语首页"
        >
          <span className="brand-icon">
            <Leaf size={25} />
          </span>
          <span>
            小芽英语<small>SPROUT ENGLISH</small>
          </span>
        </button>
        <div className="workspace-label">
          我的学习空间 <span>DEMO</span>
        </div>
        <nav>
          {navs.map((n) => {
            const Icon = icons[n.id];
            return (
              <button
                key={n.id}
                aria-label={n.label}
                title={n.label}
                className={"nav-item " + (view === n.id ? "active" : "")}
                onClick={() =>
                  n.id === "study" ? start({ phase: "practice" }) : go(n.id)
                }
              >
                <Icon size={20} />
                <span>{n.label}</span>
                {n.sub && <b>{n.sub}</b>}
                {view === n.id && <i />}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-note">
          <div className="little-sprout">🌱</div>
          <strong>每天进步一点点</strong>
          <p>
            陪你读懂课本，
            <br />
            把每个疑问想明白。
          </p>
          <span>GROW A LITTLE EVERY DAY</span>
        </div>
        <div className="sidebar-bottom">
          <button
            aria-label="连接与用量"
            title="连接与用量"
            className={"nav-item " + (view === "settings" ? "active" : "")}
            onClick={() => go("settings")}
          >
            <Settings2 size={19} />
            <span>连接与用量</span>
          </button>
          <button className="profile" onClick={role}>
            <span className="avatar" style={{ background: student.color }}>
              {student.avatar || student.name.slice(-1)}
            </span>
            <span>
              <strong>{student.name}</strong>
              <small>
                {student.grade} 年级 ·{" "}
                {boot.role === "teacher" ? "教师视角" : "学生空间"}
              </small>
            </span>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumb">
            我的学习空间 <ChevronRight size={14} />
            <strong>
              {navs.find((n) => n.id === view)?.label ||
                (view === "teacher" ? "教师工作台" : "连接与用量")}
            </strong>
          </div>
          <div className="topbar-actions">
            <span className="demo-pill">
              <i />
              {boot.status?.deepseek ? "AI 辅导已配置" : "离线体验课堂"}
            </span>
            <button className="teacher-switch" onClick={role}>
              <GraduationCap size={17} />
              {boot.role === "teacher" ? "返回学生端" : "教师工作台"}
            </button>
            <label className="student-select">
              <span
                className="mini-avatar"
                style={{ background: student.color }}
              >
                {student.avatar || student.name.slice(-1)}
              </span>
              <select
                aria-label="切换学生"
                value={student.id}
                onChange={(e) => switchStudent(e.target.value)}
              >
                {boot.students.map((s: Student) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.grade}年级
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>
        <main>
          {(view === "home" || view === "coaching") && (
            <LearningCompanion
              key={student.id + view}
              student={student}
              compact={view === "home"}
              onWorkspace={() => go("coaching")}
              onAsk={() => setTutorOpen(true)}
              onPhoto={() => go("photo")}
              onReport={() => go("report")}
              onCheck={() => start({ phase: "practice" })}
              speak={(text) => speak(text, showToast)}
            />
          )}
          {view === "study" && (
            <Study
              key={student.id + JSON.stringify(study)}
              student={student}
              config={study}
              skills={boot.skills}
              onContext={setContext}
              onChange={() => setRefresh((n) => n + 1)}
              onReport={() => go("report")}
              onTutor={() => setTutorOpen(true)}
              notify={showToast}
            />
          )}
          {view === "mistakes" && (
            <Mistakes
              key={student.id + refresh}
              start={start}
              skills={boot.skills.filter(
                (s: Skill) => s.grade === student.grade,
              )}
            />
          )}
          {view === "photo" && (
            <Photo
              student={student}
              skills={boot.skills}
              notify={showToast}
              onContext={setContext}
              onCoach={(q) => {
                sessionStorage.setItem(`sprout-question-${student.id}`, JSON.stringify({ id: q.id, text: q.text }));
                go("coaching");
              }}
            />
          )}
          {view === "stories" && (
            <Stories
              stories={boot.stories}
              grade={student.grade}
              notify={showToast}
            />
          )}
          {view === "report" && (
            <Report key={student.id + refresh} student={student} />
          )}
          {view === "teacher" && (
            <Teacher
              key={refresh}
              enabled={boot.role === "teacher"}
              switchRole={role}
              onChange={() => setRefresh((n) => n + 1)}
              notify={showToast}
            />
          )}
          {view === "settings" && <Settings boot={boot} reload={reload} />}
          <footer>
            <span>
              <Leaf size={13} />
              小芽英语 · 让每一步成长看得见
            </span>
            <span>人教目录 · 原创辅导 · 样卷来源可查</span>
          </footer>
        </main>
      </div>
      {!tutorOpen && (
        <button
          className="tutor-fab"
          onClick={() => setTutorOpen(true)}
          aria-label="打开小芽助教"
        >
          <img src="/mascot.svg" alt="小芽" />
          <span>
            问问小芽
            <Sparkles size={13} />
          </span>
        </button>
      )}
      {tutorOpen && (
        <Tutor
          key={student.id}
          question={context}
          close={() => setTutorOpen(false)}
          notify={showToast}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}

function Home({
  student,
  dash,
  skills,
  start,
  go,
  openTutor,
}: {
  student: Student;
  dash: Obj | null;
  skills: Skill[];
  start: (c: StudyConfig) => void;
  go: (v: View) => void;
  openTutor: () => void;
}) {
  const stats = dash?.stats || {},
    weak = (dash?.skills || [])
      .filter((s: Obj) => s.independentCount > 0)
      .map((s: Obj) => ({ ...s, accuracy: s.independentAccuracy }))
      .sort((a: Obj, b: Obj) => a.accuracy - b.accuracy)
      .slice(0, 3),
    due = dash?.dueReviews || 0;
  const weekly =
    dash?.weekly ||
    Array.from({ length: 7 }, (_, i) => ({
      label: ["一", "二", "三", "四", "五", "六", "日"][i],
      count: 0,
      correct: 0,
    }));
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">A LITTLE BETTER, EVERY DAY</div>
          <h1>
            你好，{student.name} <span className="wave">👋</span>
          </h1>
          <p>准备好了吗？今天也一起收获一点新知识。</p>
        </div>
        <div className="date-chip">
          <CalendarDays size={16} />
          {new Date().toLocaleDateString("zh-CN", {
            month: "long",
            day: "numeric",
            weekday: "long",
          })}
        </div>
      </div>
      <div className="home-grid">
        <div className="home-main">
          <section className="hero">
            <div className="hero-copy">
              <span className="hero-label">
                <span />
                你的专属英语成长课堂
              </span>
              <h2>
                小小的练习，
                <br />
                大大的<span>进步。</span>
              </h2>
              <p>
                学懂一个知识点，再用一道新题证明自己。
                <br />
                小芽会陪你找到答案，也找到方法。
              </p>
              <button
                className="btn primary"
                onClick={() => start({ phase: "practice" })}
              >
                开始今日学习
                <ArrowRight size={17} />
              </button>
              <div className="hero-foot">
                <ShieldCheck size={14} />
                循序渐进 · 每一步都有记录
              </div>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="art-orbit" />
              <span className="spark s1">✦</span>
              <span className="spark s2">✧</span>
              <span className="art-dot d1" />
              <span className="art-dot d2" />
              <div className="float-vocab">
                <span>Aa</span>
                <div>
                  <small>WORD OF THE DAY</small>
                  <strong>
                    grow <em>/ɡrəʊ/</em>
                  </strong>
                  <p>成长，一点一点向上</p>
                </div>
                <Volume2 size={17} />
              </div>
              <div className="art-book">
                <div className="book-page">
                  <span>LET’S</span>
                  <strong>GROW!</strong>
                  <div className="book-leaf">
                    <Leaf size={65} />
                  </div>
                  <i />
                  <i />
                </div>
                <div className="book-page right">
                  <img src="/mascot.svg" alt="" />
                  <span>Hello, friend!</span>
                  <i />
                  <i />
                </div>
              </div>
              <div className="float-check">
                <span>
                  <Check size={16} />
                </span>
                <div>
                  <strong>又学会一个知识点！</strong>
                  <small>Keep going. You’ve got this.</small>
                </div>
              </div>
            </div>
          </section>
          <div className="stats-grid">
            <Stat
              icon={Target}
              label="累计答题"
              value={stats.answered || 0}
              suffix="道"
              note="每次尝试，都有价值"
            />
            <Stat
              icon={CheckCircle2}
              color="blue"
              label="独立答题正确率"
              value={
                stats.independentCount ? pct(stats.independentAccuracy) : "—"
              }
              suffix={stats.independentCount ? "%" : ""}
              note="以首次独立作答为依据"
            />
            <Stat
              icon={NotebookPen}
              color="orange"
              label="待复习错题"
              value={due}
              suffix="道"
              note={due ? "温故知新，让知识更牢固" : "新的进步，从下一道题开始"}
            />
          </div>
          <section className="section">
            <div className="section-heading">
              <div>
                <h2>
                  今天，学点什么？
                  <span className="tiny-tag">{student.grade} 年级</span>
                </h2>
                <p>有目标地练习，才能看见进步。</p>
              </div>
              <button className="text-btn" onClick={() => go("report")}>
                学习报告
                <ArrowRight size={15} />
              </button>
            </div>
            <div className="lesson-grid">
              <button
                className="lesson-card mint"
                onClick={() => start({ phase: "practice" })}
              >
                <div className="lesson-art">
                  <div className="tiny-classroom">
                    <span className="board">
                      {student.grade === 4 ? "My classroom" : "My friends"}
                    </span>
                    <i />
                    <b />
                    <em />
                  </div>
                  <span className="lesson-number">01</span>
                </div>
                <div className="lesson-body">
                  <span className="lesson-kicker">UNIT 01 · 示例课程</span>
                  <h3>
                    {student.grade === 4
                      ? "发现教室里的英语"
                      : "认识我们的新朋友"}
                  </h3>
                  <p>
                    {student.grade === 4
                      ? "Classroom & positions"
                      : "Appearance & personality"}
                  </p>
                  <div className="lesson-meta">
                    <span>
                      <BookOpen size={14} />4 个知识点
                    </span>
                    <span className="round-arrow">
                      <ArrowRight size={17} />
                    </span>
                  </div>
                </div>
              </button>
              <button
                className="lesson-card peach"
                onClick={() => go("stories")}
              >
                <div className="lesson-art story">
                  <img
                    src={
                      student.grade === 4 ? "/story-4-1.svg" : "/story-5-1.svg"
                    }
                    alt="故事绘本封面"
                  />
                  <span className="play-small">
                    <Play size={17} fill="currentColor" />
                  </span>
                </div>
                <div className="lesson-body">
                  <span className="lesson-kicker">STORY TIME · 动态绘本</span>
                  <h3>把英语，放进故事里</h3>
                  <p>看一看，听一听，再想一想</p>
                  <div className="lesson-meta">
                    <span>
                      <Headphones size={14} />6 幅画 · 一个新世界
                    </span>
                    <span className="round-arrow">
                      <ArrowRight size={17} />
                    </span>
                  </div>
                </div>
              </button>
            </div>
          </section>
          <div className="two-panels">
            <section className="panel">
              <div className="section-heading compact">
                <h3>再练一练，就更好了</h3>
                <span className="badge neutral">知识点</span>
              </div>
              {weak.length ? (
                weak.map((s: Obj, i: number) => (
                  <button
                    className="skill-row"
                    key={s.id}
                    onClick={() => start({ phase: "practice", skillId: s.id })}
                  >
                    <span className={"skill-num n" + i}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <strong>{s.name}</strong>
                      <div className="progress-track">
                        <i style={{ width: pct(s.accuracy) + "%" }} />
                      </div>
                    </div>
                    <span>{pct(s.accuracy)}%</span>
                    <ChevronRight size={16} />
                  </button>
                ))
              ) : (
                <div className="panel-note">
                  <Target size={26} />
                  <p>
                    完成一次小测，
                    <br />
                    一起找到值得练习的知识点。
                  </p>
                  <button
                    className="text-btn"
                    onClick={() => start({ phase: "pre" })}
                  >
                    开始课前小测
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </section>
            <section className="panel">
              <div className="section-heading compact">
                <h3>本周的小脚印</h3>
                <span className="muted">答题数</span>
              </div>
              <div className="weekly-chart">
                {weekly.map((d: Obj, i: number) => (
                  <div key={i} className="chart-col">
                    <span>{d.count || ""}</span>
                    <div className="bar-space">
                      <i
                        style={{
                          height:
                            Math.max(5, Math.min(90, (d.count || 0) * 8)) +
                            "px",
                        }}
                      />
                    </div>
                    <small>{d.label}</small>
                  </div>
                ))}
              </div>
              <div className="chart-caption">
                <span className="dot" />
                每一次练习，都在积累力量
              </div>
            </section>
          </div>
        </div>
        <aside className="home-aside">
          <section className="coach-card">
            <span className="badge green">
              <i />
              你的 AI 学习伙伴
            </span>
            <img src="/mascot.svg" alt="小芽助教" />
            <h3>嗨，我是小芽！</h3>
            <p>
              哪里没听懂，随时告诉我。
              <br />
              我们一起把“不会”变成“会”。
            </p>
            <button className="btn white full" onClick={openTutor}>
              <MessageCircle size={16} />
              和小芽聊一聊
              <ArrowRight size={16} />
            </button>
          </section>
          <section className="panel today">
            <div className="section-heading compact">
              <h3>我的成长路线</h3>
              <span className="badge neutral">4 步</span>
            </div>
            {[
              {
                label: "测一测，找到起点",
                desc: "8 道题，认识自己的薄弱点",
                phase: "pre",
                icon: Target,
              },
              {
                label: "练一练，学会方法",
                desc: "提示、讲解与同类新题",
                phase: "practice",
                icon: BookOpen,
              },
              {
                label: "再测一次，看看变化",
                desc: "独立完成，检验学习成果",
                phase: "post",
                icon: CheckCircle2,
              },
              {
                label: "过几天，还能记住",
                desc: "延迟复测，让知识更牢固",
                phase: "delayed",
                icon: Clock,
              },
            ].map((x, i) => (
              <button
                className="route-item"
                key={x.phase}
                onClick={() => start({ phase: x.phase as Phase })}
              >
                <span className={"route-step " + (i === 1 ? "selected" : "")}>
                  {i + 1}
                </span>
                <span>
                  <strong>{x.label}</strong>
                  <small>{x.desc}</small>
                </span>
                <ChevronRight size={15} />
              </button>
            ))}
          </section>
          <button className="photo-shortcut" onClick={() => go("photo")}>
            <span className="icon-badge orange">
              <Camera size={23} />
            </span>
            <div>
              <h3>遇到一道不会的题？</h3>
              <p>拍下来，让小芽讲给你听</p>
            </div>
            <ArrowRight size={17} />
          </button>
          <div className="sample-note">
            <ShieldCheck size={15} />
            <span>
              当前包含 {stats.sampleCount || 0} 条演示作答。
              <br />
              你新完成的作答会单独保存。
            </span>
          </div>
        </aside>
      </div>
    </>
  );
}
function Stat({
  icon,
  label,
  value,
  suffix,
  note,
  color = "green",
}: {
  icon: any;
  label: string;
  value: any;
  suffix: string;
  note: string;
  color?: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <IconBadge icon={icon} color={color} />
        <span>{label}</span>
      </div>
      <div className="stat-value">
        {value}
        <small>{suffix}</small>
      </div>
      <p>{note}</p>
    </div>
  );
}

function Study({
  student,
  config,
  skills,
  onContext,
  onChange,
  onReport,
  onTutor,
  notify,
}: {
  student: Student;
  config: StudyConfig;
  skills: Skill[];
  onContext: (q: PublicQuestion | null) => void;
  onChange: () => void;
  onReport: () => void;
  onTutor: () => void;
  notify: (s: string) => void;
}) {
  const [questions, setQuestions] = useState<PublicQuestion[]>([]),
    [index, setIndex] = useState(0),
    [answer, setAnswer] = useState(""),
    [feedback, setFeedback] = useState<Feedback | null>(null),
    [hint, setHint] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [assessment, setAssessment] = useState<Obj | null>(null),
    [responses, setResponses] = useState<Record<string, string>>({}),
    [result, setResult] = useState<Obj | null>(null),
    [ready, setReady] = useState(config.phase === "practice"),
    [job, setJob] = useState<Job | null>(null);
  const q = questions[index],
    exam = config.phase !== "practice";
  useEffect(() => {
    if (!assessment || !q || result) return;
    try {
      sessionStorage.setItem(
        "assessment:" + assessment.id,
        JSON.stringify({ index, answer, responses }),
      );
    } catch {
      /* Browser storage is optional. */
    }
  }, [assessment?.id, index, answer, responses, q?.id, result]);
  useEffect(() => {
    (async () => {
      try {
        const active = await api("assessments");
        if (active.active) {
          setAssessment(active.active);
          setQuestions(active.active.questions || []);
          try {
            const saved = JSON.parse(
              sessionStorage.getItem("assessment:" + active.active.id) ||
                "null",
            );
            if (
              saved &&
              Number.isInteger(saved.index) &&
              saved.index >= 0 &&
              saved.index < active.active.questions.length
            ) {
              setIndex(saved.index);
              setResponses(saved.responses || {});
              setAnswer(saved.answer || "");
            }
          } catch {
            /* An invalid local draft never affects server grading. */
          }
          setReady(true);
          return;
        }
        if (!exam) {
          const d = await api(
            "questions?phase=practice" +
              (config.skillId ? "&skillId=" + config.skillId : ""),
          );
          let qs = d.questions || [];
          if (config.questionId) {
            qs = [
              ...qs.filter((x: PublicQuestion) => x.id === config.questionId),
              ...qs.filter((x: PublicQuestion) => x.id !== config.questionId),
            ];
          }
          setQuestions(qs);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  useEffect(() => {
    onContext(q || null);
    return () => onContext(null);
  }, [q]);
  useEffect(() => {
    if (!job || ["completed", "failed"].includes(job.status)) return;
    const t = setInterval(async () => {
      try {
        const d = await api("jobs/" + job.id);
        setJob(d.job || d);
      } catch {}
    }, 1800);
    return () => clearInterval(t);
  }, [job?.id, job?.status]);
  async function begin() {
    setBusy(true);
    try {
      const d = await api("assessments", { phase: config.phase });
      setAssessment(d);
      setQuestions(d.questions);
      setReady(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!answer.trim()) return;
    setBusy(true);
    setError("");
    try {
      setFeedback(
        await api("attempts", {
          questionId: q.id,
          version: q.version,
          answer,
          assisted: hint,
          phase: "practice",
        }),
      );
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    setBusy(true);
    try {
      const a = { ...responses, [q.id]: answer };
      const d = await api("assessments/" + assessment!.id, {
        answers: questions.map((x) => ({
          questionId: x.id,
          answer: a[x.id] || "",
        })),
      });
      setResult(d);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function next() {
    if (assessment) {
      setResponses({ ...responses, [q.id]: answer });
      setAnswer(responses[questions[index + 1]?.id] || "");
    } else {
      setAnswer("");
      setFeedback(null);
      setHint(false);
      setJob(null);
    }
    setIndex((i) => i + 1);
  }
  async function board() {
    try {
      const d = await api("jobs", {
        kind: "board",
        input: { questionId: q.id, version: q.version },
      });
      setJob(d.job || d);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function variants() {
    setBusy(true);
    try {
      const d = await api("jobs", {
        kind: "variants",
        input: { questionId: q.id, version: q.version },
      });
      setJob(d.job || d);
      notify("变式练习已加入生成任务，完成后会出现在练习题库。");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Loading />;
  if (result)
    return (
      <>
        <PageTitle
          eyebrow="LOOK HOW FAR YOU’VE COME"
          title="完成了，为自己点个赞！"
          desc="每一次独立尝试，都让我们更了解你。"
        />
        <section className="panel assessment-result">
          <div className="result-medal">
            <GraduationCap size={50} />
          </div>
          <h2>{phaseName[assessment?.phase || config.phase]}完成</h2>
          <div className="result-score">
            {result.score}
            <small>/ {result.total}</small>
          </div>
          <p>以下是本次独立测评的完整记录</p>
          <div className="result-list">
            {result.results?.map((r: Obj, i: number) => (
              <div key={i}>
                <span className={r.correct ? "result-ok" : "result-no"}>
                  {r.correct ? <CheckCircle2 size={18} /> : <X size={18} />}
                </span>
                <div>
                  <strong>{r.question?.text || questions[i]?.text}</strong>
                  <p>
                    你的答案：{r.submittedAnswer || r.studentAnswer || "未作答"}{" "}
                    · 参考答案：
                    {r.answer ||
                      r.correctAnswer ||
                      r.expectedAnswer ||
                      "查看讲解"}
                  </p>
                  {r.explanation && <p>{r.explanation}</p>}
                </div>
              </div>
            ))}
          </div>
          <button className="btn primary" onClick={onReport}>
            查看成长报告
            <ArrowRight size={17} />
          </button>
        </section>
      </>
    );
  if (!ready)
    return (
      <>
        <PageTitle
          eyebrow="A NEW START"
          title={phaseName[config.phase]}
          desc="通用演示测评，非新版人教教材同步考试。"
        />
        <div className="panel assessment-intro">
          <div className="intro-icon">
            <Target size={45} />
          </div>
          <span className="badge green">{student.grade} 年级 · 示例课程</span>
          <h2>用 8 道题，看看你的进步</h2>
          <p>
            请独立完成。测评中暂不提供提示和答案，
            <br />
            提交后即可查看结果与知识点分析。
          </p>
          {config.phase === "delayed" && (
            <p className="hint-small">
              演示模式可立即体验；实际复测应按机构约定的间隔进行。
            </p>
          )}
          <div className="intro-facts">
            <span>
              <BookOpen size={19} />8 道题
            </span>
            <span>
              <Clock size={19} />
              按自己的节奏
            </span>
            <span>
              <ShieldCheck size={19} />
              独立作答
            </span>
          </div>
          <ErrorBox message={error} />
          <button className="btn primary" onClick={begin} disabled={busy}>
            {busy ? <Loader2 className="spin" size={18} /> : <Play size={17} />}
            开始{phaseName[config.phase]}
          </button>
        </div>
      </>
    );
  if (!q)
    return (
      <>
        <PageTitle title="我的课堂" desc="按自己的节奏，慢慢进步。" />
        <ErrorBox message={error} />
        <Empty title="这一组练习完成啦" desc="去报告中看看刚刚的收获吧。">
          <button className="btn primary" onClick={onReport}>
            查看报告
            <ArrowRight size={17} />
          </button>
        </Empty>
      </>
    );
  return (
    <>
      <PageTitle
        eyebrow={
          assessment ? "INDEPENDENT CHECK" : "ONE QUESTION, ONE STEP FORWARD"
        }
        title={assessment ? phaseName[assessment.phase] : "通用样题 · 独立试一试"}
        desc={
          assessment
            ? "通用演示样题，非新版同步试卷。独立完成后统一提交。"
            : "本区保留原有通用样题，用于体验检测流程；新版单元学习请进入课本辅导。"
        }
      />
      <div className="study-layout">
        <section className="question-panel panel">
          <div className="question-toolbar">
            <span className="badge green">
              {assessment ? "独立测评" : "巩固练习"}
            </span>
            <span>
              第 <b>{index + 1}</b> / {questions.length} 题
            </span>
            <span className="badge neutral">
              {q.source === "sample" ? "演示样题" : "练习题"}
            </span>
          </div>
          <div className="question-progress">
            <i
              style={{ width: ((index + 1) / questions.length) * 100 + "%" }}
            />
          </div>
          <div className="question-content">
            <div className="question-skill">
              {skills.find((s) => s.id === q.skillId)?.name || "英语练习"}
              <span>·</span>
              {q.type === "choice" ? "选择正确答案" : "填写正确答案"}
            </div>
            {q.passage && (
              <div className="passage">
                <BookOpen size={18} />
                <p>{q.passage}</p>
              </div>
            )}
            <h2>{q.text}</h2>
            {q.type === "choice" ? (
              <div className="answer-options">
                {q.options.map((o, i) => (
                  <button
                    key={i}
                    disabled={!!feedback}
                    className={
                      "answer-option " +
                      (answer === o ? "selected " : "") +
                      (feedback?.answer === o ? "correct " : "") +
                      (feedback && !feedback.correct && answer === o
                        ? "incorrect"
                        : "")
                    }
                    onClick={() => setAnswer(o)}
                  >
                    <span>{String.fromCharCode(65 + i)}</span>
                    <strong>{o}</strong>
                    {answer === o && <CheckCircle2 size={20} />}
                  </button>
                ))}
              </div>
            ) : (
              <label className="fill-answer">
                你的答案
                <input
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="在这里输入英文答案"
                  disabled={!!feedback}
                  onKeyDown={(e) =>
                    e.key === "Enter" && !assessment && submit()
                  }
                />
              </label>
            )}
            {hint && !assessment && (
              <div className="hint-box">
                <Sparkles size={18} />
                <span>
                  先找到题目里的关键词，再想想“
                  {skills.find((s) => s.id === q.skillId)?.name}
                  ”这个知识点。把每个选项代入句子读一遍。
                </span>
              </div>
            )}
            <ErrorBox message={error} />
            {feedback && (
              <div
                className={
                  "feedback " + (feedback.correct ? "success" : "retry")
                }
              >
                <div>
                  <CheckCircle2 size={21} />
                  <strong>
                    {feedback.correct
                      ? "答对了，继续保持！"
                      : "别着急，一起看看这道题。"}
                  </strong>
                  {feedback.provisional && (
                    <span className="badge orange">AI 参考答案待审核</span>
                  )}
                </div>
                <p>
                  正确答案：<b>{feedback.answer}</b>
                </p>
                <p>{feedback.explanation}</p>
                <ol>
                  {feedback.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
                <div className="feedback-actions">
                  {!feedback.correct && (
                    <button
                      className="text-btn"
                      onClick={() => {
                        setFeedback(null);
                        setHint(true);
                        setAnswer("");
                      }}
                    >
                      <RefreshCw size={16} />
                      再试一次
                    </button>
                  )}
                  <button
                    className="text-btn"
                    onClick={() => speak(feedback.explanation, notify)}
                  >
                    <Volume2 size={16} />
                    听讲解
                  </button>
                  <button
                    className="text-btn"
                    onClick={() => speak(feedback.explanation, notify, 0.8)}
                  >
                    <Headphones size={16} />
                    慢速听
                  </button>
                  <button className="text-btn" onClick={board}>
                    <Video size={16} />
                    生成板书视频
                  </button>
                  <button
                    className="text-btn"
                    onClick={variants}
                    disabled={busy}
                  >
                    <Plus size={16} />
                    同类新题
                  </button>
                </div>
              </div>
            )}
            {job && <JobCard job={job} onRetry={setJob} />}
          </div>
          <div className="question-actions">
            {!assessment && !feedback && (
              <button className="btn subtle" onClick={() => setHint(true)}>
                <Sparkles size={17} />
                给我一点提示
              </button>
            )}
            {assessment && (
              <span className="muted">
                <ShieldCheck size={14} />
                测评中，提示暂时关闭
              </span>
            )}
            <div className="spacer" />
            {feedback ? (
              <button className="btn primary" onClick={next}>
                {index === questions.length - 1 ? "完成练习" : "下一题"}
                <ArrowRight size={17} />
              </button>
            ) : assessment ? (
              <>
                {index > 0 && (
                  <button
                    className="btn subtle"
                    disabled={busy}
                    onClick={() => {
                      setResponses({ ...responses, [q.id]: answer });
                      setAnswer(responses[questions[index - 1].id] || "");
                      setIndex(index - 1);
                    }}
                  >
                    <ArrowLeft size={16} />
                    上一题
                  </button>
                )}
                <button
                  className="btn primary"
                  disabled={!answer || busy}
                  onClick={index === questions.length - 1 ? finish : next}
                >
                  {busy
                    ? "正在提交…"
                    : index === questions.length - 1
                      ? "提交测评"
                      : "下一题"}
                  <ArrowRight size={17} />
                </button>
              </>
            ) : (
              <button
                className="btn primary"
                onClick={submit}
                disabled={!answer || busy}
              >
                {busy ? "正在检查…" : "提交答案"}
                <ArrowRight size={17} />
              </button>
            )}
          </div>
        </section>
        <aside>
          <section className="panel study-coach">
            <img src="/mascot.svg" alt="小芽助教" />
            <h3>{assessment ? "给自己一次独立尝试" : "慢慢来，你一定可以"}</h3>
            <p>
              {assessment
                ? "先完成整份测评，再一起回顾答案与方法。"
                : "先看题目在问什么，找到线索，再选出你的答案。"}
            </p>
            {!assessment && (
              <button className="btn secondary full" onClick={onTutor}>
                <MessageCircle size={16} />
                向小芽提问
              </button>
            )}
            {assessment && (
              <button
                className="btn subtle full"
                onClick={async () => {
                  await api(
                    "assessments/" + assessment.id,
                    undefined,
                    "DELETE",
                  );
                  setAssessment(null);
                  setReady(false);
                  setQuestions([]);
                }}
              >
                退出本次测评
              </button>
            )}
          </section>
          <div className="study-note">
            <Leaf size={17} />
            <p>
              答错并不是退步。
              <br />
              发现问题，就是进步的开始。
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}

function PageTitle({
  title,
  desc,
  eyebrow,
  children,
}: {
  title: string;
  desc?: string;
  eyebrow?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </div>
      {children}
    </div>
  );
}
async function speak(text: string, notify: (s: string) => void, rate = 1) {
  try {
    notify("正在准备朗读，首次合成需要稍等…");
    await playSpeech(text, rate);
  } catch (e) {
    notify((e as Error).message);
  }
}
function JobCard({
  job,
  onUseImages,
  onRetry,
}: {
  job: Job;
  onUseImages?: (id: string) => void;
  onRetry?: (job: Job) => void;
}) {
  const r: Obj = job.result || {};
  const [err, setErr] = useState("");
  const scenes = (r.scenes || []) as Obj[];
  return (
    <div className="job-card">
      <div className="job-heading">
        {job.status === "completed" ? (
          <CheckCircle2 size={18} />
        ) : job.status === "failed" ? (
          <AlertCircle size={18} />
        ) : (
          <Loader2 className="spin" size={18} />
        )}
        <strong>
          {{
            board: "板书讲解",
            story: "动态绘本",
            variants: "变式练习",
            illustrations: "故事插图",
            tts: "语音朗读",
            explanation: "逐步讲解",
          }[job.kind] || "生成任务"}
        </strong>
        <span className="badge neutral">
          {
            {
              queued: "排队中",
              running: "制作中",
              completed: "已完成",
              failed: "未完成",
            }[job.status]
          }
        </span>
      </div>
      <p>{job.error || job.message}</p>
      {!["completed", "failed"].includes(job.status) && (
        <div className="progress-track">
          <i style={{ width: (job.progress || 5) + "%" }} />
        </div>
      )}
      {scenes.length > 0 && (
        <details
          className="scene-explanation"
          open={job.status !== "completed"}
        >
          <summary>查看逐步讲解</summary>
          {scenes.map((scene, i) => (
            <div key={i}>
              <strong>
                {i + 1}. {scene.title}
              </strong>
              <p>{scene.text || scene.narration}</p>
            </div>
          ))}
        </details>
      )}
      {job.status === "completed" && (r.url || r.videoUrl) && (
        <>
          {job.kind === "tts" ? (
            <audio controls src={r.url} />
          ) : (
            <video controls preload="metadata" src={r.url || r.videoUrl} />
          )}
          <a
            className="text-btn"
            href={(r.url || r.videoUrl) + "?download=1"}
            download
          >
            <Download size={16} />
            {job.kind === "tts" ? "下载音频" : "下载 MP4"}
          </a>
        </>
      )}
      {Array.isArray(r.images) && (
        <>
          <div className="generated-images">
            {r.images.map((url: string, i: number) => (
              <a key={i} href={url} target="_blank" rel="noreferrer">
                <img src={url} alt={"生成插图 " + (i + 1)} loading="lazy" />
              </a>
            ))}
          </div>
          {onUseImages && (
            <button
              className="btn secondary full"
              onClick={() => onUseImages(job.id)}
            >
              用这组插图制作绘本
              <ArrowRight size={16} />
            </button>
          )}
        </>
      )}
      {job.status === "failed" && (
        <button
          className="text-btn"
          onClick={async () => {
            try {
              const d = await api("jobs/" + job.id + "/retry", {});
              onRetry?.(d.job);
              setErr("");
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
        >
          <RefreshCw size={14} />
          保留素材，重试这一步
        </button>
      )}
      <ErrorBox message={err} />
      {r.source && (
        <span className="muted">
          {r.source === "qwen"
            ? "千问生成插图"
            : r.source === "sample" || r.source === "demo"
              ? "原创演示素材"
              : r.source === "deepseek"
                ? "DeepSeek 实时讲解"
                : r.source === "kokoro"
                  ? "Kokoro 本地朗读"
                  : r.source === "demo-system-voice"
                    ? "系统演示朗读"
                    : r.source}
          {r.voiceSource === "demo-system-voice"
            ? " · 系统演示配音"
            : r.voiceSource === "kokoro"
              ? " · Kokoro 配音"
              : ""}
        </span>
      )}
    </div>
  );
}
function JobHistory({ kinds }: { kinds?: string[] }) {
  const [jobs, setJobs] = useState<Job[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const load = () =>
      api("jobs")
        .then((d) => {
          if (alive) {
            setJobs(d.jobs || []);
            setError("");
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  const visible = jobs
    .filter((j) => !kinds || kinds.includes(j.kind))
    .slice(0, 10);
  return (
    <section className="panel job-history">
      <div className="section-heading">
        <div>
          <h2>我的生成记录</h2>
          <p>后台任务会持续保存，刷新页面也能回来查看。</p>
        </div>
        <span className="badge neutral">最近 10 条</span>
      </div>
      {error ? (
        <p className="muted">{error}</p>
      ) : visible.length ? (
        visible.map((j) => (
          <details
            key={j.id}
            open={j.status === "queued" || j.status === "running"}
          >
            <summary>
              <span>
                {
                  {
                    board: "板书视频",
                    story: "动态绘本",
                    tts: "语音朗读",
                    explanation: "逐步讲解",
                    variants: "变式练习",
                    illustrations: "千问插图",
                  }[j.kind]
                }{" "}
                · {date(j.createdAt)}
              </span>
              <span className="badge neutral">
                {
                  {
                    queued: "排队中",
                    running: "制作中",
                    completed: "已完成",
                    failed: "未完成",
                  }[j.status]
                }
              </span>
            </summary>
            <JobCard
              job={j}
              onRetry={(next) =>
                setJobs((js) => js.map((x) => (x.id === next.id ? next : x)))
              }
            />
          </details>
        ))
      ) : (
        <p className="muted">
          还没有生成任务。可以先用演示题制作一段讲解视频。
        </p>
      )}
    </section>
  );
}

function Mistakes({
  start,
  skills,
}: {
  start: (c: StudyConfig) => void;
  skills: Skill[];
}) {
  const [data, setData] = useState<Obj | null>(null),
    [filter, setFilter] = useState("all"),
    [error, setError] = useState("");
  useEffect(() => {
    api("mistakes")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  const items = (data?.mistakes || []).filter(
    (x: Obj) =>
      filter === "all" ||
      (filter === "due" && !x.resolved) ||
      x.question.skillId === filter,
  );
  return (
    <>
      <PageTitle
        eyebrow="MISTAKES HELP US GROW"
        title="把不会的，变成会的"
        desc="每一道错题，都藏着下一次进步的机会。"
      />
      <div className="review-banner">
        <div className="review-banner-icon">
          <NotebookPen size={30} />
        </div>
        <div>
          <h3>
            {data?.dueCount
              ? `有 ${data.dueCount} 道题，等你回来看看`
              : "给知识一点时间，也给自己一次复习"}
          </h3>
          <p>订正后第 1、3、7 天复习，让记忆更牢固。</p>
        </div>
        <button
          className="btn primary"
          onClick={() => start({ phase: "practice" })}
        >
          开始巩固
          <ArrowRight size={17} />
        </button>
      </div>
      <div className="filter-tabs">
        <button
          className={filter === "all" ? "selected" : ""}
          onClick={() => setFilter("all")}
        >
          全部错题 <span>{data?.mistakes?.length || 0}</span>
        </button>
        <button
          className={filter === "due" ? "selected" : ""}
          onClick={() => setFilter("due")}
        >
          需要巩固
        </button>
        <select
          value={skills.some((s) => s.id === filter) ? filter : ""}
          onChange={(e) => setFilter(e.target.value || "all")}
          aria-label="按知识点筛选"
        >
          <option value="">所有知识点</option>
          {skills.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <ErrorBox message={error} />
      {!data && !error ? (
        <Loading />
      ) : items.length ? (
        <div className="mistakes-list">
          {items.map((m: Obj, i: number) => (
            <article className="panel mistake-card" key={m.question.id}>
              <div className="mistake-top">
                <span className="question-index">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="badge neutral">
                  {skills.find((s) => s.id === m.question.skillId)?.name}
                </span>
                <span className={"badge " + (m.resolved ? "green" : "orange")}>
                  {m.resolved
                    ? "复习完成"
                    : m.corrected
                      ? "已订正 · 待复习"
                      : "待订正"}
                </span>
                <span className="muted right-align">
                  {m.attempt?.createdAt ? date(m.attempt.createdAt) : ""}
                  {m.attempt?.sample ? " · 演示记录" : ""}
                </span>
              </div>
              <h3>{m.question.text}</h3>
              <div className="mistake-answers">
                <span>
                  你的答案 <b>{m.attempt?.answer || "—"}</b>
                </span>
                <span>
                  正确答案 <strong>{m.answer}</strong>
                </span>
              </div>
              <p>{m.explanation}</p>
              <div className="mistake-bottom">
                <span>
                  <Clock size={14} />
                  {m.dueAt
                    ? "下次复习：" + date(m.dueAt)
                    : "完成订正后安排复习"}
                </span>
                <button
                  className="text-btn"
                  onClick={() =>
                    start({
                      phase: "practice",
                      skillId: m.question.skillId,
                      questionId: m.question.id,
                    })
                  }
                >
                  再练一次
                  <ArrowRight size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon={CheckCircle2}
          title="还没有错题，继续探索吧"
          desc="完成练习后，需要巩固的题目会自动保存在这里。"
        >
          <button
            className="btn primary"
            onClick={() => start({ phase: "practice" })}
          >
            去练习
            <ArrowRight size={16} />
          </button>
        </Empty>
      )}
    </>
  );
}

function PhotoExplanation({ explanation, steps, notify }: { explanation?: string; steps?: string[]; notify: (text: string) => void }) {
  return <section className="photo-explanation">
    <div className="section-heading compact"><h3><Sparkles size={18} /> 小芽讲解</h3><span className="badge neutral">AI 参考 · 待核对</span></div>
    <p>{explanation || "本次识别没有返回完整讲解，请确认题目后向小芽提问。"}</p>
    {!!steps?.length && <ol>{steps.map((step, i) => <li key={i}>{step}</li>)}</ol>}
    {explanation && <SpeechButton prefetch text={[explanation, ...(steps || [])].join("\n")} />}
  </section>;
}

function Photo({
  student,
  skills,
  notify,
  onContext,
  onCoach,
}: {
  student: Student;
  skills: Skill[];
  notify: (s: string) => void;
  onContext: (q: PublicQuestion | null) => void;
  onCoach: (q: PublicQuestion) => void;
}) {
  const [cropIndex, setCropIndex] = useState<number | null>(null),
    [files, setFiles] = useState<File[]>([]),
    [previews, setPreviews] = useState<string[]>([]),
    [draft, setDraft] = useState<Obj | null>(null),
    [saved, setSaved] = useState<Obj | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [job, setJob] = useState<Job | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach(URL.revokeObjectURL);
  }, [files]);
  useEffect(() => {
    if (!job || ["completed", "failed"].includes(job.status)) return;
    const t = setInterval(
      () =>
        api("jobs/" + job.id)
          .then((d) => setJob(d.job || d))
          .catch(() => {}),
      1800,
    );
    return () => clearInterval(t);
  }, [job?.id, job?.status]);
  async function recognize() {
    setBusy(true);
    setError("");
    try {
      const f = new FormData();
      files.forEach((x) => f.append("images", x));
      f.append("grade", String(student.grade));
      const d = await api("imports", f);
      setDraft({ ...d.draft, grade: student.grade });
      setSaved(null);
      setJob(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function sample() {
    setError("");
    try {
      const d = await api("questions?phase=practice");
      const q = d.questions?.[0];
      if (q) {
        setSaved(q);
        onContext(q);
        setDraft(null);
        notify("已载入演示题，未进行照片识别");
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function confirm() {
    if (busy || !draft) return;
    setBusy(true);
    setError("");
    try {
      const d = await api("questions/confirm", draft);
      const q = d.question || d;
      setSaved({ ...q, explanation: draft?.explanation, steps: draft?.steps });
      setDraft(null);
      onContext(q);
      const queued = await api("jobs", {
        kind: "board",
        input: { questionId: q.id, version: q.version },
      });
      setJob(queued.job || queued);
      notify("已开始生成讲解视频，请查看下方进度");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    if (!saved || busy || (job && ["queued", "running"].includes(job.status))) return;
    setBusy(true);
    setError("");
    try {
      const d = await api("jobs", {
        kind: "board",
        input: { questionId: saved.id, version: saved.version },
      });
      setJob(d.job || d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="LET’S FIGURE IT OUT"
        title="一道题，讲明白"
        desc="拍下不会的题，小芽带你一步一步找到方法。"
      />
      <div className="photo-layout">
        <section className="panel">
          <div className="section-heading compact">
            <h3>1. 上传题目</h3>
            <span className="badge neutral">一次一道题</span>
          </div>
          <div
            className="upload-zone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const fs = Array.from(e.dataTransfer.files);
              if (
                fs.length > 3 ||
                fs.some(
                  (f) =>
                    f.size > 10 * 1024 * 1024 ||
                    !["image/jpeg", "image/png", "image/webp"].includes(f.type),
                )
              )
                return setError("请选择最多3张JPEG、PNG或WebP，每张不超过10MB");
              setFiles(fs);
            }}
          >
            <div className="upload-icon">
              <Camera size={30} />
            </div>
            <h3>把题目放到这里</h3>
            <p>拖入图片，或从设备中选择</p>
            <button
              className="btn secondary"
              onClick={() => input.current?.click()}
            >
              <Plus size={17} />
              选择题目图片
            </button>
            <small>JPG / JPEG / PNG / WebP · 最多 3 张 · 每张 ≤ 10MB</small>
            <p className="hint-small">拍清题干和全部选项；阅读题请同时上传对应短文。PDF、HEIC 请先转成上述图片格式。</p>
            <input
              ref={input}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => {
                const fs = Array.from(e.target.files || []);
                if (fs.length > 3 || fs.some((f) => f.size > 10 * 1024 * 1024))
                  return setError("最多3张，每张不超过10MB");
                setFiles(fs);
                setError("");
              }}
            />
          </div>
          {previews.length > 0 && (
            <div className="upload-previews">
              {previews.map((p, i) => (
                <div key={p}>
                  <img src={p} alt={"题目图片" + (i + 1)} />
                  <button
                    className="crop-trigger"
                    onClick={() => setCropIndex(i)}
                    aria-label={"裁剪第" + (i + 1) + "张题目"}
                  >
                    裁剪
                  </button>
                  <button
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    aria-label="移除图片"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <ErrorBox message={error} />
          <button
            className="btn primary full"
            onClick={recognize}
            disabled={!files.length || busy}
          >
            {busy ? (
              <Loader2 className="spin" size={17} />
            ) : (
              <Sparkles size={17} />
            )}
            识别这道题
          </button>
          <div className="sample-divider">也可以先体验一下</div>
          <button className="btn subtle full" onClick={sample}>
            <FileText size={17} />
            使用一道人教方向演示样题
          </button>
          <div className="hint-small">
            请保留完整题干、选项与阅读文章。图片识别需要配置 DeepSeek 密钥。
          </div>
        </section>
        <section className="panel photo-result">
          <div className="section-heading compact">
            <h3>2. 看讲解，弄懂这道题</h3>
            {saved && (
              <SourceBadge
                source={saved.source === "sample" ? "demo" : "live"}
              />
            )}
          </div>
          {draft ? (
            <div className="draft-form">
              <div className="photo-recognized">
                <h3>{draft.text}</h3>
                <div className="static-options">{draft.options?.map((option: string, i: number) => <p key={i}><b>{String.fromCharCode(65 + i)}.</b>{option}</p>)}</div>
                <p>AI 参考答案：<strong>{draft.answer}</strong></p>
              </div>
              <PhotoExplanation explanation={draft.explanation} steps={draft.steps} notify={notify} />
              <details className="photo-edit" open={!draft.skillId || undefined}>
                <summary>核对或修改题干、选项和知识点{!draft.skillId ? "（请选择知识点）" : ""}</summary>
                <div className="draft-form">
              <label>
                题干
                <textarea
                  value={draft.text || ""}
                  onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                />
              </label>
              <label>
                阅读材料（如有）
                <textarea
                  value={draft.passage || ""}
                  onChange={(e) =>
                    setDraft({ ...draft, passage: e.target.value })
                  }
                />
              </label>
              <label>
                题型
                <select
                  value={draft.type || "choice"}
                  onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                >
                  <option value="choice">选择题</option>
                  <option value="fill">填空题</option>
                </select>
              </label>
              {draft.type !== "fill" && (
                <label>
                  选项（每行一个）
                  <textarea
                    value={(draft.options || []).join("\n")}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        options: e.target.value.split("\n").filter(Boolean),
                      })
                    }
                  />
                </label>
              )}
              <label>
                AI 参考答案
                <input
                  value={draft.answer || ""}
                  onChange={(e) =>
                    setDraft({ ...draft, answer: e.target.value })
                  }
                />
              </label>
              <label>
                知识点
                <select
                  value={draft.skillId || ""}
                  onChange={(e) =>
                    setDraft({ ...draft, skillId: e.target.value })
                  }
                >
                  <option value="">请选择</option>
                  {skills
                    .filter((s) => s.grade === student.grade)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </label>
              <p className="muted">
                请核对识别结果。AI 参考答案待教师审核，不计入正式成绩。
              </p>
                </div>
              </details>
              <p className="hint-small">核对题目后，点击下方按钮即可生成带语音的讲解视频。</p>
              <button
                className="btn primary"
                onClick={confirm}
                disabled={
                  busy || !draft.text || !draft.answer || !draft.skillId
                }
              >
                {busy ? <Loader2 className="spin" size={17} /> : <Video size={17} />}
                {busy ? "正在提交视频任务…" : "确认并生成讲解视频"}
              </button>
            </div>
          ) : saved ? (
            <div className="saved-question">
              <button className="btn primary" onClick={() => onCoach(saved as PublicQuestion)}>
                <MessageCircle size={17} /> 带着这道题，和小芽一起分析
              </button>
              {saved.passage && (
                <div className="passage">
                  <p>{saved.passage}</p>
                </div>
              )}
              <h2>{saved.text}</h2>
              {saved.explanation && <PhotoExplanation explanation={saved.explanation} steps={saved.steps} notify={notify} />}
              <div className="static-options">
                {saved.options?.map((o: string, i: number) => (
                  <p key={i}>
                    <b>{String.fromCharCode(65 + i)}.</b>
                    {o}
                  </p>
                ))}
              </div>
              <div className="flow-chips">
                <span>读懂题目</span>
                <ChevronRight size={14} />
                <span>找到线索</span>
                <ChevronRight size={14} />
                <span>学会方法</span>
              </div>
              <button className="btn primary" onClick={generate} disabled={busy || (!!job && ["queued", "running"].includes(job.status))}>
                <Video size={17} />
                {busy ? "正在提交视频任务…" : job?.status === "running" || job?.status === "queued" ? "视频正在制作，请查看下方进度" : "生成板书讲解视频"}
              </button>
              <p className="hint-small">
                视频在后台制作，可在此查看进度。生成失败可以保留素材后重试。
              </p>
              {job && <JobCard job={job} onRetry={setJob} />}
            </div>
          ) : (
            <Empty
              icon={BookOpen}
              title="好问题，值得慢慢讲"
              desc="上传题目后，在这里核对识别结果，再让小芽制作逐步讲解。"
            />
          )}
        </section>
      </div>
      {cropIndex !== null && files[cropIndex] && (
        <PhotoCropper
          file={files[cropIndex]}
          onClose={() => setCropIndex(null)}
          onSave={(f) => {
            setFiles(files.map((x, i) => (i === cropIndex ? f : x)));
            setCropIndex(null);
          }}
        />
      )}
      <JobHistory kinds={["board", "explanation"]} />
    </>
  );
}

function Stories({
  stories,
  grade,
  notify,
}: {
  stories: Story[];
  grade: number;
  notify: (s: string) => void;
}) {
  const [selected, setSelected] = useState<Story | null>(null),
    [scene, setScene] = useState(0),
    [playing, setPlaying] = useState(false),
    [preparing, setPreparing] = useState(false),
    [speed, setSpeed] = useState(1),
    [job, setJob] = useState<Job | null>(null),
    [answers, setAnswers] = useState<Record<number, string>>({}),
    [quizResult, setQuizResult] = useState<Obj | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const speechRequest = useRef(0);
  useEffect(() => {
    setJob(null);
    if (selected)
      api("jobs")
        .then((d) => {
          const found = d.jobs?.find(
            (j: Job) => j.input.storyId === selected.id && j.kind === "story",
          );
          if (found) setJob(found);
        })
        .catch(() => {});
  }, [selected?.id]);
  useEffect(() => {
    if (!job || ["completed", "failed"].includes(job.status)) return;
    const t = setInterval(
      () =>
        api("jobs/" + job.id)
          .then((d) => setJob(d.job || d))
          .catch(() => {}),
      1800,
    );
    return () => clearInterval(t);
  }, [job?.id, job?.status]);
  useEffect(
    () => () => {
      speechRequest.current++;
      audio.current?.pause();
    },
    [],
  );
  async function play() {
    if (!selected || preparing) return;
    if (playing) {
      audio.current?.pause();
      setPlaying(false);
      return;
    }
    const requestId = ++speechRequest.current;
    try {
      setPreparing(true);
      const d = await speechResult(selected.scenes[scene].narration);
      if (requestId !== speechRequest.current) return;
      audio.current = new Audio(d.url);
      audio.current.playbackRate = speed;
      audio.current.onended = () => setPlaying(false);
      await audio.current.play();
      setPlaying(true);
    } catch (e) {
      setPlaying(false);
      notify((e as Error).message);
    } finally {
      if (requestId === speechRequest.current) setPreparing(false);
    }
  }
  function change(i: number) {
    speechRequest.current++;
    setPreparing(false);
    audio.current?.pause();
    setPlaying(false);
    setScene(i);
  }
  async function generate(
    kind: "story" | "illustrations" = "story",
    illustrationJobId?: string,
  ) {
    try {
      const d = await api("jobs", {
        kind,
        input: { storyId: selected!.id, illustrationJobId },
      });
      setJob(d.job || d);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function quiz() {
    try {
      const d = await api("story-quiz", {
        storyId: selected!.id,
        answers: selected!.questions.map((_, i) => answers[i] || ""),
      });
      setQuizResult(d);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="A SMALL STORY, A BIG WORLD"
        title="故事放映室"
        desc="让英语变成一个看得见、听得到的小世界。"
      />
      {!selected ? (
        <div className="story-grid">
          {stories
            .filter((s) => s.grade === grade)
            .map((s) => (
              <button
                className="story-card"
                key={s.id}
                onClick={() => {
                  setSelected(s);
                  setScene(0);
                }}
              >
                <div className="story-cover">
                  <img src={s.cover} alt={s.title} />
                  <span className="play-circle">
                    <Play fill="currentColor" size={25} />
                  </span>
                  <span className="story-grade">{s.grade}年级 · 6 页绘本</span>
                </div>
                <div>
                  <span className="lesson-kicker">STORY TIME</span>
                  <h2>{s.title}</h2>
                  <h4>{s.subtitle}</h4>
                  <p>{s.description}</p>
                  <span className="text-btn">
                    打开这个故事
                    <ArrowRight size={17} />
                  </span>
                </div>
              </button>
            ))}
          <div className="story-placeholder">
            <Leaf size={34} />
            <h3>每一个故事，都是一扇窗</h3>
            <p>
              示例绘本使用原创插图。
              <br />
              接入千问后，可在故事中重新生成配图。
            </p>
            <div className="flow-chips">
              <span>看故事</span>
              <span>听英语</span>
              <span>懂文章</span>
            </div>
          </div>
        </div>
      ) : (
        <>
          <button
            className="text-btn back"
            onClick={() => {
              speechRequest.current++;
              setPreparing(false);
              audio.current?.pause();
              setSelected(null);
              setPlaying(false);
            }}
          >
            <ArrowLeft size={17} />
            返回故事列表
          </button>
          <div className="story-player-layout">
            <section className="panel story-player">
              <div className="story-stage">
                <img
                  src={selected.scenes[scene].image || selected.cover}
                  alt={selected.scenes[scene].title}
                />
                <span className="story-page">
                  {scene + 1} / {selected.scenes.length}
                </span>
                <div className="story-caption">
                  <h3>{selected.scenes[scene].text}</h3>
                </div>
              </div>
              <div className="story-controls">
                <button
                  className="icon-btn"
                  aria-label="上一页"
                  disabled={scene === 0}
                  onClick={() => change(scene - 1)}
                >
                  <ArrowLeft size={20} />
                </button>
                <button
                  className="btn primary"
                  onClick={play}
                  disabled={preparing}
                >
                  {preparing ? (
                    <Loader2 size={17} className="spin" />
                  ) : playing ? (
                    <Pause size={17} />
                  ) : (
                    <Volume2 size={17} />
                  )}
                  {preparing
                    ? "准备音频…"
                    : playing
                      ? "暂停朗读"
                      : "朗读这一页"}
                </button>
                <button
                  className="icon-btn"
                  aria-label="下一页"
                  disabled={scene === selected.scenes.length - 1}
                  onClick={() => change(scene + 1)}
                >
                  <ArrowRight size={20} />
                </button>
                <select
                  aria-label="朗读速度"
                  className="speed-select"
                  value={speed}
                  onChange={(e) => {
                    setSpeed(Number(e.target.value));
                    if (audio.current)
                      audio.current.playbackRate = Number(e.target.value);
                  }}
                >
                  <option value={0.8}>慢速 0.8×</option>
                  <option value={1}>正常 1×</option>
                  <option value={1.2}>1.2×</option>
                </select>
                <div className="spacer" />
                <SourceBadge source="demo" />
              </div>
              <div className="story-thumbnails">
                {selected.scenes.map((s, i) => (
                  <button
                    key={i}
                    className={scene === i ? "selected" : ""}
                    onClick={() => change(i)}
                  >
                    <img
                      src={s.image || selected.cover}
                      alt={"第" + (i + 1) + "页"}
                    />
                    <span>{i + 1}</span>
                  </button>
                ))}
              </div>
            </section>
            <aside>
              <section className="panel">
                <span className="lesson-kicker">
                  {selected.grade} 年级 · 英语阅读
                </span>
                <h2>{selected.title}</h2>
                <p className="muted">{selected.description}</p>
                <div className="divider" />
                <h3>把故事带走</h3>
                <p className="muted">合成配音与字幕，下载完整动态绘本。</p>
                <button className="btn primary full" onClick={() => generate()}>
                  <Video size={16} />
                  制作绘本 MP4
                </button>
                <button
                  className="btn subtle full"
                  onClick={() => generate("illustrations")}
                >
                  <Sparkles size={16} />
                  用千问重新生成插图
                </button>
                <p className="hint-small">
                  重新生图需要百炼密钥，生成结果保存在任务中，不自动替换已审核素材。
                </p>
                {job && (
                  <JobCard
                    job={job}
                    onUseImages={(id) => generate("story", id)}
                    onRetry={setJob}
                  />
                )}
              </section>
            </aside>
          </div>
          <section className="panel story-quiz">
            <div className="section-heading">
              <div>
                <h2>故事看懂了吗？</h2>
                <p>想一想，再选出你的答案。</p>
              </div>
              <span className="badge green">阅读理解</span>
            </div>
            {selected.questions.map((q, i) => (
              <div className="quiz-question" key={i}>
                <h3>
                  {i + 1}. {q.text}
                </h3>
                <div>
                  {q.options.map((o) => (
                    <button
                      className={
                        "quiz-option " + (answers[i] === o ? "selected" : "")
                      }
                      key={o}
                      onClick={() => setAnswers({ ...answers, [i]: o })}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button
              className="btn primary"
              disabled={Object.keys(answers).length < selected.questions.length}
              onClick={quiz}
            >
              检查我的理解
              <CheckCircle2 size={17} />
            </button>
            {quizResult && (
              <div className="hint-box">
                本次答对 {quizResult.correct ?? quizResult.score} /{" "}
                {quizResult.total} 题。
                {quizResult.explanation || "再回到故事里，找找每道题的依据吧。"}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

function Report({ student }: { student: Student }) {
  const [data, setData] = useState<Obj | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api("reports")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  const sum = data?.summary || {};
  return (
    <>
      <PageTitle
        eyebrow="EVERY STEP COUNTS"
        title="每一步成长，都看得见"
        desc={student.name + "的英语学习报告 · 辅导过程与独立表现分别记录"}
      >
        <button className="btn secondary" onClick={() => window.print()}>
          <Download size={17} />
          打印 / 保存报告
        </button>
      </PageTitle>
      <ErrorBox message={error} />
      {!data && !error ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="report-banner">
              <div>
                <span className="badge green">学习成长档案</span>
                <h2>
                  {student.name}
                  <small>{student.grade} 年级 · 英语</small>
                </h2>
                <p>记录尝试，关注变化，一起找到下一步。</p>
              </div>
              <div className="report-seal">
                <Leaf size={32} />
                <span>
                  GROW WITH
                  <br />
                  EVERY STEP
                </span>
              </div>
            </div>
            <CoachingHistory studentId={student.id} />
            <div className="stats-grid">
              <Stat
                icon={BookOpen}
                label="已完成作答"
                value={sum.answered ?? sum.total ?? 0}
                suffix="道"
                note={
                  "真实作答 " +
                  (sum.realCount || 0) +
                  " 条 · 演示 " +
                  (sum.sampleCount || 0) +
                  " 条"
                }
              />
              <Stat
                icon={Target}
                color="blue"
                label="独立答题正确率"
                value={
                  sum.independentCount ? pct(sum.independentAccuracy) : "—"
                }
                suffix={sum.independentCount ? "%" : ""}
                note="辅助后答对不混入独立成绩"
              />
              <Stat
                icon={NotebookPen}
                color="orange"
                label="需要继续巩固"
                value={data.mistakes?.length || sum.mistakeCount || 0}
                suffix="道"
                note="用新题和延迟复测检验掌握"
              />
            </div>
            <div className="two-panels report-panels">
              <section className="panel">
                <h3>知识点表现</h3>
                <p className="muted">按独立作答统计；题数较少时，仅供观察。</p>
                {data.skills?.map((s: Obj) => (
                  <div className="report-skill" key={s.id}>
                    <div>
                      <strong>{s.name}</strong>
                      <span>
                        {s.independentCount
                          ? `${s.independentCorrect} / ${s.independentCount} 题`
                          : "暂无独立作答"}
                      </span>
                    </div>
                    <div className="progress-track">
                      <i style={{ width: pct(s.independentAccuracy) + "%" }} />
                    </div>
                  </div>
                ))}
              </section>
              <section className="panel">
                <h3>测评对比</h3>
                <p className="muted">
                  不同题目，同样的知识点与难度范围。延迟测评未强制等待天数，仅供流程演示。
                </p>
                {data.assessments?.length ? (
                  <div className="assessment-history">
                    {data.assessments.map((a: Obj) => (
                      <div key={a.id}>
                        <span className="icon-badge blue">
                          <FileText size={19} />
                        </span>
                        <div>
                          <strong>{phaseName[a.phase]}</strong>
                          <small>
                            {date(a.completedAt || a.createdAt)}
                            {a.sample ? " · 演示" : ""}
                          </small>
                        </div>
                        <b>
                          {a.score}
                          <small> / {a.total || 8}</small>
                        </b>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty
                    icon={Target}
                    title="等你完成第一次测评"
                    desc="完成前测与后测后，这里会显示真实对比。"
                  />
                )}
              </section>
            </div>
            <section className="panel reading-report">
              <div className="section-heading">
                <div>
                  <h2>阅读理解练习</h2>
                  <p>阅读记录单独保存，不混入独立测评成绩。</p>
                </div>
                <span className="badge green">
                  {data.reading?.attempts || 0} 次练习
                </span>
              </div>
              {data.reading?.history?.length ? (
                <div className="reading-history">
                  {data.reading.history.slice(0, 5).map((r: Obj) => (
                    <div key={r.id}>
                      <BookOpen size={17} />
                      <strong>{r.title}</strong>
                      <span>{date(r.createdAt)}</span>
                      <b>
                        {r.score} / {r.total} 题
                      </b>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">
                  去故事放映室读一个故事，完成后的记录会出现在这里。
                </p>
              )}
            </section>
            <section className="panel recommendations">
              <div className="section-heading compact">
                <h3>
                  <Sparkles size={19} />
                  接下来，重点练这些
                </h3>
                <span className="badge neutral">基于作答记录</span>
              </div>
              {(data.recommendations?.length
                ? data.recommendations
                : ["先完成一次课前小测，建立学习起点。"]
              ).map((r: any, i: number) => (
                <div key={i}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <p>{typeof r === "string" ? r : r.text || r.description}</p>
                </div>
              ))}
              <div className="report-disclaimer">
                <ShieldCheck size={16} />
                报告只反映本 Demo
                内的作答与测评，不等同于学校考试成绩或完整知识掌握评估。
              </div>
            </section>
          </>
        )
      )}
    </>
  );
}

function Teacher({
  enabled,
  switchRole,
  onChange,
  notify,
}: {
  enabled: boolean;
  switchRole: () => void;
  onChange: () => void;
  notify: (s: string) => void;
}) {
  const [data, setData] = useState<Obj | null>(null),
    [error, setError] = useState(""),
    [edits, setEdits] = useState<Record<string, string>>({});
  useEffect(() => {
    if (enabled)
      api("teacher")
        .then(setData)
        .catch((e) => setError(e.message));
  }, [enabled]);
  async function approve(q: Obj) {
    try {
      await api("teacher/review", {
        questionId: q.id,
        answer: edits[q.id] || q.answer,
        approved: true,
      });
      notify("已审核并保存题目版本");
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!enabled)
    return (
      <Empty
        icon={GraduationCap}
        title="进入教师演示工作台"
        desc="在本地 Demo 中切换角色，查看班级数据与内容审核。"
      >
        <button className="btn primary" onClick={switchRole}>
          切换教师视角
        </button>
      </Empty>
    );
  return (
    <>
      <PageTitle
        eyebrow="SUPPORT EVERY LITTLE GROWTH"
        title="教师工作台"
        desc="看见每个孩子的薄弱点，把课堂时间用在真正需要的地方。"
      >
        <span className="badge orange">本地演示身份 · 非正式账号系统</span>
      </PageTitle>
      <ErrorBox message={error} />
      {!data && !error ? (
        <Loading />
      ) : (
        data && (
          <>
            <section className="panel">
              <div className="section-heading">
                <h2>班级学习概览</h2>
                <span className="badge neutral">6 名示例学生</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>学生</th>
                      <th>年级</th>
                      <th>作答数</th>
                      <th>首次独立正确率</th>
                      <th>到期复习</th>
                      <th>记录来源</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.students?.map((s: Obj) => (
                      <tr key={s.id}>
                        <td>
                          <span
                            className="table-avatar"
                            style={{ background: s.color }}
                          >
                            {s.avatar || s.name?.slice(-1)}
                          </span>
                          <strong>{s.name}</strong>
                        </td>
                        <td>{s.grade} 年级</td>
                        <td>{s.stats?.answered ?? s.answered ?? 0}</td>
                        <td>
                          {s.independentCount
                            ? pct(s.independentAccuracy) + "%"
                            : "—"}
                        </td>
                        <td>{s.dueReviews ?? s.mistakeCount ?? 0} 道</td>
                        <td>
                          <span className="badge neutral">演示 + 实际作答</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="panel teacher-review">
              <div className="section-heading">
                <div>
                  <h2>题目与答案审核</h2>
                  <p>AI 新生成内容审核后才能用于正式测评。</p>
                </div>
                <span className="badge orange">
                  {data.reviewQuestions?.length || 0} 待审核
                </span>
              </div>
              {data.reviewQuestions?.length ? (
                data.reviewQuestions.map((q: Obj) => (
                  <div className="review-question" key={q.id}>
                    <span className="badge neutral">
                      {q.source === "photo" ? "拍照导入" : "AI 生成"} · v
                      {q.version}
                    </span>
                    <h3>{q.text}</h3>
                    <p>{q.explanation}</p>
                    <label>
                      参考答案
                      <input
                        value={edits[q.id] ?? q.answer}
                        onChange={(e) =>
                          setEdits({ ...edits, [q.id]: e.target.value })
                        }
                      />
                    </label>
                    <button className="btn primary" onClick={() => approve(q)}>
                      <CheckCircle2 size={17} />
                      审核并保存
                    </button>
                  </div>
                ))
              ) : (
                <Empty
                  icon={ShieldCheck}
                  title="暂无待审核内容"
                  desc="拍题导入与 AI 变式题会进入这里，供教师核对。"
                />
              )}
            </section>
          </>
        )
      )}
    </>
  );
}

function Settings({ boot, reload }: { boot: Obj; reload: () => void }) {
  const b = boot.budget || {},
    s = boot.status || {};
  return (
    <>
      <PageTitle
        eyebrow="A LITTLE CLASSROOM, UNDER CONTROL"
        title="连接与用量"
        desc="服务端保存密钥，本地保存学习记录与生成素材。"
      >
        <button className="btn secondary" onClick={reload}>
          <RefreshCw size={16} />
          刷新状态
        </button>
      </PageTitle>
      <div className="two-panels">
        <section className="panel">
          <h2>模型连接</h2>
          {[
            {
              name: "DeepSeek Flash",
              desc: "讲题、拍题识别与语音转写",
              ok: s.deepseek,
            },
            {
              name: "千问 Image 2.1 Turbo",
              desc: "北京地域 · 绘本角色与场景插图",
              ok: s.qwen,
            },
            {
              name: "Kokoro 本地双语朗读",
              desc: "CPU 运行 · 生成音频文件",
              ok: s.tts,
            },
            {
              name: "FFmpeg 视频合成",
              desc: "板书与绘本 · MP4 输出",
              ok: s.ffmpeg,
            },
          ].map((x) => (
            <div className="service-row" key={x.name}>
              <span className={"service-dot " + (x.ok ? "online" : "")} />
              <div>
                <strong>{x.name}</strong>
                <p>{x.desc}</p>
              </div>
              <span className={"badge " + (x.ok ? "green" : "neutral")}>
                {x.ok ? "已配置" : "待配置"}
              </span>
            </div>
          ))}
          <div className="hint-box">
            <ShieldCheck size={18} />
            <span>
              云服务未配置时，示例课程仍可使用。照片识别与新插图生成会明确提示配置状态。
            </span>
          </div>
        </section>
        <section className="panel budget-panel">
          <span className="icon-badge orange">
            <Wallet size={23} />
          </span>
          <h2>Demo 预算</h2>
          <div className="budget-total">
            <strong>¥{Number(b.spent ?? b.totalSpent ?? 0).toFixed(2)}</strong>
            <span>/ ¥90 可调用额度</span>
          </div>
          <div className="progress-track">
            <i
              style={{
                width:
                  Math.min(
                    100,
                    (Number(b.spent ?? b.totalSpent ?? 0) / 90) * 100,
                  ) + "%",
              }}
            />
          </div>
          <p className="muted">总预算 ¥100，预留 ¥10 处理计费差额。</p>
          <div className="budget-lines">
            <div>
              <span>文字与图片理解</span>
              <b>¥80 上限</b>
            </div>
            <div>
              <span>千问插图</span>
              <b>¥5 上限</b>
            </div>
            <div>
              <span>语音识别</span>
              <b>¥5 上限</b>
            </div>
            <div>
              <span>在途任务预留</span>
              <b>¥{Number(b.reserved ?? b.totalReserved ?? 0).toFixed(2)}</b>
            </div>
          </div>
          <p className="hint-small">
            调用前预留费用，达到上限停止新增付费任务。实际费用以服务商账单为准。
          </p>
        </section>
      </div>
      <section className="panel setup-guide">
        <h2>接入真实 AI</h2>
        <p>
          在项目的服务端环境配置中填写以下项目，然后重新启动。请勿将密钥填入聊天或前端代码。
        </p>
        <div className="config-grid">
          <div>
            <code>DEEPSEEK_API_KEY</code>
            <span>DeepSeek 平台 API 密钥</span>
          </div>
          <div>
            <code>DASHSCOPE_API_KEY</code>
            <span>阿里云百炼北京地域 API 密钥</span>
          </div>
          <div>
            <code>KOKORO_MODEL_DIR</code>
            <span>本地双语语音模型目录（安装脚本可自动设置默认路径）</span>
          </div>
        </div>
      </section>
      <JobHistory />
    </>
  );
}

function Tutor({
  question,
  close,
  notify,
}: {
  question: PublicQuestion | null;
  close: () => void;
  notify: (s: string) => void;
}) {
  const [messages, setMessages] = useState<
      { role: string; text: string; source?: string }[]
    >([
      {
        role: "assistant",
        text: "嗨，我是小芽 🌱\n可以问我当前的题目，也可以让我解释一个英语单词。我们一起找到方法！",
        source: "demo",
      },
    ]),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [recording, setRecording] = useState(false),
    [transcribing, setTranscribing] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    chunks = useRef<Blob[]>([]),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  async function send(value = text) {
    if (!value.trim() || busy) return;
    setMessages((m) => [...m, { role: "user", text: value }]);
    setText("");
    setBusy(true);
    try {
      const d = await api("tutor", {
        message: value,
        questionId: question?.id,
      });
      setMessages((m) => [
        ...m,
        { role: "assistant", text: d.text, source: d.source },
      ]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: (e as Error).message, source: "error" },
      ]);
    } finally {
      setBusy(false);
    }
  }
  async function record() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "";
      const r = new MediaRecorder(
        stream.current,
        mime ? { mimeType: mime } : undefined,
      );
      recorder.current = r;
      chunks.current = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      r.onstop = async () => {
        setRecording(false);
        stream.current?.getTracks().forEach((t) => t.stop());
        if (timer.current) clearTimeout(timer.current);
        setTranscribing(true);
        try {
          const f = new FormData();
          f.append(
            "audio",
            new Blob(chunks.current, { type: r.mimeType }),
            "question.webm",
          );
          const d = await api("asr", f);
          setText(d.text);
          notify("已转为文字，请核对后发送");
        } catch (e) {
          notify((e as Error).message);
        } finally {
          setTranscribing(false);
        }
      };
      r.start();
      setRecording(true);
      timer.current = setTimeout(
        () => r.state === "recording" && r.stop(),
        30000,
      );
    } catch {
      notify("无法使用麦克风，请允许录音权限或直接输入文字");
    }
  }
  return (
    <div className="tutor-panel">
      <div className="tutor-header">
        <img src="/mascot.svg" alt="小芽" />
        <div>
          <strong>小芽学习伙伴</strong>
          <span>
            <i />
            陪你一起想明白
          </span>
        </div>
        <button className="icon-btn" onClick={close} aria-label="关闭助教">
          <X size={20} />
        </button>
      </div>
      {question && (
        <div className="tutor-context">
          <BookOpen size={14} />
          <span>正在讨论：{question.text}</span>
        </div>
      )}
      <div className="tutor-messages">
        {messages.map((m, i) => (
          <div key={i} className={"chat-bubble " + m.role}>
            <p>{m.text}</p>
            {m.role === "assistant" && (
              <div className="chat-meta">
                <small>
                  {["live", "deepseek"].includes(m.source || "")
                    ? "实时 AI"
                    : m.source === "error"
                      ? "服务提示"
                      : "演示助教"}
                </small>
                <SpeechButton className="coach-read" label="朗读回答" text={m.text} prefetch={i === messages.length - 1 && ["live", "deepseek"].includes(m.source || "")} />
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="chat-thinking">
            <span />
            <span />
            <span />
            小芽正在想一想
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="tutor-suggestions">
        {["给我一点提示", "解释题目里的单词"].map((t) => (
          <button key={t} onClick={() => send(t)} disabled={busy}>
            {t}
          </button>
        ))}
      </div>
      <div className="tutor-input">
        <textarea
          aria-label="向小芽提问"
          autoFocus
          placeholder={
            recording
              ? "正在录音，点击停止…"
              : transcribing
                ? "正在转写…"
                : "哪里没听懂？问问小芽…"
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div>
          <button
            className={"icon-btn " + (recording ? "recording" : "")}
            onClick={record}
            disabled={transcribing}
            aria-label={recording ? "停止录音" : "开始语音提问"}
          >
            {recording ? <StopCircle size={19} /> : <Mic size={19} />}
          </button>
          <span>{recording ? "最多 30 秒" : "语音转写后可修改"}</span>
          <button
            className="send-btn"
            onClick={() => send()}
            disabled={!text.trim() || busy || recording}
            aria-label="发送问题"
          >
            <Send size={17} />
          </button>
        </div>
      </div>
      <p className="tutor-disclaimer">
        AI 讲解供学习参考，有疑问请向老师确认。
      </p>
    </div>
  );
}
