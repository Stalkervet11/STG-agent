import React, { useState, useEffect, useRef } from "react";
import { 
  Cpu, 
  HardDrive, 
  Zap, 
  Activity, 
  Terminal, 
  RefreshCw, 
  CloudOff, 
  Play, 
  DollarSign, 
  AlertTriangle,
  Info,
  CheckCircle,
  Database,
  ArrowRight,
  Layers,
  Shield,
  History,
  Send,
  Loader2,
  FileCheck
} from "lucide-react";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts";
import { 
  SystemTelemetry, 
  LogMessage, 
  TelegramConfig, 
  UITheme 
} from "../types";

interface DashboardProps {
  telemetry: SystemTelemetry;
  logs: LogMessage[];
  onResetWorkspace: () => void;
  onToggleModelSelect: (modelId: string) => void;
  selectedModelId: string;
  telegramConfig: TelegramConfig;
  onUpdateTelegramConfig: (token: string, chat: string, enabled: boolean) => void;
  onTestTelegram: () => void;
  currentTheme: UITheme;
  onSelectTheme: (theme: UITheme) => void;
  memoryPoolEnabled: boolean;
  onToggleMemoryPool: () => void;
  rustFfiApplied: boolean;
  onToggleRustFfi: () => void;
  lang: 'en' | 'ru';
}

interface ChartDataPoint {
  time: string;
  cpu: number;
  ram: number;
}

