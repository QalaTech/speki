import { useState } from 'react';
import type { ParsedEntry } from '../utils/parseJsonl';
import './ToolCallBubble.css';

interface ToolCallBubbleProps {
  entry: ParsedEntry;
}

const TOOL_ICONS: Record<string, string> = {
  Read: '📖',
  Grep: '🔍',
  Edit: '✏️',
  Write: '📝',
  Bash: '⚡',
  Glob: '🔎',
  Task: '📋',
};

export function ToolCallBubble({ entry }: ToolCallBubbleProps) {
  const [expanded, setExpanded] = useState(false);
  const icon = TOOL_ICONS[entry.toolName || ''] || '🔧';

  return (
    <div className={`tool-call-bubble ${entry.status || 'pending'}`}>
      <div
        className="tool-call-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="tool-icon">{icon}</span>
        <span className="tool-name">{entry.toolName}</span>
        <span className="tool-detail">{entry.content}</span>
        <button className="tool-expand" aria-label={expanded ? 'Collapse' : 'Expand'}>
          {expanded ? '▼' : '▶'}
        </button>
      </div>

      {expanded && (
        <div className="tool-result">
          <div className="tool-result-label">Details:</div>
          <pre className="tool-result-content">{entry.content}</pre>
        </div>
      )}
    </div>
  );
}
