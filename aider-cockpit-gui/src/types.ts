export interface VirtualFile {
  name: string;
  path: string;
  content: string;
  language: string;
}

export interface UnitTest {
  id: string;
  name: string;
  description: string;
  status: 'passed' | 'failed' | 'idle' | 'running';
  assertCode: string; // The check logic description
  expectedOutput: string;
  actualOutput?: string;
  errorMessage?: string;
}

export interface VirtualProject {
  id: string;
  name: string;
  description: string;
  files: Record<string, VirtualFile>;
  tests: UnitTest[];
}

export interface AiderTask {
  id: string;
  projectId: string;
  prompt: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  logs: string[];
  modelUsed: string;
  isOffline: boolean;
  createdAt: string;
  completedAt?: string;
  targetFiles: string[];
  diffs?: { filePath: string; original: string; updated: string; diffSummary?: string }[];
}

export interface AutomationRun {
  id: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  iterations: number;
  maxIterations: number;
  logs: string[];
  currentTask?: string;
  successRate: number;
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
  status: 'connected' | 'disconnected' | 'testing';
}

export interface SystemTelemetry {
  cpuUsage: number;
  ramUsage: number;
  activeTasks: number;
  tokensUsed: number;
  tokensLimit: number;
  apiCost: number;
  offlineFallbackActive: boolean;
  isNightMode: boolean;
  networkSpeed: number; // KB/s
  // New properties
  ramWarningTriggered: boolean;
  performanceCritical: boolean;
  leakDetectionActive: boolean;
  testRunnerStatus: 'idle' | 'running' | 'completed' | 'failed';
  compileStatus: 'idle' | 'running' | 'completed' | 'failed';
  buildCacheHit: boolean;
  pgoActive: boolean;
}

export type UITheme = 'midnight' | 'cyber' | 'rose' | 'rust_perf';

export interface LogMessage {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error';
  source: 'system' | 'aider' | 'test' | 'local_model' | 'gemini';
  text: string;
}

export interface ModelConfig {
  name: string;
  id: string;
  type: 'online' | 'offline';
  provider: string;
  speed: string;
  contextWindow: string;
  status: 'available' | 'offline';
}
