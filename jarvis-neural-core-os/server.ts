/**
 * JARVIS Neural Core OS — Express Dev Server
 * 
 * Назначение:
 *   1. Vite HMR middleware в dev-режиме.
 *   2. Проксирование AI-запросов в OpenRouter API с контекстом Obsidian Vault.
 *   3. Реальная телеметрия Fedora Linux (CPU, RAM, uptime).
 *   4. Управление состоянием ядра (core-state), настройками, Aider.
 *
 * ⚠ В production-режиме AI-чат идёт через Tauri invoke('ask_openrouter') →
 *   Rust-бэкенд → Obsidian Vault. Этот сервер — резервный путь для браузера.
 */

import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// ── Конфигурация Obsidian Vault ──────────────────────────────────
const OBSIDIAN_VAULT_PATH: string =
  process.env.OBSIDIAN_VAULT_PATH || "~/Documents/ObsidianVault";
const VAULT_ROOT: string = OBSIDIAN_VAULT_PATH.replace(/^~/, os.homedir());
const CONTEXT_DIR: string = path.join(VAULT_ROOT, "context");

/** Ленивое создание context/ при первом обращении */
function ensureContextDir(): void {
  if (!fs.existsSync(CONTEXT_DIR)) {
    fs.mkdirSync(CONTEXT_DIR, { recursive: true });
    console.log(`[JARVIS] Created context dir: ${CONTEXT_DIR}`);
  }
}

// ── Хелперы Obsidian (зеркало Rust-логики на TypeScript) ─────────

/** Коэффициент Жаккара по символьным 3-граммам (UTF-8 safe) */
function similarity(a: string, b: string): number {
  if (a === b) return 1.0;
  const al = a.toLowerCase(), bl = b.toLowerCase();
  const tri = (s: string): Set<string> => {
    const chars = [...s];
    const set = new Set<string>();
    for (let i = 0; i <= chars.length - 3; i++) set.add(chars.slice(i, i + 3).join(""));
    return set;
  };
  const ta = tri(al), tb = tri(bl);
  if (ta.size === 0 && tb.size === 0) return 1.0;
  const intersection = new Set([...ta].filter(x => tb.has(x)));
  const union = new Set([...ta, ...tb]);
  return intersection.size / union.size;
}

/** Рекурсивный сбор .md файлов, игнорируя скрытые папки */
function listAllMdFiles(dir: string): string[] {
  const ignored = new Set([".obsidian", ".git", ".trash", ".DS_Store", "__pycache__", "node_modules"]);
  const result: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || ignored.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) result.push(...listAllMdFiles(full));
      else if (entry.isFile() && entry.name.endsWith(".md")) result.push(full);
    }
  } catch { /* permission denied — skip */ }
  return result;
}

/** Извлекает релевантные абзацы из Vault (аналог Rust get_optimized_context) */
function getOptimizedContext(query: string, maxChars: number = 3200): string {
  if (!fs.existsSync(VAULT_ROOT)) return "";
  const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
  if (keywords.length === 0) return "";

  const files = listAllMdFiles(VAULT_ROOT);
  interface ParagraphHit { score: number; text: string; source: string; }
  const paragraphs: ParagraphHit[] = [];

  for (const fullPath of files) {
    let content: string;
    try { content = fs.readFileSync(fullPath, "utf-8"); } catch { continue; }
    const source = path.relative(VAULT_ROOT, fullPath);

    for (const para of content.split(/\n\n/)) {
      const trimmed = para.trim();
      if (!trimmed) continue;
      const lower = trimmed.toLowerCase();
      let score = 0;
      for (const kw of keywords) { if (lower.includes(kw)) score++; }
      if (score > 0) {
        if (trimmed.startsWith("#")) score += 2;
        paragraphs.push({ score, text: trimmed, source });
      }
    }
  }

  if (paragraphs.length === 0) return "";

  paragraphs.sort((a, b) => b.score - a.score);

  let result = "[RELEVANT MEMORY CONTEXT]\n";
  const usedSources = new Set<string>();
  for (const ph of paragraphs) {
    let block = "";
    if (!usedSources.has(ph.source)) {
      usedSources.add(ph.source);
      block += `## Source: ${ph.source}\n`;
    }
    block += `- ${ph.text}\n`;
    if (result.length + block.length > maxChars) break;
    result += block;
  }
  return result;
}

