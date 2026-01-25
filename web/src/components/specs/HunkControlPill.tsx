import { useEffect, useState, useRef, type RefObject } from 'react';
import * as monaco from 'monaco-editor';

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

  const actionBase = "flex items-center gap-[5px] py-1.5 px-2.5 bg-transparent border-none rounded-[14px] text-base-content/60 text-[11px] font-medium cursor-pointer transition-all duration-150 whitespace-nowrap hover:bg-base-300 hover:text-base-content active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40";

  return (
    <>
      <style>{`
        @keyframes hunkPillFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div
        ref={pillRef}
        className="inline-flex items-center gap-1 py-1 px-1.5 bg-[rgba(22,27,34,0.92)] backdrop-blur-[12px] border border-[rgba(48,54,61,0.8)] rounded-[20px] shadow-[0_4px_16px_rgba(0,0,0,0.4),inset_0_0_0_1px_rgba(255,255,255,0.05)] text-[11px] z-[100] select-none animate-[hunkPillFadeIn_0.2s_ease-out] hover:border-[rgba(88,166,255,0.3)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(88,166,255,0.1)]"
        style={{
          position: 'absolute',
          top: `${position.top}px`,
          left: `${position.left}px`,
        }}
      >
        <span className="py-1 px-2 text-base-content/60 font-medium text-[10px] uppercase tracking-[0.03em] max-lg:hidden">
          {linesChanged} {linesChanged === 1 ? 'line' : 'lines'}
        </span>

        <div className="w-px h-4 bg-border mx-0.5 max-lg:hidden" />

        <button
          className={`${actionBase} hover:bg-[rgba(35,134,54,0.2)] hover:text-[#3fb950] active:bg-[rgba(35,134,54,0.3)]`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onAccept();
          }}
          title="Accept this change (A)"
        >
          <span className="text-xs leading-none">✓</span>
          <span className="text-[11px] font-medium tracking-[0.01em] max-lg:hidden">Accept</span>
        </button>

        <button
          className={`${actionBase} hover:bg-[rgba(218,54,51,0.2)] hover:text-[#f85149] active:bg-[rgba(218,54,51,0.3)]`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onReject();
          }}
          title="Reject this change (R)"
        >
          <span className="text-xs leading-none">✗</span>
          <span className="text-[11px] font-medium tracking-[0.01em] max-lg:hidden">Reject</span>
        </button>

        <button
          className={`${actionBase} hover:bg-[rgba(88,166,255,0.2)] hover:text-[#58a6ff] active:bg-[rgba(88,166,255,0.3)]`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onComment();
          }}
          title="Comment on this change (C)"
        >
          <span className="text-xs leading-none">💬</span>
          <span className="text-[11px] font-medium tracking-[0.01em] max-lg:hidden">Comment</span>
        </button>
      </div>
    </>
  );
}
