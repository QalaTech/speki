import { useRef, useEffect, useState, useCallback } from 'react';
import * as monaco from 'monaco-editor';
import { HunkControlPill } from './HunkControlPill';

interface DiffOverlayProps {
  title: string;
  originalText: string;
  proposedText: string;
  onApprove: (finalContent: string) => void;
  onReject: () => void;
  onCancel: () => void;
  language?: string;
}

interface Hunk {
  originalStartLineNumber: number;
  originalEndLineNumber: number;
  modifiedStartLineNumber: number;
  modifiedEndLineNumber: number;
}

function createHunkId(h: Hunk): string {
  return `hunk-${h.originalStartLineNumber}-${h.originalEndLineNumber}-${h.modifiedStartLineNumber}-${h.modifiedEndLineNumber}`;
}

function getLinesText(model: monaco.editor.ITextModel, startLine: number, endLine: number): string {
  if (startLine > endLine || startLine < 1) return '';
  const range = new monaco.Range(startLine, 1, endLine, model.getLineMaxColumn(endLine));
  return model.getValueInRange(range);
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

  const [hunks, setHunks] = useState<Hunk[]>([]);
  const [isEditing, setIsEditing] = useState(false);

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
      setHunks(changes as Hunk[]);
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

  // Accept a specific hunk
  const handleAcceptHunk = useCallback((hunk: Hunk) => {
    const originalModel = originalModelRef.current;
    const modifiedModel = modifiedModelRef.current;
    if (!originalModel || !modifiedModel) return;

    const modifiedHunkText = getLinesText(modifiedModel, hunk.modifiedStartLineNumber, hunk.modifiedEndLineNumber);

    // Apply modified content to original
    const startLine = hunk.originalStartLineNumber;
    const endLine = hunk.originalEndLineNumber;

    if (startLine > endLine) {
      // Pure insertion
      const position = { lineNumber: startLine, column: 1 };
      originalModel.pushEditOperations(
        [],
        [{ range: new monaco.Range(position.lineNumber, 1, position.lineNumber, 1), text: modifiedHunkText + '\n' }],
        () => null
      );
    } else {
      // Replacement
      const range = new monaco.Range(startLine, 1, endLine, originalModel.getLineMaxColumn(endLine));
      originalModel.pushEditOperations([], [{ range, text: modifiedHunkText }], () => null);
    }
  }, []);

  // Reject a specific hunk
  const handleRejectHunk = useCallback((hunk: Hunk) => {
    const originalModel = originalModelRef.current;
    const modifiedModel = modifiedModelRef.current;
    if (!originalModel || !modifiedModel) return;

    const originalHunkText = getLinesText(originalModel, hunk.originalStartLineNumber, hunk.originalEndLineNumber);

    // Revert modified to original
    const startLine = hunk.modifiedStartLineNumber;
    const endLine = hunk.modifiedEndLineNumber;

    if (startLine > endLine) {
      // Pure deletion in modified - nothing to do
      return;
    }

    const range = new monaco.Range(startLine, 1, endLine, modifiedModel.getLineMaxColumn(endLine));
    modifiedModel.pushEditOperations([], [{ range, text: originalHunkText }], () => null);
  }, []);

  // Comment on a hunk
  const handleCommentHunk = useCallback((hunk: Hunk) => {
    // TODO: Open chat with context
    console.log('Comment on hunk:', hunk);
  }, []);

  // Handle approve all
  const handleApprove = () => {
    const modifiedModel = modifiedModelRef.current;
    if (modifiedModel) {
      onApprove(modifiedModel.getValue());
    }
  };

  // Toggle edit mode
  const handleToggleEdit = () => {
    setIsEditing(!isEditing);
    if (diffEditorRef.current) {
      diffEditorRef.current.updateOptions({ readOnly: isEditing });
    }
  };

  const btnBase = "flex items-center gap-1.5 py-2 px-3.5 bg-muted border border-border rounded-lg text-foreground text-[13px] font-medium cursor-pointer transition-all duration-150 hover:bg-background hover:border-muted-foreground/30";

  return (
    <div className="fixed inset-0 z-1000 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-xs" onClick={onCancel} />

      <div className="relative flex flex-col w-[calc(100vw-80px)] h-[calc(100vh-80px)] max-w-[1600px] bg-background border border-border rounded-xl shadow-[0_24px_48px_rgba(0,0,0,0.5)] overflow-hidden">
        <header className="flex items-center justify-between py-4 px-5 bg-secondary border-b border-border">
          <h2 className="m-0 text-[15px] font-semibold text-foreground">{title}</h2>
            <div className="flex gap-2">
              <button
                className={`${btnBase} ${isEditing ? 'bg-[rgba(163,113,247,0.15)] border-[#a371f7] text-[#a371f7]' : ''}`}
                onClick={handleToggleEdit}
              >
                {isEditing ? '📝 Editing' : '✏️ Edit'}
              </button>
              <button className={`${btnBase} text-muted-foreground/60 hover:text-foreground`} onClick={onCancel}>
                Cancel
              </button>
              <button className={`${btnBase} bg-[rgba(218,54,51,0.1)] border-[rgba(218,54,51,0.3)] text-[#f85149] hover:bg-[rgba(218,54,51,0.2)] hover:border-[#f85149]`} onClick={onReject}>
                ✗ Reject All
              </button>
              <button className={`${btnBase} bg-[rgba(35,134,54,0.15)] border-[rgba(35,134,54,0.3)] text-[#3fb950] hover:bg-[rgba(35,134,54,0.25)] hover:border-[#3fb950]`} onClick={handleApprove}>
                ✓ Apply Changes
              </button>
            </div>
          </header>

          <div className="relative flex-1 overflow-hidden">
            <div className="absolute top-0 left-0 right-0 flex z-10 pointer-events-none">
              <span className="flex-1 py-2 px-4 text-[11px] font-semibold uppercase tracking-[0.05em] bg-[rgba(22,27,34,0.9)] backdrop-blur-[4px] text-[#f85149] border-b-2 border-[rgba(218,54,51,0.3)]">Original</span>
              <span className="flex-1 py-2 px-4 text-[11px] font-semibold uppercase tracking-[0.05em] bg-[rgba(22,27,34,0.9)] backdrop-blur-[4px] text-[#3fb950] border-b-2 border-[rgba(35,134,54,0.3)]">
                {isEditing ? 'Editing...' : 'Proposed'}
              </span>
            </div>

            <div className="diff-editor-container h-full pt-9" ref={containerRef} />

            {/* Render hunk controls */}
            {hunks.map((hunk) => (
              <HunkControlPill
                key={createHunkId(hunk)}
                hunk={hunk}
                onAccept={() => handleAcceptHunk(hunk)}
                onReject={() => handleRejectHunk(hunk)}
                onComment={() => handleCommentHunk(hunk)}
                editorRef={diffEditorRef}
              />
            ))}
          </div>

        <footer className="flex items-center justify-between py-3 px-5 bg-secondary border-t border-border">
          <div className="flex gap-4">
            <span className="text-xs text-secondary-foreground/60">{hunks.length} changes</span>
          </div>
          <div className="text-xs text-muted-foreground/60">
            Press <kbd className="inline-block py-0.5 px-1.5 bg-muted border border-border rounded text-[11px] text-foreground">Esc</kbd> to cancel • <kbd className="inline-block py-0.5 px-1.5 bg-muted border border-border rounded text-[11px] text-foreground">A</kbd> accept hunk • <kbd className="inline-block py-0.5 px-1.5 bg-muted border border-border rounded text-[11px] text-foreground">R</kbd> reject hunk
          </div>
        </footer>
        </div>
      </div>
  );
}
