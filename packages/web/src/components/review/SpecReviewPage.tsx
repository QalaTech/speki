import { useCallback, useEffect, useRef, useState } from "react";
import type { SplitProposal } from "@speki/core";
import { useAgentFeedback } from "../../hooks/useAgentFeedback";
import { useDiffApproval } from "../../hooks/useDiffApproval";
import { useSpecEditor } from "../../hooks/useSpecEditor";
import { useSpecFiles } from "../../hooks/useSpecFiles";
import { useSpecReviewSession } from "../../hooks/useSpecReviewSession";
import { useSplitPreview } from "../../hooks/useSplitPreview";
import { useSuggestionActions } from "../../hooks/useSuggestionActions";
import { apiFetch } from "../ui/ErrorContext";
import { DiffApprovalBar } from "./DiffApprovalBar";
import type { HunkAction } from "./MonacoDiffReview";
import { ReviewSuggestionsPanel } from "./ReviewSuggestionsPanel";
import { SpecEditorPanel } from "./SpecEditorPanel";
import { SpecReviewHeader } from "./SpecReviewHeader";
import { SplitNavigation } from "./SplitNavigation";
import { SplitPreviewModal, type SplitPreviewFile } from "./SplitPreviewModal";

interface SpecReviewPageProps {
  projectPath?: string;
}

