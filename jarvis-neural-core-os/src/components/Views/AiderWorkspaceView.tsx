import React, { useState, useRef, useCallback, useEffect } from 'react';

import { CoreState } from '../../types';
import { Terminal, Code, GitCommit, Play, RefreshCw, FileCode, CheckCircle2, Shield, FolderGit2 } from 'lucide-react';

interface AiderWorkspaceViewProps {
  onTriggerState: (state: CoreState, source: string, message: string) => void;
}

const INITIAL_LOGS = [
  'Aider v0.65.0 - AI pair programming in your terminal',
  'Git repo found at /home/fedora/projects/jarvis-core',
  'Model: anthropic/claude-3.5-sonnet via OpenRouter',
  'Ready for instructions. Type /help for available commands.',
];

// Stable preset commands — no array recreation
const PRESET_COMMANDS = [
  {
    label: '🧪 Add Unit Tests for Visual Core',
    prompt: 'aider --message "Add unit test for VisualCore state transitions"',
    icon: Code,
    color: 'purple' as const,
  },
  {
    label: '⚡ Оптимизировать State Manager',
    prompt: 'aider --message "Refactor state payload handlers in useCoreState.ts"',
    icon: RefreshCw,
    color: 'cyan' as const,
  },
  {
    label: '🛡️ Аудит безопасности системных вызовов',
    prompt: 'aider --message "Audit security & permissions for Fedora system call daemon"',
    icon: Shield,
    color: 'emerald' as const,
  },
] as const;

