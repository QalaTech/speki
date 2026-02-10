import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from '../components/ui/ErrorContext';
import type {
  SpecSession,
  Suggestion,
  DiffOverlayState,
  SuggestionTag,
  ReviewStatus,
} from '../components/specs/types';

interface UseSpecReviewOptions {
  projectPath: string;
  selectedPath: string | null;
  content: string;
  onContentChange: (content: string) => void;
  onSave: (content: string) => Promise<void>;
}

interface UseSpecReviewReturn {
  session: SpecSession | null;
  setSession: React.Dispatch<React.SetStateAction<SpecSession | null>>;
  isStartingReview: boolean;
  selectedTagFilters: Set<SuggestionTag>;
  setSelectedTagFilters: React.Dispatch<React.SetStateAction<Set<SuggestionTag>>>;
  diffOverlay: DiffOverlayState;
  setDiffOverlay: React.Dispatch<React.SetStateAction<DiffOverlayState>>;
  getReviewStatus: () => ReviewStatus;
  handleStartReview: (reuseSession?: boolean, model?: string) => Promise<void>;
  handleReviewDiff: (suggestion: Suggestion) => void;
  handleDiffApprove: (finalContent: string) => Promise<void>;
  handleDiffReject: () => void;
  handleSuggestionAction: (
    suggestionId: string,
    action: 'approved' | 'rejected' | 'edited' | 'dismissed' | 'resolved',
    userVersion?: string
  ) => Promise<void>;
  handleBulkSuggestionAction: (
    suggestionIds: string[],
    action: 'approved' | 'rejected' | 'edited' | 'dismissed' | 'resolved'
  ) => Promise<void>;
}

/**
 * Apply a suggestion to the content text
 */
function applySuggestion(text: string, suggestion: Suggestion): string {
  // Get location info from either root level or nested in location object
  const section = suggestion.section ?? suggestion.location?.section;
  const lineStart = suggestion.lineStart ?? suggestion.location?.lineStart;
  const lineEnd = suggestion.lineEnd ?? suggestion.location?.lineEnd;

  // If we have line numbers, try to insert at that location
  if (lineStart != null) {
    const lines = text.split('\n');
    const targetLineIndex = lineStart - 1; // Convert to 0-based index

    if (targetLineIndex >= 0 && targetLineIndex < lines.length) {
      // Insert the suggested fix after the end line (or start line if no end)
      const insertIndex = (lineEnd ?? lineStart);

      // Add the suggested fix as a new section after the target location
      lines.splice(insertIndex, 0, '', suggestion.suggestedFix, '');
      return lines.join('\n');
    }
  }

  // If we have a section but no line numbers, try to find the section heading
  if (section) {
    const lines = text.split('\n');
    let sectionIndex = -1;

    // Find the section heading
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.toLowerCase().includes(section.toLowerCase())) {
        sectionIndex = i;
        break;
      }
    }

    if (sectionIndex >= 0) {
      // Find the end of this section (next heading or end of document)
      let sectionEndIndex = lines.length;
      for (let i = sectionIndex + 1; i < lines.length; i++) {
        if (lines[i].match(/^#{1,6}\s/)) {
          sectionEndIndex = i;
          break;
        }
      }

      // Insert the suggested fix at the end of the section
      lines.splice(sectionEndIndex, 0, '', suggestion.suggestedFix, '');
      return lines.join('\n');
    }
  }

  // Fallback: append to end of document
  return text + '\n\n' + suggestion.suggestedFix;
}

/**
 * Hook for managing spec review workflow - sessions, suggestions, and diffs.
 */
