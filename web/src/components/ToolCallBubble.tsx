import { useState } from 'react';
import type { ParsedEntry } from '../utils/parseJsonl';

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

  const statusClasses = entry.status === 'success' 
    ? 'border-green-500/40' 
    : entry.status === 'error' 
      ? 'border-red-500/40 bg-gradient-to-br from-red-500/15 to-red-600/10' 
      : 'border-[rgba(102,126,234,0.3)]';

  return (
    <div className={`py-2 px-3 rounded-lg bg-gradient-to-br from-[rgba(102,126,234,0.15)] to-[rgba(118,75,162,0.1)] border my-1 cursor-pointer transition-all duration-200 hover:from-[rgba(102,126,234,0.2)] hover:to-[rgba(118,75,162,0.15)] ${statusClasses}`}>
      <div
        className="flex items-center gap-2 select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-base shrink-0">{icon}</span>
        <span className="font-semibold text-[13px] text-[#a0a0ff] uppercase shrink-0">{entry.toolName}</span>
        <span className="flex-1 font-mono text-xs text-[#b0b0b0] overflow-hidden text-ellipsis whitespace-nowrap">{entry.content}</span>
        <button className="bg-transparent border-none text-[#888] text-[10px] cursor-pointer p-1 shrink-0 hover:text-[#aaa]" aria-label={expanded ? 'Collapse' : 'Expand'}>
          {expanded ? '▼' : '▶'}
        </button>
      </div>

      {expanded && (
        <div className="mt-2 pt-2 border-t border-white/10">
          <div className="text-[11px] text-[#888] mb-1 uppercase tracking-wide">Details:</div>
          <pre className="text-xs text-[#ccc] bg-black/20 p-2 rounded overflow-x-auto m-0 font-mono whitespace-pre-wrap break-words">{entry.content}</pre>
        </div>
      )}
    </div>
  );
}
