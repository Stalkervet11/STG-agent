import React, { useState, useEffect, useRef } from "react";
import { 
  Terminal, 
  Cpu, 
  Code2, 
  Zap, 
  Moon, 
  HelpCircle, 
  Folder, 
  FolderGit2, 
  Activity, 
  CloudOff, 
  CloudLightning,
  Undo2,
  RefreshCw,
  Users,
  Send,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Save,
  BookOpen,
  SlidersHorizontal,
  Download,
  Plus,
  Trash2,
  ExternalLink,
  FileText,
  ChevronRight,
  Loader2,
  Eye,
  EyeOff,
  FileDiff,
  Sparkles,
  Check,
  Settings,
  AlertCircle,
  FolderSync,
  Play,
  RotateCcw
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  VirtualProject, 
  VirtualFile,
  AiderTask, 
  SystemTelemetry, 
  LogMessage, 
  ModelConfig,
  TelegramConfig
} from "./types";

// Inner interfaces for Obsidian Knowledge Base Sync
interface ObsidianFile {
  id: string;
  title: string;
  path: string;
  category: 'Documentation' | 'Guides' | 'System' | 'Tasks';
  tags: string[];
  updatedAt: string;
  content: string;
}

// Inner interfaces for Custom Agent Prompts & Rules
interface AgentSkill {
  id: string;
  name: string;
  nameRu: string;
  description: string;
  descriptionRu: string;
  systemPrompt: string;
  category: 'Code Safety' | 'Integrations' | 'Testing' | 'Custom';
  active: boolean;
  author: 'System' | 'User';
}

