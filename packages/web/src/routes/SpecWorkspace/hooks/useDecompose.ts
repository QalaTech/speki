import { useState, useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '../../../components/ui/ErrorContext';
import { useDecomposeSSE } from '../../../hooks/useDecomposeSSE';
import type { DecomposeFeedback, UserStory } from '../../../types';
import { ACTIVE_DECOMPOSE_STATUSES, DECOMPOSE_COMPLETE_STATUSES, DECOMPOSE_ERROR_STATUSES } from '../constants';
import { isDecomposeForSpec } from '../utils';
import { playCompletionGong } from '../audio';

interface UseDecomposeOptions {
  projectPath: string;
  selectedPath: string | null;
  includeReviewMeta?: boolean;
}

interface UseDecomposeReturn {
  stories: UserStory[];
  setStories: React.Dispatch<React.SetStateAction<UserStory[]>>;
  isDecomposing: boolean;
  setIsDecomposing: React.Dispatch<React.SetStateAction<boolean>>;
  decomposeError: string | null;
  setDecomposeError: React.Dispatch<React.SetStateAction<string | null>>;
  reviewFeedback: DecomposeFeedback | null;
  reviewVerdict: 'PASS' | 'FAIL' | 'UNKNOWN' | 'SKIPPED' | null;
  specStatus: 'pending' | 'partial' | 'completed' | null;
  specStatusMessage: string | null;
  handleDecompose: (force?: boolean) => Promise<void>;
  loadDecomposeState: () => Promise<void>;
}

/**
 * Hook to manage spec decomposition state and operations
 */
export function useDecompose({
  projectPath,
  selectedPath,
  includeReviewMeta = false,
}: UseDecomposeOptions): UseDecomposeReturn {
  const [stories, setStories] = useState<UserStory[]>([]);
  const [isDecomposing, setIsDecomposing] = useState(false);
  const [decomposeError, setDecomposeError] = useState<string | null>(null);
  const [decomposingSpecPath, setDecomposingSpecPath] = useState<string | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState<DecomposeFeedback | null>(null);
  const [reviewVerdict, setReviewVerdict] = useState<'PASS' | 'FAIL' | 'UNKNOWN' | 'SKIPPED' | null>(null);
  const [specStatus, setSpecStatus] = useState<'pending' | 'partial' | 'completed' | null>(null);
  const [specStatusMessage, setSpecStatusMessage] = useState<string | null>(null);
  const hadActiveDecomposeRef = useRef(false);
  const decomposeState = useDecomposeSSE(projectPath);

  const loadDecomposeState = useCallback(async () => {
    if (!selectedPath) return;
    try {
      // Clear stories while loading to avoid stale state
      setStories([]); 
      if (includeReviewMeta) {
        setReviewFeedback(null);
        setReviewVerdict(null);
        setSpecStatus(null);
        setSpecStatusMessage(null);
      }
      const params = new URLSearchParams({ specPath: selectedPath, project: projectPath });
      const res = await apiFetch(`/api/decompose/draft?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (data.draft) {
          setStories(data.draft.userStories || []);
          if (includeReviewMeta) {
            setSpecStatus(data.draft.status || null);
            setSpecStatusMessage(data.draft.statusMessage || null);
          }
        } else {
          setStories([]);
          if (includeReviewMeta) {
            setSpecStatus(null);
            setSpecStatusMessage(null);
          }
        }
      } else {
         setStories([]);
         if (includeReviewMeta) {
           setSpecStatus(null);
           setSpecStatusMessage(null);
         }
      }

      if (includeReviewMeta) {
        const [stateResult, feedbackResult] = await Promise.allSettled([
          apiFetch(`/api/decompose/state?${params}`),
          apiFetch(`/api/decompose/feedback?${params}`),
        ]);

        if (stateResult.status === 'fulfilled' && stateResult.value.ok) {
          try {
            const stateData = await stateResult.value.json();
            setReviewVerdict(stateData.verdict || null);
          } catch {
            setReviewVerdict(null);
          }
        } else {
          setReviewVerdict(null);
        }

        if (feedbackResult.status === 'fulfilled' && feedbackResult.value.ok) {
          try {
            const feedbackData = await feedbackResult.value.json();
            setReviewFeedback(feedbackData.feedback || null);
          } catch {
            setReviewFeedback(null);
          }
        } else {
          setReviewFeedback(null);
        }
      }
    } catch (err) {
      console.error('Failed to load decompose state:', err);
      setStories([]);
      if (includeReviewMeta) {
        setReviewFeedback(null);
        setReviewVerdict(null);
        setSpecStatus(null);
        setSpecStatusMessage(null);
      }
    }
  }, [selectedPath, projectPath, includeReviewMeta]);

  const handleDecompose = useCallback(async (force: boolean = false) => {
    if (!selectedPath) return;
    setIsDecomposing(true);
    setDecomposingSpecPath(selectedPath);
    try {
      const params = new URLSearchParams({ project: projectPath });
      await apiFetch(`/api/decompose/start?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prdFile: selectedPath, forceRedecompose: force }),
      });
    } catch (err) {
      console.error('Decompose failed:', err);
      setIsDecomposing(false);
      setDecomposingSpecPath(null);
    }
  }, [selectedPath, projectPath]);

  // Listen to SSE updates
  useEffect(() => {
    if (!decomposeState) return;

    const status = decomposeState.status as typeof ACTIVE_DECOMPOSE_STATUSES[number] | typeof DECOMPOSE_COMPLETE_STATUSES[number] | typeof DECOMPOSE_ERROR_STATUSES[number];
    const isActive = ACTIVE_DECOMPOSE_STATUSES.includes(status as typeof ACTIVE_DECOMPOSE_STATUSES[number]);
    const isComplete = DECOMPOSE_COMPLETE_STATUSES.includes(status as typeof DECOMPOSE_COMPLETE_STATUSES[number]);
    const isError = DECOMPOSE_ERROR_STATUSES.includes(status as typeof DECOMPOSE_ERROR_STATUSES[number]);

    const isForSelectedSpec = !!selectedPath && isDecomposeForSpec(decomposeState.prdFile, selectedPath);
    const isForTrackedSpec = !!decomposingSpecPath && isDecomposeForSpec(decomposeState.prdFile, decomposingSpecPath);

    if (isActive && selectedPath && isForSelectedSpec) {
      setIsDecomposing(true);
      setDecomposingSpecPath(selectedPath);
      setDecomposeError(null);
      hadActiveDecomposeRef.current = true;
      return;
    }

    if (isError && (isForSelectedSpec || isForTrackedSpec)) {
      setIsDecomposing(false);
      setDecomposingSpecPath(null);
      setDecomposeError(decomposeState.error || 'Decompose failed');
      hadActiveDecomposeRef.current = false;
      return;
    }

    if (isComplete && (isForSelectedSpec || isForTrackedSpec)) {
      setIsDecomposing(false);
      setDecomposingSpecPath(null);
      setDecomposeError(null);
      if (hadActiveDecomposeRef.current) {
        playCompletionGong();
      }
      hadActiveDecomposeRef.current = false;
      if (isForSelectedSpec) {
        loadDecomposeState();
      }
    }
  }, [decomposeState, selectedPath, decomposingSpecPath, loadDecomposeState]);

  const isCurrentSpecDecomposing =
    isDecomposing &&
    !!selectedPath &&
    (!decomposingSpecPath || isDecomposeForSpec(decomposingSpecPath, selectedPath));

  return {
    stories,
    setStories,
    isDecomposing: isCurrentSpecDecomposing,
    setIsDecomposing,
    decomposeError,
    setDecomposeError,
    reviewFeedback,
    reviewVerdict,
    specStatus,
    specStatusMessage,
    handleDecompose,
    loadDecomposeState,
  };
}
