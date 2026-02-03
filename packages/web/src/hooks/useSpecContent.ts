import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useFileWatcher } from './useFileWatcher';
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
  
  // Track when we're saving to ignore file change events from our own save
  const ignoreNextFileChangeRef = useRef(false);
  const ignoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    // Set flag to ignore the next file change event (our own save)
    ignoreNextFileChangeRef.current = true;
    // Clear flag after 2 seconds in case the event doesn't arrive
    if (ignoreTimeoutRef.current) {
      clearTimeout(ignoreTimeoutRef.current);
    }
    ignoreTimeoutRef.current = setTimeout(() => {
      ignoreNextFileChangeRef.current = false;
    }, 2000);

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
      // Don't call setContent here - keep editor state as-is to preserve undo history
      setHasUnsavedChanges(false);
      console.log('[useSpecContent] Save successful, unsaved changes cleared');
    } catch (err) {
      toast.error("Failed to save spec");
      console.error('[useSpecContent] Failed to save spec:', err);
      // Reset flag on error
      ignoreNextFileChangeRef.current = false;
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

  // Handle file change events from watcher
  const handleFileChange = useCallback((event: { filePath: string; changeType: string }) => {
    // Normalize paths for comparison
    const normalizedEventPath = event.filePath.replace(/\\/g, '/').replace(/\/$/, '');
    const normalizedFilePath = selectedPath?.replace(/\\/g, '/').replace(/\/$/, '');
    
    if (normalizedFilePath && normalizedEventPath === normalizedFilePath) {
      // Check if this was our own save
      if (ignoreNextFileChangeRef.current) {
        console.log('[useSpecContent] Ignoring file change from our own save');
        ignoreNextFileChangeRef.current = false;
        return;
      }
      
      // External change - refetch
      console.log('[useSpecContent] External file change detected, refetching');
      refetchContent();
    }
  }, [selectedPath, refetchContent]);

  // Subscribe to file watcher
  useFileWatcher({ projectPath, onFileChange: handleFileChange });

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
  }, [selectedPath, apiUrl]); // Removed fileVersion - now handled by file watcher callback

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