/** Сохраняет реплику в context/chat_log.md */
function appendChatLog(userMsg: string, assistantMsg: string): void {
  ensureContextDir();
  const logPath = path.join(CONTEXT_DIR, "chat_log.md");
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const entry = `### ${timestamp}\n**User:** ${userMsg.trim()}\n**JARVIS:** ${assistantMsg.trim()}\n\n`;
  try {
    fs.appendFileSync(logPath, entry, "utf-8");
    console.log("[JARVIS] Chat log appended");
  } catch (e) {
    console.error("[JARVIS] Failed to append chat log:", e);
  }
}

/** Лёгкий эвристический анализатор → обновляет user_profile.md и active_projects.md */
function autoExtractProfile(userMsg: string, assistantMsg: string): void {
  ensureContextDir();
  const combined = `User: ${userMsg}\nJARVIS: ${assistantMsg}`;

  const userFacts: string[] = [];
  const projectEntries: string[] = [];

  const userMarkers = ["я ", "мой ", "моя ", "мои ", "мне ", "меня ", "i ", "i'm ", "i am ", "my ", "i like ", "i prefer ", "i use ", "i work ", "i live "];
  const projectMarkers = ["проект", "задача", "надо сделать", "работаю над", "разрабатываю", "пишу", "чиню", "фикшу", "todo", "task", "project", "working on", "developing", "building", "fixing"];

  for (const sentence of combined.split(/[.!?\n]/)) {
    const s = sentence.trim();
    if (s.length < 10) continue;
    const lower = s.toLowerCase();

    if (userMarkers.some(m => lower.includes(m)) && s.length <= 250) {
      userFacts.push(`- ${s}`);
    }
    if (projectMarkers.some(m => lower.includes(m)) && s.length <= 300) {
      projectEntries.push(`- ${s}`);
    }
  }

  // Обновляем user_profile.md
  if (userFacts.length > 0) {
    const profilePath = path.join(CONTEXT_DIR, "user_profile.md");
    let existing: string[] = [];
    try {
      if (fs.existsSync(profilePath)) {
        existing = fs.readFileSync(profilePath, "utf-8").split("\n").filter(l => l.startsWith("- "));
      }
    } catch {}
    for (const fact of userFacts) {
      const isDup = existing.some(e => similarity(e, fact) > 0.8);
      if (!isDup) existing.push(fact);
    }
    if (existing.length > 40) existing = existing.slice(-40);
    const header = "# User Profile\n\n_Automatically maintained by JARVIS._\n";
    try {
      fs.writeFileSync(profilePath, header + existing.join("\n") + "\n", "utf-8");
      console.log("[JARVIS] user_profile.md updated");
    } catch (e) {
      console.error("[JARVIS] Failed to write user_profile.md:", e);
    }
  }

  // Обновляем active_projects.md
  if (projectEntries.length > 0) {
    const projectsPath = path.join(CONTEXT_DIR, "active_projects.md");
    let existing: string[] = [];
    try {
      if (fs.existsSync(projectsPath)) {
        existing = fs.readFileSync(projectsPath, "utf-8").split("\n").filter(l => l.startsWith("- "));
      }
    } catch {}
    for (const entry of projectEntries) {
      const isDup = existing.some(e => similarity(e, entry) > 0.75);
      if (!isDup) existing.push(entry);
    }
    if (existing.length > 30) existing = existing.slice(-30);
    const header = "# Active Projects\n\n_Automatically maintained by JARVIS._\n";
    try {
      fs.writeFileSync(projectsPath, header + existing.join("\n") + "\n", "utf-8");
      console.log("[JARVIS] active_projects.md updated");
    } catch (e) {
      console.error("[JARVIS] Failed to write active_projects.md:", e);
    }
  }
}

// ── Application State ─────────────────────────────────────────────

const appSettings = {
  provider: process.env.OPENROUTER_PROVIDER || "OpenRouter",
  model: process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash",
  contextLength: "200K",
  temperature: 0.7,
  maxTokens: 4096,
  topP: 0.95,
  frequencyPenalty: 0.0,
  presencePenalty: 0.0,
  streamResponse: true,
  activeProfile: "Coding",
};

let coreState: {
  state: "startup" | "file_io" | "working" | "idle";
  source?: string;
  message?: string;
} = { state: "idle", source: "System Init", message: "JARVIS Neural Core Ready" };

// ── Реальная системная телеметрия ──────────────────────────────────

