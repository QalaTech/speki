import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../components/ui/ErrorContext';
import type { SpecFileNode } from '../components/specs/SpecTree';
import type { GeneratingTechSpecInfo } from '../components/specs/types';

interface UseSpecFileTreeOptions {
  projectPath: string;
  onAutoSelectFile?: (path: string) => void;
}

interface UseSpecFileTreeReturn {
  files: SpecFileNode[];
  isLoading: boolean;
  isGeneratingTechSpec: boolean;
  generatingTechSpecInfo: GeneratingTechSpecInfo | null;
  setIsGeneratingTechSpec: (value: boolean) => void;
  setGeneratingTechSpecInfo: (info: GeneratingTechSpecInfo | null) => void;
  refreshFiles: () => Promise<SpecFileNode[]>;
}

/**
 * Merge review statuses into the file tree
 */
function mergeStatusesIntoTree(
  nodes: SpecFileNode[],
  statuses: Record<string, string>
): SpecFileNode[] {
  return nodes.map(node => {
    if (node.type === 'file') {
      return {
        ...node,
        reviewStatus: (statuses[node.path] || 'none') as SpecFileNode['reviewStatus'],
      };
    }
    if (node.children) {
      return {
        ...node,
        children: mergeStatusesIntoTree(node.children, statuses),
      };
    }
    return node;
  });
}

/**
 * Find first file in tree (DFS)
 */
function findFirstFile(nodes: SpecFileNode[]): SpecFileNode | null {
  for (const node of nodes) {
    if (node.type === 'file') return node;
    if (node.children) {
      const found = findFirstFile(node.children);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Hook for managing the spec file tree with status merging and generation polling.
 */
export function useSpecFileTree({
  projectPath,
  onAutoSelectFile,
}: UseSpecFileTreeOptions): UseSpecFileTreeReturn {
  const [files, setFiles] = useState<SpecFileNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingTechSpec, setIsGeneratingTechSpec] = useState(false);
  const [generatingTechSpecInfo, setGeneratingTechSpecInfo] = useState<GeneratingTechSpecInfo | null>(null);

  // Use ref to avoid callback in dependency array (prevents infinite loops)
  const onAutoSelectFileRef = useRef(onAutoSelectFile);
  onAutoSelectFileRef.current = onAutoSelectFile;

  // API helper
  const apiUrl = useCallback((endpoint: string) => {
    const separator = endpoint.includes('?') ? '&' : '?';
    return `${endpoint}${separator}project=${encodeURIComponent(projectPath)}`;
  }, [projectPath]);

  // Refresh files function
  const refreshFiles = useCallback(async () => {
    try {
      const [filesRes, statusesRes] = await Promise.all([
        apiFetch(apiUrl('/api/spec-review/files')),
        apiFetch(apiUrl('/api/sessions/statuses')),
      ]);

      const filesData = await filesRes.json();
      const statusesData = await statusesRes.json();

      const filesWithStatus = mergeStatusesIntoTree(
        filesData.files || [],
        statusesData.statuses || {}
      );
      setFiles(filesWithStatus);
      return filesWithStatus;
    } catch (err) {
      console.error('Failed to refresh spec files:', err);
      return [];
    }
  }, [apiUrl]);

  // Fetch tree structure, statuses, and generation status on mount/project change
  useEffect(() => {
    async function fetchFilesAndStatuses() {
      setIsLoading(true);
      try {
        // Fetch all in parallel
        const [filesRes, statusesRes, generationRes] = await Promise.all([
          apiFetch(apiUrl('/api/spec-review/files')),
          apiFetch(apiUrl('/api/sessions/statuses')),
          apiFetch(apiUrl('/api/decompose/generation-status')),
        ]);

        const filesData = await filesRes.json();
        const statusesData = await statusesRes.json();
        const generationData = await generationRes.json();

        // Merge statuses into tree
        const filesWithStatus = mergeStatusesIntoTree(
          filesData.files || [],
          statusesData.statuses || {}
        );
        setFiles(filesWithStatus);

        // Restore generation state if a generation is in progress
        if (generationData.generating) {
          setIsGeneratingTechSpec(true);
          setGeneratingTechSpecInfo({
            parentPath: `specs/${generationData.prdSpecId}.md`,
            name: generationData.techSpecName,
          });
        }

        // Auto-select first file if callback provided and no selection
        if (onAutoSelectFileRef.current && filesWithStatus?.length > 0) {
          const firstFile = findFirstFile(filesWithStatus);
          if (firstFile) onAutoSelectFileRef.current(firstFile.path);
        }
      } catch (err) {
        console.error('Failed to fetch spec files:', err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchFilesAndStatuses();
  }, [projectPath, apiUrl]);

  // Poll for generation completion when generating
  useEffect(() => {
    if (!isGeneratingTechSpec) return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await apiFetch(apiUrl('/api/decompose/generation-status'));
        const data = await res.json();

        if (!data.generating) {
          // Generation completed - clear state and refresh file list
          setIsGeneratingTechSpec(false);
          setGeneratingTechSpecInfo(null);
          await refreshFiles();
        }
      } catch (err) {
        console.error('Failed to poll generation status:', err);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [isGeneratingTechSpec, apiUrl, refreshFiles]);

  return {
    files,
    isLoading,
    isGeneratingTechSpec,
    generatingTechSpecInfo,
    setIsGeneratingTechSpec,
    setGeneratingTechSpecInfo,
    refreshFiles,
  };
}
