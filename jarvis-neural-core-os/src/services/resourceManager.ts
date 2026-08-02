/**
 * JARVIS Local Resource Manager Service
 * ======================================
 * Фронтенд-сервис для управления динамическим реестром личных ресурсов.
 *
 * Все ресурсы типа "local_only" обрабатываются исключительно локально
 * через Ollama и никогда не отправляются в облачные API (OpenRouter).
 */

import { invoke } from '@tauri-apps/api/core';

// ── Type Definitions ──────────────────────────────────────────

export interface LocalResource {
  name: string;
  aliases: string[];
  handler_script: string | null;
  type: string;
  description: string | null;
  added_at: string | null;
}

// ── Resource API ──────────────────────────────────────────────

export async function listResources(): Promise<LocalResource[]> {
  try {
    return await invoke<LocalResource[]>('list_local_resources');
  } catch (err) {
    console.error('[ResourceManager] listResources failed:', err);
    return [];
  }
}

export async function findResource(query: string): Promise<LocalResource | null> {
  try {
    return await invoke<LocalResource | null>('find_local_resource', { query });
  } catch (err) {
    console.error('[ResourceManager] findResource failed:', err);
    return null;
  }
}

export async function isLocalQuery(query: string): Promise<boolean> {
  try {
    return await invoke<boolean>('check_is_local_resource', { query });
  } catch (err) {
    console.error('[ResourceManager] isLocalQuery failed:', err);
    return false;
  }
}

export async function addResource(
  name: string,
  aliases: string[],
  handlerScript?: string,
  resourceType?: string,
  description?: string,
): Promise<LocalResource> {
  return await invoke<LocalResource>('add_local_resource', {
    name,
    aliases,
    handlerScript: handlerScript || null,
    resourceType: resourceType || 'local_only',
    description: description || null,
  });
}

export async function removeResource(name: string): Promise<string> {
  return await invoke<string>('remove_local_resource', { name });
}

export async function exportResources(): Promise<string> {
  return await invoke<string>('export_resources');
}

export async function importResources(json: string): Promise<string> {
  return await invoke<string>('import_resources', { json });
}

export async function executeResourceHandler(
  resourceName: string,
  userQuery: string,
): Promise<string> {
  return await invoke<string>('execute_resource_handler', {
    resourceName,
    userQuery,
  });
}

export async function executeLocalScript(
  scriptPath: string,
  args: string[],
): Promise<string> {
  return await invoke<string>('execute_local_script', { scriptPath, args });
}

// ── AI Commands ───────────────────────────────────────────────

export async function askLocalOnly(prompt: string): Promise<string> {
  return await invoke<string>('ask_local_only', { prompt });
}

// ── Browser Commands ──────────────────────────────────────────

export async function browserOpen(url: string): Promise<string> {
  return await invoke<string>('browser_open', { url });
}

export async function browserFetch(url: string, selector?: string): Promise<string> {
  return await invoke<string>('browser_fetch', { url, selector: selector || null });
}

export async function browserClick(url: string, selector: string): Promise<string> {
  return await invoke<string>('browser_click', { url, selector });
}

export async function browserSearch(
  url: string,
  inputSelector: string,
  query: string,
): Promise<string> {
  return await invoke<string>('browser_search', { url, inputSelector, query });
}

export async function browserScreenshot(url: string): Promise<string> {
  return await invoke<string>('browser_screenshot', { url });
}

export async function browserShutdown(): Promise<string> {
  return await invoke<string>('browser_shutdown');
}

export async function browserStatus(): Promise<boolean> {
  return await invoke<boolean>('browser_status');
}

// ── Shell / File Commands ─────────────────────────────────────

export async function executeShell(command: string): Promise<string> {
  return await invoke<string>('execute_shell', { command });
}

export async function createFileWithContent(
  path: string,
  content: string,
): Promise<string> {
  return await invoke<string>('create_file_with_content', { path, content });
}

export async function runAiderTask(taskPrompt: string): Promise<string> {
  return await invoke<string>('run_aider_task', { taskPrompt });
}

// ── System Metrics ────────────────────────────────────────────

export interface SystemMetrics {
  cpu: number;
  ram: number;
  gpu: number | null;
  cpu_temp: number | null;
  uptime: number;
  processes: number;
  load_avg: number[];
}

export async function getSystemMetrics(): Promise<SystemMetrics> {
  return await invoke<SystemMetrics>('get_system_metrics');
}

// ── Agent Commands ────────────────────────────────────────────

export interface AgentStatus {
  state: string;
  tasks_completed: number;
  tasks_failed: number;
  current_task: any | null;
  queue_size: number;
  uptime_secs: number;
}

export async function agentSubmitTask(prompt: string, mode: string): Promise<string> {
  return await invoke<string>('agent_submit_task', { prompt, mode });
}

export async function agentGetStatus(): Promise<AgentStatus> {
  return await invoke<AgentStatus>('agent_get_status');
}

export async function agentShutdown(): Promise<string> {
  return await invoke<string>('agent_shutdown');
}

export async function askEngineering(prompt: string): Promise<string> {
  return await invoke<string>('ask_engineering', { prompt });
}

export async function askResearch(prompt: string): Promise<string> {
  return await invoke<string>('ask_research', { prompt });
}
