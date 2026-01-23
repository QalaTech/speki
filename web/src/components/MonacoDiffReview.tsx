/**
 * Monaco Diff Editor with inline hunk controls (Accept/Reject/Comment).
 * Used for reviewing AI-suggested changes to spec files.
 */

import { useEffect, useRef, useCallback } from 'react';
import * as monaco from 'monaco-editor';

type Hunk = monaco.editor.ILineChange;

export interface HunkAction {
  hunk: Hunk;
  hunkId: string;
  originalText: string;
  modifiedText: string;
}

export interface MonacoDiffReviewProps {
  /** Original document content (before changes) */
  originalText: string;
  /** Modified document content (with proposed changes) */
  modifiedText: string;
  /** Language for syntax highlighting */
  language?: string;
  /** Called when user accepts a hunk - original is updated to match modified */
  onAcceptHunk?: (action: HunkAction) => void;
  /** Called when user rejects a hunk - modified is reverted to original */
  onRejectHunk?: (action: HunkAction) => void;
  /** Called when user wants to comment on a hunk */
  onCommentHunk?: (action: HunkAction) => void;
  /** Called when original content changes (after accept) */
  onOriginalChange?: (content: string) => void;
  /** Called when modified content changes (after reject) */
  onModifiedChange?: (content: string) => void;
  /** Called when all hunks are resolved */
  onAllResolved?: () => void;
  /** Read-only mode - hide action buttons */
  readOnly?: boolean;
}

/** Create a stable ID for a hunk */
function createHunkId(h: Hunk): string {
  return `hunk_${h.originalStartLineNumber}_${h.originalEndLineNumber}_${h.modifiedStartLineNumber}_${h.modifiedEndLineNumber}`;
}

/** Get text covering [startLine..endLine] inclusive */
function getLinesText(model: monaco.editor.ITextModel, startLine: number, endLine: number): string {
  if (startLine === 0 && endLine === 0) return '';
  const safeStart = Math.max(1, startLine);
  const safeEnd = Math.max(safeStart, endLine);
  const endCol = model.getLineMaxColumn(safeEnd);
  return model.getValueInRange(new monaco.Range(safeStart, 1, safeEnd, endCol));
}

/** Replace whole-line ranges in a model */
function applyRangeReplaceByLines(
  model: monaco.editor.ITextModel,
  startLine: number,
  endLine: number,
  replacementText: string
): void {
  const lineCount = model.getLineCount();
  const safeStart = Math.max(1, Math.min(startLine || 1, lineCount));
  const safeEnd = Math.max(1, Math.min(endLine || safeStart, lineCount));
  const start = Math.min(safeStart, safeEnd);
  const end = Math.max(safeStart, safeEnd);

  const range = new monaco.Range(start, 1, end, model.getLineMaxColumn(end));

  model.pushEditOperations(
    [],
    [{ range, text: replacementText, forceMoveMarkers: true }],
    () => null
  );
}

/** Create a Monaco content widget with action buttons */
function createHunkWidget(opts: {
  id: string;
  hunk: Hunk;
  getPositionLine: () => number;
  onAccept: () => void;
  onReject: () => void;
  onComment: () => void;
  readOnly?: boolean;
}): monaco.editor.IContentWidget {
  const domNode = document.createElement('div');
  domNode.className = 'monaco-hunk-widget';

  const label = document.createElement('span');
  label.className = 'hunk-label';
  label.textContent = 'Change';
  domNode.appendChild(label);

  if (!opts.readOnly) {
    const createButton = (text: string, className: string, onClick: () => void) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `hunk-btn ${className}`;
      btn.textContent = text;
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      };
      return btn;
    };

    domNode.appendChild(createButton('Accept', 'hunk-btn-accept', opts.onAccept));
    domNode.appendChild(createButton('Reject', 'hunk-btn-reject', opts.onReject));
    domNode.appendChild(createButton('Comment', 'hunk-btn-comment', opts.onComment));
  }

  return {
    getId: () => opts.id,
    getDomNode: () => domNode,
    getPosition: () => ({
      position: { lineNumber: opts.getPositionLine(), column: 1 },
      preference: [
        monaco.editor.ContentWidgetPositionPreference.ABOVE,
        monaco.editor.ContentWidgetPositionPreference.BELOW,
      ],
    }),
  };
}

