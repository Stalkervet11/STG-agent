import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CoreState } from '../../types';
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
  Code2,
  Monitor,
  Music,
  Bell,
  Folder,
  Calendar,
  Sparkles,
} from 'lucide-react';

interface MinimalModeViewProps {
  coreState: CoreState;
  onStateChange: (state: CoreState) => void;
  onExecuteCommand: (command: string) => void;
  isProcessing: boolean;
}

// Стабильный массив вне компонента
const QUICK_CMDS = [
  { label: 'Код', icon: Code2, cmd: 'Open Visual Studio Code' },
  { label: 'Система', icon: Monitor, cmd: 'Show me the system status' },
  { label: 'Музыка', icon: Music, cmd: 'Play lo-fi music' },
  { label: 'Напоминания', icon: Bell, cmd: 'Remind me tomorrow at 9 AM' },
] as const;

// Пре-вычисленные высоты waveform-баров (без Math.random в рендере!)
const WAVEFORM_BAR_COUNT = 24;
const WAVEFORM_HEIGHTS = Array.from(
  { length: WAVEFORM_BAR_COUNT },
  (_, i) => 20 + Math.sin(i * 0.45) * 50,
);

export const MinimalModeView: React.FC<MinimalModeViewProps> = ({
  coreState,
  onStateChange,
  onExecuteCommand,
  isProcessing,
}) => {
  const [inputVal, setInputVal] = useState('');
  const [transcript, setTranscript] = useState('');
  const [sysMetrics, setSysMetrics] = useState({ cpu: 0, ram: 0, gpu: 0 });

  // Live system metrics
  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const m = await getSystemMetrics();
        if (!cancelled) setSysMetrics({ cpu: m.cpu, ram: m.ram, gpu: m.gpu ?? 0 });
      } catch { /* ignore */ }
    };
    fetch();
    const iv = setInterval(fetch, 3000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

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

  // Определяем, используем ли мы офлайн-режим
  const useOffline = offlineSupported;
  const isListening = useOffline ? offlineListening : webListening;

  // Синхронизируем транскрипт
  useEffect(() => {
    if (!useOffline && webTranscript) {
      setTranscript(webTranscript);
    }
  }, [useOffline, webTranscript]);

  // ── Отправка текстовой команды ──
  const handleSend = useCallback(() => {
    if (!inputVal.trim()) return;
    onExecuteCommand(inputVal);
    setInputVal('');
  }, [inputVal, onExecuteCommand]);

  // ── Микрофон: офлайн STT с фолбэком на Web Speech API ──
  const handleMicToggle = useCallback(async () => {
    if (isListening) {
      // ── ОСТАНОВКА ЗАПИСИ ──
      let finalText = '';

      if (useOffline) {
        // Офлайн-режим: ждём результат от whisper.cpp
        onStateChange('working');
        finalText = await offlineStop();
        setTranscript('');
      } else {
        // Web Speech API
        finalText = webStop();
        setTranscript('');
      }

      if (!finalText || !finalText.trim()) {
        onStateChange('idle');
        return;
      }

      // Парсим распознанный текст
      const parsed = parseIntent(finalText);

      if (parsed.action === 'unknown') {
        // Отправляем как текстовую команду (пойдёт в OpenRouter/LLM)
        onExecuteCommand(finalText);
      } else if (parsed.action === 'diagnostic') {
        // Системная диагностика всех модулей
        onStateChange('working');
        try {
          const report = await invoke('jarvis_diagnostic');
          const r = report as any;
          const summary = `Диагностика: ${r.total_score}
├─ OS: ${r.system.os} | CPU: ${r.system.cpu_cores} ядер | RAM: ${r.system.ram_total_gb}
├─ Ollama: ${r.ollama.available ? '✅' : '❌'} ${r.ollama.details}
├─ OpenRouter: ${r.openrouter.available ? '✅' : '❌'} ${r.openrouter.details}
├─ Whisper STT: ${r.whisper.available ? '✅' : '❌'} ${r.whisper.details}
├─ Piper TTS: ${r.piper_tts.available ? '✅' : '❌'} ${r.piper_tts.details}
├─ Obsidian Vault: ${r.obsidian_vault.available ? '✅' : '❌'} ${r.obsidian_vault.details}
├─ Browser: ${r.browser.available ? '✅' : '❌'}
└─ Aider: ${r.aider.available ? '✅' : '❌'}`;
          onExecuteCommand(summary);
        } catch (err: unknown) {
          onExecuteCommand('[ERR] Диагностика не удалась: ' + (err instanceof Error ? err.message : String(err)));
        }
      } else {
        // Голосовая команда → Tauri backend
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
      }
    } else {
      // ── СТАРТ ЗАПИСИ ──
      setTranscript('');
      if (useOffline) {
        await offlineStart();
      } else {
        webStart();
      }
    }
  }, [
    isListening,
    useOffline,
    offlineStop,
    webStop,
    offlineStart,
    webStart,
    onExecuteCommand,
    onStateChange,
  ]);

  // ── Логирование ошибок ──
  useEffect(() => {
    if (offlineError) console.warn('[OfflineSTT]', offlineError);
    if (webError) console.warn('[WebSTT]', webError);
  }, [offlineError, webError]);

  return (
    <div className="flex-1 flex items-center justify-between p-8 gap-8 bg-[#090a0f] text-slate-100 overflow-hidden relative">
      {/* Background Cyberpunk Grid Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(0,240,255,0.06),transparent_50%),radial-gradient(circle_at_70%_50%,rgba(168,85,247,0.06),transparent_50%)] pointer-events-none" />

      {/* Left Main Focus: Visual Reactor Core & Command Bar */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10 h-full max-w-2xl mx-auto">
        {/* Reactor HUD Core */}
        <div className="my-auto flex flex-col items-center">
          <VisualCore
            state={isListening ? 'working' : coreState}
            onStateChange={onStateChange}
            size={380}
            showStateControls={true}
            isAudioActive={isListening || isProcessing || coreState === 'working'}
          />

          {/* Subtitle Status */}
          <div className="mt-6 text-center">
            <h2
              className={`text-sm font-mono tracking-[0.3em] font-semibold uppercase ${
                isListening
                  ? 'text-red-400 animate-pulse'
                  : 'text-cyan-300 animate-pulse'
              }`}
            >
              {isListening
                ? 'R E C O R D I N G . . .'
                : 'L I S T E N I N G . . .'}
            </h2>
            <p className="text-xs font-mono text-slate-400 mt-1">
              {isListening
                ? 'Говорите... Нажмите микрофон для остановки'
                : useOffline
                ? 'Нажмите микрофон — офлайн STT (whisper.cpp)'
                : webSupported
                ? 'Нажмите микрофон и скажите команду'
                : 'Микрофон недоступен — вводите текст'}
            </p>
            {useOffline && (
              <p className="text-[10px] font-mono text-emerald-400/60 mt-0.5">
                🟢 🟢 Офлайн-режим (whisper.cpp)
              </p>
            )}
          </div>

          {/* Транскрипт в реальном времени (Web Speech API) */}
          {isListening && transcript && !useOffline && (
            <div className="mt-3 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/30 max-w-md text-center">
              <p className="text-xs font-mono text-red-300 italic leading-relaxed">
                &ldquo;{transcript}&rdquo;
              </p>
            </div>
          )}

          {/* Офлайн аудио-уровень (визуализация) */}
          {isListening && useOffline && (
            <div className="mt-3 px-4 py-2 rounded-xl bg-purple-500/10 border border-purple-500/30 max-w-md text-center">
              <div className="flex items-center gap-0.5 justify-center h-6">
                {WAVEFORM_HEIGHTS.map((baseH, i) => {
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

        {/* Floating Input Command Bar */}
        <div className="w-full mt-auto mb-4">
          <div
            className={`relative flex items-center rounded-full px-4 py-3 backdrop-blur-xl transition-all duration-300 ${
              isListening
                ? 'bg-red-500/10 border-2 border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.3)]'
                : 'bg-[#0d0f18]/90 border border-cyan-500/30 shadow-[0_0_30px_rgba(0,240,255,0.12)]'
            }`}
          >
            {/* Кнопка микрофона */}
            <button
              onClick={handleMicToggle}
              className={`p-2 rounded-full transition-all mr-2 ${
                isListening
                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 animate-pulse'
                  : useOffline
                  ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                  : 'bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20'
              }`}
              title={
                isListening
                  ? 'Остановить запись'
                  : useOffline
                  ? 'Начать офлайн-запись (whisper.cpp)'
                  : 'Начать голосовой ввод'
              }
            >
              {isListening ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>

            <input
              type="text"
              value={isListening && !useOffline ? transcript : inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
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
              className="p-2.5 rounded-full bg-gradient-to-r from-cyan-500 to-purple-600 text-white hover:opacity-90 shadow-[0_0_15px_rgba(0,240,255,0.4)] transition-all ml-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          {/* Индикатор поддержки речи */}
          {!useOffline && !webSupported && (
            <p className="text-[10px] font-mono text-amber-400/70 mt-1 text-center">
              ⚠ Микрофон недоступен — используйте текстовый ввод
            </p>
          )}
        </div>
      </div>

      {/* Right Column Quick Widgets */}
      <div className="w-80 flex flex-col gap-4 z-10 h-full overflow-y-auto pr-1">
        {/* Quick Commands Widget */}
        <div className="p-4 rounded-2xl bg-[#0d0f18]/80 border border-slate-800/80 backdrop-blur-md shadow-xl">
          <h3 className="text-xs font-mono tracking-wider font-semibold uppercase text-slate-400 mb-3 flex items-center justify-between">
            <span>БЫСТРЫЕ КОМАНДЫ</span>
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_CMDS.map((qc) => {
              const Icon = qc.icon;
              return (
                <button
                  key={qc.label}
                  onClick={() => onExecuteCommand(qc.cmd)}
                  className="p-3 rounded-xl bg-[#121624] border border-slate-800 hover:border-cyan-500/40 hover:bg-cyan-500/10 text-left transition-all duration-200 group"
                >
                  <Icon className="w-4 h-4 text-cyan-400 mb-2 group-hover:scale-110 transition-transform" />
                  <div className="text-xs font-mono font-medium text-slate-200">{qc.label}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* System Status Widget [STUB] */}
        <div className="p-4 rounded-2xl bg-[#0d0f18]/80 border border-slate-800/80 backdrop-blur-md shadow-xl"><h3 className="text-xs font-mono tracking-wider font-semibold uppercase text-slate-400 mb-3">SYSTEM STATUS<span className="ml-2 px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-normal tracking-normal">LIVE</span></h3>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-xl bg-[#121624] border border-slate-800 flex flex-col items-center">
              <div className="w-10 h-10 rounded-full border-2 border-cyan-400 border-t-slate-700 flex items-center justify-center text-xs font-mono font-bold text-cyan-300">
                {sysMetrics.cpu}%
              </div>
              <span className="text-[10px] font-mono text-slate-400 mt-1">CPU</span>
            </div>
            <div className="p-2 rounded-xl bg-[#121624] border border-slate-800 flex flex-col items-center">
              <div className="w-10 h-10 rounded-full border-2 border-purple-400 border-t-slate-700 flex items-center justify-center text-xs font-mono font-bold text-purple-300">
                {sysMetrics.ram}%
              </div>
              <span className="text-[10px] font-mono text-slate-400 mt-1">RAM</span>
            </div>
            <div className="p-2 rounded-xl bg-[#121624] border border-slate-800 flex flex-col items-center">
              <div className="w-10 h-10 rounded-full border-2 border-emerald-400 border-t-slate-700 flex items-center justify-center text-xs font-mono font-bold text-emerald-300">
                {sysMetrics.gpu}%
              </div>
              <span className="text-[10px] font-mono text-slate-400 mt-1">GPU</span>
            </div>
          </div>
        </div>

        {/* Current Task Widget */}
        <div className="p-4 rounded-2xl bg-[#0d0f18]/80 border border-slate-800/80 backdrop-blur-md shadow-xl">
          <h3 className="text-xs font-mono tracking-wider font-semibold uppercase text-slate-400 mb-3">CURRENT TASK<span className="ml-2 px-1.5 py-0.5 rounded text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/30 font-normal tracking-normal">STUB</span></h3>
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

        {/* Next Event Widget */}
        <div className="p-4 rounded-2xl bg-[#0d0f18]/80 border border-slate-800/80 backdrop-blur-md shadow-xl">
          <h3 className="text-xs font-mono tracking-wider font-semibold uppercase text-slate-400 mb-3">NEXT EVENT<span className="ml-2 px-1.5 py-0.5 rounded text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/30 font-normal tracking-normal">STUB</span></h3>
          <div className="p-3 rounded-xl bg-[#121624] border border-slate-800 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-mono font-bold text-white">Ревью кода</div>
              <div className="text-[10px] font-mono text-slate-400">Сегодня 23:00</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
