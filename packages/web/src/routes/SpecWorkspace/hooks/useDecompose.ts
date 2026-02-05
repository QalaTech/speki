import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from '../../../components/ui/ErrorContext';
import { useDecomposeSSE } from '../../../hooks/useDecomposeSSE';
import type { UserStory } from '../../../types';
import { ACTIVE_DECOMPOSE_STATUSES, DECOMPOSE_COMPLETE_STATUSES } from '../constants';
import { isDecomposeForSpec } from '../utils';

interface UseDecomposeOptions {
  projectPath: string;
  selectedPath: string | null;
}

interface UseDecomposeReturn {
  stories: UserStory[];
  setStories: React.Dispatch<React.SetStateAction<UserStory[]>>;
  isDecomposing: boolean;
  setIsDecomposing: React.Dispatch<React.SetStateAction<boolean>>;
  handleDecompose: (force?: boolean) => Promise<void>;
  loadDecomposeState: () => Promise<void>;
}

/**
 * Hook to manage spec decomposition state and operations
 */
export function useDecompose({ projectPath, selectedPath }: UseDecomposeOptions): UseDecomposeReturn {
  const [stories, setStories] = useState<UserStory[]>([]);
  const [isDecomposing, setIsDecomposing] = useState(false);
  const decomposeState = useDecomposeSSE(projectPath);

  const loadDecomposeState = useCallback(async () => {
    if (!selectedPath) return;
    try {
      // Clear stories while loading to avoid stale state
      setStories([]); 
      const params = new URLSearchParams({ specPath: selectedPath, project: projectPath });
      const res = await apiFetch(`/api/decompose/draft?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (data.draft) {
          setStories(data.draft.userStories || []);
        } else {
          setStories([]);
        }
      } else {
         setStories([]);
      }
    } catch (err) {
      console.error('Failed to load decompose state:', err);
      setStories([]);
    }
  }, [selectedPath, projectPath]);

  const handleDecompose = useCallback(async (force: boolean = false) => {
    if (!selectedPath) return;
    setIsDecomposing(true);
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
    }
  }, [selectedPath, projectPath]);

  // Listen to SSE updates
  useEffect(() => {
    if (!decomposeState || !selectedPath) return;

    const isForThisSpec = isDecomposeForSpec(decomposeState.prdFile, selectedPath);
    if (!isForThisSpec) return;

    if (ACTIVE_DECOMPOSE_STATUSES.includes(decomposeState.status as typeof ACTIVE_DECOMPOSE_STATUSES[number])) {
      setIsDecomposing(true);
    } else if (DECOMPOSE_COMPLETE_STATUSES.includes(decomposeState.status as typeof DECOMPOSE_COMPLETE_STATUSES[number])) {
      setIsDecomposing(false);
      loadDecomposeState();
    }
  }, [decomposeState, selectedPath, loadDecomposeState]);

  return {
    stories,
    setStories,
    isDecomposing,
    setIsDecomposing,
    handleDecompose,
    loadDecomposeState,
  };
}
