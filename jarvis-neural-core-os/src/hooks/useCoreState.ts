import { useState, useEffect, useCallback, useRef } from 'react';
import { CoreState, CoreStatePayload } from '../types';
import { listen, emit } from '@tauri-apps/api/event';

/**
 * JARVIS Core State Hook.
 *
 * Manages the global core state and syncs with the Tauri backend
 * via v2 event system (listen/emit).
 */
export function useCoreState() {
  const [stateBundle, setStateBundle] = useState<{
    coreState: CoreState;
    payload: CoreStatePayload;
  }>({
    coreState: 'idle',
    payload: {
      state: 'idle',
      source: 'System Initialization',
      message: 'JARVIS Core Ready',
      timestamp: Date.now(),
    },
  });
  const [isTauriAvailable, setIsTauriAvailable] = useState<boolean>(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const setCoreState = useCallback(async (newState: CoreState, source = 'User Action', message = '') => {
    const newPayload: CoreStatePayload = {
      state: newState,
      source,
      message: message || `Core state shifted to ${newState.toUpperCase()}`,
      timestamp: Date.now(),
    };

    setStateBundle({ coreState: newState, payload: newPayload });

    // Fire-and-forget: notify backend server
    fetch('/api/core-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newPayload),
    }).catch(() => {});

    // Tauri event (fire-and-forget)
    if (isTauriAvailable) {
      emit('core-state', newPayload).catch(() => {});
    }

    // DOM event for non-Tauri consumers
    setTimeout(() => {
      if (mountedRef.current) {
        window.dispatchEvent(new CustomEvent('jarvis-core-state', { detail: newPayload }));
      }
    }, 0);
  }, [isTauriAvailable]);

  // ── Tauri v2 event listeners ──
  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    const setup = async () => {
      try {
        setIsTauriAvailable(true);

        const unlistenCore = await listen<CoreStatePayload>('core-state', (event) => {
          if (event.payload?.state) {
            setStateBundle({
              coreState: event.payload.state,
              payload: event.payload,
            });
          }
        });
        unlisteners.push(unlistenCore);

        const unlistenAssistant = await listen<{ state: string; message: string }>(
          'assistant-state',
          (event) => {
            if (event.payload?.state) {
              setCoreState(
                event.payload.state as CoreState,
                'Voice Engine',
                event.payload.message || ''
              );
            }
          }
        );
        unlisteners.push(unlistenAssistant);

        console.log('[useCoreState] Tauri v2 listeners ready');
      } catch {
        setIsTauriAvailable(false);
        console.log('[useCoreState] Tauri not available (browser mode)');
      }
    };

    setup();

    const handleDomEvent = (e: Event) => {
      const evt = e as CustomEvent<CoreStatePayload>;
      if (evt.detail) {
        setStateBundle({ coreState: evt.detail.state, payload: evt.detail });
      }
    };
    window.addEventListener('jarvis-core-state', handleDomEvent);

    return () => {
      unlisteners.forEach((fn) => fn());
      window.removeEventListener('jarvis-core-state', handleDomEvent);
    };
  }, []);

  return {
    coreState: stateBundle.coreState,
    payload: stateBundle.payload,
    setCoreState,
    isTauriAvailable,
  };
}
