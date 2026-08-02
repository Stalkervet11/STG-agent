import React, { useState, useEffect, useRef } from "react";
import { 
  Users, 
  Bot, 
  Play, 
  Pause, 
  RotateCcw, 
  Terminal, 
  Cpu, 
  Activity, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  FileCode2, 
  Sparkles, 
  ChevronRight, 
  ArrowRight,
  ShieldAlert,
  Sliders,
  Check,
  Send,
  Code2,
  FolderSync,
  Download,
  Plus,
  Trash2,
  BookOpen,
  FileText,
  SlidersHorizontal,
  ExternalLink,
  Eye,
  History,
  X,
  Compass,
  Layers,
  HelpCircle,
  Sparkle
} from "lucide-react";
import { VirtualProject, UnitTest, ModelConfig } from "../types";

// --- CUSTOM INTERFACES FOR CLAUDE + OBSIDIAN + SKILLS ---
interface Agent {
  id: string;
  name: string;
  avatar: string;
  role: string;
  roleRu: string;
  description: string;
  descriptionRu: string;
  status: 'idle' | 'planning' | 'thinking' | 'coding' | 'testing' | 'reviewing' | 'completed' | 'failed';
  telemetry: {
    cpu: number;
    ram: number;
    tokens: number;
  };
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'PM' | 'Architect' | 'Coder' | 'QA';
  senderName: string;
  avatar: string;
  text: string;
  textRu: string;
  timestamp: string;
  artifact?: ClaudeArtifact;
}

interface ClaudeArtifact {
  id: string;
  title: string;
  type: 'code' | 'obsidian-note' | 'architecture';
  filePath: string;
  content: string;
  description: string;
  applied: boolean;
}

interface ObsidianFile {
  id: string;
  title: string;
  path: string;
  category: 'System' | 'Documentation' | 'Tasks' | 'Guides';
  content: string;
  updatedAt: string;
  tags: string[];
}

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

interface AgentOrchestratorProps {
  project: VirtualProject;
  onFileUpdate: (filePath: string, content: string) => Promise<void>;
  onRunTests: () => Promise<void>;
  selectedModelId: string;
  modelConfigs: ModelConfig[];
  lang?: 'en' | 'ru';
}

