import { useState, useEffect, useCallback } from 'react';
import type { UserStory, PRDData, DecomposeState, QueuedTaskReference } from '../../types';
import './SpecDecomposeTab.css';

type SpecType = 'prd' | 'tech-spec' | 'bug';
// Note: Mode selector removed - PRD always generates user stories, tech spec generates tasks

interface SpecDecomposeTabProps {
  specPath: string;
  projectPath: string;
  /** Spec type - determines decompose options */
  specType?: SpecType;
  /** Callback when tech spec creation is requested */
  onCreateTechSpec?: () => void;
  /** Callback when quick execute is requested */
  onQuickExecute?: () => void;
}

function detectSpecTypeFromFilename(filename: string): SpecType {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.prd.md')) return 'prd';
  if (lower.endsWith('.tech.md')) return 'tech-spec';
  if (lower.endsWith('.bug.md')) return 'bug';
  return 'prd';
}

type TaskStatus = 'completed' | 'ready' | 'blocked' | 'in-progress';

function getTaskStatus(story: UserStory, completedIds: Set<string>): TaskStatus {
  if (story.passes) return 'completed';

  const depsOk = story.dependencies.every(dep => completedIds.has(dep));
  return depsOk ? 'ready' : 'blocked';
}

function getStatusIcon(status: TaskStatus): string {
  switch (status) {
    case 'completed': return '✓';
    case 'ready': return '○';
    case 'blocked': return '⏸';
    case 'in-progress': return '▶';
    default: return '○';
  }
}

function getComplexityBadge(complexity?: string) {
  if (!complexity) return null;
  const colors: Record<string, string> = {
    low: 'task-complexity--low',
    medium: 'task-complexity--medium',
    high: 'task-complexity--high',
  };
  return (
    <span className={`task-complexity ${colors[complexity] || ''}`}>
      {complexity}
    </span>
  );
}

