import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { executionKeys } from '../api/keys';
import type { RalphStatus, PRDData, PeerFeedback } from '../../../types';
import type { ParsedEntry } from '../../../utils/parseJsonl';
import type { ConnectionStatus, ExecutionLogs } from '../api/queries';
import { defaultRalphStatus, defaultExecutionLogs } from '../api/queries';

/**
 * SSE subscription hook that keeps execution query caches updated.
 * Listens to /api/events/all for real-time updates and updates TanStack Query cache.
 *
 * @param project - The project path to subscribe to. If null, no subscription is made.
 */
export function useExecutionSSE(project: string | null): void {
  const queryClient = useQueryClient();
  const previousProjectRef = useRef<string | null>(null);

  useEffect(() => {
    if (!project) {
      return;
    }

    // SSR check
    if (typeof window === 'undefined' || !('EventSource' in window)) {
      return;
    }

    // Reset cache when project changes to avoid showing stale data
    if (previousProjectRef.current !== project) {
      queryClient.setQueryData(executionKeys.status(project), defaultRalphStatus);
      queryClient.setQueryData(executionKeys.logs(project), defaultExecutionLogs);
      queryClient.setQueryData(executionKeys.tasks(project), null);
      queryClient.setQueryData(executionKeys.peer(project), null);
      queryClient.setQueryData(executionKeys.connection(project), 'connecting' as ConnectionStatus);
      previousProjectRef.current = project;
    }

    const url = `/api/events/all?project=${encodeURIComponent(project)}`;
    const eventSource = new EventSource(url);

    // Connection opened
    eventSource.onopen = () => {
      queryClient.setQueryData(executionKeys.connection(project), 'connected' as ConnectionStatus);
    };

    // Ralph status event
    eventSource.addEventListener('ralph/status', (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data);
        const backendStatus = payload.data.status;
        const status: RalphStatus = {
          ...backendStatus,
          running: backendStatus.status === 'running',
          currentIteration: backendStatus.currentIteration ?? 0,
          maxIterations: backendStatus.maxIterations ?? 0,
          currentStory: backendStatus.currentStory ?? null,
        };
        queryClient.setQueryData(executionKeys.status(project), status);
      } catch (err) {
        console.error('[useExecutionSSE] Error processing ralph/status:', err);
      }
    });

    // Ralph iteration start event
    eventSource.addEventListener('ralph/iteration-start', (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data);
        const { iteration, maxIterations, currentStory } = payload.data;

        // Clear logs for new iteration
        queryClient.setQueryData(executionKeys.logs(project), {
          iterationLog: '',
          entries: [],
          currentIteration: iteration,
        } as ExecutionLogs);

        // Update status with iteration info
        queryClient.setQueryData(executionKeys.status(project), (prev: RalphStatus | undefined) => {
          const current = prev ?? defaultRalphStatus;
          return {
            ...current,
            running: true,
            currentIteration: iteration,
            maxIterations: maxIterations ?? current.maxIterations,
            currentStory: currentStory ?? null,
          };
        });
      } catch (err) {
        console.error('[useExecutionSSE] Error processing ralph/iteration-start:', err);
      }
    });

    // Ralph log event
    eventSource.addEventListener('ralph/log', (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data);
        const entry = payload.data as ParsedEntry;
        console.log('[SSE] ralph/log received:', entry.type, entry.content?.substring(0, 50));

        queryClient.setQueryData(executionKeys.logs(project), (prev: ExecutionLogs | undefined) => {
          const current = prev ?? defaultExecutionLogs;
          return {
            ...current,
            entries: [...current.entries, entry],
            iterationLog: current.iterationLog + (entry.content || ''),
          };
        });
      } catch (err) {
        console.error('[useExecutionSSE] Error processing ralph/log:', err);
      }
    });

    // Ralph iteration end event
    eventSource.addEventListener('ralph/iteration-end', (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data);
        const { allComplete } = payload.data;

        if (allComplete) {
          queryClient.setQueryData(executionKeys.status(project), (prev: RalphStatus | undefined) => {
            const current = prev ?? defaultRalphStatus;
            return {
              ...current,
              running: false,
              status: 'stopped' as const,
            };
          });
        }
      } catch (err) {
        console.error('[useExecutionSSE] Error processing ralph/iteration-end:', err);
      }
    });

    // Ralph connected event (initial connection)
    eventSource.addEventListener('ralph/connected', () => {
      // Initial connection event - no action needed
    });

    // Tasks snapshot event
    eventSource.addEventListener('tasks/snapshot', (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data);
        queryClient.setQueryData(executionKeys.tasks(project), payload.data as PRDData);
      } catch (err) {
        console.error('[useExecutionSSE] Error processing tasks/snapshot:', err);
      }
    });

    // Tasks updated event
    eventSource.addEventListener('tasks/updated', (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data);
        queryClient.setQueryData(executionKeys.tasks(project), payload.data as PRDData);
      } catch (err) {
        console.error('[useExecutionSSE] Error processing tasks/updated:', err);
      }
    });

    // Peer feedback snapshot event
    eventSource.addEventListener('peer-feedback/snapshot', (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data);
        queryClient.setQueryData(executionKeys.peer(project), payload.data as PeerFeedback);
      } catch (err) {
        console.error('[useExecutionSSE] Error processing peer-feedback/snapshot:', err);
      }
    });

    // Peer feedback updated event
    eventSource.addEventListener('peer-feedback/updated', (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data);
        queryClient.setQueryData(executionKeys.peer(project), payload.data as PeerFeedback);
      } catch (err) {
        console.error('[useExecutionSSE] Error processing peer-feedback/updated:', err);
      }
    });

    // Decompose events (for completeness - may not be used in execution view)
    eventSource.addEventListener('decompose/state', () => {
      // Could add to cache if needed
    });

    eventSource.addEventListener('decompose/log', () => {
      // Log events - could be added to cache if needed
    });

    eventSource.addEventListener('decompose/connected', () => {
      // Initial connection event
    });

    // Spec review events (for completeness)
    eventSource.addEventListener('spec-review/status', () => {
      // Could add to cache if needed
    });

    eventSource.addEventListener('spec-review/result', () => {
      // Could add to cache if needed
    });

    eventSource.addEventListener('spec-review/complete', () => {
      // Could add to cache if needed
    });

    eventSource.addEventListener('spec-review/chat-stream', () => {
      // Could add to cache if needed
    });

    eventSource.addEventListener('spec-review/log', () => {
      // Could add to cache if needed
    });

    eventSource.addEventListener('spec-review/connected', () => {
      // Initial connection event
    });

    // Connection error
    eventSource.onerror = () => {
      queryClient.setQueryData(executionKeys.connection(project), 'error' as ConnectionStatus);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [project, queryClient]);
}