export default function AgentOrchestrator({
  project,
  onFileUpdate,
  onRunTests,
  selectedModelId,
  modelConfigs,
  lang = 'en'
}: AgentOrchestratorProps) {
  // --- DESIGN THEMES (Claude Warm-White/Obsidian Dark vs Classic Midnight) ---
  const [claudeTheme, setClaudeTheme] = useState<'claude-light' | 'claude-dark'>('claude-dark');

  // --- TAB CHANNELS ---
  // Claude-style layout features: 'chat' (the primary interface), 'obsidian' (Obsidian Vault Workspace), 'skills' (Agent Skills configuration)
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'chat' | 'obsidian' | 'skills' | 'agents_tech'>('chat');

  // --- SPECIALISTS ---
  const [agents, setAgents] = useState<Agent[]>([
    {
      id: "pm",
      name: "Cassandra",
      avatar: "👁️‍G",
      role: "Project Coordinator & Analyst",
      roleRu: "Координатор проектов и Аналитик",
      description: "Decomposes missions, structures file roadmaps, and oversees milestones.",
      descriptionRu: "Декомпозирует миссии, структурирует дорожные карты файлов и контролирует вехи.",
      status: "idle",
      telemetry: { cpu: 0, ram: 14.2, tokens: 0 }
    },
    {
      id: "architect",
      name: "Solomon",
      avatar: "🧠",
      role: "Systems Architect",
      roleRu: "Архитектор систем",
      description: "Reviews file graphs, designs blueprints, and validates algorithmic soundness.",
      descriptionRu: "Изучает граф файлов, проектирует схемы и проверяет корректность алгоритмов.",
      status: "idle",
      telemetry: { cpu: 0, ram: 18.5, tokens: 0 }
    },
    {
      id: "coder",
      name: "Aura",
      avatar: "⚡",
      role: "Lead Software Programmer",
      roleRu: "Ведущий программист",
      description: "Applies code patches, refactors structures, and implements solutions.",
      descriptionRu: "Применяет исправления кода, проводит рефакторинг и внедряет решения.",
      status: "idle",
      telemetry: { cpu: 0, ram: 22.1, tokens: 0 }
    },
    {
      id: "qa",
      name: "Orion",
      avatar: "🛡️",
      role: "QA Engineer & Test Harness",
      roleRu: "Инженер по тестированию (QA)",
      description: "Executes test runners, detects regressions, and reports code coverage.",
      descriptionRu: "Запускает тесты, обнаруживает регрессии и сообщает о покрытии кода.",
      status: "idle",
      telemetry: { cpu: 0, ram: 16.8, tokens: 0 }
    }
  ]);

  // --- CLAUDE CONVERSATIONAL CHAT ENGINE ---
  const [chatInput, setChatInput] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [tokensUsed, setTokensUsed] = useState<number>(14200);
  const [successRate, setSuccessRate] = useState<number>(100);
  const [selectedClaudeModel, setSelectedClaudeModel] = useState<string>("Claude 3.5 Sonnet");
  const [isSkillsExpanded, setIsSkillsExpanded] = useState<boolean>(false);

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      id: "welcome-1",
      sender: "assistant",
      senderName: "Claude",
      avatar: "🤖",
      text: "Hello! I am Claude, integrated inside Hermes. I have initialized access to your virtual workspace, active unit tests, Obsidian vault configurations, and custom agentic skills. How can I assist you with your project today?",
      textRu: "Приветствую! Я Клод, интегрированный в Hermes. Я инициализировал доступ к вашему виртуальному проекту, модульным тестам, базе Obsidian и библиотеке кастомных навыков. Чем я могу помочь вам в разработке проекта сегодня?",
      timestamp: "13:24"
    }
  ]);

  // --- CLAUDE ARTIFACT STATE ---
  const [activeArtifact, setActiveArtifact] = useState<ClaudeArtifact | null>({
    id: "art-initial",
    title: "Hermes Project Blueprint",
    type: "architecture",
    filePath: "Architecture.md",
    content: `# Virtual Project Architecture Layout\n\nWelcome to your synchronized space. Below is the active blueprint of your project notes for Obsidian, dynamically generated for Obsidian Link Sync:\n\n- Active Project: ${project.name}\n- Files in Scope: ${Object.keys(project.files).join(', ')}\n- Active Unit Tests: ${project.tests.length} defined\n\n[[Tasks]] - Check current todo lists.\n[[Guides]] - Study code integration guidelines.\n\n*Synced automatically by Hermes Agent.*`,
    description: "Initial system architecture blueprint generated for Obsidian Vault linking.",
    applied: true
  });
  const [isArtifactOpen, setIsArtifactOpen] = useState<boolean>(true);
  const [artifactActiveTab, setArtifactActiveTab] = useState<'preview' | 'code' | 'editor'>('preview');

  // --- OBSIDIAN VAULT LOCAL PERSISTENCE ---
  const [obsidianFiles, setObsidianFiles] = useState<ObsidianFile[]>([
    {
      id: "obs-1",
      title: "Hermes",
      path: "Vault/Hermes.md",
      category: "System",
      tags: ["#hermes", "#ai-agents", "#orchestrator"],
      updatedAt: "Just now",
      content: `# Hermes Multi-Agent Orchestrator\n\nWelcome to your autonomous Hermes companion! This page is fully structured for your local Obsidian Vault.\n\n## Team Configuration\n- **Cassandra (PM)**: Focuses on structured decomposition and Obsidian index graphs.\n- Solomon (Architect): Reviews code graphs, ensures flawless integrity of [[Architecture]].\n- Aura (Coder): Conducts hot file-system patching.\n- Orion (QA): Executes dynamic testing validations.\n\nLearn more: [[Architecture]], [[Tasks]]`
    },
    {
      id: "obs-2",
      title: "Architecture",
      path: "Vault/Architecture.md",
      category: "Documentation",
      tags: ["#architecture", "#blueprints", "#typescript"],
      updatedAt: "10 mins ago",
      content: `# Core Project Architecture\n\nThis note tracks the architectural invariants of **${project.name}**.\n\n## File Layout Map\n${Object.keys(project.files).map(f => `- \`/${f}\`: Managed by Agent Aura`).join('\n')}\n\n## Cross-links\n- Active development task boards: [[Tasks]]\n- Code patterns & safety: [[Guides]]`
    },
    {
      id: "obs-3",
      title: "Tasks",
      path: "Vault/Tasks.md",
      category: "Tasks",
      tags: ["#todo", "#milestones", "#backlog"],
      updatedAt: "1 hour ago",
      content: `# Active Backlog & Goals\n\n- [x] Integrate Obsidian vault export pipeline\n- [ ] Inject multi-agent skills creator\n- [ ] Expand Claude dual-pane visual layout\n- [ ] Conduct automated test diagnostics via Orion\n\nRelated Index: [[Hermes]]`
    },
    {
      id: "obs-4",
      title: "Guides",
      path: "Vault/Guides.md",
      category: "Guides",
      tags: ["#onboarding", "#patterns", "#clean-code"],
      updatedAt: "Yesterday",
      content: `# Development Best Practices\n\n1. **Zero Hardcoded Keys**: Always export static keys to process.env variables. See [[Architecture]] for instructions.\n2. **Type-First Modularity**: Keep enums separate from dynamic layout views.\n3. **Obsidian Vault Binding**: Use \`[[Double Brackets]]\` to link thoughts seamlessly.`
    }
  ]);

  const [selectedObsidianFile, setSelectedObsidianFile] = useState<ObsidianFile | null>(null);
  const [newObsidianTitle, setNewObsidianTitle] = useState<string>("");
  const [obsidianSearch, setObsidianSearch] = useState<string>("");

  // --- AGENT SKILLS LIBRARY ---
  const [skills, setSkills] = useState<AgentSkill[]>([
    {
      id: "sk-obsidian",
      name: "Obsidian Auto-Linker",
      nameRu: "Авто-линкер Obsidian",
      description: "Auto-formats all Markdown summaries with frontmatter and Obsidian Link mapping tags.",
      descriptionRu: "Автоматически форматирует сводки Markdown с фронтматтером и разметкой Obsidian [[ссылок]].",
      systemPrompt: "Incorporate [[Obsidian]] backlinks and frontmatter in all documentation blocks.",
      category: "Custom",
      active: true,
      author: "System"
    },
    {
      id: "sk-zero-div",
      name: "Safe Division Invariance Check",
      nameRu: "Защита от деления на ноль",
      description: "Instructs Aura and Solomon to write defensive code guards and catch arithmetic division faults.",
      descriptionRu: "Заставляет Aura и Solomon писать безопасные защитные проверки и ловить арифметические ошибки.",
      systemPrompt: "When writing math or division logic, inject rigorous division-by-zero checkers.",
      category: "Code Safety",
      active: true,
      author: "System"
    },
    {
      id: "sk-maps",
      name: "Google Maps API Grounding",
      nameRu: "Гео-привязка Google Maps",
      description: "Instructs coder agents to parse coordinates, places queries, and validate postal boundaries.",
      descriptionRu: "Позволяет кодерам эффективно парсить координаты, делать поисковые запросы адресов и карт.",
      systemPrompt: "Incorporate official Google Maps Platform patterns and autocomplete functions.",
      category: "Integrations",
      active: false,
      author: "System"
    },
    {
      id: "sk-jwt",
      name: "JWT Vault Protection Safeguard",
      nameRu: "Защита секретных токенов JWT",
      description: "Intercepts static passwords and forces process.env secrets injection automatically.",
      descriptionRu: "Перехватывает жестко зашифрованные секреты и автоматически выносит их в переменные окружения.",
      systemPrompt: "Do not allow hardcoded authentication keys. Instantly extract tokens to process.env.KEY.",
      category: "Code Safety",
      active: false,
      author: "System"
    }
  ]);

  // Skill Creation Fields
  const [isSkillCreatorOpen, setIsSkillCreatorOpen] = useState<boolean>(false);
  const [newSkillName, setNewSkillName] = useState<string>("");
  const [newSkillPrompt, setNewSkillPrompt] = useState<string>("");
  const [newSkillDesc, setNewSkillDesc] = useState<string>("");
  const [newSkillCategory, setNewSkillCategory] = useState<'Code Safety' | 'Integrations' | 'Testing' | 'Custom'>('Custom');

  const chatEndRef = useRef<HTMLDivElement>(null);

  // --- EFFECTS ---
  // Autoscroll chat history
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // Fluctuating specialist telemetry (keeps the environment highly interactive)
  useEffect(() => {
    const interval = setInterval(() => {
      setAgents(prev => prev.map(agent => {
        if (agent.status === 'idle') {
          return {
            ...agent,
            telemetry: {
              ...agent.telemetry,
              cpu: Math.floor(Math.random() * 3),
              ram: Number((agent.telemetry.ram + (Math.random() * 0.1 - 0.05)).toFixed(1))
            }
          };
        } else {
          return {
            ...agent,
            telemetry: {
              ...agent.telemetry,
              cpu: Math.floor(Math.random() * 40) + 40,
              ram: Number((agent.telemetry.ram + (Math.random() * 0.3 - 0.1)).toFixed(1))
            }
          };
        }
      }));
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  // --- ACTIONS ---

  // Create custom skill
  const handleCreateSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkillName.trim() || !newSkillPrompt.trim()) return;

    const skill: AgentSkill = {
      id: "sk-custom-" + Date.now(),
      name: newSkillName,
      nameRu: newSkillName,
      description: newSkillDesc || "User specified skill instruction.",
      descriptionRu: newSkillDesc || "Пользовательское правило ИИ-агентов.",
      systemPrompt: newSkillPrompt,
      category: newSkillCategory,
      active: true,
      author: "User"
    };

    setSkills(prev => [...prev, skill]);
    setNewSkillName("");
    setNewSkillPrompt("");
    setNewSkillDesc("");
    setIsSkillCreatorOpen(false);

    // Dynamic system chat report
    setChatHistory(prev => [
      ...prev,
      {
        id: Math.random().toString(),
        sender: "assistant",
        senderName: "Claude",
        avatar: "🤖",
        text: `🚀 Added custom agent skill: **${skill.name}**. The team has loaded the following prompt directive into the context window: "${skill.systemPrompt}"`,
        textRu: `🚀 Добавлен пользовательский навык: **${skill.name}**. Агенты успешно загрузили директиву в контекстное окно: "${skill.systemPrompt}"`,
        timestamp: new Date().toLocaleTimeString().slice(0, 5)
      }
    ]);
  };

  // Toggle active skills
  const toggleSkill = (id: string) => {
    setSkills(prev => prev.map(s => {
      if (s.id === id) {
        const nextState = !s.active;
        return { ...s, active: nextState };
      }
      return s;
    }));
  };

  // Sync virtual files with Obsidian vault
  const handleSyncToObsidian = () => {
    // Generate Obsidian documentation for each file in project!
    const generatedNotes: ObsidianFile[] = Object.keys(project.files).map(filePath => {
      const file = project.files[filePath];
      return {
        id: "obs-auto-" + Math.random().toString(36).substring(7),
        title: file.name.replace(/\.[^/.]+$/, ""), // strip extension
        path: `Vault/${file.name.replace(/\.[^/.]+$/, "")}.md`,
        category: "Documentation",
        tags: ["#sync", "#virtual-file", `#${file.language}`],
        updatedAt: "Synced just now",
        content: `# ${file.name}\n\nThis note is an active replica of project file: \`/${filePath}\`.\n\n## Source Code\n\`\`\`${file.language}\n${file.content}\n\`\`\`\n\n## References\n- Return to master index: [[Hermes]]\n- See architecture baseline: [[Architecture]]`
      };
    });

    setObsidianFiles(prev => {
      // Remove previous dynamic sync notes to prevent duplicate clutter
      const filtered = prev.filter(f => !f.path.includes("obs-auto-") && !f.tags.includes("#sync"));
      return [...filtered, ...generatedNotes];
    });

    setChatHistory(prev => [
      ...prev,
      {
        id: Math.random().toString(),
        sender: "assistant",
        senderName: "Claude",
        avatar: "🤖",
        text: `🔄 **Obsidian Sync Completed!** Synced ${generatedNotes.length} project source files to Obsidian format. All backlinks, including \`[[${generatedNotes.map(n => n.title).join(']]\`, \`[[')}}]]\` are now fully resolved.`,
        textRu: `🔄 **Синхронизация Obsidian успешно выполнена!** Перенесено ${generatedNotes.length} исходных файлов проекта. Все внутренние ссылки, включая \`[[${generatedNotes.map(n => n.title).join(']]\`, \`[[')}}]]\` теперь доступны в вашей базе знаний.`,
        timestamp: new Date().toLocaleTimeString().slice(0, 5)
      }
    ]);
  };

  // Save changes to selected Obsidian File in Vault
  const handleSaveObsidianNote = (noteId: string, updatedContent: string) => {
    setObsidianFiles(prev => prev.map(file => {
      if (file.id === noteId) {
        return {
          ...file,
          content: updatedContent,
          updatedAt: "Just updated"
        };
      }
      return file;
    }));

    // Trigger feedback notification
    if (selectedObsidianFile && selectedObsidianFile.id === noteId) {
      setSelectedObsidianFile(prev => prev ? { ...prev, content: updatedContent, updatedAt: "Saved" } : null);
    }
  };

  // Create a new empty markdown note in Obsidian Vault
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
      content: `# ${cleanTitle}\n\nWrite your thoughts, guidelines, or code notes here.\n\n## Links\n- Back to master catalog: [[Hermes]]\n- Project backlogs: [[Tasks]]`
    };

    setObsidianFiles(prev => [...prev, newNote]);
    setNewObsidianTitle("");
    setSelectedObsidianFile(newNote);

    setChatHistory(prev => [
      ...prev,
      {
        id: Math.random().toString(),
        sender: "assistant",
        senderName: "Claude",
        avatar: "🤖",
        text: `📝 Created custom Obsidian Note: \`[[${cleanTitle}]]\`. Linked seamlessly within the knowledge graph.`,
        textRu: `📝 Создана новая заметка Obsidian: \`[[${cleanTitle}]]\`. Она успешно интегрирована в общий граф знаний.`,
        timestamp: new Date().toLocaleTimeString().slice(0, 5)
      }
    ]);
  };

  // Delete an Obsidian File from Vault
  const handleDeleteObsidianNote = (id: string) => {
    setObsidianFiles(prev => prev.filter(f => f.id !== id));
    if (selectedObsidianFile?.id === id) {
      setSelectedObsidianFile(null);
    }
  };

  // Export Obsidian vault as a direct download bundle
  const handleDownloadVaultBundle = () => {
    // Generate text dump representing the entire Obsidian vault as a folder
    const separator = "=".repeat(60);
    const dump = obsidianFiles.map(file => {
      return `FILE PATH: ${file.path}\nTAGS: ${file.tags.join(', ')}\nLAST MODIFIED: ${file.updatedAt}\n${separator}\n${file.content}\n\n`;
    }).join(`\n\n${"=".repeat(80)}\n\n`);

    const blob = new Blob([dump], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${project.name.toLowerCase().replace(/\s+/g, '-')}-obsidian-vault.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Apply artifact changes to virtual on-disk workspace
  const handleApplyArtifactToDisk = async () => {
    if (!activeArtifact) return;

    try {
      setIsProcessing(true);
      await onFileUpdate(activeArtifact.filePath, activeArtifact.content);
      
      setActiveArtifact(prev => prev ? { ...prev, applied: true } : null);
      
      // Post success report to chat
      setChatHistory(prev => [
        ...prev,
        {
          id: Math.random().toString(),
          sender: "assistant",
          senderName: "Claude",
          avatar: "🤖",
          text: `✅ **Applied Artifact Changes on Disk!** File \`/${activeArtifact.filePath}\` successfully updated in active workspace directory. System tests re-evaluation dispatched.`,
          textRu: `✅ **Изменения успешно применены к проекту!** Файл \`/${activeArtifact.filePath}\` обновлен на виртуальном диске. Запущен повторный анализ тестов.`,
          timestamp: new Date().toLocaleTimeString().slice(0, 5)
        }
      ]);

      // Orion runs tests
      await onRunTests();
      setIsProcessing(false);

    } catch (err: any) {
      setIsProcessing(false);
      setChatHistory(prev => [
        ...prev,
        {
          id: Math.random().toString(),
          sender: "assistant",
          senderName: "Claude",
          avatar: "🤖",
          text: `🚨 Failed to write artifact changes to virtual disk: ${err.message}`,
          textRu: `🚨 Не удалось применить изменения артефакта к проекту: ${err.message}`,
          timestamp: new Date().toLocaleTimeString().slice(0, 5)
        }
      ]);
    }
  };

  // --- CORE INTENT PROCESSING ENGINE (CLAUDE-LIKE WORKFLOW) ---
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isProcessing) return;

    const userMsgText = chatInput;
    setChatInput("");
    setIsProcessing(true);

    // 1. Post user message
    const userMsg: ChatMessage = {
      id: "usr-" + Date.now(),
      sender: "user",
      senderName: "You",
      avatar: "👤",
      text: userMsgText,
      textRu: userMsgText,
      timestamp: new Date().toLocaleTimeString().slice(0, 5)
    };
    setChatHistory(prev => [...prev, userMsg]);

    // 2. Simulate thought process while looking at active skills
    const lowerInput = userMsgText.toLowerCase();

    // Check loaded skills to print specialized logs!
    const activeSkillsList = skills.filter(s => s.active);
    const skillsTelemetryStr = activeSkillsList.map(s => `[Skill: ${s.name}]`).join(', ');

    // Sequence through agents based on the query, creating incredible Claude-like artifacts!
    await new Promise(r => setTimeout(r, 800));

    // Determine target files based on prompt
    let targetFilePath = "src/components/Dashboard.tsx";
    let blockTitle = "Dashboard Real-Time Telemetry";
    let blockType: ClaudeArtifact['type'] = "code";
    let codeContent = `// Optimized Dashboard configuration`;

    if (lowerInput.includes("calculator") || lowerInput.includes("делен") || lowerInput.includes("нол") || lowerInput.includes("math")) {
      targetFilePath = "src/calculator.ts";
      blockTitle = "Safe Math Division Guard Module";
      codeContent = `// Dynamic safe math calculator code injected by Claude & Aura\nexport function divide(a: number, b: number): number {\n  // Loaded Skill Check: Safe Division Invariance active\n  if (b === 0) {\n    throw new Error("ArithmeticException: Division by zero is prohibited in safe sandbox!");\n  }\n  return a / b;\n}\n\nexport function multiply(a: number, b: number): number {\n  return a * b;\n}\n`;
    } else if (lowerInput.includes("auth") || lowerInput.includes("jwt") || lowerInput.includes("парол")) {
      targetFilePath = "src/auth.ts";
      blockTitle = "Secured JWT Authentication Shield";
      codeContent = `// Secure authentication module with zero hardcoded credentials\nexport function validateCredentials(password: string): boolean {\n  const minLength = 8;\n  \n  if (!password || password.length < minLength) {\n    return false;\n  }\n  return true;\n}\n\n// JWT Secret imported securely from env parameters\nexport function getJwtSecret(): string {\n  const secret = process.env.JWT_SECRET;\n  if (!secret) {\n    console.warn("⚠️ Security alert: JWT_SECRET environment key not initialized. Falling back to temporary secure salt.");\n    return "temp_secure_fallback_salt_987654";\n  }\n  return secret;\n}\n`;
    } else if (lowerInput.includes("obsidian") || lowerInput.includes("заметк") || lowerInput.includes("синхр") || lowerInput.includes("vault")) {
      targetFilePath = "Vault/Project-Dashboard.md";
      blockTitle = "Project Sync State";
      blockType = "obsidian-note";
      codeContent = `# Obsidian Workspace Index\n\nGenerated dynamically based on your Hermes Skills.\n\n## Current Core Framework\n- Project Name: **${project.name}**\n- Target Workspace: [[Architecture]]\n- Status Checkpoints: [[Tasks]]\n\n## Custom Active System Prompts\n${activeSkillsList.map(s => `- *Active Directive*: ${s.systemPrompt}`).join('\n')}\n\n*Updated via Hermes Live Link. Download package via Obsidian Tab.*`;
    } else {
      // General code refactoring artifact
      targetFilePath = "src/components/Dashboard.tsx";
      blockTitle = "Optimized Dashboard Performance Hook";
      codeContent = `// Optimized Dashboard telemetry layout with clean modularity\nimport React from "react";\n\nexport function PerformanceBanner() {\n  return (\n    <div className="p-3 bg-cyan-950/20 border border-cyan-800/40 rounded-xl text-xs flex items-center justify-between">\n      <span className="text-cyan-400">⚡ Claude Orchestrator Connection Live</span>\n      <span className="font-mono text-slate-500">RTT: 14ms</span>\n    </div>\n  );\n}\n`;
    }

    // Dynamic Multi-Agent Planning Chat sequence
    // Step A: Cassandra plans
    setChatHistory(prev => [
      ...prev,
      {
        id: "pm-th-" + Date.now(),
        sender: "PM",
        senderName: "Cassandra (PM)",
        avatar: "👁️‍G",
        text: `Mission Accepted. Loaded Skills: ${skillsTelemetryStr || "None"}. I am coordinating Solomon and Aura to structure a robust response for "${userMsgText}".`,
        textRu: `Задача принята. Активные навыки ИИ: ${skillsTelemetryStr || "Нет"}. Координирую Соломона и Aura для подготовки надежного решения по запросу "${userMsgText}".`,
        timestamp: new Date().toLocaleTimeString().slice(0, 5)
      }
    ]);

    await new Promise(r => setTimeout(r, 1200));

    // Step B: Solomon architect designs
    setChatHistory(prev => [
      ...prev,
      {
        id: "arch-th-" + Date.now(),
        sender: "Architect",
        senderName: "Solomon (Architect)",
        avatar: "🧠",
        text: `Invariants reviewed. Structural target identified: "${targetFilePath}". Formulating modular artifact constraints.`,
        textRu: `Правила проверены. Структурная цель определена: "${targetFilePath}". Формулирую архитектурный артефакт.`,
        timestamp: new Date().toLocaleTimeString().slice(0, 5)
      }
    ]);

    await new Promise(r => setTimeout(r, 1000));

    // Step C: Assistant responds and spawns Claude Artifact
    const generatedArtifact: ClaudeArtifact = {
      id: "art-" + Date.now(),
      title: blockTitle,
      type: blockType,
      filePath: targetFilePath,
      content: codeContent,
      description: `Synthesized to fulfill user request: "${userMsgText}". Checked against loaded safety constraints.`,
      applied: false
    };

    setActiveArtifact(generatedArtifact);
    setIsArtifactOpen(true);
    setArtifactActiveTab('preview');

    setChatHistory(prev => [
      ...prev,
      {
        id: "asst-res-" + Date.now(),
        sender: "assistant",
        senderName: "Claude",
        avatar: "🤖",
        text: `I have created an interactive **Claude Artifact** for you containing the optimized implementation of \`${targetFilePath}\`. You can review the changes on the right panel, toggle raw code views, edit manually, or apply them directly to your virtual workspace files with a single click.`,
        textRu: `Я подготовил интерактивный **Артефакт Claude** с оптимизированным кодом для \`${targetFilePath}\`. Вы можете просмотреть изменения на панели справа, переключать сырой код, редактировать вручную или применить их к реальному проекту в один клик!`,
        timestamp: new Date().toLocaleTimeString().slice(0, 5),
        artifact: generatedArtifact
      }
    ]);

    // Add telemetry
    setTokensUsed(prev => prev + Math.floor(userMsgText.length * 1.5) + 380);
    setIsProcessing(false);
  };

  return (
    <div className={`rounded-3xl ${
      claudeTheme === 'claude-dark' 
        ? "bg-slate-950 text-slate-100 border border-slate-900" 
        : "bg-[#FBF9F6] text-neutral-850 border border-[#EBE6DD]"
    } transition-colors duration-300 shadow-2xl relative overflow-hidden select-none`}>
      
      {/* 1. Header Navigation and Claude Aesthetic Styling Bar */}
      <div className={`p-4 ${
        claudeTheme === 'claude-dark' 
          ? "bg-slate-900/60 border-b border-slate-900" 
          : "bg-[#F3EFE7] border-b border-[#E3DCD0]"
      } flex flex-col md:flex-row items-center justify-between gap-4 z-10 relative`}>
        
        {/* Left Side: Brand Indicator */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-500 shadow-inner">
            <Sparkle className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold font-mono tracking-tight text-amber-500">CLAUDE AI WORKSPACE</h1>
              <span className={`text-[8px] font-mono font-bold px-1.5 py-0.2 rounded uppercase ${
                claudeTheme === 'claude-dark' 
                  ? "bg-amber-950/50 text-amber-400 border border-amber-900/30" 
                  : "bg-amber-100 text-amber-800 border border-amber-300"
              }`}>
                HERMES INTEGRATION
              </span>
            </div>
            <p className="text-[10px] font-mono text-slate-500">
              {lang === 'ru' ? "Ассистент Claude 3.5 c базой знаний Obsidian и библиотекой навыков" : "Claude 3.5 Assistant with Obsidian Sync & Skills Configurator"}
            </p>
          </div>
        </div>

        {/* Center: Navigation Options */}
        <div className="flex bg-slate-950/40 p-1 rounded-xl border border-slate-900/30">
          {[
            { id: 'chat', labelEn: 'Claude Chat', labelRu: 'Чат Claude', icon: <Bot className="w-3.5 h-3.5" /> },
            { id: 'obsidian', labelEn: 'Obsidian Vault', labelRu: 'База Obsidian', icon: <FolderSync className="w-3.5 h-3.5" /> },
            { id: 'skills', labelEn: 'Agent Skills', labelRu: 'Навыки ИИ', icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
            { id: 'agents_tech', labelEn: 'Specialists', labelRu: 'Команда ИИ', icon: <Users className="w-3.5 h-3.5" /> }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveWorkspaceTab(tab.id as any)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                activeWorkspaceTab === tab.id 
                  ? claudeTheme === 'claude-dark' 
                    ? "bg-slate-900 text-amber-400 border border-slate-800" 
                    : "bg-[#FFFFFF] text-[#935B3B] border border-[#DDD3C1] shadow-sm"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {tab.icon}
              <span>{lang === 'ru' ? tab.labelRu : tab.labelEn}</span>
            </button>
          ))}
        </div>

        {/* Right Side: Options & Telemetry Stats */}
        <div className="flex items-center gap-3">
          {/* Aesthetic Theme Switcher */}
          <button
            onClick={() => setClaudeTheme(prev => prev === 'claude-light' ? 'claude-dark' : 'claude-light')}
            className={`p-2 rounded-xl border text-xs font-mono font-semibold cursor-pointer transition-all ${
              claudeTheme === 'claude-dark' 
                ? "bg-slate-950/60 border-slate-850 text-slate-400 hover:text-slate-200" 
                : "bg-white border-[#DDD3C1] text-[#935B3B] hover:bg-[#F9F7F2]"
            }`}
          >
            {claudeTheme === 'claude-light' ? "🌙 Dark Mode" : "☀️ Claude Light"}
          </button>

          {/* Obsidian Fast Sync */}
          <button
            onClick={handleSyncToObsidian}
            className={`p-2 rounded-xl border text-xs font-mono font-bold cursor-pointer transition-all flex items-center gap-1.5 ${
              claudeTheme === 'claude-dark' 
                ? "bg-slate-900 hover:bg-slate-850 border-slate-800 text-purple-400" 
                : "bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700"
            }`}
            title="Fast sync virtual files to Obsidian markdown notes"
          >
            <FolderSync className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">{lang === 'ru' ? "Синхр. Obsidian" : "Obsidian Link"}</span>
          </button>
        </div>

      </div>

      {/* 2. Main Tabular Workspace Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 min-h-[580px]">

        {/* Tab VIEW: CLAUDE DUAL-PANE CHAT AND ARTIFACTS FRAME */}
        {activeWorkspaceTab === 'chat' && (
          <div className="xl:col-span-12 grid grid-cols-1 lg:grid-cols-12 gap-0 relative">
            
            {/* LEFT HALF: Conversational Stream (Claude Style) */}
            <div className={`lg:col-span-7 flex flex-col justify-between ${
              claudeTheme === 'claude-dark' 
                ? "border-r border-slate-900/60" 
                : "border-r border-[#EBE6DD]"
            } h-[580px]`}>
              
              {/* Top Selector Bar: Model selector */}
              <div className={`px-5 py-2.5 border-b flex items-center justify-between text-xs font-mono ${
                claudeTheme === 'claude-dark' ? "bg-slate-950/60 border-slate-900/60 text-slate-400" : "bg-[#F3EFE7] border-[#EBE6DD] text-neutral-600"
              }`}>
                <div className="flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5 text-amber-500" />
                  <span>Model: <b>{selectedClaudeModel}</b></span>
                </div>
                <div className="flex items-center gap-3">
                  <span>Tokens Burnt: <b className="text-indigo-400">{tokensUsed.toLocaleString()}</b></span>
                  <span>Safety: <b className="text-emerald-400">Locked</b></span>
                </div>
              </div>

              {/* Chat Thread Container */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {chatHistory.map((msg, index) => {
                  const isClaude = msg.sender === 'assistant';
                  const isUser = msg.sender === 'user';
                  
                  return (
                    <div 
                      key={msg.id} 
                      className={`flex gap-3.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                    >
                      {/* Avatar */}
                      {!isUser && (
                        <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-sm flex-shrink-0 ${
                          msg.sender === 'assistant' 
                            ? "bg-amber-950/30 border-amber-900/50 text-amber-400"
                            : "bg-slate-900 border-slate-800 text-slate-300"
                        }`}>
                          {msg.avatar}
                        </div>
                      )}

                      {/* Content bubble */}
                      <div className={`max-w-[85%] space-y-1`}>
                        {/* Sender info */}
                        <div className={`flex items-center gap-1.5 text-[10px] font-mono text-slate-500 ${isUser ? 'justify-end' : 'justify-start'}`}>
                          <span className="font-bold text-slate-400">{msg.senderName}</span>
                          <span>•</span>
                          <span>{msg.timestamp}</span>
                        </div>

                        {/* Text bubble */}
                        <div className={`p-4 rounded-2xl ${
                          isUser 
                            ? claudeTheme === 'claude-dark'
                              ? "bg-amber-600/10 border border-amber-500/20 text-slate-100"
                              : "bg-[#EDE8DC] border border-[#DDD3C1] text-neutral-850"
                            : claudeTheme === 'claude-dark'
                            ? "bg-slate-900/40 border border-slate-900/60 text-slate-200"
                            : "bg-white border border-[#DDD3C1] text-neutral-850"
                        } text-xs leading-relaxed font-sans`}>
                          <p>{lang === 'ru' ? msg.textRu : msg.text}</p>

                          {/* Quick access to Artifact from message if present */}
                          {msg.artifact && (
                            <button
                              onClick={() => {
                                setActiveArtifact(msg.artifact!);
                                setIsArtifactOpen(true);
                              }}
                              className="mt-3 w-full py-2 px-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded-xl border border-amber-500/20 text-[10px] font-mono flex items-center justify-between cursor-pointer transition-all"
                            >
                              <span className="flex items-center gap-1.5">
                                <FileCode2 className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                                <b>Open Claude Artifact: {msg.artifact.title}</b>
                              </span>
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* User Avatar */}
                      {isUser && (
                        <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-sm flex-shrink-0 ${
                          claudeTheme === 'claude-dark' ? "bg-slate-900 border-slate-800 text-slate-300" : "bg-neutral-200 border-neutral-300 text-neutral-800"
                        }`}>
                          {msg.avatar}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input Area (Claude Minimalist Input Form) */}
              <form onSubmit={handleSendMessage} className={`p-4 border-t ${
                claudeTheme === 'claude-dark' ? "bg-slate-950/60 border-slate-900/60" : "bg-[#FBF9F6] border-[#EBE6DD]"
              } space-y-2`}>
                
                {/* Active Skills Overlay */}
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-[9px] font-mono font-bold text-slate-500 uppercase">{lang === 'ru' ? "Активные навыки ИИ:" : "Active Prompts:"}</span>
                  {skills.filter(s => s.active).slice(0, 3).map(s => (
                    <span 
                      key={s.id} 
                      className="px-2 py-0.5 rounded-md text-[9px] font-mono bg-cyan-950/40 text-cyan-400 border border-cyan-900/30 font-bold"
                    >
                      ✓ {s.name}
                    </span>
                  ))}
                  {skills.filter(s => s.active).length > 3 && (
                    <span className="px-2 py-0.5 rounded-md text-[9px] font-mono bg-slate-900 text-slate-500">
                      +{skills.filter(s => s.active).length - 3} more
                    </span>
                  )}
                </div>

                <div className="flex gap-2 relative items-center">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={lang === 'ru' ? "Спросите Claude, напишите код, создайте заметку Obsidian..." : "Ask Claude to write safe math guards, generate notes, refactor modules..."}
                    className={`flex-1 bg-slate-950 rounded-xl px-4 py-3 text-xs font-sans text-slate-200 focus:outline-none border placeholder-slate-600 ${
                      claudeTheme === 'claude-dark' 
                        ? "border-slate-850 focus:border-amber-500/50" 
                        : "border-[#DDD3C1] focus:border-amber-500/50 bg-[#FFFFFF] text-neutral-850"
                    }`}
                    disabled={isProcessing}
                  />

                  <button
                    type="submit"
                    disabled={!chatInput.trim() || isProcessing}
                    className="p-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-amber-950 cursor-pointer disabled:cursor-not-allowed transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                  <span>Press enter to dispatch multi-agent pipeline.</span>
                  <span>Claude 3.5 Sonnet Sandbox v1.4</span>
                </div>
              </form>

            </div>

            {/* RIGHT HALF: Claude Interactive Artifacts Window */}
            <div className={`lg:col-span-5 flex flex-col justify-between ${
              claudeTheme === 'claude-dark' ? "bg-slate-950" : "bg-[#FBF9F6]"
            } h-[580px] overflow-hidden relative`}>
              
              {isArtifactOpen && activeArtifact ? (
                <div className="h-full flex flex-col justify-between">
                  {/* Artifact Title and Controls Bar */}
                  <div className={`px-4 py-3 border-b flex items-center justify-between ${
                    claudeTheme === 'claude-dark' ? "bg-slate-900/40 border-slate-900" : "bg-[#F3EFE7] border-[#EBE6DD]"
                  }`}>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-amber-500/10 rounded-lg text-amber-500">
                        <FileCode2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-200">{activeArtifact.title}</h4>
                        <span className="text-[9px] font-mono text-slate-500 block">
                          Path: <b>{activeArtifact.filePath}</b>
                        </span>
                      </div>
                    </div>

                    {/* View selectors: Preview, Code or Editor */}
                    <div className="flex items-center gap-1.5">
                      {[
                        { id: 'preview', labelEn: 'Preview', labelRu: 'Превью' },
                        { id: 'code', labelEn: 'Raw Code', labelRu: 'Код' }
                      ].map(t => (
                        <button
                          key={t.id}
                          onClick={() => setArtifactActiveTab(t.id as any)}
                          className={`px-2 py-1 rounded text-[10px] font-mono cursor-pointer transition-all ${
                            artifactActiveTab === t.id 
                              ? "bg-slate-950 text-amber-400 border border-slate-850" 
                              : "text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          {lang === 'ru' ? t.labelRu : t.labelEn}
                        </button>
                      ))}

                      {/* Close Panel Button */}
                      <button 
                        onClick={() => setIsArtifactOpen(false)}
                        className="p-1 text-slate-500 hover:text-slate-300 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Artifact Body Display */}
                  <div className="flex-1 overflow-auto p-4 bg-slate-950 text-slate-300 text-[11px] font-mono whitespace-pre select-text">
                    
                    {artifactActiveTab === 'preview' ? (
                      <div className="space-y-4 font-sans text-xs">
                        {/* Dynamic aesthetic description card */}
                        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-850/60 text-slate-400 leading-relaxed">
                          <span className="font-bold text-amber-400 block mb-1">CLAUDE DESCRIPTION:</span>
                          {activeArtifact.description}
                        </div>

                        {/* Live Markdown output rendering simulation */}
                        <div className="p-4 rounded-xl bg-neutral-950 border border-slate-900 overflow-x-auto whitespace-pre-wrap leading-relaxed text-slate-300 font-mono text-[11px]">
                          <code>{activeArtifact.content}</code>
                        </div>

                        {/* Interactive local Obsidian link resolution visualizer */}
                        <div className="p-3 rounded-xl bg-purple-950/10 border border-purple-900/20 text-purple-300 flex items-center justify-between">
                          <span className="flex items-center gap-1.5 font-mono text-[10px]">
                            <FolderSync className="w-4 h-4 text-purple-400" />
                            <b>Direct link to local Obsidian notes vault?</b>
                          </span>
                          <button
                            onClick={() => {
                              // Sync this artifact content straight to our local obsidian storage state!
                              const cleanTitle = activeArtifact.title.replace(/\s+/g, '-');
                              const targetNote: ObsidianFile = {
                                id: "obs-" + Date.now(),
                                title: cleanTitle,
                                path: `Vault/${cleanTitle}.md`,
                                category: "Documentation",
                                tags: ["#claude-artifact", "#synced"],
                                updatedAt: "Synced now",
                                content: activeArtifact.content
                              };
                              setObsidianFiles(prev => [...prev.filter(f => f.title !== cleanTitle), targetNote]);
                              
                              // Post to history
                              setChatHistory(prev => [
                                ...prev,
                                {
                                  id: Math.random().toString(),
                                  sender: "assistant",
                                  senderName: "Claude",
                                  avatar: "🤖",
                                  text: `💾 Saved Claude Artifact **"${activeArtifact.title}"** straight into Obsidian Vault under path \`Vault/${cleanTitle}.md\`. Backlink [[${cleanTitle}]] successfully declared!`,
                                  textRu: `💾 Сохранил артефакт **"${activeArtifact.title}"** прямо в базу знаний Obsidian по пути \`Vault/${cleanTitle}.md\`. Внутренняя ссылка [[${cleanTitle}]] создана!`,
                                  timestamp: new Date().toLocaleTimeString().slice(0, 5)
                                }
                              ]);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-purple-900/40 hover:bg-purple-900/60 text-purple-200 border border-purple-800/40 text-[9px] cursor-pointer font-mono"
                          >
                            Save Note to Vault
                          </button>
                        </div>
                      </div>
                    ) : (
                      // Raw code display with full line numbers
                      <div className="grid grid-cols-12 gap-2 text-[10px] text-slate-400 font-mono">
                        <div className="col-span-1 text-right text-slate-700 select-none pr-1 border-r border-slate-900/80">
                          {activeArtifact.content.split('\n').map((_, i) => (
                            <div key={i}>{i + 1}</div>
                          ))}
                        </div>
                        <div className="col-span-11 pl-2 text-slate-200 overflow-x-auto select-text leading-normal">
                          {activeArtifact.content.split('\n').map((line, i) => (
                            <div key={i} className="hover:bg-slate-900/50 whitespace-pre">{line || ' '}</div>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>

                  {/* Apply Artifact to project folder button */}
                  <div className={`p-4 border-t flex items-center justify-between ${
                    claudeTheme === 'claude-dark' ? "bg-slate-900/40 border-slate-900" : "bg-[#F3EFE7] border-[#EBE6DD]"
                  }`}>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {activeArtifact.applied ? (
                        <span className="text-emerald-400 flex items-center gap-1 font-bold">✓ APPLIED TO WORKSPACE</span>
                      ) : (
                        <span>Modification pending approval.</span>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={handleApplyArtifactToDisk}
                        disabled={isProcessing || activeArtifact.applied}
                        className={`px-4 py-2 rounded-xl text-xs font-mono font-bold cursor-pointer transition-all flex items-center gap-1.5 ${
                          activeArtifact.applied 
                            ? "bg-slate-900 border border-slate-800 text-slate-500 cursor-not-allowed" 
                            : "bg-emerald-600 hover:bg-emerald-500 text-emerald-50 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {lang === 'ru' ? "Применить к проекту" : "Apply to Workspace"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-600 font-mono border border-dashed border-slate-850 rounded-2xl bg-slate-950/20 m-4">
                  <Terminal className="w-8 h-8 text-slate-700 mb-2" />
                  <span>{lang === 'ru' ? "Нет активного артефакта Claude. Спросите Клода, чтобы сгенерировать архитектуру или код." : "No active Claude Artifact. Engage Chat to trigger architectural blueprints or safe math guards."}</span>
                  <button
                    onClick={() => {
                      setActiveArtifact({
                        id: "art-initial",
                        title: "Hermes Project Blueprint",
                        type: "architecture",
                        filePath: "Architecture.md",
                        content: `# Virtual Project Architecture Layout\n\nWelcome to your synchronized space. Below is the active blueprint of your project notes for Obsidian:\n\n- Active Project: ${project.name}\n- Files in Scope: ${Object.keys(project.files).join(', ')}\n- Active Unit Tests: ${project.tests.length} defined\n\n[[Tasks]] - Check current todo lists.\n[[Guides]] - Study code integration guidelines.\n\n*Synced automatically by Hermes Agent.*`,
                        description: "Initial system architecture blueprint generated for Obsidian Vault linking.",
                        applied: true
                      });
                      setIsArtifactOpen(true);
                    }}
                    className="mt-4 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-[10px] text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    Load Initial Blueprint
                  </button>
                </div>
              )}

            </div>

          </div>
        )}

        {/* Tab VIEW: OBSIDIAN VAULT LOCAL WORKSPACE */}
        {activeWorkspaceTab === 'obsidian' && (
          <div className="xl:col-span-12 p-5 space-y-6">
            
            {/* Obsidian Vault Title Banner */}
            <div className="p-4 rounded-2xl bg-purple-950/20 border border-purple-900/30 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-purple-950/40 border border-purple-800/40 rounded-xl text-purple-400">
                  <FolderSync className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold font-mono text-purple-200 uppercase tracking-wider">
                    {lang === 'ru' ? "РАБОЧЕЕ ПРОСТРАНСТВО OBSIDIAN VAULT" : "OBSIDIAN LOCAL VAULT WORKSPACE"}
                  </h2>
                  <p className="text-[10px] font-mono text-purple-400/80">
                    {lang === 'ru' ? "Интегрированный редактор заметок с поддержкой обратных связей [[WikiLinks]] и экпортом" : "Full-fidelity offline markdown editor mapping double bracket WikiLinks [[Note]]"}
                  </p>
                </div>
              </div>

              {/* Download whole vault zip */}
              <div className="flex gap-2.5">
                <button
                  onClick={handleSyncToObsidian}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-purple-50 text-xs font-semibold font-mono flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_0_10px_rgba(147,51,234,0.3)]"
                >
                  <FolderSync className="w-4 h-4 animate-spin-slow" />
                  {lang === 'ru' ? "Синхронизировать проект" : "Sync Project Files"}
                </button>

                <button
                  onClick={handleDownloadVaultBundle}
                  className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-slate-100 text-xs font-semibold font-mono flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  {lang === 'ru' ? "Скачать Vault (.txt)" : "Export Vault File"}
                </button>
              </div>
            </div>

            {/* Split layout: Note tree index on the left, editor on the right */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[400px]">
              
              {/* Note Tree Index */}
              <div className="lg:col-span-4 p-4 rounded-2xl bg-slate-900/60 border border-slate-850 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                  <span className="text-[10px] font-mono font-bold text-slate-500 uppercase">
                    {lang === 'ru' ? "Файлы Obsidian (.md)" : "Obsidian Notes (.md)"}
                  </span>
                  <span className="text-[9px] font-mono bg-purple-950 text-purple-400 px-1.5 py-0.2 rounded">
                    {obsidianFiles.length} files
                  </span>
                </div>

                {/* Create Note Inline widget */}
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newObsidianTitle}
                    onChange={(e) => setNewObsidianTitle(e.target.value)}
                    placeholder="NewNoteName"
                    className="flex-1 bg-slate-950 border border-slate-850 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none"
                  />
                  <button
                    onClick={handleCreateObsidianNote}
                    disabled={!newObsidianTitle.trim()}
                    className="p-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-purple-50 disabled:opacity-40 cursor-pointer transition-all"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {/* Filter / Search input */}
                <input
                  type="text"
                  value={obsidianSearch}
                  onChange={(e) => setObsidianSearch(e.target.value)}
                  placeholder={lang === 'ru' ? "Поиск по тегам или тексту..." : "Filter notes or tags..."}
                  className="w-full bg-slate-950 border border-slate-850 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-400"
                />

                {/* List of files */}
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                  {obsidianFiles
                    .filter(f => !obsidianSearch || f.title.toLowerCase().includes(obsidianSearch.toLowerCase()) || f.tags.some(t => t.includes(obsidianSearch)))
                    .map(file => {
                      const isSelected = selectedObsidianFile?.id === file.id;
                      return (
                        <div
                          key={file.id}
                          className={`p-2.5 rounded-xl border transition-all cursor-pointer group relative ${
                            isSelected 
                              ? "bg-purple-950/20 border-purple-800 text-purple-200" 
                              : "bg-slate-950/40 border-slate-900 hover:border-slate-800 text-slate-300"
                          }`}
                          onClick={() => setSelectedObsidianFile(file)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold truncate">📄 [[{file.title}]]</span>
                            
                            {/* Delete Note */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteObsidianNote(file.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-slate-600 hover:text-rose-400 transition-all cursor-pointer"
                              title="Delete Note"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="flex items-center justify-between mt-2 text-[9px] text-slate-500 font-mono">
                            <span className="truncate">{file.path}</span>
                            <span>{file.updatedAt}</span>
                          </div>

                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {file.tags.map((t, idx) => (
                              <span key={idx} className="text-[8px] bg-slate-950 px-1 rounded text-purple-400 font-mono">
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Markdown Interactive Editor Panel */}
              <div className="lg:col-span-8 p-5 rounded-2xl bg-slate-900/60 border border-slate-850 flex flex-col justify-between">
                {selectedObsidianFile ? (
                  <div className="h-full flex flex-col justify-between space-y-4">
                    
                    {/* Header bar of editor */}
                    <div className="flex items-center justify-between border-b border-slate-850 pb-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-xs font-bold font-mono text-slate-200">[[{selectedObsidianFile.title}]]</h3>
                          <span className="text-[8px] font-mono px-1.5 py-0.2 rounded bg-purple-950 text-purple-400 font-bold uppercase">
                            {selectedObsidianFile.category}
                          </span>
                        </div>
                        <p className="text-[9px] font-mono text-slate-500 mt-0.5">Path: {selectedObsidianFile.path}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Status tracker */}
                        <span className="text-[10px] font-mono text-slate-500">Live Links Enabled</span>
                      </div>
                    </div>

                    {/* Editor core text-area */}
                    <textarea
                      value={selectedObsidianFile.content}
                      onChange={(e) => handleSaveObsidianNote(selectedObsidianFile.id, e.target.value)}
                      rows={14}
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-purple-800 transition-all resize-none leading-relaxed"
                    />

                    {/* Obsidian Linking Footnote explaining the Double Bracket WikiLinks syntax */}
                    <div className="p-3 bg-purple-950/15 border border-purple-900/20 rounded-xl text-[10px] font-mono text-purple-300 leading-relaxed space-y-1">
                      <p className="font-bold flex items-center gap-1">
                        <Compass className="w-3.5 h-3.5 text-purple-400" />
                        Obsidian WikiLinks Tip:
                      </p>
                      <p>
                        Typing <code>[[Architecture]]</code> or <code>[[Tasks]]</code> creates a direct link that Obsidian resolves automatically. Syncing project files with the upper-right button automatically turns your source code files into linkable markdown nodes!
                      </p>
                    </div>

                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-600 font-mono border border-dashed border-slate-850 rounded-xl bg-slate-950/20 min-h-[300px]">
                    <FileText className="w-10 h-10 text-slate-700 mb-2" />
                    <span>{lang === 'ru' ? "Выберите заметку в дереве Obsidian слева для начала редактирования" : "Select an Obsidian Note from the left tree or sync active project code to get started."}</span>
                    <button
                      onClick={() => {
                        const target = obsidianFiles.find(f => f.title === "Hermes");
                        if (target) setSelectedObsidianFile(target);
                      }}
                      className="mt-4 px-3 py-1.5 bg-slate-950 border border-slate-850 rounded-lg text-[10px] text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      Open Hermes.md Index Note
                    </button>
                  </div>
                )}
              </div>

            </div>

          </div>
        )}

        {/* Tab VIEW: AGENT SKILLS LIBRARY HUB */}
        {activeWorkspaceTab === 'skills' && (
          <div className="xl:col-span-12 p-5 space-y-6">
            
            {/* Skills Catalog Header */}
            <div className="p-4 rounded-2xl bg-cyan-950/20 border border-cyan-900/30 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-cyan-950/40 border border-cyan-800/40 rounded-xl text-cyan-400">
                  <SlidersHorizontal className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold font-mono text-cyan-200 uppercase tracking-wider">
                    {lang === 'ru' ? "ДИРЕКТИВЫ И БИБЛИОТЕКА НАВЫКОВ ИИ" : "HERMES AGENT SKILLS CONFIGURATOR"}
                  </h2>
                  <p className="text-[10px] font-mono text-cyan-400/80">
                    {lang === 'ru' ? "Конфигурируйте системные промпты и правила кодирования, которые агенты используют при выполнении задач" : "Bind specialized system instructions and custom API patterns dynamically into the agent context"}
                  </p>
                </div>
              </div>

              {/* Add Custom Skill Button */}
              <button
                onClick={() => setIsSkillCreatorOpen(true)}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-cyan-50 text-xs font-semibold font-mono flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_0_10px_rgba(6,182,212,0.3)]"
              >
                <Plus className="w-4 h-4" />
                {lang === 'ru' ? "Создать новый навык" : "Add Custom Skill"}
              </button>
            </div>

            {/* Custom Skill Creator Modal Overlay */}
            {isSkillCreatorOpen && (
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                  <span className="text-xs font-bold text-slate-200 uppercase font-mono">Create Agent System Skill Directive</span>
                  <button onClick={() => setIsSkillCreatorOpen(false)} className="text-slate-500 hover:text-slate-300">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleCreateSkill} className="space-y-3.5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[9px] font-mono font-bold text-slate-500 uppercase block mb-1">Skill Name:</label>
                      <input
                        type="text"
                        value={newSkillName}
                        onChange={(e) => setNewSkillName(e.target.value)}
                        placeholder="e.g. Robust Security Auditing"
                        className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-mono font-bold text-slate-500 uppercase block mb-1">Category:</label>
                      <select
                        value={newSkillCategory}
                        onChange={(e: any) => setNewSkillCategory(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-xs font-mono text-slate-400 focus:outline-none focus:border-cyan-500"
                      >
                        <option value="Code Safety">Code Safety</option>
                        <option value="Integrations">Integrations</option>
                        <option value="Testing">Testing</option>
                        <option value="Custom">Custom</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] font-mono font-bold text-slate-500 uppercase block mb-1">Short Description:</label>
                    <input
                      type="text"
                      value={newSkillDesc}
                      onChange={(e) => setNewSkillDesc(e.target.value)}
                      placeholder="Instruct coder agent Aura to format code blocks with strict typing..."
                      className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-mono font-bold text-slate-500 uppercase block mb-1">System Prompt Directive Injection (Strict constraint):</label>
                    <textarea
                      value={newSkillPrompt}
                      onChange={(e) => setNewSkillPrompt(e.target.value)}
                      rows={3}
                      placeholder="e.g. Ensure all functions are strictly typed with zero fallback values. Prevent variable leaks."
                      className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                      required
                    />
                  </div>

                  <div className="flex gap-2 justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setIsSkillCreatorOpen(false)}
                      className="px-4 py-2 bg-slate-950 border border-slate-850 rounded-xl text-xs font-mono text-slate-400 hover:text-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-cyan-50 rounded-xl text-xs font-mono font-bold shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                    >
                      Save Directive
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Skills grid list */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {skills.map(skill => (
                <div 
                  key={skill.id}
                  className={`p-5 rounded-2xl bg-slate-900/80 border transition-all duration-300 relative overflow-hidden ${
                    skill.active 
                      ? "border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.1)] bg-slate-900" 
                      : "border-slate-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`p-2 rounded-xl text-xs font-mono font-bold ${
                        skill.category === 'Code Safety' ? 'bg-rose-950/40 text-rose-400' :
                        skill.category === 'Integrations' ? 'bg-indigo-950/40 text-indigo-400' :
                        skill.category === 'Testing' ? 'bg-emerald-950/40 text-emerald-400' : 'bg-purple-950/40 text-purple-400'
                      }`}>
                        {skill.category.toUpperCase()}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-200">{lang === 'ru' ? skill.nameRu : skill.name}</h4>
                        <span className="text-[9px] font-mono text-slate-500">Author: {skill.author}</span>
                      </div>
                    </div>

                    {/* Checkbox toggle switch */}
                    <button
                      onClick={() => toggleSkill(skill.id)}
                      className={`px-3 py-1 rounded-lg text-[10px] font-mono font-bold cursor-pointer transition-all ${
                        skill.active 
                          ? "bg-cyan-500 text-cyan-950 font-bold" 
                          : "bg-slate-950 text-slate-500 border border-slate-850"
                      }`}
                    >
                      {skill.active ? "ACTIVE" : "DISABLED"}
                    </button>
                  </div>

                  <p className="text-xs text-slate-400 mt-4 leading-relaxed font-sans">
                    {lang === 'ru' ? skill.descriptionRu : skill.description}
                  </p>

                  <div className="mt-4 pt-3.5 border-t border-slate-850">
                    <span className="text-[9px] font-mono font-bold text-slate-500 uppercase block mb-1">Prompt Injection Payload:</span>
                    <div className="p-2.5 bg-slate-950 border border-slate-900 rounded-lg text-[10px] font-mono text-slate-400 select-text leading-relaxed">
                      "{skill.systemPrompt}"
                    </div>
                  </div>
                </div>
              ))}
            </div>

          </div>
        )}

        {/* Tab VIEW: AGENTS SPECIALISTS INFORMATION BOARD */}
        {activeWorkspaceTab === 'agents_tech' && (
          <div className="xl:col-span-12 p-5 space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {agents.map(agent => {
                const isActive = agent.status !== 'idle';
                return (
                  <div 
                    key={agent.id}
                    className={`p-5 rounded-2xl bg-slate-900/80 border transition-all duration-300 relative overflow-hidden ${
                      isActive 
                        ? "border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.15)] bg-slate-900" 
                        : "border-slate-800"
                    }`}
                  >
                    {isActive && (
                      <div className="absolute top-0 left-0 w-2 h-full bg-amber-400 animate-pulse" />
                    )}

                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]">{agent.avatar}</span>
                        <div>
                          <h4 className="text-sm font-bold font-mono text-slate-200">{agent.name}</h4>
                          <span className="text-[10px] font-mono text-slate-500 block font-semibold uppercase">
                            {lang === 'ru' ? agent.roleRu : agent.role}
                          </span>
                        </div>
                      </div>

                      <span className={`text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full uppercase ${
                        agent.status === 'idle' 
                          ? "bg-slate-950 text-slate-500 border border-slate-850"
                          : agent.status === 'completed'
                          ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900/30 animate-pulse"
                          : "bg-amber-950/50 text-amber-400 border border-amber-900/40 animate-pulse"
                      }`}>
                        {agent.status}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 mt-4 leading-relaxed font-sans">
                      {lang === 'ru' ? agent.descriptionRu : agent.description}
                    </p>

                    <div className="mt-5 pt-3 border-t border-slate-850 grid grid-cols-3 gap-2 text-[10px] font-mono text-slate-500">
                      <div>
                        <span>CPU: </span>
                        <b className={agent.status !== 'idle' ? "text-amber-400" : "text-slate-400"}>
                          {agent.telemetry.cpu}%
                        </b>
                      </div>
                      <div>
                        <span>RAM: </span>
                        <b className="text-slate-400">{agent.telemetry.ram} GB</b>
                      </div>
                      <div>
                        <span>TOKENS: </span>
                        <b className={agent.telemetry.tokens > 0 ? "text-indigo-400" : "text-slate-400"}>
                          {agent.telemetry.tokens}
                        </b>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        )}

      </div>

    </div>
  );
}
