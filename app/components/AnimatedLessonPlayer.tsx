"use client";
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2, MessageCircle, Pause, Play, RotateCcw, X } from 'lucide-react';
import type { AnimatedLesson, LessonScene } from '@/lib/animated-lessons';
import { prepareSpeech, stopSpeech } from './speech';

function SceneArt({ visual }: { visual: LessonScene['visual'] }) {
  return <svg className={`lesson-scene-art ${visual}`} viewBox="0 0 440 240" role="img" aria-label={{ table: '孩子把盘子摆到餐桌上', plant: '给盆栽浇水', friends: '两个朋友一起分享书本', reading: '翻开书本，寻找阅读线索' }[visual]}>
    <rect x="12" y="12" width="416" height="216" rx="28" fill="#e5f1e8" />
    <circle cx="355" cy="57" r="25" fill="#f2d88e" />
    {visual === 'table' ? <>
      <path d="M80 170H355V184H80Z M105 184V220 M330 184V220" fill="#af825c" stroke="#af825c" strokeWidth="10" />
      <g className="lesson-place-plate"><ellipse cx="230" cy="160" rx="43" ry="12" fill="#fff" stroke="#608c8b" strokeWidth="4" /><ellipse cx="230" cy="159" rx="28" ry="6" fill="#dceced" /></g>
      <path d="M292 143V168 M287 143V150 M297 143V150" stroke="#608c8b" strokeWidth="4" strokeLinecap="round" />
      <circle cx="112" cy="72" r="24" fill="#efc49f" /><path d="M87 70Q87 35 122 48L136 64" fill="#395b50" />
      <path d="M89 105Q111 90 134 105L147 167H76Z" fill="#eab963" /><path className="lesson-help-arm" d="M130 112L177 137L205 135" fill="none" stroke="#efc49f" strokeWidth="15" strokeLinecap="round" />
    </> : visual === 'plant' ? <>
      <path d="M206 171H279L267 218H217Z" fill="#d7a07a" /><path d="M243 173V105" stroke="#42846d" strokeWidth="7" />
      <g className="lesson-leaves" fill="#6fa274"><ellipse cx="222" cy="131" rx="25" ry="12" transform="rotate(30 222 131)" /><ellipse cx="263" cy="112" rx="25" ry="12" transform="rotate(-30 263 112)" /></g>
      <g className="lesson-watering"><path d="M101 69H157L170 120H105Z M156 98L201 83L207 94L165 118" fill="#69a6b2" /><path d="M104 78C60 67 69 119 105 105" fill="none" stroke="#69a6b2" strokeWidth="10" /></g>
      <g className="lesson-drops" fill="#56a8cd"><circle cx="212" cy="105" r="4" /><circle cx="221" cy="121" r="4" /><circle cx="233" cy="98" r="4" /></g>
    </> : visual === 'friends' ? <>
      <g className="lesson-friend"><circle cx="142" cy="85" r="29" fill="#e7b58f" /><path d="M112 80Q111 43 151 56L172 79" fill="#41534b" /><path d="M109 126Q142 110 176 126L186 210H99Z" fill="#e6b45f" /></g>
      <g className="lesson-friend second"><circle cx="294" cy="85" r="29" fill="#efc9a4" /><path d="M263 80Q265 41 306 58L325 80" fill="#654f44" /><path d="M260 126Q294 109 327 126L337 210H250Z" fill="#7daaa1" /></g>
      <path d="M174 143Q196 134 220 149Q245 134 267 143V198Q244 191 220 202Q195 190 174 198Z" fill="#fff" stroke="#578b80" strokeWidth="4" /><path d="M220 149V202" stroke="#578b80" strokeWidth="3" />
    </> : <>
      <path d="M77 62Q145 40 220 72Q295 40 363 62V195Q293 175 220 207Q146 175 77 195Z" fill="#fff" stroke="#6c9a8c" strokeWidth="5" /><path d="M220 72V207" stroke="#6c9a8c" strokeWidth="4" />
      <path d="M103 92H184 M103 115H188 M103 138H180 M250 92H332 M250 115H334 M250 138H322" stroke="#b9d3c8" strokeWidth="8" strokeLinecap="round" />
      <rect className="lesson-evidence" x="97" y="107" width="98" height="17" rx="7" fill="#f2d88e" opacity=".6" />
      <g className="lesson-search"><circle cx="292" cy="149" r="24" fill="#dff3f2" fillOpacity=".5" stroke="#397d79" strokeWidth="7" /><path d="M310 168L339 197" stroke="#397d79" strokeWidth="10" strokeLinecap="round" /></g>
    </>}
  </svg>;
}

