import { useState, useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import './SpecEditorModal.css';

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

  return (
    <div className="editor-modal">
      <div className="editor-modal-backdrop" onClick={handleClose} />

      <div className="editor-modal-container">
        <header className="editor-modal-header">
          <div className="editor-modal-title">
            <span className="editor-modal-icon">✏️</span>
            <span className="editor-modal-filename">{fileName}</span>
            {isDirty && <span className="editor-modal-dirty">●</span>}
          </div>

          <div className="editor-modal-actions">
            {error && <span className="editor-modal-error">{error}</span>}
            <button
              className="editor-modal-btn editor-modal-btn--cancel"
              onClick={handleClose}
            >
              Cancel
            </button>
            <button
              className="editor-modal-btn editor-modal-btn--save"
              onClick={handleSave}
              disabled={!isDirty || isSaving}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </header>

        <div className="editor-modal-content" ref={containerRef} />

        <footer className="editor-modal-footer">
          <span className="editor-modal-hint">
            <kbd>⌘S</kbd> Save • <kbd>Esc</kbd> Close
          </span>
          <span className="editor-modal-path">{filePath}</span>
        </footer>
      </div>
    </div>
  );
}
