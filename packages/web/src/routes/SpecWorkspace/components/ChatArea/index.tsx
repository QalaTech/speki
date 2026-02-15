import { useCallback } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useQuirkyMessage } from '../../hooks';
import { useIsTabletOrSmaller } from '../../../../hooks/use-mobile';
import { StatusBar } from './StatusBar';
import { ChatInput } from './ChatInput';
import { ConversationPopover } from './ConversationPopover';
import { Dialog } from '../../../../components/ui/Modal';
import type { ChatMessage } from '../../../../components/specs/types';
import type { DiscussingContext } from '../../../../components/review/ReviewChat';
import type { Suggestion } from '../../../../components/specs/types';


interface ChatAreaProps {
  // Messages
  messages: ChatMessage[];
  isSending: boolean;

  discussingContext: DiscussingContext | null;
  onClearDiscussingContext: () => void;
  selectedContext: string | null;
  onClearSelectedContext: () => void;
  
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
  selectedContext,
  onClearSelectedContext,
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
  const isConversationVisible = Boolean(
    isConversationOpen && (messages.length > 0 || discussingContext || selectedContext)
  );

  // Reactive mobile detection for modal behavior
  const isMobileOrTablet = useIsTabletOrSmaller();

  const handleInputFocus = useCallback(() => {
    if (messages.length > 0 || discussingContext || selectedContext) {
      onSetConversationOpen(true);
    }
  }, [messages.length, discussingContext, selectedContext, onSetConversationOpen]);

  return (
    <Dialog
      open={isConversationVisible}
      onOpenChange={onSetConversationOpen}
      modal={isMobileOrTablet}
    >
      <div className="absolute bottom-0 left-0 right-0 z-20">
        {/* Gradient backdrop so chat floats above editor content */}
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-background from-15% via-background/80 to-transparent pointer-events-none" />

        {/* Visual backdrop overlay for conversation - click to dismiss */}
        {isConversationVisible && (
          <DialogPrimitive.Overlay
            className="fixed inset-0 bg-black/20 z-30"
          />
        )}

        <div className="max-w-5xl mx-auto px-6 pb-5 pt-4 relative z-40">
          {/* Conversation Popover */}
          {isConversationVisible && (
            <DialogPrimitive.Content
              className="absolute bottom-full left-0 right-0 mb-2 z-40 outline-hidden"
              onOpenAutoFocus={(e) => e.preventDefault()}
              onCloseAutoFocus={(e) => e.preventDefault()}
              onInteractOutside={(e) => {
                const outsideTarget = e.detail.originalEvent.target;
                const outsideElement =
                  outsideTarget instanceof Element
                    ? outsideTarget
                    : outsideTarget instanceof Node
                      ? outsideTarget.parentElement
                      : null;
                if (!outsideElement) return;

                if (outsideElement.closest('[data-conversation-keep-open]')) {
                  e.preventDefault();
                }
              }}
            >
              <DialogPrimitive.Title className="sr-only">Conversation</DialogPrimitive.Title>
              <ConversationPopover
                messages={messages}
                isSending={isSending}
                quirkyMessage={quirkyMessage}
                discussingContext={discussingContext}
                selectedContext={selectedContext}
                onClose={() => onSetConversationOpen(false)}
                onClearDiscussingContext={onClearDiscussingContext}
                onClearSelectedContext={onClearSelectedContext}
              />
            </DialogPrimitive.Content>
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
            isDiscussing={!!discussingContext || !!selectedContext}
            onFocus={handleInputFocus}
            focusTrigger={focusTrigger}
          />
        </div>
      </div>
    </Dialog>
  );
}
