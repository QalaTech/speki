import { useRef, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

import { ChatMarkdown } from '../../../../components/chat/ChatMarkdown';
import type { ChatMessage } from '../../../../components/specs/types';
import type { DiscussingContext } from '../../../../components/review/ReviewChat';

import type { QuirkyMessage } from '../../constants';

interface ConversationPopoverProps {
  messages: ChatMessage[];
  isSending: boolean;
  quirkyMessage: QuirkyMessage | null;
  discussingContext: DiscussingContext | null;
  onClose: () => void;
  onClearDiscussingContext: () => void;
}

export function ConversationPopover({
  messages,
  isSending,
  quirkyMessage,
  discussingContext,
  onClose,
  onClearDiscussingContext,
}: ConversationPopoverProps) {
  const conversationRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div
      ref={conversationRef}
      className="absolute bottom-full left-0 right-0 mb-2 max-h-[28rem] overflow-y-auto rounded-lg bg-[#1e1e1e] border border-white/5 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="sticky top-0 flex items-center justify-between px-4 py-2 border-b border-white/5 bg-[#1e1e1e] z-10">
        <span className="text-sm font-medium text-muted-foreground">Conversation</span>
        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Thread-style quote preview for discussing context */}
        {discussingContext && (
          <div className="border-l-2 border-primary/60 pl-3 py-2 bg-primary/5 rounded-r-lg group">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-semibold text-primary/80 block mb-1">
                  Replying to review item:
                </span>
                <p className="text-sm text-foreground/80 leading-snug line-clamp-2">
                  {discussingContext.issue.length > 80 
                    ? `${discussingContext.issue.slice(0, 80)}...` 
                    : discussingContext.issue}
                  {discussingContext.suggestedFix && (
                    <span className="text-muted-foreground">
                      {' → '}
                      <span className="text-success/80">
                        {discussingContext.suggestedFix.length > 60
                          ? `${discussingContext.suggestedFix.slice(0, 60)}...`
                          : discussingContext.suggestedFix}
                      </span>
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={onClearDiscussingContext}
                className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-primary/20 transition-all shrink-0"
                title="Clear context"
              >
                <XMarkIcon className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={msg.role === 'user' ? 'text-right' : ''}>
            {msg.role === 'user' ? (
              <div className="inline-block max-w-[85%] bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5 text-left">
                <p className="text-sm">{msg.content}</p>
                {msg.suggestionId && (
                  <div className="mt-1.5 text-[10px] text-primary-foreground/70 italic flex items-center gap-1">
                    <span>💡</span>
                    <span>Related to suggestion</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-foreground/90 leading-relaxed prose prose-invert prose-sm max-w-none">
                <ChatMarkdown content={msg.content} />
              </div>
            )}
          </div>
        ))}

        {isSending && (
          <div className="text-sm">
            <span className="animate-text-shimmer font-medium">
              {quirkyMessage?.text || 'Thinking...'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
