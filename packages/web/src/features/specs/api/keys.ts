/**
 * Query key factory for specs-related queries.
 * All keys are project-scoped to support multi-project views.
 */
export const specsKeys = {
  /** Base key for all specs queries */
  all: (project: string) => ['specs', project] as const,

  /** Tree structure of spec files */
  tree: (project: string) => ['specs', 'tree', project] as const,

  /** Content of a specific spec file */
  content: (path: string, project: string) =>
    ['specs', 'content', path, project] as const,

  /** Session data for a specific spec */
  session: (path: string, project: string) =>
    ['specs', 'session', path, project] as const,

  /** Review statuses for all specs */
  statuses: (project: string) => ['specs', 'statuses', project] as const,

  /** Generation status for tech specs */
  generationStatus: (project: string) =>
    ['specs', 'generation-status', project] as const,

  /** Decompose draft for a spec */
  decomposeDraft: (specPath: string, project: string) =>
    ['specs', 'decompose-draft', specPath, project] as const,
} as const;
