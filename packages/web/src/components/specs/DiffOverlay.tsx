import { useRef, useEffect, useState } from 'react';
import * as monaco from 'monaco-editor';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Button } from '../ui/Button';

interface DiffOverlayProps {
  title: string;
  originalText: string;
  proposedText: string;
  onApprove: (finalContent: string) => Promise<void> | void;
  onReject: () => Promise<void> | void;
  onCancel: () => void;
  language?: string;
}

export function DiffOverlay({
  title,
  originalText,
  proposedText,
  onApprove,
  onReject,
  onCancel,
  language = 'markdown',
}: DiffOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const originalModelRef = useRef<monaco.editor.ITextModel | null>(null);
  const modifiedModelRef = useRef<monaco.editor.ITextModel | null>(null);
  const isMountedRef = useRef(true);

  const [changeCount, setChangeCount] = useState(0);
  const [pendingAction, setPendingAction] = useState<'apply' | 'reject' | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  // Initialize Monaco diff editor
  useEffect(() => {
    if (!containerRef.current) return;

    // Create models
    const originalModel = monaco.editor.createModel(originalText, language);
    const modifiedModel = monaco.editor.createModel(proposedText, language);
    originalModelRef.current = originalModel;
    modifiedModelRef.current = modifiedModel;

    // Create diff editor with our theme settings
    const diffEditor = monaco.editor.createDiffEditor(containerRef.current, {
      automaticLayout: true,
      readOnly: false,
      renderSideBySide: true,
      renderIndicators: true,
      originalEditable: false,
      ignoreTrimWhitespace: false,
      minimap: { enabled: false },
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      theme: 'vs-dark',
      fontSize: 13,
      lineHeight: 20,
      padding: { top: 16, bottom: 16 },
      scrollbar: {
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
      },
    });

    diffEditor.setModel({ original: originalModel, modified: modifiedModel });
    diffEditorRef.current = diffEditor;

    // Update hunks when diff changes
    const updateHunks = () => {
      const changes = diffEditor.getLineChanges() ?? [];
      setChangeCount(changes.length);
    };

    const disposable = diffEditor.onDidUpdateDiff(updateHunks);

    // Initial update and scroll to first change
    setTimeout(() => {
      updateHunks();
      const changes = diffEditor.getLineChanges();
      if (changes && changes.length > 0) {
        const firstChange = changes[0];
        diffEditor.getModifiedEditor().revealLineInCenter(firstChange.modifiedStartLineNumber);
      }
    }, 100);

    return () => {
      disposable.dispose();
      diffEditor.dispose();
      originalModel.dispose();
      modifiedModel.dispose();
    };
  }, [originalText, proposedText, language]);

  // Handle approve all
  const handleApprove = async () => {
    const modifiedModel = modifiedModelRef.current;
    if (modifiedModel) {
      setPendingAction('apply');
      try {
        await onApprove(modifiedModel.getValue());
      } finally {
        if (isMountedRef.current) {
          setPendingAction(null);
        }
      }
    }
  };

  const handleReject = async () => {
    setPendingAction('reject');
    try {
      await onReject();
    } finally {
      if (isMountedRef.current) {
        setPendingAction(null);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-1000 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-xs" onClick={onCancel} />

      <div className="relative flex flex-col w-[calc(100vw-96px)] h-[calc(100dvh-96px)] max-w-[1600px] bg-card/95 backdrop-blur-xl border border-border/60 rounded-2xl shadow-[0_24px_72px_rgba(0,0,0,0.55)] overflow-hidden">
        <header className="flex items-start justify-between gap-4 py-4 px-5 bg-muted/25 border-b border-border/60">
          <div className="min-w-0">
            <p className="m-0 text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">Review Suggestion</p>
            <h2 className="m-0 mt-1 text-[15px] font-semibold text-foreground break-words">{title}</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground"
            onClick={onCancel}
            aria-label="Close diff overlay"
          >
            <XMarkIcon className="w-4 h-4" />
          </Button>
        </header>

        <div className="relative flex-1 overflow-hidden">
          <div className="absolute top-0 left-0 right-0 flex z-10 pointer-events-none">
            <span className="flex-1 py-2 px-4 text-[11px] font-semibold uppercase tracking-[0.05em] bg-[rgba(22,27,34,0.9)] backdrop-blur-[4px] text-[#f85149] border-b border-[rgba(218,54,51,0.35)]">Original</span>
            <span className="flex-1 py-2 px-4 text-[11px] font-semibold uppercase tracking-[0.05em] bg-[rgba(22,27,34,0.9)] backdrop-blur-[4px] text-[#3fb950] border-b border-[rgba(35,134,54,0.35)]">
              Proposed (Editable)
            </span>
          </div>

          <div className="diff-editor-container h-full pt-9" ref={containerRef} />
        </div>

        <footer className="flex items-center justify-between py-3 px-5 bg-muted/25 border-t border-border/60">
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground">{changeCount} change{changeCount === 1 ? '' : 's'}</span>
            <span className="text-xs text-muted-foreground/75">
              Press <kbd className="inline-block py-0.5 px-1.5 bg-muted border border-border rounded text-[11px] text-foreground">Esc</kbd> to dismiss
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { void handleReject(); }}
              disabled={pendingAction !== null}
              className="h-9 rounded-lg border-error/35 text-error hover:bg-error/10"
            >
              Reject Change
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => { void handleApprove(); }}
              isLoading={pendingAction === 'apply'}
              loadingText="Applying..."
              disabled={pendingAction === 'reject'}
              className="h-9 rounded-lg"
            >
              Apply Changes
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
