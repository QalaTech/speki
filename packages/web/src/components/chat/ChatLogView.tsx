import { useEffect, useRef, useCallback } from 'react';
import type { ParsedEntry } from '../../utils/parseJsonl';
import { ChatBubbleLeftRightIcon, SparklesIcon } from '@heroicons/react/24/solid';

interface ChatLogViewProps {
  entries: ParsedEntry[];
  isRunning?: boolean;
}

function getToolIcon(toolName?: string): string {
  switch (toolName) {
    case 'Read': return '📄';
    case 'Write': return '✏️';
    case 'Edit': return '📝';
    case 'Bash': return '💻';
    case 'Grep': return '🔍';
    case 'Glob': return '📁';
    case 'Task': return '🤖';
    case 'TodoWrite': return '📋';
    default: return '🔧';
  }
}

function truncateMiddle(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  const half = Math.floor((maxLen - 3) / 2);
  return str.slice(0, half) + '...' + str.slice(-half);
}

function formatToolContent(toolName: string, content: string): { title: string; detail: string } {
  switch (toolName) {
    case 'Read':
    case 'Write':
    case 'Edit':
      return { title: toolName, detail: truncateMiddle(content, 60) };
    case 'Bash':
      return { title: 'Bash', detail: truncateMiddle(content, 80) };
    case 'Grep':
      return { title: 'Search', detail: content };
    case 'Glob':
      return { title: 'Find Files', detail: content };
    case 'Task':
      return { title: 'Agent', detail: content };
    default:
      return { title: toolName, detail: truncateMiddle(content, 60) };
  }
}

// Shared style constants for chat bubbles
const avatarBase = "w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 shadow-sm";
const bubbleBase = "py-2.5 px-3.5 rounded-2xl text-[13px] leading-relaxed shadow-sm break-words";

export function ChatLogView({ entries, isRunning }: ChatLogViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wasNearBottomRef = useRef(true);

  const isNearBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return true;
    const threshold = 100;
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  }, []);

  const handleScroll = useCallback(() => {
    wasNearBottomRef.current = isNearBottom();
  }, [isNearBottom]);

  useEffect(() => {
    const container = containerRef.current;
    if (container && wasNearBottomRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-base-content/60 gap-2">
        <ChatBubbleLeftRightIcon className="w-8 h-8 opacity-50" />
        <p className="m-0 text-sm">Waiting for activity...</p>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes chatFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
        .chat-scrollbar::-webkit-scrollbar { width: 6px; }
        .chat-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .chat-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
        .chat-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>
      <div
        className="flex flex-col gap-3 p-4 overflow-y-auto h-full chat-scrollbar"
        ref={containerRef}
        onScroll={handleScroll}
      >
        {entries.map((entry, idx) => {
          const isLeft = entry.type === 'text' || entry.type === 'result';
          const isError = entry.type === 'error';

          if (isLeft) {
            return (
              <div
                key={idx}
                className="flex items-start gap-2 max-w-[95%] self-start"
                style={{ animation: 'chatFadeIn 0.2s ease-out' }}
              >
                <div className={`${avatarBase} bg-primary`}><SparklesIcon className="w-4 h-4 text-primary-content" /></div>
                <div className={`${bubbleBase} bg-base-300 text-base-content rounded-bl border border-base-content/5`}>
                  <div className="whitespace-pre-wrap">{entry.content}</div>
                </div>
              </div>
            );
          }

          if (entry.type === 'tool') {
            const { title, detail } = formatToolContent(entry.toolName || 'Tool', entry.content);
            const icon = getToolIcon(entry.toolName);

            return (
              <div
                key={idx}
                className="flex items-start gap-2 max-w-[95%] self-end flex-row-reverse"
                style={{ animation: 'chatFadeIn 0.2s ease-out' }}
              >
                <div className={`${bubbleBase} bg-secondary/20 text-base-content rounded-br border border-secondary/20 min-w-[120px]`}>
                  <div className="flex items-center gap-1.5 mb-1 pb-1.5 border-b border-base-content/10">
                    <span className="text-sm">{icon}</span>
                    <span className="font-semibold text-xs uppercase tracking-wide text-secondary">{title}</span>
                  </div>
                  <div className="font-mono text-[11px] text-base-content/70 break-all">{detail}</div>
                </div>
                <div className={`${avatarBase} bg-accent`}>⚡</div>
              </div>
            );
          }

          if (entry.type === 'tool_result') {
            const isSuccess = entry.status === 'success';
            const statusIcon = isSuccess ? '✓' : '…';

            return (
              <div
                key={idx}
                className="flex items-start gap-2 max-w-[95%] self-end flex-row-reverse"
                style={{ animation: 'chatFadeIn 0.2s ease-out' }}
              >
                <div className={`${bubbleBase} bg-base-200 text-base-content/70 rounded-br text-xs ${isSuccess ? 'border border-success/30' : 'border border-base-content/5'}`}>
                  <div className="flex items-center gap-1 text-[11px] text-base-content/50 mb-1">
                    <span className="text-success">{statusIcon}</span>
                    <span>Result</span>
                  </div>
                  {entry.content && (
                    <div className="font-mono text-[10px] text-base-content/50 opacity-80">{truncateMiddle(entry.content, 100)}</div>
                  )}
                </div>
                <div className={`${avatarBase} bg-info`}>📋</div>
              </div>
            );
          }

          if (isError) {
            return (
              <div
                key={idx}
                className="flex items-start gap-2 max-w-[90%] self-center"
                style={{ animation: 'chatFadeIn 0.2s ease-out' }}
              >
                <div className={`${bubbleBase} bg-error/20 text-error border border-error/30 flex items-center gap-2 py-2 px-3.5`}>
                  <span className="text-sm">❌</span>
                  <span className="text-xs">{entry.content}</span>
                </div>
              </div>
            );
          }

          return (
            <div
              key={idx}
              className="flex items-start gap-2 max-w-[95%] self-start"
              style={{ animation: 'chatFadeIn 0.2s ease-out' }}
            >
              <div className={bubbleBase}>{entry.content}</div>
            </div>
          );
        })}

        {isRunning && (
          <div
            className="flex items-start gap-2 max-w-[95%] self-start"
            style={{ animation: 'chatFadeIn 0.2s ease-out' }}
          >
            <div className={`${avatarBase} bg-primary`}><SparklesIcon className="w-4 h-4 text-primary-content" /></div>
            <div className={`${bubbleBase} bg-base-300 rounded-bl py-3 px-4`}>
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-primary rounded-full" style={{ animation: 'typingBounce 1.4s infinite' }}></span>
                <span className="w-2 h-2 bg-primary rounded-full" style={{ animation: 'typingBounce 1.4s infinite 0.2s' }}></span>
                <span className="w-2 h-2 bg-primary rounded-full" style={{ animation: 'typingBounce 1.4s infinite 0.4s' }}></span>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
