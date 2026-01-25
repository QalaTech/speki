import { useState, useCallback } from "react";
import type { SuggestionCard } from "../../../src/types/index.js";

export interface DiscussingContext {
  suggestionId: string;
  issue: string;
  suggestedFix: string;
}

export interface UseSuggestionActionsOptions {
  suggestions: SuggestionCard[];
  sessionId: string | null;
  projectPath?: string;
  setSuggestions: React.Dispatch<React.SetStateAction<SuggestionCard[]>>;
  diffApproval: {
    isActive: boolean;
    currentSuggestion: SuggestionCard | null;
    enterDiffMode: (
      suggestion: SuggestionCard,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      specEditor: any,
      content: string
    ) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cancel: (specEditor: any) => void;
    approve: (
      sessionId: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      specEditor: any,
      saveFile: (content: string) => Promise<void>,
      projectPath?: string
    ) => Promise<void>;
    reject: (
      sessionId: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      specEditor: any,
      projectPath?: string
    ) => Promise<void>;
    startEdit: () => void;
    applyEdit: (
      sessionId: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      specEditor: any,
      saveFile: (content: string) => Promise<void>,
      projectPath?: string
    ) => Promise<void>;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  specEditor: any;
  agentFeedback: {
    sendApprovalFeedback: (
      sessionId: string,
      suggestionId: string,
      projectPath?: string
    ) => Promise<unknown>;
    sendRejectionFeedback: (
      sessionId: string,
      suggestionId: string,
      projectPath?: string
    ) => Promise<unknown>;
  };
  saveFile: (content: string) => Promise<void>;
}

export interface UseSuggestionActionsReturn {
  // State
  currentSuggestionIndex: number;
  isBatchProcessing: boolean;
  discussingContext: DiscussingContext | null;

  // Handlers
  handleReviewDiff: (suggestionId: string) => void;
  handleShowInEditor: (suggestionId: string) => void;
  handleDismiss: (suggestionId: string) => void;
  handleDiscussSuggestion: (suggestionId: string) => void;
  handleApprove: () => Promise<void>;
  handleReject: () => Promise<void>;
  handleEdit: () => void;
  handleApplyEdit: () => Promise<void>;
  handleCancel: () => void;
  handleBatchNavigate: (index: number) => void;
  handleApproveAll: () => Promise<void>;
  handleRejectAll: () => Promise<void>;
  setDiscussingContext: React.Dispatch<
    React.SetStateAction<DiscussingContext | null>
  >;

  // Computed
  pendingSuggestions: SuggestionCard[];
}

export function useSuggestionActions({
  suggestions,
  sessionId,
  projectPath,
  setSuggestions,
  diffApproval,
  specEditor,
  agentFeedback,
  saveFile,
}: UseSuggestionActionsOptions): UseSuggestionActionsReturn {
  const [currentSuggestionIndex, setCurrentSuggestionIndex] = useState(0);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [discussingContext, setDiscussingContext] =
    useState<DiscussingContext | null>(null);

  // Filter pending suggestions
  const pendingSuggestions = suggestions.filter(
    (s) =>
      s.status === "pending" &&
      (s.severity === "critical" || s.severity === "warning")
  );

  // Handle Review Diff button click
  const handleReviewDiff = useCallback(
    (suggestionId: string): void => {
      const suggestion = suggestions.find((s) => s.id === suggestionId);
      if (!suggestion) return;

      diffApproval.enterDiffMode(suggestion, specEditor, specEditor.content);
    },
    [suggestions, diffApproval, specEditor]
  );

  // Handle Show in Editor button click
  const handleShowInEditor = useCallback(
    (suggestionId: string): void => {
      const suggestion = suggestions.find((s) => s.id === suggestionId);
      if (!suggestion) return;

      const editorContent = document.querySelector(".spec-editor-content");
      if (!editorContent) return;

      const textToFind = suggestion.textSnippet || suggestion.section;
      if (!textToFind) return;

      const walker = document.createTreeWalker(
        editorContent,
        NodeFilter.SHOW_TEXT,
        null
      );

      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (node.textContent?.includes(textToFind)) {
          const parentElement = node.parentElement;
          if (parentElement) {
            parentElement.scrollIntoView({ behavior: "smooth", block: "center" });

            const originalBg = parentElement.style.backgroundColor;
            parentElement.style.backgroundColor =
              "oklch(83.242% 0.139 82.95 / 0.5)";
            parentElement.style.transition = "background-color 0.3s";

            setTimeout(() => {
              parentElement.style.backgroundColor = originalBg;
            }, 2000);
          }
          break;
        }
      }
    },
    [suggestions]
  );

  // Handle Dismiss button click
  const handleDismiss = useCallback(
    (suggestionId: string): void => {
      setSuggestions((prev) =>
        prev.map((s) =>
          s.id === suggestionId ? { ...s, status: "rejected" as const } : s
        )
      );
    },
    [setSuggestions]
  );

