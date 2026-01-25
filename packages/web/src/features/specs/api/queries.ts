import { useQuery } from '@tanstack/react-query';
import { specsKeys } from './keys';
import { apiFetch } from '../../../components/ui/ErrorContext';

// ============================================================================
// Types
// ============================================================================

export type ReviewStatus = 'none' | 'in_progress' | 'completed' | 'needs_attention';
export type SessionStatus = 'in_progress' | 'completed' | 'needs_attention';
export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'edited';
export type SuggestionSeverity = 'critical' | 'warning' | 'info';
export type ReviewVerdict = 'PASS' | 'FAIL' | 'NEEDS_IMPROVEMENT' | 'SPLIT_RECOMMENDED';

export type SuggestionTag =
  | 'security'
  | 'performance'
  | 'scalability'
  | 'data'
  | 'api'
  | 'ux'
  | 'accessibility'
  | 'architecture'
  | 'testing'
  | 'infrastructure'
  | 'error-handling'
  | 'documentation';

export interface SpecFileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  reviewStatus?: 'none' | 'reviewed' | 'pending' | 'god-spec' | 'in-progress';
  children?: SpecFileNode[];
}

export interface Suggestion {
  id: string;
  type?: 'change' | 'comment';
  severity: SuggestionSeverity;
  location?: { section: string; lineStart?: number; lineEnd?: number };
  section?: string;
  lineStart?: number | null;
  lineEnd?: number | null;
  issue: string;
  suggestedFix: string;
  status: SuggestionStatus;
  tags?: SuggestionTag[];
  reviewedAt?: string;
}

export interface ReviewResult {
  verdict: ReviewVerdict;
  suggestions?: Suggestion[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  suggestionId?: string;
}

export interface SpecSession {
  sessionId: string;
  specFilePath: string;
  status: SessionStatus;
  startedAt: string;
  lastUpdatedAt: string;
  completedAt?: string;
  suggestions: Suggestion[];
  reviewResult: ReviewResult | null;
  chatMessages: ChatMessage[];
  contentHash?: string;
}

export interface GenerationStatus {
  generating: boolean;
  prdSpecId?: string;
  techSpecName?: string;
}

// ============================================================================
// API Helpers
// ============================================================================

function buildApiUrl(endpoint: string, projectPath: string): string {
  const separator = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${separator}project=${encodeURIComponent(projectPath)}`;
}

// ============================================================================
// Fetch Functions
// ============================================================================

async function fetchSpecTree(project: string): Promise<SpecFileNode[]> {
  const [filesRes, statusesRes] = await Promise.all([
    apiFetch(buildApiUrl('/api/spec-review/files', project)),
    apiFetch(buildApiUrl('/api/sessions/statuses', project)),
  ]);

  const filesData = await filesRes.json();
  const statusesData = await statusesRes.json();

  // Merge statuses into tree
  return mergeStatusesIntoTree(
    filesData.files || [],
    statusesData.statuses || {}
  );
}

function mergeStatusesIntoTree(
  nodes: SpecFileNode[],
  statuses: Record<string, string>
): SpecFileNode[] {
  return nodes.map((node) => {
    if (node.type === 'file') {
      return {
        ...node,
        reviewStatus: (statuses[node.path] ||
          'none') as SpecFileNode['reviewStatus'],
      };
    }
    if (node.children) {
      return {
        ...node,
        children: mergeStatusesIntoTree(node.children, statuses),
      };
    }
    return node;
  });
}

async function fetchSpecContent(
  path: string,
  project: string
): Promise<string> {
  const res = await apiFetch(
    buildApiUrl(
      `/api/spec-review/content/${encodeURIComponent(path)}`,
      project
    )
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch spec content: ${res.statusText}`);
  }

  const data = await res.json();
  return data.content || '';
}

async function fetchSpecSession(
  path: string,
  project: string
): Promise<SpecSession | null> {
  const res = await apiFetch(
    buildApiUrl(`/api/sessions/spec/${encodeURIComponent(path)}`, project)
  );

  if (!res.ok) {
    return null;
  }

  const data = await res.json();
  return data.session || null;
}

async function fetchGenerationStatus(project: string): Promise<GenerationStatus> {
  const res = await apiFetch(buildApiUrl('/api/decompose/generation-status', project));

  if (!res.ok) {
    return { generating: false };
  }

  return res.json();
}

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Hook to fetch the spec file tree with review statuses.
 */
export function useSpecTree(project: string | null) {
  return useQuery({
    queryKey: specsKeys.tree(project ?? ''),
    queryFn: () => fetchSpecTree(project!),
    enabled: !!project,
    staleTime: 1000 * 30, // 30 seconds
  });
}

/**
 * Hook to fetch the content of a specific spec file.
 */
export function useSpecContent(path: string | null, project: string | null) {
  return useQuery({
    queryKey: specsKeys.content(path ?? '', project ?? ''),
    queryFn: () => fetchSpecContent(path!, project!),
    enabled: !!path && !!project,
    staleTime: 1000 * 10, // 10 seconds
  });
}

/**
 * Hook to fetch the session data for a specific spec.
 * Uses refetchInterval for polling when review is in progress.
 */
export function useSpecSession(path: string | null, project: string | null) {
  return useQuery({
    queryKey: specsKeys.session(path ?? '', project ?? ''),
    queryFn: () => fetchSpecSession(path!, project!),
    enabled: !!path && !!project,
    staleTime: 1000 * 5, // 5 seconds
    refetchInterval: (query) =>
      query.state.data?.status === 'in_progress' ? 3000 : false,
  });
}

/**
 * Hook to fetch tech spec generation status.
 * Uses refetchInterval when generation is in progress.
 */
export function useGenerationStatus(project: string | null) {
  return useQuery({
    queryKey: specsKeys.generationStatus(project ?? ''),
    queryFn: () => fetchGenerationStatus(project!),
    enabled: !!project,
    staleTime: 1000 * 2, // 2 seconds
    refetchInterval: (query) =>
      query.state.data?.generating ? 3000 : false,
  });
}
