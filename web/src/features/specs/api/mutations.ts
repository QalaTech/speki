import { useMutation, useQueryClient } from '@tanstack/react-query';
import { specsKeys } from './keys';
import type { SpecSession, Suggestion, SuggestionStatus } from './queries';
import { apiFetch } from '../../../components/ui/ErrorContext';

// ============================================================================
// API Helpers
// ============================================================================

function buildApiUrl(endpoint: string, projectPath: string): string {
  const separator = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${separator}project=${encodeURIComponent(projectPath)}`;
}

// ============================================================================
// Mutation Types
// ============================================================================

export interface StartReviewParams {
  specPath: string;
  project: string;
  sessionId?: string; // For re-review with existing session
}

export interface StartReviewResult {
  sessionId: string;
  status: string;
}

export interface SaveContentParams {
  path: string;
  content: string;
  project: string;
}

export interface UpdateSuggestionParams {
  sessionId: string;
  suggestionId: string;
  action: SuggestionStatus;
  userVersion?: string;
  project: string;
}

export interface CreateSpecParams {
  name: string;
  type: 'prd' | 'tech-spec' | 'bug';
  project: string;
}

export interface CreateSpecResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

// ============================================================================
// Mutation Functions
// ============================================================================

async function startReview({
  specPath,
  project,
  sessionId,
}: StartReviewParams): Promise<StartReviewResult> {
  const body: Record<string, unknown> = { specFile: specPath };
  if (sessionId) {
    body.sessionId = sessionId;
  }

  const res = await apiFetch(buildApiUrl('/api/spec-review/start', project), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to start review');
  }

  return res.json();
}

async function pollForReviewCompletion(
  sessionId: string,
  specPath: string,
  project: string
): Promise<SpecSession | null> {
  const maxAttempts = 60;
  const pollInterval = 2000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const statusRes = await apiFetch(
      buildApiUrl(`/api/spec-review/status/${sessionId}`, project)
    );

    if (!statusRes.ok) {
      throw new Error('Failed to fetch review status');
    }

    const statusData = await statusRes.json();

    if (statusData.status === 'completed' || statusData.status === 'error') {
      // Fetch the full session data
      const sessionRes = await apiFetch(
        buildApiUrl(`/api/sessions/spec/${encodeURIComponent(specPath)}`, project)
      );

      if (sessionRes.ok) {
        const sessionData = await sessionRes.json();
        return sessionData.session || null;
      }
      return null;
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error('Review timed out');
}

async function saveSpecContent({
  path,
  content,
  project,
}: SaveContentParams): Promise<void> {
  const res = await apiFetch(
    buildApiUrl(`/api/spec-review/content/${encodeURIComponent(path)}`, project),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    }
  );

  if (!res.ok) {
    throw new Error('Failed to save spec content');
  }
}

async function updateSuggestionStatus({
  sessionId,
  suggestionId,
  action,
  userVersion,
  project,
}: UpdateSuggestionParams): Promise<{ success: boolean; suggestion: Suggestion }> {
  const res = await apiFetch(buildApiUrl('/api/spec-review/suggestion', project), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      suggestionId,
      action,
      userVersion,
    }),
  });

  if (!res.ok) {
    throw new Error('Failed to update suggestion status');
  }

  return res.json();
}

async function createSpec({
  name,
  type,
  project,
}: CreateSpecParams): Promise<CreateSpecResult> {
  const res = await apiFetch(buildApiUrl('/api/spec-review/new', project), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim(), type }),
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to create spec');
  }

  return data;
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Hook to start a review for a spec file.
 * Polls for completion and updates the session cache.
 */
export function useStartReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: StartReviewParams) => {
      const result = await startReview(params);
      // Poll for completion and return the full session
      return pollForReviewCompletion(result.sessionId, params.specPath, params.project);
    },
    onSuccess: (session, params) => {
      // Update session in cache
      if (session) {
        queryClient.setQueryData(
          specsKeys.session(params.specPath, params.project),
          session
        );
      }
      // Invalidate tree to update review statuses
      queryClient.invalidateQueries({
        queryKey: specsKeys.tree(params.project),
      });
    },
  });
}

/**
 * Hook to save spec content.
 * Invalidates content cache on success.
 */
export function useSaveContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveSpecContent,
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({
        queryKey: specsKeys.content(params.path, params.project),
      });
    },
  });
}

/**
 * Hook to update suggestion status.
 * Optimistically updates the session cache.
 */
export function useUpdateSuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateSuggestionStatus,
    onMutate: async (params) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: specsKeys.session(params.sessionId, params.project),
      });

      // We need the spec path to update the cache, but we don't have it directly
      // The session will be updated via onSuccess
      return {};
    },
    onSuccess: (_data, params) => {
      // Find and update the session that matches this sessionId
      // This is a bit tricky since we key by path, not sessionId
      // For now, we'll just invalidate all sessions for the project
      queryClient.invalidateQueries({
        queryKey: ['specs', 'session'],
        predicate: (query) => {
          const key = query.queryKey;
          return key[key.length - 1] === params.project;
        },
      });
    },
  });
}

/**
 * Hook to create a new spec file.
 * Invalidates tree cache on success.
 */
export function useCreateSpec() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSpec,
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({
        queryKey: specsKeys.tree(params.project),
      });
    },
  });
}
