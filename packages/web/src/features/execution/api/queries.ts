import { useQuery } from '@tanstack/react-query';
import { executionKeys } from './keys';
import type { RalphStatus, PRDData, PeerFeedback } from '../../../types';
import type { ParsedEntry } from '../../../utils/parseJsonl';

/**
 * Connection status for SSE
 */
export type ConnectionStatus = 'connecting' | 'connected' | 'error' | 'disconnected';

/**
 * Log state including entries and current iteration
 */
export interface ExecutionLogs {
  /** @deprecated Use entries instead */
  iterationLog: string;
  /** Structured log entries from SSE events */
  entries: ParsedEntry[];
  /** Current iteration number */
  currentIteration: number | null;
}

/**
 * Default Ralph status when not connected
 */
export const defaultRalphStatus: RalphStatus = {
  running: false,
  status: 'stopped',
  currentIteration: 0,
  maxIterations: 0,
  currentStory: null,
};

/**
 * Default logs state
 */
export const defaultExecutionLogs: ExecutionLogs = {
  iterationLog: '',
  entries: [],
  currentIteration: null,
};

/**
 * Hook to read execution status from cache.
 * Data is populated by useExecutionSSE.
 */
export function useExecutionStatus(project: string | null) {
  return useQuery({
    queryKey: executionKeys.status(project ?? ''),
    queryFn: () => Promise.resolve(defaultRalphStatus),
    enabled: false, // Data comes from SSE, not fetched directly
    initialData: defaultRalphStatus,
  });
}

/**
 * Hook to read execution logs from cache.
 * Data is populated by useExecutionSSE.
 */
export function useExecutionLogs(project: string | null) {
  return useQuery({
    queryKey: executionKeys.logs(project ?? ''),
    queryFn: () => Promise.resolve(defaultExecutionLogs),
    enabled: false, // Data comes from SSE, not fetched directly
    initialData: defaultExecutionLogs,
  });
}

/**
 * Hook to read tasks (PRD data) from cache.
 * Data is populated by useExecutionSSE.
 */
export function useExecutionTasks(project: string | null) {
  return useQuery<PRDData | null>({
    queryKey: executionKeys.tasks(project ?? ''),
    queryFn: () => Promise.resolve(null),
    enabled: false, // Data comes from SSE, not fetched directly
    initialData: null,
  });
}

/**
 * Hook to read peer feedback from cache.
 * Data is populated by useExecutionSSE.
 */
export function useExecutionPeer(project: string | null) {
  return useQuery<PeerFeedback | null>({
    queryKey: executionKeys.peer(project ?? ''),
    queryFn: async () => {
      if (!project) return null;
      const response = await fetch(`/api/ralph/peer-feedback?project=${encodeURIComponent(project)}`);
      if (!response.ok) {
        throw new Error(`Failed to load peer feedback (${response.status})`);
      }
      return (await response.json()) as PeerFeedback;
    },
    enabled: false, // Primarily driven by SSE; manually refetch where needed.
    initialData: null,
  });
}

/**
 * Hook to read connection status from cache.
 * Data is populated by useExecutionSSE.
 */
export function useExecutionConnection(project: string | null) {
  return useQuery<ConnectionStatus>({
    queryKey: executionKeys.connection(project ?? ''),
    queryFn: () => Promise.resolve('disconnected' as ConnectionStatus),
    enabled: false, // Data comes from SSE, not fetched directly
    initialData: 'disconnected' as ConnectionStatus,
  });
}
