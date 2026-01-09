import { useState, useEffect, useRef, useMemo } from 'react';
import type { UserStory } from '../types';
import { TaskDrawer } from './TaskDrawer';
import { ChatLogView } from './ChatLogView';
import { parseJsonlContent } from '../utils/parseJsonl';

interface KanbanViewProps {
  stories: UserStory[];
  currentStory: string | null;
  logContent: string;
  iterationLog: string;
  currentIteration: number | null;
  isRunning: boolean;
}

type Column = 'blocked' | 'ready' | 'running' | 'done';

export function KanbanView({ stories, currentStory, logContent, iterationLog, currentIteration, isRunning }: KanbanViewProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedStory, setSelectedStory] = useState<UserStory | null>(null);
  const [logDrawerOpen, setLogDrawerOpen] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Parse the JSONL log into chat entries
  const chatEntries = useMemo(() => {
    if (!iterationLog) return [];
    return parseJsonlContent(iterationLog);
  }, [iterationLog]);

  // Auto-open log drawer when Ralph starts running
  useEffect(() => {
    if (isRunning) {
      setLogDrawerOpen(true);
    }
  }, [isRunning]);

  // Auto-scroll to bottom when new logs come in
  useEffect(() => {
    if (logEndRef.current && logDrawerOpen) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [iterationLog, logDrawerOpen]);

  const completedIds = new Set(stories.filter(s => s.passes).map(s => s.id));
  const storyMap = new Map(stories.map(s => [s.id, s]));

  // Build reverse dependency map: storyId -> stories that depend on it
  const blocksMap = new Map<string, string[]>();
  for (const story of stories) {
    for (const dep of story.dependencies) {
      if (!blocksMap.has(dep)) blocksMap.set(dep, []);
      blocksMap.get(dep)!.push(story.id);
    }
  }

  const getColumn = (story: UserStory): Column => {
    if (story.passes) return 'done';
    if (currentStory?.startsWith(story.id)) return 'running';
    const depsOk = story.dependencies.every(dep => completedIds.has(dep));
    return depsOk ? 'ready' : 'blocked';
  };

  const columns: { key: Column; label: string; color: string }[] = [
    { key: 'blocked', label: 'Blocked', color: 'var(--color-blocked)' },
    { key: 'ready', label: 'Ready', color: 'var(--color-ready)' },
    { key: 'running', label: 'In Progress', color: 'var(--color-running)' },
    { key: 'done', label: 'Done', color: 'var(--color-completed)' },
  ];

  const storiesByColumn = columns.reduce((acc, col) => {
    acc[col.key] = stories.filter(s => getColumn(s) === col.key);
    return acc;
  }, {} as Record<Column, UserStory[]>);

  // Get highlight state for a card based on hover
  const getHighlightClass = (storyId: string): string => {
    if (!hoveredId || hoveredId === storyId) return '';

    const hoveredStory = storyMap.get(hoveredId);
    if (!hoveredStory) return '';

    // This card is a dependency of the hovered card (upstream)
    if (hoveredStory.dependencies.includes(storyId)) {
      return 'highlight-upstream';
    }

    // This card depends on the hovered card (downstream/blocked by)
    const blocks = blocksMap.get(hoveredId) || [];
    if (blocks.includes(storyId)) {
      return 'highlight-downstream';
    }

    // Dim cards that are unrelated
    return 'dimmed';
  };

  return (
    <div className={`kanban-container ${logDrawerOpen ? 'with-log-drawer' : ''}`}>
      {/* Kanban columns */}
      <div className="kanban-board">
        {columns.map(col => (
          <div key={col.key} className="kanban-column">
            <div className="kanban-column-header">
              <div className="kanban-column-header-left">
                <span className="column-dot" style={{ backgroundColor: col.color }} />
                <span className="column-title">{col.label}</span>
              </div>
              <span className="column-count" style={{ color: col.color }}>
                {storiesByColumn[col.key].length}
              </span>
            </div>
            <div className="kanban-column-body">
              {storiesByColumn[col.key].map(story => {
                const blocks = blocksMap.get(story.id) || [];
                const missingDeps = story.dependencies.filter(d => !completedIds.has(d));

                return (
                  <div
                    key={story.id}
                    className={`kanban-card ${col.key} ${hoveredId === story.id ? 'hovered' : ''} ${getHighlightClass(story.id)}`}
                    onMouseEnter={() => setHoveredId(story.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => setSelectedStory(story)}
                  >
                    <div className="kanban-card-header">
                      <span className="kanban-card-id">{story.id}</span>
                      <span className="kanban-card-priority">P{story.priority}</span>
                    </div>
                    <div className="kanban-card-title">{story.title}</div>

                    {/* Quick dependency indicators */}
                    <div className="kanban-card-footer">
                      {story.dependencies.length > 0 && (
                        <span className={`kanban-indicator ${missingDeps.length > 0 ? 'waiting' : 'done'}`}>
                          ↑ {story.dependencies.length - missingDeps.length}/{story.dependencies.length}
                        </span>
                      )}
                      {blocks.length > 0 && (
                        <span className="kanban-indicator blocks">
                          ↓ {blocks.length}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {storiesByColumn[col.key].length === 0 && (
                <div className="kanban-empty">No tasks</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Side drawer for task details */}
      <TaskDrawer
        story={selectedStory}
        completedIds={completedIds}
        blocksMap={blocksMap}
        logContent={logContent}
        onClose={() => setSelectedStory(null)}
      />

      {/* Live log drawer on the right */}
      <div className={`log-drawer ${logDrawerOpen ? 'open' : ''}`}>
        <div className="log-drawer-header">
          <div className="log-drawer-title-row">
            {isRunning && <span className="live-indicator">LIVE</span>}
            <span className="log-drawer-title">
              {isRunning
                ? (currentIteration !== null ? `Iteration ${currentIteration}` : 'Running...')
                : 'Execution Log'
              }
            </span>
          </div>
          {currentStory && isRunning && (
            <span className="log-drawer-task">{currentStory}</span>
          )}
          <button
            className="log-drawer-close"
            onClick={() => setLogDrawerOpen(false)}
            title="Close log panel"
          >
            &times;
          </button>
        </div>
        <div className="log-drawer-content">
          <ChatLogView entries={chatEntries} isRunning={isRunning} />
        </div>
      </div>

      {/* Toggle button when drawer is closed */}
      {!logDrawerOpen && (
        <button
          className="log-drawer-toggle"
          onClick={() => setLogDrawerOpen(true)}
          title="Show execution log"
        >
          <span className="toggle-icon">&#9776;</span>
          <span className="toggle-label">Log</span>
          {isRunning && <span className="toggle-live-dot" />}
        </button>
      )}
    </div>
  );
}
