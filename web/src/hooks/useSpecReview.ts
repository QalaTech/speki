import { useState, useCallback, useRef } from 'react';

export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'edited';
export type SuggestionSeverity = 'critical' | 'warning' | 'info';
export type ReviewVerdict =
  | 'PASS'
  | 'FAIL'
  | 'NEEDS_IMPROVEMENT'
  | 'SPLIT_RECOMMENDED';

export interface TrackedSuggestion {
  id: string;
  category: string;
  severity: SuggestionSeverity;
  section: string;
  lineStart?: number;
  lineEnd?: number;
  textSnippet: string;
  issue: string;
  suggestedFix: string;
  status: SuggestionStatus;
  userVersion?: string;
  reviewedAt?: string;
}

export interface SplitProposal {
  proposedSpecs: Array<{
    name: string;
    filename: string;
    description: string;
    sections: string[];
    estimatedStories: number;
  }>;
}

export interface ReviewResult {
  verdict: ReviewVerdict;
  suggestions: TrackedSuggestion[];
  splitProposal?: SplitProposal;
  logPath?: string;
}

export interface SpecReviewState {
  sessionId: string | null;
  specFilePath: string | null;
  suggestions: TrackedSuggestion[];
  verdict: ReviewVerdict | null;
  splitProposal?: SplitProposal;
  isLoading: boolean;
  error: string | null;
  hasStarted: boolean;
}

export interface SpecReviewActions {
  startReview: (specPath: string, projectPath?: string) => Promise<void>;
  updateSuggestionStatus: (
    suggestionId: string,
    status: SuggestionStatus,
    userVersion?: string
  ) => void;
  reset: () => void;
}

export type UseSpecReviewReturn = SpecReviewState & SpecReviewActions;

const initialState: SpecReviewState = {
  sessionId: null,
  specFilePath: null,
  suggestions: [],
  verdict: null,
  splitProposal: undefined,
  isLoading: false,
  error: null,
  hasStarted: false,
};

function buildApiUrl(endpoint: string, projectPath?: string): string {
  if (!projectPath) return endpoint;
  const separator = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${separator}project=${encodeURIComponent(projectPath)}`;
}

export function useSpecReview(): UseSpecReviewReturn {
  const [state, setState] = useState<SpecReviewState>(initialState);
  const esRef = useRef<EventSource | null>(null);

  const startReview = useCallback(
    async (specPath: string, projectPath?: string): Promise<void> => {
      setState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
        hasStarted: true,
        specFilePath: specPath,
      }));

      try {
        const response = await fetch(
          buildApiUrl('/api/spec-review/start', projectPath),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ specPath }),
          }
        );

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to start review');
        }

        const data = await response.json();

        setState((prev) => ({
          ...prev,
          sessionId: data.sessionId,
          isLoading: data.status === 'in_progress',
        }));

        // Subscribe to SSE for spec-review events
        if (typeof window !== 'undefined' && 'EventSource' in window) {
          if (esRef.current) { esRef.current.close(); esRef.current = null; }
          const es = new EventSource(buildApiUrl('/api/events/spec-review', projectPath));
          es.addEventListener('spec-review/status', (e: MessageEvent) => {
            try {
              const payload = JSON.parse(e.data) as { data: { sessionId: string; status: string } };
              if (!payload.data || !payload.data.sessionId) return;
              setState((prev) => ({ ...prev, isLoading: payload.data.status === 'in_progress' }));
            } catch {}
          });
          es.addEventListener('spec-review/result', (e: MessageEvent) => {
            try {
              const payload = JSON.parse(e.data) as { data: { sessionId: string; verdict: ReviewVerdict; suggestions: TrackedSuggestion[] } };
              setState((prev) => ({
                ...prev,
                verdict: payload.data.verdict,
                suggestions: payload.data.suggestions.map((s: any) => ({ ...s, status: s.status || 'pending' })),
                isLoading: false,
                error: null,
              }));
            } catch {}
          });
          es.addEventListener('spec-review/complete', () => {
            setState((prev) => ({ ...prev, isLoading: false }));
          });
          es.onerror = () => { es.close(); };
          esRef.current = es;
        } else {
          // Fallback polling on environments without SSE
          await pollForResults(data.sessionId, projectPath);
        }
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }));
      }
    },
    []
  );

  const pollForResults = useCallback(
    async (sessionId: string, projectPath?: string): Promise<void> => {
      const maxAttempts = 60;
      const pollInterval = 5000;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const response = await fetch(
            buildApiUrl(`/api/spec-review/status/${sessionId}`, projectPath)
          );

          if (!response.ok) {
            throw new Error('Failed to fetch review status');
          }

          const data = await response.json();

          if (data.status === 'completed' || data.status === 'needs_attention') {
            updateStateFromStatus(data);
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, pollInterval));
        } catch (error) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: error instanceof Error ? error.message : 'Polling failed',
          }));
          return;
        }
      }

      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: 'Review timed out',
      }));
    },
    []
  );

  const updateStateFromStatus = useCallback(
    (data: {
      reviewResult?: ReviewResult;
      suggestions?: TrackedSuggestion[];
      verdict?: ReviewVerdict;
    }): void => {
      const reviewResult = data.reviewResult;
      const suggestions =
        reviewResult?.suggestions || data.suggestions || [];
      const verdict = reviewResult?.verdict || data.verdict || null;
      const splitProposal = reviewResult?.splitProposal;

      setState((prev) => ({
        ...prev,
        suggestions: suggestions.map((s) => ({
          ...s,
          status: s.status || 'pending',
        })),
        verdict,
        splitProposal,
        isLoading: false,
        error: null,
      }));
    },
    []
  );

  const updateSuggestionStatus = useCallback(
    (
      suggestionId: string,
      status: SuggestionStatus,
      userVersion?: string
    ): void => {
      setState((prev) => ({
        ...prev,
        suggestions: prev.suggestions.map((s) =>
          s.id === suggestionId
            ? {
                ...s,
                status,
                userVersion: userVersion ?? s.userVersion,
                reviewedAt: new Date().toISOString(),
              }
            : s
        ),
      }));
    },
    []
  );

  const reset = useCallback((): void => {
    setState(initialState);
  }, []);

  return {
    ...state,
    startReview,
    updateSuggestionStatus,
    reset,
  };
}
