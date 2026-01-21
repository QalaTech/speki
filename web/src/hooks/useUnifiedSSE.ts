import { useEffect, useState } from 'react';
import type { RalphStatus, DecomposeState, PRDData, PeerFeedback } from '../types';

interface UnifiedSSEState {
  ralphStatus: RalphStatus | null;
  iterationLog: string;
  currentIteration: number | null;
  decomposeState: DecomposeState | null;
  prdData: PRDData | null;
  peerFeedback: PeerFeedback | null;
  connectionStatus: 'connecting' | 'connected' | 'error' | 'disconnected';
  error: string | null;
}

export function useUnifiedSSE(projectPath: string | null): UnifiedSSEState {
  const [state, setState] = useState<UnifiedSSEState>({
    ralphStatus: null,
    iterationLog: '',
    currentIteration: null,
    decomposeState: null,
    prdData: null,
    peerFeedback: null,
    connectionStatus: 'disconnected',
    error: null,
  });

  useEffect(() => {
    if (!projectPath) return;

    const url = `/api/events/all?project=${encodeURIComponent(projectPath)}`;
    const es = new EventSource(url);

    es.onopen = () => {
      setState(prev => ({ ...prev, connectionStatus: 'connected', error: null }));
    };

    // Ralph events
    es.addEventListener('ralph/status', (e: MessageEvent) => {
      const payload = JSON.parse(e.data);
      setState(prev => ({ ...prev, ralphStatus: payload.data.status }));
    });

    es.addEventListener('ralph/iteration-start', (e: MessageEvent) => {
      const payload = JSON.parse(e.data);
      setState(prev => ({
        ...prev,
        currentIteration: payload.data.iteration,
        iterationLog: '' // Clear log for new iteration
      }));
    });

    es.addEventListener('ralph/log', (e: MessageEvent) => {
      const payload = JSON.parse(e.data);
      setState(prev => ({
        ...prev,
        iterationLog: prev.iterationLog + payload.data.line
      }));
    });

    es.addEventListener('ralph/iteration-end', () => {
      // Keep the log and iteration number when iteration ends
    });

    es.addEventListener('ralph/connected', () => {
      // Initial connection event
    });

    // Decompose events
    es.addEventListener('decompose/state', (e: MessageEvent) => {
      const payload = JSON.parse(e.data);
      setState(prev => ({ ...prev, decomposeState: payload.data }));
    });

    es.addEventListener('decompose/log', () => {
      // Log events - could be added to state if needed
    });

    es.addEventListener('decompose/connected', () => {
      // Initial connection event
    });

    // Tasks events
    es.addEventListener('tasks/snapshot', (e: MessageEvent) => {
      const payload = JSON.parse(e.data);
      setState(prev => ({ ...prev, prdData: payload.data }));
    });

    es.addEventListener('tasks/updated', (e: MessageEvent) => {
      const payload = JSON.parse(e.data);
      setState(prev => ({ ...prev, prdData: payload.data }));
    });

    // Peer feedback events
    es.addEventListener('peer-feedback/snapshot', (e: MessageEvent) => {
      const payload = JSON.parse(e.data);
      setState(prev => ({ ...prev, peerFeedback: payload.data }));
    });

    es.addEventListener('peer-feedback/updated', (e: MessageEvent) => {
      const payload = JSON.parse(e.data);
      setState(prev => ({ ...prev, peerFeedback: payload.data }));
    });

    // Spec review events (for completeness, though App.tsx may not use these)
    es.addEventListener('spec-review/status', () => {
      // Could add to state if needed
    });

    es.addEventListener('spec-review/result', () => {
      // Could add to state if needed
    });

    es.addEventListener('spec-review/complete', () => {
      // Could add to state if needed
    });

    es.addEventListener('spec-review/chat-stream', () => {
      // Could add to state if needed
    });

    es.addEventListener('spec-review/log', () => {
      // Could add to state if needed
    });

    es.addEventListener('spec-review/connected', () => {
      // Initial connection event
    });

    es.onerror = () => {
      setState(prev => ({ ...prev, connectionStatus: 'error', error: 'Connection lost' }));
      es.close();
    };

    return () => {
      es.close();
    };
  }, [projectPath]);

  return state;
}
