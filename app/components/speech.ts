"use client";

type SpeechResult = { url: string; source: string; duration: number };
type SpeechState = { text: string; status: 'idle' | 'preparing' | 'playing' | 'error'; message?: string };
let audio: HTMLAudioElement | undefined;
let generation = 0;
let state: SpeechState = { text: '', status: 'idle' };
const initial = state;
const listeners = new Set<() => void>();
function update(next: SpeechState) { state = next; listeners.forEach(fn => fn()); }
export const speechStore = { subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }, snapshot: () => state, server: () => initial };

async function request(path: string, body?: unknown) {
  const response = await fetch(`/api/${path}`, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '音频准备失败，请重试');
  return data;
}
export async function prepareSpeech(text: string): Promise<SpeechResult> {
  const data = await request('tts', { text });
  if (!data.job) return data;
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 800));
    const { job } = await request(`jobs/${data.job.id}`);
    if (job.status === 'completed') return job.result;
    if (job.status === 'failed') throw new Error(job.error || '朗读生成失败');
  }
  throw new Error('语音仍在后台排队，请稍后重试；已生成的音频会自动复用。');
}
export function stopSpeech() { generation++; audio?.pause(); audio = undefined; update({ text: '', status: 'idle' }); }
export async function playSpeech(text: string, rate = 1) {
  if (state.text === text && state.status === 'preparing') return;
  stopSpeech();
  // Animation lessons use the same event to avoid overlapping narration.
  window.dispatchEvent(new Event('sprout-stop-lesson-audio'));
  const token = generation;
  update({ text, status: 'preparing' });
  try {
    const result = await prepareSpeech(text);
    if (token !== generation) return;
    audio = new Audio(result.url); audio.playbackRate = rate;
    audio.onended = () => { if (token === generation) update({ text, status: 'idle' }); };
    audio.onerror = () => { if (token === generation) update({ text, status: 'error', message: '音频播放失败，请重试' }); };
    await audio.play();
    if (token === generation) update({ text, status: 'playing' });
  } catch (error) {
    if (token !== generation) return;
    update({ text, status: 'error', message: (error as Error).message });
    throw error;
  }
}
