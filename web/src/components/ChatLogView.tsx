import { useEffect, useRef } from 'react';
import type { ParsedEntry } from '../utils/parseJsonl';
import './ChatLogView.css';

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

export function ChatLogView({ entries, isRunning }: ChatLogViewProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="chat-log-empty">
        <div className="chat-log-empty-icon">💬</div>
        <p>Waiting for activity...</p>
      </div>
    );
  }

  return (
    <div className="chat-log">
      {entries.map((entry, idx) => {
        // Determine if this is a "left" (Claude text) message
        const isLeft = entry.type === 'text' || entry.type === 'result';
        const isError = entry.type === 'error';

        if (isLeft) {
          // Claude's text response - left side
          return (
            <div key={idx} className="chat-message chat-left">
              <div className="chat-avatar">🤖</div>
              <div className="chat-bubble chat-bubble-claude">
                <div className="chat-bubble-content">{entry.content}</div>
              </div>
            </div>
          );
        }

        if (entry.type === 'tool') {
          // Tool call - right side
          const { title, detail } = formatToolContent(entry.toolName || 'Tool', entry.content);
          const icon = getToolIcon(entry.toolName);

          return (
            <div key={idx} className="chat-message chat-right">
              <div className="chat-bubble chat-bubble-tool">
                <div className="chat-tool-header">
                  <span className="chat-tool-icon">{icon}</span>
                  <span className="chat-tool-name">{title}</span>
                </div>
                <div className="chat-tool-detail">{detail}</div>
              </div>
              <div className="chat-avatar chat-avatar-tool">⚡</div>
            </div>
          );
        }

        if (entry.type === 'tool_result') {
          // Tool result - right side, different style
          const isSuccess = entry.status === 'success';
          const statusIcon = isSuccess ? '✓' : '…';

          return (
            <div key={idx} className="chat-message chat-right">
              <div className={`chat-bubble chat-bubble-result ${isSuccess ? 'success' : ''}`}>
                <div className="chat-result-header">
                  <span className="chat-result-icon">{statusIcon}</span>
                  <span className="chat-result-label">Result</span>
                </div>
                {entry.content && (
                  <div className="chat-result-content">{truncateMiddle(entry.content, 100)}</div>
                )}
              </div>
              <div className="chat-avatar chat-avatar-result">📋</div>
            </div>
          );
        }

        if (isError) {
          // Error - centered, red
          return (
            <div key={idx} className="chat-message chat-center">
              <div className="chat-bubble chat-bubble-error">
                <span className="chat-error-icon">❌</span>
                <span className="chat-error-text">{entry.content}</span>
              </div>
            </div>
          );
        }

        // Fallback
        return (
          <div key={idx} className="chat-message chat-left">
            <div className="chat-bubble">{entry.content}</div>
          </div>
        );
      })}

      {isRunning && (
        <div className="chat-message chat-left">
          <div className="chat-avatar">🤖</div>
          <div className="chat-bubble chat-bubble-typing">
            <div className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