export const AiderWorkspaceView: React.FC<AiderWorkspaceViewProps> = React.memo(({ onTriggerState }) => {
  const [prompt, setPrompt] = useState('aider --model anthropic/claude-3.5-sonnet --message "Refactor VisualCore component for smooth 60fps WebGL rendering"');
  const [isExecuting, setIsExecuting] = useState(false);
  const [logs, setLogs] = useState<string[]>(INITIAL_LOGS);

  // Refs: предотвращение гонок и утечек
  const isMountedRef = useRef(true);
  const executionIdRef = useRef(0);

  useEffect(() => { return () => { isMountedRef.current = false; }; }, []);

  const safeSetLogs = useCallback((updater: (prev: string[]) => string[]) => {
    if (isMountedRef.current) setLogs(updater);
  }, []);

  // ── Полный async/await вместо setTimeout-цепочек ──
  const handleRunAider = useCallback(async () => {
    if (!prompt.trim() || isExecuting) return;

    setIsExecuting(true);
    const execId = ++executionIdRef.current;

    onTriggerState('working', 'Aider AI Programmer', 'Running code analysis & AST generation...');
    safeSetLogs((prev) => [...prev, `\n$ ${prompt}`, '[Aider] Connecting to model API via OpenRouter...', '[Aider] Analyzing repository AST tree & dependency graph...']);

    await new Promise((r) => setTimeout(r, 2000));
    if (!isMountedRef.current || execId !== executionIdRef.current) return;

    onTriggerState('file_io', 'Aider File Writer', 'Applying patch diffs to /src/components/VisualCore.tsx');
    safeSetLogs((prev) => [...prev, '[Diff] Modified /src/components/VisualCore.tsx (+48 lines, -12 lines)', '[Git] Stage changes for commit: "feat(core): optimize canvas rendering for WebKitGTK"']);

    try {
      // STUB: /api/aider/execute не существует в бэкенде — симуляция
      const res = await fetch('/api/aider/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'refactor', prompt }) });
      if (!isMountedRef.current || execId !== executionIdRef.current) return;
      const data = await res.json();
      if (data.logs) safeSetLogs((prev) => [...prev, ...data.logs]);
    } catch { /* fallback */ }

    await new Promise((r) => setTimeout(r, 1500));
    if (!isMountedRef.current || execId !== executionIdRef.current) return;

    setIsExecuting(false);
    onTriggerState('idle', 'Aider Complete', 'Git commit executed successfully.');
    safeSetLogs((prev) => [...prev, '[Git] Commit: [main 8f4a2b1] Refactor VisualCore component', 'Aider run complete. All tests green.']);
  }, [prompt, isExecuting, onTriggerState, safeSetLogs]);

  // Stable preset command handler
  const handlePreset = useCallback((presetPrompt: string) => {
    setPrompt(presetPrompt);
  }, []);

  // Stable keydown handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRunAider();
  }, [handleRunAider]);

  // Stable preset button classes
  const presetClass = (color: string) => {
    const base = 'w-full p-2.5 rounded-xl bg-[#121624] border border-slate-800 text-left text-xs text-slate-300 hover:text-white transition-all flex items-center justify-between';
    if (color === 'purple') return `${base} hover:border-purple-500/40`;
    if (color === 'cyan') return `${base} hover:border-cyan-500/40`;
    return `${base} hover:border-emerald-500/40`;
  };

  return (
    <div className="flex-1 grid grid-cols-12 gap-5 p-5 bg-[#090a0f] text-slate-100 overflow-hidden font-mono select-none">
      {/* Left Workspace Panel: Files & Repo Status */}
      <div className="col-span-4 flex flex-col gap-4 overflow-y-auto">
        <div className="p-4 rounded-2xl bg-[#0d0f18]/80 border border-slate-800/80 backdrop-blur-md">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs tracking-wider font-semibold uppercase text-purple-400 flex items-center gap-2">
              <FolderGit2 className="w-4 h-4" />
              РЕПО AIDER
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              Чисто
            </span>
          </div>

          <div className="space-y-2 text-xs text-slate-300">
            <div className="flex justify-between p-2 rounded-xl bg-[#121624] border border-slate-800">
              <span className="text-slate-400">Ветка</span>
              <span className="text-cyan-300 font-bold">main</span>
            </div>
            <div className="flex justify-between p-2 rounded-xl bg-[#121624] border border-slate-800">
              <span className="text-slate-400">Активная модель</span>
              <span className="text-purple-300 font-bold truncate max-w-[140px]">Claude 3.5 Sonnet</span>
            </div>
            <div className="flex justify-between p-2 rounded-xl bg-[#121624] border border-slate-800">
              <span className="text-slate-400">Коммитов сегодня</span>
              <span className="text-emerald-300 font-bold">14</span>
            </div>
          </div>
        </div>

        {/* Preset Aider Actions */}
        <div className="p-4 rounded-2xl bg-[#0d0f18]/80 border border-slate-800/80 backdrop-blur-md">
          <h3 className="text-xs tracking-wider font-semibold uppercase text-slate-400 mb-3">
            БЫСТРЫЕ АВТОМАТИЗАЦИИ
          </h3>
          <div className="space-y-2">
            {PRESET_COMMANDS.map((cmd, idx) => {
              const Icon = cmd.icon;
              const iconClass = cmd.color === 'purple' ? 'text-purple-400' : cmd.color === 'cyan' ? 'text-cyan-400' : 'text-emerald-400';
              return (
                <button
                  key={idx}
                  onClick={() => handlePreset(cmd.prompt)}
                  className={presetClass(cmd.color)}
                >
                  <span>{cmd.label}</span>
                  <Icon className={`w-3.5 h-3.5 ${iconClass}`} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Terminal Workspace Panel */}
      <div className="col-span-8 flex flex-col gap-4">
        {/* Terminal Window Header & Output */}
        <div className="flex-1 p-4 rounded-2xl bg-[#080a10] border border-slate-800 flex flex-col overflow-hidden relative shadow-2xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
            <div className="flex items-center gap-2 text-xs text-cyan-300">
              <Terminal className="w-4 h-4 text-purple-400" />
              <span>ТЕРМИНАЛ AIDER :: FEDORA LINUX<span className="ml-2 px-1.5 py-0.5 rounded text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/30 font-normal tracking-normal">STUB</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
            </div>
          </div>

          {/* Log Stream */}
          <div className="flex-1 overflow-y-auto space-y-1 text-xs text-slate-300 p-2 font-mono leading-relaxed bg-[#05060a] rounded-xl border border-slate-900">
            {logs.map((log, idx) => (
              <div
                key={idx}
                className={
                  log.startsWith('$')
                    ? 'text-cyan-400 font-bold'
                    : log.includes('[Aider]')
                    ? 'text-purple-300'
                    : log.includes('[Diff]')
                    ? 'text-amber-300'
                    : log.includes('[Git]')
                    ? 'text-emerald-400'
                    : 'text-slate-400'
                }
              >
                {log}
              </div>
            ))}
          </div>

          {/* Command Prompt Input */}
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 relative flex items-center bg-[#121624] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white">
              <span className="text-purple-400 mr-2 font-bold">$</span>
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isExecuting}
                className="w-full bg-transparent outline-none text-white placeholder-slate-500"
              />
            </div>
            <button
              onClick={handleRunAider}
              disabled={isExecuting}
              className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-2 shadow-[0_0_15px_rgba(168,85,247,0.4)] transition-all"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{isExecuting ? 'Выполнение...' : 'Выполнить'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
