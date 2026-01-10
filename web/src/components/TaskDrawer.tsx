import { useState, useMemo, useEffect } from 'react';
import type { UserStory } from '../types';
import { getStoryStatus } from '../types';
import { ContextSection } from './ContextSection';

interface TaskDrawerProps {
  story: UserStory | null;
  completedIds: Set<string>;
  blocksMap: Map<string, string[]>;
  logContent: string;
  onClose: () => void;
}

interface LogEntry {
  id: number;
  title: string;
  content: string;
  timestamp?: string;
}

function parseLogEntries(content: string, storyId?: string): LogEntry[] {
  if (!content.trim()) return [];

  const sections = content.split(/^---$/m).filter(s => s.trim());

  const entries = sections.map((section, index) => {
    const lines = section.trim().split('\n');
    let title = `Log Entry ${index + 1}`;
    let timestamp: string | undefined;
    let bodyStartIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('## ')) {
        title = line.replace('## ', '');
        bodyStartIndex = i + 1;

        if (lines[i + 1]) {
          const nextLine = lines[i + 1].trim();
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

  // Filter by story ID if provided
  if (storyId) {
    return entries.filter(entry => entry.title.includes(storyId));
  }

  return entries;
}

export function TaskDrawer({ story, completedIds, blocksMap, logContent, onClose }: TaskDrawerProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'logs'>('details');
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set([0]));

  const storyLogs = useMemo(() => {
    if (!story) return [];
    return parseLogEntries(logContent, story.id);
  }, [logContent, story]);

  // Expand all logs by default when story changes
  useEffect(() => {
    setExpandedLogs(new Set(storyLogs.map(log => log.id)));
  }, [storyLogs]);

  if (!story) return null;

  const status = getStoryStatus(story, completedIds);
  const blocks = blocksMap.get(story.id) || [];
  const missingDeps = story.dependencies.filter(dep => !completedIds.has(dep));

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const toggleLog = (id: number) => {
    setExpandedLogs(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="drawer-backdrop" onClick={handleBackdropClick}>
      <div className="drawer">
        <div className="drawer-header">
          <div className="drawer-title-row">
            <span className={`drawer-status ${status}`}>{status}</span>
            <span className="drawer-id">{story.id}</span>
            <span className="drawer-priority">P{story.priority}</span>
            {story.complexity && (
              <span className={`drawer-complexity ${story.complexity}`}>{story.complexity}</span>
            )}
          </div>
          <button className="drawer-close" onClick={onClose}>×</button>
        </div>

        <div className="drawer-tabs">
          <button
            className={`drawer-tab ${activeTab === 'details' ? 'active' : ''}`}
            onClick={() => setActiveTab('details')}
          >
            Details
          </button>
          <button
            className={`drawer-tab ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            Logs {storyLogs.length > 0 && <span className="drawer-tab-count">{storyLogs.length}</span>}
          </button>
        </div>

        <div className="drawer-content">
          {activeTab === 'details' && (
            <>
              <h2 className="drawer-title">{story.title}</h2>

              <section className="drawer-section">
                <h3>Description</h3>
                <p>{story.description}</p>
              </section>

              {story.dependencies.length > 0 && (
                <section className="drawer-section">
                  <h3>
                    <span className="section-arrow">↑</span>
                    Depends On ({story.dependencies.length - missingDeps.length}/{story.dependencies.length})
                  </h3>
                  <div className="drawer-tags">
                    {story.dependencies.map(dep => (
                      <span
                        key={dep}
                        className={`drawer-tag ${completedIds.has(dep) ? 'done' : 'waiting'}`}
                      >
                        {completedIds.has(dep) ? '✓' : '○'} {dep}
                      </span>
                    ))}
                  </div>
                  {missingDeps.length > 0 && (
                    <p className="drawer-warning">
                      Blocked by {missingDeps.length} incomplete {missingDeps.length === 1 ? 'task' : 'tasks'}
                    </p>
                  )}
                </section>
              )}

              {blocks.length > 0 && (
                <section className="drawer-section">
                  <h3>
                    <span className="section-arrow">↓</span>
                    Blocks ({blocks.length})
                  </h3>
                  <div className="drawer-tags">
                    {blocks.map(id => (
                      <span key={id} className="drawer-tag blocks">
                        {id}
                      </span>
                    ))}
                  </div>
                  {status !== 'completed' && (
                    <p className="drawer-info">
                      Completing this will unblock {blocks.length} {blocks.length === 1 ? 'task' : 'tasks'}
                    </p>
                  )}
                </section>
              )}

              <section className="drawer-section">
                <h3>Acceptance Criteria</h3>
                <ul className="drawer-list">
                  {story.acceptanceCriteria.map((criterion, idx) => (
                    <li key={idx}>{criterion}</li>
                  ))}
                </ul>
              </section>

              {story.testCases && story.testCases.length > 0 && (
                <section className="drawer-section">
                  <h3>Test Cases</h3>
                  <ul className="drawer-list code">
                    {story.testCases.map((test, idx) => (
                      <li key={idx}><code>{test}</code></li>
                    ))}
                  </ul>
                </section>
              )}

              {story.notes && (
                <section className="drawer-section">
                  <h3>Notes</h3>
                  <div className="drawer-notes">{story.notes}</div>
                </section>
              )}

              {story.context && (
                <section className="drawer-section">
                  <h3>Context</h3>
                  <ContextSection context={story.context} headingLevel="h4" />
                </section>
              )}
            </>
          )}

          {activeTab === 'logs' && (
            <div className="drawer-logs">
              {storyLogs.length === 0 ? (
                <div className="drawer-logs-empty">
                  <div className="empty-icon">📋</div>
                  <p>No logs for this task yet</p>
                  <span>Logs will appear here when Ralph works on {story.id}</span>
                </div>
              ) : (
                <div className="drawer-log-entries">
                  {storyLogs.map((log, index) => {
                    const isExpanded = expandedLogs.has(log.id);
                    return (
                      <div key={log.id} className={`drawer-log-entry ${isExpanded ? 'expanded' : ''}`}>
                        <button
                          className="drawer-log-header"
                          onClick={() => toggleLog(log.id)}
                        >
                          <span className="log-chevron">{isExpanded ? '▼' : '▶'}</span>
                          <span className="log-number">#{storyLogs.length - index}</span>
                          <span className="log-title">{log.title}</span>
                          {log.timestamp && <span className="log-timestamp">{log.timestamp}</span>}
                        </button>
                        {isExpanded && (
                          <div className="drawer-log-content">
                            <pre>{log.content}</pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
