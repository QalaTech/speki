import { useEffect, useRef, useCallback, useReducer } from 'react';

interface FileChangeEvent {
  filePath: string;
  changeType: 'add' | 'change' | 'unlink';
}

interface UseFileWatcherOptions {
  projectPath: string | null;
  onFileChange?: (event: FileChangeEvent) => void;
}

/**
 * Hook to listen for file change events from the server.
 * Subscribes to SSE events and calls onFileChange when files in the specs directory change.
 */
export function useFileWatcher({ projectPath, onFileChange }: UseFileWatcherOptions): void {
  const eventSourceRef = useRef<EventSource | null>(null);
  const onFileChangeRef = useRef(onFileChange);

  // Keep callback ref updated
  useEffect(() => {
    onFileChangeRef.current = onFileChange;
  }, [onFileChange]);

  useEffect(() => {
    if (!projectPath) return;

    // Connect to the spec-review SSE endpoint
    const url = `/api/events/spec-review?project=${encodeURIComponent(projectPath)}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      console.log('[useFileWatcher] SSE connected to', url);
    };

    es.addEventListener('spec-review/file-changed', (event) => {
      try {
        const data = JSON.parse(event.data) as FileChangeEvent;
        console.log('[useFileWatcher] File changed event received:', data);
        onFileChangeRef.current?.(data);
      } catch (err) {
        console.error('[useFileWatcher] Failed to parse file change event:', err);
      }
    });

    es.onerror = (err) => {
      console.error('[useFileWatcher] SSE error:', err);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [projectPath]);
}

/**
 * Hook that returns a version number that increments when the specified file changes.
 * Useful for triggering refetches in useEffect dependencies.
 */
export function useFileVersion(projectPath: string | null, filePath: string | null): number {
  const [version, setVersion] = useReducer((v: number) => v + 1, 0);

  const handleFileChange = useCallback((event: FileChangeEvent) => {
    // Check if the changed file matches the one we're watching
    // Normalize paths for comparison (handle trailing slashes, case differences on some systems)
    const normalizedEventPath = event.filePath.replace(/\\/g, '/').replace(/\/$/, '');
    const normalizedFilePath = filePath?.replace(/\\/g, '/').replace(/\/$/, '');

    console.log('[useFileVersion] Comparing paths:', {
      eventPath: normalizedEventPath,
      watchingPath: normalizedFilePath,
      match: normalizedEventPath === normalizedFilePath
    });

    if (normalizedFilePath && normalizedEventPath === normalizedFilePath) {
      console.log('[useFileVersion] File version bumped:', filePath);
      setVersion();
    }
  }, [filePath]);

  useFileWatcher({ projectPath, onFileChange: handleFileChange });

  return version;
}

