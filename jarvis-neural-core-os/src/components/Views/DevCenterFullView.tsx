import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CoreState, SystemMetrics } from '../../types';
import { VisualCore } from '../VisualCore/VisualCore';
import { useVoiceRecognition } from '../../hooks/useVoiceRecognition';
import { useOfflineVoiceRecognition } from '../../hooks/useOfflineVoiceRecognition';
import { parseIntent } from '../../services/intentParser';
import { invoke } from '@tauri-apps/api/core';
import { StubTooltip } from '../StubTooltip/StubTooltip';
import { getSystemMetrics } from '../../services/resourceManager';
import {
  Mic,
  MicOff,
  Send,
  Code,
  Monitor,
  Music,
  Bell,
  Search,
  CloudRain,
  Folder,
  Wifi,
  Calendar,
  CheckCircle,
  Mail,
  RefreshCw,
  Camera,
  Terminal,
  FileText,
  Plus,
} from 'lucide-react';

interface DevCenterFullViewProps {
  coreState: CoreState;
  onStateChange: (state: CoreState) => void;
  onExecuteCommand: (command: string) => void;
  isProcessing: boolean;
}

const VOICE_COMMANDS = [
  { label: '"Открой VS Code"', icon: Code, action: 'Open Visual Studio Code' as const },
  { label: '"Покажи статус системы"', icon: Monitor, action: 'Show me the system status' as const },
  { label: '"Включи lo-fi музыку"', icon: Music, action: 'Play lo-fi music' as const },
  { label: '"Напомни завтра в 9 утра"', icon: Bell, action: 'Remind me tomorrow at 9 AM' as const },
  { label: '"Найди новости AI"', icon: Search, action: 'Search for AI news' as const },
] as const;

const NETWORK_BAR_HEIGHTS = [40, 65, 30, 85, 45, 90, 60, 35, 70, 50, 80, 60, 45, 95, 70];

const WAVEFORM_BAR_COUNT = 32;
const WAVEFORM_HEIGHTS = Array.from(
  { length: WAVEFORM_BAR_COUNT },
  (_, i) => {
    const base = 20 + Math.sin(i * 0.5) * 60;
    return Math.min(100, Math.max(8, base));
  },
);

interface WaveformBarProps {
  height: number;
  index: number;
  audioLevel: number;
}

const WaveformBar = React.memo(({ height, index, audioLevel }: WaveformBarProps) => (
  <div
    className="w-1 bg-gradient-to-t from-cyan-500 to-purple-500 rounded-full transition-all duration-75"
    style={{
      height: `${Math.max(4, height * (0.3 + audioLevel * 0.7))}%`,
      animationDelay: `${index * 0.05}s`,
    }}
  />
));

