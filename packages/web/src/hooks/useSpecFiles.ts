import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch } from "../components/ui/ErrorContext";

interface SpecFile {
  name: string;
  path: string;
  content?: string;
}

export interface UseSpecFilesOptions {
  apiUrl: (endpoint: string) => string;
  onContentLoad?: (content: string) => void;
}

export interface UseSpecFilesReturn {
  files: SpecFile[];
  selectedFile: string;
  specContent: string;
  loading: boolean;
  setSelectedFile: (file: string) => void;
  resetFileRef: () => void;
}

export function useSpecFiles({
  apiUrl,
  onContentLoad,
}: UseSpecFilesOptions): UseSpecFilesReturn {
  const [files, setFiles] = useState<SpecFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [specContent, setSpecContent] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Content loading refs
  const lastLoadedFileRef = useRef<string | null>(null);
  const isLoadingContentRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch spec files when apiUrl (project) changes
  useEffect(() => {
    // Clear selection immediately when project changes to prevent stale file + new project mismatch
    setSelectedFile("");
    setSpecContent("");
    lastLoadedFileRef.current = null;

    const fetchFiles = async (): Promise<void> => {
      try {
        setLoading(true);
        const response = await apiFetch(apiUrl("/api/spec-review/files"));
        const data = await response.json();
        const fileList = data.files || [];
        setFiles(fileList);
        if (fileList.length > 0) {
          setSelectedFile(fileList[0].path);
        }
      } catch (error) {
        console.error("Failed to fetch spec files:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchFiles();
  }, [apiUrl]);

  // Load spec content when file is selected
  useEffect(() => {
    if (!selectedFile) return;

    // Guard against re-loading the same file
    if (lastLoadedFileRef.current === selectedFile) return;

    // Guard against concurrent loads
    if (isLoadingContentRef.current) return;

    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    isLoadingContentRef.current = true;
    lastLoadedFileRef.current = selectedFile;

    const loadContent = async (): Promise<void> => {
      try {
        const encodedPath = encodeURIComponent(selectedFile);

        const contentResponse = await apiFetch(
          apiUrl(`/api/spec-review/content/${encodedPath}`),
          { signal: controller.signal }
        );
        const data = await contentResponse.json();
        const content = data.content || "";
        setSpecContent(content);
        onContentLoad?.(content);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        console.error("Failed to load spec content:", error);
      } finally {
        isLoadingContentRef.current = false;
      }
    };

    loadContent();

    return () => {
      controller.abort();
    };
  }, [selectedFile, apiUrl, onContentLoad]);

  // Reset the file ref so the file will be reloaded
  const resetFileRef = useCallback(() => {
    lastLoadedFileRef.current = null;
  }, []);

  return {
    files,
    selectedFile,
    specContent,
    loading,
    setSelectedFile,
    resetFileRef,
  };
}
