import { useCallback, useEffect } from 'react';
import { useQuirkyMessage } from '../../hooks';
import { SuggestionsPanel } from './SuggestionsPanel';
import { StatusBar } from './StatusBar';
import { ChatInput } from './ChatInput';
import { ConversationPopover } from './ConversationPopover';
import type { ChatMessage } from '../../../../components/specs/types';
import type { DiscussingContext } from '../../../../components/review/ReviewChat';
import type { Suggestion } from '../../../../components/specs/types';


interface ChatAreaProps {
  // Messages
  messages: ChatMessage[];
  isSending: boolean;

  discussingContext: DiscussingContext | null;
  onClearDiscussingContext: () => void;
  
  // Suggestions
  suggestions: Suggestion[];
  onAcceptSuggestion: (id: string) => void;
  onRejectSuggestion: (id: string) => void;
  onDiscussSuggestion: (suggestion: Suggestion) => void;
  
  // Tasks indicator
  storiesCount: number;
  isPrd: boolean;
  tasksVisible: boolean;
  onScrollToTasks: () => void;
  
  // UI state
  isConversationOpen: boolean;
  isSuggestionsExpanded: boolean;
  onSetConversationOpen: (open: boolean) => void;
  onSetSuggestionsExpanded: (expanded: boolean) => void;
  
  // Input
  inputValue: string;
  onInputChange: (value: string) => void;
  onSendMessage: () => void;
  onNewChat: () => void;
  onStartReview: () => void;
  isStartingReview: boolean;
}

export function ChatArea({
  messages,
  isSending,

  discussingContext,
  onClearDiscussingContext,
  suggestions,
  onRejectSuggestion,
  onDiscussSuggestion,
  storiesCount,
  isPrd,
  tasksVisible,
  onScrollToTasks,
  isConversationOpen,
  isSuggestionsExpanded,
  onSetConversationOpen,
  onSetSuggestionsExpanded,
  inputValue,
  onInputChange,
  onSendMessage,
  onNewChat,
  onStartReview,
  isStartingReview,
}: ChatAreaProps) {
  const pendingSuggestions = suggestions.filter((s) => s.status === 'pending');
  const quirkyMessage = useQuirkyMessage({ isActive: isSending });

  // Auto-close suggestions when all reviewed
  useEffect(() => {
    if (pendingSuggestions.length === 0 && isSuggestionsExpanded) {
      onSetSuggestionsExpanded(false);
    }
  }, [pendingSuggestions.length, isSuggestionsExpanded, onSetSuggestionsExpanded]);

  const handleDismissAllSuggestions = useCallback(() => {
    pendingSuggestions.forEach((s) => onRejectSuggestion(s.id));
  }, [pendingSuggestions, onRejectSuggestion]);

  const handleDiscuss = useCallback(
    (suggestion: Suggestion) => {
      onDiscussSuggestion(suggestion);
      onSetSuggestionsExpanded(false);
      onSetConversationOpen(true);
    },
    [onDiscussSuggestion, onSetSuggestionsExpanded, onSetConversationOpen]
  );

  const handleToggleSuggestions = useCallback(() => {
    onSetSuggestionsExpanded(!isSuggestionsExpanded);
    if (!isSuggestionsExpanded) {
      onSetConversationOpen(false);
    }
  }, [isSuggestionsExpanded, onSetSuggestionsExpanded, onSetConversationOpen]);

  const handleInputFocus = useCallback(() => {
    if (messages.length > 0) {
      onSetConversationOpen(true);
      onSetSuggestionsExpanded(false);
    }
  }, [messages.length, onSetConversationOpen, onSetSuggestionsExpanded]);

  return (
    <div className="shrink-0 relative">
      {/* Gradient fade from content to chat area */}
      <div className="absolute inset-x-0 -top-16 h-16 bg-gradient-to-t from-background to-transparent pointer-events-none" />

      {/* Visual backdrop overlay for conversation or suggestions - click to dismiss */}
      {(isConversationOpen || isSuggestionsExpanded) && (
        <div
          className="fixed inset-0 bg-black/20 z-30 cursor-pointer"
          onClick={() => {
            onSetConversationOpen(false);
            onSetSuggestionsExpanded(false);
          }}
        />
      )}

      <div className="max-w-5xl mx-auto px-6 py-4 relative z-40">
        {/* Conversation Popover */}
        {isConversationOpen && messages.length > 0 && !isSuggestionsExpanded && (
          <ConversationPopover
            messages={messages}
            isSending={isSending}
            quirkyMessage={quirkyMessage}
            discussingContext={discussingContext}
            onClose={() => onSetConversationOpen(false)}
            onClearDiscussingContext={onClearDiscussingContext}
          />
        )}

        {/* Status Bar */}
        <StatusBar
          storiesCount={storiesCount}
          isPrd={isPrd}
          tasksVisible={tasksVisible}
          pendingSuggestionsCount={pendingSuggestions.length}
          isSuggestionsExpanded={isSuggestionsExpanded}
          onScrollToTasks={onScrollToTasks}
          onToggleSuggestions={handleToggleSuggestions}
          onDismissAllSuggestions={handleDismissAllSuggestions}
        />

        {/* Expanded Suggestions */}
        {isSuggestionsExpanded && pendingSuggestions.length > 0 && (
          <SuggestionsPanel
            suggestions={pendingSuggestions}
            onReject={onRejectSuggestion}
            onDiscuss={handleDiscuss}
          />
        )}

        {/* Chat Input */}
        <ChatInput
          value={inputValue}
          onChange={onInputChange}
          onSend={onSendMessage}
          onNewChat={onNewChat}
          onStartReview={onStartReview}
          isSending={isSending}
          isStartingReview={isStartingReview}

          onFocus={handleInputFocus}
        />
      </div>
    </div>
  );
}
