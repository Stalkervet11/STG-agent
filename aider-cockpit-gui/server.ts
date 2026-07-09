import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { 
  VirtualProject, 
  AiderTask, 
  SystemTelemetry, 
  LogMessage, 
  ModelConfig,
  TelegramConfig,
  UITheme
} from "./src/types";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;

// Initialize state
let activeProjectId = "project-1";
let logs: LogMessage[] = [
  {
    id: "log-1",
    timestamp: new Date().toLocaleTimeString(),
    level: "info",
    source: "system",
    text: "Aider GUI Server initialized. Active project: Aesthetic Calculator Service"
  }
];

let telemetry: SystemTelemetry = {
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
};

// VCS caching and hashing support
const lastCompiledHashes: Record<string, string> = {};

function computeHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = (hash << 5) - hash + content.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return "vcs-" + Math.abs(hash).toString(16);
}

let currentTheme: UITheme = 'midnight';
let memoryPoolEnabled = false;
let rustFfiApplied = false;

let telegramConfig = {
  botToken: "",
  chatId: "",
  enabled: false,
  status: "disconnected" as 'connected' | 'disconnected' | 'testing'
};

const modelConfigs: ModelConfig[] = [
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    type: "online",
    provider: "Google API",
    speed: "Extremely Fast",
    contextWindow: "1M tokens",
    status: "available"
  },
  {
    id: "llama3-local",
    name: "Llama 3 (Ollama Local)",
    type: "offline",
    provider: "Ollama (Offline)",
    speed: "Moderate (GPU/CPU)",
    contextWindow: "8K tokens",
    status: "available"
  },
  {
    id: "deepseek-coder-local",
    name: "DeepSeek Coder 1.5B",
    type: "offline",
    provider: "Ollama (Offline)",
    speed: "Fast (Local)",
    contextWindow: "16K tokens",
    status: "available"
  }
];

let selectedModelId = "gemini-3.5-flash";

// In-Memory Virtual Workspace Projects
const projects: Record<string, VirtualProject> = {
  "project-1": {
    id: "project-1",
    name: "Aesthetic Calculator Service",
    description: "A mathematical microservice that handles core arithmetic, formatted outputs, and division checks.",
    files: {
      "src/calculator.ts": {
        name: "calculator.ts",
        path: "src/calculator.ts",
        language: "typescript",
        content: `export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

export function divide(a: number, b: number): number {
  // BUG: b is not checked for 0, returns Infinity
  return a / b;
}`
      },
      "src/utils.ts": {
        name: "utils.ts",
        path: "src/utils.ts",
        language: "typescript",
        content: `export function formatResult(val: number): string {
  return \`Calculation Result: \${val.toFixed(2)}\`;
}`
      }
    },
    tests: [
      {
        id: "calc-test-1",
        name: "Verify basic addition",
        description: "Checks if 2 + 3 yields 5",
        status: "idle",
        assertCode: "add(2, 3) === 5",
        expectedOutput: "5"
      },
      {
        id: "calc-test-2",
        name: "Verify basic multiplication",
        description: "Checks if 4 * 5 yields 20",
        status: "idle",
        assertCode: "multiply(4, 5) === 20",
        expectedOutput: "20"
      },
      {
        id: "calc-test-3",
        name: "Handle division by zero safely",
        description: "Checks if dividing by 0 throws an explicit error: 'Division by zero is undefined!'",
        status: "idle",
        assertCode: "divide(10, 0) throws Error('Division by zero is undefined!')",
        expectedOutput: "Error: Division by zero is undefined!"
      }
    ]
  },
  "project-2": {
    id: "project-2",
    name: "Secure JWT Authenticator",
    description: "A micro-authentication module for checking client passwords and signing secure user JSON Web Tokens.",
    files: {
      "src/auth.ts": {
        name: "auth.ts",
        path: "src/auth.ts",
        language: "typescript",
        content: `export function validatePassword(password: string): boolean {
  // BUG: Typo '< 8' instead of '>= 8'. Currently allows short passwords!
  if (password.length < 8) {
    return true; 
  }
  return false;
}

export function generateToken(userId: string): string {
  // BUG: Uses insecure, hardcoded secret key instead of process.env.JWT_SECRET
  const secret = "SECRET_KEY_123";
  return \`token_\${userId}_signed_with_\${secret}\`;
}`
      }
    },
    tests: [
      {
        id: "auth-test-1",
        name: "Reject short passwords",
        description: "Verifies that short passwords (< 8 chars) are rejected",
        status: "idle",
        assertCode: "validatePassword('short') === false",
        expectedOutput: "false"
      },
      {
        id: "auth-test-2",
        name: "Sign JWT securely",
        description: "Ensures the generated token uses an environment secret instead of a hardcoded string",
        status: "idle",
        assertCode: "generateToken('user1') uses process.env.JWT_SECRET",
        expectedOutput: "token_user1_signed_with_env_secret"
      }
    ]
  },
  "project-3": {
    id: "project-3",
    name: "Smart Weather Parser",
    description: "An API parser module for reading real-time meteorology payloads, parsing wind and temperature parameters.",
    files: {
      "src/parser.ts": {
        name: "parser.ts",
        path: "src/parser.ts",
        language: "typescript",
        content: `export interface WeatherPayload {
  city: string;
  temp: number;
  wind?: {
    speed: number;
  };
}

export function parseWindSpeed(payload: WeatherPayload): number {
  // BUG: Accesses wind.speed directly without checking if wind attribute exists. Throws TypeError if wind is undefined.
  return payload.wind.speed;
}`
      }
    },
    tests: [
      {
        id: "weather-test-1",
        name: "Parse normal weather conditions",
        description: "Checks parsing of a fully defined payload with temperature and wind speed",
        status: "idle",
        assertCode: "parseWindSpeed({ city: 'Berlin', temp: 18, wind: { speed: 12 } }) === 12",
        expectedOutput: "12"
      },
      {
        id: "weather-test-2",
        name: "Handle missing wind attributes",
        description: "Verifies that a payload lacking the optional wind property defaults safely to 0 speed instead of throwing a TypeError",
        status: "idle",
        assertCode: "parseWindSpeed({ city: 'Paris', temp: 22 }) === 0",
        expectedOutput: "0"
      }
    ]
  },
  "project-4": {
    id: "project-4",
    name: "High-Speed Packet Cryptographic Engine",
    description: "A performance-critical module designed to encrypt and analyze network packets at line speed.",
    files: {
      "src/encrypt.ts": {
        name: "encrypt.ts",
        path: "src/encrypt.ts",
        language: "typescript",
        content: `// PERFORMANCE BOTTLENECK: High RAM allocations under continuous packet streams
// RECOMMENDED: Rewrite using Rust FFI / C++ with memory pooling for maximum throughput
export function encryptBuffer(data: Buffer): Buffer {
  let output = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    output[i] = data[i] ^ 0x5A; // Simple XOR cipher
  }
  return output;
}`
      }
    },
    tests: [
      {
        id: "perf-test-1",
        name: "Throughput target >= 100 MB/s",
        description: "Checks encryption speed under high-volume packet stream loads",
        status: "idle",
        assertCode: "encryptBuffer performance profile >= 100 MB/s",
        expectedOutput: ">= 100 MB/s"
      },
      {
        id: "leak-test-2",
        name: "Memory Leak Check: Zero heap accumulation under infinite packet stream",
        description: "Asserts that garbage collection cycles and memory usage remain flat, validating zero leakage",
        status: "idle",
        assertCode: "checkMemoryLeaks(encryptBuffer, 100000) === 0",
        expectedOutput: "0 bytes leak"
      }
    ]
  }
};

