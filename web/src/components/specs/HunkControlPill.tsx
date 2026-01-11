import { useEffect, useState, useRef, type RefObject } from 'react';
import * as monaco from 'monaco-editor';
import './HunkControlPill.css';

export interface HunkAction {
  hunk: Hunk;
  hunkId: string;
  originalText: string;
  modifiedText: string;
}

interface Hunk {
  originalStartLineNumber: number;
  originalEndLineNumber: number;
  modifiedStartLineNumber: number;
  modifiedEndLineNumber: number;
}

interface HunkControlPillProps {
  hunk: Hunk;
  onAccept: () => void;
  onReject: () => void;
  onComment: () => void;
  editorRef: RefObject<monaco.editor.IStandaloneDiffEditor | null>;
}

export function HunkControlPill({
  hunk,
  onAccept,
  onReject,
  onComment,
  editorRef,
}: HunkControlPillProps) {
  const pillRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [isVisible, setIsVisible] = useState(true);

  // Update position based on editor line
  useEffect(() => {
    const updatePosition = () => {
      const editor = editorRef.current;
      if (!editor || !pillRef.current) return;

      const modifiedEditor = editor.getModifiedEditor();
      const lineNumber = Math.max(1, hunk.modifiedStartLineNumber);

      // Get the top position of the line
      const top = modifiedEditor.getTopForLineNumber(lineNumber);
      const scrollTop = modifiedEditor.getScrollTop();
      const editorLayout = modifiedEditor.getLayoutInfo();

      // Calculate position relative to editor container
      const containerRect = modifiedEditor.getDomNode()?.getBoundingClientRect();
      if (!containerRect) return;

      // Position pill at the right edge of the modified editor
      const pillTop = top - scrollTop + 4; // 4px offset from line
      const pillLeft = editorLayout.width - 180; // Positioned from right

      // Check if visible in viewport
      const isInViewport = pillTop > 0 && pillTop < containerRect.height - 40;
      setIsVisible(isInViewport);

      if (isInViewport) {
        setPosition({ top: pillTop, left: pillLeft });
      }
    };

    // Initial position
    updatePosition();

    // Update on scroll
    const editor = editorRef.current;
    if (editor) {
      const modifiedEditor = editor.getModifiedEditor();
      const disposable = modifiedEditor.onDidScrollChange(updatePosition);
      return () => disposable.dispose();
    }
  }, [hunk, editorRef]);

  // TODO: Keyboard shortcuts - implement when hunk focus is tracked
  // For now, keyboard shortcuts are disabled to avoid conflicts

  if (!position || !isVisible) return null;

  const linesChanged = Math.max(
    hunk.originalEndLineNumber - hunk.originalStartLineNumber + 1,
    hunk.modifiedEndLineNumber - hunk.modifiedStartLineNumber + 1
  );

  return (
    <div
      ref={pillRef}
      className="hunk-control-pill"
      style={{
        position: 'absolute',
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      <span className="hunk-control-info">
        {linesChanged} {linesChanged === 1 ? 'line' : 'lines'}
      </span>

      <div className="hunk-control-divider" />

      <button
        className="hunk-control-action hunk-control-action--accept"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onAccept();
        }}
        title="Accept this change (A)"
      >
        <span className="hunk-control-icon">✓</span>
        <span className="hunk-control-label">Accept</span>
      </button>

      <button
        className="hunk-control-action hunk-control-action--reject"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onReject();
        }}
        title="Reject this change (R)"
      >
        <span className="hunk-control-icon">✗</span>
        <span className="hunk-control-label">Reject</span>
      </button>

      <button
        className="hunk-control-action hunk-control-action--comment"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onComment();
        }}
        title="Comment on this change (C)"
      >
        <span className="hunk-control-icon">💬</span>
        <span className="hunk-control-label">Comment</span>
      </button>
    </div>
  );
}
