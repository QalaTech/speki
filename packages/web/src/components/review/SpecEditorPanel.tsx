import type React from "react";
import type { SuggestionCard } from "@speki/core";
import { SpecEditor } from "../shared/SpecEditor";
import { MonacoDiffReview, type HunkAction } from "./MonacoDiffReview";
import { Button } from "../ui/Button";

interface DiffState {
  originalContent: string;
  proposedContent: string;
}

interface SpecEditorRef {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editorRef: React.RefObject<any>;
  content: string;
  diffState: DiffState;
}

interface DiffApprovalState {
  isActive: boolean;
  currentSuggestion: SuggestionCard | null;
}

interface SpecEditorPanelProps {
  width: number;
  isInDiffMode: boolean;
  diffApproval: DiffApprovalState;
  specEditor: SpecEditorRef;
  onEditorChange: (content: string) => void;
  onEditorMouseUp: () => void;
  onEditorBlur: () => void;
  onCancel: () => void;
  onAcceptHunk: (action: HunkAction) => void;
  onRejectHunk: (action: HunkAction) => void;
  onCommentHunk: (action: HunkAction) => void;
  onOriginalChange: (content: string) => Promise<void>;
  onModifiedChange: (content: string) => void;
  onAllResolved: () => void;
}

export function SpecEditorPanel({
  width,
  isInDiffMode,
  diffApproval,
  specEditor,
  onEditorChange,
  onEditorMouseUp,
  onEditorBlur,
  onCancel,
  onAcceptHunk,
  onRejectHunk,
  onCommentHunk,
  onOriginalChange,
  onModifiedChange,
  onAllResolved,
}: SpecEditorPanelProps): React.ReactElement {
  return (
    <div
      className="flex flex-col border-r border-border"
      style={{ width: `${width}%` }}
      data-testid="left-panel"
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-secondary">
        <span className="text-sm font-semibold">
          {isInDiffMode ? "Review Changes" : "Spec Editor"}
          {isInDiffMode && diffApproval.currentSuggestion && (
            <span className="text-primary ml-2">
              {" - "}
              {diffApproval.currentSuggestion.section || "Change"}
            </span>
          )}
        </span>
        {isInDiffMode && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            data-testid="exit-diff-button"
            className="h-7 text-xs"
          >
            Exit Diff View
          </Button>
        )}
      </div>
      <div
        className="flex-1 overflow-auto"
        onMouseUp={isInDiffMode ? undefined : onEditorMouseUp}
        onBlur={isInDiffMode ? undefined : onEditorBlur}
      >
        {isInDiffMode ? (
          <MonacoDiffReview
            originalText={specEditor.diffState.originalContent}
            modifiedText={specEditor.diffState.proposedContent}
            language="markdown"
            onAcceptHunk={onAcceptHunk}
            onRejectHunk={onRejectHunk}
            onCommentHunk={onCommentHunk}
            onOriginalChange={onOriginalChange}
            onModifiedChange={onModifiedChange}
            onAllResolved={onAllResolved}
          />
        ) : (
          <SpecEditor
            ref={specEditor.editorRef}
            content={specEditor.content}
            onChange={onEditorChange}
            viewMode="rich-text"
            placeholder="Select a spec file to begin editing..."
          />
        )}
      </div>
    </div>
  );
}