function getRealSystemStatus() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const uptimeSec = os.uptime();
  const days = Math.floor(uptimeSec / 86400);
  const hours = Math.floor((uptimeSec % 86400) / 3600);
  const mins = Math.floor((uptimeSec % 3600) / 60);

  // CPU load
  const cpus = os.cpus();
  const cpuUsage = cpus.length > 0
    ? cpus.reduce((acc, cpu) => {
        const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
        const idle = cpu.times.idle;
        return acc + (1 - idle / total);
      }, 0) / cpus.length * 100
    : 0;

  return {
    cpu: Math.round(cpuUsage),
    ram: Math.round((usedMem / totalMem) * 100),
    gpu: 0, // требует nvidia-smi или подобного
    network: {
      upload: "N/A",
      download: "N/A",
    },
    latency: "N/A",
    temperature: "N/A",
    fanSpeed: "N/A",
    uptime: `${days}d ${hours}h ${mins}m`,
    processes: [] as Array<{ id: number; name: string; cpu: string; mem: string }>,
  };
}

// ── API Routes ─────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now(), platform: `${os.platform()} ${os.arch()}`, hostname: os.hostname() });
});

app.get("/api/core-state", (_req, res) => {
  res.json(coreState);
});

app.post("/api/core-state", (req, res) => {
  const { state, source, message } = req.body;
  if (["startup", "file_io", "working", "idle"].includes(state)) {
    coreState = { state, source, message };
    res.json({ success: true, coreState });
  } else {
    res.status(400).json({ error: "Invalid core state" });
  }
});

app.get("/api/settings", (_req, res) => {
  res.json(appSettings);
});

app.post("/api/settings", (req, res) => {
  Object.assign(appSettings, req.body);
  res.json({ success: true, settings: appSettings });
});

app.post("/api/providers/check", async (_req, res) => {
  const start = Date.now();
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("No API key");
    const resp = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    const latencyMs = Date.now() - start;
    if (resp.ok) {
      const data = await resp.json();
      res.json({
        status: "connected",
        latencyMs,
        provider: "OpenRouter",
        model: appSettings.model,
        rateLimitRemaining: `${data?.data?.limit_remaining ?? "?"} / ${data?.data?.limit ?? "?"} req`,
        uptime: "99.98%",
      });
    } else {
      res.json({ status: "error", latencyMs, error: `HTTP ${resp.status}` });
    }
  } catch (err: any) {
    res.json({ status: "disconnected", latencyMs: Date.now() - start, error: err.message });
  }
});

app.get("/api/system-status", (_req, res) => {
  res.json(getRealSystemStatus());
});

// ── AI Chat Endpoint ───────────────────────────────────────────────
// Основной путь: фронтенд → Tauri invoke('ask_openrouter') → Rust.
// Этот эндпоинт — резервный для случаев, когда Tauri недоступен
// (например, запуск в браузере через npm run dev).

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const BASE_SYSTEM_PROMPT = `You are JARVIS — a cold, pragmatic AI assistant and system engineer for a Fedora Linux machine.

PERSONALITY (hard-coded, non-negotiable):
1. NO SERVILITY. Never use "Sir", "At your service", "As you wish", "Happy to help", "Gladly", "With pleasure". You are a software system, not a butler.
2. NO APOLOGIES. If wrong, state the fix coldly ("Fixed", "Corrected"). Never say "sorry", "apologies", "my bad". When the user flags an error, accept the input and proceed. Never thank for criticism.
3. COLD TECHNICAL TONE. Speak like a systems engineer: concise, precise, factual. No fluff, no enthusiasm, no small talk. Use Russian unless the user writes otherwise. Keep responses under 3 sentences unless analysis is requested.
4. HEALTHY SKEPTICISM. If the user proposes a technically unsound idea, point out the architectural flaws and risks directly. Correct analysis over politeness.
5. SYSTEM CONTEXT. Fedora Linux environment. Can execute shell commands, create files/folders, launch apps, search web, control VPN, transcribe speech, and synthesize voice via integrated backend commands.
6. Intent routing: if the user's request matches an intent (launch, search, create_file, create_folder, vpn_start, vpn_restart, or a raw shell command), execute and report the result in one line. Otherwise, interpret and respond technically.`;

