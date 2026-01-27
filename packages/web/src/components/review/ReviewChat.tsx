import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@speki/core";
import { ChatMarkdown } from "../chat/ChatMarkdown";
import { Button } from "../ui/Button";
import {
  SparklesIcon,
  ChatBubbleLeftRightIcon,
} from "@heroicons/react/24/solid";




/** Context for discussing a specific suggestion */
export interface DiscussingContext {
  suggestionId: string;
  issue: string;
  suggestedFix: string;
}

export interface ReviewChatProps {
  /** Chat message history */
  messages: ChatMessage[];
  /** Session ID for the review session (optional - may not exist until first message) */
  sessionId?: string;
  /** Currently selected text from the editor (optional) */
  selectedText?: string;
  /** Context for discussing a specific suggestion (optional) */
  discussingContext?: DiscussingContext | null;
  /** Callback when sending a message */
  onSendMessage: (
    message: string,
    selectionContext?: string,
    suggestionId?: string,
  ) => Promise<void>;
  /** Callback to clear discussing context */
  onClearDiscussingContext?: () => void;
  /** Callback to start a new chat session */
  onNewChat?: () => void;
  /** Whether a message is currently being sent */
  isSending?: boolean;
  /** Project path for SSE connection */
  projectPath?: string;
}

export function ReviewChat({
  messages,
  sessionId,
  selectedText,
  discussingContext,
  onSendMessage,
  onClearDiscussingContext,
  onNewChat: _onNewChat,
  isSending = false,
  projectPath,
}: ReviewChatProps): React.ReactElement {
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages]);

  // Focus input when discussing context is set
  useEffect(() => {
    if (discussingContext) {
      inputRef.current?.focus();
    }
  }, [discussingContext]);

  // Subscribe to chat stream SSE events
  useEffect(() => {
    if (!projectPath) return;

    const eventSource = new EventSource(
      `/api/events/spec-review?project=${encodeURIComponent(projectPath)}`,
    );
    eventSourceRef.current = eventSource;

    // Debug: log when EventSource connects
    eventSource.onopen = () => {
      console.log("[ReviewChat] SSE connected to spec-review");
    };
    eventSource.onerror = (err) => {
      console.error("[ReviewChat] SSE error:", err);
    };

    // Listen for connected event to verify SSE is working
    eventSource.addEventListener("spec-review/connected", (event) => {
      console.log(
        "[ReviewChat] Received spec-review/connected event:",
        event.data,
      );
    });

    eventSource.addEventListener("spec-review/chat-stream", (event) => {
      console.log(
        "[ReviewChat] Received chat-stream event:",
        event.data?.substring(0, 200),
      );
      try {
        const data = JSON.parse(event.data);
        console.log("[ReviewChat] Parsed data:", {
          hasLine: !!data.data?.line,
          dataKeys: Object.keys(data),
        });
        // Process any chat stream event for this project (already filtered by project in URL)
        if (data.data?.line) {
          const line = data.data.line;
          console.log("[ReviewChat] Processing line:", line.substring(0, 100));

          // Parse JSONL line into ParsedEntry
          try {
            const obj = JSON.parse(line);
            console.log(
              "[ReviewChat] Parsed JSONL object type:",
              obj.type,
              "keys:",
              Object.keys(obj),
            );
          } catch {
            // Ignore parse errors for individual lines
          }
        }
      } catch {
        // Ignore SSE parse errors
      }
    });

    return () => {
      eventSource.close();
    };
  }, [projectPath]); // Don't depend on sessionId - we want connection active even before first message

  const handleSubmit = async (): Promise<void> => {
    const message = inputValue.trim();
    if (!message || isSending) return;

    setInputValue("");
    await onSendMessage(message, selectedText, discussingContext?.suggestionId);

    // Clear context after sending
    onClearDiscussingContext?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <>

      <div
        className="flex flex-col h-full min-h-[200px] bg-transparent"
        data-testid="review-chat"
        data-session-id={sessionId}
      >
        {/* Messages Area */}
        <div
          className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 chat-scrollbar"
          data-testid="chat-messages"
        >
          {/* Context Banner - shown when discussing a suggestion */}
          {discussingContext && (
            <div
              className="bg-primary/10 border border-primary/10 rounded-xl p-4 mb-2 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300"
              data-testid="discussion-context"
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/20">
                    <ChatBubbleLeftRightIcon className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest text-foreground">Discussing Review Item</span>
                </div>
                <button
                  className="p-1.5 rounded-full hover:bg-primary/20 transition-all active:scale-95"
                  onClick={onClearDiscussingContext}
                  title="Clear context"
                >
                  <span className="text-xs">✕</span>
                </button>
              </div>
              <div className="space-y-3 text-sm">
                <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">Issue</span>
                  <p className="m-0 text-foreground/90 font-medium leading-relaxed">{discussingContext.issue}</p>
                </div>
                {discussingContext.suggestedFix && (
                  <div className="bg-success/5 p-3 rounded-lg border border-success/10">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-success block mb-1">Suggested Fix</span>
                    <p className="m-0 text-foreground/90 font-medium leading-relaxed">{discussingContext.suggestedFix}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {messages.length === 0 && !discussingContext ? (
            <div
              className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2"
              data-testid="chat-empty"
            >
              <ChatBubbleLeftRightIcon className="w-8 h-8 opacity-20" />
              <p className="m-0 text-sm">No messages yet. Ask a question about the review.</p>
            </div>
          ) : messages.length === 0 && discussingContext ? (
            <div
              className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-2"
              data-testid="chat-context-ready"
            >
              <p className="m-0 text-sm italic">Type your question about this issue below</p>
            </div>
          ) : (
            <>
              {messages.map((msg) => {
                const isUser = msg.role === "user";
                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-2 max-w-[95%] chat-message-animate ${
                      isUser ? "self-end flex-row-reverse" : "self-start"
                    }`}
                    data-testid={`chat-message-${msg.role}`}
                    data-message-id={msg.id}
                  >
                    {!isUser && (
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 shadow-sm bg-primary/20 text-primary border border-primary/20">
                        <SparklesIcon className="w-3.5 h-3.5" />
                      </div>
                    )}
                    <div
                      className={`py-3 px-4 rounded-2xl text-[13px] leading-relaxed shadow-sm wrap-break-word ${
                        isUser
                          ? "bg-primary text-primary-foreground rounded-tr-none"
                          : "bg-white/10 text-foreground rounded-tl-none hover:bg-white/15 transition-colors"
                      }`}
                    >
                      <div className="flex justify-between items-center mb-1.5 text-[10px]">
                        <span className={`font-bold uppercase tracking-widest ${isUser ? 'text-primary-foreground/90' : 'text-muted-foreground'}`}>
                          {isUser ? "You" : "Speki"}
                        </span>
                        <span className={`font-medium ${isUser ? 'text-primary-foreground/60' : 'text-muted-foreground/40'}`}>
                          {formatTimestamp(msg.timestamp)}
                        </span>
                      </div>
                      <ChatMarkdown content={msg.content} />
                      {msg.suggestionId && (
                        <div
                          className="mt-1.5 text-[10px] text-muted-foreground italic flex items-center gap-1 before:content-['💡'] before:text-[10px]"
                          data-testid="message-context"
                        >
                          Related to suggestion
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </>
          )}

          {/* Inline streaming indicator - Simple typing dots */}
          {isSending && (
            <div className="flex items-center gap-3 max-w-[95%] chat-message-animate self-start mt-1">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 shadow-sm bg-primary/20 text-primary border border-primary/20">
                <SparklesIcon className="w-3.5 h-3.5 animate-pulse" />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 h-5 px-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"></span>
                </div>
                <span className="text-xs text-muted-foreground/60 font-medium italic">Speki is thinking...</span>
              </div>
            </div>
          )}
        </div>

        {/* Selection Context Indicator */}
        {selectedText && (
          <div
            className="flex items-center gap-2 py-2 px-3 bg-success/10 border-t border-success/20 text-xs"
            data-testid="selection-context"
          >
            <span className="font-semibold text-success uppercase tracking-wide text-[10px]">Selection:</span>
            <span className="text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px]">
              {selectedText.length > 50
                ? `${selectedText.slice(0, 50)}...`
                : selectedText}
            </span>
          </div>
        )}

        {/* Discussing Context Indicator */}
        {discussingContext && (
          <div
            className="py-2 px-3 bg-secondary/10 border-t border-secondary/30 text-xs"
            data-testid="discussing-context"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-secondary uppercase tracking-wide text-[10px]">Discussing suggestion:</span>
              <button
                type="button"
                className="bg-transparent border-none text-muted-foreground cursor-pointer px-1 text-xs opacity-70 transition-opacity hover:opacity-100 hover:text-error"
                onClick={onClearDiscussingContext}
                aria-label="Clear discussing context"
              >
                ✕
              </button>
            </div>
            <div className="text-foreground/80 text-[11px] leading-snug">
              {discussingContext.issue.length > 100
                ? `${discussingContext.issue.slice(0, 100)}...`
                : discussingContext.issue}
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="flex gap-2 p-3 border-t border-white/5 bg-transparent">
          <textarea
            ref={inputRef}
            className="flex-1 min-h-[40px] max-h-[120px] py-2.5 px-3 border border-transparent rounded-lg bg-white/5 text-foreground font-inherit text-[13px] resize-y transition-all focus:outline-none focus:bg-white/10 focus:ring-1 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-muted-foreground/50"
            placeholder={
              discussingContext
                ? "Ask about this suggestion..."
                : selectedText
                  ? "Ask about the selected text..."
                  : "Ask a question about the review..."
            }
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSending}
            data-testid="chat-input"
            aria-label="Chat input"
          />
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={isSending || !inputValue.trim()}
            data-testid="send-button"
            className="shadow-sm"
          >
            {isSending ? "..." : "Send"}
          </Button>
        </div>
      </div>
    </>
  );
}
