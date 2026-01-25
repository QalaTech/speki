/**
 * useDiffApproval hook - orchestrates the diff view approval flow.
 *
 * Coordinates between:
 * - SpecEditor (for entering/exiting diff mode)
 * - useAgentFeedback (for sending feedback to agent)
 * - File saving (for persisting changes to disk)
 */

import { useState, useCallback } from 'react';
import type { SuggestionCard } from '@speki/core';
import type { SpecEditorActions } from './useSpecEditor';
import { useAgentFeedback } from './useAgentFeedback';

/** Highlight duration in milliseconds */
const HIGHLIGHT_DURATION_MS = 2000;

export interface DiffApprovalState {
  /** Whether currently in diff view mode */
  isActive: boolean;
  /** The suggestion currently being reviewed */
  currentSuggestion: SuggestionCard | null;
  /** Whether an action is being processed */
  isLoading: boolean;
  /** Error message if any action failed */
  error: string | null;
  /** Whether edit mode is active (user is modifying the proposed text) */
  isEditing: boolean;
}

export interface DiffApprovalActions {
  /** Enter diff view mode for a suggestion */
  enterDiffMode: (
    suggestion: SuggestionCard,
    editorActions: SpecEditorActions,
    currentContent: string
  ) => void;
  /** Approve the proposed change */
  approve: (
    sessionId: string,
    editorActions: SpecEditorActions,
    onSaveFile: (content: string) => Promise<void>,
    projectPath?: string
  ) => Promise<void>;
  /** Reject the proposed change */
  reject: (
    sessionId: string,
    editorActions: SpecEditorActions,
    projectPath?: string
  ) => Promise<void>;
  /** Enter edit mode to modify the proposed text before applying */
  startEdit: () => void;
  /** Apply the edited changes */
  applyEdit: (
    sessionId: string,
    editorActions: SpecEditorActions,
    onSaveFile: (content: string) => Promise<void>,
    projectPath?: string
  ) => Promise<void>;
  /** Cancel diff view without taking action */
  cancel: (editorActions: SpecEditorActions) => void;
  /** Reset the state */
  reset: () => void;
}

export type UseDiffApprovalReturn = DiffApprovalState & DiffApprovalActions;

const initialState: DiffApprovalState = {
  isActive: false,
  currentSuggestion: null,
  isLoading: false,
  error: null,
  isEditing: false,
};

