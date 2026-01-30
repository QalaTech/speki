import { useState, useCallback } from 'react';
import { apiFetch } from '../components/ui/ErrorContext';
import type { SpecSession, Suggestion } from '../components/specs/types';
import type { DiscussingContext } from '../components/review/ReviewChat';

interface UseSpecChatOptions {
  projectPath: string;
  selectedPath: string | null;
  session: SpecSession | null;
  setSession: React.Dispatch<React.SetStateAction<SpecSession | null>>;
  onContentRefetch: () => Promise<void>;
}

interface UseSpecChatReturn {
  isChatOpen: boolean;
  setIsChatOpen: (open: boolean) => void;
  isSendingChat: boolean;
  discussingContext: DiscussingContext | null;
  setDiscussingContext: (context: DiscussingContext | null) => void;
  discussStartTimestamp: string | null;
  setDiscussStartTimestamp: (timestamp: string | null) => void;
  handleSendChatMessage: (
    message: string,
    selectionContext?: string,
    suggestionId?: string,
    discussingContext?: DiscussingContext | null
  ) => Promise<void>;
  handleDiscussSuggestion: (suggestion: Suggestion) => void;
  handleNewChat: () => void;
  filteredChatMessages: SpecSession['chatMessages'];
}

/**
 * Hook for managing spec chat/discussion functionality.
 */
export function useSpecChat({
  projectPath,
  selectedPath,
  session,
  setSession,
  onContentRefetch,
}: UseSpecChatOptions): UseSpecChatReturn {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [discussingContext, setDiscussingContext] = useState<DiscussingContext | null>(null);
  const [discussStartTimestamp, setDiscussStartTimestamp] = useState<string | null>(null);

  // API helper
  const apiUrl = useCallback((endpoint: string) => {
    const separator = endpoint.includes('?') ? '&' : '?';
    return `${endpoint}${separator}project=${encodeURIComponent(projectPath)}`;
  }, [projectPath]);

  // Handle sending chat message
  const handleSendChatMessage = useCallback(async (
    message: string,
    selectionContext?: string,
    suggestionId?: string,
    passedDiscussingContext?: DiscussingContext | null
  ): Promise<void> => {
    if (!selectedPath) return;

    // Optimistically add user message immediately
    const optimisticUserMessage = {
      id: `temp-${Date.now()}`,
      role: 'user' as const,
      content: message,
      timestamp: new Date().toISOString(),
      suggestionId,
    };

    setSession(prev => {
      if (prev) {
        return {
          ...prev,
          chatMessages: [...prev.chatMessages, optimisticUserMessage],
        };
      }
      // Create local session state
      return {
        sessionId: `temp-${Date.now()}`,
        status: 'completed',
        suggestions: [],
        reviewResult: null,
        chatMessages: [optimisticUserMessage],
      };
    });

    setIsSendingChat(true);

    try {
      // Send the message via POST to streaming endpoint
      const res = await apiFetch(apiUrl('/api/spec-review/chat/stream'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session?.sessionId,
          specPath: selectedPath,
          message,
          suggestionId,
          selectedText: selectionContext,
          // Pass full context for decompose review issues (not stored server-side)
          discussingContext: passedDiscussingContext ? {
            issue: passedDiscussingContext.issue,
            suggestedFix: passedDiscussingContext.suggestedFix,
          } : undefined,
        }),
      });

      // Read the SSE stream from response
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonData = line.substring(6); // Remove 'data: ' prefix
              try {
                const data = JSON.parse(jsonData);

                if (data.success && data.assistantMessage) {
                  // Check if agent updated the spec file
                  if (data.assistantMessage.content?.includes('[SPEC_UPDATED]')) {
                    onContentRefetch();
                  }

                  // Replace optimistic message with server version and add assistant response
                  setSession(prev => {
                    if (prev) {
                      const messagesWithoutOptimistic = prev.chatMessages.filter(
                        m => m.id !== optimisticUserMessage.id
                      );
                      return {
                        ...prev,
                        sessionId: data.sessionId || prev.sessionId,
                        chatMessages: [...messagesWithoutOptimistic, data.userMessage, data.assistantMessage],
                      };
                    } else if (data.sessionId && data.userMessage && data.assistantMessage) {
                      // Create new session if none exists (first message)
                      return {
                        sessionId: data.sessionId,
                        status: 'completed' as const,
                        suggestions: [],
                        reviewResult: null,
                        chatMessages: [data.userMessage, data.assistantMessage],
                      };
                    }
                    return prev;
                  });
                }
              } catch {
                // Ignore parse errors for non-complete events
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to send chat message:', error);
      // Remove optimistic message on error
      setSession(prev => {
        if (prev) {
          return {
            ...prev,
            chatMessages: prev.chatMessages.filter(m => m.id !== optimisticUserMessage.id),
          };
        }
        return prev;
      });
    } finally {
      setIsSendingChat(false);
    }
  }, [selectedPath, session?.sessionId, apiUrl, onContentRefetch, setSession]);

  // Handle discuss suggestion (from review tab)
  // Opens chat with context banner - doesn't auto-send a message
  const handleDiscussSuggestion = useCallback((suggestion: Suggestion) => {
    // Mark the start of this discuss session (hides older messages from view)
    const now = new Date().toISOString();
    setDiscussStartTimestamp(now);

    setDiscussingContext({
      suggestionId: suggestion.id,
      issue: suggestion.issue,
      suggestedFix: suggestion.suggestedFix,
    });
    setIsChatOpen(true);
  }, []);

  // Filter chat messages based on discuss start timestamp
  const filteredChatMessages = discussStartTimestamp && session?.chatMessages
    ? session.chatMessages.filter(m => m.timestamp >= discussStartTimestamp)
    : (session?.chatMessages ?? []);

  // Handle starting a new chat (clears session on server and locally)
  const handleNewChat = useCallback(async () => {
    if (!selectedPath) return;

    try {
      // Call API to clear chat on server (generates new session ID)
      const res = await apiFetch(apiUrl('/api/spec-review/chat/clear'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specPath: selectedPath }),
      });

      if (res.ok) {
        const data = await res.json();
        // Update local session with new ID and empty messages
        setSession(prev => prev ? {
          ...prev,
          sessionId: data.sessionId,
          chatMessages: [],
        } : null);
      }
    } catch (error) {
      console.error('Failed to clear chat:', error);
    }

    // Always clear local UI state
    setDiscussingContext(null);
    setDiscussStartTimestamp(null);
  }, [selectedPath, apiUrl, setSession]);

  return {
    isChatOpen,
    setIsChatOpen,
    isSendingChat,
    discussingContext,
    setDiscussingContext,
    discussStartTimestamp,
    setDiscussStartTimestamp,
    handleSendChatMessage,
    handleDiscussSuggestion,
    handleNewChat,
    filteredChatMessages,
  };
}
