import { useCallback } from 'react';
import { useQuirkyMessage } from '../../hooks';
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
  
  // Suggestions (for count display)
  suggestions: Suggestion[];
  
  // Review panel control
  isReviewPanelOpen: boolean;
  onOpenReviewPanel: () => void;
  
  // Tasks indicator
  storiesCount: number;
  isPrd: boolean;
  tasksVisible: boolean;
  onScrollToTasks: () => void;
  
  // UI state
  isConversationOpen: boolean;
  onSetConversationOpen: (open: boolean) => void;
  
  // Input
  inputValue: string;
  onInputChange: (value: string) => void;
  onSendMessage: () => void;
  onNewChat: () => void;
  onStartReview: () => void;
  isStartingReview: boolean;
  focusTrigger?: number;

  // Queue
  queueCount?: number;
  onOpenQueue?: () => void;
}

export function ChatArea({
  messages,
  isSending,

  discussingContext,
  onClearDiscussingContext,
  suggestions,
  isReviewPanelOpen,
  onOpenReviewPanel,
  storiesCount,
  isPrd,
  tasksVisible,
  onScrollToTasks,
  isConversationOpen,
  onSetConversationOpen,
  inputValue,
  onInputChange,
  onSendMessage,
  onNewChat,
  onStartReview,
  isStartingReview,
  focusTrigger,
  queueCount,
  onOpenQueue,
}: ChatAreaProps) {
  const pendingSuggestions = suggestions.filter((s) => s.status === 'pending');
  const quirkyMessage = useQuirkyMessage({ isActive: isSending });

  const handleInputFocus = useCallback(() => {
    if (messages.length > 0) {
      onSetConversationOpen(true);
    }
  }, [messages.length, onSetConversationOpen]);

  return (
    <div className="shrink-0 relative">
      {/* Gradient fade from content to chat area */}
      <div className="absolute inset-x-0 bottom-full h-12 bg-linear-to-t from-[#0F0F0F] to-transparent pointer-events-none" />

      {/* Visual backdrop overlay for conversation - click to dismiss */}
      {isConversationOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-30 cursor-pointer"
          onClick={() => onSetConversationOpen(false)}
        />
      )}

      <div className="max-w-5xl mx-auto px-6 py-4 relative z-40">
        {/* Conversation Popover */}
        {isConversationOpen && (messages.length > 0 || discussingContext) && (
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
          isReviewPanelOpen={isReviewPanelOpen}
          onScrollToTasks={onScrollToTasks}
          onOpenReviewPanel={onOpenReviewPanel}
          queueCount={queueCount}
          onOpenQueue={onOpenQueue}
        />

        {/* Chat Input */}
        <ChatInput
          value={inputValue}
          onChange={onInputChange}
          onSend={onSendMessage}
          onNewChat={onNewChat}
          onStartReview={onStartReview}
          isSending={isSending}
          isStartingReview={isStartingReview}
          isDiscussing={!!discussingContext}
          onFocus={handleInputFocus}
          focusTrigger={focusTrigger}
        />
      </div>
    </div>
  );
}

