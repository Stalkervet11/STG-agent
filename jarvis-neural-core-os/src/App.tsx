import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ViewMode, CoreState, ChatMessage } from './types';
import { useCoreState } from './hooks/useCoreState';
import { parseIntent } from './services/intentParser';
import type { ParsedIntent } from './services/intentParser';
import { askAi, askOpenRouter } from './services/openrouter';
import { speakText } from './services/tts';
import {
  askLocalOnly,
  executeResourceHandler,
  addResource,
  removeResource,
  listResources,
  browserOpen,
  browserFetch,
  browserSearch,
  browserScreenshot,
  executeShell,
  createFileWithContent,
  runAiderTask,
} from './services/resourceManager';
import { invoke } from '@tauri-apps/api/core';
import { Header } from './components/Layout/Header';
import { Sidebar } from './components/Layout/Sidebar';
import { MinimalModeView } from './components/Views/MinimalModeView';
import { DevCenterFullView } from './components/Views/DevCenterFullView';
import { SettingsCenterView } from './components/Views/SettingsCenterView';
import { AiderWorkspaceView } from './components/Views/AiderWorkspaceView';
import { Bot, Sparkles, X, Image, Globe, FileText, Terminal, Trash2, Camera, HardDrive } from 'lucide-react';

export default function App() {
  const { coreState, payload, setCoreState } = useCoreState();
  const [viewMode, setViewMode] = useState<ViewMode>('full');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [activeMessage, setActiveMessage] = useState<ChatMessage | null>(null);
  const [showPowerModal, setShowPowerModal] = useState<boolean>(false);
  // Chat message history
  const [messageLog, setMessageLog] = useState<ChatMessage[]>([]);
  const [showChatLog, setShowChatLog] = useState<boolean>(false);

  const isProcessingRef = useRef(false);
  const isMountedRef = useRef(true);
  const commandTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Helper to add message to log
  const addToLog = useCallback((sender: 'user' | 'jarvis', text: string) => {
    const msg: ChatMessage = {
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      sender,
      text,
      timestamp: new Date().toLocaleTimeString(),
    };
    setMessageLog(prev => [...prev.slice(-99), msg]); // keep last 100
    return msg;
  }, []);

  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);
  useEffect(() => { isMountedRef.current = true; return () => { isMountedRef.current = false; }; }, []);

  useEffect(() => {
    setCoreState('startup', 'System Boot', 'Initializing Fedora daemons & Rust Core...');
    const timer = setTimeout(() => {
      if (isMountedRef.current) {
        setCoreState('idle', 'System Ready', 'JARVIS Neural Core OS Ready.');
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [setCoreState]);

  const doneProcessing = useCallback(() => {
    if (!isMountedRef.current) return;
    isProcessingRef.current = false;
    setIsProcessing(false);
    if (commandTimeoutRef.current) clearTimeout(commandTimeoutRef.current);
    commandTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) setCoreState('idle', 'System Ready', 'Awaiting next command');
    }, 2000);
  }, [setCoreState]);

  const showReply = useCallback((text: string) => {
    if (!isMountedRef.current) return;
    const msg = addToLog('jarvis', text);
    setActiveMessage(msg);
    speakText(text).catch(() => {});
  }, [addToLog]);

  const handleExecuteCommand = useCallback(async (command: string) => {
    if (!command.trim() || isProcessingRef.current) return;

    // Handle pre-formatted messages (from voice pipeline)
    if (command.startsWith('[OK]') || command.startsWith('[ERR]')) {
      if (isMountedRef.current) {
        const msg = addToLog('jarvis', command);
        setActiveMessage(msg);
      }
      return;
    }

    isProcessingRef.current = true;
    setIsProcessing(true);
    addToLog('user', command);

    const parsed: ParsedIntent = parseIntent(command);

    // ═══════════════════════════════════════════════════════
    // LOCAL CONTOUR — personal resources
    // ═══════════════════════════════════════════════════════
    if (parsed.action === 'local_resource' && parsed.matchedResource) {
      setCoreState('working', 'Local Resource', `Accessing: ${parsed.matchedResource}`);
      try {
        // 1. Try to execute handler script first
        if (parsed.shouldRunHandler) {
          try {
            const handlerResult = await executeResourceHandler(parsed.matchedResource, command);
            if (isMountedRef.current) {
              showReply(`🔒 [ЛОКАЛЬНЫЙ КОНТУР] ${parsed.matchedResource}\n${handlerResult}`);
            }
            doneProcessing();
            return;
          } catch (handlerErr) {
            console.warn(`[LOCAL] Handler '${parsed.matchedResource}' failed, falling back to local LLM:`, handlerErr);
          }
        }
        // 2. Fallback: ask local-only LLM (Ollama, NEVER cloud)
        const localReply = await askLocalOnly(
          `[LOCAL-ONLY MODE] User is asking about their personal resource: "${parsed.matchedResource}". Query: "${command}". Process this locally. Never mention cloud APIs.`
        );
        if (isMountedRef.current) {
          showReply(`🔒 [ЛОКАЛЬНЫЙ КОНТУР] ${parsed.matchedResource}\n${localReply}`);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (isMountedRef.current) addToLog('jarvis', `❌ Локальный контур: ${errMsg}`);
      } finally { doneProcessing(); }
      return;
    }

    if (parsed.action === 'local_ai_only') {
      setCoreState('working', 'Local AI (Ollama)', `Processing locally: "${command}"`);
      try {
        const reply = await askLocalOnly(command);
        if (isMountedRef.current) showReply(`🔒 [ЛОКАЛЬНО] ${reply}`);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (isMountedRef.current) {
          const msg = addToLog('jarvis', `❌ Локальная LLM недоступна: ${errMsg}\n💡 Запустите: ollama serve && ollama pull llama3.2`);
          setActiveMessage(msg);
        }
      } finally { doneProcessing(); }
      return;
    }

    // ═══════════════════════════════════════════════════════
    // TEACH / FORGET / LIST RESOURCES
    // ═══════════════════════════════════════════════════════
    if (parsed.action === 'teach_resource') {
      setCoreState('working', 'Learning', `Teaching new resource: ${parsed.target}`);
      try {
        const result = await addResource(parsed.target, [], undefined, 'local_only', `Added by voice command: "${command}"`);
        if (isMountedRef.current) {
          showReply(`🧠 Запомнил новый локальный ресурс: "${result.name}"\n📝 Тип: ${result.type}\n💡 Теперь запросы с этим ресурсом будут обрабатываться локально.`);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (isMountedRef.current) addToLog('jarvis', `❌ Не удалось добавить ресурс: ${errMsg}`);
      } finally { doneProcessing(); }
      return;
    }

    if (parsed.action === 'forget_resource') {
      setCoreState('working', 'Forgetting', `Removing resource: ${parsed.target}`);
      try {
        const result = await removeResource(parsed.target);
        if (isMountedRef.current) showReply(`🗑️ ${result}`);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (isMountedRef.current) addToLog('jarvis', `❌ ${errMsg}`);
      } finally { doneProcessing(); }
      return;
    }

    if (parsed.action === 'list_resources') {
      setCoreState('working', 'Resources', 'Listing local resources...');
      try {
        const resources = await listResources();
        const list = resources.map(r =>
          `• ${r.name}${r.handler_script ? ' 🔧' : ''} — ${r.description || 'нет описания'}`
        ).join('\n');
        if (isMountedRef.current) {
          showReply(`🔒 ЛОКАЛЬНЫЕ РЕСУРСЫ (${resources.length}):\n${list}\n\n📁 Реестр: ~/.config/jarvis/local_resources.json`);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (isMountedRef.current) addToLog('jarvis', `❌ ${errMsg}`);
      } finally { doneProcessing(); }
      return;
    }

    // ═══════════════════════════════════════════════════════
    // BROWSER SURFING
    // ═══════════════════════════════════════════════════════
    if (parsed.action === 'browser_open') {
      setCoreState('working', 'Browser', `Opening: ${parsed.target}`);
      try {
        const result = await browserOpen(parsed.target);
        if (isMountedRef.current) showReply(`🌐 ${result}`);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (isMountedRef.current) addToLog('jarvis', `❌ Browser: ${errMsg}`);
      } finally { doneProcessing(); }
      return;
    }

    if (parsed.action === 'browser_screenshot') {
      setCoreState('working', 'Screenshot', `Capturing: ${parsed.target}`);
      try {
        const result = await browserScreenshot(parsed.target);
        if (isMountedRef.current) {
          const msg = addToLog('jarvis', `📸 Скриншот: ${parsed.target}`);
          setActiveMessage(msg);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (isMountedRef.current) addToLog('jarvis', `❌ Screenshot: ${errMsg}`);
      } finally { doneProcessing(); }
      return;
    }

    if (parsed.action === 'browser_search') {
      setCoreState('working', 'Web Search', `Searching: ${parsed.target}`);
      try {
        const query = encodeURIComponent(parsed.target);
        const result = await browserSearch('https://www.google.com', 'textarea[name="q"], input[name="q"]', parsed.target);
        if (isMountedRef.current) showReply(`🔍 ${result}`);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        // Fallback: open in system browser
        try {
          await invoke<string>('execute_command', { action: 'search', target: parsed.target });
          if (isMountedRef.current) showReply(`🔍 Поиск открыт в браузере: ${parsed.target}`);
        } catch {
          if (isMountedRef.current) addToLog('jarvis', `❌ Поиск: ${errMsg}`);
        }
      } finally { doneProcessing(); }
      return;
    }

    if (parsed.action === 'browser_fetch') {
      setCoreState('working', 'Data Extraction', `Fetching: ${parsed.target}`);
      try {
        const result = await browserFetch(parsed.target);
        if (isMountedRef.current) {
          const truncated = result.length > 500 ? result.slice(0, 500) + '...' : result;
          showReply(`📄 Данные с ${parsed.target}:\n${truncated}`);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (isMountedRef.current) addToLog('jarvis', `❌ Fetch: ${errMsg}`);
      } finally { doneProcessing(); }
      return;
    }

    // ═══════════════════════════════════════════════════════
    // SHELL EXEC
    // ═══════════════════════════════════════════════════════
    if (parsed.action === 'shell_exec') {
      setCoreState('working', 'Shell', `Running: ${parsed.target}`);
      try {
        const result = await executeShell(parsed.target);
        if (isMountedRef.current) {
          showReply(`$ ${parsed.target}\n${result}`);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (isMountedRef.current) addToLog('jarvis', `❌ Shell: ${errMsg}`);
      } finally { doneProcessing(); }
      return;
    }

    // ═══════════════════════════════════════════════════════
    // WRITE FILE
    // ═══════════════════════════════════════════════════════
    if (parsed.action === 'write_file') {
      const parts = parsed.target.split('|||');
      const filePath = parts[0]?.trim() || '';
      const fileContent = parts.slice(1).join('|||').trim() || '';
      if (!filePath || !fileContent) {
        if (isMountedRef.current) addToLog('jarvis', '⚠️ Specify: write to file PATH content TEXT');
        doneProcessing();
        return;
      }
      setCoreState('working', 'File Writer', `Writing: ${filePath}`);
      try {
        const result = await createFileWithContent(filePath, fileContent);
        if (isMountedRef.current) showReply(`📝 ${result}`);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (isMountedRef.current) addToLog('jarvis', `❌ File: ${errMsg}`);
      } finally { doneProcessing(); }
      return;
    }

    // ═══════════════════════════════════════════════════════
    // CODE MODIFY (Aider)
    // ═══════════════════════════════════════════════════════
    if (parsed.action === 'code_modify') {
      setCoreState('working', 'Aider Code Studio', `Aider: ${parsed.target}`);
      try {
        const result = await runAiderTask(parsed.target);
        if (isMountedRef.current) showReply(`🧬 ${result}`);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (isMountedRef.current) addToLog('jarvis', `❌ Aider: ${errMsg}`);
      } finally { doneProcessing(); }
      return;
    }

    // ═══════════════════════════════════════════════════════
    // LEGACY SYSTEM COMMANDS (search, launch, vpn, folders)
    // ═══════════════════════════════════════════════════════
    if (
      parsed.action === 'search' || parsed.action === 'launch' ||
      parsed.action === 'vpn_start' || parsed.action === 'vpn_restart' ||
      parsed.action === 'create_folder' || parsed.action === 'create_file'
    ) {
      setCoreState('working', 'System', `${parsed.action}: ${parsed.target}`);
      try {
        const result = await invoke<string>('execute_command', { action: parsed.action, target: parsed.target });
        if (isMountedRef.current) showReply(`✅ ${result}`);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (isMountedRef.current) addToLog('jarvis', `❌ ${errMsg}`);
      } finally { doneProcessing(); }
      return;
    }

    // ═══════════════════════════════════════════════════════
    // GENERAL AI QUERY (Ollama → OpenRouter fallback)
    // ═══════════════════════════════════════════════════════
    setCoreState('working', 'JARVIS AI', `Processing: "${command}"`);
    try {
      let reply: string;
      try {
        reply = await askAi(command);
      } catch (_routerErr) {
        console.warn('[AI] Router failed, trying OpenRouter directly...');
        reply = await askOpenRouter(command);
      }
      if (isMountedRef.current) showReply(reply);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (isMountedRef.current) {
        const msg = addToLog('jarvis', errMsg);
        setActiveMessage(msg);
      }
    } finally { doneProcessing(); }
  }, [setCoreState, addToLog, showReply, doneProcessing]);

  useEffect(() => {
    const handleVoiceCommand = (e: any) => { handleExecuteCommand(e.detail); };
    window.addEventListener('jarvis-execute-command', handleVoiceCommand);
    return () => window.removeEventListener('jarvis-execute-command', handleVoiceCommand);
  }, [handleExecuteCommand]);

  const handleViewModeChange = useCallback((mode: ViewMode) => { setViewMode(mode); }, []);
  const handlePowerOff = useCallback(() => { setShowPowerModal(true); }, []);
  const handleStateChange = useCallback((state: CoreState) => { setCoreState(state, 'Manual Test', `Shifted state to ${state}`); }, [setCoreState]);
  const handleTriggerState = useCallback((s: CoreState, src: string, msg: string) => { setCoreState(s, src, msg); }, [setCoreState]);

  return (
    <div className="w-screen h-screen flex flex-col bg-[#050609] text-slate-100 overflow-hidden font-sans select-none antialiased">
      <Header viewMode={viewMode} onViewModeChange={handleViewModeChange} coreState={coreState} />
      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar currentView={viewMode} onViewChange={handleViewModeChange} onPowerOff={handlePowerOff} onToggleChatLog={() => setShowChatLog(prev => !prev)} chatLogOpen={showChatLog} />
        <main className="flex-1 flex flex-col overflow-hidden relative">
          {viewMode === 'minimal' && (
            <MinimalModeView coreState={coreState} onStateChange={handleStateChange} onExecuteCommand={handleExecuteCommand} isProcessing={isProcessing} />
          )}
          {viewMode === 'full' && (
            <DevCenterFullView coreState={coreState} onStateChange={handleStateChange} onExecuteCommand={handleExecuteCommand} isProcessing={isProcessing} />
          )}
          {viewMode === 'settings' && <SettingsCenterView />}
          {viewMode === 'aider' && <AiderWorkspaceView onTriggerState={handleTriggerState} />}
        </main>
      </div>
      {activeMessage && <ActiveMessagePopup message={activeMessage} onDismiss={() => setActiveMessage(null)} />}
      {showChatLog && <ChatLogPanel messages={messageLog} onClose={() => setShowChatLog(false)} onClear={() => setMessageLog([])} />}
      {showPowerModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="p-6 rounded-2xl bg-[#0d0f18] border border-red-500/40 max-w-sm w-full text-center shadow-[0_0_50px_rgba(239,68,68,0.3)]">
            <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 border border-red-500/40 flex items-center justify-center mx-auto mb-3">
              <Bot className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider mb-2">SHUTDOWN JARVIS OS?</h3>
            <p className="text-xs font-mono text-slate-400 mb-6">All active Fedora Linux background daemons and OpenRouter API sessions will be safely terminated.</p>
            <div className="flex items-center justify-center gap-3 font-mono text-xs">
              <button onClick={() => setShowPowerModal(false)} className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700">Cancel</button>
              <button onClick={() => { setCoreState('startup', 'Shutdown', 'Powering off daemons...'); setShowPowerModal(false); }} className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold shadow-[0_0_15px_rgba(239,68,68,0.4)]">Shutdown</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ActiveMessagePopup = React.memo(({ message, onDismiss }: { message: ChatMessage; onDismiss: () => void }) => (
  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-xl w-full px-4">
    <div className="p-4 rounded-2xl bg-[#0e111a]/95 border border-cyan-500/40 backdrop-blur-2xl shadow-[0_0_40px_rgba(0,240,255,0.2)] flex items-start gap-3">
      <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
        <Bot className="w-5 h-5 animate-pulse" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-mono font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">JARVIS RESPONSE <Sparkles className="w-3 h-3 text-purple-400" /></span>
          <span className="text-[10px] font-mono text-slate-500">{message.timestamp}</span>
        </div>
        <p className="text-xs font-mono text-slate-200 leading-relaxed">{message.text}</p>
      </div>
      <button onClick={onDismiss} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
    </div>
  </div>
));

const ChatLogPanel = React.memo(({
  messages,
  onClose,
  onClear,
}: {
  messages: ChatMessage[];
  onClose: () => void;
  onClear: () => void;
}) => (
  <div className="fixed right-0 top-16 bottom-0 w-96 z-40 bg-[#0a0d14]/95 border-l border-cyan-500/30 backdrop-blur-xl shadow-[-10px_0_40px_rgba(0,0,0,0.5)] flex flex-col">
    {/* Header */}
    <div className="p-4 border-b border-slate-800 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
        <h3 className="text-xs font-mono font-bold text-cyan-300 uppercase tracking-wider">CHAT LOG</h3>
        <span className="text-[10px] font-mono text-slate-500">({messages.length})</span>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={onClear} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-red-400 transition-colors" title="Clear log">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
    {/* Messages */}
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      {messages.length === 0 && (
        <div className="text-center text-slate-500 text-xs font-mono mt-20">
          <Globe className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>No messages yet.</p>
          <p className="text-[10px] mt-1">Type a command or use voice input.</p>
        </div>
      )}
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`p-3 rounded-xl text-xs font-mono leading-relaxed ${
            msg.sender === 'user'
              ? 'bg-cyan-500/10 border border-cyan-500/20 ml-4'
              : 'bg-[#0e111a] border border-slate-700/60 mr-4'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${
              msg.sender === 'user' ? 'text-cyan-400' : 'text-purple-400'
            }`}>
              {msg.sender === 'user' ? 'YOU' : 'JARVIS'}
            </span>
            <span className="text-[9px] text-slate-500">{msg.timestamp}</span>
          </div>
          <pre className="text-slate-200 whitespace-pre-wrap break-words font-mono text-xs">
            {msg.text}
          </pre>
        </div>
      ))}
    </div>
    {/* Footer hint */}
    <div className="p-2 border-t border-slate-800 text-center">
      <p className="text-[9px] font-mono text-slate-500">
        🔒 Local resources processed offline | 💬 Click sidebar to toggle
      </p>
    </div>
  </div>
));