let tasks: AiderTask[] = [];
let isNightModeAutomationRunning = false;

// Initialize Gemini Client
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
};

// Periodic load simulation & telemetry updating
setInterval(() => {
  // Fluctuating background loads
  const activeTaskCount = tasks.filter(t => t.status === "running").length;
  const baseCpu = 8 + Math.floor(Math.random() * 8);
  const taskCpu = activeTaskCount * 35;
  telemetry.cpuUsage = Math.min(98, baseCpu + taskCpu);

  // If High-Speed Packet Engine is selected and memory pools are NOT enabled, simulate heavy allocation (>70% RAM)
  let ramValue = 28 + (activeTaskCount * 12) + Math.floor(Math.random() * 3);
  if (activeProjectId === "project-4") {
    telemetry.performanceCritical = true;
    if (!memoryPoolEnabled) {
      ramValue = 76 + Math.floor(Math.random() * 4); // 76% - 79% RAM
    } else {
      ramValue = 34 + Math.floor(Math.random() * 3); // Optimized to 34%-36% RAM
    }
  } else {
    telemetry.performanceCritical = false;
  }
  telemetry.ramUsage = Math.min(95, ramValue);

  // RAM Warning & Auto-optimization advisor trigger
  if (telemetry.ramUsage > 70) {
    if (!telemetry.ramWarningTriggered) {
      telemetry.ramWarningTriggered = true;
      addLog("system", "warn", `[CRITICAL MONITOR] RAM utilization has exceeded 70% (currently ${telemetry.ramUsage}%). Memory leak checks and object-pool optimization are highly recommended to prevent out-of-memory overhead!`);
      
      // Dispatch Telegram Alert if configured
      if (telegramConfig.enabled && telegramConfig.status === "connected") {
        addLog("system", "info", `[Telegram Bot] ⚠️ High RAM Alert dispatched: ${telemetry.ramUsage}% usage. Optimization required.`);
      }
    }
  } else {
    if (telemetry.ramWarningTriggered) {
      telemetry.ramWarningTriggered = false;
      addLog("system", "success", `[MONITOR] RAM utilization has dropped below critical thresholds (currently ${telemetry.ramUsage}%). Object pools active.`);
    }
  }

  telemetry.activeTasks = activeTaskCount;
  telemetry.networkSpeed = activeTaskCount > 0 
    ? 200 + Math.floor(Math.random() * 800) 
    : 40 + Math.floor(Math.random() * 110);

  // Auto fallback logic if tokens exceed 95% of limit
  if (telemetry.tokensUsed > telemetry.tokensLimit * 0.95 && !telemetry.offlineFallbackActive) {
    telemetry.offlineFallbackActive = true;
    addLog("system", "warn", "Gemini API daily token threshold reached! Automatically switching model fallback engine to Offline Local LLM (Llama 3).");
  }
}, 3000);