export default function AnimatedLessonPlayer({ bookId, unitId, mode, onClose, onAsk }: { bookId: string; unitId: string; mode: string; onClose: () => void; onAsk: () => void }) {
  const [lesson, setLesson] = useState<AnimatedLesson | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('小芽正在准备动画讲稿…');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [readyCount, setReadyCount] = useState(0);
  const [retry, setRetry] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const prepared = useRef<Map<number, ReturnType<typeof prepareSpeech>>>(new Map());
  const [rate, setRate] = useState(1);
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    stopSpeech();
    const stop = () => { audio.current?.pause(); setPlaying(false); };
    window.addEventListener('sprout-stop-lesson-audio', stop);
    fetch('/api/animated-lesson', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookId, unitId, mode }), signal: controller.signal })
      .then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error || '讲稿准备失败'); return data.lesson as AnimatedLesson; })
      .then(async next => {
        if (!alive) return;
        if (next.scenes.every(scene=>scene.audio)) {
          next.scenes.forEach((scene,index)=>prepared.current.set(index,Promise.resolve(scene.audio!)));
          setReadyCount(next.scenes.length); setLesson(next); setStatus('整课语音已提前准备，点击即可播放');
          return;
        }
        setLesson(next); setStatus('正在准备第 1 幕语音，画面和讲稿可以先看。');
        // Sequential prefetch avoids flooding the single local synthesis worker.
        for (let i = 0; i < next.scenes.length && alive; i++) {
          const promise = prepared.current.get(i) || prepareSpeech(next.scenes[i].narration); prepared.current.set(i, promise);
          try { await promise; if (alive) { setReadyCount(n => n + 1); if (i === 0) { setStatus('语音已准备，点击播放动画'); } } }
          catch (e) { prepared.current.delete(i); if (alive && i === 0) { setError((e as Error).message); setStatus('语音未准备好，可点击播放重试'); } }
        }
      }).catch(e => { if (alive) { setError(e.message); setStatus('讲稿准备失败，请返回重试'); } });
    return () => { alive = false; controller.abort(); audio.current?.pause(); window.removeEventListener('sprout-stop-lesson-audio', stop); };
  }, [bookId, unitId, mode]);
  useEffect(() => {
    if (!lesson || !playing) { audio.current?.pause(); return; }
    let alive = true;
    stopSpeech(); setError('');
    const scene = lesson.scenes[index];
    async function play() {
      try {
        let next = audio.current?.dataset.scene === String(index) ? audio.current : null;
        if (!next) {
          setStatus(`正在准备第 ${index + 1} 幕语音…`);
          let promise = prepared.current.get(index);
          if (!promise) { promise = scene.audio ? Promise.resolve(scene.audio) : prepareSpeech(scene.narration); prepared.current.set(index, promise); }
          const result = await promise;
          if (!alive) return;
          next = new Audio(result.url); next.preload = 'auto'; next.dataset.scene = String(index); audio.current = next;
        }
        const activeAudio = next;
        next.playbackRate = rate;
        next.ontimeupdate = () => { if (alive) setProgress(activeAudio.currentTime / (activeAudio.duration || 1)); };
        next.onended = () => { if (!alive) return; audio.current = null; setProgress(0); if (index + 1 < lesson!.scenes.length) setIndex(index + 1); else { setPlaying(false); setStatus('这一课听完了，试着用自己的话说一说吧'); } };
        next.onerror = () => { if (alive) { setError('音频播放失败，请重试'); setPlaying(false); audio.current = null; } };
        await next.play(); if (alive) setStatus('正在播放');
      } catch (e) { if (alive) { prepared.current.delete(index); setError((e as Error).name === 'NotAllowedError' ? '浏览器需要再点一次播放才能出声。' : (e as Error).message); setPlaying(false); } }
    }
    void play();
    return () => { alive = false; audio.current?.pause(); };
  }, [lesson, index, playing, retry, rate]);
  function jump(next: number) { audio.current?.pause(); audio.current = null; setProgress(0); setIndex(next); setStatus('点击播放，听这一幕'); }
  const scene = lesson?.scenes[index];
  const subtitles = scene?.narration.match(/[^。！？.!?]+[。！？.!?]*/g) || [];
  const subtitle = subtitles[Math.min(subtitles.length - 1, Math.floor(progress * subtitles.length))];
  return <section className="animated-lesson panel" aria-label="动画讲解课堂">
    <div className="lesson-header"><div><span className="eyebrow">小芽动画课堂 · {lesson?.source === 'deepseek' ? 'AI 讲课' : '原创教案'}</span><h2>{lesson?.title || '正在准备这一课'}</h2></div><button className="btn secondary" onClick={onClose}><X size={16} />返回单元</button></div>
    {!scene ? <p role="status"><Loader2 className="spin" size={18} /> {status}</p> : <>
      <div className={`lesson-stage ${playing && status === '正在播放' ? 'is-playing' : 'is-paused'}`} key={index}>
        <div className="lesson-scene-top"><span>第 {index + 1} / {lesson!.scenes.length} 幕</span><strong>{scene.title}</strong></div>
        <SceneArt visual={scene.visual} />
        <div className="lesson-word-cards">{scene.words.map((word, i) => <span key={word} style={{ animationDelay: `${i * .35}s` }}>{word}</span>)}</div>
        <div className="lesson-subtitle">{subtitle}</div>
      </div>
      <div className="lesson-playback-progress" role="progressbar" aria-label="本幕播放进度" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progress * 100}%` }} /></div>
      <div className="lesson-controls"><button className="btn secondary" disabled={index === 0} onClick={() => jump(index - 1)} aria-label="上一幕"><ArrowLeft size={18} /></button><button className="btn primary" onClick={() => { setPlaying(v => !v); if (playing) setStatus('已暂停'); }}>{playing ? <Pause size={18} /> : <Play size={18} />}{playing ? '暂停' : '播放动画'}</button><button className="btn secondary" onClick={() => { jump(index); setRetry(v => v + 1); setPlaying(true); }}><RotateCcw size={16} />重播本幕</button><button className="btn secondary" disabled={index === lesson!.scenes.length - 1} onClick={() => jump(index + 1)} aria-label="下一幕"><ArrowRight size={18} /></button><label>语速 <select value={rate} onChange={e => setRate(Number(e.target.value))}><option value={.85}>慢一点</option><option value={1}>正常</option><option value={1.15}>快一点</option></select></label></div>
      <p className="lesson-status" role="status">{status} · 已准备 {readyCount}/{lesson!.scenes.length} 幕语音</p>
      <details className="lesson-transcript"><summary>查看本幕完整讲稿</summary><p>{scene.narration}</p></details>
      <div className="lesson-think"><strong>停下来想一想</strong><p>{scene.prompt}</p><button className="btn secondary" onClick={() => { audio.current?.pause(); setPlaying(false); onAsk(); }}><MessageCircle size={16} />这一点我还不懂，问小芽</button></div>
      <p className="coach-source-note">新版人教 PEP 单元主题配套原创动画课；不是教材原文动画。学习观看不计入测评成绩。{lesson?.source === 'offline' ? '当前使用离线原创教案。' : '旁白由 DeepSeek 根据原创教案生成。'}</p>
    </>}
    {error && <p className="error-box" role="alert">{error}</p>}
  </section>;
}
