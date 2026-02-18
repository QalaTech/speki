import { useCallback, useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useQuirkyMessage } from '../../hooks';
import { useIsTabletOrSmaller, isIOSSafari } from '../../../../hooks/use-mobile';
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
  onGenerateStories?: () => void;
  isStartingReview: boolean;
  isGeneratingStories?: boolean;
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
  onGenerateStories,
  isStartingReview,
  isGeneratingStories,
  focusTrigger,
  queueCount,
  onOpenQueue,
}: ChatAreaProps) {
  const [isChatInputFocused, setIsChatInputFocused] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [visualViewportHeight, setVisualViewportHeight] = useState<number | null>(null);
  const pendingSuggestions = suggestions.filter((s) => s.status === 'pending');
  const quirkyMessage = useQuirkyMessage({ isActive: isSending });
  const isConversationVisible = Boolean(
    isConversationOpen && (messages.length > 0 || discussingContext || selectedContext)
  );

  // Reactive mobile detection for modal behavior
  const isMobileOrTablet = useIsTabletOrSmaller();
  const effectiveKeyboardInset = keyboardInset;
  const isMobileKeyboardOpen = isMobileOrTablet && effectiveKeyboardInset > 0;

  const handleInputFocus = useCallback(() => {
    setIsChatInputFocused(true);
    if (messages.length > 0 || discussingContext || selectedContext) {
      onSetConversationOpen(true);
    }
  }, [messages.length, discussingContext, selectedContext, onSetConversationOpen]);

  const handleInputBlur = useCallback(() => {
    setIsChatInputFocused(false);
    setKeyboardInset(0);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.visualViewport) return;

    if (!isIOSSafari()) return;

    const viewport = window.visualViewport;
    let rafId: number | null = null;

    const updateKeyboardInset = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      rafId = window.requestAnimationFrame(() => {
        const activeElement = document.activeElement;
        const isActiveElementChatInput = Boolean(
          activeElement instanceof HTMLElement &&
          activeElement.matches('[data-chat-input]')
        );
        const shouldConsiderKeyboard = isChatInputFocused || isActiveElementChatInput;

        const currentViewportHeight = viewport.height;
        setVisualViewportHeight(currentViewportHeight);

        if (!shouldConsiderKeyboard) {
          setKeyboardInset(0);
          return;
        }

        const overlap = Math.max(
          0,
          window.innerHeight - viewport.height - viewport.offsetTop
        );
        const viewportToScreenRatio = currentViewportHeight / window.screen.height;
        // Browser chrome can produce overlap, but doesn't shrink viewport as much
        // as the software keyboard. Require both a sizable overlap and a shrunken
        // viewport ratio to avoid phantom padding.
        const hasKeyboardLikeInset = overlap > 120 && viewportToScreenRatio < 0.75;
        setKeyboardInset(hasKeyboardLikeInset ? overlap : 0);
      });
    };

    updateKeyboardInset();
    viewport.addEventListener('resize', updateKeyboardInset);
    viewport.addEventListener('scroll', updateKeyboardInset);
    window.addEventListener('focusin', updateKeyboardInset);
    window.addEventListener('focusout', updateKeyboardInset);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      viewport.removeEventListener('resize', updateKeyboardInset);
      viewport.removeEventListener('scroll', updateKeyboardInset);
      window.removeEventListener('focusin', updateKeyboardInset);
      window.removeEventListener('focusout', updateKeyboardInset);
      setKeyboardInset(0);
      setVisualViewportHeight(null);
    };
  }, [isChatInputFocused]);

  const mobilePopoverMaxHeight = visualViewportHeight
    ? Math.max(160, Math.min(420, visualViewportHeight - (isMobileKeyboardOpen ? 148 : 212)))
    : undefined;

  return (
    <Dialog
      open={isConversationVisible}
      onOpenChange={onSetConversationOpen}
      modal={isMobileOrTablet}
    >
      <div
        className="absolute bottom-0 left-0 right-0 z-40"
        style={{
          paddingBottom: `calc(1rem + env(safe-area-inset-bottom) + ${effectiveKeyboardInset}px)`,
          transition: 'padding-bottom 120ms ease-out',
        }}
      >
        {/* Gradient backdrop so chat floats above editor content */}
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-background from-15% via-background/80 to-transparent pointer-events-none" />

        {/* Visual backdrop overlay for conversation - click to dismiss */}
        {isConversationVisible && (
          <DialogPrimitive.Overlay
            className="fixed inset-0 bg-black/0 z-50"
          />
        )}

        <div className={`max-w-5xl mx-auto relative z-50 ${isMobileKeyboardOpen ? 'px-4 py-3' : 'px-6 pb-5 pt-4'}`}>
          {/* Conversation Popover */}
          {isConversationVisible && (
            <DialogPrimitive.Content
              className={`absolute bottom-full left-0 right-0 z-40 outline-hidden px-4 ${
                isMobileKeyboardOpen ? 'mb-1' : 'mb-2'
              }`}
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
              <DialogPrimitive.Description className="sr-only">
                Chat conversation with AI assistant about the specification
              </DialogPrimitive.Description>
              <ConversationPopover
                messages={messages}
                isSending={isSending}
                quirkyMessage={quirkyMessage}
                discussingContext={discussingContext}
                selectedContext={selectedContext}
                onClose={() => onSetConversationOpen(false)}
                onClearDiscussingContext={onClearDiscussingContext}
                onClearSelectedContext={onClearSelectedContext}
                onNewChat={onNewChat}
                compact={isMobileKeyboardOpen}
                maxHeightPx={isMobileOrTablet ? mobilePopoverMaxHeight : undefined}
              />
            </DialogPrimitive.Content>
          )}

          {/* Status Bar */}
          {!isMobileKeyboardOpen && (
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
          )}

          {/* Chat Input */}
          <ChatInput
            value={inputValue}
            onChange={onInputChange}
            onSend={onSendMessage}
            onStartReview={onStartReview}
            onGenerateStories={onGenerateStories}
            isSending={isSending}
            isStartingReview={isStartingReview}
            isGeneratingStories={isGeneratingStories}
            isDiscussing={!!discussingContext || !!selectedContext}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            focusTrigger={focusTrigger}
          />
        </div>
      </div>
    </Dialog>
  );
}
