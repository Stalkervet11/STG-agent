import React, { useState, useEffect, useCallback } from 'react';
import { ViewMode } from '../../types';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { StubTooltip } from '../StubTooltip/StubTooltip';
import {
  Mic,
  MicOff,
  Wifi,
  Minimize2,
  Maximize2,
  X,
  Radio,
  Sliders,
  Terminal,
  Layers,
  Loader2,
} from 'lucide-react';

interface HeaderProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  coreState: string;
}

const MODES = [
  { key: 'minimal' as const, label: 'Minimal', icon: Radio },
  { key: 'full' as const, label: 'Dev Center', icon: Layers },
  { key: 'aider' as const, label: 'Aider Studio', icon: Terminal },
  { key: 'settings' as const, label: 'Settings', icon: Sliders },
];

const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function formatTime(): { timeStr: string; dateStr: string } {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');
  return {
    timeStr: `${hours}:${mins}`,
    dateStr: `${DAY_NAMES[now.getDay()]}, ${now.getDate()} ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`,
  };
}

export const Header: React.FC<HeaderProps> = React.memo(({
  viewMode,
  onViewModeChange,
  coreState,
}) => {
  const [time, setTime] = useState(formatTime);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingMic, setIsProcessingMic] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setTime(formatTime()), 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Обработчик кнопки микрофона ──
  const handleMicClick = useCallback(async () => {
    if (isRecording || isProcessingMic) return;

    setIsProcessingMic(true);
    setMicError(null);
    setIsRecording(true);

    try {
      const recognizedText = await invoke<string>('start_voice_input');
      if (recognizedText && recognizedText.trim()) {
        window.dispatchEvent(
          new CustomEvent('jarvis-execute-command', { detail: recognizedText.trim() })
        );
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[Header:Mic]', errMsg);
      setMicError(errMsg);
      setTimeout(() => setMicError(null), 4000);
    } finally {
      setIsRecording(false);
      setIsProcessingMic(false);
    }
  }, [isRecording, isProcessingMic]);

  // ── Синхронизация с голосовым бэкендом ──
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<{ state: string; message: string }>('assistant-state', (event) => {
      if (event.payload?.state === 'recording') {
        setIsRecording(true);
      } else if (event.payload?.state === 'idle' || event.payload?.state === 'processing') {
        setIsRecording(false);
      }
    }).then((fn) => { unlisten = fn; }).catch(() => {});

    return () => { if (unlisten) unlisten(); };
  }, []);

  return (
    <header className="h-16 border-b border-cyan-500/15 bg-[#090a0f]/90 backdrop-blur-xl px-5 flex items-center justify-between select-none z-40">
      {/* App Branding */}
      <div className="flex items-center gap-3">
        <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-600/20 border border-cyan-500/40 shadow-[0_0_15px_rgba(0,240,255,0.25)]">
          <div className="w-4 h-4 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
          <div className="absolute w-1.5 h-1.5 rounded-full bg-purple-400" />
        </div>
        <div>
          <h1 className="text-sm font-bold tracking-widest text-white uppercase font-mono flex items-center gap-2">
            JARVIS <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">OS 3.0</span>
          </h1>
          <p className="text-[10px] font-mono tracking-wider text-slate-400">FEDORA NEURAL CORE</p>
        </div>
      </div>

      {/* Center Time & Mode Selector */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0e111a] border border-slate-800 shadow-inner">
          {MODES.map(({ key, label, icon: Icon }) => {
            const isActive = viewMode === key;
            const activeClass = key === 'aider'
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-[0_0_12px_rgba(168,85,247,0.25)]'
              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_12px_rgba(0,240,255,0.25)]';
            return (
              <button
                key={key}
                onClick={() => onViewModeChange(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all duration-200 flex items-center gap-1.5 ${
                  isActive ? activeClass : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col items-center justify-center px-4 py-1 rounded-xl bg-[#0e111a]/80 border border-cyan-500/20 shadow-[0_0_15px_rgba(0,240,255,0.08)]">
          <div className="text-base font-bold font-mono tracking-widest text-cyan-300">{time.timeStr}</div>
          <div className="text-[9px] font-mono tracking-wider text-slate-400">{time.dateStr}</div>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-4">
        {micError && (
          <div className="absolute top-16 right-4 z-50 px-3 py-2 rounded-xl bg-red-500/20 border border-red-500/40 text-[11px] font-mono text-red-300 max-w-xs shadow-[0_0_20px_rgba(239,68,68,0.3)]">
            {micError}
          </div>
        )}

        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#0e111a] border border-emerald-500/30 text-[11px] font-mono text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <StubTooltip reason="задержка симулируется, реальный пинг будет из Rust"><span>Operational (142ms)</span></StubTooltip>
        </div>

        <div className="flex items-center gap-2 text-slate-400">
          {/* ── MIC BUTTON ── */}
          <button
            onClick={handleMicClick}
            disabled={isProcessingMic}
            className={`p-1.5 rounded-lg transition-all duration-200 ${
              isRecording
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.4)]'
                : isProcessingMic
                ? 'bg-yellow-500/10 text-yellow-400 cursor-wait'
                : 'hover:bg-slate-800 text-slate-300 hover:text-cyan-400'
            }`}
            title={
              isRecording
                ? 'Recording...'
                : isProcessingMic
                ? 'Processing speech...'
                : 'Voice input (whisper.cpp)'
            }
          >
            {isProcessingMic ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isRecording ? (
              <MicOff className="w-4 h-4" />
            ) : (
              <Mic className="w-4 h-4 text-cyan-400" />
            )}
          </button>
          <StubTooltip reason="статус сети (будет из systemd-networkd)"><button className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 transition-colors"><Wifi className="w-4 h-4 text-purple-400" /></button></StubTooltip>
        </div>

        <div className="flex items-center gap-1 border-l border-slate-800 pl-3">
          <StubTooltip reason="управление окном Tauri (в разработке)"><button className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"><Minimize2 className="w-3.5 h-3.5" /></button></StubTooltip>
          <StubTooltip reason="управление окном Tauri (в разработке)"><button className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"><Maximize2 className="w-3.5 h-3.5" /></button></StubTooltip>
          <StubTooltip reason="закрытие окна Tauri (в разработке)"><button className="p-1.5 rounded-lg hover:bg-red-500/20 hover:text-red-400 text-slate-400 transition-colors"><X className="w-3.5 h-3.5" /></button></StubTooltip>
        </div>
      </div>
    </header>
  );
});
