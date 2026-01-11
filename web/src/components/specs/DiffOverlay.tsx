import { useRef, useEffect, useState, useCallback } from 'react';
import * as monaco from 'monaco-editor';
import { HunkControlPill } from './HunkControlPill';
import './DiffOverlay.css';

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

  return (
    <div className="diff-overlay">
      <div className="diff-overlay-backdrop" onClick={onCancel} />

      <div className="diff-overlay-container">
        <header className="diff-overlay-header">
          <h2 className="diff-overlay-title">{title}</h2>
          <div className="diff-overlay-actions">
            <button
              className={`diff-overlay-btn diff-overlay-btn--edit ${isEditing ? 'diff-overlay-btn--active' : ''}`}
              onClick={handleToggleEdit}
            >
              {isEditing ? '📝 Editing' : '✏️ Edit'}
            </button>
            <button className="diff-overlay-btn diff-overlay-btn--cancel" onClick={onCancel}>
              Cancel
            </button>
            <button className="diff-overlay-btn diff-overlay-btn--reject" onClick={onReject}>
              ✗ Reject All
            </button>
            <button className="diff-overlay-btn diff-overlay-btn--approve" onClick={handleApprove}>
              ✓ Apply Changes
            </button>
          </div>
        </header>

        <div className="diff-overlay-content">
          <div className="diff-overlay-labels">
            <span className="diff-overlay-label diff-overlay-label--original">Original</span>
            <span className="diff-overlay-label diff-overlay-label--proposed">
              {isEditing ? 'Editing...' : 'Proposed'}
            </span>
          </div>

          <div className="diff-overlay-editor" ref={containerRef} />

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

        <footer className="diff-overlay-footer">
          <div className="diff-overlay-stats">
            <span className="diff-stat diff-stat--hunks">{hunks.length} changes</span>
          </div>
          <div className="diff-overlay-hint">
            Press <kbd>Esc</kbd> to cancel • <kbd>A</kbd> accept hunk • <kbd>R</kbd> reject hunk
          </div>
        </footer>
      </div>
    </div>
  );
}