function addLog(source: LogMessage['source'], level: LogMessage['level'], text: string) {
  const newLog: LogMessage = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    timestamp: new Date().toLocaleTimeString(),
    level,
    source,
    text
  };
  logs.push(newLog);
  if (logs.length > 200) logs.shift(); // Keep logs manageable
  return newLog;
}

// Evaluation helper: verifies current code contents against assertions
function evaluateTests(projectId: string): { tests: typeof projects[string]['tests']; allPassed: boolean } {
  const proj = projects[projectId];
  let allPassed = true;

  if (projectId === "project-1") {
    const calcContent = proj.files["src/calculator.ts"].content;
    proj.tests = proj.tests.map(test => {
      if (test.id === "calc-test-1") {
        return { ...test, status: "passed", actualOutput: "5" };
      }
      if (test.id === "calc-test-2") {
        return { ...test, status: "passed", actualOutput: "20" };
      }
      if (test.id === "calc-test-3") {
        // Evaluate division by zero bug
        const hasCheck = calcContent.includes("b === 0") || 
                         calcContent.includes("b == 0") || 
                         calcContent.includes("!b") || 
                         calcContent.includes("throw");
        const throwsError = hasCheck && calcContent.includes("Division by zero is undefined!");
        if (throwsError) {
          return { ...test, status: "passed", actualOutput: "Error: Division by zero is undefined!", errorMessage: undefined };
        } else {
          allPassed = false;
          return { 
            ...test, 
            status: "failed", 
            actualOutput: "Infinity", 
            errorMessage: "AssertionError: Expected division by zero to throw 'Error: Division by zero is undefined!', but it returned Infinity." 
          };
        }
      }
      return test;
    });
  } else if (projectId === "project-2") {
    const authContent = proj.files["src/auth.ts"].content;
    proj.tests = proj.tests.map(test => {
      if (test.id === "auth-test-1") {
        const hasCorrectCheck = authContent.includes("password.length < 8") && 
                                (authContent.includes("return false") || authContent.includes("throw")) &&
                                !authContent.includes("if (password.length < 8) {\n    return true;");
        const alternativeCorrect = authContent.includes("password.length >= 8") && authContent.includes("return true");
        const isFixed = hasCorrectCheck || alternativeCorrect || (authContent.includes("password.length") && !authContent.includes("return true;\n  }"));
        
        if (isFixed) {
          return { ...test, status: "passed", actualOutput: "false", errorMessage: undefined };
        } else {
          allPassed = false;
          return { 
            ...test, 
            status: "failed", 
            actualOutput: "true", 
            errorMessage: "SecurityError: password length < 8 allowed. short password validated as true!" 
          };
        }
      }
      if (test.id === "auth-test-2") {
        const usesEnvKey = authContent.includes("process.env.JWT_SECRET") || authContent.includes("process.env");
        if (usesEnvKey) {
          return { ...test, status: "passed", actualOutput: "token_user1_signed_with_env_secret", errorMessage: undefined };
        } else {
          allPassed = false;
          return { 
            ...test, 
            status: "failed", 
            actualOutput: "token_user1_signed_with_SECRET_KEY_123", 
            errorMessage: "SecurityError: Hardcoded secret key SECRET_KEY_123 detected in production token generation!" 
          };
        }
      }
      return test;
    });
  } else if (projectId === "project-3") {
    const parserContent = proj.files["src/parser.ts"].content;
    proj.tests = proj.tests.map(test => {
      if (test.id === "weather-test-1") {
        return { ...test, status: "passed", actualOutput: "12" };
      }
      if (test.id === "weather-test-2") {
        const hasCheck = parserContent.includes("payload.wind?.speed") || 
                         parserContent.includes("payload.wind &&") || 
                         parserContent.includes("typeof payload.wind") ||
                         parserContent.includes("wind: { speed: 0 }") ||
                         parserContent.includes("? payload.wind.speed : 0");
        if (hasCheck) {
          return { ...test, status: "passed", actualOutput: "0", errorMessage: undefined };
        } else {
          allPassed = false;
          return { 
            ...test, 
            status: "failed", 
            actualOutput: "undefined", 
            errorMessage: "TypeError: Cannot read properties of undefined (reading 'speed') at parseWindSpeed (src/parser.ts:11:21)" 
          };
        }
      }
      return test;
    });
  } else if (projectId === "project-4") {
    const encryptContent = proj.files["src/encrypt.ts"].content;
    const hasRustFfiComment = encryptContent.toLowerCase().includes("rust") || encryptContent.toLowerCase().includes("ffi") || encryptContent.toLowerCase().includes("cgo") || rustFfiApplied;
    const hasObjectPool = encryptContent.toLowerCase().includes("pool") || encryptContent.toLowerCase().includes("recycle") || memoryPoolEnabled;

    proj.tests = proj.tests.map(test => {
      if (test.id === "perf-test-1") {
        if (hasRustFfiComment) {
          return { ...test, status: "passed", actualOutput: "142 MB/s (via Rust FFI)", errorMessage: undefined };
        } else {
          allPassed = false;
          return {
            ...test,
            status: "failed",
            actualOutput: "12 MB/s",
            errorMessage: "Performance Bottleneck: Encryption speed is below the 100 MB/s threshold. Please re-write or optimize with Rust/C++ FFI bindings to avoid runtime overhead."
          };
        }
      }
      if (test.id === "leak-test-2") {
        if (hasObjectPool) {
          return { ...test, status: "passed", actualOutput: "0 bytes leak", errorMessage: undefined };
        } else {
          allPassed = false;
          return {
            ...test,
            status: "failed",
            actualOutput: "4.8 MB leak",
            errorMessage: "Heap leak detected: memory accumulation of 4.8MB per 100k packets. Use object pools and recycle buffers to avoid continuous heap allocations."
          };
        }
      }
      return test;
    });
  }

  return { tests: proj.tests, allPassed };
}

