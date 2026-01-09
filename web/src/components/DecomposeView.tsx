import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DecomposeState, DecomposeFeedback, PrdFile, PRDData, UserStory, FeedbackItem, DecomposeErrorType } from '../types';

interface DecomposeViewProps {
  onTasksActivated: () => void;
  projectPath?: string;
}

export function DecomposeView({ onTasksActivated, projectPath }: DecomposeViewProps) {
  const navigate = useNavigate();

  // Helper to add project param to API calls
  const apiUrl = (endpoint: string) => {
    if (!projectPath) return endpoint;
    const separator = endpoint.includes('?') ? '&' : '?';
    return `${endpoint}${separator}project=${encodeURIComponent(projectPath)}`;
  };
  const [prdFiles, setPrdFiles] = useState<PrdFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [branch, setBranch] = useState('ralph/feature');
  const [forceRedecompose, setForceRedecompose] = useState(false);
  const [decomposeState, setDecomposeState] = useState<DecomposeState>({ status: 'IDLE', message: '' });
  const [feedback, setFeedback] = useState<DecomposeFeedback | null>(null);
  const [draft, setDraft] = useState<PRDData | null>(null);
  const [draftPath, setDraftPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<DecomposeErrorType | null>(null);
  const [retrying, setRetrying] = useState(false);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'logs' | 'task'>('logs');
  const [selectedTask, setSelectedTask] = useState<UserStory | null>(null);
  const [reviewLog, setReviewLog] = useState<string | null>(null);
  const [allReviewLogs, setAllReviewLogs] = useState<{attempt: number; path: string; content: string | null}[]>([]);
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set([1]));
  const [taskFeedback, setTaskFeedback] = useState('');
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);
  const [executeLoading, setExecuteLoading] = useState(false);
  const [executeError, setExecuteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const toggleLogExpanded = (attempt: number) => {
    setExpandedLogs(prev => {
      const next = new Set(prev);
      if (next.has(attempt)) {
        next.delete(attempt);
      } else {
        next.add(attempt);
      }
      return next;
    });
  };

  const fetchPrdFiles = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/decompose/prd-files'));
      const data = await res.json();
      setPrdFiles(data.files || []);
    } catch (err) {
      console.error('Failed to fetch PRD files:', err);
    }
  }, [projectPath]);

  // Track the last known attempt count to detect new attempts
  const [lastAttemptCount, setLastAttemptCount] = useState(0);

  const fetchState = useCallback(async () => {
    try {
      // Fetch sequentially to reduce file descriptor usage
      const stateRes = await fetch(apiUrl('/api/decompose/state'));
      const stateData = await stateRes.json();
      setDecomposeState(stateData);

      // Update error state from decompose state
      if (stateData.status === 'ERROR' && stateData.error) {
        setError(stateData.error);
        setErrorType(stateData.errorType || null);
      } else if (stateData.status !== 'ERROR') {
        // Clear error when not in error state
        if (error && !loading && !retrying) {
          setError(null);
          setErrorType(null);
        }
      }

      const feedbackRes = await fetch(apiUrl('/api/decompose/feedback'));
      const feedbackData = await feedbackRes.json();
      setFeedback(feedbackData.feedback);

      const draftRes = await fetch(apiUrl('/api/decompose/draft'));
      const draftData = await draftRes.json();
      setDraft(draftData.draft);
      setDraftPath(draftData.draftPath || null);

      const allLogsRes = await fetch(apiUrl('/api/decompose/review-logs'));
      const allLogsData = await allLogsRes.json();
      const newLogs = allLogsData.logs || [];
      setAllReviewLogs(newLogs);

      // Only auto-expand when new attempts are added, not on every poll
      if (newLogs.length > 0 && newLogs.length !== lastAttemptCount) {
        const maxAttempt = Math.max(...newLogs.map((l: {attempt: number}) => l.attempt));
        setExpandedLogs(prev => new Set([...prev, maxAttempt]));
        setLastAttemptCount(newLogs.length);
      }

      // Only fetch review log if we don't have allReviewLogs
      if (newLogs.length === 0) {
        const logRes = await fetch(apiUrl('/api/decompose/review-log'));
        const logData = await logRes.json();
        setReviewLog(logData.log);
      }
    } catch (err) {
      console.error('Failed to fetch state:', err);
    }
  }, [projectPath, lastAttemptCount]);

  // Reset state when project changes
  useEffect(() => {
    setSelectedFile('');
    setPrdFiles([]);
    setDraft(null);
    setDraftPath(null);
    setDecomposeState({ status: 'IDLE', message: '' });
    setFeedback(null);
    setAllReviewLogs([]);
    setReviewLog(null);
    setLastAttemptCount(0);
    setError(null);
  }, [projectPath]);

  useEffect(() => {
    fetchPrdFiles();
    fetchState();
  }, [fetchPrdFiles, fetchState]);

  // Auto-refresh - faster when active, slower when idle/complete
  useEffect(() => {
    const isActive = ['STARTING', 'INITIALIZING', 'DECOMPOSING', 'DECOMPOSED', 'REVIEWING', 'REVISING'].includes(decomposeState.status);
    const interval = setInterval(fetchState, isActive ? 3000 : 10000);
    return () => clearInterval(interval);
  }, [fetchState, decomposeState.status]);

  const handleStartDecompose = async () => {
    if (!selectedFile) {
      setError('Please select a PRD file');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(apiUrl('/api/decompose/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prdFile: selectedFile, branchName: branch, forceRedecompose }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start decomposition');
      }

      fetchState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start');
    } finally {
      setLoading(false);
    }
  };

  const handleActivateAndRun = async () => {
    setLoading(true);
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

      onTasksActivated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRetryReview = async () => {
    setRetrying(true);
    setError(null);
    setErrorType(null);

    try {
      const res = await fetch(apiUrl('/api/decompose/retry-review'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to retry peer review');
        setErrorType(data.errorType || null);
      } else {
        // Refresh state to get updated verdict
        fetchState();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry peer review');
    } finally {
      setRetrying(false);
    }
  };

  const openLogs = () => {
    setDrawerMode('logs');
    setDrawerOpen(true);
  };

  const openTaskDetail = (task: UserStory) => {
    setSelectedTask(task);
    setDrawerMode('task');
    setDrawerOpen(true);
    setTaskFeedback('');
    setFeedbackError(null);
    setFeedbackSuccess(false);
    setExecuteError(null);
    setDeleteError(null);
  };

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

      // Close drawer and switch to execution view
      setDrawerOpen(false);
      onTasksActivated();
    } catch (err) {
      setExecuteError(err instanceof Error ? err.message : 'Failed to execute');
    } finally {
      setExecuteLoading(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!selectedTask) return;

    if (!confirm(`Are you sure you want to delete task ${selectedTask.id}?`)) {
      return;
    }

    setDeleteLoading(true);
    setDeleteError(null);

    try {
      const res = await fetch(apiUrl(`/api/decompose/draft/task/${selectedTask.id}`), {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete task');
      }

      // Close drawer and refresh state
      setDrawerOpen(false);
      fetchState();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleteLoading(false);
    }
  };

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
          prdFile: decomposeState.prdFile,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit feedback');
      }

      setFeedbackSuccess(true);
      setTaskFeedback('');

      // Refresh the draft to get updated task
      fetchState();
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setFeedbackLoading(false);
    }
  };

  const getStatusColor = () => {
    switch (decomposeState.status) {
      case 'COMPLETED':
        // PASS and SKIPPED are both acceptable outcomes
        return decomposeState.verdict === 'FAIL' ? 'var(--color-blocked)' : 'var(--color-completed)';
      case 'ERROR':
        return 'var(--color-blocked)';
      case 'DECOMPOSING':
      case 'REVIEWING':
      case 'REVISING':
        return 'var(--color-running)';
      default:
        return 'var(--color-text-muted)';
    }
  };

  const isInProgress = ['STARTING', 'INITIALIZING', 'DECOMPOSING', 'DECOMPOSED', 'REVIEWING', 'REVISING'].includes(decomposeState.status);
  const isComplete = decomposeState.status === 'COMPLETED';
  const canActivate = isComplete && decomposeState.verdict !== 'FAIL' && draft;

  const formatFeedbackItem = (item: string | FeedbackItem): string => {
    if (typeof item === 'string') return item;
    const parts: string[] = [];
    if (item.taskId) parts.push(`[${item.taskId}]`);
    if (item.taskIds) parts.push(`[${item.taskIds.join(', ')}]`);
    if (item.requirement) parts.push(item.requirement);
    if (item.issue) parts.push(item.issue);
    if (item.reason) parts.push(item.reason);
    if (item.action) parts.push(`Action: ${item.action}`);
    if (item.prdSection) parts.push(`(PRD: ${item.prdSection})`);
    if (item.dependsOn) parts.push(`depends on: ${item.dependsOn}`);
    return parts.join(' ');
  };

  const renderFeedbackSection = (label: string, items?: (string | FeedbackItem)[]) => {
    if (!items || items.length === 0) return null;
    return (
      <div className="log-entry">
        <div className="log-label">{label}</div>
        <ul className="log-list">
          {items.map((item, i) => (
            <li key={i}>{formatFeedbackItem(item)}</li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="decompose-page">
      {/* Header */}
      <div className="decompose-header">
        <h2>PRD Decomposition</h2>
        <p>Break down a PRD into atomic user stories</p>
      </div>

      {/* Configuration Bar */}
      <div className="decompose-config">
        <div className="config-fields">
          <div className="config-field">
            <label>PRD File</label>
            <select
              value={selectedFile}
              onChange={(e) => setSelectedFile(e.target.value)}
              disabled={isInProgress}
            >
              <option value="">Select a file...</option>
              {prdFiles.map((file) => (
                <option key={file.path} value={file.path}>
                  {file.dir}/{file.name}
                </option>
              ))}
            </select>
          </div>

          <div className="config-field">
            <label>Branch</label>
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              disabled={isInProgress}
              placeholder="ralph/feature"
            />
          </div>

          <div className="config-field config-checkbox">
            <label>
              <input
                type="checkbox"
                checked={forceRedecompose}
                onChange={(e) => setForceRedecompose(e.target.checked)}
                disabled={isInProgress}
              />
              Force re-decomposition
            </label>
          </div>

          <div className="config-actions">
            <button
              className="btn-primary"
              onClick={handleStartDecompose}
              disabled={loading || isInProgress || !selectedFile}
            >
              {isInProgress ? 'Processing...' : 'Start'}
            </button>
            <button className="btn-secondary" onClick={openLogs}>
              View Logs
            </button>
          </div>
        </div>

        {/* Status Row */}
        <div className="config-status">
          <span
            className="status-indicator"
            style={{ backgroundColor: getStatusColor() }}
          />
          <span className="status-text">{decomposeState.status}</span>
          <span className="status-message">{decomposeState.message}</span>
          {decomposeState.updatedAt && (
            <span className="status-time">
              {new Date(decomposeState.updatedAt).toLocaleTimeString()}
            </span>
          )}
          {decomposeState.verdict && (
            <span className={`review-badge ${decomposeState.verdict.toLowerCase()}`}>
              {decomposeState.verdict === 'PASS' ? '✓' : decomposeState.verdict === 'FAIL' ? '✗' : '○'} Review {decomposeState.verdict}
            </span>
          )}
        </div>

        {error && (
          <div className="config-error-container">
            <div className="config-error">{error}</div>
            {errorType === 'CLI_UNAVAILABLE' && (
              <div className="error-suggestion">
                <span>The selected CLI tool is not available.</span>
                <button
                  className="btn-link"
                  onClick={() => navigate('/settings')}
                >
                  Go to Settings
                </button>
                <span>to configure a different reviewer CLI.</span>
              </div>
            )}
            {(errorType === 'TIMEOUT' || errorType === 'CRASH') && draft && (
              <div className="error-actions">
                <button
                  className="btn-retry"
                  onClick={handleRetryReview}
                  disabled={retrying}
                >
                  {retrying ? 'Retrying...' : 'Retry Peer Review'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tasks Grid */}
      <div className="decompose-tasks">
        {draft && draft.userStories && draft.userStories.length > 0 ? (
          <>
            <div className="tasks-header">
              <div className="tasks-header-left">
                <h3>Generated Tasks ({draft.userStories.length})</h3>
                <div className="tasks-meta">
                  <span>{draft.projectName}</span>
                  <span>{draft.language}</span>
                </div>
              </div>
              {canActivate && (
                <button
                  className="btn-primary"
                  onClick={handleActivateAndRun}
                  disabled={loading}
                >
                  Activate & Run All
                </button>
              )}
            </div>
            <div className="tasks-grid">
              {draft.userStories.map((story) => (
                <div
                  key={story.id}
                  className={`task-card-small ${story.inPrd ? 'task-executed' : ''}`}
                  onClick={() => openTaskDetail(story)}
                >
                  <div className="task-card-header">
                    <span className="task-id">{story.id}</span>
                    <span className="task-priority" data-priority={story.priority}>P{story.priority}</span>
                    {story.inPrd && <span className="task-queued-badge">Queued</span>}
                  </div>
                  <div className="task-title">{story.title}</div>
                  <div className="task-description">{story.description}</div>
                  {story.notes && (
                    <div className="task-notes-preview">{story.notes}</div>
                  )}
                  <div className="task-card-footer-meta">
                    {story.dependencies.length > 0 && (
                      <span className="task-deps-badge">
                        {story.dependencies.length} dep{story.dependencies.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="tasks-empty">
            <div className="empty-icon">&#128203;</div>
            <h3>No tasks generated</h3>
            <p>Select a PRD file and start decomposition to generate tasks.</p>
          </div>
        )}
      </div>

      {/* Drawer */}
      {drawerOpen && (
        <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h3>{drawerMode === 'logs' ? 'Decomposition Logs' : selectedTask?.id}</h3>
              <button className="drawer-close" onClick={() => setDrawerOpen(false)}>
                &times;
              </button>
            </div>
            <div className="drawer-content">
              {drawerMode === 'logs' && (
                <div className="logs-content">
                  {/* Compact Status Summary */}
                  <div className="logs-summary">
                    <div className="logs-summary-row">
                      <span className="summary-item">
                        <span className="summary-label">Status:</span>
                        <span className="summary-value">{decomposeState.status}</span>
                      </span>
                      {decomposeState.storyCount !== undefined && (
                        <span className="summary-item">
                          <span className="summary-label">Tasks:</span>
                          <span className="summary-value">{decomposeState.storyCount}</span>
                        </span>
                      )}
                      {feedback && (
                        <span className="summary-item">
                          <span className="summary-label">Verdict:</span>
                          <span className={`summary-value verdict-${feedback.verdict?.toLowerCase()}`}>
                            {feedback.verdict}
                          </span>
                        </span>
                      )}
                      {decomposeState.attempts && decomposeState.attempts > 1 && (
                        <span className="summary-item">
                          <span className="summary-label">Attempts:</span>
                          <span className="summary-value">{decomposeState.attempts}</span>
                        </span>
                      )}
                    </div>
                    <div className="logs-summary-message">{decomposeState.message}</div>
                    {decomposeState.prdFile && (
                      <div className="logs-summary-file">
                        <span className="summary-label">PRD:</span>
                        <code>{decomposeState.prdFile}</code>
                      </div>
                    )}
                  </div>

                  {/* Feedback Issues (if any) */}
                  {feedback && (feedback.missingRequirements?.length || feedback.contradictions?.length ||
                    feedback.dependencyErrors?.length || feedback.duplicates?.length || feedback.suggestions?.length) && (
                    <div className="logs-feedback-section">
                      <div className="collapsible-header" onClick={() => toggleLogExpanded(0)}>
                        <span className="collapsible-icon">{expandedLogs.has(0) ? '▼' : '▶'}</span>
                        <span className="collapsible-title">Review Feedback</span>
                      </div>
                      {expandedLogs.has(0) && (
                        <div className="collapsible-content">
                          {renderFeedbackSection('Missing Requirements', feedback.missingRequirements)}
                          {renderFeedbackSection('Contradictions', feedback.contradictions)}
                          {renderFeedbackSection('Dependency Errors', feedback.dependencyErrors)}
                          {renderFeedbackSection('Duplicates', feedback.duplicates)}
                          {renderFeedbackSection('Suggestions', feedback.suggestions)}
                          {feedback.issues && feedback.issues.length > 0 && (
                            <div className="log-entry">
                              <div className="log-label">Issues</div>
                              <ul className="log-list">
                                {feedback.issues.map((issue, i) => (
                                  <li key={i}>{issue}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Collapsible Review Logs */}
                  {allReviewLogs.length > 0 && (
                    <div className="logs-review-section">
                      <div className="logs-section-title">Codex Review Logs</div>
                      {allReviewLogs.map((log) => (
                        <div key={log.attempt} className="collapsible-log">
                          <div
                            className={`collapsible-header ${expandedLogs.has(log.attempt) ? 'expanded' : ''}`}
                            onClick={() => toggleLogExpanded(log.attempt)}
                          >
                            <span className="collapsible-icon">{expandedLogs.has(log.attempt) ? '▼' : '▶'}</span>
                            <span className="collapsible-title">Review Attempt {log.attempt}</span>
                            <span className="collapsible-meta">
                              {log.content ? `${(log.content.length / 1024).toFixed(1)}KB` : 'Not found'}
                            </span>
                          </div>
                          {expandedLogs.has(log.attempt) && (
                            <div className="collapsible-content">
                              <pre className="log-pre log-pre-full">
                                {log.content || 'Log file not found'}
                              </pre>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {!allReviewLogs.length && reviewLog && (
                    <div className="logs-review-section">
                      <div className="collapsible-log">
                        <div
                          className={`collapsible-header ${expandedLogs.has(1) ? 'expanded' : ''}`}
                          onClick={() => toggleLogExpanded(1)}
                        >
                          <span className="collapsible-icon">{expandedLogs.has(1) ? '▼' : '▶'}</span>
                          <span className="collapsible-title">Codex Review Log</span>
                        </div>
                        {expandedLogs.has(1) && (
                          <div className="collapsible-content">
                            <pre className="log-pre log-pre-full">{reviewLog}</pre>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {drawerMode === 'task' && selectedTask && (
                <div className="task-detail">
                  <div className="task-detail-header">
                    <div className="task-detail-title">
                      <span className="task-detail-id">{selectedTask.id}</span>
                      {selectedTask.inPrd && <span className="task-queued-badge">In Queue</span>}
                      <h2>{selectedTask.title}</h2>
                    </div>
                    <div className="task-detail-actions">
                      <button
                        className="btn-execute"
                        onClick={handleExecuteTask}
                        disabled={executeLoading || deleteLoading || selectedTask.inPrd}
                      >
                        {executeLoading ? 'Adding...' : selectedTask.inPrd ? 'Already Queued' : 'Execute This Task'}
                      </button>
                      <button
                        className="btn-danger"
                        onClick={handleDeleteTask}
                        disabled={deleteLoading || executeLoading}
                      >
                        {deleteLoading ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                  {selectedTask.executedAt && (
                    <div className="task-executed-info">
                      Added to execution queue: {new Date(selectedTask.executedAt).toLocaleString()}
                    </div>
                  )}
                  {executeError && (
                    <div className="execute-error">{executeError}</div>
                  )}
                  {deleteError && (
                    <div className="execute-error">{deleteError}</div>
                  )}

                  <div className="detail-section">
                    <h4>Description</h4>
                    <p>{selectedTask.description}</p>
                  </div>

                  <div className="detail-section">
                    <h4>Acceptance Criteria</h4>
                    <ul>
                      {selectedTask.acceptanceCriteria.map((ac, i) => (
                        <li key={i}>{ac}</li>
                      ))}
                    </ul>
                  </div>

                  {selectedTask.testCases && selectedTask.testCases.length > 0 && (
                    <div className="detail-section">
                      <h4>Test Cases</h4>
                      <ul className="test-cases">
                        {selectedTask.testCases.map((tc, i) => (
                          <li key={i}><code>{tc}</code></li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selectedTask.dependencies.length > 0 && (
                    <div className="detail-section">
                      <h4>Dependencies</h4>
                      <div className="dep-tags">
                        {selectedTask.dependencies.map((dep) => (
                          <span key={dep} className="dep-tag">{dep}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedTask.notes && (
                    <div className="detail-section">
                      <h4>Notes</h4>
                      <div className="detail-notes">{selectedTask.notes}</div>
                    </div>
                  )}

                  {/* Feedback Section */}
                  <div className="detail-section feedback-section">
                    <h4>Update Task</h4>
                    <p className="feedback-hint">
                      Provide feedback to update this task. Claude will revise the task based on your comments.
                    </p>
                    <textarea
                      className="feedback-textarea"
                      placeholder="e.g., Add a test case for error handling, clarify the acceptance criteria for edge cases, change the priority to 1..."
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
                        className="btn-primary"
                        onClick={handleSubmitFeedback}
                        disabled={feedbackLoading || !taskFeedback.trim()}
                      >
                        {feedbackLoading ? 'Updating...' : 'Submit Feedback'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
