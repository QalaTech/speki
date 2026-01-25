import { useState } from 'react';
import type { UserStory } from '../../types';
import { TaskDrawer } from './TaskDrawer';

interface KanbanViewProps {
  stories: UserStory[];
  currentStory: string | null;
}

type Column = 'todo' | 'running' | 'done';

const COLUMN_CONFIG: Record<Column, { label: string; icon: React.ReactNode; color: string; bgColor: string }> = {
  todo: {
    label: 'To Do',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={2} /><path strokeLinecap="round" strokeWidth={2} d="M12 6v6l4 2" /></svg>,
    color: 'text-base-content/70',
    bgColor: 'bg-base-300',
  },
  running: {
    label: 'In Progress',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
    color: 'text-primary',
    bgColor: 'bg-primary/20',
  },
  done: {
    label: 'Done',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    color: 'text-success',
    bgColor: 'bg-success/20',
  },
};

export function KanbanView({ stories, currentStory }: KanbanViewProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<UserStory | null>(null);

  // Map story to column based on passes and currentStory
  const getColumn = (story: UserStory): Column => {
    if (story.passes) return 'done';
    if (currentStory === story.id) return 'running';
    return 'todo';
  };

  const columns: Column[] = ['todo', 'running', 'done'];

  const tasksByColumn = columns.reduce((acc, col) => {
    acc[col] = stories.filter(s => getColumn(s) === col);
    return acc;
  }, {} as Record<Column, UserStory[]>);

  const completedIds = new Set(stories.filter(s => s.passes).map(s => s.id));

  if (stories.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-base-100">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-base-200 flex items-center justify-center">
            <svg className="w-8 h-8 text-base-content/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-2 text-base-content">No tasks found</h3>
          <p className="text-base-content/60 text-sm">Decompose a spec to generate tasks.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex h-full">
      {/* Kanban columns */}
      <div className="flex flex-1 gap-6 p-6 overflow-x-auto bg-base-100 w-full">
        {columns.map(col => {
          const config = COLUMN_CONFIG[col];
          const count = tasksByColumn[col].length;
          return (
            <div key={col} className="flex-1 min-w-[280px] flex flex-col">
              {/* Column Header */}
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-base-300">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${config.bgColor}`}>
                    <span className={config.color}>{config.icon}</span>
                  </div>
                  <div>
                    <h3 className={`font-semibold text-sm ${config.color}`}>{config.label}</h3>
                    <p className="text-xs text-base-content/50">{count} {count === 1 ? 'task' : 'tasks'}</p>
                  </div>
                </div>
                <span className={`text-lg font-bold ${config.color}`}>{count}</span>
              </div>

              {/* Column Content */}
              <div className="flex-1 flex flex-col gap-3 overflow-y-auto pr-1">
                {tasksByColumn[col].map((story) => {
                  const isBlocked = !story.passes && story.dependencies.length > 0 && !story.dependencies.every(d => completedIds.has(d));
                  const isHovered = hoveredId === story.id;
                  const isRunningTask = col === 'running';
                  const isDone = col === 'done';

                  return (
                    <div
                      key={story.id}
                      className={`
                        group relative bg-base-200 rounded-xl border-2 cursor-pointer
                        transition-all duration-200 ease-out
                        ${isHovered ? 'border-primary shadow-lg shadow-primary/10 -translate-y-0.5' : 'border-transparent'}
                        ${isRunningTask ? 'bg-primary/5 ring-2 ring-primary/30' : ''}
                        ${isDone ? 'opacity-60 hover:opacity-100' : ''}
                        hover:border-primary/50 hover:shadow-md
                      `}
                      onMouseEnter={() => setHoveredId(story.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onClick={() => setSelectedTask(story)}
                    >
                      {/* Priority indicator stripe */}
                      <div className={`absolute left-0 top-3 bottom-3 w-1 rounded-full ${
                        story.priority === 1 ? 'bg-error' :
                        story.priority === 2 ? 'bg-warning' :
                        'bg-info'
                      }`} />

                      <div className="p-4 pl-5">
                        {/* Header row */}
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-mono text-base-content/50 bg-base-300/50 px-2 py-0.5 rounded">
                            {story.id}
                          </span>
                          <div className="flex items-center gap-2">
                            {isRunningTask && (
                              <span className="flex items-center gap-1.5 text-xs text-primary font-medium">
                                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                Running
                              </span>
                            )}
                            {isDone && (
                              <span className="flex items-center gap-1 text-xs text-success font-medium">
                                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                Done
                              </span>
                            )}
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              story.priority === 1 ? 'bg-error/10 text-error' :
                              story.priority === 2 ? 'bg-warning/10 text-warning' :
                              'bg-info/10 text-info'
                            }`}>
                              P{story.priority}
                            </span>
                          </div>
                        </div>

                        {/* Title */}
                        <h4 className={`font-medium text-sm leading-snug mb-2 ${isDone ? 'line-through text-base-content/60' : ''}`}>
                          {story.title}
                        </h4>

                        {/* Footer */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {isBlocked && (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-error/10 text-error font-medium">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H9m3-10V4m0 0L9 7m3-3l3 3" />
                              </svg>
                              Blocked
                            </span>
                          )}
                          {story.dependencies.length > 0 && !isBlocked && (
                            <span className="inline-flex items-center gap-1 text-xs text-base-content/50">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                              </svg>
                              {story.dependencies.length} deps
                            </span>
                          )}
                          {story.complexity && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              story.complexity === 'high' ? 'bg-error/10 text-error' :
                              story.complexity === 'medium' ? 'bg-warning/10 text-warning' :
                              'bg-success/10 text-success'
                            }`}>
                              {story.complexity}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {tasksByColumn[col].length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-base-content/40">
                    <div className={`p-4 rounded-full ${config.bgColor} mb-3`}>
                      <span className={config.color}>{config.icon}</span>
                    </div>
                    <p className="text-sm">No tasks</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Side drawer for task details */}
      <TaskDrawer
        story={selectedTask}
        completedIds={completedIds}
        blocksMap={new Map()}
        logContent=""
        onClose={() => setSelectedTask(null)}
      />
    </div>
  );
}
