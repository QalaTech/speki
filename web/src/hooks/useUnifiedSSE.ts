import { useEffect, useState } from 'react';
import type { RalphStatus, DecomposeState, PRDData, PeerFeedback } from '../types';
import type { ParsedEntry } from '../utils/parseJsonl';

interface UnifiedSSEState {
  ralphStatus: RalphStatus | null;
  /** @deprecated Use logEntries instead */
  iterationLog: string;
  /** Structured log entries from SSE events */
  logEntries: ParsedEntry[];
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
    logEntries: [],
    currentIteration: null,
    decomposeState: null,
    prdData: null,
    peerFeedback: null,
    connectionStatus: 'disconnected',
    error: null,
  });

  useEffect(() => {
    if (!projectPath) return;

    // Reset state when project changes to avoid showing stale data
    setState({
      ralphStatus: null,
      iterationLog: '',
      logEntries: [],
      currentIteration: null,
      decomposeState: null,
      prdData: null,
      peerFeedback: null,
      connectionStatus: 'connecting',
      error: null,
    });

    const url = `/api/events/all?project=${encodeURIComponent(projectPath)}`;
    const es = new EventSource(url);

    es.onopen = () => {
      setState(prev => ({ ...prev, connectionStatus: 'connected', error: null }));
    };

    // Ralph events
    es.addEventListener('ralph/status', (e: MessageEvent) => {
      const payload = JSON.parse(e.data);
      const backendStatus = payload.data.status;
      // Transform backend status format to frontend format
      setState(prev => ({
        ...prev,
        ralphStatus: {
          ...backendStatus,
          running: backendStatus.status === 'running',
          currentIteration: backendStatus.currentIteration ?? 0,
          maxIterations: backendStatus.maxIterations ?? 0,
          currentStory: backendStatus.currentStory ?? null,
        }
      }));
    });

    es.addEventListener('ralph/iteration-start', (e: MessageEvent) => {
      const payload = JSON.parse(e.data);
      const { iteration, maxIterations, currentStory } = payload.data;
      setState(prev => ({
        ...prev,
        currentIteration: iteration,
        iterationLog: '', // Clear log for new iteration (deprecated)
        logEntries: [], // Clear entries for new iteration
        // Also update ralphStatus with current iteration info
        ralphStatus: prev.ralphStatus ? {
          ...prev.ralphStatus,
          running: true,
          currentIteration: iteration,
          maxIterations: maxIterations ?? prev.ralphStatus.maxIterations,
          currentStory: currentStory ?? null,
        } : prev.ralphStatus,
      }));
    });

    es.addEventListener('ralph/log', (e: MessageEvent) => {
      const payload = JSON.parse(e.data);
      const entry = payload.data as ParsedEntry;
      console.log('[SSE] ralph/log received:', entry.type, entry.content?.substring(0, 50));
      setState(prev => ({
        ...prev,
        // Append to logEntries array (structured format)
        logEntries: [...prev.logEntries, entry],
        // Also append to iterationLog for backwards compatibility
        iterationLog: prev.iterationLog + (entry.content || ''),
      }));
    });

    es.addEventListener('ralph/iteration-end', (e: MessageEvent) => {
      const payload = JSON.parse(e.data);
      const { allComplete } = payload.data;
      // If all tasks complete, mark as not running
      if (allComplete) {
        setState(prev => ({
          ...prev,
          ralphStatus: prev.ralphStatus ? {
            ...prev.ralphStatus,
            running: false,
            status: 'stopped' as const,
          } : prev.ralphStatus,
        }));
      }
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
