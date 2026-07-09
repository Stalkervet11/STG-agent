import React from "react";
import { 
  Moon, 
  Sun, 
  Bot, 
  AlertCircle, 
  CheckCircle2, 
  RefreshCw, 
  Info,
  Layers,
  Sparkles,
  ToggleLeft,
  ToggleRight
} from "lucide-react";
import { UnitTest, AiderTask } from "../types";

interface AutomationControlProps {
  isNightMode: boolean;
  onToggleNightMode: () => void;
  tests: UnitTest[];
  tasks: AiderTask[];
  lang?: 'en' | 'ru';
}

export default function AutomationControl({ 
  isNightMode, 
  onToggleNightMode, 
  tests,
  tasks,
  lang = 'en'
}: AutomationControlProps) {
  const failingTests = tests.filter(t => t.status === "failed");
  const passingTests = tests.filter(t => t.status === "passed");
  
  // Calculate success rate based on tasks created by automation
  const autoTasks = tasks.filter(t => t.id.includes("autofix"));
  const completedAutoTasks = autoTasks.filter(t => t.status === "completed");
  const autoSuccessRate = autoTasks.length > 0 
    ? Math.round((completedAutoTasks.length / autoTasks.length) * 100) 
    : 100;

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
      
      {/* Description & Activator Cell */}
      <div className="md:col-span-4 p-5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between space-y-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Moon className={`w-4 h-4 ${isNightMode ? "text-indigo-400 animate-pulse" : "text-slate-500"}`} />
              {lang === 'ru' ? "Автоматизация ночного режима" : "Night Mode Automation"}
            </h3>

            {/* Glowing active indicator */}
            <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono border font-semibold ${
              isNightMode 
                ? "text-indigo-400 bg-indigo-950/40 border-indigo-900/40 shadow-[0_0_15px_rgba(129,140,248,0.15)] animate-pulse" 
                : "text-slate-500 bg-slate-950 border-slate-850"
            }`}>
              {isNightMode ? (lang === 'ru' ? "АКТИВЕН" : "ACTIVE") : (lang === 'ru' ? "ОЖИДАНИЕ" : "STANDBY")}
            </span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            {lang === 'ru'
              ? "В Ночном режиме Aider автономно запускается в непрерывном цикле. Он сканирует журналы активного рабочего пространства, выявляет ошибки кода и упавшие тесты, подготавливает правки и выполняет итерации до тех пор, пока весь набор тестов не будет скомпилирован идеально."
              : "In **Night Mode**, Aider will autonomously run in a continuous loop. It scans active workspace logs, identifies code errors and failing test cases, drafts edits, and iterates until the entire test suite compiles perfectly."}
          </p>

          <div className="p-3 rounded bg-slate-950 border border-slate-850 text-[11px] text-slate-400 font-mono space-y-1">
            <p className="flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5 text-cyan-400" />
              <span>{lang === 'ru' ? "Цикл автоисправления: Активен" : "Self-Correction loop: Active"}</span>
            </p>
            <p className="flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
              <span>{lang === 'ru' ? "Макс. итераций на тест: 5" : "Max iterations per test: 5"}</span>
            </p>
          </div>
        </div>

        {/* Toggle Button */}
        <button
          onClick={onToggleNightMode}
          className={`w-full py-2.5 px-4 rounded text-xs font-semibold flex items-center justify-center gap-2 border transition-all ${
            isNightMode 
              ? "bg-indigo-600 hover:bg-indigo-500 border-indigo-700 hover:border-indigo-600 text-indigo-50 shadow-[0_0_15px_rgba(99,102,241,0.2)]" 
              : "bg-slate-950 hover:bg-slate-900 border-slate-800 text-indigo-400 font-medium"
          }`}
        >
          {isNightMode ? (
            <>
              <Sun className="w-4 h-4 text-amber-400" /> {lang === 'ru' ? "Выключить ночной режим" : "Deactivate Night Mode"}
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-indigo-400" /> {lang === 'ru' ? "Включить ночной режим" : "Activate Night Mode"}
            </>
          )}
        </button>
      </div>

      {/* Real-time self correction analytics */}
      <div className="md:col-span-8 p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4 flex flex-col justify-between">
        
        <div className="space-y-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="text-cyan-400 w-4 h-4" /> {lang === 'ru' ? "Диагностика автоисправления" : "Self-Correction Diagnostics"}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            
            {/* Status cell */}
            <div className="p-4 rounded-lg bg-slate-950 border border-slate-850 text-center space-y-1">
              <span className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider block">{lang === 'ru' ? "Текущий статус" : "Target Status"}</span>
              {failingTests.length > 0 ? (
                <div className="flex items-center justify-center gap-1.5 text-rose-400 font-semibold text-sm">
                  <AlertCircle className="w-4 h-4 text-rose-500 animate-pulse" />
                  <span>{lang === 'ru' ? `Ошибок: ${failingTests.length}` : `${failingTests.length} Failing Test${failingTests.length > 1 ? 's' : ''}`}</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-1.5 text-emerald-400 font-semibold text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>{lang === 'ru' ? "Все успешно" : "All Green"}</span>
                </div>
              )}
              <span className="text-[10px] text-slate-500 block">{lang === 'ru' ? "Сборка без ошибок" : "Workspace compiles cleanly"}</span>
            </div>

            {/* Loop Success Rate */}
            <div className="p-4 rounded-lg bg-slate-950 border border-slate-850 text-center space-y-1">
              <span className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider block">{lang === 'ru' ? "Успешность исправлений" : "Auto Success Rate"}</span>
              <span className="text-lg font-bold font-mono text-cyan-400 block">{autoSuccessRate}%</span>
              <span className="text-[10px] text-slate-500 block">{lang === 'ru' ? `На основе ${autoTasks.length} автозадач` : `Based on ${autoTasks.length} auto-tasks`}</span>
            </div>

            {/* Iterations Counter */}
            <div className="p-4 rounded-lg bg-slate-950 border border-slate-850 text-center space-y-1">
              <span className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider block">{lang === 'ru' ? "Запущено автозадач" : "Auto-Tasks Spawned"}</span>
              <span className="text-lg font-bold font-mono text-slate-100 block">{autoTasks.length}</span>
              <span className="text-[10px] text-slate-500 block">{lang === 'ru' ? "Исправлений запущено ночью" : "Corrections triggered tonight"}</span>
            </div>

          </div>
        </div>

        {/* Live diagnostic terminal log stream specific to auto-correction */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
            <Info className="w-3.5 h-3.5 text-cyan-400" />
            <span>{lang === 'ru' ? "Диагностика цикла:" : "Loop Diagnostics:"}</span>
          </div>
          
          <div className="p-3 rounded bg-slate-950 border border-slate-850 font-mono text-[10px] text-slate-400 h-20 overflow-y-auto leading-relaxed">
            {isNightMode ? (
              <div className="space-y-1">
                <p className="text-indigo-400 font-bold">{lang === 'ru' ? "[НОЧНОЙ РЕЖИМ АКТИВЕН] Поток непрерывного сканирования запущен..." : "[NIGHT MODE ACTIVE] Continuous scanner thread is running..."}</p>
                {failingTests.length > 0 ? (
                  <p className="text-rose-400 animate-pulse">
                    {lang === 'ru' ? `!! Сканирование логов ошибок для теста: "${failingTests[0].name}"...` : `!! Scanning error logs for test case: "${failingTests[0].name}"...`}
                  </p>
                ) : (
                  <p className="text-slate-500">{lang === 'ru' ? "Ошибок в тестах не обнаружено. Ожидание..." : "No active test errors found. Sleep-loop idling..."}</p>
                )}
                {autoTasks.length > 0 && (
                  <p className="text-slate-400">
                    {lang === 'ru' ? `Успешно применено ${completedAutoTasks.length} автоисправлений за сессию.` : `Applied ${completedAutoTasks.length} successful auto-fixes during session.`}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-slate-600 italic flex items-center justify-center h-full">
                {lang === 'ru' ? "Активируйте автоматизацию ночного режима, чтобы запустить потоки автономной коррекции." : "Activate Night Mode automation to boot the autonomous correction container threads."}
              </p>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