// AI generation using Gemini or offline mock simulation
async function callAIEngine(
  prompt: string, 
  fileContent: string, 
  filePath: string,
  useOffline: boolean
): Promise<{ explanation: string; updatedContent: string; diffSummary: string; tokensUsed: number }> {
  
  if (!useOffline) {
    const ai = getGeminiClient();
    if (ai) {
      try {
        addLog("gemini", "info", `Contacting Gemini API (model: gemini-3.5-flash) for file modification...`);
        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: `You are an expert full-stack coding assistant mimicking Aider Chat.
Your task is to modify the code in the file "${filePath}" to resolve the user's issue.

Current Content of "${filePath}":
\`\`\`typescript
${fileContent}
\`\`\`

User instructions / request:
"${prompt}"

Modify the code correctly, preserving original style, but strictly fixing bugs, typos, and security issues.
Return the result in raw JSON format matching this schema:
{
  "explanation": "Brief explanation of changes made.",
  "updatedContent": "Complete updated file content. Keep all code, only edit the needed parts.",
  "diffSummary": "Short summarized git diff style representation of additions/deletions."
}

Ensure your response is valid JSON and contains only that JSON structure.`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                explanation: { type: Type.STRING },
                updatedContent: { type: Type.STRING },
                diffSummary: { type: Type.STRING }
              },
              required: ["explanation", "updatedContent", "diffSummary"]
            }
          }
        });

        const text = response.text || "{}";
        const resObj = JSON.parse(text);
        
        // Simulating token count drop
        const calculatedTokens = Math.floor(prompt.length / 4) + Math.floor(fileContent.length / 4) + 600;
        telemetry.tokensUsed += calculatedTokens;
        telemetry.apiCost += (calculatedTokens / 1000) * 0.00015;

        return {
          explanation: resObj.explanation || "Modified file via Gemini AI API.",
          updatedContent: resObj.updatedContent || fileContent,
          diffSummary: resObj.diffSummary || "+ Modified lines.",
          tokensUsed: calculatedTokens
        };
      } catch (err: any) {
        addLog("gemini", "error", `Gemini API call failed: ${err.message}. Triggering automatic local fallback.`);
      }
    } else {
      addLog("system", "warn", `Gemini API Key missing in environment secrets. Automatically falling back to local/offline Llama 3 simulation.`);
    }
  }

  // Fallback / Offline simulation engine (performs actual regex code corrections on sample projects)
  addLog("local_model", "info", `Using local LLM [Llama 3] (offline mode). Analysing file...`);
  
  // Wait short delay to simulate offline inference latency
  await new Promise(resolve => setTimeout(resolve, 2000));

  let explanation = "Local Llama 3 Coder identified issue and applied fix.";
  let updatedContent = fileContent;
  let diffSummary = "";

  if (filePath.includes("calculator.ts")) {
    explanation = "Added check for division by zero to prevent Infinity outputs and satisfy testing assertions.";
    updatedContent = `export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

export function divide(a: number, b: number): number {
  if (b === 0) {
    throw new Error("Division by zero is undefined!");
  }
  return a / b;
}`;
    diffSummary = `-   return a / b;\n+   if (b === 0) {\n+     throw new Error("Division by zero is undefined!");\n+   }\n+   return a / b;`;
  } else if (filePath.includes("auth.ts")) {
    explanation = "Corrected password validation length threshold typo and migrated hardcoded JWT secret to environment variables.";
    updatedContent = `export function validatePassword(password: string): boolean {
  // Fixed typo to reject passwords shorter than 8 characters
  if (password.length < 8) {
    return false; 
  }
  return true;
}

export function generateToken(userId: string): string {
  // Migrated from insecure hardcoded token to environment variable
  const secret = process.env.JWT_SECRET || "fallback_secure_env_secret";
  return \`token_\${userId}_signed_with_\${secret}\`;
}`;
    diffSummary = `-   if (password.length < 8) {\n-     return true; \n-   }\n-   return false;\n+   if (password.length < 8) {\n+     return false; \n+   }\n+   return true;\n...\n-   const secret = "SECRET_KEY_123";\n+   const secret = process.env.JWT_SECRET || "fallback_secure_env_secret";`;
  } else if (filePath.includes("parser.ts")) {
    explanation = "Configured safe property access on the optional 'wind' attribute via optional chaining to prevent runtime crashes.";
    updatedContent = `export interface WeatherPayload {
  city: string;
  temp: number;
  wind?: {
    speed: number;
  };
}

export function parseWindSpeed(payload: WeatherPayload): number {
  // Added optional chaining check for optional wind parameters
  return payload.wind?.speed ?? 0;
}`;
    diffSummary = `-   return payload.wind.speed;\n+   return payload.wind?.speed ?? 0;`;
  } else if (filePath.includes("encrypt.ts")) {
    explanation = "Migrated encryption algorithm to high-performance Rust FFI / cgo-style architecture using pre-allocated object pools to prevent GC pauses and achieve peak throughput.";
    updatedContent = `// OPTIMIZED: Using pre-allocated object memory pools and low-level Rust FFI bindings
// This achieves zero garbage collection heap accumulation and peak throughput speeds of >140 MB/s.
import { loadRustXorAddon } from "./rust_bindings"; // Rust FFI import representation

const packetPool = new Array(50).fill(null).map(() => Buffer.alloc(4096)); // Object Pool

export function encryptBuffer(data: Buffer): Buffer {
  // Utilizing re-usable pooled buffers instead of continuous heap allocations
  const recycledBuffer = packetPool.pop() || Buffer.alloc(data.length);
  
  // Invoking Rust Compiled DLL/SO wrapper for high-speed bitwise operations
  const output = loadRustXorAddon(data, recycledBuffer);
  
  // Return the recycled buffer back to the pool once transmitted
  packetPool.push(recycledBuffer);
  
  return output;
}`;
    diffSummary = `- export function encryptBuffer(data: Buffer): Buffer {\n-   let output = Buffer.alloc(data.length);\n...\n+ import { loadRustXorAddon } from "./rust_bindings";\n+ const packetPool = new Array(50).fill(null).map(() => Buffer.alloc(4096));\n+ export function encryptBuffer(data: Buffer): Buffer {\n+   const recycledBuffer = packetPool.pop() || Buffer.alloc(data.length);\n+   const output = loadRustXorAddon(data, recycledBuffer);\n+   packetPool.push(recycledBuffer);`;
  } else {
    // Basic catch-all mock edit
    explanation = `Applied modification to ${filePath} to satisfy request: ${prompt}`;
    updatedContent = fileContent + `\n// Modified for instructions: ${prompt}`;
    diffSummary = `+ // Modified for instructions: ${prompt}`;
  }

  return {
    explanation,
    updatedContent,
    diffSummary,
    tokensUsed: 0 // Local models use local compute resources
  };
}

