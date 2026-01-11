import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../../../src/types/index.js';
import './ReviewChat.css';

export interface ReviewChatProps {
  /** Chat message history */
  messages: ChatMessage[];
  /** Session ID for the review session */
  sessionId: string;
  /** Currently selected text from the editor (optional) */
  selectedText?: string;
  /** Callback when sending a message */
  onSendMessage: (message: string, selectionContext?: string) => Promise<void>;
  /** Whether a message is currently being sent */
  isSending?: boolean;
}

export function ReviewChat({
  messages,
  sessionId,
  selectedText,
  onSendMessage,
  isSending = false,
}: ReviewChatProps): React.ReactElement {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (): Promise<void> => {
    const message = inputValue.trim();
    if (!message || isSending) return;

    setInputValue('');
    await onSendMessage(message, selectedText);
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
          <div className="chat-empty" data-testid="chat-empty">
            <p>No messages yet. Ask a question about the review.</p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`chat-message ${msg.role === 'user' ? 'message-user' : 'message-assistant'}`}
                data-testid={`chat-message-${msg.role}`}
                data-message-id={msg.id}
              >
                <div className="message-header">
                  <span className="message-role">
                    {msg.role === 'user' ? 'You' : 'Assistant'}
                  </span>
                  <span className="message-time">{formatTimestamp(msg.timestamp)}</span>
                </div>
                <div className="message-content">{msg.content}</div>
                {msg.suggestionId && (
                  <div className="message-context" data-testid="message-context">
                    Related to suggestion
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
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

      {/* Input Area */}
      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          className="chat-input"
          placeholder={selectedText ? 'Ask about the selected text...' : 'Ask a question about the review...'}
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
