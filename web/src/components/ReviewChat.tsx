import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../../../src/types/index.js";
import { ChatMarkdown } from "./ChatMarkdown";
import "./ReviewChat.css";
import { TextEffect } from "./ui/TextEffect";

type TextPreset =
  | "blur"
  | "shake"
  | "scale"
  | "fade"
  | "slide"
  | "bounce"
  | "wave";
type IconAnimation = "pulse" | "bounce" | "wiggle" | "spin";

/** Fun quirky messages to show while streaming */
const QUIRKY_MESSAGES: Array<{
  text: string;
  icon: string;
  preset: TextPreset;
  iconAnim: IconAnimation;
}> = [
  { text: "Thinkering...", icon: "🧠", preset: "blur", iconAnim: "pulse" },
  {
    text: "Doing specy things...",
    icon: "📝",
    preset: "slide",
    iconAnim: "bounce",
  },
  { text: "Ooooh nasty...", icon: "😬", preset: "shake", iconAnim: "wiggle" },
  {
    text: "Hmm, interesting...",
    icon: "🤔",
    preset: "fade",
    iconAnim: "pulse",
  },
  {
    text: "Consulting the oracle...",
    icon: "🔮",
    preset: "blur",
    iconAnim: "spin",
  },
  {
    text: "Reading the tea leaves...",
    icon: "🍵",
    preset: "wave",
    iconAnim: "bounce",
  },
  {
    text: "Pondering deeply...",
    icon: "💭",
    preset: "fade",
    iconAnim: "pulse",
  },
  {
    text: "Having a eureka moment...",
    icon: "💡",
    preset: "scale",
    iconAnim: "bounce",
  },
  {
    text: "Channeling my inner genius...",
    icon: "🧙",
    preset: "blur",
    iconAnim: "wiggle",
  },
  {
    text: "Crunching the bits...",
    icon: "⚙️",
    preset: "shake",
    iconAnim: "spin",
  },
  {
    text: "Summoning the answers...",
    icon: "✨",
    preset: "scale",
    iconAnim: "pulse",
  },
  {
    text: "Decoding the matrix...",
    icon: "🔢",
    preset: "blur",
    iconAnim: "spin",
  },
  {
    text: "Brewing some thoughts...",
    icon: "☕",
    preset: "wave",
    iconAnim: "bounce",
  },
  {
    text: "Connecting the dots...",
    icon: "🔗",
    preset: "slide",
    iconAnim: "pulse",
  },
  {
    text: "Mining for insights...",
    icon: "⛏️",
    preset: "bounce",
    iconAnim: "bounce",
  },
  {
    text: "Untangling spaghetti...",
    icon: "🍝",
    preset: "shake",
    iconAnim: "wiggle",
  },
  {
    text: "Polishing the response...",
    icon: "💎",
    preset: "scale",
    iconAnim: "pulse",
  },
  {
    text: "Assembling brilliance...",
    icon: "🏗️",
    preset: "slide",
    iconAnim: "bounce",
  },
  {
    text: "Consulting the specs...",
    icon: "📋",
    preset: "fade",
    iconAnim: "pulse",
  },
  {
    text: "Doing the thing...",
    icon: "🎯",
    preset: "bounce",
    iconAnim: "bounce",
  },
  {
    text: "Ross was right. They were on a break.",
    icon: "🛋️",
    preset: "shake",
    iconAnim: "wiggle",
  },
  {
    text: "Checking my Bitcoin… still not rich.",
    icon: "₿",
    preset: "fade",
    iconAnim: "pulse",
  },
  {
    text: "Watching Buffy instead of thinking.",
    icon: "🧛‍♀️",
    preset: "slide",
    iconAnim: "bounce",
  },
  {
    text: "Googling something I should know.",
    icon: "🔍",
    preset: "blur",
    iconAnim: "spin",
  },
  {
    text: "Stack Overflow, don’t fail me now.",
    icon: "🧑‍💻",
    preset: "wave",
    iconAnim: "bounce",
  },
  {
    text: "Turning it off and on again.",
    icon: "🔌",
    preset: "bounce",
    iconAnim: "bounce",
  },
  {
    text: "Blaming Mercury in retrograde.",
    icon: "🪐",
    preset: "shake",
    iconAnim: "wiggle",
  },
  {
    text: "Overthinking… again.",
    icon: "🔄",
    preset: "slide",
    iconAnim: "spin",
  },
  {
    text: "This made sense five minutes ago.",
    icon: "😵‍💫",
    preset: "blur",
    iconAnim: "pulse",
  },
  {
    text: "Waiting for inspiration to load…",
    icon: "⏳",
    preset: "fade",
    iconAnim: "pulse",
  },
  {
    text: "Pretending this is intentional.",
    icon: "😌",
    preset: "slide",
    iconAnim: "bounce",
  },
  {
    text: "Ah yes, a bold design choice.",
    icon: "🎨",
    preset: "scale",
    iconAnim: "pulse",
  },
  {
    text: "Explaining it to a rubber duck.",
    icon: "🦆",
    preset: "wave",
    iconAnim: "bounce",
  },
  {
    text: "This is fine. Everything is fine.",
    icon: "🔥",
    preset: "shake",
    iconAnim: "wiggle",
  },
  {
    text: "Consulting past-me (bad idea).",
    icon: "📜",
    preset: "fade",
    iconAnim: "pulse",
  },
  {
    text: "Rolling a D20 for luck.",
    icon: "🎲",
    preset: "bounce",
    iconAnim: "bounce",
  },
  {
    text: "Sacrificing performance for vibes.",
    icon: "✨",
    preset: "scale",
    iconAnim: "pulse",
  },
  {
    text: "One does not simply answer this.",
    icon: "🧝‍♂️",
    preset: "slide",
    iconAnim: "wiggle",
  },
  {
    text: "Loading sarcasm module…",
    icon: "😏",
    preset: "blur",
    iconAnim: "pulse",
  },
  {
    text: "Manifesting a solution.",
    icon: "🧿",
    preset: "wave",
    iconAnim: "pulse",
  },
];

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
  isSending = false,
  projectPath,
}: ReviewChatProps): React.ReactElement {
  const [inputValue, setInputValue] = useState("");
  // Current quirky message to display during streaming
  const [quirkyMessage, setQuirkyMessage] = useState<
    (typeof QUIRKY_MESSAGES)[0] | null
  >(null);
  const lastQuirkyIndexRef = useRef<number>(-1);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Pick a random quirky message (avoids repeating the last one)
  const pickRandomQuirky = useCallback(() => {
    let newIndex: number;
    do {
      newIndex = Math.floor(Math.random() * QUIRKY_MESSAGES.length);
    } while (
      newIndex === lastQuirkyIndexRef.current &&
      QUIRKY_MESSAGES.length > 1
    );
    lastQuirkyIndexRef.current = newIndex;
    setQuirkyMessage(QUIRKY_MESSAGES[newIndex]);
  }, []);
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

            // Handle direct content blocks (Claude CLI stream-json format)
            // Pick a new random quirky message for each activity event
            if (
              obj.type === "tool_use" ||
              obj.type === "tool_result" ||
              obj.type === "thinking" ||
              obj.type === "text"
            ) {
              pickRandomQuirky();
            }
            // Also handle wrapped message format for backwards compatibility
            else if (obj.type === "assistant" && obj.message?.content) {
              const content = obj.message.content;
              if (Array.isArray(content)) {
                for (const block of content) {
                  if (block.type === "tool_use" || block.type === "text") {
                    pickRandomQuirky();
                  }
                }
              }
            } else if (obj.type === "user" && obj.message?.content) {
              const content = obj.message.content;
              if (Array.isArray(content)) {
                for (const block of content) {
                  if (block.type === "tool_result") {
                    pickRandomQuirky();
                  }
                }
              }
            }
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
  }, [projectPath, pickRandomQuirky]); // Don't depend on sessionId - we want connection active even before first message

  const handleSubmit = async (): Promise<void> => {
    const message = inputValue.trim();
    if (!message || isSending) return;

    setInputValue("");
    // Pick initial quirky message for streaming
    pickRandomQuirky();

    await onSendMessage(message, selectedText, discussingContext?.suggestionId);

    // Clear streaming state after response completes
    setTimeout(() => {
      setQuirkyMessage(null);
    }, 100);
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
    <div
      className="review-chat"
      data-testid="review-chat"
      data-session-id={sessionId}
    >
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
              const isUser = msg.role === "user";
              return (
                <div
                  key={msg.id}
                  className={`chat-message ${isUser ? "chat-right" : "chat-left"}`}
                  data-testid={`chat-message-${msg.role}`}
                  data-message-id={msg.id}
                >
                  {!isUser && (
                    <div className="chat-avatar chat-avatar-assistant">🤖</div>
                  )}
                  <div
                    className={`chat-bubble ${isUser ? "chat-bubble-user" : "chat-bubble-assistant"}`}
                  >
                    <div className="chat-message-header">
                      <span className="chat-message-role">
                        {isUser ? "You" : "Assistant"}
                      </span>
                      <span className="chat-message-time">
                        {formatTimestamp(msg.timestamp)}
                      </span>
                    </div>
                    <ChatMarkdown
                      content={msg.content}
                      className="chat-bubble-content"
                    />
                    {msg.suggestionId && (
                      <div
                        className="chat-context-badge"
                        data-testid="message-context"
                      >
                        Related to suggestion
                      </div>
                    )}
                  </div>
                  {isUser && (
                    <div className="chat-avatar chat-avatar-user">👤</div>
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}

        {/* Inline streaming indicator - shows fun quirky messages with TextEffect */}
        {isSending && (
          <div className="chat-message chat-left">
            <div className="chat-avatar chat-avatar-assistant">🤖</div>
            <div className="chat-bubble chat-bubble-assistant chat-bubble-streaming">
              <div
                className="streaming-quirky"
                key={quirkyMessage?.text || "init"}
              >
                <span
                  className={`quirky-icon text-effect-icon-${quirkyMessage?.iconAnim || "pulse"}`}
                >
                  {quirkyMessage?.icon || "✨"}
                </span>
                <TextEffect
                  per="char"
                  preset={quirkyMessage?.preset || "fade"}
                  className="quirky-text"
                  delay={0.1}
                >
                  {quirkyMessage?.text || "Warming up..."}
                </TextEffect>
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
            {selectedText.length > 50
              ? `${selectedText.slice(0, 50)}...`
              : selectedText}
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
        <button
          type="button"
          className="send-button"
          onClick={handleSubmit}
          disabled={isSending || !inputValue.trim()}
          data-testid="send-button"
        >
          {isSending ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}
