import React, { useState } from "react";
import { 
  Send, 
  Terminal, 
  ChevronRight, 
  Loader2, 
  CheckCircle, 
  XCircle, 
  Layers, 
  Eye, 
  EyeOff, 
  FileDiff,
  Flame,
  CloudOff,
  Sparkles
} from "lucide-react";
import { AiderTask, ModelConfig } from "../types";

interface AiderChatProps {
  tasks: AiderTask[];
  onTaskCreate: (prompt: string) => void;
  selectedModelId: string;
  modelConfigs: ModelConfig[];
  lang?: 'en' | 'ru';
}

export default function AiderChat({ 
  tasks, 
  onTaskCreate, 
  selectedModelId,
  modelConfigs,
  lang = 'en'
}: AiderChatProps) {
  const [promptInput, setPromptInput] = useState<string>("");
  const [openLogsTaskId, setOpenLogsTaskId] = useState<string | null>(null);
  const [openDiffTaskId, setOpenDiffTaskId] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptInput.trim()) return;
    onTaskCreate(promptInput);
    setPromptInput("");
  };

  const getModelName = (id: string) => {
    const config = modelConfigs.find(m => m.id === id);
    return config ? config.name : id;
  };

  const quickPrompts = lang === 'ru' ? [
    { label: "Исправить ошибку деления", text: "Исправить ошибку деления на ноль в calculator.ts. Проверить, равен ли делитель нулю, и выбросить Error." },
    { label: "Перенести ключ JWT", text: "Обезопасить auth.ts. Перенести JWT_SECRET в process.env и исправить опечатку короткого пароля." },
    { label: "Защитить свойства погоды", text: "Добавить опциональную цепочку или предохранитель существования для ключа скорости ветра в parser.ts, чтобы избежать сбоев TypeError." }
  ] : [
    { label: "Fix division bug", text: "Fix the division by zero bug in calculator.ts. Check if divisor is zero and throw an Error." },
    { label: "Migrate JWT key", text: "Secure auth.ts. Migrate JWT_SECRET to process.env and fix the short password typo." },
    { label: "Safeguard weather attributes", text: "Add optional chaining or existence safeguard for wind speed key in parser.ts to avoid TypeError crashes." }
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      
      {/* Left side: Chat console input */}
      <div className="lg:col-span-5 space-y-4 flex flex-col justify-between">
        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{lang === 'ru' ? "Консоль Aider CLI" : "AIDER CLI CONSOLE"}</h3>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-cyan-400 font-mono bg-cyan-950/30 px-2 py-0.5 rounded border border-cyan-900/30">
              <Layers className="w-3.5 h-3.5" /> {lang === 'ru' ? "Параллельные задачи включены" : "Parallel Tasks Enabled"}
            </div>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            {lang === 'ru'
              ? "Введите запросы для генерации кода, исправления тестов или системного рефакторинга. Aider проанализирует вашу кодовую базу, изменит файлы и автоматически запустит тесты."
              : "Enter prompts for code generation, test fixes, or system-wide refactoring. Aider will analyze your codebase, modify files, and auto-run test suites."}
          </p>

          {/* Quick instructions suggestions */}
          <div className="space-y-2 pt-2">
            <span className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">
              {lang === 'ru' ? "Рекомендуемые действия:" : "Suggested actions:"}
            </span>
            <div className="flex flex-col gap-1.5">
              {quickPrompts.map((qp, idx) => (
                <button
                  key={idx}
                  onClick={() => setPromptInput(qp.text)}
                  className="w-full text-left p-2.5 rounded bg-slate-950 border border-slate-850 hover:border-cyan-900/60 text-[11px] text-slate-400 hover:text-slate-200 transition-all font-mono flex items-center gap-2"
                >
                  <ChevronRight className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                  {qp.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Console Prompt Box */}
        <form onSubmit={handleSubmit} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>Model: {getModelName(selectedModelId)}</span>
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-cyan-400" /> Web-GUI Bridge
            </span>
          </div>

          <div className="relative">
            <input
              type="text"
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              className="w-full bg-slate-950 border border-slate-850 rounded px-3 py-2.5 pr-12 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-all"
              placeholder={lang === 'ru' ? "например, Добавить валидацию..." : "e.g. Add validation controls to..."}
            />
            <button
              type="submit"
              disabled={!promptInput.trim()}
              className={`absolute right-1.5 top-1.5 p-1.5 rounded transition-all ${
                promptInput.trim() 
                  ? "bg-cyan-600 hover:bg-cyan-500 text-cyan-50 cursor-pointer" 
                  : "bg-slate-900 text-slate-600 cursor-not-allowed"
              }`}
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>

      {/* Right side: Parallel task pipeline queues */}
      <div className="lg:col-span-7 p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="space-y-0.5">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{lang === 'ru' ? "Очередь задач Aider" : "Aider Task Pipeline Queue"}</h3>
          <p className="text-xs text-slate-500">{lang === 'ru' ? "Потоковое отслеживание запущенных параллельных процессов написания кода" : "Live tracker of parallel coding instances and automated code-generation loops"}</p>
        </div>

        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
          {tasks.length === 0 ? (
            <div className="p-8 rounded border border-dashed border-slate-800 text-center text-xs text-slate-600 bg-slate-950/20 font-mono">
              <Terminal className="w-8 h-8 text-slate-700 mx-auto mb-2" />
              <span>{lang === 'ru' ? "Очередь задач пуста. Отправьте запрос для начала." : "No active coding tasks enqueued. Submit a prompt to start."}</span>
            </div>
          ) : (
            [...tasks].reverse().map(task => (
              <div 
                key={task.id} 
                className={`p-4 rounded-lg border text-xs space-y-3 transition-all ${
                  task.status === "completed" 
                    ? "bg-emerald-950/5 border-emerald-900/30" 
                    : task.status === "failed" 
                      ? "bg-rose-950/5 border-rose-900/30" 
                      : "bg-slate-950/80 border-slate-850"
                }`}
              >
                {/* Heading / Info row */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <span className="font-mono text-[10px] text-slate-500 uppercase px-1.5 py-0.2 bg-slate-900 border border-slate-800 rounded">
                      {task.id}
                    </span>
                    <p className="font-mono font-medium text-slate-200">"{task.prompt}"</p>
                  </div>

                  {/* Status badges */}
                  <div>
                    {task.status === "completed" ? (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-950 border border-emerald-900 px-2 py-0.5 rounded">
                        <CheckCircle className="w-3.5 h-3.5" /> SUCCESS
                      </span>
                    ) : task.status === "failed" ? (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-rose-400 bg-rose-950 border border-rose-900 px-2 py-0.5 rounded">
                        <XCircle className="w-3.5 h-3.5" /> FAILED
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-950 border border-amber-900 px-2 py-0.5 rounded">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> WORKING ({task.progress}%)
                      </span>
                    )}
                  </div>
                </div>

                {/* Task progress bar */}
                <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-850">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                      task.status === "completed" 
                        ? "bg-emerald-500" 
                        : task.status === "failed" 
                          ? "bg-rose-500" 
                          : "bg-cyan-500"
                    }`}
                    style={{ width: `${task.progress}%` }}
                  />
                </div>

                {/* Subtask toggles */}
                <div className="flex gap-2 text-[11px] pt-1">
                  <button
                    onClick={() => setOpenLogsTaskId(openLogsTaskId === task.id ? null : task.id)}
                    className="py-1 px-2 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-all"
                  >
                    {openLogsTaskId === task.id ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>Logs</span>
                  </button>

                  {task.diffs && task.diffs.length > 0 && (
                    <button
                      onClick={() => setOpenDiffTaskId(openDiffTaskId === task.id ? null : task.id)}
                      className="py-1 px-2 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-all"
                    >
                      <FileDiff className="w-3.5 h-3.5" />
                      <span>Diffs</span>
                    </button>
                  )}
                </div>

                {/* Expandable Logs section */}
                {openLogsTaskId === task.id && (
                  <div className="mt-2.5 p-3 rounded bg-slate-950 border border-slate-850 font-mono text-[10px] text-slate-400 space-y-1.5 max-h-48 overflow-y-auto leading-relaxed">
                    {task.logs.map((log, idx) => (
                      <p key={idx} className={log.includes('[ERROR]') ? "text-rose-400" : log.includes('passed!') ? "text-emerald-400" : "text-slate-400"}>
                        {log}
                      </p>
                    ))}
                  </div>
                )}

                {/* Expandable Diffs section */}
                {openDiffTaskId === task.id && task.diffs && task.diffs.map((df, idx) => (
                  <div key={idx} className="mt-2.5 space-y-1">
                    <p className="text-[10px] text-slate-500 font-mono">Git patch for file: {df.filePath}</p>
                    <div className="p-3 rounded bg-slate-950 border border-slate-850 font-mono text-[10px] overflow-x-auto max-h-60 space-y-0.5">
                      {df.diffSummary ? (
                        df.diffSummary.split("\n").map((line, lidx) => (
                          <div 
                            key={lidx} 
                            className={`px-1.5 py-0.5 rounded ${
                              line.startsWith("+") 
                                ? "text-emerald-400 bg-emerald-950/20" 
                                : line.startsWith("-") 
                                  ? "text-rose-400 bg-rose-950/20" 
                                  : "text-slate-500"
                            }`}
                          >
                            {line}
                          </div>
                        ))
                      ) : (
                        df.updated.split("\n").map((line, lidx) => (
                          <div key={lidx} className="text-slate-400">{line}</div>
                        ))
                      )}
                    </div>
                  </div>
                ))}

                {/* Footer details */}
                <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono pt-1">
                  <span>Engine: {getModelName(task.modelUsed)}</span>
                  {task.isOffline && (
                    <span className="flex items-center gap-1 text-amber-500 font-semibold uppercase">
                      <CloudOff className="w-3 h-3" /> Offline Backup
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}
