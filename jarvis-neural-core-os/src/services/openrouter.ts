/**
 * JARVIS AI Integration Service
 * 
 * Поддерживает:
 *   - OpenRouter API (облачный) через Tauri-команду ask_openrouter
 *   - Ollama (локальный) через Tauri-команду ask_ollama
 *   - Умный роутер ask_ai: сначала Ollama, fallback → OpenRouter
 *   - Диагностика всех систем: jarvis_diagnostic
 */

import { invoke } from '@tauri-apps/api/core';

export interface OpenRouterResult {
  text: string;
  model?: string;
}

// ═══════════════════════════════════════════════════════
// DIAGNOSTIC
// ═══════════════════════════════════════════════════════

export interface DiagnosticItem {
  available: boolean;
  details: string;
  fix: string;
}

export interface DiagnosticReport {
  timestamp: string;
  hostname: string;
  system: {
    os: string;
    cpu_cores: number;
    ram_total_gb: string;
    uptime: string;
  };
  ollama: DiagnosticItem;
  openrouter: DiagnosticItem;
  whisper: DiagnosticItem;
  piper_tts: DiagnosticItem;
  obsidian_vault: DiagnosticItem;
  browser: DiagnosticItem;
  aider: DiagnosticItem;
  rust_modules: Record<string, boolean>;
  total_score: string; // "OK" | "WARN" | "BROKEN"
}

export async function runDiagnostic(): Promise<DiagnosticReport> {
  return invoke<DiagnosticReport>('jarvis_diagnostic');
}

/**
 * Отправляет промпт к LLM через OpenRouter API (Rust backend).
 * @param prompt - текстовый запрос пользователя
 * @returns ответ модели в виде строки
 */
export async function askOpenRouter(prompt: string): Promise<string> {
  try {
    const result = await invoke<string>('ask_openrouter', { prompt });
    return result;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const lower = errMsg.toLowerCase();

    if (lower.includes('openrouter_api_key') || lower.includes('не найден') || lower.includes('невалидное')) {
      throw new Error(
        '🔑 API-ключ OpenRouter не настроен.\n' +
        'Создайте файл .env в папке src-tauri/ с содержимым:\n' +
        'OPENROUTER_API_KEY=sk-or-v1-ваш-ключ\n' +
        'Получить ключ: https://openrouter.ai/keys'
      );
    }
    if (lower.includes('401') || lower.includes('авторизац') || lower.includes('неверный')) {
      throw new Error('🔐 Ошибка авторизации OpenRouter. Проверьте API-ключ на openrouter.ai/keys');
    }
    if (lower.includes('402') || lower.includes('баланс') || lower.includes('payment')) {
      throw new Error('💰 Недостаточно средств на балансе OpenRouter. Пополните счёт: openrouter.ai/credits');
    }
    if (lower.includes('429') || lower.includes('слишком много')) {
      throw new Error('⏳ Слишком много запросов. Подождите несколько секунд и попробуйте снова.');
    }
    if (lower.includes('таймаут') || lower.includes('timeout')) {
      throw new Error('⏱️ Таймаут запроса. Проверьте интернет-соединение и повторите.');
    }
    if (lower.includes('подключ') || lower.includes('connect') || lower.includes('сетевая')) {
      throw new Error('🌐 Нет соединения с OpenRouter API. Проверьте интернет.');
    }
    if (lower.includes('пустой ответ') || lower.includes('нет content')) {
      throw new Error('🤖 Модель вернула пустой ответ. Попробуйте переформулировать запрос.');
    }
    throw new Error(`❌ Ошибка OpenRouter: ${errMsg}`);
  }
}

/**
 * Отправляет промпт к локальной LLM через Ollama (Rust backend).
 * @param prompt - текстовый запрос пользователя
 * @returns ответ модели в виде строки
 */
export async function askOllama(prompt: string): Promise<string> {
  try {
    const result = await invoke<string>('ask_ollama', { prompt });
    return result;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const lower = errMsg.toLowerCase();

    if (lower.includes('not running') || lower.includes('ollama serve')) {
      throw new Error(
        '🖥️ Ollama не запущен.\n' +
        'Запустите сервер: ollama serve\n' +
        'Затем скачайте модель: ollama pull llama3.2'
      );
    }
    if (lower.includes('timeout') || lower.includes('таймаут')) {
      throw new Error('⏱️ Ollama не успевает ответить. Возможно, модель слишком большая для CPU.');
    }
    if (lower.includes('connect') || lower.includes('подключ')) {
      throw new Error('🔌 Не удалось подключиться к Ollama. Проверьте: ollama serve');
    }
    if (lower.includes('пустой ответ') || lower.includes('empty')) {
      throw new Error('🤖 Ollama вернула пустой ответ.');
    }
    throw new Error(`🖥️ Ошибка Ollama: ${errMsg}`);
  }
}

/**
 * Умный роутер: сначала пробует локальную Ollama, при недоступности — OpenRouter.
 * Это основной метод для получения ответа от AI.
 * @param prompt - текстовый запрос пользователя
 * @returns ответ модели в виде строки
 */
export async function askAi(prompt: string): Promise<string> {
  try {
    const result = await invoke<string>('ask_ai', { prompt });
    return result;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    throw new Error(`❌ Все AI-провайдеры недоступны:\n${errMsg}`);
  }
}

/**
 * Базовая проверка доступности OpenRouter API.
 */
export async function checkOpenRouterConnection(): Promise<{ ok: boolean; latencyMs?: number }> {
  const start = performance.now();
  try {
    await invoke<string>('ask_openrouter', { prompt: 'ping' });
    const latencyMs = Math.round(performance.now() - start);
    return { ok: true, latencyMs };
  } catch {
    return { ok: false };
  }
}

/**
 * Проверка доступности Ollama.
 */
export async function checkOllamaConnection(): Promise<{ ok: boolean; latencyMs?: number; models?: string[] }> {
  const start = performance.now();
  try {
    const result = await invoke<string>('ask_ollama', { prompt: 'ping' });
    const latencyMs = Math.round(performance.now() - start);
    return { ok: true, latencyMs };
  } catch {
    return { ok: false };
  }
}
