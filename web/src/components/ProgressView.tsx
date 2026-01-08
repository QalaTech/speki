import { useState, useMemo } from 'react';

interface ProgressViewProps {
  content: string;
  iterationLog: string;
  currentIteration: number | null;
  isRunning: boolean;
}

interface LogEntry {
  id: number;
  title: string;
  content: string;
  timestamp?: string;
}

function parseLogEntries(content: string): LogEntry[] {
  if (!content.trim()) return [];

  // Split on --- separator
  const sections = content.split(/^---$/m).filter(s => s.trim());

  return sections.map((section, index) => {
    const lines = section.trim().split('\n');
    let title = `Log Entry ${index + 1}`;
    let timestamp: string | undefined;
    let bodyStartIndex = 0;

    // Find the ## header line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('## ')) {
        title = line.replace('## ', '');
        bodyStartIndex = i + 1;

        // Check if next line looks like a timestamp
        if (lines[i + 1]) {
          const nextLine = lines[i + 1].trim();
          // Match patterns like "2026-01-08 10:30:45" or similar
          if (/^\d{4}-\d{2}-\d{2}/.test(nextLine) || /^\w+\s+\d+,?\s+\d{4}/.test(nextLine)) {
            timestamp = nextLine;
            bodyStartIndex = i + 2;
          }
        }
        break;
      }
    }

    const body = lines.slice(bodyStartIndex).join('\n').trim();

    return {
      id: index,
      title,
      timestamp,
      content: body,
    };
  });
}

export function ProgressView({ content, iterationLog, currentIteration, isRunning }: ProgressViewProps) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set([0])); // First one expanded by default
  const [expandAll, setExpandAll] = useState(false);

  const entries = useMemo(() => parseLogEntries(content), [content]);

  const toggleEntry = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    if (expandAll) {
      setExpandedIds(new Set([0]));
    } else {
      setExpandedIds(new Set(entries.map(e => e.id)));
    }
    setExpandAll(!expandAll);
  };

  if (entries.length === 0 && !isRunning) {
    return (
      <div className="progress-view">
        <div className="progress-empty">
          No log entries yet. Run Ralph to see progress here.
        </div>
      </div>
    );
  }

  return (
    <div className="progress-view">
      {/* Live iteration log when Ralph is running */}
      {isRunning && (
        <div className="iteration-log-section">
          <div className="iteration-log-header">
            <span className="live-indicator">LIVE</span>
            <span className="iteration-title">
              {currentIteration !== null ? `Iteration ${currentIteration}` : 'Running...'}
            </span>
          </div>
          <div className="iteration-log-content">
            <pre>{iterationLog || 'Waiting for output...'}</pre>
          </div>
        </div>
      )}

      {entries.length > 0 && (
        <div className="progress-header">
          <span className="progress-count">{entries.length} log {entries.length === 1 ? 'entry' : 'entries'}</span>
          <button className="progress-expand-btn" onClick={handleExpandAll}>
            {expandAll ? 'Collapse All' : 'Expand All'}
          </button>
        </div>
      )}

      <div className="progress-entries">
        {entries.map((entry, index) => {
          const isExpanded = expandedIds.has(entry.id);
          const isLatest = index === 0;

          return (
            <div
              key={entry.id}
              className={`progress-entry ${isExpanded ? 'expanded' : ''} ${isLatest ? 'latest' : ''}`}
            >
              <button
                className="progress-entry-header"
                onClick={() => toggleEntry(entry.id)}
              >
                <span className="progress-entry-chevron">
                  {isExpanded ? '▼' : '▶'}
                </span>
                <span className="progress-entry-number">#{entries.length - index}</span>
                <span className="progress-entry-title">{entry.title}</span>
                {entry.timestamp && (
                  <span className="progress-entry-timestamp">{entry.timestamp}</span>
                )}
                {isLatest && <span className="progress-entry-latest">Latest</span>}
              </button>

              {isExpanded && (
                <div className="progress-entry-content">
                  <pre>{entry.content}</pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
