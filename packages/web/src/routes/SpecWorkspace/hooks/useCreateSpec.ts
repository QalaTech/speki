import { useState, useCallback } from 'react';
import { apiFetch } from '../../../components/ui/ErrorContext';

interface UseCreateSpecOptions {
  projectPath: string;
  onSuccess: (path: string) => void;
  refreshFiles: () => void;
}

interface UseCreateSpecReturn {
  isCreating: boolean;
  createSpec: (name: string, type: 'prd' | 'tech-spec' | 'bug') => Promise<void>;
}

/**
 * Hook to handle creating new specs
 */
export function useCreateSpec({ projectPath, onSuccess, refreshFiles }: UseCreateSpecOptions): UseCreateSpecReturn {
  const [isCreating, setIsCreating] = useState(false);

  const createSpec = useCallback(async (name: string, type: 'prd' | 'tech-spec' | 'bug') => {
    if (!name.trim()) return;
    setIsCreating(true);
    try {
      const params = new URLSearchParams({ project: projectPath });
      const res = await apiFetch(`/api/spec-review/new?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type }),
      });
      if (res.ok) {
        const data = await res.json();
        refreshFiles();
        onSuccess(data.filePath);
      }
    } finally {
      setIsCreating(false);
    }
  }, [projectPath, onSuccess, refreshFiles]);

  return {
    isCreating,
    createSpec,
  };
}