// API Routes

// Get state
app.get("/api/state", (req, res) => {
  res.json({
    projects,
    activeProjectId,
    tasks,
    logs,
    telemetry,
    modelConfigs,
    selectedModelId,
    isNightModeAutomationRunning,
    telegramConfig,
    currentTheme,
    memoryPoolEnabled,
    rustFfiApplied
  });
});

// Update theme
app.post("/api/theme/select", (req, res) => {
  const { theme } = req.body;
  if (['midnight', 'cyber', 'rose', 'rust_perf'].includes(theme)) {
    currentTheme = theme;
    addLog("system", "info", `UI Theme swapped to: ${theme.toUpperCase()}`);
    res.json({ success: true, currentTheme });
  } else {
    res.status(400).json({ error: "Invalid theme" });
  }
});

// Update Telegram config
app.post("/api/telegram/config", (req, res) => {
  const { botToken, chatId, enabled } = req.body;
  telegramConfig.botToken = botToken || "";
  telegramConfig.chatId = chatId || "";
  telegramConfig.enabled = !!enabled;
  if (telegramConfig.botToken && telegramConfig.chatId) {
    telegramConfig.status = "connected";
    addLog("system", "success", "Telegram Bot integrated successfully! Notifications are active.");
  } else {
    telegramConfig.status = "disconnected";
    addLog("system", "info", "Telegram configuration reset.");
  }
  res.json({ success: true, telegramConfig });
});

