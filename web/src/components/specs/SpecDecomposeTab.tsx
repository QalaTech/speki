import { useState, useEffect, useMemo } from 'react';
import type { UserStory, QueuedTaskReference } from '../../types';
import { ChatMarkdown } from '../ChatMarkdown';
import { useUnifiedSSE } from '../../hooks/useUnifiedSSE';

type SpecType = 'prd' | 'tech-spec' | 'bug';

interface Props {
  specPath: string;
  projectPath: string;
  specType?: SpecType;
  onCreateTechSpec?: () => void;
  onQuickExecute?: () => void;
  isGeneratingTechSpec?: boolean;
}

// Derive specId from specPath (filename without extension)
function getSpecId(specPath: string): string {
  const filename = specPath.split('/').pop() || specPath;
  return filename.replace(/\.(prd|tech|bug)?\.md$/i, '');
}

export function SpecDecomposeTab({ specPath, projectPath, specType = 'prd' }: Props) {
  const specId = useMemo(() => getSpecId(specPath), [specPath]);
  const [stories, setStories] = useState<UserStory[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branch, setBranch] = useState('');
  const [activateLoading, setActivateLoading] = useState(false);
  const [executeLoading, setExecuteLoading] = useState(false);
  const [executeError, setExecuteError] = useState<string | null>(null);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<UserStory | null>(null);
  const [taskFeedback, setTaskFeedback] = useState('');
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);

  // Queue state
  const [queueTasks, setQueueTasks] = useState<QueuedTaskReference[]>([]);
  const [queueLoading, setQueueLoading] = useState<Set<string>>(new Set());

  // Get decompose state from unified SSE
  const { decomposeState } = useUnifiedSSE(projectPath);

  
  // Load initial state
  useEffect(() => {
    if (specId) {
      loadDecomposeState();
      loadQueueTasks();
    }
  }, [specId]);

  // Listen for SSE updates
  useEffect(() => {
    if (!decomposeState) return;

    if (decomposeState.error) {
      setError(decomposeState.error);
      setIsLoading(false);
    }
    const activeStatuses = ['STARTING', 'INITIALIZING', 'DECOMPOSING', 'REVIEWING', 'REVISING'];
    if (activeStatuses.includes(decomposeState.status)) {
      setIsLoading(true);
    } else if (decomposeState.status === 'COMPLETED' || decomposeState.status === 'DECOMPOSED') {
      setIsLoading(false);
      // Reload data when decompose completes
      loadDecomposeState();
    }
  }, [decomposeState]);

  const loadDecomposeState = async () => {
    try {
      const res = await fetch(`/api/spec/${specId}/decompose`);
      if (res.ok) {
        const data = await res.json();
        if (data.stories && data.stories.length > 0) {
          setStories(data.stories);
          setCompletedIds(new Set(data.completedIds || []));
        }
      }
    } catch (err) {
      console.error('Failed to load decompose state:', err);
    }
  };

  const loadQueueTasks = async () => {
    try {
      const res = await fetch(`/api/spec/${specId}/queue/tasks`);
      if (res.ok) {
        const data = await res.json();
        setQueueTasks(data.tasks || []);
      }
    } catch (err) {
      console.error('Failed to load queue tasks:', err);
    }
  };

  const handleDecompose = async (force: boolean = false) => {
    if (!specId) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/spec/${specId}/decompose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force, branch: branch || undefined }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Decompose failed');
      }

      // SSE will update the state
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsLoading(false);
    }
  };

  const handleActivateAndRun = async () => {
    if (!specId) return;

    setActivateLoading(true);
    setError(null);

    try {
      // Activate the spec first
      const activateRes = await fetch(`/api/spec/${specId}/activate`, {
        method: 'POST',
      });

      if (!activateRes.ok) {
        const data = await activateRes.json();
        throw new Error(data.error || 'Activation failed');
      }

      // Then start the queue
      const runRes = await fetch('/api/queue/run', {
        method: 'POST',
      });

      if (!runRes.ok) {
        const data = await runRes.json();
        throw new Error(data.error || 'Failed to start queue');
      }

          } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActivateLoading(false);
    }
  };

  const handleAddToQueue = async (taskId: string) => {
    if (!specId) return;

    setQueueLoading(prev => new Set(prev).add(taskId));

    try {
      const res = await fetch(`/api/spec/${specId}/queue/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add to queue');
      }

      // Refresh queue tasks
      await loadQueueTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setQueueLoading(prev => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  const handleRemoveFromQueue = async (taskId: string) => {
    if (!specId) return;

    setQueueLoading(prev => new Set(prev).add(taskId));

    try {
      const res = await fetch(`/api/spec/${specId}/queue/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove from queue');
      }

      // Refresh queue tasks
      await loadQueueTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setQueueLoading(prev => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  const handleAddAllToQueue = async () => {
    if (!specId) return;

    // Get all unqueued, incomplete tasks
    const tasksToAdd = stories.filter(s => !s.passes && !isTaskQueued(s.id));

    for (const task of tasksToAdd) {
      await handleAddToQueue(task.id);
    }
  };

  const openTaskDrawer = (task: UserStory) => {
    setSelectedTask(task);
    setDrawerOpen(true);
    setTaskFeedback('');
    setFeedbackError(null);
    setFeedbackSuccess(false);
    setExecuteError(null);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedTask(null);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeDrawer();
    }
  };

  const handleExecuteTask = async () => {
    if (!specId || !selectedTask) return;

    setExecuteLoading(true);
    setExecuteError(null);

    try {
      const res = await fetch(`/api/spec/${specId}/task/${selectedTask.id}/execute`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Execute failed');
      }

      // Refresh state
      await loadDecomposeState();
      closeDrawer();
    } catch (err) {
      setExecuteError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setExecuteLoading(false);
    }
  };

  const handleSubmitFeedback = async () => {
    if (!specId || !selectedTask || !taskFeedback.trim()) return;

    setFeedbackLoading(true);
    setFeedbackError(null);
    setFeedbackSuccess(false);

    try {
      const res = await fetch(`/api/spec/${specId}/task/${selectedTask.id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: taskFeedback }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Feedback failed');
      }

      const data = await res.json();
      // Update the selected task with new data
      setSelectedTask(data.task);
      // Update in the list
      setStories(prev => prev.map(s => s.id === data.task.id ? data.task : s));
      setFeedbackSuccess(true);
      setTaskFeedback('');
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setFeedbackLoading(false);
    }
  };

  const isTaskQueued = (taskId: string) => queueTasks.some(t => t.taskId === taskId);
  const getQueuePosition = (taskId: string) => {
    const pending = queueTasks.filter(t => t.status === 'queued' || t.status === 'running');
    const idx = pending.findIndex(t => t.taskId === taskId);
    return idx >= 0 ? idx + 1 : null;
  };
  const getQueuedTaskStatus = (taskId: string) => queueTasks.find(t => t.taskId === taskId)?.status || 'pending';

  const hasBeenDecomposed = stories.length > 0;
  const canActivate = specType === 'tech-spec' && hasBeenDecomposed && queueTasks.some(t => t.status === 'queued');

  // Helper functions for styling
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return '✓';
      case 'blocked': return '🔒';
      case 'running': return '▶';
      default: return '○';
    }
  };

  const getTaskStatus = (task: UserStory, completed: Set<string>): string => {
    if (task.passes || completed.has(task.id)) return 'completed';
    const depsBlocked = task.dependencies.some(d => !completed.has(d));
    if (depsBlocked) return 'blocked';
    return 'pending';
  };

  const getComplexityBadge = (complexity?: string) => {
    if (!complexity) return null;
    const complexityClasses: Record<string, string> = {
      low: 'bg-[#1c3829] text-[#4ade80]',
      medium: 'bg-[#422006] text-[#fbbf24]',
      high: 'bg-[#450a0a] text-[#f87171]',
    };
    return (
      <span className={`ml-2 py-0.5 px-1.5 rounded text-[10px] font-medium uppercase tracking-wide ${complexityClasses[complexity] || ''}`}>
        {complexity}
      </span>
    );
  };

  // Task card status classes
  const getTaskCardClasses = (status: string, isQueued: boolean) => {
    const base = 'relative border border-border rounded-lg bg-surface overflow-hidden transition-all duration-200';
    const statusClasses: Record<string, string> = {
      completed: 'opacity-70 border-l-2 border-l-[#238636]',
      blocked: 'opacity-60 border-l-2 border-l-[#6e7681]',
      running: 'border-l-2 border-l-[#1f6feb] bg-[rgba(31,111,235,0.05)]',
      pending: 'border-l-2 border-l-[#8b949e]',
    };
    const queuedClass = isQueued ? 'ring-1 ring-[#1f6feb]' : '';
    return `${base} ${statusClasses[status] || ''} ${queuedClass}`;
  };

  // Task status classes
  const getTaskStatusClasses = (status: string) => {
    const base = 'flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold';
    const statusClasses: Record<string, string> = {
      completed: 'bg-[#238636] text-white',
      blocked: 'bg-[#6e7681] text-white',
      running: 'bg-[#1f6feb] text-white animate-pulse',
      pending: 'bg-transparent border-2 border-[#8b949e] text-[#8b949e]',
    };
    return `${base} ${statusClasses[status] || ''}`;
  };

  // Review status classes
  const getReviewStatusClasses = (reviewStatus: string) => {
    const base = 'ml-2 py-0.5 px-2 rounded-full text-[10px] font-medium';
    const classes: Record<string, string> = {
      passed: 'bg-[rgba(35,134,54,0.15)] text-[#3fb950]',
      needs_improvement: 'bg-[rgba(210,153,34,0.15)] text-[#d29922]',
      pending: 'bg-[rgba(139,148,158,0.15)] text-[#8b949e]',
    };
    return `${base} ${classes[reviewStatus] || ''}`;
  };

  // Queue badge classes
  const getQueueBadgeClasses = (queueStatus: string) => {
    const base = 'ml-2 py-0.5 px-2 rounded text-[10px] font-medium';
    const classes: Record<string, string> = {
      running: 'bg-[#1f6feb] text-white animate-pulse',
      completed: 'bg-[#238636] text-white',
      pending: 'bg-[#30363d] text-[#8b949e]',
    };
    return `${base} ${classes[queueStatus] || classes.pending}`;
  };

  // Button classes
  const btnBase = 'inline-flex items-center gap-1.5 py-2.5 px-4 border-none rounded-lg text-[13px] font-medium cursor-pointer transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed';
  const btnPrimary = `${btnBase} bg-[#238636] text-white hover:bg-[#2ea043] disabled:hover:bg-[#238636]`;
  const btnSecondary = `${btnBase} bg-[#21262d] text-text border border-border hover:bg-[#30363d] hover:border-text-muted disabled:hover:bg-[#21262d]`;

  // Drawer button classes
  const drawerBtnBase = 'py-2 px-4 rounded-lg text-[13px] font-medium cursor-pointer transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed';
  const drawerBtnPrimary = `${drawerBtnBase} bg-primary text-white hover:bg-primary-hover`;
  const drawerBtnExecute = `${drawerBtnBase} bg-[#238636] text-white hover:bg-[#2ea043]`;
  const drawerBtnRemove = `${drawerBtnBase} bg-[#21262d] text-[#f85149] border border-[#f85149] hover:bg-[rgba(248,81,73,0.1)]`;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-spin-slow {
          animation: spin 1s linear infinite;
        }
        .animate-slide-in {
          animation: slideIn 0.25s ease-out;
        }
        .decompose-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .decompose-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .decompose-scrollbar::-webkit-scrollbar-thumb {
          background: #30363d;
          border-radius: 4px;
        }
        .decompose-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #484f58;
        }
      `}</style>

      {/* Header */}
      <div className="flex-shrink-0 flex items-start justify-between gap-4 pb-4 border-b border-border">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-lg font-semibold text-text">
            {specType === 'prd' ? 'User Stories' : 'Tasks'}
          </h2>
          <p className="text-text-muted text-sm m-0">
            {specType === 'prd'
              ? 'Break down this PRD into user stories'
              : 'Break down this spec into implementable tasks'}
          </p>
          {hasBeenDecomposed && (
            <span className="text-text-muted text-xs mt-1">
              {stories.filter(s => s.passes || completedIds.has(s.id)).length}/{stories.length} completed
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
          {/* Tech spec queue actions */}
          {specType === 'tech-spec' && hasBeenDecomposed && (
            <button
              className={btnPrimary}
              onClick={handleAddAllToQueue}
              disabled={queueLoading.size > 0 || stories.every(s => s.passes || isTaskQueued(s.id))}
            >
              {queueLoading.size > 0 ? '⏳ Adding...' : '📋 Add All to Queue'}
            </button>
          )}

          {canActivate && (
            <button
              className={btnSecondary}
              onClick={handleActivateAndRun}
              disabled={activateLoading}
            >
              {activateLoading ? '⏳ Starting...' : '▶ Run Queue'}
            </button>
          )}
          {hasBeenDecomposed ? (
            <button
              className={btnSecondary}
              onClick={() => handleDecompose(true)}
              disabled={isLoading || activateLoading}
            >
              {isLoading ? '⏳ Running...' :
               specType === 'prd' ? '🔄 Regenerate Stories' : '🔄 Regenerate Tasks'}
            </button>
          ) : (
            <button
              className={btnPrimary}
              onClick={() => handleDecompose(false)}
              disabled={isLoading}
            >
              {isLoading ? '⏳ Running...' :
               specType === 'prd' ? '📝 Generate User Stories' : '🔧 Generate Tasks'}
            </button>
          )}
        </div>
      </div>

      {/* Branch input */}
      <div className="flex items-center gap-3 py-3">
        <label className="text-text-muted text-sm font-medium whitespace-nowrap">Branch:</label>
        <input
          type="text"
          className="flex-1 max-w-xs py-2 px-3 bg-surface border border-border rounded-md text-text text-sm placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder="ralph/feature"
          disabled={isLoading}
        />
      </div>

      {/* Progress indicator */}
      {isLoading && (
        <div className="py-6 px-4 flex flex-col items-center gap-3 bg-[rgba(31,111,235,0.05)] rounded-lg border border-[rgba(31,111,235,0.2)] my-3">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-[#1f6feb] border-t-transparent rounded-full animate-spin-slow" />
            <span className="text-text text-sm font-medium">
              {decomposeState?.message || (specType === 'prd' ? 'Generating user stories...' : 'Generating tasks...')}
            </span>
          </div>
          {!hasBeenDecomposed && (
            <div className="text-text-muted text-xs text-center">
              {specType === 'prd'
                ? '📝 Stories will appear here once generation and review complete'
                : '🔧 Tasks will appear here once generation completes'}
            </div>
          )}
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="flex items-center gap-2 py-3 px-4 bg-[rgba(248,81,73,0.1)] border border-[#f85149] rounded-lg my-3">
          <span className="text-[#f85149] text-lg">⚠</span>
          <span className="text-[#f85149] text-sm">{error}</span>
        </div>
      )}

      {/* Task list */}
      {hasBeenDecomposed && (
        <div className="flex-1 overflow-y-auto decompose-scrollbar flex flex-col gap-2 pt-3">
          {stories.map((story) => {
            const status = getTaskStatus(story, completedIds);
            const isExpanded = expandedTask === story.id;

            return (
              <div
                key={story.id}
                className={getTaskCardClasses(status, isTaskQueued(story.id))}
              >
                <div
                  className="flex items-center gap-3 py-3 px-4 cursor-pointer transition-colors duration-150 hover:bg-surface-hover"
                  onClick={() => setExpandedTask(isExpanded ? null : story.id)}
                >
                  <span className={getTaskStatusClasses(status)}>
                    {getStatusIcon(status)}
                  </span>
                  <span className="text-text-muted text-xs font-mono flex-shrink-0">{story.id}</span>
                  <span className="text-text text-sm font-medium flex-1 min-w-0 truncate">{story.title}</span>
                  {/* Review status indicator */}
                  {specType === 'prd' && story.reviewStatus && (
                    <span className={getReviewStatusClasses(story.reviewStatus)}>
                      {story.reviewStatus === 'passed' && '✓ Reviewed'}
                      {story.reviewStatus === 'needs_improvement' && '⚠ Needs Review'}
                      {story.reviewStatus === 'pending' && '○ Pending'}
                    </span>
                  )}
                  {isTaskQueued(story.id) && (
                    <span className={getQueueBadgeClasses(getQueuedTaskStatus(story.id))}>
                      {getQueuedTaskStatus(story.id) === 'running' ? '▶ Running' :
                       getQueuedTaskStatus(story.id) === 'completed' ? '✓ Done' :
                       `#${getQueuePosition(story.id)} Queued`}
                    </span>
                  )}
                  {getComplexityBadge(story.complexity)}
                  {/* User story achievement indicator */}
                  {specType === 'tech-spec' && story.achievesUserStories && story.achievesUserStories.length > 0 && (
                    <span className="ml-2 text-[#8b949e] text-[11px]" title={`Achieves: ${story.achievesUserStories.join(', ')}`}>
                      → {story.achievesUserStories.length} {story.achievesUserStories.length === 1 ? 'story' : 'stories'}
                    </span>
                  )}
                  <button
                    className="ml-2 p-1 text-text-muted hover:text-accent bg-transparent border-none cursor-pointer transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      openTaskDrawer(story);
                    }}
                    title="Open task details"
                  >
                    ↗
                  </button>
                  <span className="text-text-muted text-xs ml-1">{isExpanded ? '▼' : '▶'}</span>
                </div>

                {isExpanded && (
                  <div className="py-4 px-4 border-t border-border bg-[rgba(22,27,34,0.5)]">
                    <div className="text-text text-sm leading-relaxed mb-4">
                      <ChatMarkdown content={story.description} />
                    </div>

                    {story.acceptanceCriteria.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-2">Acceptance Criteria</h4>
                        <ul className="m-0 pl-5 text-text text-sm space-y-1">
                          {story.acceptanceCriteria.map((ac, i) => (
                            <li key={i}>{ac}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {story.dependencies.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-2">Dependencies</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {story.dependencies.map((dep) => (
                            <span
                              key={dep}
                              className={`py-0.5 px-2 rounded text-xs font-mono ${completedIds.has(dep) ? 'bg-[rgba(35,134,54,0.15)] text-[#3fb950]' : 'bg-[rgba(139,148,158,0.15)] text-[#8b949e]'}`}
                            >
                              {dep}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {story.notes && (
                      <div className="mb-4">
                        <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-2">Notes</h4>
                        <div className="text-text-muted text-sm italic">
                          <ChatMarkdown content={story.notes} />
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-3 border-t border-border">
                      {/* Queue actions for tech specs */}
                      {specType === 'tech-spec' && !story.passes && (
                        isTaskQueued(story.id) ? (
                          <button
                            className="py-1.5 px-3 rounded text-xs font-medium bg-transparent text-[#f85149] border border-[#f85149] hover:bg-[rgba(248,81,73,0.1)] transition-colors disabled:opacity-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveFromQueue(story.id);
                            }}
                            disabled={queueLoading.has(story.id) || getQueuedTaskStatus(story.id) === 'running'}
                          >
                            {queueLoading.has(story.id) ? '⏳ ...' : '✕ Remove from Queue'}
                          </button>
                        ) : (
                          <button
                            className="py-1.5 px-3 rounded text-xs font-medium bg-[#238636] text-white hover:bg-[#2ea043] transition-colors disabled:opacity-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddToQueue(story.id);
                            }}
                            disabled={queueLoading.has(story.id)}
                          >
                            {queueLoading.has(story.id) ? '⏳ ...' : '+ Add to Queue'}
                          </button>
                        )
                      )}
                      <button
                        className="py-1.5 px-3 rounded text-xs font-medium bg-[#21262d] text-text hover:bg-[#30363d] transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          openTaskDrawer(story);
                        }}
                      >
                        Edit / Discuss
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!hasBeenDecomposed && !isLoading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 py-12">
          <div className="text-5xl">📋</div>
          <h3 className="text-text text-lg font-medium m-0">
            {specType === 'prd' ? 'No stories yet' : 'No tasks yet'}
          </h3>
          <p className="text-text-muted text-sm m-0 text-center max-w-xs">
            {specType === 'prd'
              ? 'Decompose this PRD to generate user stories'
              : 'Decompose this spec to generate tasks'}
          </p>
        </div>
      )}

      {/* Task Drawer */}
      {drawerOpen && selectedTask && (
        <div
          className="fixed inset-0 bg-black/60 z-[1000] flex justify-end"
          onClick={handleBackdropClick}
        >
          <div
            className="w-full max-w-[520px] h-full bg-surface border-l border-border flex flex-col animate-slide-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 py-4 px-5 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className={getTaskStatusClasses(getTaskStatus(selectedTask, completedIds))}>
                  {getStatusIcon(getTaskStatus(selectedTask, completedIds))}
                </span>
                <span className="text-text-muted text-sm font-mono">{selectedTask.id}</span>
                {selectedTask.inPrd && <span className="py-0.5 px-2 bg-[#30363d] text-[#8b949e] rounded text-[10px]">In Queue</span>}
                {getComplexityBadge(selectedTask.complexity)}
              </div>
              <button
                className="p-1 text-text-muted hover:text-text bg-transparent border-none cursor-pointer text-xl leading-none"
                onClick={closeDrawer}
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto decompose-scrollbar p-5">
              <h2 className="text-text text-xl font-semibold m-0 mb-4">{selectedTask.title}</h2>

              {/* Queue actions */}
              {specType === 'tech-spec' && !selectedTask.passes && (
                <div className="flex items-center gap-3 mb-6">
                  {isTaskQueued(selectedTask.id) ? (
                    <>
                      <span className={getQueueBadgeClasses(getQueuedTaskStatus(selectedTask.id))}>
                        {getQueuedTaskStatus(selectedTask.id) === 'running' ? '▶ Running now' :
                         getQueuedTaskStatus(selectedTask.id) === 'completed' ? '✓ Completed' :
                         `#${getQueuePosition(selectedTask.id)} in queue`}
                      </span>
                      {getQueuedTaskStatus(selectedTask.id) !== 'running' && (
                        <button
                          className={drawerBtnRemove}
                          onClick={() => handleRemoveFromQueue(selectedTask.id)}
                          disabled={queueLoading.has(selectedTask.id)}
                        >
                          {queueLoading.has(selectedTask.id) ? 'Removing...' : '✕ Remove from Queue'}
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      className={drawerBtnExecute}
                      onClick={() => handleAddToQueue(selectedTask.id)}
                      disabled={queueLoading.has(selectedTask.id)}
                    >
                      {queueLoading.has(selectedTask.id) ? 'Adding...' : '+ Add to Queue'}
                    </button>
                  )}
                </div>
              )}

              {/* Legacy execute for non-tech-specs */}
              {specType !== 'tech-spec' && (
                <div className="flex items-center gap-3 mb-6">
                  <button
                    className={drawerBtnExecute}
                    onClick={handleExecuteTask}
                    disabled={executeLoading || selectedTask.inPrd}
                  >
                    {executeLoading ? 'Adding...' : selectedTask.inPrd ? 'Already Queued' : '▶ Execute This Task'}
                  </button>
                </div>
              )}

              {executeError && (
                <div className="py-2 px-3 bg-[rgba(248,81,73,0.1)] border border-[#f85149] rounded text-[#f85149] text-sm mb-4">
                  {executeError}
                </div>
              )}

              {/* Show achievesUserStories */}
              {specType === 'tech-spec' && selectedTask.achievesUserStories && selectedTask.achievesUserStories.length > 0 && (
                <div className="mb-6 p-4 bg-[rgba(31,111,235,0.05)] rounded-lg border border-[rgba(31,111,235,0.2)]">
                  <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-2">Achieves User Stories</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTask.achievesUserStories.map(storyId => (
                      <span key={storyId} className="py-1 px-2 bg-[#1f6feb] text-white rounded text-xs font-mono">
                        {storyId}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-6">
                <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-2">Description</h4>
                <p className="text-text text-sm leading-relaxed m-0">{selectedTask.description}</p>
              </div>

              {selectedTask.acceptanceCriteria.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-2">Acceptance Criteria</h4>
                  <ul className="m-0 pl-5 text-text text-sm space-y-1">
                    {selectedTask.acceptanceCriteria.map((ac, i) => (
                      <li key={i}>{ac}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedTask.testCases && selectedTask.testCases.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-2">Test Cases</h4>
                  <ul className="m-0 pl-5 text-text text-sm space-y-1">
                    {selectedTask.testCases.map((tc, i) => (
                      <li key={i}><code className="py-0.5 px-1.5 bg-[#161b22] rounded text-xs font-mono">{tc}</code></li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedTask.dependencies.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-2">Dependencies</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedTask.dependencies.map((dep) => (
                      <span
                        key={dep}
                        className={`py-1 px-2 rounded text-xs ${completedIds.has(dep) ? 'bg-[rgba(35,134,54,0.15)] text-[#3fb950]' : 'bg-[rgba(139,148,158,0.15)] text-[#8b949e]'}`}
                      >
                        {completedIds.has(dep) ? '✓' : '○'} {dep}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedTask.notes && (
                <div className="mb-6">
                  <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-2">Notes</h4>
                  <p className="text-text-muted text-sm italic m-0">{selectedTask.notes}</p>
                </div>
              )}

              {/* Feedback Section */}
              <div className="pt-6 border-t border-border">
                <h4 className="text-text text-sm font-semibold mb-2">Update Task</h4>
                <p className="text-text-muted text-xs mb-3">
                  Provide feedback to update this task. Claude will revise the task based on your comments.
                </p>
                <textarea
                  className="w-full py-3 px-3 bg-bg border border-border rounded-lg text-text text-sm resize-y min-h-[100px] placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
                  placeholder="e.g., Add a test case for error handling, clarify the acceptance criteria, change the description..."
                  value={taskFeedback}
                  onChange={(e) => setTaskFeedback(e.target.value)}
                  disabled={feedbackLoading}
                  rows={4}
                />
                {feedbackError && (
                  <div className="py-2 px-3 bg-[rgba(248,81,73,0.1)] text-[#f85149] text-sm rounded mt-2">
                    {feedbackError}
                  </div>
                )}
                {feedbackSuccess && (
                  <div className="py-2 px-3 bg-[rgba(35,134,54,0.1)] text-[#3fb950] text-sm rounded mt-2">
                    Task updated successfully!
                  </div>
                )}
                <div className="flex justify-end mt-3">
                  <button
                    className={drawerBtnPrimary}
                    onClick={handleSubmitFeedback}
                    disabled={feedbackLoading || !taskFeedback.trim()}
                  >
                    {feedbackLoading ? 'Updating...' : 'Submit Feedback'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