export function useDiffApproval(): UseDiffApprovalReturn {
  const [state, setState] = useState<DiffApprovalState>(initialState);

  const {
    sendApprovalFeedback,
    sendRejectionFeedback,
    sendEditFeedback,
    resetFeedbackState,
  } = useAgentFeedback();

  const enterDiffMode = useCallback(
    (
      suggestion: SuggestionCard,
      editorActions: SpecEditorActions,
      currentContent: string
    ): void => {
      // Prevent entering diff mode if already active with same suggestion
      if (state.isActive && state.currentSuggestion?.id === suggestion.id) {
        return;
      }

      // If switching to different suggestion while in diff mode, exit first
      if (state.isActive) {
        editorActions.exitDiffMode(false);
      }

      // Create proposed content by applying the suggested fix
      const proposedContent = applyFix(currentContent, suggestion);

      // Enter diff mode in the editor
      editorActions.enterDiffMode(currentContent, proposedContent, {
        lineNumber: suggestion.lineStart,
        sectionHeading: suggestion.section,
      });

      setState({
        isActive: true,
        currentSuggestion: suggestion,
        isLoading: false,
        error: null,
        isEditing: false,
      });
    },
    [state.isActive, state.currentSuggestion?.id]
  );

  const approve = useCallback(
    async (
      sessionId: string,
      editorActions: SpecEditorActions,
      onSaveFile: (content: string) => Promise<void>,
      projectPath?: string
    ): Promise<void> => {
      if (!state.currentSuggestion) return;

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        // Get the proposed content from the editor and exit diff mode
        const finalContent = editorActions.exitDiffMode(true);

        // Save to disk
        await onSaveFile(finalContent);

        // Send feedback to agent
        const result = await sendApprovalFeedback(
          sessionId,
          state.currentSuggestion.id,
          projectPath
        );

        if (!result.success) {
          throw new Error(result.error || 'Failed to send approval feedback');
        }

        // Highlight the change briefly
        if (state.currentSuggestion.suggestedFix) {
          editorActions.highlight(
            state.currentSuggestion.suggestedFix,
            HIGHLIGHT_DURATION_MS
          );
        }

        // Reset state
        setState(initialState);
        resetFeedbackState();
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Approval failed',
        }));
      }
    },
    [state.currentSuggestion, sendApprovalFeedback, resetFeedbackState]
  );

  const reject = useCallback(
    async (
      sessionId: string,
      editorActions: SpecEditorActions,
      projectPath?: string
    ): Promise<void> => {
      if (!state.currentSuggestion) return;

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        // Exit diff mode without applying changes
        editorActions.exitDiffMode(false);

        // Send feedback to agent
        const result = await sendRejectionFeedback(
          sessionId,
          state.currentSuggestion.id,
          projectPath
        );

        if (!result.success) {
          throw new Error(result.error || 'Failed to send rejection feedback');
        }

        // Reset state
        setState(initialState);
        resetFeedbackState();
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Rejection failed',
        }));
      }
    },
    [state.currentSuggestion, sendRejectionFeedback, resetFeedbackState]
  );

  const startEdit = useCallback((): void => {
    setState((prev) => ({ ...prev, isEditing: true }));
  }, []);

  const applyEdit = useCallback(
    async (
      sessionId: string,
      editorActions: SpecEditorActions,
      onSaveFile: (content: string) => Promise<void>,
      projectPath?: string
    ): Promise<void> => {
      if (!state.currentSuggestion) return;

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        // Get the user-edited content and exit diff mode
        const userEditedContent = editorActions.getDiffProposedContent();
        if (!userEditedContent) {
          throw new Error('No edited content available');
        }

        const finalContent = editorActions.exitDiffMode(true);

        // Save to disk
        await onSaveFile(finalContent);

        // Send feedback with user's version
        const result = await sendEditFeedback(
          sessionId,
          state.currentSuggestion.id,
          userEditedContent,
          projectPath
        );

        if (!result.success) {
          throw new Error(result.error || 'Failed to send edit feedback');
        }

        // Highlight the change briefly
        editorActions.highlight(userEditedContent.substring(0, 100), HIGHLIGHT_DURATION_MS);

        // Reset state
        setState(initialState);
        resetFeedbackState();
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Edit failed',
        }));
      }
    },
    [state.currentSuggestion, sendEditFeedback, resetFeedbackState]
  );

  const cancel = useCallback(
    (editorActions: SpecEditorActions): void => {
      editorActions.exitDiffMode(false);
      setState(initialState);
      resetFeedbackState();
    },
    [resetFeedbackState]
  );

  const reset = useCallback((): void => {
    setState(initialState);
    resetFeedbackState();
  }, [resetFeedbackState]);

  return {
    ...state,
    enterDiffMode,
    approve,
    reject,
    startEdit,
    applyEdit,
    cancel,
    reset,
  };
}

/**
 * Applies a suggestion's fix to the content.
 * This is a simple implementation that replaces the text snippet with the suggested fix.
 * For more complex cases, line-based replacement would be used.
 */
function applyFix(content: string, suggestion: SuggestionCard): string {
  const { textSnippet, suggestedFix, lineStart, lineEnd } = suggestion;

  // If we have line numbers, try line-based replacement
  if (lineStart !== undefined) {
    const lines = content.split('\n');
    const endLine = lineEnd ?? lineStart;

    // Validate line numbers
    if (lineStart > 0 && lineStart <= lines.length) {
      const startIndex = lineStart - 1;
      const deleteCount = endLine - lineStart + 1;
      const newLines = suggestedFix.split('\n');

      lines.splice(startIndex, deleteCount, ...newLines);
      return lines.join('\n');
    }
  }

  // Fallback: try to find and replace the text snippet
  if (textSnippet && content.includes(textSnippet)) {
    return content.replace(textSnippet, suggestedFix);
  }

  // If we can't find the snippet, append the fix as a note
  return content + '\n\n<!-- Suggested: ' + suggestedFix + ' -->';
}