export default function Dashboard({ 
  telemetry, 
  logs, 
  onResetWorkspace,
  onToggleModelSelect,
  selectedModelId,
  telegramConfig,
  onUpdateTelegramConfig,
  onTestTelegram,
  currentTheme,
  onSelectTheme,
  memoryPoolEnabled,
  onToggleMemoryPool,
  rustFfiApplied,
  onToggleRustFfi,
  lang
}: DashboardProps) {
  const [chartHistory, setChartHistory] = useState<ChartDataPoint[]>([]);
  
  // Hierarchical logging selection: 'system' | 'task' | 'alert'
  const [activeLogTab, setActiveLogTab] = useState<'system' | 'task' | 'alert'>('system');
  
  const [localToken, setLocalToken] = useState(telegramConfig.botToken || "");
  const [localChatId, setLocalChatId] = useState(telegramConfig.chatId || "");
  const [telegramEnabled, setTelegramEnabled] = useState(telegramConfig.enabled);

  useEffect(() => {
    setLocalToken(telegramConfig.botToken || "");
    setLocalChatId(telegramConfig.chatId || "");
    setTelegramEnabled(telegramConfig.enabled);
  }, [telegramConfig]);

  const logContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  // Auto-generate moving chart data based on telemetry values
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setChartHistory(prev => {
        const updated = [...prev, { time: now, cpu: telemetry.cpuUsage, ram: telemetry.ramUsage }];
        if (updated.length > 15) {
          updated.shift();
        }
        return updated;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [telemetry]);

  // Hierarchical filtering logic
  const filteredLogs = logs.filter(log => {
    if (activeLogTab === 'task') {
      return log.source === 'aider';
    }
    if (activeLogTab === 'alert') {
      return log.level === 'error' || log.level === 'warn' || log.text.includes('[Telegram Bot]');
    }
    // 'system' tab includes low-level background server events
    return log.source !== 'aider';
  });

  // Set up scroll listener for smart auto-scroll tracking
  useEffect(() => {
    const container = logContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // If user is within 40px of the bottom, we consider them "at the bottom"
      const isNear = container.scrollHeight - container.scrollTop - container.clientHeight < 40;
      isAtBottomRef.current = isNear;
      setAutoScroll(isNear);
    };

    container.addEventListener("scroll", handleScroll);
    // Initial scroll to bottom
    container.scrollTop = container.scrollHeight;

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Scroll to bottom when filteredLogs.length changes, but only if user was already at the bottom and auto-scroll is on
  useEffect(() => {
    const container = logContainerRef.current;
    if (container && isAtBottomRef.current && autoScroll) {
      container.scrollTop = container.scrollHeight;
    }
  }, [filteredLogs.length, activeLogTab, autoScroll]);

  const getLogStyle = (level: LogMessage['level']) => {
    switch (level) {
      case "error": 
        return "text-red-200 bg-red-950/20 border-red-900/20";
      case "warn": 
        return "text-amber-200 bg-amber-950/20 border-amber-900/20";
      case "success": 
        return "text-emerald-200 bg-emerald-950/20 border-emerald-900/20";
      default: 
        return "text-neutral-300 bg-neutral-900/10 border-neutral-800/30";
    }
  };

  const getSourceIcon = (source: LogMessage['source']) => {
    switch (source) {
      case "aider": return <Zap className="w-3.5 h-3.5 text-yellow-400/80" />;
      case "test": return <Activity className="w-3.5 h-3.5 text-emerald-400/80" />;
      case "gemini": return <Cpu className="w-3.5 h-3.5 text-violet-400/80" />;
      case "local_model": return <Database className="w-3.5 h-3.5 text-amber-400/80" />;
      default: return <Terminal className="w-3.5 h-3.5 text-neutral-400" />;
    }
  };

  return (
    <div className="space-y-8 select-none">
      
      {/* Apple Minimalist Header & Status Rail */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-2 border-b border-neutral-900">
        <div>
          <h2 className="text-xl font-medium tracking-tight text-neutral-100 flex items-center gap-2">
            {lang === 'ru' ? "Панель управления производительностью" : "Workspace Performance Control Panel"}
          </h2>
          <p className="text-xs text-neutral-400 mt-1 font-mono">
            {lang === 'ru' ? "Статус VCS: " : "VCS Status: "}<span className="text-emerald-400">{lang === 'ru' ? "Синхронизировано" : "Synchronized"}</span> | {lang === 'ru' ? "Контекст выполнения: " : "Runtime Context: "}<span className="text-cyan-400">{lang === 'ru' ? "Изолированный контейнер Linux (PID 1)" : "Isolated Linux Container (PID 1)"}</span>
          </p>
        </div>
        
        {/* Isolated Process State & Event loop */}
        <div className="flex items-center gap-3 font-mono text-xs p-2.5 rounded-lg bg-neutral-900/20 border border-neutral-800/40">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${telemetry.testRunnerStatus === 'running' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`} />
            <span className="text-neutral-300">
              {lang === 'ru' ? "Цикл событий: " : "Event Loop: "}{telemetry.testRunnerStatus === 'running' ? (lang === 'ru' ? 'ОБРАБОТКА' : 'PROCESSING') : (lang === 'ru' ? 'ОЖИДАНИЕ' : 'IDLE')}
            </span>
          </div>
          <span className="text-neutral-600">|</span>
          <span className="text-neutral-400">
            {lang === 'ru' ? "Код выхода: " : "Exit Code: "}<b className="text-neutral-200">{telemetry.testRunnerStatus === 'failed' ? '1' : '0'}</b>
          </span>
        </div>
      </div>

      {/* Dynamic Warnings / Memory Alerts with Apple Minimalist Style */}
      {telemetry.ramWarningTriggered && (
        <div className="p-5 rounded-2xl bg-neutral-900/40 border border-red-950/60 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 text-xs">
          <div className="flex gap-4">
            <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0 animate-pulse" />
            <div className="space-y-1 font-sans">
              <span className="font-semibold text-red-200 uppercase tracking-wider block">
                {lang === 'ru' ? "Предупреждение о критическом объеме RAM" : "Critical RAM Threshold Warning"} ({telemetry.ramUsage}%)
              </span>
              <p className="text-neutral-400 leading-relaxed">
                {lang === 'ru' 
                  ? "Обнаружено циклическое давление на кучу при выделении переменных. Задержки сборщика мусора могут превысить 150 мс." 
                  : "Repetitive variable allocation heap pressures detected. Garbage collection pause delays might exceed 150ms."}
              </p>
            </div>
          </div>
          <button 
            onClick={onToggleMemoryPool}
            className="px-4 py-2 rounded-xl bg-red-400 text-neutral-950 hover:bg-red-300 font-semibold tracking-wide transition-all cursor-pointer whitespace-nowrap shadow-sm hover:scale-[1.02]"
          >
            {lang === 'ru' ? "Активировать пул объектов" : "Activate Object Pool"}
          </button>
        </div>
      )}

      {/* Memory Leak Diagnostic optimized status */}
      {telemetry.performanceCritical && memoryPoolEnabled && (
        <div className="p-5 rounded-2xl bg-neutral-900/40 border border-emerald-950/60 shadow-md flex flex-row items-center gap-4 text-xs font-mono">
          <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <div className="space-y-1">
            <span className="font-semibold text-emerald-200 uppercase tracking-wider block">
              {lang === 'ru' ? "Активны пулы снижения нагрузки GC" : "GC Mitigation Pools Active"}
            </span>
            <p className="text-neutral-400">
              {lang === 'ru'
                ? "Буферизованные рециклеры пакетов активны. Потребление памяти снижено на 55%, предотвращая фрагментацию и утечки кучи."
                : "Buffered packet recyclers are active. Memory footprint decreased by 55%, mitigating heap fragmentation and leakage."}
            </p>
          </div>
        </div>
      )}

      {/* Telemetry Grid: Apple Minimalism Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        
        {/* CPU Card */}
        <div className="p-5 rounded-2xl bg-neutral-900/30 backdrop-blur-md border border-neutral-800/40 flex flex-col justify-between transition-all hover:bg-neutral-900/45 duration-300 group shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-400 font-medium uppercase tracking-wider flex items-center gap-2 font-mono">
              <Cpu className="w-4 h-4 text-cyan-400/80" /> {lang === 'ru' ? "Загрузка CPU" : "CPU Load"}
            </span>
            <span className="text-[10px] text-neutral-500 font-mono">{lang === 'ru' ? "8 Ядер" : "8 Cores"}</span>
          </div>
          <div className="my-4 space-y-1">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-light font-sans text-neutral-100">{telemetry.cpuUsage}%</span>
              <span className="text-xs text-neutral-500 font-mono">{lang === 'ru' ? "активных потоков" : "active threads"}</span>
            </div>
            {/* Progress indicator */}
            <div className="w-full h-1 bg-neutral-800/50 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-1000 ${
                  telemetry.cpuUsage > 75 ? "bg-red-400" : telemetry.cpuUsage > 40 ? "bg-amber-400" : "bg-cyan-400"
                }`}
                style={{ width: `${telemetry.cpuUsage}%` }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-neutral-500 font-mono">
            <span>{lang === 'ru' ? "Кодогенератор LLVM" : "LLVM Code Generator"}</span>
            <span className={telemetry.cpuUsage > 75 ? "text-red-400 animate-pulse font-medium" : "text-emerald-400/80"}>
              {telemetry.cpuUsage > 75 ? (lang === 'ru' ? "ВЫСОКАЯ НАГРУЗКА" : "HIGH LOAD") : (lang === 'ru' ? "ОПТИМАЛЬНО" : "OPTIMAL")}
            </span>
          </div>
        </div>

        {/* RAM Card */}
        <div className="p-5 rounded-2xl bg-neutral-900/30 backdrop-blur-md border border-neutral-800/40 flex flex-col justify-between transition-all hover:bg-neutral-900/45 duration-300 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-400 font-medium uppercase tracking-wider flex items-center gap-2 font-mono">
              <HardDrive className="w-4 h-4 text-violet-400/80" /> {lang === 'ru' ? "Загрузка RAM" : "RAM Load"}
            </span>
            <span className="text-[10px] text-neutral-500 font-mono">LPDDR5</span>
          </div>
          <div className="my-4 space-y-1">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-light font-sans text-neutral-100">{telemetry.ramUsage}%</span>
              <span className="text-xs text-neutral-500 font-mono">{(8 * (telemetry.ramUsage / 100)).toFixed(1)} {lang === 'ru' ? "ГБ" : "GB"} / 8.0 {lang === 'ru' ? "ГБ" : "GB"}</span>
            </div>
            {/* Progress indicator */}
            <div className="w-full h-1 bg-neutral-800/50 rounded-full overflow-hidden">
              <div 
                className="h-full rounded-full bg-violet-400 transition-all duration-1000"
                style={{ width: `${telemetry.ramUsage}%` }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-neutral-500 font-mono">
            <span>{lang === 'ru' ? "Лимит движка V8" : "V8 Engine Limit"}</span>
            <span className="text-neutral-400">{lang === 'ru' ? "Подкачка: 1.2 ГБ" : "Swap: 1.2 GB"}</span>
          </div>
        </div>

        {/* Gemini Token Usage Card */}
        <div className="p-5 rounded-2xl bg-neutral-900/30 backdrop-blur-md border border-neutral-800/40 flex flex-col justify-between transition-all hover:bg-neutral-900/45 duration-300 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-400 font-medium uppercase tracking-wider flex items-center gap-2 font-mono">
              <Zap className="w-4 h-4 text-yellow-400/80" /> {lang === 'ru' ? "Токены ИИ" : "AI Tokens"}
            </span>
            
            {/* Fallback switch badge */}
            <button 
              onClick={() => onToggleModelSelect(selectedModelId === 'gemini-3.5-flash' ? 'llama3-local' : 'gemini-3.5-flash')}
              className={`px-2 py-0.5 rounded text-[9px] font-mono font-semibold border flex items-center gap-1 transition-all cursor-pointer ${
                telemetry.offlineFallbackActive 
                  ? "bg-amber-950/20 text-amber-400 border-amber-900/40" 
                  : "bg-neutral-950/60 text-neutral-400 border-neutral-800/60 hover:text-neutral-200"
              }`}
            >
              {telemetry.offlineFallbackActive ? (lang === 'ru' ? "ОФФЛАЙН" : "OFFLINE") : (lang === 'ru' ? "ОНЛАЙН" : "ONLINE")}
            </button>
          </div>
          <div className="my-4 space-y-1">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-light font-sans text-neutral-100">
                {telemetry.tokensUsed.toLocaleString()}
              </span>
              <span className="text-xs text-neutral-500 font-mono">/ {telemetry.tokensLimit.toLocaleString()}</span>
            </div>
            {/* Progress indicator */}
            <div className="w-full h-1 bg-neutral-800/50 rounded-full overflow-hidden">
              <div 
                className="h-full rounded-full bg-amber-400 transition-all duration-500"
                style={{ width: `${Math.min(100, (telemetry.tokensUsed / telemetry.tokensLimit) * 100)}%` }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-neutral-500 font-mono">
            <span>{lang === 'ru' ? "Квота использована" : "Quota Used"}</span>
            <span>{((telemetry.tokensUsed / telemetry.tokensLimit) * 100).toFixed(1)}%</span>
          </div>
        </div>

        {/* AI Cost Card */}
        <div className="p-5 rounded-2xl bg-neutral-900/30 backdrop-blur-md border border-neutral-800/40 flex flex-col justify-between transition-all hover:bg-neutral-900/45 duration-300 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-400 font-medium uppercase tracking-wider flex items-center gap-2 font-mono">
              <DollarSign className="w-4 h-4 text-emerald-400/80" /> {lang === 'ru' ? "Стоимость сессии" : "Session Cost"}
            </span>
            <span className="text-[10px] text-neutral-500 font-mono">USD</span>
          </div>
          <div className="my-4 space-y-1">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-light font-sans text-emerald-400">${telemetry.apiCost.toFixed(5)}</span>
            </div>
            <div className="h-1" /> {/* Spacer spacer to match layout */}
          </div>
          <div className="flex items-center justify-between text-[10px] text-neutral-500 font-mono">
            <span>{lang === 'ru' ? "Текущий тариф:" : "Current rate:"}</span>
            <span className="text-emerald-400/80 font-semibold">
              {telemetry.offlineFallbackActive 
                ? (lang === 'ru' ? "Локальный движок (Бесплатно)" : "Local Engine (Free)") 
                : (lang === 'ru' ? "$0.15 за 1 млн токенов" : "$0.15/1M Tokens")}
            </span>
          </div>
        </div>

      </div>

      {/* Sliding Area Graph & Asynchronous Process controls Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Resource area graph card */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-neutral-900/30 backdrop-blur-md border border-neutral-800/40 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-neutral-200 uppercase tracking-wider flex items-center gap-2 font-mono">
                <Activity className="w-4 h-4 text-cyan-400/80" /> {lang === 'ru' ? "Монитор телеметрии в реальном времени" : "Real-time Telemetry Monitor"}
              </h3>
              <p className="text-[11px] text-neutral-500 mt-0.5">{lang === 'ru' ? "Индекс выборки ресурсов (окно 2 секунды)" : "Sliding resource sampling index (2s sampling window)"}</p>
            </div>
            
            <div className="flex gap-4 text-[11px] font-mono">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded bg-cyan-400/80 block" />
                <span className="text-neutral-400">{lang === 'ru' ? "процессор" : "CPU"}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded bg-violet-400/80 block" />
                <span className="text-neutral-400">{lang === 'ru' ? "память" : "RAM"}</span>
              </div>
            </div>
          </div>

          <div className="h-44 w-full font-mono text-xs opacity-90 hover:opacity-100 transition-opacity duration-300">
            {chartHistory.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-neutral-600 bg-neutral-950/20 rounded-xl border border-neutral-800/40">
                <span className="animate-pulse">{lang === 'ru' ? "Ожидание пакета показателей..." : "Awaiting first index metrics packet..."}</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartHistory} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#22d3ee" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorRam" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#a78bfa" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" stroke="#404040" fontSize={9} />
                  <YAxis domain={[0, 100]} stroke="#404040" fontSize={9} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#171717', borderColor: '#262626', color: '#e5e5e5', borderRadius: '12px', fontSize: '11px' }}
                    labelStyle={{ color: '#a3a3a3', fontWeight: 'bold' }}
                  />
                  <Area type="monotone" dataKey="cpu" name="CPU (%)" stroke="#22d3ee" fillOpacity={1} fill="url(#colorCpu)" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="ram" name="RAM (%)" stroke="#a78bfa" fillOpacity={1} fill="url(#colorRam)" strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Dynamic Compilation and smart caching controls card */}
        <div className="p-6 rounded-2xl bg-neutral-900/30 backdrop-blur-md border border-neutral-800/40 space-y-4 shadow-sm flex flex-col justify-between">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-neutral-200 uppercase tracking-wider flex items-center gap-2 font-mono">
              <Layers className="w-4 h-4 text-orange-400" /> Rust FFI / PGO Engine
            </h3>
            
            <p className="text-xs text-neutral-400 leading-relaxed font-sans">
              {lang === 'ru' 
                ? "Компиляция критических путей производительности напрямую в нативные инструкции через безопасный интерфейс внешних функций Rust FFI." 
                : "Compile hot performance paths directly to Native Machine Instructions via safe Rust Foreign Function Interfaces."}
            </p>

            {/* Asynchronous Feedback with VCS caching & PGO status */}
            <div className="p-3.5 rounded-xl bg-neutral-950/40 border border-neutral-800/50 space-y-2.5 text-xs font-mono">
              {telemetry.compileStatus === 'running' ? (
                <div className="py-2 flex flex-col items-center justify-center gap-2 text-center text-orange-400">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span>
                    {lang === 'ru' 
                      ? `[PID ${Math.floor(Math.random()*4000 + 1005)}] Компиляция в фоновом потоке...` 
                      : `[SPAWNED PID ${Math.floor(Math.random()*4000 + 1000)}] Compiling in separate thread...`}
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500">{lang === 'ru' ? "Статус кэша VCS:" : "VCS Cache Status:"}</span>
                    {rustFfiApplied ? (
                      <span className="text-emerald-400 flex items-center gap-1 font-bold">
                        <FileCheck className="w-3.5 h-3.5" /> {lang === 'ru' ? "КЭШИРОВАННО" : "CACHED HIT"}
                      </span>
                    ) : (
                      <span className="text-neutral-500 font-semibold">{lang === 'ru' ? "НЕ СКОМПИЛИРОВАНО" : "NOT COMPILED"}</span>
                    )}
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500">{lang === 'ru' ? "Состояние PGO профиля:" : "PGO Profile State:"}</span>
                    <span className={rustFfiApplied ? "text-orange-400 font-bold" : "text-neutral-500"}>
                      {rustFfiApplied ? (lang === 'ru' ? "АКТИВЕН (ИНСТРУМЕНТИРОВАН)" : "ACTIVE (INSTRUMENTED)") : (lang === 'ru' ? "НЕАКТИВЕН" : "INACTIVE")}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500">{lang === 'ru' ? "Индекс пропускной способности:" : "Throughput Index:"}</span>
                    <span className={rustFfiApplied ? "text-emerald-400 font-bold" : "text-neutral-400"}>
                      {rustFfiApplied ? (lang === 'ru' ? "142 МБ/с" : "142 MB/s") : (lang === 'ru' ? "12 МБ/с" : "12 MB/s")}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={onToggleRustFfi}
              disabled={telemetry.compileStatus === 'running'}
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold tracking-wider transition-all border cursor-pointer flex items-center justify-center gap-2 ${
                rustFfiApplied 
                  ? "bg-orange-400 text-neutral-950 border-transparent hover:bg-orange-300" 
                  : "bg-neutral-900/60 hover:bg-neutral-900 hover:text-neutral-100 text-neutral-300 border-neutral-800"
              }`}
            >
              {telemetry.compileStatus === 'running' ? (
                <span>{lang === 'ru' ? "Компиляция аддона..." : "Compiling Addon..."}</span>
              ) : rustFfiApplied ? (
                <span>{lang === 'ru' ? "Вернуть V8 JIT (JS)" : "Revert to V8 JIT (JS)"}</span>
              ) : (
                <span>{lang === 'ru' ? "Скомпилировать Rust аддон" : "Compile Rust Addon"}</span>
              )}
            </button>
            <p className="text-[10px] text-center text-neutral-500 font-mono">
              {lang === 'ru' ? "Кэш сборки экономит в среднем 3.2 секунды" : "Build Cache saves average 3.2 seconds build duration"}
            </p>
          </div>
        </div>

      </div>

      {/* Telegram Bot Integration & Theme Settings Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Telegram Integration Panel */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-neutral-900/30 backdrop-blur-md border border-neutral-800/40 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-200 uppercase tracking-wider flex items-center gap-2 font-mono">
              <Send className="w-4 h-4 text-cyan-400/80" /> {lang === 'ru' ? "Диспетчер уведомлений Telegram" : "Telegram Alert Dispatcher"}
            </h3>
            <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold border uppercase tracking-wider ${
              telegramConfig.status === 'connected' && telegramConfig.enabled
                ? "bg-emerald-950/20 text-emerald-400 border-emerald-900/30"
                : "bg-neutral-950/40 text-neutral-500 border-neutral-800/40"
            }`}>
              {telegramConfig.status === 'connected' && telegramConfig.enabled ? (lang === 'ru' ? "АКТИВЕН" : "ACTIVE") : (lang === 'ru' ? "ОТКЛЮЧЕН" : "DISABLED")}
            </span>
          </div>
          
          <p className="text-xs text-neutral-400 leading-relaxed font-sans">
            {lang === 'ru' 
              ? "Отправляйте диагностику сбоев в реальном времени, сводки автоматических исправлений и системные оповещения прямо на ваши мобильные устройства." 
              : "Push real-time failure diagnostics, automated corrective task summaries, and system alerts directly to your mobile devices."}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold tracking-wider text-neutral-500 font-mono">Bot API Token</label>
              <input
                type="password"
                value={localToken}
                onChange={e => setLocalToken(e.target.value)}
                placeholder="e.g. 123456789:AAFg8H..."
                className="w-full bg-neutral-950/60 border border-neutral-800/40 rounded-xl px-3 py-1.5 font-mono text-xs text-neutral-300 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold tracking-wider text-neutral-500 font-mono">{lang === 'ru' ? "Идентификатор чата (Chat ID)" : "Chat ID"}</label>
              <input
                type="text"
                value={localChatId}
                onChange={e => setLocalChatId(e.target.value)}
                placeholder="e.g. 987654321"
                className="w-full bg-neutral-950/60 border border-neutral-800/40 rounded-xl px-3 py-1.5 font-mono text-xs text-neutral-300 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-3 border-t border-neutral-900">
            <label className="flex items-center gap-2.5 text-xs text-neutral-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={telegramEnabled}
                onChange={e => setTelegramEnabled(e.target.checked)}
                className="rounded border-neutral-800 text-cyan-500 focus:ring-cyan-500 h-4 w-4 bg-neutral-950 cursor-pointer"
              />
              <span>{lang === 'ru' ? "Разрешить исходящие уведомления" : "Enable Outgoing Alerts"}</span>
            </label>

            <div className="flex gap-2 w-full sm:w-auto">
              <button
                onClick={() => onUpdateTelegramConfig(localToken, localChatId, telegramEnabled)}
                className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-neutral-900/60 hover:bg-neutral-900 text-neutral-300 hover:text-neutral-100 border border-neutral-800 text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer"
              >
                {lang === 'ru' ? "Применить" : "Apply"}
              </button>
              <button
                onClick={onTestTelegram}
                disabled={telegramConfig.status !== "connected"}
                className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed text-neutral-950 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
              >
                {lang === 'ru' ? "Проверить" : "Test Dispatch"}
              </button>
            </div>
          </div>
        </div>

        {/* GUI Themes Swapper */}
        <div className="p-6 rounded-2xl bg-neutral-900/30 backdrop-blur-md border border-neutral-800/40 flex flex-col justify-between shadow-sm">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-neutral-200 uppercase tracking-wider flex items-center gap-2 font-mono">
              <Shield className="w-4 h-4 text-cyan-400/80" /> {lang === 'ru' ? "Конфигурация темы" : "Theme Configuration"}
            </h3>
            
            <p className="text-xs text-neutral-500 leading-relaxed font-sans">
              {lang === 'ru' ? "Выберите тему в соответствии с вашими предпочтениями:" : "Choose an aesthetic environment that matches your preferences:"}
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              {[
                { id: 'midnight', name: lang === 'ru' ? 'Полуночная' : 'Midnight', accent: 'bg-cyan-400' },
                { id: 'cyber', name: lang === 'ru' ? 'Кибер' : 'Cyber', accent: 'bg-emerald-400' },
                { id: 'rose', name: lang === 'ru' ? 'Розовая' : 'Rose', accent: 'bg-pink-400' },
                { id: 'rust_perf', name: lang === 'ru' ? 'Ржавчина' : 'Rust', accent: 'bg-orange-400' }
              ].map(th => (
                <button
                  key={th.id}
                  onClick={() => onSelectTheme(th.id as any)}
                  className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                    currentTheme === th.id
                      ? "bg-neutral-950 border-cyan-500/80 text-neutral-100 shadow-sm"
                      : "bg-neutral-950/40 border-neutral-800/40 text-neutral-400 hover:border-neutral-800 hover:text-neutral-300"
                  }`}
                >
                  <span className="text-xs font-semibold">{th.name}</span>
                  <span className={`w-2 h-2 rounded-full ${th.accent}`} />
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-neutral-900 text-center text-[10px] text-neutral-600 font-mono">
            {lang === 'ru' ? "Активное оформление: " : "Active workspace skin: "}<span className="uppercase text-cyan-400 font-bold">{currentTheme}</span>
          </div>
        </div>

      </div>

      {/* Hierarchical Console Logs - Reworked with Apple Minimalism */}
      <div className="p-6 rounded-2xl bg-neutral-900/30 backdrop-blur-md border border-neutral-800/40 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-neutral-200 uppercase tracking-wider flex items-center gap-2 font-mono">
              <Terminal className="w-4 h-4 text-cyan-400/80" /> {lang === 'ru' ? "Иерархическая консоль событий" : "Hierarchical Event Console"}
            </h3>
            <p className="text-[11px] text-neutral-500 mt-0.5">{lang === 'ru' ? "Отфильтрованный диагностический вывод и отчеты трассировки контейнера" : "Filtered diagnostic output and container trace reports"}</p>
          </div>

          {/* Elegant Sliding Hierarchical Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <button 
              onClick={() => {
                const nextVal = !autoScroll;
                setAutoScroll(nextVal);
                isAtBottomRef.current = nextVal;
                if (nextVal && logContainerRef.current) {
                  logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
                }
              }}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-mono border transition-all cursor-pointer flex items-center gap-1.5 ${
                autoScroll 
                  ? "bg-cyan-950/40 text-cyan-400 border-cyan-900/40" 
                  : "bg-neutral-950/40 text-neutral-500 border-neutral-900/40"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${autoScroll ? "bg-cyan-400 animate-pulse" : "bg-neutral-600"}`} />
              {lang === 'ru' ? "Автопрокрутка" : "Auto-scroll"}
            </button>

            <div className="flex p-0.5 bg-neutral-950 border border-neutral-800/60 rounded-xl">
              {[
                { id: 'system', name: lang === 'ru' ? 'Система' : 'System Logs' },
                { id: 'task', name: lang === 'ru' ? 'Задачи ИИ' : 'AI Tasks' },
                { id: 'alert', name: lang === 'ru' ? 'Оповещения' : 'Alerts' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveLogTab(tab.id as any);
                    isAtBottomRef.current = true;
                    setAutoScroll(true);
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                    activeLogTab === tab.id 
                      ? "bg-neutral-900 text-neutral-200 font-semibold" 
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {tab.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Minimalist terminal window */}
        <div 
          ref={logContainerRef}
          className="h-60 rounded-xl bg-neutral-950/80 border border-neutral-800/40 p-4 font-mono text-[11px] overflow-y-auto space-y-2.5 scrollbar-thin"
        >
          {filteredLogs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-neutral-600">
              {lang === 'ru' 
                ? `В иерархии "${activeLogTab.toUpperCase()}" нет зарегистрированных логов.` 
                : `No registered logs inside the "${activeLogTab.toUpperCase()}" hierarchy.`}
            </div>
          ) : (
            filteredLogs.map(log => (
              <div 
                key={log.id} 
                className={`p-2.5 rounded-xl border flex items-start gap-3 transition-all ${getLogStyle(log.level)}`}
              >
                <div className="mt-0.5 flex-shrink-0">
                  {getSourceIcon(log.source)}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] uppercase px-1.5 py-0.2 rounded font-bold tracking-wider bg-neutral-900/50 text-neutral-400">
                      {log.source}
                    </span>
                    <span className="text-[10px] text-neutral-500">{log.timestamp}</span>
                  </div>
                  <p className="leading-relaxed whitespace-pre-wrap">{log.text}</p>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between text-[11px] text-neutral-500 font-mono">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>{lang === 'ru' ? "приемник трассировки syslog: подключен" : "syslog trace receiver: connected"}</span>
          </div>
          <span>{lang === 'ru' ? "Всего событий в памяти: " : "Total registered event blocks: "}{logs.length}</span>
        </div>
      </div>

    </div>
  );
}
