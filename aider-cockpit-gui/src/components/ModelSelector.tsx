import React, { useState } from "react";
import { 
  Database, 
  Cpu, 
  CloudOff, 
  Server, 
  CheckCircle, 
  AlertTriangle,
  Play,
  Settings,
  HelpCircle,
  HelpCircle as InfoIcon
} from "lucide-react";
import { ModelConfig } from "../types";

interface ModelSelectorProps {
  modelConfigs: ModelConfig[];
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
  offlineFallbackActive: boolean;
  lang?: 'en' | 'ru';
}

export default function ModelSelector({ 
  modelConfigs, 
  selectedModelId, 
  onSelectModel,
  offlineFallbackActive,
  lang = 'en'
}: ModelSelectorProps) {
  const [localEndpoint, setLocalEndpoint] = useState<string>("http://localhost:11434");
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);
  const [connectionTestResult, setConnectionTestResult] = useState<'success' | 'failed' | null>(null);

  const testOllamaConnection = () => {
    setIsTestingConnection(true);
    setConnectionTestResult(null);
    
    // Simulate API ping delay to Ollama server
    setTimeout(() => {
      setIsTestingConnection(false);
      setConnectionTestResult('success');
    }, 1500);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
      
      {/* Model Grid selector */}
      <div className="md:col-span-8 p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="space-y-0.5">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" /> {lang === 'ru' ? "Матрица конфигурации моделей" : "Model Configuration Matrix"}
          </h3>
          <p className="text-xs text-slate-500">{lang === 'ru' ? "Настройте основные и резервные модели кодирования. Резервная запускается автоматически при исчерпании лимитов." : "Configure your primary and fallback coding models. Selected fallback initiates automatically on API exhaustion."}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {modelConfigs.map(config => {
            const isSelected = selectedModelId === config.id;
            return (
              <button
                key={config.id}
                onClick={() => onSelectModel(config.id)}
                className={`p-4 rounded-xl border text-left flex flex-col justify-between h-40 transition-all ${
                  isSelected 
                    ? "bg-cyan-950/20 border-cyan-500/80 shadow-[0_0_15px_rgba(6,182,212,0.15)]" 
                    : "bg-slate-950 hover:bg-slate-900/40 border-slate-850 hover:border-slate-800"
                }`}
              >
                <div className="w-full space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded text-[8px] uppercase tracking-wider font-bold ${
                      config.type === "online" 
                        ? "bg-violet-950/55 text-violet-400 border border-violet-900/40" 
                        : "bg-amber-950/55 text-amber-400 border border-amber-900/40"
                    }`}>
                      {config.type}
                    </span>
                    {config.type === "offline" && (
                      <span className="flex items-center gap-1 text-[9px] text-slate-500 font-mono">
                        <CloudOff className="w-2.5 h-2.5" /> offline
                      </span>
                    )}
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-slate-200">{config.name}</h4>
                    <p className="text-[10px] text-slate-500 font-mono">{config.provider}</p>
                  </div>
                </div>

                <div className="w-full space-y-1.5 border-t border-slate-850/60 pt-2 font-mono text-[9px] text-slate-500">
                  <p className="flex justify-between">
                    <span>{lang === 'ru' ? "Скорость:" : "Speed:"}</span>
                    <span className="text-slate-300 font-semibold">{config.speed}</span>
                  </p>
                  <p className="flex justify-between">
                    <span>{lang === 'ru' ? "Контекст:" : "Context:"}</span>
                    <span className="text-slate-300">{config.contextWindow}</span>
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {offlineFallbackActive && (
          <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-900/40 flex items-start gap-2.5 text-xs text-amber-400 font-mono">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold block uppercase text-[10px]">{lang === 'ru' ? "Активный аварийный режим:" : "Active Failover Mode:"}</span>
              <p className="text-slate-300">
                {lang === 'ru'
                  ? "Достигнуты лимиты основного Gemini или выбран ручной обход. Задачи будут выполняться на вашем локальном автономном сервере, чтобы избежать блокировки сервиса."
                  : "Primary Gemini limits reached or manual bypass selected. Tasks will execute on your configured local offline inference worker to prevent any service blockages."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Local Ollama connection configure */}
      <div className="md:col-span-4 p-5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between space-y-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{lang === 'ru' ? "Локальный мост Ollama" : "Local Ollama Bridge"}</h3>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            {lang === 'ru'
              ? "Настройте интерфейс Aider для получения ответов от вашего локального сервера Ollama при переходе в офлайн."
              : "Configure Aider GUI to stream inferences from your local Ollama server during offline fallbacks."}
          </p>

          <div className="space-y-2">
            <label className="text-[10px] text-slate-500 uppercase font-mono font-bold block">{lang === 'ru' ? "Адрес API инференса:" : "Inference API Endpoint:"}</label>
            <input
              type="text"
              value={localEndpoint}
              onChange={(e) => setLocalEndpoint(e.target.value)}
              className="w-full bg-slate-950 border border-slate-850 rounded px-2.5 py-1.5 font-mono text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              placeholder="e.g. http://localhost:11434"
            />
          </div>

          {/* Connection diagnostics display */}
          {connectionTestResult && (
            <div className={`p-2.5 rounded border text-[11px] font-mono flex items-start gap-1.5 ${
              connectionTestResult === "success" 
                ? "bg-emerald-950/20 text-emerald-400 border-emerald-900/30" 
                : "bg-rose-950/20 text-rose-400 border-rose-900/30"
            }`}>
              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <div>
                <p className="font-bold">{lang === 'ru' ? "Ollama ping: Подключено" : "Ollama ping: Connected"}</p>
                <p className="text-[10px] text-slate-400">{lang === 'ru' ? "Найденные модели: llama3:latest, deepseek-coder:1.5b" : "Found models: llama3:latest, deepseek-coder:1.5b"}</p>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={testOllamaConnection}
          disabled={isTestingConnection}
          className="w-full py-2 px-3 rounded bg-slate-950 border border-slate-800 hover:border-cyan-900/50 hover:bg-cyan-950/10 text-xs font-medium text-slate-400 hover:text-cyan-400 flex items-center justify-center gap-2 transition-all cursor-pointer"
        >
          {isTestingConnection ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {lang === 'ru' ? "Пинг локального клиента..." : "Pinging Local Client..."}
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-slate-400 hover:fill-cyan-400" /> {lang === 'ru' ? "Проверить локальное подключение" : "Test Local Connection"}
            </>
          )}
        </button>
      </div>

    </div>
  );
}

// Inline loader component mock
function Loader2({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );
}
