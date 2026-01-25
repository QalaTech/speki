import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { specsKeys } from '../api/keys';
import { apiFetch } from '../../../components/ui/ErrorContext';
import type { ChatMessage, SpecSession, Suggestion } from '../api/queries';

// ============================================================================
// Types
// ============================================================================

export interface DiscussingContext {
  suggestionId: string;
  issue: string;
  suggestedFix: string;
}

export interface UseSpecReviewChatOptions {
  project: string;
  specPath: string | null;
  sessionId: string | null;
  onSpecUpdated?: () => void;
}

export interface UseSpecReviewChatReturn {
  isSending: boolean;
  discussingContext: DiscussingContext | null;
  discussStartTimestamp: string | null;
  sendMessage: (
    message: string,
    selectionContext?: string,
    suggestionId?: string
  ) => Promise<void>;
  discussSuggestion: (suggestion: Suggestion) => Promise<void>;
  clearDiscussingContext: () => void;
}

// ============================================================================
// API Helpers
// ============================================================================

function buildApiUrl(endpoint: string, projectPath: string): string {
  const separator = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${separator}project=${encodeURIComponent(projectPath)}`;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to manage spec review chat functionality with SSE streaming.
 * Handles sending messages, receiving streaming responses, and managing
 * discussion context for suggestions.
 */
export function useSpecReviewChat({
  project,
  specPath,
  sessionId,
  onSpecUpdated,
}: UseSpecReviewChatOptions): UseSpecReviewChatReturn {
  const queryClient = useQueryClient();
  const [isSending, setIsSending] = useState(false);
  const [discussingContext, setDiscussingContext] =
    useState<DiscussingContext | null>(null);
  const [discussStartTimestamp, setDiscussStartTimestamp] = useState<
    string | null
  >(null);

  /**
   * Process SSE stream and update session with messages.
   */
  const processStream = useCallback(
    async (
      response: Response,
      optimisticMessageId: string
    ): Promise<void> => {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (!reader) {
        console.error('[useSpecReviewChat] No reader available from response');
        return;
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonData = line.substring(6);
            try {
              const data = JSON.parse(jsonData);

              if (data.success && data.assistantMessage) {
                // Check if agent updated the spec file
                if (data.assistantMessage.content?.includes('[SPEC_UPDATED]')) {
                  onSpecUpdated?.();
                }

                // Update session in cache with new messages
                if (specPath) {
                  queryClient.setQueryData<SpecSession | null>(
                    specsKeys.session(specPath, project),
                    (oldSession) => {
                      if (!oldSession) {
                        // Create new session if none exists
                        if (data.sessionId && data.userMessage && data.assistantMessage) {
                          return {
                            sessionId: data.sessionId,
                            specFilePath: specPath,
                            status: 'completed' as const,
                            startedAt: new Date().toISOString(),
                            lastUpdatedAt: new Date().toISOString(),
                            suggestions: [],
                            reviewResult: null,
                            chatMessages: [data.userMessage, data.assistantMessage],
                          };
                        }
                        return null;
                      }

                      // Remove optimistic message and add real messages
                      const messagesWithoutOptimistic = oldSession.chatMessages.filter(
                        (m) => m.id !== optimisticMessageId
                      );

                      return {
                        ...oldSession,
                        sessionId: data.sessionId || oldSession.sessionId,
                        chatMessages: [
                          ...messagesWithoutOptimistic,
                          data.userMessage,
                          data.assistantMessage,
                        ],
                      };
                    }
                  );
                }
              }
            } catch {
              // Ignore parse errors for non-complete events
            }
          }
        }
      }
    },
    [project, specPath, queryClient, onSpecUpdated]
  );

  /**
   * Send a chat message and stream the response.
   */
  const sendMessage = useCallback(
    async (
      message: string,
      selectionContext?: string,
      suggestionId?: string
    ): Promise<void> => {
      if (!specPath) return;

      // Optimistically add user message immediately
      const optimisticUserMessage: ChatMessage = {
        id: `temp-${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
        suggestionId,
      };

      // Update cache with optimistic message
      queryClient.setQueryData<SpecSession | null>(
        specsKeys.session(specPath, project),
        (oldSession) => {
          if (oldSession) {
            return {
              ...oldSession,
              chatMessages: [...oldSession.chatMessages, optimisticUserMessage],
            };
          }
          // Create local session state if none exists
          return {
            sessionId: `temp-${Date.now()}`,
            specFilePath: specPath,
            status: 'completed' as const,
            startedAt: new Date().toISOString(),
            lastUpdatedAt: new Date().toISOString(),
            suggestions: [],
            reviewResult: null,
            chatMessages: [optimisticUserMessage],
          };
        }
      );

      setIsSending(true);

      try {
        const res = await apiFetch(
          buildApiUrl('/api/spec-review/chat/stream', project),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              specPath,
              message,
              suggestionId,
              selectedText: selectionContext,
            }),
          }
        );

        await processStream(res, optimisticUserMessage.id);
      } catch (error) {
        console.error('[useSpecReviewChat] Failed to send message:', error);

        // Remove optimistic message on error
        queryClient.setQueryData<SpecSession | null>(
          specsKeys.session(specPath, project),
          (oldSession) => {
            if (oldSession) {
              return {
                ...oldSession,
                chatMessages: oldSession.chatMessages.filter(
                  (m) => m.id !== optimisticUserMessage.id
                ),
              };
            }
            return oldSession;
          }
        );
      } finally {
        setIsSending(false);
      }
    },
    [project, specPath, sessionId, queryClient, processStream]
  );

  /**
   * Start a discussion about a specific suggestion.
   * Creates a "fresh chat" experience by setting a timestamp filter
   * and auto-sending a contextual first message.
   */
  const discussSuggestion = useCallback(
    async (suggestion: Suggestion): Promise<void> => {
      if (!sessionId) return;

      // Mark the start of this discuss session
      const now = new Date().toISOString();
      setDiscussStartTimestamp(now);

      setDiscussingContext({
        suggestionId: suggestion.id,
        issue: suggestion.issue,
        suggestedFix: suggestion.suggestedFix,
      });

      // Auto-send the first message with suggestion context
      const firstMessage = `Let's discuss this review item:\n\n**Issue:** ${suggestion.issue}\n\n**Suggested Fix:** ${suggestion.suggestedFix}`;

      setIsSending(true);
      try {
        const res = await apiFetch(
          buildApiUrl('/api/spec-review/chat/stream', project),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              message: firstMessage,
              suggestionId: suggestion.id,
            }),
          }
        );

        // Process streaming response
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const jsonData = line.substring(6);
                try {
                  const data = JSON.parse(jsonData);

                  if (data.success && data.userMessage && data.assistantMessage) {
                    if (specPath) {
                      queryClient.setQueryData<SpecSession | null>(
                        specsKeys.session(specPath, project),
                        (oldSession) => {
                          if (oldSession) {
                            return {
                              ...oldSession,
                              chatMessages: [
                                ...oldSession.chatMessages,
                                data.userMessage,
                                data.assistantMessage,
                              ],
                            };
                          }
                          return oldSession;
                        }
                      );
                    }
                  }
                } catch {
                  // Ignore parse errors
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('[useSpecReviewChat] Failed to send discuss message:', error);
      } finally {
        setIsSending(false);
      }
    },
    [project, specPath, sessionId, queryClient]
  );

  /**
   * Clear the discussion context and timestamp filter.
   */
  const clearDiscussingContext = useCallback(() => {
    setDiscussingContext(null);
    setDiscussStartTimestamp(null);
  }, []);

  return {
    isSending,
    discussingContext,
    discussStartTimestamp,
    sendMessage,
    discussSuggestion,
    clearDiscussingContext,
  };
}