  // Handle Discuss button click
  const handleDiscussSuggestion = useCallback(
    (suggestionId: string): void => {
      const suggestion = suggestions.find((s) => s.id === suggestionId);
      if (!suggestion) return;

      setDiscussingContext({
        suggestionId,
        issue: suggestion.issue,
        suggestedFix: suggestion.suggestedFix,
      });

      const chatSection = document.querySelector(
        '[data-testid="review-chat-section"]'
      );
      chatSection?.scrollIntoView({ behavior: "smooth" });
    },
    [suggestions]
  );

  // Diff approval action handlers
  const handleApprove = useCallback(async (): Promise<void> => {
    if (!sessionId) return;
    await diffApproval.approve(sessionId, specEditor, saveFile, projectPath);

    if (diffApproval.currentSuggestion) {
      setSuggestions((prev) =>
        prev.map((s) =>
          s.id === diffApproval.currentSuggestion?.id
            ? { ...s, status: "approved" as const }
            : s
        )
      );
    }
  }, [sessionId, diffApproval, specEditor, saveFile, projectPath, setSuggestions]);

  const handleReject = useCallback(async (): Promise<void> => {
    if (!sessionId) return;
    await diffApproval.reject(sessionId, specEditor, projectPath);

    if (diffApproval.currentSuggestion) {
      setSuggestions((prev) =>
        prev.map((s) =>
          s.id === diffApproval.currentSuggestion?.id
            ? { ...s, status: "rejected" as const }
            : s
        )
      );
    }
  }, [sessionId, diffApproval, specEditor, projectPath, setSuggestions]);

  const handleEdit = useCallback((): void => {
    diffApproval.startEdit();
  }, [diffApproval]);

  const handleApplyEdit = useCallback(async (): Promise<void> => {
    if (!sessionId) return;
    await diffApproval.applyEdit(sessionId, specEditor, saveFile, projectPath);

    if (diffApproval.currentSuggestion) {
      setSuggestions((prev) =>
        prev.map((s) =>
          s.id === diffApproval.currentSuggestion?.id
            ? { ...s, status: "edited" as const }
            : s
        )
      );
    }
  }, [sessionId, diffApproval, specEditor, saveFile, projectPath, setSuggestions]);

  const handleCancel = useCallback((): void => {
    diffApproval.cancel(specEditor);
  }, [diffApproval, specEditor]);

  // Batch navigation
  const handleBatchNavigate = useCallback(
    (index: number): void => {
      if (index < 0 || index >= pendingSuggestions.length) return;

      setCurrentSuggestionIndex(index);
      const suggestion = pendingSuggestions[index];

      diffApproval.enterDiffMode(suggestion, specEditor, specEditor.content);
    },
    [pendingSuggestions, diffApproval, specEditor]
  );

  const handleApproveAll = useCallback(async (): Promise<void> => {
    if (!sessionId || pendingSuggestions.length === 0) return;

    setIsBatchProcessing(true);

    try {
      const approvedIds = pendingSuggestions.map((s) => s.id);

      for (const suggestion of pendingSuggestions) {
        await agentFeedback.sendApprovalFeedback(
          sessionId,
          suggestion.id,
          projectPath
        );
      }

      setSuggestions((prev) =>
        prev.map((s) =>
          approvedIds.includes(s.id) ? { ...s, status: "approved" as const } : s
        )
      );

      if (diffApproval.isActive) {
        diffApproval.cancel(specEditor);
      }

      setCurrentSuggestionIndex(0);
    } catch (error) {
      console.error("Failed to approve all suggestions:", error);
    } finally {
      setIsBatchProcessing(false);
    }
  }, [
    sessionId,
    pendingSuggestions,
    agentFeedback,
    diffApproval,
    specEditor,
    projectPath,
    setSuggestions,
  ]);

  const handleRejectAll = useCallback(async (): Promise<void> => {
    if (!sessionId || pendingSuggestions.length === 0) return;

    setIsBatchProcessing(true);

    try {
      const rejectedIds = pendingSuggestions.map((s) => s.id);

      for (const suggestion of pendingSuggestions) {
        await agentFeedback.sendRejectionFeedback(
          sessionId,
          suggestion.id,
          projectPath
        );
      }

      setSuggestions((prev) =>
        prev.map((s) =>
          rejectedIds.includes(s.id) ? { ...s, status: "rejected" as const } : s
        )
      );

      if (diffApproval.isActive) {
        diffApproval.cancel(specEditor);
      }

      setCurrentSuggestionIndex(0);
    } catch (error) {
      console.error("Failed to reject all suggestions:", error);
    } finally {
      setIsBatchProcessing(false);
    }
  }, [
    sessionId,
    pendingSuggestions,
    agentFeedback,
    diffApproval,
    specEditor,
    projectPath,
    setSuggestions,
  ]);

  return {
    currentSuggestionIndex,
    isBatchProcessing,
    discussingContext,
    handleReviewDiff,
    handleShowInEditor,
    handleDismiss,
    handleDiscussSuggestion,
    handleApprove,
    handleReject,
    handleEdit,
    handleApplyEdit,
    handleCancel,
    handleBatchNavigate,
    handleApproveAll,
    handleRejectAll,
    setDiscussingContext,
    pendingSuggestions,
  };
}
