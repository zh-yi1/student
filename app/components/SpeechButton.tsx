"use client";
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Loader2, Square, Volume2 } from 'lucide-react';
import { playSpeech, prepareSpeech, speechStore, stopSpeech } from './speech';

export default function SpeechButton({ text, label = '听讲解', className = 'btn secondary', prefetch = false }: { text: string; label?: string; className?: string; prefetch?: boolean }) {
  const [prepared, setPrepared] = useState(false);
  useEffect(() => { let alive=true; setPrepared(false); if(prefetch) void prepareSpeech(text).then(()=>{if(alive)setPrepared(true);}).catch(()=>{}); return()=>{alive=false;}; },[prefetch,text]);
  const state = useSyncExternalStore(speechStore.subscribe, speechStore.snapshot, speechStore.server);
  const current = state.text === text;
  const preparing = current && state.status === 'preparing';
  const playing = current && state.status === 'playing';
  return <span className="speech-control"><button type="button" className={className} aria-busy={preparing} onClick={() => preparing || playing ? stopSpeech() : void playSpeech(text).catch(() => {})}>
    {preparing ? <Loader2 size={16} className="spin" /> : playing ? <Square size={16} /> : <Volume2 size={16} />}
    {preparing ? '正在准备语音… 点此取消' : playing ? '停止朗读' : label}
  </button>{prepared && !preparing && !playing && <small>语音已提前备好</small>}{preparing && <small role="status">这段新讲解正在合成；已准备的语音会直接复用。</small>}{current && state.status === 'error' && <small role="alert">{state.message}</small>}</span>;
}
