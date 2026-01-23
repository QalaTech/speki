import { useState, useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';

interface SpecEditorModalProps {
  isOpen: boolean;
  filePath: string;
  fileName: string;
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  onClose: () => void;
}

export function SpecEditorModal({
  isOpen,
  filePath,
  fileName,
  initialContent,
  onSave,
  onClose,
}: SpecEditorModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [content, setContent] = useState(initialContent);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine language from file extension
  const getLanguage = (path: string): string => {
    const ext = path.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'md':
      case 'mdx':
      case 'markdown':
        return 'markdown';
      case 'yaml':
      case 'yml':
        return 'yaml';
      case 'json':
        return 'json';
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'js':
      case 'jsx':
        return 'javascript';
      default:
        return 'plaintext';
    }
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + S to save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      // Escape to close (if not dirty, or confirm)
      if (e.key === 'Escape') {
        if (!isDirty) {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDirty, onClose]);

  // Initialize Monaco editor
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const editor = monaco.editor.create(containerRef.current, {
      value: initialContent,
      language: getLanguage(filePath),
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      lineHeight: 22,
      padding: { top: 16, bottom: 16 },
      wordWrap: 'on',
      scrollBeyondLastLine: false,
      renderWhitespace: 'selection',
      tabSize: 2,
    });

    editorRef.current = editor;

    // Track changes
    editor.onDidChangeModelContent(() => {
      const newContent = editor.getValue();
      setContent(newContent);
      setIsDirty(newContent !== initialContent);
    });

    // Focus editor
    editor.focus();

    return () => {
      editor.dispose();
      editorRef.current = null;
    };
  }, [isOpen, filePath, initialContent]);

  // Handle save
  const handleSave = async () => {
    if (isSaving || !isDirty) return;

    setIsSaving(true);
    setError(null);

    try {
      await onSave(content);
      setIsDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle close with unsaved changes
  const handleClose = () => {
    if (isDirty) {
      if (confirm('You have unsaved changes. Discard them?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  const btnBase = "py-2 px-4 border border-border rounded-md text-[13px] font-medium cursor-pointer transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-[4px]" onClick={handleClose} />

      <div className="relative flex flex-col w-[calc(100vw-80px)] h-[calc(100vh-80px)] max-w-[1200px] bg-bg border border-border rounded-xl shadow-[0_24px_48px_rgba(0,0,0,0.5)] overflow-hidden">
        <header className="flex items-center justify-between py-3 px-5 bg-surface border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-base">✏️</span>
            <span className="text-sm font-semibold text-text">{fileName}</span>
            {isDirty && <span className="text-warning text-xs">●</span>}
          </div>

          <div className="flex items-center gap-3">
            {error && <span className="text-xs text-[#f85149]">{error}</span>}
            <button
              className={`${btnBase} bg-transparent text-text-muted hover:bg-surface-hover hover:text-text`}
              onClick={handleClose}
            >
              Cancel
            </button>
            <button
              className={`${btnBase} bg-primary border-primary text-white hover:bg-primary-hover`}
              onClick={handleSave}
              disabled={!isDirty || isSaving}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-hidden" ref={containerRef} />

        <footer className="flex items-center justify-between py-2 px-5 bg-surface border-t border-border">
          <span className="text-xs text-text-muted">
            <kbd className="inline-block py-0.5 px-1.5 bg-surface-hover border border-border rounded text-[11px] text-text mr-1">⌘S</kbd> Save • 
            <kbd className="inline-block py-0.5 px-1.5 bg-surface-hover border border-border rounded text-[11px] text-text mx-1">Esc</kbd> Close
          </span>
          <span className="font-mono text-[11px] text-text-muted">{filePath}</span>
        </footer>
      </div>
    </div>
  );
}