app.post("/api/ai/chat", async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: "Empty message" });
  }

  coreState = { state: "working", source: "AI Engine", message: `Processing: ${message.slice(0, 30)}...` };

  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OPENROUTER_API_KEY not configured in .env" });
    }

    // 1. Извлекаем контекст из Obsidian Vault
    const vaultContext = getOptimizedContext(message);
    let systemPrompt = BASE_SYSTEM_PROMPT;
    if (vaultContext) {
      systemPrompt += `\n\n---\n## Long-term memory (from Obsidian Vault):\n${vaultContext}\nUse the above facts when relevant.`;
      console.log(`[JARVIS] Injected Obsidian context (${vaultContext.length} chars)`);
    } else {
      console.log("[JARVIS] No Obsidian context found for query");
    }

    const model = process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash";

    // 2. Запрос к OpenRouter
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://jarvis-neural-core-os.local",
        "X-Title": "JARVIS Neural Core OS",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`OpenRouter HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const replyText: string =
      data?.choices?.[0]?.message?.content?.trim() || "";

    if (!replyText) {
      throw new Error("OpenRouter returned empty response");
    }

    // 3. Сохраняем в Obsidian Vault (best-effort, не ломаем ответ)
    try {
      ensureContextDir();
      appendChatLog(message, replyText);
      autoExtractProfile(message, replyText);
    } catch (vaultErr: any) {
      console.error("[JARVIS] Vault save error:", vaultErr.message);
    }

    // 4. Возвращаем ответ
    setTimeout(() => {
      coreState = { state: "idle", source: "System Ready", message: "Awaiting next command" };
    }, 3000);

    return res.json({ reply: replyText, model, status: "success" });
  } catch (err: any) {
    console.error("[JARVIS] AI Error:", err.message);
    coreState = { state: "idle", source: "Error", message: "Error processing request" };

    // Классификация ошибок
    if (err.message.includes("timeout") || err.name === "AbortError") {
      return res.status(504).json({ error: "OpenRouter timeout (30s)" });
    }
    if (err.message.includes("401")) {
      return res.status(401).json({ error: "Invalid OpenRouter API key" });
    }
    if (err.message.includes("429")) {
      return res.status(429).json({ error: "OpenRouter rate limit exceeded" });
    }
    if (err.message.includes("fetch")) {
      return res.status(502).json({ error: "Cannot reach OpenRouter API" });
    }

    res.status(500).json({ error: err.message });
  }
});

// ── Aider AI Programmer Tool ────────────────────────────────────────

app.post("/api/aider/execute", (req, res) => {
  const { action, prompt } = req.body;
  coreState = { state: "working", source: "Aider Engine", message: `Aider running: ${action}` };

  res.json({
    status: "executing",
    command: `aider --model ${appSettings.model} --message "${prompt || action}"`,
    logs: [
      `[Aider] Connecting to ${appSettings.provider}...`,
      `[Aider] Use 'aider' CLI directly for real execution.`,
      `[Aider] This endpoint is a stub — Aider runs locally.`,
    ],
  });

  // Возвращаемся в idle
  setTimeout(() => {
    coreState = { state: "idle", source: "System Ready", message: "Awaiting next command" };
  }, 1000);
});

// ── File IO Scan ────────────────────────────────────────────────────

app.post("/api/file-io/scan", (req, res) => {
  const { path: scanPath } = req.body;
  const target = scanPath || VAULT_ROOT || os.homedir();
  coreState = { state: "file_io", source: "FS Scanner", message: `Scanning: ${target}` };

  let filesIndexed = 0;
  let timeTaken = "0ms";
  try {
    const start = Date.now();
    if (fs.existsSync(target)) {
      const countFiles = (dir: string): number => {
        let count = 0;
        try {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
              count += countFiles(path.join(dir, entry.name));
            } else if (entry.isFile()) {
              count++;
            }
          }
        } catch {}
        return count;
      };
      filesIndexed = countFiles(target);
    }
    timeTaken = `${Date.now() - start}ms`;
  } catch {}

  setTimeout(() => {
    coreState = { state: "idle", source: "FS Complete", message: `Scan finished. ${filesIndexed} files indexed.` };
  }, 500);

  res.json({ status: "scanned", filesIndexed, timeTaken, target });
});

// ── Server Start ────────────────────────────────────────────────────

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[JARVIS] Server: http://0.0.0.0:${PORT}`);
    console.log(`[JARVIS] Obsidian Vault: ${VAULT_ROOT}`);
    if (fs.existsSync(VAULT_ROOT)) {
      console.log(`[JARVIS] Vault found, context dir: ${CONTEXT_DIR}`);
    } else {
      console.log(`[JARVIS] ⚠ Vault NOT FOUND at ${VAULT_ROOT}`);
      console.log(`[JARVIS] ⚠ Set OBSIDIAN_VAULT_PATH in .env to your Obsidian vault path.`);
    }
  });
}

startServer();