export const DevCenterFullView: React.FC<DevCenterFullViewProps> = React.memo(({
  coreState,
  onStateChange,
  onExecuteCommand,
  isProcessing,
}) => {
  const [inputVal, setInputVal] = useState('');
  const [transcript, setTranscript] = useState('');
  const [metrics, setMetrics] = useState<SystemMetrics>({
    cpu: 23,
    ram: 45,
    gpu: 32,
    network: { upload: '48.7 Mbps', download: '32.1 Mbps' },
    latency: '142ms',
    temperature: '42°C',
    fanSpeed: '1800 RPM',
    uptime: '14d 6h',
    processes: [],
  });

  // ── ОФЛАЙН STT (whisper.cpp, приоритетный) ──
  const {
    isListening: offlineListening,
    isSupported: offlineSupported,
    error: offlineError,
    audioLevel,
    start: offlineStart,
    stop: offlineStop,
  } = useOfflineVoiceRecognition();

  // ── Web Speech API (фолбэк) ──
  const {
    isListening: webListening,
    transcript: webTranscript,
    isSupported: webSupported,
    error: webError,
    start: webStart,
    stop: webStop,
  } = useVoiceRecognition();

  const useOffline = offlineSupported;
  const isListening = useOffline ? offlineListening : webListening;

  // Синхронизируем транскрипт Web Speech API
  useEffect(() => {
    if (!useOffline && webTranscript) {
      setTranscript(webTranscript);
    }
  }, [useOffline, webTranscript]);

  // Fetch LIVE system metrics from Rust backend
  useEffect(() => {
    let cancelled = false;

    const fetchMetrics = async () => {
      try {
        const live = await getSystemMetrics();
        if (!cancelled) {
          setMetrics({
            cpu: live.cpu,
            ram: live.ram,
            gpu: live.gpu ?? 0,
            network: { upload: '--', download: '--' },
            latency: '--',
            temperature: live.cpu_temp ? `${live.cpu_temp.toFixed(0)}°C` : '--',
            fanSpeed: '--',
            uptime: `${Math.floor(live.uptime / 86400)}d ${Math.floor((live.uptime % 86400) / 3600)}h`,
            processes: [],
          });
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('[Metrics] Backend unavailable — using simulated data');
          setMetrics((prev) => ({
            ...prev,
            cpu: Math.floor(18 + Math.random() * 12),
            ram: 45,
            gpu: Math.floor(28 + Math.random() * 10),
          }));
        }
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleSend = useCallback(() => {
    if (!inputVal.trim()) return;
    onExecuteCommand(inputVal);
    setInputVal('');
  }, [inputVal, onExecuteCommand]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSend();
    },
    [handleSend],
  );

  // ── Микрофон: Push-to-Talk (зажал → говоришь → отпустил → отправил) ──
  // Двойной клик = toggle-режим для длинной диктовки.
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActiveRef = useRef(false);
  const [toggleLocked, setToggleLocked] = useState(false);

  const handleMicStart = useCallback(async () => {
    if (toggleLocked) return; // toggle-режим активен
    setTranscript('');
    holdActiveRef.current = true;
    if (useOffline) {
      await offlineStart();
    } else {
      webStart();
    }
  }, [useOffline, offlineStart, webStart, toggleLocked]);

  const handleMicStop = useCallback(async () => {
    if (toggleLocked) return;
    if (!holdActiveRef.current) return;
    holdActiveRef.current = false;

    let finalText = '';
    if (useOffline) {
      onStateChange('working');
      finalText = await offlineStop();
      setTranscript('');
    } else {
      finalText = webStop();
      setTranscript('');
    }

    if (!finalText || !finalText.trim()) {
      onStateChange('idle');
      return;
    }

    const parsed = parseIntent(finalText);

    if (parsed.action !== 'unknown') {
      onStateChange('working');
      try {
        const result = await invoke<string>('execute_command', {
          action: parsed.action,
          target: parsed.target,
        });
        onExecuteCommand('[OK] ' + result);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        onExecuteCommand('[ERR] ' + errMsg);
      }
      return;
    }

    onExecuteCommand(finalText);
  }, [useOffline, offlineStop, webStop, onExecuteCommand, onStateChange, toggleLocked]);

  // Двойной клик по микрофону = toggle-режим (ручной старт/стоп)
  const handleMicClick = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
      // Двойной клик = переключить toggle-режим
      setToggleLocked((prev) => !prev);
      if (toggleLocked) {
        // Выходим из toggle
        if (useOffline) offlineStop();
        else webStop();
      }
      return;
    }
    // Одиночный клик — ждём, может быть началом двойного
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      if (!holdActiveRef.current) {
        // Обычный одиночный клик = push-to-talk (mousedown уже сработал)
      }
    }, 300);
  }, [toggleLocked, useOffline, offlineStop, webStop]);

  // Toggle mode: ручной старт/стоп
  const handleToggleStartStop = useCallback(async () => {
    if (!toggleLocked) return;
    if (isListening) {
      let finalText = '';
      if (useOffline) {
        onStateChange('working');
        finalText = await offlineStop();
        setTranscript('');
      } else {
        finalText = webStop();
        setTranscript('');
      }
      if (finalText && finalText.trim()) {
        onExecuteCommand(finalText);
      } else {
        onStateChange('idle');
      }
    } else {
      setTranscript('');
      if (useOffline) await offlineStart();
      else webStart();
    }
  }, [toggleLocked, isListening, useOffline, offlineStop, webStop, offlineStart, webStart, onExecuteCommand, onStateChange]);

  // Логирование ошибок
  useEffect(() => {
    if (offlineError) console.warn('[OfflineSTT]', offlineError);
    if (webError) console.warn('[WebSTT]', webError);
  }, [offlineError, webError]);

  // Мемоизация waveform
  const waveformBars = useMemo(
    () => (
      <div className="flex items-center gap-1 h-5">
        {WAVEFORM_HEIGHTS.map((h, i) => (
          <WaveformBar key={i} height={h} index={i} audioLevel={isListening ? audioLevel : 0} />
        ))}
      </div>
    ),
    [isListening, audioLevel],
  );

  // Мемоизация network bars
  const networkBars = useMemo(
    () => (
      <div className="h-8 w-full flex items-end gap-1">
        {NETWORK_BAR_HEIGHTS.map((val, idx) => (
          <div
            key={idx}
            className="flex-1 bg-gradient-to-t from-purple-600 to-cyan-400 rounded-t-sm"
            style={{ height: `${val}%` }}
          />
        ))}
      </div>
    ),
    [],
  );

  return (
    <div className="flex-1 grid grid-cols-12 gap-5 p-5 bg-[#090a0f] text-slate-100 overflow-hidden relative select-none">
      {/* Background Cyberpunk Mesh Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(0,240,255,0.08),transparent_60%)] pointer-events-none" />

      {/* LEFT COLUMN: System Status, Network, Schedule, Notifications */}
      <div className="col-span-3 flex flex-col gap-4 overflow-y-auto pr-1 z-10">
        {/* System Status Widget */}
        <div className="p-4 rounded-2xl bg-[#0d0f18]/80 border border-slate-800/80 backdrop-blur-md shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-mono tracking-wider font-semibold uppercase text-slate-400 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />SYSTEM STATUS<span className="ml-2 px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-normal tracking-normal">LIVE</span></h3>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-xl bg-[#121624] border border-slate-800 flex flex-col items-center">
              <div className="w-12 h-12 rounded-full border-2 border-cyan-400 border-t-slate-700 flex items-center justify-center text-xs font-mono font-bold text-cyan-300">
                {metrics.cpu}%
              </div>
              <span className="text-[10px] font-mono text-slate-400 mt-1">CPU</span>
            </div>
            <div className="p-2 rounded-xl bg-[#121624] border border-slate-800 flex flex-col items-center">
              <div className="w-12 h-12 rounded-full border-2 border-purple-400 border-t-slate-700 flex items-center justify-center text-xs font-mono font-bold text-purple-300">
                {metrics.ram}%
              </div>
              <span className="text-[10px] font-mono text-slate-400 mt-1">RAM</span>
            </div>
            <div className="p-2 rounded-xl bg-[#121624] border border-slate-800 flex flex-col items-center">
              <div className="w-12 h-12 rounded-full border-2 border-emerald-400 border-t-slate-700 flex items-center justify-center text-xs font-mono font-bold text-emerald-300">
                {metrics.gpu}%
              </div>
              <span className="text-[10px] font-mono text-slate-400 mt-1">GPU</span>
            </div>
          </div>
        </div>

        {/* Network Widget */}
        <div className="p-4 rounded-2xl bg-[#0d0f18]/80 border border-slate-800/80 backdrop-blur-md shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-mono tracking-wider font-semibold uppercase text-slate-400">NETWORK<span className="ml-2 px-1.5 py-0.5 rounded text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/30 font-normal tracking-normal">STUB</span></h3>
            <Wifi className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="flex items-center justify-between text-xs font-mono mb-2">
            <span className="text-cyan-400 font-semibold">↑ {metrics.network.upload}</span>
            <span className="text-purple-400 font-semibold">↓ {metrics.network.download}</span>
          </div>
          {networkBars}
        </div>

        {/* Schedule Widget */}
        <div className="p-4 rounded-2xl bg-[#0d0f18]/80 border border-slate-800/80 backdrop-blur-md shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-mono tracking-wider font-semibold uppercase text-slate-400 flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-purple-400" />SCHEDULE<span className="ml-2 px-1.5 py-0.5 rounded text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/30 font-normal tracking-normal">STUB</span>
            </h3>
            <button className="text-[10px] font-mono text-cyan-400 hover:underline">View all &gt;</button>
          </div>
          <div className="space-y-2 text-xs font-mono">
            <div className="flex items-center gap-3 p-2 rounded-xl bg-[#121624] border border-slate-800">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              <span className="text-purple-300 font-bold">20:00</span>
              <span className="text-slate-300 truncate">Созвон проекта</span>
            </div>
            <div className="flex items-center gap-3 p-2 rounded-xl bg-[#121624] border border-slate-800">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span className="text-cyan-300 font-bold">21:30</span>
              <span className="text-slate-300 truncate">Спортзал</span>
            </div>
            <div className="flex items-center gap-3 p-2 rounded-xl bg-[#121624] border border-slate-800">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-emerald-300 font-bold">23:00</span>
              <span className="text-slate-300 truncate">Ревью кода</span>
            </div>
          </div>
        </div>

        {/* Notifications Widget */}
        <div className="p-4 rounded-2xl bg-[#0d0f18]/80 border border-slate-800/80 backdrop-blur-md shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-mono tracking-wider font-semibold uppercase text-slate-400 flex items-center gap-2">
              <Bell className="w-3.5 h-3.5 text-cyan-400" />NOTIFICATIONS<span className="ml-2 px-1.5 py-0.5 rounded text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/30 font-normal tracking-normal">STUB</span>
            </h3>
            <button className="text-[10px] font-mono text-slate-500 hover:text-slate-300">Clear all &gt;</button>
          </div>
          <div className="space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between p-2 rounded-xl bg-[#121624] border border-slate-800">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-slate-200">Доступно обновление</span>
              </div>
              <span className="text-[10px] text-slate-500">10м назад</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-xl bg-[#121624] border border-slate-800">
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-slate-200">Письмо от Алекса</span>
              </div>
              <span className="text-[10px] text-slate-500">35м назад</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-xl bg-[#121624] border border-slate-800">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-slate-200">Резервная копия готова</span>
              </div>
              <span className="text-[10px] text-slate-500">1ч назад</span>
            </div>
          </div>
        </div>
      </div>

      {/* CENTER COLUMN: Reactor Core + Voice + Input Bar */}
      <div className="col-span-6 flex flex-col items-center justify-between z-10 h-full">
        {/* Central Core HUD */}
        <div className="my-auto flex flex-col items-center">
          <VisualCore
            state={coreState}
            onStateChange={onStateChange}
            size={360}
            showStateControls={true}
            isAudioActive={isProcessing || coreState === 'working'}
          />

          <div className="mt-4 text-center">
            <h2
              className={`text-sm font-mono tracking-[0.3em] font-semibold uppercase ${
                isListening
                  ? 'text-red-400 animate-pulse'
                  : 'text-cyan-300 animate-pulse'
              }`}
            >
              {isListening ? 'R E C O R D I N G . . .' : 'L I S T E N I N G . . .'}
            </h2>
            <p className="text-xs font-mono text-slate-400 mt-1">
              {toggleLocked
                ? isListening
                  ? 'Запись... Нажмите микрофон для остановки'
                  : 'Toggle-режим. Нажмите для старта'
                : isListening
                ? 'Говорите... Отпустите микрофон для отправки'
                : useOffline
                ? 'Зажмите микрофон и говорите (двойной клик — toggle)'
                : webSupported
                ? 'Зажмите микрофон и говорите (двойной клик — toggle)'
                : 'Микрофон недоступен — вводите текст'}
            </p>
            {useOffline && (
              <p className="text-[10px] font-mono text-emerald-400/60 mt-0.5">
                🟢 Офлайн-режим (whisper.cpp)
              </p>
            )}
          </div>

          {/* Транскрипт Web Speech API */}
          {isListening && transcript && !useOffline && (
            <div className="mt-3 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/30 max-w-md text-center">
              <p className="text-xs font-mono text-red-300 italic leading-relaxed">
                &ldquo;{transcript}&rdquo;
              </p>
            </div>
          )}

          {/* Офлайн аудио-визуализация */}
          {isListening && useOffline && (
            <div className="mt-3 px-4 py-2 rounded-xl bg-purple-500/10 border border-purple-500/30 max-w-md text-center">
              <div className="flex items-center gap-0.5 justify-center h-6">
                {WAVEFORM_HEIGHTS.slice(0, 24).map((baseH, i) => {
                  const dynH = baseH * (0.3 + audioLevel * 0.7);
                  return (
                    <div
                      key={i}
                      className="w-1 bg-gradient-to-t from-cyan-500 to-purple-500 rounded-full transition-all duration-75"
                      style={{ height: `${Math.max(4, dynH)}%` }}
                    />
                  );
                })}
              </div>
              <p className="text-[10px] font-mono text-purple-300/70 mt-1">
                ● Запись (офлайн) ●
              </p>
            </div>
          )}
        </div>

        {/* Bottom Input Area */}
        <div className="w-full mt-auto space-y-3">
          {/* Voice Input Visualizer */}
          <div className="flex items-center justify-between px-6 py-2 rounded-2xl bg-[#0d0f18]/60 border border-slate-800/60 backdrop-blur-md">
            <span className="text-[10px] font-mono uppercase text-slate-400">
              {useOffline ? '🎤 ЗАЖМИТЕ-И-ГОВОРИТЕ (WHISPER.CPP)' : '🎤 ЗАЖМИТЕ-И-ГОВОРИТЕ'}
              {toggleLocked && <span className="ml-1 text-amber-400">TOGGLE</span>}
            </span>
            {waveformBars}
          </div>

          {/* Command Input Bar */}
          <div
            className={`relative flex items-center rounded-2xl px-4 py-3 backdrop-blur-xl transition-all duration-300 ${
              isListening
                ? 'bg-red-500/10 border-2 border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.3)]'
                : 'bg-[#0d0f18]/90 border border-cyan-500/30 shadow-[0_0_30px_rgba(0,240,255,0.12)]'
            }`}
          >
            <button
              onMouseDown={toggleLocked ? undefined : handleMicStart}
              onMouseUp={toggleLocked ? undefined : handleMicStop}
              onMouseLeave={toggleLocked ? undefined : handleMicStop}
              onTouchStart={toggleLocked ? undefined : handleMicStart}
              onTouchEnd={toggleLocked ? undefined : handleMicStop}
              onClick={toggleLocked ? handleToggleStartStop : handleMicClick}
              className={`p-2 rounded-full transition-all mr-2 ${
                toggleLocked
                  ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 animate-pulse border border-amber-500/40'
                  : isListening
                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 animate-pulse'
                  : useOffline
                  ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                  : 'bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20'
              }`}
              title={
                toggleLocked
                  ? isListening
                    ? 'Toggle: Остановить (двойной клик — выйти)'
                    : 'Toggle: Начать (двойной клик — выйти)'
                  : 'Зажмите и говорите (двойной клик — toggle)'
              }
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <input
              type="text"
              value={isListening && !useOffline ? transcript : inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isListening
                  ? useOffline
                    ? '● Запись офлайн...'
                    : 'Слушаю...'
                  : 'Введите команду или нажмите микрофон...'
              }
              readOnly={isListening}
              className={`flex-1 bg-transparent border-none outline-none text-sm font-mono placeholder-slate-500 ${
                isListening ? 'text-red-300' : 'text-white'
              }`}
            />
            <button
              onClick={handleSend}
              disabled={isProcessing || isListening}
              className="p-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white hover:opacity-90 shadow-[0_0_15px_rgba(0,240,255,0.4)] transition-all ml-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-mono text-slate-400 uppercase">БЫСТРЫЕ ДЕЙСТВИЯ<span className="ml-2 px-1.5 py-0.5 rounded text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/30 font-normal tracking-normal">STUB</span></span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onExecuteCommand('Take screenshot')}
                title="Screenshot"
                className="p-2.5 rounded-xl bg-[#0d0f18] border border-slate-800 hover:border-cyan-500/40 text-slate-300 hover:text-cyan-400 transition-all"
              >
                <Camera className="w-4 h-4" />
              </button>
              <button
                onClick={() => onExecuteCommand('напиши код оптимизацию производительности рендеринга')}
                title="Aider Code Studio"
                className="p-2.5 rounded-xl bg-[#0d0f18] border border-slate-800 hover:border-purple-500/40 text-slate-300 hover:text-purple-400 transition-all"
              >
                <Code className="w-4 h-4" />
              </button>
              <button
                onClick={() => onExecuteCommand('Open Linux terminal')}
                title="Terminal"
                className="p-2.5 rounded-xl bg-[#0d0f18] border border-slate-800 hover:border-cyan-500/40 text-slate-300 hover:text-cyan-400 transition-all"
              >
                <Terminal className="w-4 h-4" />
              </button>
              <button
                onClick={() => onExecuteCommand('Show documentation')}
                title="Docs"
                className="p-2.5 rounded-xl bg-[#0d0f18] border border-slate-800 hover:border-cyan-500/40 text-slate-300 hover:text-cyan-400 transition-all"
              >
                <FileText className="w-4 h-4" />
              </button>
              <button
                onClick={() => onExecuteCommand('Add new widget')}
                title="Add Widget"
                className="p-2.5 rounded-xl bg-[#0d0f18] border border-slate-800 hover:border-cyan-500/40 text-slate-300 hover:text-cyan-400 transition-all"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Voice Commands, Weather, Activity */}
      <div className="col-span-3 flex flex-col gap-4 overflow-y-auto pl-1 z-10">
        {/* Voice Commands Widget */}
        <div className="p-4 rounded-2xl bg-[#0d0f18]/80 border border-slate-800/80 backdrop-blur-md shadow-xl">
          <h3 className="text-xs font-mono tracking-wider font-semibold uppercase text-slate-400 mb-3 flex items-center gap-2">
            <Mic className="w-3.5 h-3.5 text-purple-400" />
            VOICE COMMANDS
          </h3>
          <div className="space-y-2">
            {VOICE_COMMANDS.map((vc, idx) => {
              const Icon = vc.icon;
              return (
                <button
                  key={idx}
                  onClick={() => onExecuteCommand(vc.action)}
                  className="w-full p-2.5 rounded-xl bg-[#121624] border border-slate-800 hover:border-cyan-500/40 hover:bg-cyan-500/10 text-left flex items-center gap-3 transition-all duration-200 group"
                >
                  <Icon className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-mono text-slate-300 truncate">{vc.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Weather Widget */}
        <div className="p-4 rounded-2xl bg-[#0d0f18]/80 border border-slate-800/80 backdrop-blur-md shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-mono tracking-wider font-semibold uppercase text-slate-400 flex items-center gap-2">
              <CloudRain className="w-3.5 h-3.5 text-cyan-400" />WEATHER<span className="ml-2 px-1.5 py-0.5 rounded text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/30 font-normal tracking-normal">STUB</span>
            </h3>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold font-mono text-white">17°</div>
              <div className="text-xs font-mono text-cyan-300">Небольшой дождь</div>
              <div className="text-[10px] font-mono text-slate-400">Ощущается как 16°</div>
            </div>
            <div className="relative w-20 h-16 flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/20 to-purple-600/30 blur-xl rounded-full" />
              <CloudRain className="w-12 h-12 text-cyan-400 animate-bounce relative z-10 drop-shadow-[0_0_15px_rgba(0,240,255,0.6)]" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/80 grid grid-cols-3 gap-1 text-[10px] font-mono text-slate-400 text-center">
            <div>
              <div>Влажность</div>
              <div className="text-white font-bold">82%</div>
            </div>
            <div>
              <div>Ветер</div>
              <div className="text-white font-bold">12 km/h</div>
            </div>
            <div>
              <div>AQI</div>
              <div className="text-emerald-400 font-bold">34</div>
            </div>
          </div>
        </div>

        {/* Current Activity Widget */}
        <div className="p-4 rounded-2xl bg-[#0d0f18]/80 border border-slate-800/80 backdrop-blur-md shadow-xl">
          <h3 className="text-xs font-mono tracking-wider font-semibold uppercase text-slate-400 mb-3">CURRENT ACTIVITY<span className="ml-2 px-1.5 py-0.5 rounded text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/30 font-normal tracking-normal">STUB</span></h3>
          <div className="p-3 rounded-xl bg-[#121624] border border-slate-800 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <Folder className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-mono text-slate-400">Работа над</div>
              <div className="text-xs font-mono font-bold text-white truncate">Проект JARVIS</div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                <div className="bg-gradient-to-r from-cyan-500 to-purple-500 h-full w-[72%]" />
              </div>
            </div>
            <span className="text-xs font-mono text-cyan-300 font-bold">72%</span>
          </div>
        </div>
      </div>
    </div>
  );
});
