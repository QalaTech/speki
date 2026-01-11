import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../../../src/types/index.js';
import './ReviewChat.css';

/** Context for discussing a specific suggestion */
export interface DiscussingContext {
  suggestionId: string;
  issue: string;
  suggestedFix: string;
}

export interface ReviewChatProps {
  /** Chat message history */
  messages: ChatMessage[];
  /** Session ID for the review session */
  sessionId: string;
  /** Currently selected text from the editor (optional) */
  selectedText?: string;
  /** Context for discussing a specific suggestion (optional) */
  discussingContext?: DiscussingContext | null;
  /** Callback when sending a message */
  onSendMessage: (message: string, selectionContext?: string, suggestionId?: string) => Promise<void>;
  /** Callback to clear discussing context */
  onClearDiscussingContext?: () => void;
  /** Whether a message is currently being sent */
  isSending?: boolean;
}

export function ReviewChat({
  messages,
  sessionId,
  selectedText,
  discussingContext,
  onSendMessage,
  onClearDiscussingContext,
  isSending = false,
}: ReviewChatProps): React.ReactElement {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when discussing context is set
  useEffect(() => {
    if (discussingContext) {
      inputRef.current?.focus();
    }
  }, [discussingContext]);

  const handleSubmit = async (): Promise<void> => {
    const message = inputValue.trim();
    if (!message || isSending) return;

    setInputValue('');
    await onSendMessage(message, selectedText, discussingContext?.suggestionId);
    // Clear context after sending
    onClearDiscussingContext?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="review-chat" data-testid="review-chat" data-session-id={sessionId}>
      {/* Messages Area */}
      <div className="chat-messages-container" data-testid="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty-state" data-testid="chat-empty">
            <div className="chat-empty-state-icon">💬</div>
            <p>No messages yet. Ask a question about the review.</p>
          </div>
        ) : (
          <>
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`chat-message ${isUser ? 'chat-right' : 'chat-left'}`}
                  data-testid={`chat-message-${msg.role}`}
                  data-message-id={msg.id}
                >
                  {!isUser && <div className="chat-avatar chat-avatar-assistant">🤖</div>}
                  <div className={`chat-bubble ${isUser ? 'chat-bubble-user' : 'chat-bubble-assistant'}`}>
                    <div className="chat-message-header">
                      <span className="chat-message-role">
                        {isUser ? 'You' : 'Assistant'}
                      </span>
                      <span className="chat-message-time">{formatTimestamp(msg.timestamp)}</span>
                    </div>
                    <div className="chat-bubble-content">{msg.content}</div>
                    {msg.suggestionId && (
                      <div className="chat-context-badge" data-testid="message-context">
                        Related to suggestion
                      </div>
                    )}
                  </div>
                  {isUser && <div className="chat-avatar chat-avatar-user">👤</div>}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}

        {/* Typing indicator when sending */}
        {isSending && (
          <div className="chat-message chat-left">
            <div className="chat-avatar chat-avatar-assistant">🤖</div>
            <div className="chat-bubble chat-bubble-typing">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Selection Context Indicator */}
      {selectedText && (
        <div className="selection-context" data-testid="selection-context">
          <span className="selection-label">Selection:</span>
          <span className="selection-preview">
            {selectedText.length > 50 ? `${selectedText.slice(0, 50)}...` : selectedText}
          </span>
        </div>
      )}

      {/* Discussing Context Indicator */}
      {discussingContext && (
        <div className="discussing-context" data-testid="discussing-context">
          <div className="discussing-header">
            <span className="discussing-label">Discussing suggestion:</span>
            <button
              type="button"
              className="discussing-clear"
              onClick={onClearDiscussingContext}
              aria-label="Clear discussing context"
            >
              ✕
            </button>
          </div>
          <div className="discussing-issue">
            {discussingContext.issue.length > 100
              ? `${discussingContext.issue.slice(0, 100)}...`
              : discussingContext.issue}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          className="chat-input"
          placeholder={
            discussingContext
              ? 'Ask about this suggestion...'
              : selectedText
              ? 'Ask about the selected text...'
              : 'Ask a question about the review...'
          }
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSending}
          data-testid="chat-input"
          aria-label="Chat input"
        />
        <button
          type="button"
          className="send-button"
          onClick={handleSubmit}
          disabled={isSending || !inputValue.trim()}
          data-testid="send-button"
        >
          {isSending ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
}