// Test Telegram notification
app.post("/api/telegram/test", (req, res) => {
  if (!telegramConfig.botToken || !telegramConfig.chatId) {
    return res.status(400).json({ error: "Telegram Bot token and Chat ID must be configured before testing." });
  }
  addLog("system", "info", `[Telegram Bot] Outgoing POST requested to https://api.telegram.org/bot${telegramConfig.botToken.substring(0, 5)}.../sendMessage`);
  addLog("system", "success", `[Telegram Bot] Message delivered safely to Chat ID: ${telegramConfig.chatId}!`);
  res.json({ success: true });
});

// Optimize: Memory pooling toggle
app.post("/api/project/memory-pool", (req, res) => {
  memoryPoolEnabled = !memoryPoolEnabled;
  addLog("system", "success", `Memory allocation pools ${memoryPoolEnabled ? "ACTIVATED" : "DEACTIVATED"}. ${memoryPoolEnabled ? "Recycling Buffer pools to prevent GC pauses." : "Standard transient allocations active."}`);
  evaluateTests(activeProjectId);
  res.json({ success: true, memoryPoolEnabled });
});

// Optimize: Rust FFI compile toggle
app.post("/api/project/rust-ffi", (req, res) => {
  const proj = projects[activeProjectId];
  // Find encryption file content or fallback to project files with type-safe properties
  const encryptFile = proj.files["src/encrypt.ts"] || Object.values(proj.files)[0] || { name: "encrypt.ts", path: "src/encrypt.ts", content: "", language: "typescript" };
  const currentHash = computeHash(encryptFile.content);

  if (rustFfiApplied) {
    rustFfiApplied = false;
    telemetry.pgoActive = false;
    telemetry.compileStatus = "idle";
    addLog("system", "info", "[CONTAINER DEPLOYER] Reverted encryption engine to Javascript virtual machine (V8 JIT).");
    return res.json({ success: true, rustFfiApplied, telemetry });
  }

  // Check VCS Cache
  if (lastCompiledHashes[activeProjectId] === currentHash) {
    telemetry.buildCacheHit = true;
    rustFfiApplied = true;
    telemetry.pgoActive = true;
    addLog("system", "success", `[VCS Build Cache] Hit - Skipping Rust FFI rebuild for ${encryptFile.name} (Hash: ${currentHash}). Exit Code: 0.`);
    addLog("system", "success", "[PROFILE-GUIDED OPTIMIZATION] Bound PGO-optimized Native Rust module compiled engine. Performance: 142 MB/s.");
    evaluateTests(activeProjectId);
    return res.json({ success: true, rustFfiApplied, telemetry });
  }

  // Otherwise, start async compilation container
  telemetry.compileStatus = "running";
  telemetry.buildCacheHit = false;
  addLog("system", "info", `[EVENT DAEMON] Spawned separate Rust compiling container thread (PID: ${Math.floor(Math.random() * 10000)})...`);
  addLog("system", "info", `[RUSTC BUILD] Compiling native module: ${encryptFile.name} with LLVM backend flags (-O3 --target=native)...`);

  setTimeout(() => {
    rustFfiApplied = true;
    telemetry.compileStatus = "completed";
    telemetry.pgoActive = true;
    lastCompiledHashes[activeProjectId] = currentHash;
    addLog("system", "success", `[RUSTC BUILD] Compilation completed! Native Shared Object (.so) linked with zero warnings. Exit Code: 0.`);
    addLog("system", "success", "[PROFILE-GUIDED OPTIMIZATION] PGO instrumentation profile collected. Low-level hot paths compiled into native instructions.");
    evaluateTests(activeProjectId);
  }, 1500);

  res.json({ success: true, rustFfiApplied: false, telemetry });
});

// Select active project
app.post("/api/project/select", (req, res) => {
  const { projectId } = req.body;
  if (!projects[projectId]) {
    return res.status(404).json({ error: "Project not found" });
  }
  activeProjectId = projectId;
  addLog("system", "info", `Switched active workspace to: "${projects[projectId].name}"`);
  res.json({ success: true, activeProjectId });
});

// Update file content manually (user editing)
app.post("/api/file/update", (req, res) => {
  const { filePath, content } = req.body;
  const proj = projects[activeProjectId];
  if (!proj || !proj.files[filePath]) {
    return res.status(404).json({ error: "File not found" });
  }
  
  const originalContent = proj.files[filePath].content;
  proj.files[filePath].content = content;
  
  addLog("system", "success", `Successfully updated file: "${filePath}" via code editor.`);
  
  // Automatically re-evaluate tests
  evaluateTests(activeProjectId);
  
  res.json({ success: true, files: proj.files });
});

// Trigger a new Aider Coding Task
app.post("/api/task/create", async (req, res) => {
  const { prompt, modelId, forceOffline } = req.body;
  const proj = projects[activeProjectId];
  
  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  const modelChoice = modelId || selectedModelId;
  const isModelOffline = forceOffline || telemetry.offlineFallbackActive || modelConfigs.find(m => m.id === modelChoice)?.type === "offline";

  // Create Task
  const taskId = `task-${Date.now()}`;
  const newTask: AiderTask = {
    id: taskId,
    projectId: activeProjectId,
    prompt,
    status: "pending",
    progress: 0,
    logs: [`[PENDING] Aider task received. Enqueued into work pipeline.`],
    modelUsed: modelChoice,
    isOffline: isModelOffline,
    createdAt: new Date().toISOString(),
    targetFiles: Object.keys(proj.files)
  };

  tasks.push(newTask);
  addLog("aider", "info", `Enqueued Aider parallel worker [${taskId}]: "${prompt.substring(0, 50)}..."`);

  // Start executing the task in background
  executeTaskInBackground(taskId);

  res.json({ success: true, task: newTask });
});

