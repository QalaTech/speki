import { useEffect, useState } from 'react';
import type { DecomposeState } from '../types';

/**
 * SSE subscription hook for decompose state.
 * Used by SpecDecomposeTab to track decomposition progress.
 *
 * @param projectPath - The project path to subscribe to. If null, no subscription is made.
 */
export function useDecomposeSSE(projectPath: string | null): DecomposeState | null {
  const [decomposeState, setDecomposeState] = useState<DecomposeState | null>(null);

  useEffect(() => {
    if (!projectPath) return;

    // SSR check
    if (typeof window === 'undefined' || !('EventSource' in window)) {
      return;
    }

    const url = `/api/events/all?project=${encodeURIComponent(projectPath)}`;
    const eventSource = new EventSource(url);

    // Decompose state event
    eventSource.addEventListener('decompose/state', (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data);
        setDecomposeState(payload.data);
      } catch (err) {
        console.error('[useDecomposeSSE] Error processing decompose/state:', err);
      }
    });

    // Connection events (no action needed)
    eventSource.addEventListener('decompose/connected', () => {});
    eventSource.addEventListener('decompose/log', () => {});

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [projectPath]);

  return decomposeState;
}