export function SpecDecomposeTab({ specPath, projectPath, specType: propSpecType, onCreateTechSpec, onQuickExecute }: SpecDecomposeTabProps) {
  const [decomposeState, setDecomposeState] = useState<DecomposeState>({ status: 'IDLE', message: '' });
  const [draft, setDraft] = useState<PRDData | null>(null);
  const [draftPath, setDraftPath] = useState<string | null>(null);
  const [branch, setBranch] = useState('ralph/feature');
  const [isDecomposing, setIsDecomposing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  // Queue state
  const [queuedTasks, setQueuedTasks] = useState<QueuedTaskReference[]>([]);
  const [queueLoading, setQueueLoading] = useState<Set<string>>(new Set());

  // Determine spec type from prop or filename
  const specType = propSpecType || detectSpecTypeFromFilename(specPath);

  // PRDs generate user stories, tech specs/bugs generate tasks
  // No mode selector - flow is determined by spec type

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<UserStory | null>(null);
  const [taskFeedback, setTaskFeedback] = useState('');
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);
  const [executeLoading, setExecuteLoading] = useState(false);
  const [executeError, setExecuteError] = useState<string | null>(null);
  const [activateLoading, setActivateLoading] = useState(false);

  // API helper - adds project parameter
  const apiUrl = useCallback((endpoint: string) => {
    const separator = endpoint.includes('?') ? '&' : '?';
    return `${endpoint}${separator}project=${encodeURIComponent(projectPath)}`;
  }, [projectPath]);

  // API helper for decompose endpoints - adds project and specPath parameters
  const decomposeApiUrl = useCallback((endpoint: string) => {
    const separator = endpoint.includes('?') ? '&' : '?';
    return `${endpoint}${separator}project=${encodeURIComponent(projectPath)}&specPath=${encodeURIComponent(specPath)}`;
  }, [projectPath, specPath]);

  // Track selected task ID separately to avoid infinite loop
  const selectedTaskId = selectedTask?.id;

  // Extract spec ID from path for queue operations
  const specId = specPath.replace(/^.*\//, '').replace(/\.md$/, '');

  // Fetch decompose state, draft, and queue
  const fetchState = useCallback(async () => {
    try {
      const [stateRes, draftRes, queueRes] = await Promise.all([
        fetch(decomposeApiUrl('/api/decompose/state')),
        fetch(decomposeApiUrl('/api/decompose/draft')),
        fetch(apiUrl('/api/queue')),
      ]);

      const stateData = await stateRes.json();
      const draftData = await draftRes.json();

      setDecomposeState(stateData);
      setDraft(draftData.draft);
      setDraftPath(draftData.draftPath || null);

      if (draftData.draft?.branchName) {
        setBranch(draftData.draft.branchName);
      }

      // Update queue state
      if (queueRes.ok) {
        const queueData = await queueRes.json();
        setQueuedTasks(queueData.queue || []);
      }

      // Check if decompose is in progress
      const isActive = ['STARTING', 'INITIALIZING', 'DECOMPOSING', 'REVIEWING', 'REVISING'].includes(stateData.status);
      setIsDecomposing(isActive);

      if (stateData.status === 'ERROR') {
        setError(stateData.error || 'Decomposition failed');
      } else {
        setError(null);
      }

      // If selectedTask is open, update it with fresh data
      if (selectedTaskId && draftData.draft?.userStories) {
        const updatedTask = draftData.draft.userStories.find(
          (s: UserStory) => s.id === selectedTaskId
        );
        if (updatedTask) {
          setSelectedTask(updatedTask);
        }
      }
    } catch (err) {
      console.error('Failed to fetch decompose state:', err);
    }
  }, [decomposeApiUrl, apiUrl, selectedTaskId]);

  // Initial fetch and polling
  useEffect(() => {
    fetchState();
  }, [fetchState]);

  useEffect(() => {
    const isActive = ['STARTING', 'INITIALIZING', 'DECOMPOSING', 'REVIEWING', 'REVISING'].includes(decomposeState.status);
    const interval = setInterval(fetchState, isActive ? 3000 : 15000);
    return () => clearInterval(interval);
  }, [fetchState, decomposeState.status]);

  // Handle decompose
  const handleDecompose = async (force: boolean = false) => {
    setIsDecomposing(true);
    setError(null);

    try {
      const res = await fetch(apiUrl('/api/decompose/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prdFile: specPath,
          branchName: branch,
          forceRedecompose: force,
          specType,
          // PRDs generate user stories, tech specs generate tasks
          mode: specType === 'prd' ? 'user-stories' : 'tasks',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to start decomposition');
      }

      // Fetch updated state
      await fetchState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start decomposition');
      setIsDecomposing(false);
    }
  };

  // Open task in drawer
  const openTaskDrawer = (task: UserStory) => {
    setSelectedTask(task);
    setDrawerOpen(true);
    setTaskFeedback('');
    setFeedbackError(null);
    setFeedbackSuccess(false);
    setExecuteError(null);
    setExpandedTask(null); // Close inline expansion
  };

  // Close drawer
  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedTask(null);
    setTaskFeedback('');
    setFeedbackError(null);
    setFeedbackSuccess(false);
    setExecuteError(null);
  };

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeDrawer();
    }
  };

  // Submit task feedback
  const handleSubmitFeedback = async () => {
    if (!selectedTask || !taskFeedback.trim()) return;

    setFeedbackLoading(true);
    setFeedbackError(null);
    setFeedbackSuccess(false);

    try {
      const res = await fetch(apiUrl('/api/decompose/task-feedback'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: selectedTask.id,
          feedback: taskFeedback,
          prdFile: specPath,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit feedback');
      }

      setFeedbackSuccess(true);
      setTaskFeedback('');

      // Update the selected task with the response if available
      if (data.task) {
        setSelectedTask(data.task);
      }

      // Refresh the draft to get updated task list
      await fetchState();
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setFeedbackLoading(false);
    }
  };

  // Execute single task
  const handleExecuteTask = async () => {
    if (!selectedTask || !draft) return;

    setExecuteLoading(true);
    setExecuteError(null);

    try {
      const res = await fetch(apiUrl('/api/decompose/execute-task'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: selectedTask,
          projectName: draft.projectName,
          branchName: draft.branchName,
          language: draft.language,
          sourceFile: draftPath,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to queue task');
      }

      // Update the task to show it's queued
      setSelectedTask({ ...selectedTask, inPrd: true });

      // Refresh state
      await fetchState();
    } catch (err) {
      setExecuteError(err instanceof Error ? err.message : 'Failed to execute');
    } finally {
      setExecuteLoading(false);
    }
  };

  // Add task to queue
  const handleAddToQueue = async (taskId: string) => {
    setQueueLoading(prev => new Set(prev).add(taskId));
    try {
      const res = await fetch(apiUrl('/api/queue/add'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specId, taskId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add to queue');
      }

      await fetchState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add to queue');
    } finally {
      setQueueLoading(prev => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  // Remove task from queue
  const handleRemoveFromQueue = async (taskId: string) => {
    setQueueLoading(prev => new Set(prev).add(taskId));
    try {
      const res = await fetch(apiUrl(`/api/queue/${specId}/${taskId}`), {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove from queue');
      }

      await fetchState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove from queue');
    } finally {
      setQueueLoading(prev => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  // Add all tasks to queue
  const handleAddAllToQueue = async () => {
    const taskIds = stories.filter(s => !s.passes).map(s => s.id);
    if (taskIds.length === 0) return;

    setQueueLoading(new Set(taskIds));
    try {
      const res = await fetch(apiUrl('/api/queue/add-many'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: taskIds.map(taskId => ({ specId, taskId })) }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add tasks to queue');
      }

      await fetchState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add tasks to queue');
    } finally {
      setQueueLoading(new Set());
    }
  };

  // Get queue position for a task
  const getQueuePosition = (taskId: string): number | null => {
    const idx = queuedTasks.findIndex(t => t.specId === specId && t.taskId === taskId);
    return idx >= 0 ? idx + 1 : null;
  };

  // Check if task is in queue
  const isTaskQueued = (taskId: string): boolean => {
    return queuedTasks.some(t => t.specId === specId && t.taskId === taskId);
  };

  // Get queued task status
  const getQueuedTaskStatus = (taskId: string): string | null => {
    const task = queuedTasks.find(t => t.specId === specId && t.taskId === taskId);
    return task?.status || null;
  };

  // Activate all tasks and start Ralph
  const handleActivateAndRun = async () => {
    setActivateLoading(true);
    setError(null);

    try {
      const activateRes = await fetch(apiUrl('/api/decompose/activate'), { method: 'POST' });
      if (!activateRes.ok) {
        const data = await activateRes.json();
        throw new Error(data.error || 'Failed to activate tasks');
      }

      const ralphRes = await fetch(apiUrl('/api/ralph/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ iterations: 25 }),
      });

      if (!ralphRes.ok) {
        const data = await ralphRes.json();
        throw new Error(data.error || 'Failed to start Ralph');
      }

      // Refresh state to show tasks are queued
      await fetchState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate');
    } finally {
      setActivateLoading(false);
    }
  };

  // Calculate stats
  const stories = draft?.userStories || [];
  const completedIds = new Set(stories.filter(s => s.passes).map(s => s.id));
  const stats = {
    total: stories.length,
    completed: completedIds.size,
    ready: stories.filter(s => !s.passes && s.dependencies.every(d => completedIds.has(d))).length,
    blocked: stories.filter(s => !s.passes && !s.dependencies.every(d => completedIds.has(d))).length,
  };

  // Check if this spec has been decomposed
  const hasBeenDecomposed = stories.length > 0;
  const isServerInProgress = ['STARTING', 'INITIALIZING', 'DECOMPOSING', 'REVIEWING', 'REVISING'].includes(decomposeState.status);
  // Combined loading state for immediate button feedback
  const isLoading = isDecomposing || isServerInProgress;
  const isComplete = decomposeState.status === 'COMPLETED';
  const canActivate = (isComplete || hasBeenDecomposed) && draft && !isLoading;

  return (
    <div className="spec-decompose-tab">
      {/* Header with actions */}
      <div className="decompose-header">
        <div className="decompose-info">
          <h3 className="decompose-title">
            {hasBeenDecomposed
              ? (specType === 'prd' ? 'User Stories' : 'Tasks')
              : (specType === 'prd' ? 'Generate User Stories' : 'Generate Tasks')
            }
          </h3>
          {hasBeenDecomposed && (
            <div className="decompose-stats">
              <span className="stat stat--completed">{stats.completed} done</span>
              <span className="stat stat--ready">{stats.ready} ready</span>
              <span className="stat stat--blocked">{stats.blocked} blocked</span>
            </div>
          )}
        </div>

        <div className="decompose-actions">
          {/* PRD-specific actions */}
          {specType === 'prd' && hasBeenDecomposed && (
            <>
              {onCreateTechSpec && (
                <button
                  className="decompose-btn decompose-btn--primary"
                  onClick={onCreateTechSpec}
                  disabled={isLoading}
                >
                  🔧 Create Tech Spec
                </button>
              )}
              {onQuickExecute && (
                <button
                  className="decompose-btn decompose-btn--secondary"
                  onClick={onQuickExecute}
                  disabled={isLoading}
                >
                  ⚡ Quick Execute
                </button>
              )}
            </>
          )}

          {/* Tech spec queue actions */}
          {specType === 'tech-spec' && hasBeenDecomposed && (
            <button
              className="decompose-btn decompose-btn--primary"
              onClick={handleAddAllToQueue}
              disabled={queueLoading.size > 0 || stories.every(s => s.passes || isTaskQueued(s.id))}
            >
              {queueLoading.size > 0 ? '⏳ Adding...' : '📋 Add All to Queue'}
            </button>
          )}

          {canActivate && (
            <button
              className="decompose-btn decompose-btn--secondary"
              onClick={handleActivateAndRun}
              disabled={activateLoading}
            >
              {activateLoading ? '⏳ Starting...' : '▶ Run Queue'}
            </button>
          )}
          {hasBeenDecomposed ? (
            <button
              className="decompose-btn decompose-btn--secondary"
              onClick={() => handleDecompose(true)}
              disabled={isLoading || activateLoading}
            >
              {isLoading ? '⏳ Running...' :
               specType === 'prd' ? '🔄 Regenerate Stories' : '🔄 Regenerate Tasks'}
            </button>
          ) : (
            <button
              className="decompose-btn decompose-btn--primary"
              onClick={() => handleDecompose(false)}
              disabled={isLoading}
            >
              {isLoading ? '⏳ Running...' :
               specType === 'prd' ? '📝 Generate User Stories' : '🔧 Generate Tasks'}
            </button>
          )}
        </div>
      </div>

      {/* Mode selector removed - PRDs always generate user stories, tech specs generate tasks */}

      {/* Branch input */}
      <div className="decompose-branch">
        <label className="branch-label">Branch:</label>
        <input
          type="text"
          className="branch-input"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder="ralph/feature"
          disabled={isLoading}
        />
      </div>

      {/* Progress indicator */}
      {isLoading && (
        <div className="decompose-progress">
          <div className="progress-spinner" />
          <span className="progress-message">{decomposeState.message || 'Processing...'}</span>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="decompose-error">
          <span className="error-icon">⚠</span>
          <span className="error-message">{error}</span>
        </div>
      )}

      {/* Task list - show even during progress if we have tasks */}
      {hasBeenDecomposed && (
        <div className="task-list">
          {stories.map((story) => {
            const status = getTaskStatus(story, completedIds);
            const isExpanded = expandedTask === story.id;

            return (
              <div
                key={story.id}
                className={`task-card task-card--${status} ${isTaskQueued(story.id) ? 'task-card--queued' : ''}`}
              >
                <div
                  className="task-header"
                  onClick={() => setExpandedTask(isExpanded ? null : story.id)}
                >
                  <span className={`task-status task-status--${status}`}>
                    {getStatusIcon(status)}
                  </span>
                  <span className="task-id">{story.id}</span>
                  <span className="task-title">{story.title}</span>
                  {/* Review status indicator for user stories */}
                  {specType === 'prd' && story.reviewStatus && (
                    <span className={`task-review-status task-review-status--${story.reviewStatus}`}>
                      {story.reviewStatus === 'passed' && '✓ Reviewed'}
                      {story.reviewStatus === 'needs_improvement' && '⚠ Needs Review'}
                      {story.reviewStatus === 'pending' && '○ Pending'}
                    </span>
                  )}
                  {isTaskQueued(story.id) && (
                    <span className={`task-queued-badge task-queued-badge--${getQueuedTaskStatus(story.id)}`}>
                      {getQueuedTaskStatus(story.id) === 'running' ? '▶ Running' :
                       getQueuedTaskStatus(story.id) === 'completed' ? '✓ Done' :
                       `#${getQueuePosition(story.id)} Queued`}
                    </span>
                  )}
                  {getComplexityBadge(story.complexity)}
                  {/* User story achievement indicator for tech spec tasks */}
                  {specType === 'tech-spec' && story.achievesUserStories && story.achievesUserStories.length > 0 && (
                    <span className="task-achieves" title={`Achieves: ${story.achievesUserStories.join(', ')}`}>
                      → {story.achievesUserStories.length} {story.achievesUserStories.length === 1 ? 'story' : 'stories'}
                    </span>
                  )}
                  <button
                    className="task-open-drawer"
                    onClick={(e) => {
                      e.stopPropagation();
                      openTaskDrawer(story);
                    }}
                    title="Open task details"
                  >
                    ↗
                  </button>
                  <span className="task-chevron">{isExpanded ? '▼' : '▶'}</span>
                </div>

                {isExpanded && (
                  <div className="task-details">
                    <p className="task-description">{story.description}</p>

                    {story.acceptanceCriteria.length > 0 && (
                      <div className="task-section">
                        <h4 className="task-section-title">Acceptance Criteria</h4>
                        <ul className="task-criteria">
                          {story.acceptanceCriteria.map((ac, i) => (
                            <li key={i}>{ac}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {story.dependencies.length > 0 && (
                      <div className="task-section">
                        <h4 className="task-section-title">Dependencies</h4>
                        <div className="task-deps">
                          {story.dependencies.map((dep) => (
                            <span
                              key={dep}
                              className={`task-dep ${completedIds.has(dep) ? 'task-dep--done' : ''}`}
                            >
                              {dep}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {story.notes && (
                      <div className="task-section">
                        <h4 className="task-section-title">Notes</h4>
                        <p className="task-notes">{story.notes}</p>
                      </div>
                    )}

                    <div className="task-inline-actions">
                      {/* Queue actions for tech specs */}
                      {specType === 'tech-spec' && !story.passes && (
                        isTaskQueued(story.id) ? (
                          <button
                            className="task-action-btn task-action-btn--remove"
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
                            className="task-action-btn task-action-btn--queue"
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
                        className="task-action-btn"
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
        <div className="decompose-empty">
          <div className="empty-icon">📋</div>
          <h3 className="empty-title">No tasks yet</h3>
          <p className="empty-description">
            Decompose this spec to generate user stories and tasks
          </p>
        </div>
      )}

      {/* Task Drawer */}
      {drawerOpen && selectedTask && (
        <div className="drawer-backdrop" onClick={handleBackdropClick}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-header-info">
                <span className={`drawer-status drawer-status--${getTaskStatus(selectedTask, completedIds)}`}>
                  {getStatusIcon(getTaskStatus(selectedTask, completedIds))}
                </span>
                <span className="drawer-id">{selectedTask.id}</span>
                {selectedTask.inPrd && <span className="task-queued-badge">In Queue</span>}
                {getComplexityBadge(selectedTask.complexity)}
              </div>
              <button className="drawer-close" onClick={closeDrawer}>×</button>
            </div>

            <div className="drawer-content">
              <h2 className="drawer-title">{selectedTask.title}</h2>

              {/* Queue actions */}
              {specType === 'tech-spec' && !selectedTask.passes && (
                <div className="drawer-actions">
                  {isTaskQueued(selectedTask.id) ? (
                    <>
                      <span className={`drawer-queue-status drawer-queue-status--${getQueuedTaskStatus(selectedTask.id)}`}>
                        {getQueuedTaskStatus(selectedTask.id) === 'running' ? '▶ Running now' :
                         getQueuedTaskStatus(selectedTask.id) === 'completed' ? '✓ Completed' :
                         `#${getQueuePosition(selectedTask.id)} in queue`}
                      </span>
                      {getQueuedTaskStatus(selectedTask.id) !== 'running' && (
                        <button
                          className="drawer-btn drawer-btn--remove"
                          onClick={() => handleRemoveFromQueue(selectedTask.id)}
                          disabled={queueLoading.has(selectedTask.id)}
                        >
                          {queueLoading.has(selectedTask.id) ? 'Removing...' : '✕ Remove from Queue'}
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      className="drawer-btn drawer-btn--execute"
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
                <div className="drawer-actions">
                  <button
                    className="drawer-btn drawer-btn--execute"
                    onClick={handleExecuteTask}
                    disabled={executeLoading || selectedTask.inPrd}
                  >
                    {executeLoading ? 'Adding...' : selectedTask.inPrd ? 'Already Queued' : '▶ Execute This Task'}
                  </button>
                </div>
              )}

              {executeError && (
                <div className="drawer-error">{executeError}</div>
              )}

              {/* Show achievesUserStories for tech spec tasks */}
              {specType === 'tech-spec' && selectedTask.achievesUserStories && selectedTask.achievesUserStories.length > 0 && (
                <div className="drawer-section drawer-achieves">
                  <h4>Achieves User Stories</h4>
                  <div className="drawer-story-list">
                    {selectedTask.achievesUserStories.map(storyId => (
                      <span key={storyId} className="drawer-story-badge">
                        {storyId}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="drawer-section">
                <h4>Description</h4>
                <p>{selectedTask.description}</p>
              </div>

              {selectedTask.acceptanceCriteria.length > 0 && (
                <div className="drawer-section">
                  <h4>Acceptance Criteria</h4>
                  <ul>
                    {selectedTask.acceptanceCriteria.map((ac, i) => (
                      <li key={i}>{ac}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedTask.testCases && selectedTask.testCases.length > 0 && (
                <div className="drawer-section">
                  <h4>Test Cases</h4>
                  <ul className="drawer-test-cases">
                    {selectedTask.testCases.map((tc, i) => (
                      <li key={i}><code>{tc}</code></li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedTask.dependencies.length > 0 && (
                <div className="drawer-section">
                  <h4>Dependencies</h4>
                  <div className="drawer-deps">
                    {selectedTask.dependencies.map((dep) => (
                      <span
                        key={dep}
                        className={`drawer-dep ${completedIds.has(dep) ? 'drawer-dep--done' : ''}`}
                      >
                        {completedIds.has(dep) ? '✓' : '○'} {dep}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedTask.notes && (
                <div className="drawer-section">
                  <h4>Notes</h4>
                  <p className="drawer-notes">{selectedTask.notes}</p>
                </div>
              )}

              {/* Feedback Section */}
              <div className="drawer-section drawer-feedback">
                <h4>Update Task</h4>
                <p className="feedback-hint">
                  Provide feedback to update this task. Claude will revise the task based on your comments.
                </p>
                <textarea
                  className="feedback-textarea"
                  placeholder="e.g., Add a test case for error handling, clarify the acceptance criteria, change the description..."
                  value={taskFeedback}
                  onChange={(e) => setTaskFeedback(e.target.value)}
                  disabled={feedbackLoading}
                  rows={4}
                />
                {feedbackError && (
                  <div className="feedback-error">{feedbackError}</div>
                )}
                {feedbackSuccess && (
                  <div className="feedback-success">Task updated successfully!</div>
                )}
                <div className="feedback-actions">
                  <button
                    className="drawer-btn drawer-btn--primary"
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