// Manually execute/run tests asynchronously
app.post("/api/project/run-tests", (req, res) => {
  if (telemetry.testRunnerStatus === "running") {
    return res.status(400).json({ error: "Test runner is already executing." });
  }

  telemetry.testRunnerStatus = "running";
  addLog("test", "info", `[EVENT DAEMON] Triggered separate container test runner for project: "${projects[activeProjectId].name}" (Exit Code pending)`);

  const proj = projects[activeProjectId];
  proj.tests = proj.tests.map(t => ({ ...t, status: 'running' }));

  setTimeout(() => {
    const result = evaluateTests(activeProjectId);
    if (result.allPassed) {
      telemetry.testRunnerStatus = "completed";
      addLog("test", "success", `[EVENT DAEMON] Container pipeline completed successfully. Exit Code: 0.`);
      
      if (telegramConfig.enabled && telegramConfig.status === "connected") {
        addLog("system", "success", `[Telegram Bot] 🚀 Success Alert: All tests passed on "${proj.name}"!`);
      }
    } else {
      telemetry.testRunnerStatus = "failed";
      addLog("test", "error", `[EVENT DAEMON] Container pipeline found unit test failures. Exit Code: 1.`);
      
      if (telegramConfig.enabled && telegramConfig.status === "connected") {
        addLog("system", "warn", `[Telegram Bot] ⚠️ Failure Alert: Unit tests failing on "${proj.name}".`);
      }
    }
  }, 1200);

  res.json({ success: true, telemetry, tests: proj.tests });
});

// Toggle Aider Night Automation / Auto-correction Mode
app.post("/api/automation/toggle", (req, res) => {
  isNightModeAutomationRunning = !isNightModeAutomationRunning;
  telemetry.isNightMode = isNightModeAutomationRunning;

  addLog("system", "info", `Night Automation Loop ${isNightModeAutomationRunning ? "ACTIVATED" : "DEACTIVATED"}.`);
  
  if (isNightModeAutomationRunning) {
    runNightAutomationCycle();
  }

  res.json({ success: true, isNightModeAutomationRunning });
});

// Toggle global model choice
app.post("/api/model/select", (req, res) => {
  const { modelId } = req.body;
  if (!modelConfigs.some(m => m.id === modelId)) {
    return res.status(400).json({ error: "Invalid model selection" });
  }
  selectedModelId = modelId;
  telemetry.offlineFallbackActive = modelConfigs.find(m => m.id === modelId)?.type === "offline";
  addLog("system", "info", `Switched active AI coding backend to: ${selectedModelId}`);
  res.json({ success: true, selectedModelId });
});

// Trigger a reset of all projects to baseline bugs
app.post("/api/project/reset", (req, res) => {
  // Reload baseline values
  projects["project-1"].files["src/calculator.ts"].content = `export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

export function divide(a: number, b: number): number {
  // BUG: b is not checked for 0, returns Infinity
  return a / b;
}`;
  projects["project-1"].tests.forEach(t => t.status = "idle");

  projects["project-2"].files["src/auth.ts"].content = `export function validatePassword(password: string): boolean {
  // BUG: Typo '< 8' instead of '>= 8'. Currently allows short passwords!
  if (password.length < 8) {
    return true; 
  }
  return false;
}

export function generateToken(userId: string): string {
  // BUG: Uses insecure, hardcoded secret key instead of process.env.JWT_SECRET
  const secret = "SECRET_KEY_123";
  return \`token_\${userId}_signed_with_\${secret}\`;
}`;
  projects["project-2"].tests.forEach(t => t.status = "idle");

  projects["project-3"].files["src/parser.ts"].content = `export interface WeatherPayload {
  city: string;
  temp: number;
  wind?: {
    speed: number;
  };
}

export function parseWindSpeed(payload: WeatherPayload): number {
  // BUG: Accesses wind.speed directly without checking if wind attribute exists. Throws TypeError if wind is undefined.
  return payload.wind.speed;
}`;
  projects["project-3"].tests.forEach(t => t.status = "idle");

  tasks = [];
  addLog("system", "success", "Reset virtual workspace to original baseline state. All test cases reset to idle.");
  res.json({ success: true, projects });
});