export function useSpecReview({
  projectPath,
  selectedPath,
  content,
  onContentChange,
  onSave,
}: UseSpecReviewOptions): UseSpecReviewReturn {
  const [session, setSession] = useState<SpecSession | null>(null);
  const [isStartingReview, setIsStartingReview] = useState(false);
  const [selectedTagFilters, setSelectedTagFilters] = useState<Set<SuggestionTag>>(new Set());
  const [diffOverlay, setDiffOverlay] = useState<DiffOverlayState>({
    isOpen: false,
    suggestion: null,
    originalText: '',
    proposedText: '',
  });

  // API helper
  const apiUrl = useCallback((endpoint: string) => {
    const separator = endpoint.includes('?') ? '&' : '?';
    return `${endpoint}${separator}project=${encodeURIComponent(projectPath)}`;
  }, [projectPath]);

  // Get review status for current file
  const getReviewStatus = useCallback((): ReviewStatus => {
    if (!session) return 'none';
    if (session.status === 'in_progress') return 'in-progress';
    if (session.reviewResult?.verdict === 'SPLIT_RECOMMENDED') return 'god-spec';
    const pendingSuggestions = session.suggestions.filter(s => s.status === 'pending');
    if (pendingSuggestions.length > 0) return 'pending';
    if (session.suggestions.length > 0) return 'reviewed';
    return 'none';
  }, [session]);

  // Handle start review (or re-review with existing session)
  const handleStartReview = useCallback(async (reuseSession: boolean = false, model?: string) => {
    if (!selectedPath) return;

    setIsStartingReview(true);
    try {
      const requestBody: Record<string, unknown> = { specFile: selectedPath, model };

      // If re-reviewing, pass the existing session ID to preserve chat history
      if (reuseSession && session?.sessionId) {
        requestBody.sessionId = session.sessionId;
      }

      const res = await apiFetch(apiUrl('/api/spec-review/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json();

      // Poll for completion
      const sessionId = data.sessionId;
      let completed = false;
      while (!completed) {
        await new Promise(r => setTimeout(r, 2000));
        const statusRes = await apiFetch(apiUrl(`/api/spec-review/status/${sessionId}`));
        const statusData = await statusRes.json();
        if (statusData.status === 'completed' || statusData.status === 'error') {
          completed = true;
          // Refresh session data
          const sessionRes = await apiFetch(apiUrl(`/api/sessions/spec/${encodeURIComponent(selectedPath)}`));
          if (sessionRes.ok) {
            const sessionData = await sessionRes.json();
            setSession(sessionData.session || null);
          }
        }
      }
    } catch (err) {
      console.error('Failed to start review:', err);
    } finally {
      setIsStartingReview(false);
    }
  }, [selectedPath, session?.sessionId, apiUrl]);

  // Handle review diff for a suggestion
  const handleReviewDiff = useCallback((suggestion: Suggestion) => {
    const proposedContent = applySuggestion(content, suggestion);

    setDiffOverlay({
      isOpen: true,
      suggestion,
      originalText: content,
      proposedText: proposedContent,
    });
  }, [content]);

  // Handle diff approval
  const handleDiffApprove = useCallback(async (finalContent: string) => {
    if (!diffOverlay.suggestion || !session) return;

    // Update content
    await onSave(finalContent);
    onContentChange(finalContent);

    // Mark suggestion as approved
    const updatedSuggestions = session.suggestions.map(s =>
      s.id === diffOverlay.suggestion?.id ? { ...s, status: 'approved' as const } : s
    );
    setSession({ ...session, suggestions: updatedSuggestions });

    // Close overlay
    setDiffOverlay({ isOpen: false, suggestion: null, originalText: '', proposedText: '' });
  }, [diffOverlay.suggestion, session, onSave, onContentChange]);

  // Handle diff reject
  const handleDiffReject = useCallback(() => {
    if (!diffOverlay.suggestion || !session) return;

    // Mark suggestion as rejected
    const updatedSuggestions = session.suggestions.map(s =>
      s.id === diffOverlay.suggestion?.id ? { ...s, status: 'rejected' as const } : s
    );
    setSession({ ...session, suggestions: updatedSuggestions });

    // Close overlay
    setDiffOverlay({ isOpen: false, suggestion: null, originalText: '', proposedText: '' });
  }, [diffOverlay.suggestion, session]);

  // Handle suggestion status update (approve/reject/edit/dismiss/resolve)
  const handleSuggestionAction = useCallback(async (
    suggestionId: string,
    action: 'approved' | 'rejected' | 'edited' | 'dismissed' | 'resolved',
    userVersion?: string
  ) => {
    if (!session?.sessionId) return;

    // If approving, apply the suggestion to the spec first
    if (action === 'approved') {
      const suggestion = session.suggestions.find(s => s.id === suggestionId);
      if (suggestion) {
        const updatedContent = applySuggestion(content, suggestion);
        await onSave(updatedContent);
        onContentChange(updatedContent);
      }
    }

    try {
      const res = await apiFetch(apiUrl('/api/spec-review/suggestion'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          suggestionId,
          action,
          userVersion,
        }),
      });

      if (!res.ok) {
        console.error('Failed to update suggestion status');
        return;
      }

      const data = await res.json();

      // Update local session state with the updated suggestion
      if (data.success && data.suggestion) {
        setSession(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            suggestions: prev.suggestions.map(s =>
              s.id === suggestionId ? { ...s, status: action, reviewedAt: data.suggestion.reviewedAt } : s
            ),
          };
        });
      }
    } catch (error) {
      console.error('Failed to update suggestion:', error);
    }
  }, [session?.sessionId, session?.suggestions, content, apiUrl, onSave, onContentChange]);

  // Fetch session when selection changes
  useEffect(() => {
    if (!selectedPath) {
      setSession(null);
      return;
    }

    // Clear stale session while loading the newly selected spec's session.
    setSession(null);

    const abortController = new AbortController();

    async function fetchSession() {
      try {
        const res = await apiFetch(apiUrl(`/api/sessions/spec/${encodeURIComponent(selectedPath!)}`), {
          signal: abortController.signal,
        });

        if (res.ok) {
          const data = await res.json();
          setSession(data.session || null);
        } else {
          setSession(null);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setSession(null);
      }
    }

    fetchSession();

    return () => {
      abortController.abort();
    };
  }, [selectedPath, apiUrl]);

  // Reset review state when file changes
  useEffect(() => {
    setIsStartingReview(false);
    setSelectedTagFilters(new Set());
    setDiffOverlay({ isOpen: false, suggestion: null, originalText: '', proposedText: '' });
  }, [selectedPath]);

  // Poll for session updates when status is in_progress
  useEffect(() => {
    if (!session || session.status !== 'in_progress' || !selectedPath) {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const res = await apiFetch(apiUrl(`/api/sessions/spec/${encodeURIComponent(selectedPath)}`));
        if (res.ok) {
          const data = await res.json();
          if (data.session && data.session.status !== 'in_progress') {
            // Review completed or errored - update session
            setSession(data.session);
          }
        }
      } catch (error) {
        console.error('Failed to poll session status:', error);
      }
    }, 3000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [session?.status, selectedPath, apiUrl]);

  // Handle bulk suggestion action
  const handleBulkSuggestionAction = useCallback(async (
    suggestionIds: string[],
    action: 'approved' | 'rejected' | 'edited' | 'dismissed' | 'resolved'
  ) => {
    if (!session?.sessionId || suggestionIds.length === 0) return;

    // Optimistic update
    setSession(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        suggestions: prev.suggestions.map(s =>
          suggestionIds.includes(s.id) ? { ...s, status: action, reviewedAt: new Date().toISOString() } : s
        ),
      };
    });

    // Execute requests in parallel
    await Promise.all(
      suggestionIds.map(id => 
        apiFetch(apiUrl('/api/spec-review/suggestion'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.sessionId,
            suggestionId: id,
            action,
          }),
        }).catch(err => console.error(`Failed to update suggestion ${id}:`, err))
      )
    );
  }, [session?.sessionId, apiUrl]);

  return {
    session,
    setSession,
    isStartingReview,
    selectedTagFilters,
    setSelectedTagFilters,
    diffOverlay,
    setDiffOverlay,
    getReviewStatus,
    handleStartReview,
    handleReviewDiff,
    handleDiffApprove,
    handleDiffReject,
    handleSuggestionAction,
    handleBulkSuggestionAction,
  };
}