export function MonacoDiffReview({
  originalText,
  modifiedText,
  language = 'markdown',
  onAcceptHunk,
  onRejectHunk,
  onCommentHunk,
  onOriginalChange,
  onModifiedChange,
  onAllResolved,
  readOnly = false,
}: MonacoDiffReviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const originalModelRef = useRef<monaco.editor.ITextModel | null>(null);
  const modifiedModelRef = useRef<monaco.editor.ITextModel | null>(null);
  const widgetsRef = useRef<Map<string, monaco.editor.IContentWidget>>(new Map());

  const acceptHunk = useCallback((h: Hunk) => {
    const originalModel = originalModelRef.current;
    const modifiedModel = modifiedModelRef.current;
    if (!originalModel || !modifiedModel) return;

    const hunkId = createHunkId(h);
    const originalHunkText = getLinesText(originalModel, h.originalStartLineNumber, h.originalEndLineNumber);
    const modifiedHunkText = getLinesText(modifiedModel, h.modifiedStartLineNumber, h.modifiedEndLineNumber);

    // Apply modified content to original
    applyRangeReplaceByLines(
      originalModel,
      h.originalStartLineNumber,
      h.originalEndLineNumber,
      modifiedHunkText
    );

    const newOriginal = originalModel.getValue();
    onOriginalChange?.(newOriginal);
    onAcceptHunk?.({
      hunk: h,
      hunkId,
      originalText: originalHunkText,
      modifiedText: modifiedHunkText,
    });

    // Check if all hunks resolved
    setTimeout(() => {
      const changes = diffEditorRef.current?.getLineChanges() ?? [];
      if (changes.length === 0) {
        onAllResolved?.();
      }
    }, 100);
  }, [onAcceptHunk, onOriginalChange, onAllResolved]);

  const rejectHunk = useCallback((h: Hunk) => {
    const originalModel = originalModelRef.current;
    const modifiedModel = modifiedModelRef.current;
    if (!originalModel || !modifiedModel) return;

    const hunkId = createHunkId(h);
    const originalHunkText = getLinesText(originalModel, h.originalStartLineNumber, h.originalEndLineNumber);
    const modifiedHunkText = getLinesText(modifiedModel, h.modifiedStartLineNumber, h.modifiedEndLineNumber);

    // Revert modified content to original
    applyRangeReplaceByLines(
      modifiedModel,
      h.modifiedStartLineNumber,
      h.modifiedEndLineNumber,
      originalHunkText
    );

    const newModified = modifiedModel.getValue();
    onModifiedChange?.(newModified);
    onRejectHunk?.({
      hunk: h,
      hunkId,
      originalText: originalHunkText,
      modifiedText: modifiedHunkText,
    });

    // Check if all hunks resolved
    setTimeout(() => {
      const changes = diffEditorRef.current?.getLineChanges() ?? [];
      if (changes.length === 0) {
        onAllResolved?.();
      }
    }, 100);
  }, [onRejectHunk, onModifiedChange, onAllResolved]);

  const commentHunk = useCallback((h: Hunk) => {
    const originalModel = originalModelRef.current;
    const modifiedModel = modifiedModelRef.current;
    if (!originalModel || !modifiedModel) return;

    const hunkId = createHunkId(h);
    const originalHunkText = getLinesText(originalModel, h.originalStartLineNumber, h.originalEndLineNumber);
    const modifiedHunkText = getLinesText(modifiedModel, h.modifiedStartLineNumber, h.modifiedEndLineNumber);

    onCommentHunk?.({
      hunk: h,
      hunkId,
      originalText: originalHunkText,
      modifiedText: modifiedHunkText,
    });
  }, [onCommentHunk]);

  const renderHunkWidgets = useCallback(() => {
    const diffEditor = diffEditorRef.current;
    if (!diffEditor) return;

    const modifiedEditor = diffEditor.getModifiedEditor();
    const changes = diffEditor.getLineChanges() ?? [];

    // Remove widgets that no longer exist
    const nextIds = new Set(changes.map(createHunkId));
    for (const [id, widget] of widgetsRef.current.entries()) {
      if (!nextIds.has(id)) {
        modifiedEditor.removeContentWidget(widget);
        widgetsRef.current.delete(id);
      }
    }

    // Add widgets for new hunks
    for (const h of changes) {
      const id = createHunkId(h);
      if (widgetsRef.current.has(id)) continue;

      const widget = createHunkWidget({
        id,
        hunk: h,
        getPositionLine: () => Math.max(1, h.modifiedStartLineNumber || 1),
        onAccept: () => acceptHunk(h),
        onReject: () => rejectHunk(h),
        onComment: () => commentHunk(h),
        readOnly,
      });

      widgetsRef.current.set(id, widget);
      modifiedEditor.addContentWidget(widget);
    }
  }, [acceptHunk, rejectHunk, commentHunk, readOnly]);

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current) return;

    // Create models
    const originalModel = monaco.editor.createModel(originalText, language);
    const modifiedModel = monaco.editor.createModel(modifiedText, language);
    originalModelRef.current = originalModel;
    modifiedModelRef.current = modifiedModel;

    // Create diff editor
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
    });

    diffEditor.setModel({ original: originalModel, modified: modifiedModel });
    diffEditorRef.current = diffEditor;

    // Render widgets when diff updates
    const disposable = diffEditor.onDidUpdateDiff(() => {
      renderHunkWidgets();
    });

    // Initial render
    setTimeout(renderHunkWidgets, 100);

    return () => {
      disposable.dispose();
      for (const w of widgetsRef.current.values()) {
        diffEditor.getModifiedEditor().removeContentWidget(w);
      }
      widgetsRef.current.clear();
      diffEditor.dispose();
      originalModel.dispose();
      modifiedModel.dispose();
    };
  }, [language, renderHunkWidgets]);

  // Sync content when props change
  useEffect(() => {
    const originalModel = originalModelRef.current;
    const modifiedModel = modifiedModelRef.current;
    if (!originalModel || !modifiedModel) return;

    if (originalModel.getValue() !== originalText) {
      originalModel.setValue(originalText);
    }
    if (modifiedModel.getValue() !== modifiedText) {
      modifiedModel.setValue(modifiedText);
    }
  }, [originalText, modifiedText]);

  return (
    <>
      <style>{`
        .monaco-hunk-widget { display: inline-flex; gap: 6px; align-items: center; padding: 4px 8px; border-radius: 6px; background: var(--color-surface); border: 1px solid var(--color-border); box-shadow: 0 2px 8px rgba(0,0,0,0.3); font-size: 12px; user-select: none; z-index: 100; }
        .hunk-label { color: var(--color-text-muted); font-weight: 500; margin-right: 4px; }
        .hunk-btn { cursor: pointer; border: 1px solid var(--color-border); border-radius: 4px; padding: 2px 8px; background: var(--color-surface-hover); color: var(--color-text); font-size: 11px; font-weight: 500; transition: all 0.15s ease; }
        .hunk-btn:hover { border-color: var(--color-accent); }
        .hunk-btn-accept { background: rgba(34,197,94,0.2); border-color: #22c55e; color: #22c55e; }
        .hunk-btn-accept:hover { background: rgba(34,197,94,0.3); }
        .hunk-btn-reject { background: rgba(239,68,68,0.2); border-color: #ef4444; color: #ef4444; }
        .hunk-btn-reject:hover { background: rgba(239,68,68,0.3); }
        .hunk-btn-comment { background: rgba(59,130,246,0.2); border-color: #3b82f6; color: #3b82f6; }
        .hunk-btn-comment:hover { background: rgba(59,130,246,0.3); }
      `}</style>
      <div className="flex flex-col h-full w-full bg-surface rounded-lg overflow-hidden" data-testid="monaco-diff-review">
        <div ref={containerRef} className="flex-1 min-h-[400px]" />
      </div>
    </>
  );
}
