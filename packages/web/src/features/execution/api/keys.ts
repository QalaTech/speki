/**
 * Query key factory for execution-related queries.
 * All keys are project-scoped to support multi-project execution.
 */
export const executionKeys = {
  /** Status query key for a project */
  status: (project: string) => ['execution', project, 'status'] as const,
  /** Logs query key for a project */
  logs: (project: string) => ['execution', project, 'logs'] as const,
  /** Tasks (PRD data) query key for a project */
  tasks: (project: string) => ['execution', project, 'tasks'] as const,
  /** Peer feedback query key for a project */
  peer: (project: string) => ['execution', project, 'peer'] as const,
  /** Connection status query key for a project */
  connection: (project: string) => ['execution', project, 'connection'] as const,
  /** Queue tasks query key for a project */
  queue: (project: string) => ['execution', project, 'queue'] as const,
} as const;