// Helper: Processes Aider coding task in background
async function executeTaskInBackground(taskId: string) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  task.status = "running";
  task.progress = 10;
  task.logs.push(`[10%] Aider parallel worker active. Spinning up background container thread.`);
  task.logs.push(`[15%] Selecting model: ${task.modelUsed} (${task.isOffline ? 'Offline Fallback' : 'Online API'}).`);

  await new Promise(resolve => setTimeout(resolve, 1000));
  task.progress = 30;
  task.logs.push(`[30%] Performing workspace file catalog index... Found target files.`);

  // Load target file
  const proj = projects[task.projectId];
  const targetFileKey = Object.keys(proj.files).find(k => k.endsWith(".ts")) || Object.keys(proj.files)[0];
  const fileToEdit = proj.files[targetFileKey];

  task.logs.push(`[40%] Analyzing file: ${fileToEdit.path} with instructions: "${task.prompt.substring(0, 30)}..."`);
  await new Promise(resolve => setTimeout(resolve, 1500));

  task.progress = 60;
  task.logs.push(`[60%] Generating patch file and structural diffs using AI engine...`);

  try {
    const aiResult = await callAIEngine(
      task.prompt, 
      fileToEdit.content, 
      fileToEdit.path, 
      task.isOffline
    );

    const originalContent = fileToEdit.content;
    fileToEdit.content = aiResult.updatedContent;

    task.diffs = [{
      filePath: fileToEdit.path,
      original: originalContent,
      updated: aiResult.updatedContent
    }];

    task.progress = 80;
    task.logs.push(`[80%] Code patch generated successfully.`);
    task.logs.push(`[85%] Applying diff patch to ${fileToEdit.path}...`);
    task.logs.push(`[90%] Explanation: ${aiResult.explanation}`);

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Run tests automatically
    task.logs.push(`[95%] Automatically invoking project test runners to verify changes...`);
    const testResults = evaluateTests(task.projectId);
    
    if (testResults.allPassed) {
      task.status = "completed";
      task.progress = 100;
      task.logs.push(`[100%] All tests passed! Modification successfully verified and committed.`);
      addLog("aider", "success", `Aider task [${taskId}] completed successfully! Code updated in "${fileToEdit.path}".`);
    } else {
      task.status = "failed";
      task.progress = 100;
      task.logs.push(`[100%] Modification applied, but some tests failed! Manual review or auto-correction needed.`);
      addLog("aider", "warn", `Aider task [${taskId}] applied code patch, but test suites failed.`);
    }

    task.completedAt = new Date().toISOString();

  } catch (error: any) {
    task.status = "failed";
    task.progress = 100;
    task.logs.push(`[ERROR] Task execution encountered crash: ${error.message}`);
    addLog("aider", "error", `Aider Task [${taskId}] failed with runtime error: ${error.message}`);
  }
}

// Night Automation / Auto-correction Loop Routine
async function runNightAutomationCycle() {
  if (!isNightModeAutomationRunning) return;

  const proj = projects[activeProjectId];
  addLog("system", "info", `[NIGHT AUTOMATION] Scanning "${proj.name}" workspace for failing tests...`);
  
  // Baseline evaluation
  const evaluation = evaluateTests(activeProjectId);
  const failingTests = evaluation.tests.filter(t => t.status === "failed");

  if (failingTests.length === 0) {
    addLog("system", "success", `[NIGHT AUTOMATION] All tests are green! No errors found. System idle and monitoring...`);
    // Check again in 10 seconds
    setTimeout(runNightAutomationCycle, 10000);
    return;
  }

  const firstFailing = failingTests[0];
  addLog("system", "warn", `[NIGHT AUTOMATION] Found failing test: "${firstFailing.name}". Error: "${firstFailing.errorMessage || 'Unknown error'}". Initiating automated AI self-correction loop.`);

  // Auto formulate corrective prompt
  const targetFileKey = Object.keys(proj.files).find(k => k.endsWith(".ts")) || Object.keys(proj.files)[0];
  const correctivePrompt = `Fix the file ${targetFileKey} so that the test case "${firstFailing.name}" passes. Expected output: "${firstFailing.expectedOutput}". Error log: "${firstFailing.errorMessage || ''}". Make sure to address this completely.`;

  // Create corrective task
  const taskId = `task-autofix-${Date.now()}`;
  const newTask: AiderTask = {
    id: taskId,
    projectId: activeProjectId,
    prompt: correctivePrompt,
    status: "pending",
    progress: 0,
    logs: [`[PENDING] Night Mode automation triggered corrective worker.`],
    modelUsed: selectedModelId,
    isOffline: telemetry.offlineFallbackActive,
    createdAt: new Date().toISOString(),
    targetFiles: [targetFileKey]
  };

  tasks.push(newTask);
  addLog("aider", "info", `[NIGHT AUTOMATION] Spawned auto-correction task [${taskId}] for failing test "${firstFailing.name}".`);

  // Execute task
  await executeTaskInBackground(taskId);

  // Cool down before next scan
  await new Promise(resolve => setTimeout(resolve, 4000));
  
  // Loop back if night automation is still enabled
  runNightAutomationCycle();
}

// Start Server Setup
async function startServer() {
  // Vite setup for dynamic frontend bundling
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Aider-GUI Server is running on port ${PORT}`);
  });
}

startServer();
