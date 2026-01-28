import { useState } from 'react';
import type { ParsedEntry } from '../../utils/parseJsonl';

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
    ? 'border-success/40' 
    : entry.status === 'error' 
      ? 'border-error/40 bg-error/10'
      : 'border-primary/30';

  return (
    <div className={`py-2 px-3 rounded-lg bg-primary/10 border my-1 cursor-pointer transition-all duration-200 hover:bg-primary/15 ${statusClasses}`}>
      <div
        className="flex items-center gap-2 select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-base shrink-0">{icon}</span>
        <span className="font-semibold text-[13px] text-primary uppercase shrink-0">{entry.toolName}</span>
        <span className="flex-1 font-mono text-xs text-muted-foreground/70 overflow-hidden text-ellipsis whitespace-nowrap">{entry.content}</span>
        <button className="bg-transparent border-none text-muted-foreground/50 text-[10px] cursor-pointer p-1 shrink-0 hover:text-muted-foreground/70" aria-label={expanded ? 'Collapse' : 'Expand'}>
          {expanded ? '▼' : '▶'}
        </button>
      </div>

      {expanded && (
        <div className="mt-2 pt-2 border-t border-border">
          <div className="text-[11px] text-muted-foreground/50 mb-1 uppercase tracking-wide">Details:</div>
          <pre className="text-xs text-muted-foreground/80 bg-background/50 p-2 rounded overflow-x-auto m-0 font-mono whitespace-pre-wrap wrap-break-word">{entry.content}</pre>
        </div>
      )}
    </div>
  );
}