export function SpecReviewPage({
  projectPath,
}: SpecReviewPageProps): React.ReactElement {
  // Panel resize state
  const [leftPanelWidth, setLeftPanelWidth] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Chat state
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  // Editor and approval hooks
  const specEditor = useSpecEditor("");
  const diffApproval = useDiffApproval();
  const agentFeedback = useAgentFeedback();
  const splitPreview = useSplitPreview();

  // Session hook (needs selectedFile, so initialize with empty first)
  const [selectedFileInternal, setSelectedFileInternal] = useState("");

  const {
    session,
    loadingSession,
    isStartingReview,
    reviewError,
    startReview,
    setSuggestions,
    setShowGodSpecWarning,
    apiUrl,
  } = useSpecReviewSession({ projectPath, selectedFile: selectedFileInternal });

  // Files hook
  const { files, selectedFile, loading, setSelectedFile, resetFileRef } =
    useSpecFiles({
      apiUrl,
      onContentLoad: useCallback(
        (content: string) => specEditor.setContent(content),
        [specEditor],
      ),
    });

  // Sync selectedFile with internal state for session hook
  useEffect(() => {
    setSelectedFileInternal(selectedFile);
  }, [selectedFile]);

  // Save file handler
  const handleSaveFile = useCallback(
    async (content: string): Promise<void> => {
      if (!selectedFile) return;

      const encodedPath = encodeURIComponent(selectedFile);
      const response = await apiFetch(
        apiUrl(`/api/spec-review/content/${encodedPath}`),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save file");
      }
    },
    [selectedFile, apiUrl],
  );

  // Suggestion actions hook
  const suggestionActions = useSuggestionActions({
    suggestions: session.suggestions,
    sessionId: session.sessionId,
    projectPath,
    setSuggestions,
    diffApproval,
    specEditor,
    agentFeedback,
    saveFile: handleSaveFile,
  });

  // Resize handlers
  const handleMouseDown = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent): void => {
      if (!isResizing || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth =
        ((e.clientX - containerRect.left) / containerRect.width) * 100;
      setLeftPanelWidth(Math.max(20, Math.min(80, newWidth)));
    },
    [isResizing],
  );

  const handleMouseUp = useCallback((): void => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // File change handler
  const handleFileChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const newFile = e.target.value;
    if (newFile !== selectedFile) {
      resetFileRef();
    }
    setSelectedFile(newFile);
    diffApproval.reset();
  };

  // Monaco diff hunk handlers
  const handleAcceptHunk = useCallback((action: HunkAction): void => {
    console.log("[MonacoDiff] Accept hunk:", action.hunkId);
  }, []);

  const handleRejectHunk = useCallback((action: HunkAction): void => {
    console.log("[MonacoDiff] Reject hunk:", action.hunkId);
  }, []);

  const handleCommentHunk = useCallback((action: HunkAction): void => {
    console.log("[MonacoDiff] Comment on hunk:", action.hunkId);
  }, []);

  const handleDiffOriginalChange = useCallback(
    async (content: string): Promise<void> => {
      try {
        specEditor.updateDiffContent(
          content,
          specEditor.diffState.proposedContent,
        );
        await handleSaveFile(content);
      } catch (error) {
        console.error("Failed to save after accepting hunk:", error);
      }
    },
    [handleSaveFile, specEditor],
  );

  const handleDiffModifiedChange = useCallback(
    (content: string): void => {
      specEditor.updateDiffContent(
        specEditor.diffState.originalContent,
        content,
      );
    },
    [specEditor],
  );

  const handleAllHunksResolved = useCallback((): void => {
    if (diffApproval.currentSuggestion) {
      setSuggestions((prev) =>
        prev.map((s) =>
          s.id === diffApproval.currentSuggestion?.id
            ? { ...s, status: "approved" as const }
            : s,
        ),
      );
    }
    diffApproval.cancel(specEditor);
  }, [diffApproval, specEditor, setSuggestions]);

  // Editor handlers
  const handleEditorChange = useCallback(
    (content: string): void => specEditor.setContent(content),
    [specEditor],
  );

  const handleEditorMouseUp = useCallback((): void => {
    setTimeout(() => specEditor.updateSelection(), 10);
  }, [specEditor]);

  const handleEditorBlur = useCallback((): void => {
    setTimeout(() => {
      const chatInput = document.querySelector('[data-testid="chat-input"]');
      if (document.activeElement !== chatInput) {
        specEditor.clearSelection();
      }
    }, 100);
  }, [specEditor]);

  // Chat message handler
  const handleSendMessage = useCallback(
    async (
      message: string,
      selectionContext?: string,
      suggestionId?: string,
    ): Promise<void> => {
      if (!session.sessionId) return;

      setIsSendingMessage(true);
      try {
        const response = await apiFetch(apiUrl("/api/spec-review/chat/stream"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: session.sessionId,
            message,
            selectedText: selectionContext,
            suggestionId,
            specPath: selectedFile,
          }),
        });

        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          buffer = buffer.split("\n\n").pop() || "";
        }
      } catch (error) {
        console.error("Failed to send chat message:", error);
      } finally {
        setIsSendingMessage(false);
        specEditor.clearSelection();
      }
    },
    [session.sessionId, apiUrl, specEditor, selectedFile],
  );

  // God spec handlers
  const handleAcceptSplit = useCallback(
    async (proposal: SplitProposal): Promise<void> => {
      if (!selectedFile) return;
      await splitPreview.openPreview(proposal, selectedFile, projectPath);
    },
    [selectedFile, projectPath, splitPreview],
  );

  const handleModifySplit = useCallback(
    async (proposal: SplitProposal): Promise<void> => {
      if (!selectedFile) return;
      await splitPreview.openPreview(proposal, selectedFile, projectPath);
    },
    [selectedFile, projectPath, splitPreview],
  );

  const handleSkipSplit = useCallback(
    (): void => setShowGodSpecWarning(false),
    [setShowGodSpecWarning],
  );

  const handleSplitSaveAll = useCallback(
    async (splitFiles: SplitPreviewFile[]): Promise<void> => {
      if (!selectedFile) return;
      await splitPreview.saveAll(
        splitFiles,
        selectedFile,
        session.sessionId || undefined,
        projectPath,
      );
      setShowGodSpecWarning(false);
    },
    [
      selectedFile,
      session.sessionId,
      projectPath,
      splitPreview,
      setShowGodSpecWarning,
    ],
  );

  const handleSplitCancel = useCallback(
    (): void => splitPreview.cancel(),
    [splitPreview],
  );

  // Navigation to related spec
  const handleSpecNavigate = useCallback(
    (specPath: string): void => {
      const isRelative = !specPath.includes("/");
      const resolved =
        isRelative && selectedFile
          ? `${selectedFile.substring(0, selectedFile.lastIndexOf("/"))}/${specPath}`
          : specPath;
      resetFileRef();
      setSelectedFile(resolved);
      diffApproval.reset();
    },
    [selectedFile, diffApproval, resetFileRef, setSelectedFile],
  );

  if (loading) {
    return (
      <div
        className="flex flex-col h-full bg-base-100"
        data-testid="spec-review-page"
      >
        <div className="flex items-center justify-center flex-1">
          <span className="loading loading-spinner loading-lg"></span>
          <span className="ml-3">Loading spec files...</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full bg-base-100"
      data-testid="spec-review-page"
    >
      <SpecReviewHeader
        files={files}
        selectedFile={selectedFile}
        onFileChange={handleFileChange}
        disabled={diffApproval.isActive}
      />

      <SplitNavigation
        splitSpecs={session.splitSpecs}
        parentSpecPath={session.parentSpecPath}
        onNavigate={handleSpecNavigate}
      />

      <DiffApprovalBar
        isVisible={diffApproval.isActive}
        suggestionIssue={diffApproval.currentSuggestion?.issue}
        isLoading={diffApproval.isLoading}
        onApprove={
          diffApproval.isEditing
            ? suggestionActions.handleApplyEdit
            : suggestionActions.handleApprove
        }
        onReject={suggestionActions.handleReject}
        onEdit={suggestionActions.handleEdit}
        onCancel={suggestionActions.handleCancel}
      />

      {diffApproval.error && (
        <div className="alert alert-error mx-4 my-2" data-testid="diff-error">
          {diffApproval.error}
        </div>
      )}

      <div
        ref={containerRef}
        className="flex flex-1 overflow-hidden"
        data-testid="split-view"
      >
        <SpecEditorPanel
          width={leftPanelWidth}
          isInDiffMode={diffApproval.isActive}
          diffApproval={diffApproval}
          specEditor={specEditor}
          onEditorChange={handleEditorChange}
          onEditorMouseUp={handleEditorMouseUp}
          onEditorBlur={handleEditorBlur}
          onCancel={suggestionActions.handleCancel}
          onAcceptHunk={handleAcceptHunk}
          onRejectHunk={handleRejectHunk}
          onCommentHunk={handleCommentHunk}
          onOriginalChange={handleDiffOriginalChange}
          onModifiedChange={handleDiffModifiedChange}
          onAllResolved={handleAllHunksResolved}
        />

        <div
          className="w-1 bg-base-300 cursor-col-resize hover:bg-primary/50 transition-colors"
          onMouseDown={handleMouseDown}
          data-testid="resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={leftPanelWidth}
          aria-valuemin={20}
          aria-valuemax={80}
        />

        <ReviewSuggestionsPanel
          width={100 - leftPanelWidth}
          suggestions={session.suggestions}
          reviewResult={session.reviewResult}
          sessionId={session.sessionId}
          loadingSession={loadingSession}
          isStartingReview={isStartingReview}
          sessionStatus={session.status}
          reviewError={reviewError}
          selectedFile={selectedFile}
          projectPath={projectPath}
          showGodSpecWarning={session.showGodSpecWarning}
          godSpecIndicators={session.godSpecIndicators}
          splitProposal={session.splitProposal}
          chatMessages={session.chatMessages}
          isSendingMessage={isSendingMessage}
          selectedText={specEditor.selectedText || undefined}
          discussingContext={suggestionActions.discussingContext}
          currentSuggestionIndex={suggestionActions.currentSuggestionIndex}
          isBatchProcessing={suggestionActions.isBatchProcessing}
          isDiffLoading={diffApproval.isLoading}
          onReviewDiff={suggestionActions.handleReviewDiff}
          onShowInEditor={suggestionActions.handleShowInEditor}
          onDismiss={suggestionActions.handleDismiss}
          onDiscussSuggestion={suggestionActions.handleDiscussSuggestion}
          onBatchNavigate={suggestionActions.handleBatchNavigate}
          onApproveAll={suggestionActions.handleApproveAll}
          onRejectAll={suggestionActions.handleRejectAll}
          onStartReview={startReview}
          onSendMessage={handleSendMessage}
          onClearDiscussingContext={() =>
            suggestionActions.setDiscussingContext(null)
          }
          onAcceptSplit={handleAcceptSplit}
          onModifySplit={handleModifySplit}
          onSkipSplit={handleSkipSplit}
        />
      </div>

      {splitPreview.isOpen && splitPreview.proposal && (
        <SplitPreviewModal
          isOpen={splitPreview.isOpen}
          proposal={splitPreview.proposal}
          previewFiles={splitPreview.previewFiles}
          onSaveAll={handleSplitSaveAll}
          onCancel={handleSplitCancel}
          isSaving={splitPreview.isSaving}
        />
      )}
    </div>
  );
}
