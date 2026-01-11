import { useState, useCallback } from 'react';

export type FeedbackStatus = 'idle' | 'pending' | 'sent' | 'error';

export interface FeedbackState {
  status: FeedbackStatus;
  error: string | null;
  lastSuggestionId: string | null;
}

export interface SendFeedbackResult {
  success: boolean;
  error?: string;
}

export interface UseAgentFeedbackActions {
  sendApprovalFeedback: (
    sessionId: string,
    suggestionId: string,
    projectPath?: string
  ) => Promise<SendFeedbackResult>;
  sendRejectionFeedback: (
    sessionId: string,
    suggestionId: string,
    projectPath?: string
  ) => Promise<SendFeedbackResult>;
  sendEditFeedback: (
    sessionId: string,
    suggestionId: string,
    userVersion: string,
    projectPath?: string
  ) => Promise<SendFeedbackResult>;
  resetFeedbackState: () => void;
}

export type UseAgentFeedbackReturn = FeedbackState & UseAgentFeedbackActions;

const initialState: FeedbackState = {
  status: 'idle',
  error: null,
  lastSuggestionId: null,
};

function buildApiUrl(endpoint: string, projectPath?: string): string {
  if (!projectPath) return endpoint;
  const separator = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${separator}project=${encodeURIComponent(projectPath)}`;
}

type FeedbackAction = 'approved' | 'rejected' | 'edited';

interface FeedbackPayload {
  sessionId: string;
  suggestionId: string;
  action: FeedbackAction;
  userVersion?: string;
}

export function useAgentFeedback(): UseAgentFeedbackReturn {
  const [state, setState] = useState<FeedbackState>(initialState);

  const sendFeedback = useCallback(
    async (
      payload: FeedbackPayload,
      projectPath?: string
    ): Promise<SendFeedbackResult> => {
      setState({
        status: 'pending',
        error: null,
        lastSuggestionId: payload.suggestionId,
      });

      try {
        const response = await fetch(
          buildApiUrl('/api/spec-review/feedback', projectPath),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          const errorMessage = data.error || 'Failed to send feedback';
          setState({
            status: 'error',
            error: errorMessage,
            lastSuggestionId: payload.suggestionId,
          });
          return { success: false, error: errorMessage };
        }

        setState({
          status: 'sent',
          error: null,
          lastSuggestionId: payload.suggestionId,
        });
        return { success: true };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to send feedback';
        setState({
          status: 'error',
          error: errorMessage,
          lastSuggestionId: payload.suggestionId,
        });
        return { success: false, error: errorMessage };
      }
    },
    []
  );

  const sendApprovalFeedback = useCallback(
    async (
      sessionId: string,
      suggestionId: string,
      projectPath?: string
    ): Promise<SendFeedbackResult> => {
      return sendFeedback(
        { sessionId, suggestionId, action: 'approved' },
        projectPath
      );
    },
    [sendFeedback]
  );

  const sendRejectionFeedback = useCallback(
    async (
      sessionId: string,
      suggestionId: string,
      projectPath?: string
    ): Promise<SendFeedbackResult> => {
      return sendFeedback(
        { sessionId, suggestionId, action: 'rejected' },
        projectPath
      );
    },
    [sendFeedback]
  );

  const sendEditFeedback = useCallback(
    async (
      sessionId: string,
      suggestionId: string,
      userVersion: string,
      projectPath?: string
    ): Promise<SendFeedbackResult> => {
      return sendFeedback(
        { sessionId, suggestionId, action: 'edited', userVersion },
        projectPath
      );
    },
    [sendFeedback]
  );

  const resetFeedbackState = useCallback((): void => {
    setState(initialState);
  }, []);

  return {
    ...state,
    sendApprovalFeedback,
    sendRejectionFeedback,
    sendEditFeedback,
    resetFeedbackState,
  };
}
