/**
 * Hybrid TTS Service
 *
 * Вызывает Tauri-команду speak_response (Rust backend).
 *
 * Пайплайн:
 *   1. ElevenLabs API (если настроен) → возвращает Base64 MP3
 *   2. Локальный: Piper → Applio RVC → aplay (голос Джарвиса)
 *
 * Обе ветки обрабатываются в Rust-бэкенде.
 */

import { invoke } from '@tauri-apps/api/core';

/**
 * Озвучивает переданный текст через гибридную TTS-систему.
 *
 * @param text — текст для озвучки (обычно ответ от OpenRouter/LLM)
 */
export async function speakText(text: string): Promise<void> {
  if (!text || !text.trim()) return;

  try {
    // speak_response — основной TTS-пайплайн (Piper → RVC → aplay)
    // Блокирует invoke до завершения воспроизведения aplay
    const result = await invoke<string>('speak_response', { text: text.trim() });

    if (result === 'LOCAL_RVC_USED') {
      // Локальный пайплайн уже воспроизвёл аудио через aplay — ничего не делаем
      console.log('[TTS] ✓ Локальный TTS (Piper→RVC→aplay) завершён');
      return;
    }

    // Иначе result — это Base64-строка с MP3-аудио от ElevenLabs
    if (result && result.length > 0) {
      const audio = new Audio(`data:audio/mp3;base64,${result}`);
      audio.volume = 0.9;

      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = (e) => {
          console.error('[TTS] Audio playback error:', e);
          reject(new Error('Audio playback failed'));
        };
        audio.play().catch((e) => {
          console.error('[TTS] Audio play() rejected:', e);
          reject(e);
        });
      });
      console.log('[TTS] ✓ ElevenLabs воспроизведение завершено');
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[TTS] speak_response failed:', errMsg);
    // Не пробрасываем ошибку — TTS не должен блокировать UI
  }
}
