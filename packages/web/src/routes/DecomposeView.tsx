import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { QueueListIcon } from '@heroicons/react/24/outline';
import type { DecomposeState, DecomposeFeedback, PrdFile, PRDData, UserStory, FeedbackItem, DecomposeErrorType } from '../types';
import { ContextSection } from '../components/shared/ContextSection';
import { Badge, Alert, apiFetch } from '../components/ui';
import { Button } from '../components/ui/Button';

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
  const [drawerWidth, setDrawerWidth] = useState(576); // Default ~xl (576px)
  const isResizing = useRef(false);
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
      const res = await apiFetch(apiUrl('/api/decompose/prd-files'));
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
      const stateRes = await apiFetch(apiUrl('/api/decompose/state'));
      const stateData = await stateRes.json();
      setDecomposeState(stateData);

      if (stateData.status === 'ERROR' && stateData.error) {
        setError(stateData.error);
        setErrorType(stateData.errorType || null);
      } else if (stateData.status !== 'ERROR') {
        if (error && !loading && !retrying) {
          setError(null);
          setErrorType(null);
        }
      }

      const feedbackRes = await apiFetch(apiUrl('/api/decompose/feedback'));
      const feedbackData = await feedbackRes.json();
      setFeedback(feedbackData.feedback);

      const draftRes = await apiFetch(apiUrl('/api/decompose/draft'));
      const draftData = await draftRes.json();
      setDraft(draftData.draft);
      setDraftPath(draftData.draftPath || null);

      const allLogsRes = await apiFetch(apiUrl('/api/decompose/review-logs'));
      const allLogsData = await allLogsRes.json();
      const newLogs = allLogsData.logs || [];
      setAllReviewLogs(newLogs);

      if (newLogs.length > 0 && newLogs.length !== lastAttemptCount) {
        const maxAttempt = Math.max(...newLogs.map((l: {attempt: number}) => l.attempt));
        setExpandedLogs(prev => new Set([...prev, maxAttempt]));
        setLastAttemptCount(newLogs.length);
      }

      if (newLogs.length === 0) {
        const logRes = await apiFetch(apiUrl('/api/decompose/review-log'));
        const logData = await logRes.json();
        setReviewLog(logData.log);
      }
    } catch (err) {
      console.error('Failed to fetch state:', err);
    }
  }, [projectPath, lastAttemptCount]);

  // Drawer resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = window.innerWidth - e.clientX;
      setDrawerWidth(Math.min(Math.max(320, newWidth), window.innerWidth * 0.9));
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

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
      const res = await apiFetch(apiUrl('/api/decompose/start'), {
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
      const specPathParam = selectedFile ? `&specPath=${encodeURIComponent(selectedFile)}` : '';
      const activateRes = await apiFetch(apiUrl('/api/decompose/activate') + specPathParam, { method: 'POST' });
      if (!activateRes.ok) {
        const data = await activateRes.json();
        throw new Error(data.error || 'Failed to activate tasks');
      }

      const ralphRes = await apiFetch(apiUrl('/api/ralph/start'), {
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

    // Derive specId from selected file path (filename without .md)
    const specId = selectedFile ? selectedFile.split('/').pop()?.replace(/\.md$/i, '') : null;

    try {
      const res = await apiFetch(apiUrl('/api/decompose/retry-review'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specId }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to retry peer review');
        setErrorType(data.errorType || null);
      } else {
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
      const res = await apiFetch(apiUrl('/api/decompose/execute-task'), {
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
      const res = await apiFetch(apiUrl(`/api/decompose/draft/task/${selectedTask.id}`), {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete task');
      }

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
      const res = await apiFetch(apiUrl('/api/decompose/task-feedback'), {
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

      if (data.task) {
        setSelectedTask(data.task);
      }

      fetchState();
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setFeedbackLoading(false);
    }
  };

  const getStatusVariant = (): 'success' | 'error' | 'primary' | 'ghost' => {
    switch (decomposeState.status) {
      case 'COMPLETED':
        return decomposeState.verdict === 'FAIL' ? 'error' : 'success';
      case 'ERROR':
        return 'error';
      case 'DECOMPOSING':
      case 'REVIEWING':
      case 'REVISING':
        return 'primary';
      default:
        return 'ghost';
    }
  };

  const isInProgress = ['STARTING', 'INITIALIZING', 'DECOMPOSING', 'DECOMPOSED', 'REVIEWING', 'REVISING'].includes(decomposeState.status);
  const isComplete = decomposeState.status === 'COMPLETED';
  const canActivate = isComplete && decomposeState.verdict !== 'FAIL' && draft;

  const formatFeedbackItem = (item: string | FeedbackItem): string => {
    if (typeof item === 'string') return item;
    const parts: string[] = [];
    if (item.severity) parts.push(`[${item.severity.toUpperCase()}]`);
    if (item.taskId) parts.push(`[${item.taskId}]`);
    if (item.taskIds) parts.push(`[${item.taskIds.join(', ')}]`);
    if (item.requirement) parts.push(item.requirement);
    if (item.description) parts.push(item.description);
    if (item.issue) parts.push(item.issue);
    if (item.reason) parts.push(item.reason);
    if (item.action) parts.push(`Action: ${item.action}`);
    if (item.suggestedFix) parts.push(`Fix: ${item.suggestedFix}`);
    if (item.prdSection) parts.push(`(PRD: ${item.prdSection})`);
    if (item.dependsOn) parts.push(`depends on: ${item.dependsOn}`);
    return parts.join(' ');
  };

  const renderFeedbackSection = (label: string, items?: (string | FeedbackItem)[]) => {
    if (!items || items.length === 0) return null;
    return (
      <div className="space-y-2">
        <div className="text-sm font-semibold opacity-70">{label}</div>
        <ul className="list-disc list-inside space-y-1 text-sm">
          {items.map((item, i) => (
            <li key={i}>{formatFeedbackItem(item)}</li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border bg-muted">
        <h2 className="text-xl font-bold">PRD Decomposition</h2>
        <p className="text-sm opacity-60">Break down a PRD into atomic user stories</p>
      </div>

      {/* Configuration Bar */}
      <div className="p-4 border-b border-border bg-card space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col flex-1 min-w-48 gap-1.5">
            <label className="text-sm font-medium">PRD File</label>
            <select
              className="h-9 px-3 text-sm rounded-md border border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary/20"
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

          <div className="flex flex-col min-w-40 gap-1.5">
            <label className="text-sm font-medium">Branch</label>
            <input
              type="text"
              className="h-9 px-3 text-sm rounded-md border border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              disabled={isInProgress}
              placeholder="ralph/feature"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20"
                checked={forceRedecompose}
                onChange={(e) => setForceRedecompose(e.target.checked)}
                disabled={isInProgress}
              />
              <span className="text-sm">Force re-decomposition</span>
            </label>
          </div>

          <div className="flex gap-2">
            <Button
              variant="high-contrast"
              size="sm"
              onClick={handleStartDecompose}
              disabled={loading || isInProgress || !selectedFile}
              isLoading={isInProgress}
            >
              Start
            </Button>
            <Button variant="ghost" size="sm" onClick={openLogs}>
              View Logs
            </Button>
          </div>
        </div>

        {/* Status Row */}
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant={getStatusVariant()} size="sm" className={isInProgress ? 'animate-pulse' : ''}>
            {decomposeState.status}
          </Badge>
          <span className="text-sm opacity-70">{decomposeState.message}</span>
          {decomposeState.updatedAt && (
            <span className="text-xs font-mono opacity-50">
              {new Date(decomposeState.updatedAt).toLocaleTimeString()}
            </span>
          )}
          {decomposeState.verdict && (
            <Badge
              variant={decomposeState.verdict === 'PASS' ? 'success' : decomposeState.verdict === 'FAIL' ? 'error' : 'warning'}
              size="sm"
            >
              {decomposeState.verdict === 'PASS' ? '✓' : decomposeState.verdict === 'FAIL' ? '✗' : '○'} Review {decomposeState.verdict}
            </Badge>
          )}
          {decomposeState.verdict === 'FAIL' && draft && !error && (
            <Button
              variant="outline"
              size="sm"
              className="text-error border-error hover:bg-error/10"
              onClick={handleRetryReview}
              disabled={retrying}
              isLoading={retrying}
            >
              {retrying ? 'Retrying...' : 'Retry Review'}
            </Button>
          )}
        </div>

        {/* Inline Review Feedback (visible when verdict is not PASS) */}
        {feedback && decomposeState.verdict && decomposeState.verdict !== 'PASS' && (feedback.missingRequirements?.length || feedback.contradictions?.length ||
          feedback.dependencyErrors?.length || feedback.duplicates?.length || feedback.suggestions?.length || feedback.issues?.length) && (
          <div className="bg-muted border border-error/30 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-error">Review Feedback</span>
              <Badge variant="error" size="xs">{feedback.verdict}</Badge>
            </div>
            {renderFeedbackSection('Missing Requirements', feedback.missingRequirements)}
            {renderFeedbackSection('Contradictions', feedback.contradictions)}
            {renderFeedbackSection('Dependency Errors', feedback.dependencyErrors)}
            {renderFeedbackSection('Duplicates', feedback.duplicates)}
            {renderFeedbackSection('Suggestions', feedback.suggestions)}
            {feedback.issues && feedback.issues.length > 0 && (
              <div className="space-y-1">
                <div className="text-sm font-semibold opacity-70">Issues</div>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {feedback.issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {error && (
          <Alert variant="error">
            <div className="flex flex-col gap-2">
              <span>{error}</span>
              {errorType === 'CLI_UNAVAILABLE' && (
                <div className="flex items-center gap-2 text-sm">
                  <span>The selected CLI tool is not available.</span>
                  <button
                    className="link link-primary"
                    onClick={() => navigate('/settings')}
                  >
                    Go to Settings
                  </button>
                  <span>to configure a different reviewer CLI.</span>
                </div>
              )}
              {(errorType === 'TIMEOUT' || errorType === 'CRASH' || decomposeState.verdict === 'FAIL') && draft && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRetryReview}
                  disabled={retrying}
                  isLoading={retrying}
                >
                  Retry Peer Review
                </Button>
              )}
            </div>
          </Alert>
        )}
      </div>

      {/* Tasks Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {draft && draft.userStories && draft.userStories.length > 0 ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-semibold">Generated Tasks ({draft.userStories.length})</h3>
                <div className="flex gap-2">
                  <Badge variant="neutral" size="xs">{draft.projectName}</Badge>
                  <Badge variant="neutral" size="xs">{draft.language}</Badge>
                </div>
              </div>
              {canActivate && (
                <Button
                  variant="high-contrast"
                  size="sm"
                  onClick={handleActivateAndRun}
                  disabled={loading}
                  isLoading={loading}
                >
                  Activate & Run All
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {draft.userStories.map((story) => (
                <div
                  key={story.id}
                  className={`rounded-xl bg-muted border border-border cursor-pointer hover:bg-muted/80 transition-colors ${story.inPrd ? 'opacity-70 border-l-4 border-l-success' : ''}`}
                  onClick={() => openTaskDetail(story)}
                >
                  <div className="p-4 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs opacity-60">{story.id}</span>
                      <Badge variant="neutral" size="xs">P{story.priority}</Badge>
                      {story.inPrd && <Badge variant="success" size="xs">Queued</Badge>}
                    </div>
                    <div className="font-medium text-sm line-clamp-1">{story.title}</div>
                    <div className="text-xs opacity-70 line-clamp-2">{story.description}</div>
                    {story.notes && (
                      <div className="text-xs italic opacity-50 line-clamp-1">{story.notes}</div>
                    )}
                    {story.dependencies.length > 0 && (
                      <div className="mt-auto pt-2">
                        <Badge variant="ghost" size="xs">
                          {story.dependencies.length} dep{story.dependencies.length > 1 ? 's' : ''}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 mb-4">
              <QueueListIcon className="w-12 h-12 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">No tasks generated</h3>
            <p className="text-sm opacity-60">Select a PRD file and start decomposition to generate tasks.</p>
          </div>
        )}
      </div>

      {/* Drawer */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex justify-end"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="h-full bg-card shadow-xl flex flex-col relative"
            style={{ width: drawerWidth }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Resize handle */}
            <div
              className="absolute left-0 top-0 bottom-0 w-2 cursor-grab hover:bg-primary/50 active:cursor-grabbing active:bg-primary transition-colors"
              onMouseDown={handleResizeStart}
            />
            <div className="flex items-center justify-between p-4 border-b border-border bg-muted">
              <h3 className="font-bold">
                {drawerMode === 'logs' ? 'Decomposition Logs' : selectedTask?.id}
              </h3>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 p-0 rounded-full" 
                onClick={() => setDrawerOpen(false)}
              >
                ×
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {drawerMode === 'logs' && (
                <div className="space-y-4">
                  {/* Compact Status Summary */}
                  <div className="rounded-xl bg-muted p-4 space-y-2">
                    <div className="flex flex-wrap gap-4 text-sm">
                      <div>
                        <span className="opacity-60">Status:</span>{' '}
                        <span className="font-medium">{decomposeState.status}</span>
                      </div>
                      {decomposeState.storyCount !== undefined && (
                        <div>
                          <span className="opacity-60">Tasks:</span>{' '}
                          <span className="font-medium">{decomposeState.storyCount}</span>
                        </div>
                      )}
                      {feedback && (
                        <div>
                          <span className="opacity-60">Verdict:</span>{' '}
                          <Badge
                            variant={feedback.verdict === 'PASS' ? 'success' : feedback.verdict === 'FAIL' ? 'error' : 'warning'}
                            size="xs"
                          >
                            {feedback.verdict}
                          </Badge>
                        </div>
                      )}
                      {decomposeState.attempts && decomposeState.attempts > 1 && (
                        <div>
                          <span className="opacity-60">Attempts:</span>{' '}
                          <span className="font-medium">{decomposeState.attempts}</span>
                        </div>
                      )}
                    </div>
                    <div className="text-sm">{decomposeState.message}</div>
                    {decomposeState.prdFile && (
                      <div className="text-xs">
                        <span className="opacity-60">PRD:</span>{' '}
                        <code className="bg-muted-foreground/10 px-1 rounded">{decomposeState.prdFile}</code>
                      </div>
                    )}
                  </div>

                  {/* Feedback Issues (if any) */}
                  {feedback && (feedback.missingRequirements?.length || feedback.contradictions?.length ||
                    feedback.dependencyErrors?.length || feedback.duplicates?.length || feedback.suggestions?.length) && (
                    <details className="rounded-xl bg-muted border border-border overflow-hidden">
                      <summary
                        className="px-4 py-3 font-medium cursor-pointer hover:bg-muted/80 flex items-center justify-between"
                        onClick={() => toggleLogExpanded(0)}
                      >
                        Review Feedback
                        <span className={`transition-transform ${expandedLogs.has(0) ? 'rotate-180' : ''}`}>▼</span>
                      </summary>
                      <div className="px-4 pb-4 space-y-4">
                        {renderFeedbackSection('Missing Requirements', feedback.missingRequirements)}
                        {renderFeedbackSection('Contradictions', feedback.contradictions)}
                        {renderFeedbackSection('Dependency Errors', feedback.dependencyErrors)}
                        {renderFeedbackSection('Duplicates', feedback.duplicates)}
                        {renderFeedbackSection('Suggestions', feedback.suggestions)}
                        {feedback.issues && feedback.issues.length > 0 && (
                          <div className="space-y-2">
                            <div className="text-sm font-semibold opacity-70">Issues</div>
                            <ul className="list-disc list-inside space-y-1 text-sm">
                              {feedback.issues.map((issue, i) => (
                                <li key={i}>{issue}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </details>
                  )}

                  {/* Collapsible Review Logs */}
                  {allReviewLogs.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm font-semibold opacity-70">Peer Review Logs</div>
                      {allReviewLogs.map((log) => (
                        <details key={log.attempt} className="rounded-xl bg-muted border border-border overflow-hidden">
                          <summary
                            className="px-4 py-3 text-sm font-medium cursor-pointer hover:bg-muted/80 flex items-center justify-between"
                            onClick={() => toggleLogExpanded(log.attempt)}
                          >
                            <span className="flex items-center gap-2">
                              Review Attempt {log.attempt}
                              <span className="text-xs opacity-60">
                                {log.content ? `${(log.content.length / 1024).toFixed(1)}KB` : 'Not found'}
                              </span>
                            </span>
                            <span className={`transition-transform ${expandedLogs.has(log.attempt) ? 'rotate-180' : ''}`}>▼</span>
                          </summary>
                          <div className="px-4 pb-4">
                            <pre className="text-xs bg-card p-3 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-96">
                              {log.content || 'Log file not found'}
                            </pre>
                          </div>
                        </details>
                      ))}
                    </div>
                  )}
                  {!allReviewLogs.length && reviewLog && (
                    <details className="rounded-xl bg-muted border border-border overflow-hidden">
                      <summary
                        className="px-4 py-3 font-medium cursor-pointer hover:bg-muted/80 flex items-center justify-between"
                        onClick={() => toggleLogExpanded(1)}
                      >
                        Peer Review Log
                        <span className={`transition-transform ${expandedLogs.has(1) ? 'rotate-180' : ''}`}>▼</span>
                      </summary>
                      <div className="px-4 pb-4">
                        <pre className="text-xs bg-card p-3 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-96">
                          {reviewLog}
                        </pre>
                      </div>
                    </details>
                  )}
                </div>
              )}
              {drawerMode === 'task' && selectedTask && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-lg">{selectedTask.id}</span>
                      {selectedTask.inPrd && <Badge variant="success" size="sm">In Queue</Badge>}
                    </div>
                    <h2 className="text-xl font-bold">{selectedTask.title}</h2>
                    <div className="flex gap-2">
                      <Button
                        variant="high-contrast"
                        size="sm"
                        onClick={handleExecuteTask}
                        disabled={executeLoading || deleteLoading || selectedTask.inPrd}
                        isLoading={executeLoading}
                      >
                        {selectedTask.inPrd ? 'Already Queued' : 'Execute This Task'}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDeleteTask}
                        disabled={deleteLoading || executeLoading}
                        isLoading={deleteLoading}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>

                  {selectedTask.executedAt && (
                    <Alert variant="info">
                      Added to execution queue: {new Date(selectedTask.executedAt).toLocaleString()}
                    </Alert>
                  )}
                  {executeError && <Alert variant="error">{executeError}</Alert>}
                  {deleteError && <Alert variant="error">{deleteError}</Alert>}

                  <section className="space-y-2">
                    <h4 className="text-sm font-semibold opacity-70">Description</h4>
                    <p className="text-sm">{selectedTask.description}</p>
                  </section>

                  <section className="space-y-2">
                    <h4 className="text-sm font-semibold opacity-70">Acceptance Criteria</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      {selectedTask.acceptanceCriteria.map((ac, i) => (
                        <li key={i}>{ac}</li>
                      ))}
                    </ul>
                  </section>

                  {selectedTask.testCases && selectedTask.testCases.length > 0 && (
                    <section className="space-y-2">
                      <h4 className="text-sm font-semibold opacity-70">Test Cases</h4>
                      <ul className="space-y-1">
                        {selectedTask.testCases.map((tc, i) => (
                          <li key={i}>
                            <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{tc}</code>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {selectedTask.dependencies.length > 0 && (
                    <section className="space-y-2">
                      <h4 className="text-sm font-semibold opacity-70">Dependencies</h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedTask.dependencies.map((dep) => (
                          <Badge key={dep} variant="ghost" size="sm">{dep}</Badge>
                        ))}
                      </div>
                    </section>
                  )}

                  {selectedTask.notes && (
                    <section className="space-y-2">
                      <h4 className="text-sm font-semibold opacity-70">Notes</h4>
                      <div className="text-sm bg-muted p-3 rounded-lg">{selectedTask.notes}</div>
                    </section>
                  )}

                  {selectedTask.context && (
                    <section className="space-y-2">
                      <h4 className="text-sm font-semibold opacity-70">Context</h4>
                      <ContextSection context={selectedTask.context} headingLevel="h5" />
                    </section>
                  )}

                  {/* Feedback Section */}
                  <section className="space-y-3 border-t border-border pt-4">
                    <h4 className="text-sm font-semibold opacity-70">Update Task</h4>
                    <p className="text-xs opacity-60">
                      Provide feedback to update this task. Claude will revise the task based on your comments.
                    </p>
                    <textarea
                      className="w-full min-h-[100px] px-3 py-2 text-sm rounded-md border border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y"
                      placeholder="e.g., Add a test case for error handling, clarify the acceptance criteria for edge cases, change the priority to 1..."
                      value={taskFeedback}
                      onChange={(e) => setTaskFeedback(e.target.value)}
                      disabled={feedbackLoading}
                      rows={4}
                    />
                    {feedbackError && <Alert variant="error">{feedbackError}</Alert>}
                    {feedbackSuccess && <Alert variant="success">Task updated successfully!</Alert>}
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSubmitFeedback}
                      disabled={feedbackLoading || !taskFeedback.trim()}
                      isLoading={feedbackLoading}
                    >
                      Submit Feedback
                    </Button>
                  </section>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
