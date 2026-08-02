/**
 * Offline Speech-to-Text Hook — MediaRecorder API + Tauri whisper.cpp backend.
 *
 * Заменяет Web Speech API (который требует интернета/Google) на полностью
 * локальный офлайн-пайплайн:
 *
 *   1. MediaRecorder захватывает аудио с микрофона (WebM/Opus).
 *   2. При остановке Blob → ArrayBuffer → Uint8Array → Tauri invoke.
 *   3. Rust-бэкенд: ffmpeg → 16kHz WAV → whisper.cpp → текст.
 *
 * Использование:
 *   const { isListening, start, stop, isSupported, error, audioLevel } = useOfflineVoiceRecognition();
 *   const text = await stop(); // возвращает распознанный текст
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface OfflineVoiceState {
  isListening: boolean;
  isSupported: boolean;
  error: string | null;
  audioLevel: number; // 0..1 для визуализации
}

function checkMediaSupport(): boolean {
  return !!(
    typeof window !== 'undefined' &&
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  );
}

export function useOfflineVoiceRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const isMountedRef = useRef(true);

  const isSupported = checkMediaSupport();

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopAudioAnalysis();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startAudioAnalysis = useCallback((stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const loop = () => {
        if (!isMountedRef.current) return;
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          const level = Math.min(1, Math.max(0, avg / 180));
          setAudioLevel(level);
        }
        animFrameRef.current = requestAnimationFrame(loop);
      };

      animFrameRef.current = requestAnimationFrame(loop);
    } catch {
      // AudioContext может не поддерживаться
    }
  }, []);

  function stopAudioAnalysis() {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }

  const start = useCallback(async () => {
    if (!isSupported) {
      setError('MediaRecorder API не поддерживается в этом браузере');
      return;
    }

    setError(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      });

      streamRef.current = stream;

      let mimeType = 'audio/webm;codecs=opus';
      for (const mt of [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
      ]) {
        if (MediaRecorder.isTypeSupported(mt)) {
          mimeType = mt;
          break;
        }
      }

      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 64000,
      });

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onerror = (e: Event) => {
        const err = e as ErrorEvent;
        setError(`Ошибка записи: ${err.message || 'неизвестная ошибка'}`);
        setIsListening(false);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsListening(true);

      startAudioAnalysis(stream);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Не удалось получить доступ к микрофону';
      setError(
        `🎤 ${msg}. Проверьте разрешения микрофона в настройках системы (Fedora: Settings → Privacy → Microphone).`,
      );
      setIsListening(false);
    }
  }, [isSupported, startAudioAnalysis]);

  const stop = useCallback(async (): Promise<string> => {
    return new Promise((resolve) => {
      if (
        !mediaRecorderRef.current ||
        mediaRecorderRef.current.state === 'inactive'
      ) {
        setIsListening(false);
        stopAudioAnalysis();
        resolve('');
        return;
      }

      mediaRecorderRef.current.onstop = async () => {
        stopAudioAnalysis();

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }

        const blob = new Blob(chunksRef.current, {
          type: mediaRecorderRef.current?.mimeType || 'audio/webm',
        });

        if (blob.size < 100) {
          setIsListening(false);
          resolve('');
          return;
        }

        try {
          const arrayBuffer = await blob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          const audioArray: number[] = Array.from(uint8Array);

          const result = await invoke<string>('transcribe_audio', {
            audioBytes: audioArray,
          });

          setIsListening(false);
          resolve(result);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error('[OfflineSTT]', errMsg);
          setError(`Ошибка распознавания: ${errMsg}`);
          setIsListening(false);
          resolve('');
        }
      };

      mediaRecorderRef.current.stop();
    });
  }, []);

  return {
    isListening,
    isSupported,
    error,
    audioLevel,
    start,
    stop,
  };
}
