import { useState, useEffect, useCallback } from 'react';
import type { UserStory, PRDData, DecomposeState } from '../../types';
import './SpecDecomposeTab.css';

interface SpecDecomposeTabProps {
  specPath: string;
  projectPath: string;
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

export function SpecDecomposeTab({ specPath, projectPath }: SpecDecomposeTabProps) {
  const [decomposeState, setDecomposeState] = useState<DecomposeState>({ status: 'IDLE', message: '' });
  const [draft, setDraft] = useState<PRDData | null>(null);
  const [draftPath, setDraftPath] = useState<string | null>(null);
  const [branch, setBranch] = useState('ralph/feature');
  const [, setIsDecomposing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

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

  // Fetch decompose state and draft
  const fetchState = useCallback(async () => {
    try {
      const [stateRes, draftRes] = await Promise.all([
        fetch(decomposeApiUrl('/api/decompose/state')),
        fetch(decomposeApiUrl('/api/decompose/draft')),
      ]);

      const stateData = await stateRes.json();
      const draftData = await draftRes.json();

      setDecomposeState(stateData);
      setDraft(draftData.draft);
      setDraftPath(draftData.draftPath || null);

      if (draftData.draft?.branchName) {
        setBranch(draftData.draft.branchName);
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
  }, [decomposeApiUrl, selectedTaskId]);

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
  const isInProgress = ['STARTING', 'INITIALIZING', 'DECOMPOSING', 'REVIEWING', 'REVISING'].includes(decomposeState.status);
  const isComplete = decomposeState.status === 'COMPLETED';
  const canActivate = (isComplete || hasBeenDecomposed) && draft && !isInProgress;

  return (
    <div className="spec-decompose-tab">
      {/* Header with actions */}
      <div className="decompose-header">
        <div className="decompose-info">
          <h3 className="decompose-title">
            {hasBeenDecomposed ? 'Task Breakdown' : 'Decompose Spec'}
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
          {canActivate && (
            <button
              className="decompose-btn decompose-btn--primary"
              onClick={handleActivateAndRun}
              disabled={activateLoading}
            >
              {activateLoading ? '⏳ Starting...' : '▶ Run All Tasks'}
            </button>
          )}
          {hasBeenDecomposed ? (
            <button
              className="decompose-btn decompose-btn--secondary"
              onClick={() => handleDecompose(true)}
              disabled={isInProgress || activateLoading}
            >
              {isInProgress ? '⏳ Running...' : '🔄 Re-decompose'}
            </button>
          ) : (
            <button
              className="decompose-btn decompose-btn--primary"
              onClick={() => handleDecompose(false)}
              disabled={isInProgress}
            >
              {isInProgress ? '⏳ Running...' : '🚀 Decompose'}
            </button>
          )}
        </div>
      </div>

      {/* Branch input */}
      <div className="decompose-branch">
        <label className="branch-label">Branch:</label>
        <input
          type="text"
          className="branch-input"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder="ralph/feature"
          disabled={isInProgress}
        />
      </div>

      {/* Progress indicator */}
      {isInProgress && (
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
                className={`task-card task-card--${status} ${story.inPrd ? 'task-card--queued' : ''}`}
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
                  {story.inPrd && <span className="task-queued-badge">Queued</span>}
                  {getComplexityBadge(story.complexity)}
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
      {!hasBeenDecomposed && !isInProgress && (
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

              {/* Execute and error display */}
              <div className="drawer-actions">
                <button
                  className="drawer-btn drawer-btn--execute"
                  onClick={handleExecuteTask}
                  disabled={executeLoading || selectedTask.inPrd}
                >
                  {executeLoading ? 'Adding...' : selectedTask.inPrd ? 'Already Queued' : '▶ Execute This Task'}
                </button>
              </div>

              {executeError && (
                <div className="drawer-error">{executeError}</div>
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
