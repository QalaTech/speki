import { useRef, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { X } from 'lucide-react';
import { ChatMarkdown } from '../../../../components/chat/ChatMarkdown';
import type { ChatMessage } from '../../../../components/specs/types';

import type { QuirkyMessage } from '../../constants';

interface DiscussingContext {
  issue: string;
}

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
        {/* Discussing context banner */}
        {discussingContext && (
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="text-xs font-medium text-primary">Discussing Suggestion</span>
              <button
                onClick={onClearDiscussingContext}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{discussingContext.issue}</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={msg.role === 'user' ? 'text-right' : ''}>
            {msg.role === 'user' ? (
              <div className="inline-block max-w-[85%] bg-[#2a2a2a] rounded-2xl rounded-br-md px-4 py-2.5 text-left">
                <p className="text-sm text-foreground">{msg.content}</p>
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
