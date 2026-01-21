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

type Column = 'todo' | 'running' | 'done';

export function KanbanView({ stories, currentStory, logContent, iterationLog, currentIteration, isRunning }: KanbanViewProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<UserStory | null>(null);
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

  // Map story to column based on passes and currentStory
  const getColumn = (story: UserStory): Column => {
    if (story.passes) return 'done';
    // Check if this is the currently running story
    if (currentStory === story.id) return 'running';
    // not completed and not running -> todo
    return 'todo';
  };

  const columns: { key: Column; label: string; color: string }[] = [
    { key: 'todo', label: 'To Do', color: 'var(--color-ready)' },
    { key: 'running', label: 'In Progress', color: 'var(--color-running)' },
    { key: 'done', label: 'Done', color: 'var(--color-completed)' },
  ];

  const tasksByColumn = columns.reduce((acc, col) => {
    acc[col.key] = stories.filter(s => getColumn(s) === col.key);
    return acc;
  }, {} as Record<Column, UserStory[]>);

  const completedIds = new Set(stories.filter(s => s.passes).map(s => s.id));

  if (stories.length === 0) {
    return (
      <div className="kanban-container">
        <div className="kanban-empty-state">
          <div className="kanban-empty-icon">📋</div>
          <h3>No tasks found</h3>
          <p>Decompose a spec to generate tasks.</p>
        </div>
      </div>
    );
  }

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
                {tasksByColumn[col.key].length}
              </span>
            </div>
            <div className="kanban-column-body">
              {tasksByColumn[col.key].map((story) => (
                <div
                  key={story.id}
                  className={`kanban-card ${col.key} ${hoveredId === story.id ? 'hovered' : ''}`}
                  onMouseEnter={() => setHoveredId(story.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => setSelectedTask(story)}
                >
                  <div className="kanban-card-header">
                    <span className="kanban-card-id">{story.id}</span>
                    <span className="kanban-card-priority">P{story.priority}</span>
                  </div>
                  <div className="kanban-card-title">
                    {story.title}
                  </div>
                  <div className="kanban-card-footer">
                    {!story.passes && story.dependencies.length > 0 && !story.dependencies.every(d => completedIds.has(d)) && (
                      <span className="kanban-status-badge blocked">Blocked</span>
                    )}
                  </div>
                </div>
              ))}
              {tasksByColumn[col.key].length === 0 && (
                <div className="kanban-empty">No tasks</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Side drawer for task details */}
      <TaskDrawer
        story={selectedTask}
        completedIds={completedIds}
        blocksMap={new Map()}
        logContent={logContent}
        onClose={() => setSelectedTask(null)}
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
        </button>
      )}
    </div>
  );
}
