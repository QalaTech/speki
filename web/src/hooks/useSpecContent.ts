import { useState, useCallback, useEffect } from 'react';
import { useFileVersion } from './useFileWatcher';
import { apiFetch } from '../components/ui/ErrorContext';

interface UseSpecContentOptions {
  projectPath: string;
  selectedPath: string | null;
}

interface UseSpecContentReturn {
  content: string;
  setContent: (content: string) => void;
  isLoading: boolean;
  hasUnsavedChanges: boolean;
  isEditing: boolean;
  setIsEditing: (value: boolean) => void;
  handleContentChange: (newContent: string) => void;
  handleSave: (newContent?: string) => Promise<void>;
  refetchContent: () => Promise<void>;
  revertChanges: () => Promise<void>;
}

/**
 * Hook for managing spec file content - loading, editing, and saving.
 */
export function useSpecContent({
  projectPath,
  selectedPath,
}: UseSpecContentOptions): UseSpecContentReturn {
  const [content, setContent] = useState<string>('');
  const [, setOriginalContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // File watcher - triggers refetch when selected file changes on disk
  const fileVersion = useFileVersion(projectPath, selectedPath);

  // API helper
  const apiUrl = useCallback((endpoint: string) => {
    const separator = endpoint.includes('?') ? '&' : '?';
    return `${endpoint}${separator}project=${encodeURIComponent(projectPath)}`;
  }, [projectPath]);

  // Handle content change in editor
  const handleContentChange = useCallback((newContent: string) => {
    console.log('[useSpecContent] handleContentChange called, content length:', newContent.length);
    setContent(newContent);
    setHasUnsavedChanges(true);
  }, []);

  // Refetch spec content (used when agent updates the file)
  const refetchContent = useCallback(async () => {
    if (!selectedPath) return;
    try {
      const res = await apiFetch(apiUrl(`/api/spec-review/content/${encodeURIComponent(selectedPath)}`));
      const data = await res.json();
      const fileContent = data.content || '';
      setContent(fileContent);
      setOriginalContent(fileContent);
      setHasUnsavedChanges(false);
      console.log('[useSpecContent] Refetched spec content');
    } catch (err) {
      console.error('Failed to refetch spec content:', err);
    }
  }, [selectedPath, apiUrl]);

  // Handle save
  const handleSave = useCallback(async (newContent?: string) => {
    console.log('[useSpecContent] handleSave called', { selectedPath, hasContent: !!content });
    if (!selectedPath) {
      console.warn('[useSpecContent] No selectedPath, aborting save');
      return;
    }
    const contentToSave = newContent ?? content;

    try {
      const url = apiUrl(`/api/spec-review/content/${encodeURIComponent(selectedPath)}`);
      console.log('[useSpecContent] Saving to:', url);
      const res = await apiFetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: contentToSave }),
      });
      const data = await res.json();
      console.log('[useSpecContent] Save response:', data);
      setOriginalContent(contentToSave);
      setContent(contentToSave);
      setHasUnsavedChanges(false);
      console.log('[useSpecContent] Save successful, unsaved changes cleared');
    } catch (err) {
      console.error('[useSpecContent] Failed to save spec:', err);
    }
  }, [selectedPath, content, apiUrl]);

  // Revert to original content
  const revertChanges = useCallback(async () => {
    if (!selectedPath) return;
    try {
      const res = await apiFetch(apiUrl(`/api/spec-review/content/${encodeURIComponent(selectedPath)}`));
      const data = await res.json();
      setContent(data.content || '');
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error('Failed to revert changes:', err);
    }
  }, [selectedPath, apiUrl]);

  // Fetch file content when selection changes
  useEffect(() => {
    if (!selectedPath) return;

    const abortController = new AbortController();
    let cancelled = false;

    async function fetchContent() {
      setIsLoading(true);
      try {
        const res = await apiFetch(apiUrl(`/api/spec-review/content/${encodeURIComponent(selectedPath!)}`), {
          signal: abortController.signal,
        });

        if (cancelled) return;

        const data = await res.json();
        const fileContent = data.content || '';
        setContent(fileContent);
        setOriginalContent(fileContent);
        setHasUnsavedChanges(false);
        setIsEditing(false); // Reset to preview mode when switching files
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        console.error('Failed to fetch spec content:', err);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchContent();

    return () => {
      cancelled = true;
      abortController.abort();
      setIsLoading(false);
    };
  }, [selectedPath, apiUrl, fileVersion]);

  return {
    content,
    setContent,
    isLoading,
    hasUnsavedChanges,
    isEditing,
    setIsEditing,
    handleContentChange,
    handleSave,
    refetchContent,
    revertChanges,
  };
}