export default function App() {
  // --- STATE ---
  const [projects, setProjects] = useState<Record<string, VirtualProject>>({});
  const [activeProjectId, setActiveProjectId] = useState<string>("project-1");
  const [tasks, setTasks] = useState<AiderTask[]>([]);
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [telemetry, setTelemetry] = useState<SystemTelemetry>({
    cpuUsage: 14,
    ramUsage: 31,
    activeTasks: 0,
    tokensUsed: 0,
    tokensLimit: 250000,
    apiCost: 0,
    offlineFallbackActive: false,
    isNightMode: false,
    networkSpeed: 142,
    ramWarningTriggered: false,
    performanceCritical: false,
    leakDetectionActive: true,
    testRunnerStatus: "idle",
    compileStatus: "idle",
    buildCacheHit: true,
    pgoActive: false
  });
  const [modelConfigs, setModelConfigs] = useState<ModelConfig[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>("gemini-3.5-flash");
  const [isNightModeAutomationRunning, setIsNightModeAutomationRunning] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Interface preferences
  const [lang, setLang] = useState<'en' | 'ru'>(() => {
    const saved = localStorage.getItem("aider_cockpit_lang");
    return (saved === "ru" || saved === "en") ? saved : "en";
  });
  
  // Theme state mode - Claude Sand Light (default) or Slate Dark
  const [themeMode, setThemeMode] = useState<'warm-light' | 'slate-dark'>(() => {
    const saved = localStorage.getItem("aider_theme_mode");
    return (saved === 'slate-dark' || saved === 'warm-light') ? saved : 'warm-light';
  });

  const [memoryPoolEnabled, setMemoryPoolEnabled] = useState<boolean>(false);
  const [rustFfiApplied, setRustFfiApplied] = useState<boolean>(false);
  const [telegramConfig, setTelegramConfig] = useState<TelegramConfig>({
    botToken: "",
    chatId: "",
    enabled: false,
    status: 'disconnected'
  });

  // Dual-pane layout tab selection
  const [activeRightTab, setActiveRightTab] = useState<'editor' | 'tests' | 'obsidian' | 'settings'>('editor');
  
  // Code editor states
  const [selectedFilePath, setSelectedFilePath] = useState<string>("");
  const [editorContent, setEditorContent] = useState<string>("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);

  // Chat inputs & states
  const [chatInput, setChatInput] = useState<string>("");
  const [isChatSending, setIsChatSending] = useState<boolean>(false);
  const [chatHistory, setChatHistory] = useState<Array<{
    id: string;
    sender: 'user' | 'claude' | 'pm' | 'architect' | 'coder' | 'qa';
    senderName: string;
    avatar: string;
    text: string;
    textRu: string;
    timestamp: string;
    progress?: number;
    logs?: string[];
  }>>([
    {
      id: "welcome-1",
      sender: "claude",
      senderName: "Hermes",
      avatar: "✨",
      text: "Hello! I am the Hermes Orchestrator, integrated inside your virtual project environment. Type a prompt here, and my coordinated specialist agents will write the code patches, run unit tests, and resolve bugs directly. How can I assist you with your code today?",
      textRu: "Приветствую! Я оркестратор Hermes, интегрированный в вашу виртуальную среду разработки. Напишите здесь запрос, и моя скоординированная команда ИИ-специалистов применит патчи кода, запустит тесты и устранит ошибки. Чем я могу помочь вам сегодня?",
      timestamp: new Date().toLocaleTimeString().slice(0, 5)
    }
  ]);

  // Obsidian Vault Notes State
  const [obsidianFiles, setObsidianFiles] = useState<ObsidianFile[]>([
    {
      id: "obs-1",
      title: "Hermes-Index",
      path: "Vault/Hermes-Index.md",
      category: "System",
      tags: ["#index", "#agents", "#knowledge"],
      updatedAt: "Just now",
      content: `# Hermes Multi-Agent Knowledge Vault\n\nWelcome to your synced local documentation space! This knowledge base maps directly to your active sandbox files.\n\n## Team Structure\n- **Cassandra (PM)**: Translates user prompts to file roadmaps.\n- **Solomon (Architect)**: Verifies algorithmic logic and imports.\n- **Aura (Coder)**: Dispatches file modifications.\n- **Orion (QA)**: Executes test assertions.\n\nReferenced sheets: [[Calculator-Blueprint]], [[Tasks]]`
    },
    {
      id: "obs-2",
      title: "Calculator-Blueprint",
      path: "Vault/Calculator-Blueprint.md",
      category: "Documentation",
      tags: ["#math", "#specifications"],
      updatedAt: "10 mins ago",
      content: `# Calculator Service Specification\n\nThis document tracks the safety constraints of the math microservice.\n\n## Division Integrity\n- **Requirement**: Any division operation must throw an error if the divisor evaluates to 0.\n- **Link reference**: [[Hermes-Index]]\n- See current TODO status: [[Tasks]]`
    },
    {
      id: "obs-3",
      title: "Tasks",
      path: "Vault/Tasks.md",
      category: "Tasks",
      tags: ["#backlog", "#todo"],
      updatedAt: "1 hour ago",
      content: `# Active Backlog & Milestone Verification\n\n- [x] Create sleek modern user interface\n- [ ] Fix Division by Zero bug in calculator\n- [ ] Secure password strength validator in Auth module\n- [ ] Map all workspace files to Obsidian markdown tags`
    }
  ]);
  const [selectedObsidianFile, setSelectedObsidianFile] = useState<ObsidianFile | null>(null);
  const [newObsidianTitle, setNewObsidianTitle] = useState<string>("");
  const [obsidianSearch, setObsidianSearch] = useState<string>("");

  // Agentic Custom Prompts & Rules (System instructions injected into AI)
  const [skills, setSkills] = useState<AgentSkill[]>([
    {
      id: "sk-obsidian",
      name: "Obsidian Auto-Linker",
      nameRu: "Авто-линкер Obsidian",
      description: "Auto-formats all markdown outputs with frontmatter tags and double brackets linking.",
      descriptionRu: "Форматирует Markdown-выводы с разметкой Obsidian [[ссылок]].",
      systemPrompt: "Incorporate [[Obsidian]] backlinks and hashtags in all generated summaries.",
      category: "Custom",
      active: true,
      author: "System"
    },
    {
      id: "sk-zero-div",
      name: "Defensive Division Check",
      nameRu: "Защита от деления на ноль",
      description: "Instructs Aura and Solomon to write defensive code checkers against division-by-zero faults.",
      descriptionRu: "Заставляет Aura и Solomon писать надежные защитные проверки перед делением на ноль.",
      systemPrompt: "Always write rigorous division-by-zero checks when generating math or arithmetic operations.",
      category: "Code Safety",
      active: true,
      author: "System"
    },
    {
      id: "sk-jwt",
      name: "JWT Salt Vault protection",
      nameRu: "Защита секретов JWT",
      description: "Intercepts hardcoded passwords and secrets, forcing extract to process.env variables.",
      descriptionRu: "Перехватывает зашитые в код пароли и секреты, принудительно вынося их в process.env.",
      systemPrompt: "Do not allow hardcoded authentication keys. Instantly extract tokens to process.env.KEY.",
      category: "Code Safety",
      active: false,
      author: "System"
    }
  ]);
  const [newSkillName, setNewSkillName] = useState<string>("");
  const [newSkillPrompt, setNewSkillPrompt] = useState<string>("");
  const [isSkillCreatorOpen, setIsSkillCreatorOpen] = useState<boolean>(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // --- ACTIONS & API INTEGRATION ---
  
  // Sync state from Express server
  const fetchState = async () => {
    try {
      const response = await fetch("/api/state");
      const data = await response.json();
      setProjects(data.projects);
      setActiveProjectId(data.activeProjectId);
      setTasks(data.tasks);
      setLogs(data.logs);
      setTelemetry(data.telemetry);
      setModelConfigs(data.modelConfigs);
      setSelectedModelId(data.selectedModelId);
      setIsNightModeAutomationRunning(data.isNightModeAutomationRunning);
      
      if (data.currentTheme) {
        // We override theme configs with our warm-light / slate-dark setting
      }
      if (data.telegramConfig) setTelegramConfig(data.telegramConfig);
      setMemoryPoolEnabled(!!data.memoryPoolEnabled);
      setRustFfiApplied(!!data.rustFfiApplied);

      setIsLoading(false);
    } catch (err) {
      console.error("Failed to load server state:", err);
    }
  };

  useEffect(() => {
    fetchState();
    // Continuous polling at 1.5s intervals for ultra-responsive metrics and background Aider workers
    const pollInterval = setInterval(fetchState, 1500);
    return () => clearInterval(pollInterval);
  }, []);

  // Update selected file editor content when switching workspace project
  const activeProject = projects[activeProjectId];
  useEffect(() => {
    if (activeProject) {
      const files = Object.values(activeProject.files) as VirtualFile[];
      if (files.length > 0) {
        const fileExists = files.find(f => f.path === selectedFilePath);
        if (!fileExists) {
          setSelectedFilePath(files[0].path);
          setEditorContent(files[0].content);
          setHasUnsavedChanges(false);
        }
      }
    }
  }, [activeProjectId, projects]);

  // If active file content updates from backend, refresh our editor content (unless we have unsaved modifications)
  useEffect(() => {
    if (activeProject && selectedFilePath) {
      const currentFile = activeProject.files[selectedFilePath];
      if (currentFile && !hasUnsavedChanges) {
        setEditorContent(currentFile.content);
      }
    }
  }, [projects, selectedFilePath, activeProject]);

  // Autoscroll chat history
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const handleToggleLang = () => {
    const nextLang = lang === 'en' ? 'ru' : 'en';
    setLang(nextLang);
    localStorage.setItem("aider_cockpit_lang", nextLang);
  };

  const handleToggleTheme = () => {
    const nextTheme = themeMode === 'warm-light' ? 'slate-dark' : 'warm-light';
    setThemeMode(nextTheme);
    localStorage.setItem("aider_theme_mode", nextTheme);
  };

  const handleSelectProject = async (projectId: string) => {
    try {
      const response = await fetch("/api/project/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId })
      });
      const data = await response.json();
      if (data.success) {
        setActiveProjectId(projectId);
        fetchState();
      }
    } catch (err) {
      console.error("Failed to change active workspace:", err);
    }
  };

  const handleFileClick = (path: string) => {
    if (hasUnsavedChanges) {
      if (!confirm(lang === 'ru' ? "Сбросить несохраненные изменения?" : "Discard unsaved changes?")) return;
    }
    const file = activeProject.files[path];
    setSelectedFilePath(path);
    setEditorContent(file.content);
    setHasUnsavedChanges(false);
  };

  const handleFileUpdate = async (filePath: string, content: string) => {
    try {
      const response = await fetch("/api/file/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath, content })
      });
      const data = await response.json();
      if (data.success) {
        setHasUnsavedChanges(false);
        fetchState();
        
        // Show QA tests warning
        setChatHistory(prev => [
          ...prev,
          {
            id: `sys-${Date.now()}`,
            sender: "qa",
            senderName: "Orion (QA)",
            avatar: "🛡️",
            text: `Manual save completed on \`/${filePath}\`. Re-running active unit test harness immediately to verify compilation state.`,
            textRu: `Ручное сохранение в \`/${filePath}\` завершено. Запускаю прогон юнит-тестов для проверки корректности сборки.`,
            timestamp: new Date().toLocaleTimeString().slice(0, 5)
          }
        ]);
        
        // Invoke tests automatically
        handleRunTests();
      }
    } catch (err) {
      console.error("Failed to save file edits:", err);
    }
  };

  const handleRunTests = async () => {
    try {
      await fetch("/api/project/run-tests", { method: "POST" });
      fetchState();
    } catch (err) {
      console.error("Failed to execute unit test suite:", err);
    }
  };

  const handleSelectModel = async (modelId: string) => {
    try {
      const response = await fetch("/api/model/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId })
      });
      const data = await response.json();
      if (data.success) {
        setSelectedModelId(modelId);
        fetchState();
      }
    } catch (err) {
      console.error("Failed to swap active AI engine:", err);
    }
  };

  const handleToggleNightMode = async () => {
    try {
      const response = await fetch("/api/automation/toggle", { method: "POST" });
      const data = await response.json();
      if (data.success) {
        setIsNightModeAutomationRunning(data.isNightModeAutomationRunning);
        fetchState();
      }
    } catch (err) {
      console.error("Failed to toggle automation loops:", err);
    }
  };

  const handleToggleMemoryPool = async () => {
    try {
      const response = await fetch("/api/project/memory-pool", { method: "POST" });
      if (response.ok) fetchState();
    } catch (err) {
      console.error("Failed to toggle object pools:", err);
    }
  };

  const handleToggleRustFfi = async () => {
    try {
      const response = await fetch("/api/project/rust-ffi", { method: "POST" });
      if (response.ok) fetchState();
    } catch (err) {
      console.error("Failed to toggle Rust FFI:", err);
    }
  };

  const handleUpdateTelegramConfig = async (token: string, chat: string, enabled: boolean) => {
    try {
      const response = await fetch("/api/telegram/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: token, chatId: chat, enabled })
      });
      if (response.ok) fetchState();
    } catch (err) {
      console.error("Failed to update Telegram Bot config:", err);
    }
  };

  const handleTestTelegram = async () => {
    try {
      await fetch("/api/telegram/test", { method: "POST" });
    } catch (err) {
      console.error("Failed to dispatch Telegram test:", err);
    }
  };

  const handleResetWorkspace = async () => {
    if (!confirm(lang === 'ru' 
      ? "Сбросить весь проект к исходным багам и очистить историю?" 
      : "Are you sure you want to revert the entire virtual workspace back to its original bug-ridden state?")) return;
    try {
      const response = await fetch("/api/project/reset", { method: "POST" });
      if (response.ok) {
        fetchState();
        setChatHistory([
          {
            id: "welcome-reset",
            sender: "claude",
            senderName: "Hermes",
            avatar: "✨",
            text: "Workspace reset completed successfully. All files restored to baseline buggy code. Tests are currently pending. Ask me to fix them!",
            textRu: "Рабочая область успешно сброшена. Все файлы восстановлены к исходному коду с багами. Тесты ожидают запуска. Попросите меня исправить их!",
            timestamp: new Date().toLocaleTimeString().slice(0, 5)
          }
        ]);
      }
    } catch (err) {
      console.error("Failed to reset virtual workspace:", err);
    }
  };

  // --- COOPERATIVE MULTI-AGENT CHAT INFERENCE & TASK SUBMISSION ---
  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatSending) return;

    const userPrompt = chatInput.trim();
    setChatInput("");
    setIsChatSending(true);

    // 1. Append user message to chat stream
    const userMsg = {
      id: `user-${Date.now()}`,
      sender: "user" as const,
      senderName: lang === 'ru' ? "Вы" : "You",
      avatar: "👤",
      text: userPrompt,
      textRu: userPrompt,
      timestamp: new Date().toLocaleTimeString().slice(0, 5)
    };
    setChatHistory(prev => [...prev, userMsg]);

    // 2. Identify loaded skills details for simulation logs
    const activeSkillsList = skills.filter(s => s.active);
    const skillsPromptStr = activeSkillsList.map(s => `[Prompt: ${s.name}]`).join(', ');

    // 3. Coordinated Agent Sequence: Cassandra (PM) decomposition
    await new Promise(r => setTimeout(r, 600));
    setChatHistory(prev => [
      ...prev,
      {
        id: `pm-${Date.now()}`,
        sender: "pm",
        senderName: "Cassandra (PM)",
        avatar: "👁️‍G",
        text: `Analysis initiated. Activating prompt guidelines: ${skillsPromptStr || "Standard Code"}. Enqueuing Aider task thread to implement modification.`,
        textRu: `Анализ запущен. Активированы правила: ${skillsPromptStr || "Стандартный код"}. Ставлю задачу Aider для внесения изменений.`,
        timestamp: new Date().toLocaleTimeString().slice(0, 5)
      }
    ]);

    // 4. Solomon (Architect) integrity design check
    await new Promise(r => setTimeout(r, 650));
    setChatHistory(prev => [
      ...prev,
      {
        id: `arch-${Date.now()}`,
        sender: "architect",
        senderName: "Solomon (Architect)",
        avatar: "🧠",
        text: `Scope scanned. Verified target workspace: "${activeProject.name}". Ensuring zero hardcoded vulnerabilities and flawless imports.`,
        textRu: `Кодовая база просканирована. Целевой проект: "${activeProject.name}". Гарантирую отсутствие уязвимостей и корректность импорта.`,
        timestamp: new Date().toLocaleTimeString().slice(0, 5)
      }
    ]);

    // 5. Trigger the ACTUAL background task on the backend server! (AIDER COCKPIT BRIDGE)
    try {
      const response = await fetch("/api/task/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userPrompt, modelId: selectedModelId })
      });
      const data = await response.json();
      
      if (data.success) {
        const backendTask: AiderTask = data.task;
        
        // 6. Spawn interactive Aider Progress Card inside the Chat!
        setChatHistory(prev => [
          ...prev,
          {
            id: backendTask.id,
            sender: "coder",
            senderName: "Aura (Coder & Aider)",
            avatar: "⚡",
            text: `Background worker launched. Coding patches are being processed in separate sandbox. Follow the compiler progress log below:`,
            textRu: `Запущен фоновый воркер. Патчи кода обрабатываются в песочнице. Следите за прогрессом компиляции ниже:`,
            timestamp: new Date().toLocaleTimeString().slice(0, 5),
            progress: 10,
            logs: [`[10%] Spawned sandbox thread. Model: ${backendTask.modelUsed}`]
          }
        ]);

        // Start checking the task progress via interval simulation
        let progressInterval = setInterval(async () => {
          try {
            const stateRes = await fetch("/api/state");
            const stateData = await stateRes.json();
            const updatedTasks: AiderTask[] = stateData.tasks;
            const liveTask = updatedTasks.find(t => t.id === backendTask.id);

            if (liveTask) {
              // Update Chat History progress card with real backend Aider logs and percentages!
              setChatHistory(prev => prev.map(msg => {
                if (msg.id === backendTask.id) {
                  return {
                    ...msg,
                    progress: liveTask.progress,
                    logs: liveTask.logs
                  };
                }
                return msg;
              }));

              // If task is no longer pending/running, cancel polling and update state
              if (liveTask.status === "completed" || liveTask.status === "failed") {
                clearInterval(progressInterval);
                setIsChatSending(false);
                fetchState(); // Fully refresh project files and tests immediately on completion

                // Open the file that was modified automatically
                if (liveTask.diffs && liveTask.diffs.length > 0) {
                  const changedPath = liveTask.diffs[0].filePath;
                  setSelectedFilePath(changedPath);
                  setActiveRightTab('editor');
                }

                // Append Final QA / Test Summary to chat
                setChatHistory(prev => [
                  ...prev,
                  {
                    id: `qa-res-${Date.now()}`,
                    sender: "qa",
                    senderName: "Orion (QA)",
                    avatar: "🛡️",
                    text: liveTask.status === "completed" 
                      ? `✅ Code modification verified! All unit tests are green. The file has been successfully written to disk.` 
                      : `⚠️ Applied code patch successfully, but unit test suite has reported failures. Please check the 'Test Harness' tab on the right panel to trace assertions.`,
                    textRu: liveTask.status === "completed"
                      ? `✅ Модификация кода успешно подтверждена! Все юнит-тесты пройдены. Файл записан на диск.`
                      : `⚠️ Патч применен, но тесты вернули ошибки. Откройте вкладку 'Тесты' на панели справа, чтобы изучить трассировку.`,
                    timestamp: new Date().toLocaleTimeString().slice(0, 5)
                  }
                ]);
              }
            } else {
              clearInterval(progressInterval);
              setIsChatSending(false);
            }
          } catch (err) {
            clearInterval(progressInterval);
            setIsChatSending(false);
          }
        }, 1000);

      } else {
        setIsChatSending(false);
      }
    } catch (err: any) {
      setIsChatSending(false);
      setChatHistory(prev => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: "claude",
          senderName: "Hermes",
          avatar: "✨",
          text: `Failed to invoke Aider sandbox engine: ${err.message}`,
          textRu: `Не удалось запустить компилятор Aider: ${err.message}`,
          timestamp: new Date().toLocaleTimeString().slice(0, 5)
        }
      ]);
    }
  };

  // --- OBSIDIAN SYNC UTILITY ---
  const handleSyncToObsidian = () => {
    // Generates documentation pages for every active file in the project
    const syncedNotes: ObsidianFile[] = Object.keys(activeProject.files).map(filePath => {
      const file = activeProject.files[filePath];
      return {
        id: "obs-auto-" + Math.random().toString(36).substring(7),
        title: file.name.replace(/\.[^/.]+$/, ""),
        path: `Vault/${file.name.replace(/\.[^/.]+$/, "")}.md`,
        category: "Documentation",
        tags: ["#sync", `#${file.language}`],
        updatedAt: "Synced just now",
        content: `# ${file.name}\n\nThis is an automated knowledge mirror of file: \`/${filePath}\`.\n\n## Source Implementation\n\`\`\`${file.language}\n${file.content}\n\`\`\`\n\n## Navigation\n- Main Knowledge Catalog: [[Hermes-Index]]\n- See task lists: [[Tasks]]`
      };
    });

    setObsidianFiles(prev => {
      const staticNotes = prev.filter(f => !f.path.includes("obs-auto-") && !f.tags.includes("#sync"));
      return [...staticNotes, ...syncedNotes];
    });

    setChatHistory(prev => [
      ...prev,
      {
        id: `sys-obs-${Date.now()}`,
        sender: "claude",
        senderName: "Hermes",
        avatar: "✨",
        text: `🔄 **Obsidian Link Sync Completed!** ${syncedNotes.length} project files converted to Obsidian markdown tags. Backlinks such as \`[[${syncedNotes.map(n => n.title).join(']]\`, \`[[')}]]\` are now active.`,
        textRu: `🔄 **Синхронизация Obsidian успешно выполнена!** Перенесено ${syncedNotes.length} файлов проекта. Все внутренние ссылки, включая \`[[${syncedNotes.map(n => n.title).join(']]\`, \`[[')}]]\` теперь доступны.`,
        timestamp: new Date().toLocaleTimeString().slice(0, 5)
      }
    ]);

    setActiveRightTab('obsidian');
  };

  const handleCreateObsidianNote = () => {
    if (!newObsidianTitle.trim()) return;
    const cleanTitle = newObsidianTitle.trim().replace(/\s+/g, '-');
    const newNote: ObsidianFile = {
      id: "obs-custom-" + Date.now(),
      title: cleanTitle,
      path: `Vault/${cleanTitle}.md`,
      category: "Documentation",
      tags: ["#user-note", "#obsidian-linking"],
      updatedAt: "Just now",
      content: `# ${cleanTitle}\n\nWrite your notes or guides here.\n\n## Links\n- Index page: [[Hermes-Index]]\n- Task backlog: [[Tasks]]`
    };

    setObsidianFiles(prev => [...prev, newNote]);
    setNewObsidianTitle("");
    setSelectedObsidianFile(newNote);
  };

  const handleSaveObsidianNote = (noteId: string, textContent: string) => {
    setObsidianFiles(prev => prev.map(f => f.id === noteId ? { ...f, content: textContent, updatedAt: "Just updated" } : f));
    if (selectedObsidianFile && selectedObsidianFile.id === noteId) {
      setSelectedObsidianFile(prev => prev ? { ...prev, content: textContent, updatedAt: "Saved" } : null);
    }
  };

  const handleDeleteObsidianNote = (id: string) => {
    setObsidianFiles(prev => prev.filter(f => f.id !== id));
    if (selectedObsidianFile?.id === id) {
      setSelectedObsidianFile(null);
    }
  };

  const handleDownloadVaultBundle = () => {
    const separator = "=".repeat(60);
    const dump = obsidianFiles.map(file => {
      return `PATH: ${file.path}\nTAGS: ${file.tags.join(', ')}\nLAST UPDATE: ${file.updatedAt}\n${separator}\n${file.content}\n\n`;
    }).join(`\n\n${"=".repeat(80)}\n\n`);

    const blob = new Blob([dump], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${activeProject.name.toLowerCase().replace(/\s+/g, '-')}-obsidian-vault.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- AGENT CUSTOM SKILLS ---
  const handleCreateSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkillName.trim() || !newSkillPrompt.trim()) return;

    const skill: AgentSkill = {
      id: "sk-custom-" + Date.now(),
      name: newSkillName,
      nameRu: newSkillName,
      description: "User specified skill rule instruction.",
      descriptionRu: "Пользовательское правило ИИ-агентов.",
      systemPrompt: newSkillPrompt,
      category: "Custom",
      active: true,
      author: "User"
    };

    setSkills(prev => [...prev, skill]);
    setNewSkillName("");
    setNewSkillPrompt("");
    setIsSkillCreatorOpen(false);

    setChatHistory(prev => [
      ...prev,
      {
        id: `sys-sk-${Date.now()}`,
        sender: "claude",
        senderName: "Hermes",
        avatar: "✨",
        text: `🚀 Added custom prompt directive: **${skill.name}**. Specialist agents will follow this instruction: "${skill.systemPrompt}"`,
        textRu: `🚀 Добавлено кастомное правило: **${skill.name}**. Агенты будут следовать инструкции: "${skill.systemPrompt}"`,
        timestamp: new Date().toLocaleTimeString().slice(0, 5)
      }
    ]);
  };

  const toggleSkill = (id: string) => {
    setSkills(prev => prev.map(s => s.id === id ? { ...s, active: !s.active } : s));
  };

  // --- QUICK SUGGESTED ACTION BUTTONS ---
  const getSuggestedActions = () => {
    if (activeProjectId === "project-1") {
      return [
        { label: lang === 'ru' ? "Исправить ошибку деления" : "Fix division bug", prompt: "Fix the division by zero bug in calculator.ts. Check if divisor is zero and throw an Error('Division by zero is undefined!')." },
        { label: lang === 'ru' ? "Переписать formatResult" : "Format calc output", prompt: "Format the output string in utils.ts to write calculation details cleanly." }
      ];
    }
    if (activeProjectId === "project-2") {
      return [
        { label: lang === 'ru' ? "Обезопасить JWT и длину" : "Secure Password & JWT", prompt: "Secure auth.ts password check: fix length typo to reject passwords < 8 characters and replace JWT secret key with process.env.JWT_SECRET." }
      ];
    }
    if (activeProjectId === "project-3") {
      return [
        { label: lang === 'ru' ? "Предотвратить сбой погоды" : "Safeguard weather wind", prompt: "Fix parseWindSpeed in parser.ts to safely check if wind exists before reading wind.speed, defaulting to 0." }
      ];
    }
    return [
      { label: lang === 'ru' ? "Оптимизировать производительность" : "PGO Rust FFI optimization", prompt: "Apply high-performance buffer pools in encrypt.ts to optimize memory allocations and eliminate packet stream lag." }
    ];
  };

  if (isLoading || !activeProject) {
    const isDark = themeMode === 'slate-dark';
    return (
      <div className={`min-h-screen ${isDark ? 'bg-[#090A0C] text-[#ECECED]' : 'bg-[#F4F5F7] text-[#1C1C1E]'} flex flex-col items-center justify-center space-y-6 font-mono text-xs select-none transition-colors duration-300`}>
        <div className="relative flex items-center justify-center">
          <div className="w-12 h-12 rounded-full border-2 border-neutral-200/25 border-t-indigo-500 animate-spin" />
          <div className="absolute w-6 h-6 rounded-full bg-indigo-500/10 animate-ping" />
        </div>
        <p className="text-neutral-500 dark:text-neutral-400 font-medium tracking-widest uppercase text-[10px] text-center px-4 animate-pulse">
          {lang === 'ru' ? "Синхронизация рабочей среды Hermes..." : "Synchronizing Hermes Environment..."}
        </p>
      </div>
    );
  }

  // Define themes: Modern Google/Apple/Anthropic design curves
  const classes = themeMode === 'slate-dark' ? {
    bg: "bg-[#090A0C] text-[#ECECED]",
    card: "bg-[#121318] border-[#22252F] shadow-[0_4px_30px_rgba(0,0,0,0.4)]",
    input: "bg-[#191A20] text-white border-[#2A2E3D] placeholder-[#5A6075] focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500",
    border: "border-[#22252F]",
    textMuted: "text-[#8A8F9E]",
    textPrimary: "text-[#ECECED]",
    tabActive: "bg-[#191A20] text-indigo-400 border-indigo-500/40 shadow-sm",
    btnSecondary: "bg-[#1E2028] hover:bg-[#272B37] text-[#ECECED] border-[#2A2E3D]"
  } : {
    bg: "bg-[#F4F5F7] text-[#1C1C1E]",
    card: "bg-white border-[#E4E6EC] shadow-[0_1px_3px_rgba(0,0,0,0.01),0_8px_24px_rgba(0,0,0,0.025)]",
    input: "bg-white text-[#1C1C1E] border-[#D1D3DC] placeholder-[#8E8E93] focus:ring-1 focus:ring-indigo-600/30 focus:border-indigo-600",
    border: "border-[#E4E6EC]",
    textMuted: "text-[#6E717D]",
    textPrimary: "text-[#1C1C1E]",
    tabActive: "bg-[#F4F5F7] text-indigo-600 border-indigo-600/50 shadow-sm",
    btnSecondary: "bg-white hover:bg-[#F4F5F7] text-[#1C1C1E] border-[#E4E6EC]"
  };

  return (
    <div className={`min-h-screen ${classes.bg} flex flex-col font-sans transition-colors duration-350`}>
      
      {/* 1. Header Navigation Bar */}
      <header className={`px-6 py-4.5 border-b ${classes.border} flex flex-col lg:flex-row items-center justify-between gap-4 relative z-10 bg-inherit transition-all duration-300`}>
        
        {/* Left Side: Brand Indicator & Active Workspace project selection */}
        <div className="flex items-center gap-3.5">
          <div className="p-2 bg-indigo-500/10 border border-indigo-500/15 rounded-xl text-indigo-500 dark:text-indigo-400 shadow-sm flex items-center justify-center">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xs font-bold tracking-widest text-neutral-900 dark:text-neutral-100 font-mono">HERMES ORCHESTRATOR</h1>
              <span className="text-[8px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 uppercase tracking-wider">
                Stable
              </span>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px] font-mono">
              <span className={classes.textMuted}>Project Context:</span>
              <select
                value={activeProjectId}
                onChange={(e) => handleSelectProject(e.target.value)}
                className={`py-0.5 px-2 rounded-md ${classes.input} border text-[10px] font-mono focus:outline-none cursor-pointer font-semibold`}
              >
                {(Object.values(projects) as VirtualProject[]).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Center: System Telemetry metrics (very clean and minimalist) */}
        <div className="hidden xl:flex items-center gap-8 font-mono text-[10px]">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${telemetry.offlineFallbackActive ? "bg-amber-500" : "bg-emerald-500 animate-pulse"}`} />
            <span className={classes.textMuted}>{lang === 'ru' ? "Узел:" : "Node:"}</span>
            <span className="font-semibold">{telemetry.offlineFallbackActive ? "OFFLINE FALLBACK" : "ONLINE API"}</span>
          </div>
          
          <div className="flex items-center gap-2">
            <span className={classes.textMuted}>{lang === 'ru' ? "ЦП:" : "CPU:"}</span>
            <span className="font-semibold">{telemetry.cpuUsage}%</span>
          </div>

          <div className="flex items-center gap-2">
            <span className={classes.textMuted}>{lang === 'ru' ? "ОЗУ:" : "RAM:"}</span>
            <span className="font-semibold">{telemetry.ramUsage}%</span>
            {telemetry.ramWarningTriggered && (
              <span className="text-amber-500 animate-pulse font-bold">[WARN]</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className={classes.textMuted}>{lang === 'ru' ? "Токены:" : "Tokens:"}</span>
            <span className="font-semibold text-indigo-500 dark:text-indigo-400">{telemetry.tokensUsed.toLocaleString()} / {telemetry.tokensLimit.toLocaleString()}</span>
          </div>
        </div>

        {/* Right Side: Language & Aesthetic Theme controllers */}
        <div className="flex items-center gap-2.5">
          {/* Obsidian Instant Notes Sync Trigger */}
          <button
            onClick={handleSyncToObsidian}
            className="px-3.5 py-1.5 rounded-lg bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 text-xs font-mono font-bold cursor-pointer transition-all flex items-center gap-1.5 shadow-sm"
            title="Mirror project files to local Obsidian Vault notes"
          >
            <FolderSync className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
            <span>Obsidian Sync</span>
          </button>

          {/* Style Mode Switcher */}
          <button
            onClick={handleToggleTheme}
            className={`p-1.5 rounded-lg border text-xs cursor-pointer transition-all shadow-sm ${classes.btnSecondary}`}
            title="Toggle minimalist light or slate dark theme"
          >
            <Moon className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
          </button>

          {/* Lang Selector */}
          <button
            onClick={handleToggleLang}
            className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-bold cursor-pointer transition-all shadow-sm ${classes.btnSecondary}`}
          >
            {lang === 'en' ? "RU" : "EN"}
          </button>

          {/* Reset Workspace trigger */}
          <button
            onClick={handleResetWorkspace}
            className="p-1.5 rounded-lg bg-rose-500/5 hover:bg-rose-500/10 text-rose-600 border border-rose-500/20 shadow-sm cursor-pointer transition-all"
            title="Revert entire sandbox to bug baseline"
          >
            <Undo2 className="w-4 h-4 text-rose-500" />
          </button>
        </div>

      </header>

      {/* 2. Main Dual-pane Layout Section */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* LEFT PANEL: The Conversation & Agent Dispatcher (5 columns) */}
        <div className={`lg:col-span-5 flex flex-col justify-between rounded-2xl ${classes.card} border p-4.5 shadow-sm min-h-[500px] lg:h-[680px] transition-all duration-300`}>
          
          {/* Header section: AI Engine indicator */}
          <div className="pb-3 border-b border-inherit flex items-center justify-between text-[11px] font-mono">
            <div className="flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
              <span className={classes.textMuted}>{lang === 'ru' ? "ИИ-модель:" : "AI Model:"}</span>
              <span className="font-bold">{selectedModelId === "gemini-3.5-flash" ? "Hermes Intel Core" : "Llama Local Node"}</span>
            </div>
            
            <span className="text-emerald-600 dark:text-emerald-500 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              Connected
            </span>
          </div>

          {/* Coordinated Chat message thread stream */}
          <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 scrollbar-thin">
            <AnimatePresence initial={false}>
              {chatHistory.map((msg) => {
                const isUser = msg.sender === 'user';
                const isSystemProgress = msg.progress !== undefined;
                
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 12, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isUser && (
                      <div className={`w-7.5 h-7.5 rounded-full flex-shrink-0 flex items-center justify-center text-xs border shadow-sm ${
                        msg.sender === 'claude' 
                          ? "bg-indigo-500/10 border-indigo-500/15 text-indigo-600 dark:text-indigo-400" 
                          : msg.sender === 'pm'
                            ? "bg-purple-500/10 border-purple-500/15 text-purple-600"
                            : msg.sender === 'architect'
                              ? "bg-blue-500/10 border-blue-500/15 text-blue-600"
                              : msg.sender === 'coder'
                                ? "bg-amber-500/10 border-amber-500/15 text-amber-600"
                                : "bg-emerald-500/10 border-emerald-500/15 text-emerald-600"
                      }`}>
                        {msg.avatar}
                      </div>
                    )}

                    <div className="max-w-[85%] space-y-1">
                      <div className={`flex items-center gap-1.5 text-[9px] font-mono ${classes.textMuted} ${isUser ? 'justify-end' : 'justify-start'}`}>
                        <span className="font-semibold">{msg.senderName}</span>
                        <span>•</span>
                        <span>{msg.timestamp}</span>
                      </div>

                      {/* Regular message body */}
                      {!isSystemProgress ? (
                        <div className={`p-3.5 rounded-2xl text-xs leading-relaxed border ${
                          isUser 
                            ? "bg-indigo-600 border-indigo-500/10 text-white font-medium rounded-tr-none shadow-sm" 
                            : "bg-neutral-50 border-neutral-100 text-neutral-800 rounded-tl-none dark:bg-[#191A20] dark:border-[#22252F] dark:text-[#ECECED] shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                        }`}>
                          <p>{lang === 'ru' ? msg.textRu : msg.text}</p>
                        </div>
                      ) : (
                        /* Live Aider Background Progress inside the chat bubble! */
                        <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 text-slate-100 rounded-tl-none space-y-3 shadow-md">
                          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                            <span className="flex items-center gap-1.5">
                              <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                              Aider Compilation Active
                            </span>
                            <span>{msg.progress}%</span>
                          </div>

                          {/* Progress track */}
                          <div className="w-full h-1 bg-neutral-800 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-amber-500 transition-all duration-300"
                              style={{ width: `${msg.progress}%` }}
                            />
                          </div>

                          {/* Live logs terminal screen */}
                          <div className="p-2.5 bg-black/50 rounded-lg border border-neutral-900 font-mono text-[9px] text-slate-400 space-y-1 max-h-32 overflow-y-auto leading-relaxed scrollbar-thin">
                            {msg.logs && msg.logs.map((log, lidx) => (
                              <p key={lidx} className={log.includes('[ERROR]') ? "text-rose-400" : log.includes('passed!') ? "text-emerald-400" : "text-slate-400"}>
                                {log}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {isUser && (
                      <div className="w-7.5 h-7.5 rounded-full flex-shrink-0 flex items-center justify-center text-xs bg-neutral-100 border border-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-300 shadow-sm">
                        👤
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
            <div ref={chatEndRef} />
          </div>

          {/* Suggested actions & input forms */}
          <div className="space-y-3 pt-3.5 border-t border-inherit">
            
            {/* Suggestion list based on active project context */}
            <div className="flex flex-wrap gap-1.5">
              {getSuggestedActions().map((act, index) => (
                <button
                  key={index}
                  onClick={() => setChatInput(act.prompt)}
                  className={`text-[10px] font-mono px-2 py-1 rounded-md border cursor-pointer transition-all ${classes.btnSecondary}`}
                >
                  {act.label}
                </button>
              ))}
            </div>

            {/* Prompt input bar */}
            <form onSubmit={handleSendChatMessage} className="flex gap-2 relative">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={lang === 'ru' ? "Запросите ИИ написать код или исправить баги..." : "Ask Hermes to patch errors, fix division checks..."}
                className={`flex-1 ${classes.input} border rounded-xl px-4 py-3 text-xs font-sans focus:outline-none transition-all pr-12`}
                disabled={isChatSending}
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || isChatSending}
                className="absolute right-2 top-2 p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>

        </div>

        {/* RIGHT PANEL: Interactive Workspace Tabs (7 columns) */}
        <div className={`lg:col-span-7 flex flex-col justify-between rounded-2xl ${classes.card} border shadow-sm h-[680px] overflow-hidden transition-all duration-300`}>
          
          {/* Top navigation tabs with clean minimalist labels */}
          <div className={`px-4 pt-3 border-b border-inherit flex flex-wrap gap-1 bg-inherit`}>
            {[
              { id: 'editor', labelEn: '📁 Code Workspace', labelRu: '📁 Редактор кода' },
              { id: 'tests', labelEn: '🧪 Test Harness', labelRu: '🧪 Прогон тестов' },
              { id: 'obsidian', labelEn: '📓 Obsidian Notes', labelRu: '📓 Заметки Obsidian' },
              { id: 'settings', labelEn: '⚙️ Configurations', labelRu: '⚙️ Настройки и PGO' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveRightTab(tab.id as any)}
                className={`px-3.5 py-2.5 rounded-t-xl text-xs font-mono font-bold border-t border-x border-transparent cursor-pointer transition-all -mb-[1px] ${
                  activeRightTab === tab.id 
                    ? classes.tabActive + " border-inherit"
                    : "text-neutral-500 hover:text-neutral-800 dark:hover:text-white"
                }`}
              >
                {lang === 'ru' ? tab.labelRu : tab.labelEn}
              </button>
            ))}
          </div>

          {/* TAB 1: 📁 CODE EDITOR WORKSPACE */}
          {activeRightTab === 'editor' && (
            <motion.div 
              key="tab-editor"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="flex-1 flex flex-col justify-between p-4.5 bg-white dark:bg-[#121318]"
            >
              
              <div className="space-y-3 flex-1 flex flex-col">
                {/* File selectors */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Folder className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                    <span className="text-[11px] font-mono font-bold text-neutral-500">root/src/</span>
                    <select
                      value={selectedFilePath}
                      onChange={(e) => handleFileClick(e.target.value)}
                      className={`py-1 px-2.5 rounded-lg ${classes.input} border text-[11px] font-mono focus:outline-none cursor-pointer shadow-sm`}
                    >
                      {(Object.values(activeProject.files) as VirtualFile[]).map(file => (
                        <option key={file.path} value={file.path}>{file.name}</option>
                      ))}
                    </select>
                  </div>

                  {hasUnsavedChanges && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      {lang === 'ru' ? "Несохраненные правки" : "Unsaved changes"}
                    </span>
                  )}
                </div>

                {/* Main textarea editor */}
                <div className="flex-1 border border-neutral-200 dark:border-[#22252F] rounded-xl overflow-hidden flex bg-neutral-50/50 dark:bg-black/30">
                  <div className="w-10 text-right pr-3 pt-3 font-mono text-[10px] text-neutral-400 dark:text-neutral-600 select-none border-r border-neutral-200 dark:border-[#22252F] space-y-1 bg-neutral-100/30 dark:bg-black/10">
                    {Array.from({ length: editorContent.split("\n").length || 1 }).map((_, i) => (
                      <div key={i}>{i + 1}</div>
                    ))}
                  </div>

                  <textarea
                    value={editorContent}
                    onChange={(e) => {
                      setEditorContent(e.target.value);
                      setHasUnsavedChanges(true);
                    }}
                    spellCheck="false"
                    className="flex-1 p-3 font-mono text-xs text-neutral-800 dark:text-neutral-200 bg-transparent resize-none focus:outline-none leading-relaxed min-h-[300px]"
                    placeholder="// Select a file or write code..."
                  />
                </div>
              </div>

              {/* Editor Save Controls */}
              <div className="pt-3 border-t border-neutral-100 dark:border-neutral-900 mt-3 flex items-center justify-between">
                <span className="text-[10px] font-mono text-neutral-400">
                  Lines: {editorContent.split("\n").length} | Syntax: TypeScript
                </span>

                <button
                  onClick={() => handleFileUpdate(selectedFilePath, editorContent)}
                  disabled={!hasUnsavedChanges}
                  className={`py-1.5 px-3.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    hasUnsavedChanges
                      ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm"
                      : "bg-neutral-100 text-neutral-400 border border-neutral-200 dark:bg-neutral-800 dark:text-neutral-500 dark:border-neutral-700 cursor-not-allowed"
                  }`}
                >
                  <Save className="w-3.5 h-3.5" />
                  {lang === 'ru' ? "Применить на диск" : "Save changes"}
                </button>
              </div>

            </motion.div>
          )}

          {/* TAB 2: 🧪 TEST HARNESS ASSERTIONS */}
          {activeRightTab === 'tests' && (
            <motion.div 
              key="tab-tests"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="flex-1 flex flex-col justify-between p-4.5 bg-white dark:bg-[#121318]"
            >
              
              <div className="space-y-4 flex-1 overflow-y-auto pr-1 scrollbar-thin">
                
                {/* Actions Trigger */}
                <div className="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-neutral-900">
                  <div>
                    <h3 className="text-xs font-bold text-neutral-800 dark:text-neutral-100 font-mono tracking-wide uppercase">{lang === 'ru' ? "Модульные тесты проекта" : "Virtual Unit Assertions"}</h3>
                    <p className="text-[10px] text-neutral-400 mt-0.5">{lang === 'ru' ? "Авто-вычисление на основе состояния исходного кода" : "Real-time state checkers evaluating sandbox compliance"}</p>
                  </div>

                  <button
                    onClick={handleRunTests}
                    className="py-1.5 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
                  >
                    <Play className="w-3.5 h-3.5 fill-current text-white" />
                    {lang === 'ru' ? "Запустить тест-сьют" : "Run Test Suite"}
                  </button>
                </div>

                {/* List of active unit tests */}
                <div className="space-y-2.5">
                  {activeProject.tests.map(test => (
                    <div 
                      key={test.id} 
                      className={`p-3.5 rounded-xl border text-xs space-y-2.5 transition-all ${
                        test.status === "passed" 
                          ? "bg-emerald-500/5 border-emerald-500/15" 
                          : test.status === "failed" 
                            ? "bg-rose-500/5 border-rose-500/15" 
                            : "bg-neutral-50/50 border-neutral-200/60 dark:bg-[#191A20] dark:border-[#22252F]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="font-bold text-neutral-800 dark:text-neutral-100 font-mono text-[11px]">{test.name}</h4>
                          <p className="text-[10px] text-neutral-400 mt-0.5">{test.description}</p>
                        </div>
                        
                        {/* Custom status indicator badge */}
                        {test.status === 'passed' ? (
                          <span className="px-2 py-0.5 text-[8px] font-mono font-bold tracking-wider text-emerald-600 bg-emerald-100/55 rounded-md dark:bg-emerald-950/40">
                            PASSED
                          </span>
                        ) : test.status === 'failed' ? (
                          <span className="px-2 py-0.5 text-[8px] font-mono font-bold tracking-wider text-rose-600 bg-rose-100/55 rounded-md animate-pulse dark:bg-rose-950/40">
                            FAILED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[8px] font-mono font-bold tracking-wider text-neutral-500 bg-neutral-100/60 rounded-md dark:bg-neutral-800">
                            PENDING
                          </span>
                        )}
                      </div>

                      {/* Code assertions checks visualizer */}
                      <div className="p-2.5 bg-neutral-50 dark:bg-black/20 border border-neutral-100/70 dark:border-neutral-900 rounded-lg font-mono text-[10px] text-neutral-500 dark:text-neutral-400 space-y-1">
                        <div>
                          <span className="text-neutral-400 dark:text-neutral-500">// assertion:</span>{" "}
                          <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{test.assertCode}</span>
                        </div>
                        {test.errorMessage && (
                          <div className="mt-2 pt-2 border-t border-rose-100 dark:border-rose-950/30 text-rose-600 dark:text-rose-400 font-sans leading-relaxed">
                            <span className="font-bold block text-[8px] text-rose-500 uppercase tracking-widest font-mono">error stack trace:</span>
                            {test.errorMessage}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

              </div>

              {/* Footer test reports */}
              <div className="pt-3 border-t border-neutral-100 dark:border-neutral-900 mt-3 flex items-center justify-between text-[11px] font-mono text-neutral-400">
                <span>Total Assertions: {activeProject.tests.length}</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-500">
                  Green: {activeProject.tests.filter(t => t.status === "passed").length} / {activeProject.tests.length}
                </span>
              </div>

            </motion.div>
          )}

          {/* TAB 3: 📓 OBSIDIAN KNOWLEDGE BASE */}
          {activeRightTab === 'obsidian' && (
            <motion.div 
              key="tab-obsidian"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="flex-1 flex flex-col justify-between p-4.5 bg-white dark:bg-[#121318]"
            >
              
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4.5 flex-1 overflow-hidden">
                
                {/* Left side: Notes list tree */}
                <div className="md:col-span-5 flex flex-col justify-between space-y-3 overflow-hidden border-r border-neutral-100 dark:border-neutral-900 pr-3">
                  
                  <div className="space-y-2 flex-1 flex flex-col overflow-hidden">
                    {/* Search notes */}
                    <input
                      type="text"
                      value={obsidianSearch}
                      onChange={(e) => setObsidianSearch(e.target.value)}
                      placeholder={lang === 'ru' ? "Поиск заметок..." : "Search backlinks..."}
                      className={`w-full py-1.5 px-3 text-xs ${classes.input} border rounded-lg focus:outline-none`}
                    />

                    {/* Note files cards list */}
                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                      {obsidianFiles
                        .filter(f => f.title.toLowerCase().includes(obsidianSearch.toLowerCase()) || f.content.toLowerCase().includes(obsidianSearch.toLowerCase()))
                        .map(note => (
                          <button
                            key={note.id}
                            onClick={() => setSelectedObsidianFile(note)}
                            className={`w-full text-left p-2.5 rounded-lg border text-xs flex flex-col gap-1 transition-all cursor-pointer ${
                              selectedObsidianFile?.id === note.id
                                ? "bg-indigo-500/5 border-indigo-500/20 text-[#1C1C1E] dark:text-[#ECECED]"
                                : "border-transparent hover:bg-neutral-50 dark:hover:bg-neutral-900/40 text-neutral-600 dark:text-neutral-400"
                            }`}
                          >
                            <span className="font-semibold font-mono flex items-center gap-1.5 text-[11px]">
                              <FileText className="w-3.5 h-3.5 text-neutral-400" />
                              [[{note.title}]]
                            </span>
                            <span className="text-[9px] text-neutral-400 dark:text-neutral-500">
                              Updated: {note.updatedAt}
                            </span>
                          </button>
                        ))
                      }
                    </div>
                  </div>

                  {/* Create empty note form */}
                  <div className="space-y-1.5 pt-2 border-t border-neutral-100 dark:border-neutral-900">
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={newObsidianTitle}
                        onChange={(e) => setNewObsidianTitle(e.target.value)}
                        placeholder="New note title..."
                        className={`flex-1 py-1 px-2.5 text-[11px] ${classes.input} border rounded-lg focus:outline-none`}
                      />
                      <button
                        onClick={handleCreateObsidianNote}
                        disabled={!newObsidianTitle.trim()}
                        className="p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer transition-all shadow-sm"
                        title="Create new markdown backlink"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                </div>

                {/* Right side: Editor view of selected note */}
                <div className="md:col-span-7 flex flex-col justify-between overflow-hidden">
                  {selectedObsidianFile ? (
                    <div className="flex-1 flex flex-col justify-between h-full">
                      
                      <div className="space-y-2 flex-1 flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between pb-1 border-b border-neutral-100 dark:border-neutral-900">
                          <h4 className="text-xs font-bold font-mono text-indigo-600 dark:text-indigo-400">
                            Vault/{selectedObsidianFile.title}.md
                          </h4>
                          
                          <button
                            onClick={() => handleDeleteObsidianNote(selectedObsidianFile.id)}
                            className="p-1 text-neutral-400 hover:text-rose-500 rounded transition-all cursor-pointer"
                            title="Delete note"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Text note editor */}
                        <textarea
                          value={selectedObsidianFile.content}
                          onChange={(e) => handleSaveObsidianNote(selectedObsidianFile.id, e.target.value)}
                          className="flex-1 p-3 font-mono text-xs text-neutral-800 dark:text-neutral-200 bg-neutral-50/50 dark:bg-black/20 border border-neutral-200 dark:border-neutral-800 rounded-xl focus:outline-none resize-none leading-relaxed overflow-y-auto scrollbar-thin"
                          placeholder="Write markdown with [[backlinks]]..."
                        />
                      </div>

                      <div className="pt-2 text-[9px] font-mono text-neutral-400 flex items-center justify-between">
                        <span>Automatic backlink compiler verified.</span>
                        <span>Saved</span>
                      </div>

                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-neutral-400 font-mono text-[11px] border border-dashed border-neutral-200 dark:border-neutral-800 rounded-2xl">
                      <BookOpen className="w-8 h-8 text-neutral-300 dark:text-neutral-700 mb-2" />
                      <p>{lang === 'ru' ? "Выберите заметку для просмотра или редактирования" : "Select or create an Obsidian Note"}</p>
                      <p className="text-[9px] text-neutral-400 mt-1 max-w-xs leading-relaxed">
                        Double brackets linking [[NoteName]] resolves dynamic connection. Sync creates mirror files.
                      </p>
                    </div>
                  )}
                </div>

              </div>

              {/* Obsidian Vault Actions footer */}
              <div className="pt-3 border-t border-neutral-100 dark:border-neutral-900 mt-3 flex items-center justify-between">
                <button
                  onClick={handleSyncToObsidian}
                  className="py-1.5 px-3 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-600 dark:bg-[#1E2028] dark:hover:bg-[#272B37] dark:text-neutral-400 text-[10px] font-mono font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
                  title="Trigger folder mirror update"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Update Directory Sync
                </button>

                <button
                  onClick={handleDownloadVaultBundle}
                  className="py-1.5 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-indigo-50 text-[10px] font-mono font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
                  title="Export entire markdown collection"
                >
                  <Download className="w-3.5 h-3.5" /> Download Vault bundle
                </button>
              </div>

            </motion.div>
          )}

          {/* TAB 4: ⚙️ CONFIGURATIONS & PGO OPTIONS */}
          {activeRightTab === 'settings' && (
            <motion.div 
              key="tab-settings"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="flex-1 overflow-y-auto p-4.5 bg-white dark:bg-[#121318] space-y-5 scrollbar-thin"
            >
              
              {/* SECTION A: Model selector */}
              <div className="p-3.5 rounded-xl border border-neutral-100 dark:border-neutral-900 space-y-3 bg-neutral-50/50 dark:bg-[#191A20]/30">
                <div>
                  <h4 className="text-xs font-bold font-mono tracking-widest uppercase text-neutral-800 dark:text-neutral-200">
                    {lang === 'ru' ? "Конфигурация языковой модели" : "Active AI Inference Engine"}
                  </h4>
                  <p className="text-[10px] text-neutral-400 mt-0.5">
                    {lang === 'ru' ? "Переключение между внешними API и резервными локальными LLM" : "Specify the backend LLM engine running code changes"}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {modelConfigs.map(m => (
                    <button
                      key={m.id}
                      onClick={() => handleSelectModel(m.id)}
                      className={`p-3 rounded-xl border text-left flex flex-col gap-1 cursor-pointer transition-all shadow-sm ${
                        selectedModelId === m.id
                          ? "bg-indigo-500/5 border-indigo-500/30 text-indigo-950 dark:text-indigo-300 dark:border-indigo-500/40"
                          : "bg-white border-neutral-200/75 hover:bg-neutral-50 dark:bg-[#1E2028] dark:border-neutral-800 dark:hover:bg-[#272B37]"
                      }`}
                    >
                      <span className="font-bold text-xs font-mono">{m.name}</span>
                      <span className="text-[9px] text-neutral-500">{m.provider} • {m.speed}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* SECTION B: Custom skills prompt rules */}
              <div className="p-3.5 rounded-xl border border-neutral-100 dark:border-neutral-900 space-y-3 bg-neutral-50/50 dark:bg-[#191A20]/30">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold font-mono tracking-widest uppercase text-neutral-800 dark:text-neutral-200">
                      {lang === 'ru' ? "Инъекции правил разработчика" : "System prompt developer instructions"}
                    </h4>
                    <p className="text-[10px] text-neutral-400 mt-0.5">
                      {lang === 'ru' ? "Инструкции и ограничения, внедряемые в контекст ИИ" : "Pre-compile custom prompts injected into Hermes Multi-Agent loop"}
                    </p>
                  </div>

                  <button
                    onClick={() => setIsSkillCreatorOpen(!isSkillCreatorOpen)}
                    className="p-1.5 px-2.5 text-[10px] font-mono font-bold rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 cursor-pointer shadow-sm border border-indigo-100 dark:border-indigo-900/35 transition-all"
                  >
                    {isSkillCreatorOpen ? "Close Creator" : "Add Prompt Rule"}
                  </button>
                </div>

                {isSkillCreatorOpen && (
                  <form onSubmit={handleCreateSkill} className="p-3 rounded-xl bg-white dark:bg-[#1E2028] border border-neutral-100 dark:border-neutral-800 space-y-3">
                    <div className="space-y-1">
                      <span className="text-[9px] font-mono text-neutral-400 uppercase tracking-wider block">Instruction Name</span>
                      <input
                        type="text"
                        value={newSkillName}
                        onChange={(e) => setNewSkillName(e.target.value)}
                        placeholder="e.g. Zero DIVISION check"
                        className="w-full py-2 px-3 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-[#191919] dark:text-white focus:outline-none transition-all shadow-sm"
                      />
                    </div>

                    <div className="space-y-1">
                      <span className="text-[9px] font-mono text-neutral-400 uppercase tracking-wider block">Prompt Rule String (Injected into system)</span>
                      <textarea
                        value={newSkillPrompt}
                        onChange={(e) => setNewSkillPrompt(e.target.value)}
                        placeholder="e.g. If you divide, you must check for 0 divisor first..."
                        className="w-full p-2.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-[#191919] dark:text-white focus:outline-none h-16 resize-none transition-all shadow-sm"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={!newSkillName.trim() || !newSkillPrompt.trim()}
                      className="w-full py-2 rounded-lg bg-indigo-600 text-white font-mono text-[10px] font-bold hover:bg-indigo-500 cursor-pointer transition-all shadow-sm disabled:opacity-40"
                    >
                      Load rule to agent context
                    </button>
                  </form>
                )}

                <div className="space-y-2">
                  {skills.map(skill => (
                    <div key={skill.id} className="p-2.5 rounded-xl bg-white dark:bg-[#1E2028] border border-neutral-150 dark:border-neutral-800/60 flex items-start justify-between gap-3 text-xs shadow-sm">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-neutral-800 dark:text-neutral-200">{lang === 'ru' ? skill.nameRu : skill.name}</span>
                          <span className="text-[9px] font-mono text-neutral-400 uppercase px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded">
                            {skill.author}
                          </span>
                        </div>
                        <p className="text-[10px] text-neutral-400 mt-0.5 leading-relaxed">
                          {lang === 'ru' ? skill.descriptionRu : skill.description}
                        </p>
                      </div>

                      <button
                        onClick={() => toggleSkill(skill.id)}
                        className={`p-1 px-2.5 text-[10px] font-mono font-bold rounded-md cursor-pointer transition-all ${
                          skill.active
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                            : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                        }`}
                      >
                        {skill.active ? "✓ Active" : "Disabled"}
                      </button>
                    </div>
                  ))}
                </div>

              </div>

              {/* SECTION C: Integrations, Telegram and PGO compiling */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Telegram Bot */}
                <div className="p-3.5 rounded-xl border border-neutral-100 dark:border-neutral-900 bg-neutral-50/50 dark:bg-[#191A20]/30 space-y-3 text-xs">
                  <div>
                    <h5 className="font-bold font-mono text-neutral-850 dark:text-neutral-200 uppercase tracking-widest text-[11px]">Telegram Alert Integration</h5>
                    <p className="text-[10px] text-neutral-400 mt-0.5">Receive sandbox alert traces on compile warning triggers</p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-mono text-neutral-400 uppercase block">Bot Token</span>
                      <input
                        type="password"
                        value={telegramConfig.botToken}
                        onChange={(e) => handleUpdateTelegramConfig(e.target.value, telegramConfig.chatId, telegramConfig.enabled)}
                        placeholder="e.g. 123456:ABC-DEF..."
                        className="py-1.5 px-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1E2028]"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-mono text-neutral-400 uppercase block">Chat ID</span>
                      <input
                        type="text"
                        value={telegramConfig.chatId}
                        onChange={(e) => handleUpdateTelegramConfig(telegramConfig.botToken, e.target.value, telegramConfig.enabled)}
                        placeholder="e.g. -1001234567"
                        className="py-1.5 px-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1E2028]"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        onClick={handleTestTelegram}
                        className="py-1.5 px-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1E2028] text-[10px] font-mono font-bold cursor-pointer hover:bg-neutral-50 transition-all shadow-sm"
                      >
                        Test Message
                      </button>

                      <button
                        onClick={() => handleUpdateTelegramConfig(telegramConfig.botToken, telegramConfig.chatId, !telegramConfig.enabled)}
                        className={`p-1 px-2.5 text-[10px] font-mono font-bold rounded-lg cursor-pointer transition-all ${
                          telegramConfig.enabled ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-neutral-100 text-neutral-400 dark:bg-neutral-800"
                        }`}
                      >
                        {telegramConfig.enabled ? "Active" : "Disabled"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Night Automation & Profiler Guidings */}
                <div className="p-3.5 rounded-xl border border-neutral-100 dark:border-neutral-900 bg-neutral-50/50 dark:bg-[#191A20]/30 space-y-3.5 text-xs">
                  <div>
                    <h5 className="font-bold font-mono text-neutral-850 dark:text-neutral-200 uppercase tracking-widest text-[11px]">Compiler Optimizer (PGO)</h5>
                    <p className="text-[10px] text-neutral-400 mt-0.5">Profile-Guided Optimization controls for high speed compilations</p>
                  </div>

                  <div className="space-y-2">
                    
                    {/* Night Mode loop switch */}
                    <div className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-[#1E2028] border border-neutral-150 dark:border-neutral-800 shadow-sm">
                      <div>
                        <span className="font-semibold block font-mono text-neutral-850 dark:text-neutral-200">Night Loop</span>
                        <span className="text-[9px] text-neutral-400 block">AI fixes failing tests automatically</span>
                      </div>
                      
                      <button
                        onClick={handleToggleNightMode}
                        className={`p-1 px-2.5 text-[10px] font-mono font-bold rounded-lg cursor-pointer transition-all ${
                          isNightModeAutomationRunning ? "bg-indigo-500 text-indigo-50 animate-pulse" : "bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-400"
                        }`}
                      >
                        {isNightModeAutomationRunning ? "Active" : "Disabled"}
                      </button>
                    </div>

                    {/* Object pools memory optimize */}
                    <div className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-[#1E2028] border border-neutral-150 dark:border-neutral-800 shadow-sm">
                      <div>
                        <span className="font-semibold block font-mono text-neutral-850 dark:text-neutral-200">Buffer pools</span>
                        <span className="text-[9px] text-neutral-400 block">Reduces continuous RAM allocations</span>
                      </div>

                      <button
                        onClick={handleToggleMemoryPool}
                        className={`p-1 px-2.5 text-[10px] font-mono font-bold rounded-lg cursor-pointer transition-all ${
                          memoryPoolEnabled ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-400"
                        }`}
                      >
                        {memoryPoolEnabled ? "Active" : "Disabled"}
                      </button>
                    </div>

                    {/* Rust FFI bindings compiler threads */}
                    <div className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-[#1E2028] border border-neutral-150 dark:border-neutral-800 shadow-sm">
                      <div>
                        <span className="font-semibold block font-mono text-neutral-850 dark:text-neutral-200">Rust compiling thread</span>
                        <span className="text-[9px] text-neutral-400 block">PGO native DLL binding wrappers</span>
                      </div>

                      <button
                        onClick={handleToggleRustFfi}
                        className={`p-1 px-2.5 text-[10px] font-mono font-bold rounded-lg cursor-pointer transition-all ${
                          rustFfiApplied ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-400"
                        }`}
                      >
                        {rustFfiApplied ? "Active" : "Disabled"}
                      </button>
                    </div>

                  </div>
                </div>

              </div>

            </motion.div>
          )}

        </div>

      </div>

      {/* 3. Bottom Diagnostics Footer */}
      <footer className={`px-6 py-4.5 border-t ${classes.border} text-[10px] font-mono ${classes.textMuted} flex flex-col sm:flex-row items-center justify-between gap-3 bg-inherit`}>
        <div className="flex flex-wrap items-center gap-4">
          <span>Active Context: <b className={classes.textPrimary}>{activeProject.name}</b></span>
          <span className="hidden sm:inline">|</span>
          <span>Inference Engine: <b className={classes.textPrimary}>{selectedModelId}</b></span>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Sandbox Nodes Active
          </span>
          <span>© 2026 Hermes AI Code Workspace</span>
        </div>
      </footer>

    </div>
  );
}
