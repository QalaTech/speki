import { useState, useCallback } from 'react';
import { apiFetch } from '../components/ui/ErrorContext';
import type { SplitProposal } from '@speki/core';
import type { SplitPreviewFile } from '../components/review/SplitPreviewModal';

export interface UseSplitPreviewState {
  /** Whether the preview modal is open */
  isOpen: boolean;
  /** Whether a save operation is in progress */
  isSaving: boolean;
  /** Whether preview content is loading */
  isLoading: boolean;
  /** The current proposal being previewed */
  proposal: SplitProposal | null;
  /** Preview files with content */
  previewFiles: SplitPreviewFile[];
  /** Error message if any */
  error: string | null;
  /** Created file paths after save */
  createdFiles: string[];
}

export interface UseSplitPreviewActions {
  /** Open the preview modal for a split proposal */
  openPreview: (proposal: SplitProposal, specFile: string, projectPath?: string) => Promise<void>;
  /** Save all files and close modal */
  saveAll: (
    files: SplitPreviewFile[],
    specFile: string,
    sessionId?: string,
    projectPath?: string
  ) => Promise<void>;
  /** Close the modal without saving */
  cancel: () => void;
  /** Reset state */
  reset: () => void;
}

export type UseSplitPreviewReturn = UseSplitPreviewState & UseSplitPreviewActions;

const initialState: UseSplitPreviewState = {
  isOpen: false,
  isSaving: false,
  isLoading: false,
  proposal: null,
  previewFiles: [],
  error: null,
  createdFiles: [],
};

function buildApiUrl(endpoint: string, projectPath?: string): string {
  if (!projectPath) return endpoint;
  const separator = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${separator}project=${encodeURIComponent(projectPath)}`;
}

export function useSplitPreview(): UseSplitPreviewReturn {
  const [state, setState] = useState<UseSplitPreviewState>(initialState);

  const openPreview = useCallback(
    async (proposal: SplitProposal, specFile: string, projectPath?: string): Promise<void> => {
      setState((prev) => ({
        ...prev,
        isOpen: true,
        isLoading: true,
        proposal,
        error: null,
      }));

      try {
        const response = await apiFetch(buildApiUrl('/api/spec-review/split/preview-content', projectPath), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ specFile, proposal }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to load preview content');
        }

        const data = await response.json();
        setState((prev) => ({
          ...prev,
          isLoading: false,
          previewFiles: data.previewFiles,
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to load preview content',
        }));
      }
    },
    []
  );

  const saveAll = useCallback(
    async (
      files: SplitPreviewFile[],
      specFile: string,
      sessionId?: string,
      projectPath?: string
    ): Promise<void> => {
      setState((prev) => ({
        ...prev,
        isSaving: true,
        error: null,
      }));

      try {
        const response = await apiFetch(buildApiUrl('/api/spec-review/split/execute', projectPath), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            specFile,
            sessionId,
            files: files.map((f) => ({
              filename: f.filename,
              description: f.description,
              content: f.content,
            })),
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to save files');
        }

        const data = await response.json();
        setState((prev) => ({
          ...prev,
          isSaving: false,
          isOpen: false,
          createdFiles: data.createdFiles || [],
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isSaving: false,
          error: err instanceof Error ? err.message : 'Failed to save files',
        }));
        throw err;
      }
    },
    []
  );

  const cancel = useCallback((): void => {
    setState((prev) => ({
      ...prev,
      isOpen: false,
    }));
  }, []);

  const reset = useCallback((): void => {
    setState(initialState);
  }, []);

  return {
    ...state,
    openPreview,
    saveAll,
    cancel,
    reset,
  };
}
