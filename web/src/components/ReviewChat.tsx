import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../../../src/types/index.js";
import { ChatMarkdown } from "./ChatMarkdown";
import { TextEffect } from "./ui/TextEffect";

/* Tailwind styles for animations and complex gradients that can't be done inline */
const reviewChatStyles = `
  @keyframes chatFadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes shimmer {
    0% { left: -100%; }
    100% { left: 100%; }
  }
  @keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }
  @keyframes iconPulse {
    0%, 100% { transform: scale(1); opacity: 0.8; }
    50% { transform: scale(1.1); opacity: 1; }
  }
  @keyframes iconBounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
  }
  @keyframes iconWiggle {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(-10deg); }
    75% { transform: rotate(10deg); }
  }
  @keyframes iconSpin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .chat-message-animate { animation: chatFadeIn 0.2s ease-out; }
  .chat-bubble-streaming-shimmer::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(138, 180, 248, 0.08), transparent);
    animation: shimmer 2s infinite;
  }
  .text-effect-icon-pulse { animation: iconPulse 1.5s ease-in-out infinite; }
  .text-effect-icon-bounce { animation: iconBounce 0.6s ease-in-out infinite; }
  .text-effect-icon-wiggle { animation: iconWiggle 0.5s ease-in-out infinite; }
  .text-effect-icon-spin { animation: iconSpin 1s linear infinite; }
  /* Custom scrollbar */
  .chat-scrollbar::-webkit-scrollbar { width: 6px; }
  .chat-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .chat-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
  .chat-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
`;

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
    <>
      <style>{reviewChatStyles}</style>
      <div
        className="flex flex-col h-full min-h-[200px] bg-surface"
        data-testid="review-chat"
        data-session-id={sessionId}
      >
        {/* Messages Area */}
        <div
          className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 chat-scrollbar"
          data-testid="chat-messages"
        >
          {messages.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center h-full text-text-muted gap-2"
              data-testid="chat-empty"
            >
              <div className="text-[32px] opacity-50">💬</div>
              <p className="m-0 text-sm">No messages yet. Ask a question about the review.</p>
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
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 shadow-sm bg-gradient-to-br from-[#667eea] to-[#764ba2]">
                        🤖
                      </div>
                    )}
                    <div
                      className={`py-2.5 px-3.5 rounded-2xl text-[13px] leading-relaxed shadow-sm break-words ${
                        isUser
                          ? "bg-gradient-to-br from-[#3a2d4a] to-[#2d1e38] text-[#e0e0e0] rounded-br border border-white/[0.08]"
                          : "bg-gradient-to-br from-[#2d2d3a] to-[#1e1e28] text-[#e0e0e0] rounded-bl border border-white/[0.05]"
                      }`}
                    >
                      <div className="flex justify-between items-center mb-1 text-[11px]">
                        <span className="font-semibold text-[#a0a0a0] uppercase tracking-wide">
                          {isUser ? "You" : "Assistant"}
                        </span>
                        <span className="text-[#666]">
                          {formatTimestamp(msg.timestamp)}
                        </span>
                      </div>
                      <ChatMarkdown
                        content={msg.content}
                        className="whitespace-pre-wrap"
                      />
                      {msg.suggestionId && (
                        <div
                          className="mt-1.5 text-[10px] text-[#888] italic flex items-center gap-1 before:content-['💡'] before:text-[10px]"
                          data-testid="message-context"
                        >
                          Related to suggestion
                        </div>
                      )}
                    </div>
                    {isUser && (
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 shadow-sm bg-gradient-to-br from-[#4facfe] to-[#00f2fe]">
                        👤
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </>
          )}

          {/* Inline streaming indicator - shows fun quirky messages with TextEffect */}
          {isSending && (
            <div className="flex items-start gap-2 max-w-[95%] chat-message-animate self-start">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 shadow-sm bg-gradient-to-br from-[#667eea] to-[#764ba2]">
                🤖
              </div>
              <div className="min-h-[40px] bg-gradient-to-br from-[rgba(138,180,248,0.06)] to-[rgba(168,148,248,0.04)] border border-dashed border-[rgba(138,180,248,0.35)] rounded-xl shadow-[0_0_12px_rgba(138,180,248,0.08)] relative overflow-hidden py-2.5 px-3.5 chat-bubble-streaming-shimmer">
                <div
                  className="flex items-center gap-3 py-2 px-1 min-h-[32px]"
                  key={quirkyMessage?.text || "init"}
                >
                  <span
                    className={`text-[26px] shrink-0 text-effect-icon-${quirkyMessage?.iconAnim || "pulse"}`}
                  >
                    {quirkyMessage?.icon || "✨"}
                  </span>
                  <TextEffect
                    per="char"
                    preset={quirkyMessage?.preset || "fade"}
                    className="text-[15px] font-medium text-[#a0b4f8] tracking-wide"
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
          <div
            className="flex items-center gap-2 py-2 px-3 bg-gradient-to-br from-[#2d3a2d] to-[#1e281e] border-t border-[rgba(76,175,80,0.2)] text-xs"
            data-testid="selection-context"
          >
            <span className="font-semibold text-[#4caf50] uppercase tracking-wide text-[10px]">Selection:</span>
            <span className="text-[#b0b0b0] overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px]">
              {selectedText.length > 50
                ? `${selectedText.slice(0, 50)}...`
                : selectedText}
            </span>
          </div>
        )}

        {/* Discussing Context Indicator */}
        {discussingContext && (
          <div
            className="py-2 px-3 bg-gradient-to-br from-[#3d2d5c] to-[#2a1e40] border-t border-[rgba(139,92,246,0.3)] text-xs"
            data-testid="discussing-context"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-[#8b5cf6] uppercase tracking-wide text-[10px]">Discussing suggestion:</span>
              <button
                type="button"
                className="bg-transparent border-none text-[#b0b0b0] cursor-pointer px-1 text-xs opacity-70 transition-opacity hover:opacity-100 hover:text-[#ef4444]"
                onClick={onClearDiscussingContext}
                aria-label="Clear discussing context"
              >
                ✕
              </button>
            </div>
            <div className="text-[#d0d0d0] text-[11px] leading-snug">
              {discussingContext.issue.length > 100
                ? `${discussingContext.issue.slice(0, 100)}...`
                : discussingContext.issue}
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="flex gap-2 p-3 border-t border-white/5 bg-gradient-to-br from-[#1a1a24] to-[#12121a]">
          <textarea
            ref={inputRef}
            className="flex-1 min-h-[40px] max-h-[120px] py-2.5 px-3 border border-white/10 rounded-lg bg-white/5 text-[#e0e0e0] font-inherit text-[13px] resize-y transition-all focus:outline-none focus:border-[#667eea] focus:shadow-[0_0_0_2px_rgba(102,126,234,0.2)] disabled:bg-white/[0.02] disabled:text-[#666] disabled:cursor-not-allowed placeholder:text-[#666]"
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
            className="py-2.5 px-5 bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white border-none rounded-lg font-medium text-[13px] cursor-pointer transition-all shadow-md hover:opacity-90 hover:-translate-y-px active:translate-y-0 disabled:bg-[#333] disabled:text-[#666] disabled:cursor-not-allowed disabled:shadow-none disabled:bg-none"
            onClick={handleSubmit}
            disabled={isSending || !inputValue.trim()}
            data-testid="send-button"
          >
            {isSending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </>
  );
}
