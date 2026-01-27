import { useState, useEffect, useCallback } from 'react';
import type { QueuedTaskReference, QueueStats, UserStory } from '../../types';
import { Button } from '../ui/Button';
import { Badge, Alert, Loading, apiFetch } from '../ui';

interface QueuedTaskWithData extends QueuedTaskReference {
  task?: UserStory;
}

interface QueueViewProps {
  projectPath: string;
  onNavigateToSpec?: (specId: string) => void;
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'queued': return '⏳';
    case 'running': return '▶';
    case 'completed': return '✓';
    case 'failed': return '✕';
    case 'skipped': return '⏭';
    default: return '○';
  }
}

function formatTime(isoString?: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}


export function QueueView({ projectPath, onNavigateToSpec }: QueueViewProps) {
  const [queue, setQueue] = useState<QueuedTaskWithData[]>([]);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [branchName, setBranchName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  // API helper
  const apiUrl = useCallback((endpoint: string) => {
    const separator = endpoint.includes('?') ? '&' : '?';
    return `${endpoint}${separator}project=${encodeURIComponent(projectPath)}`;
  }, [projectPath]);

  // Fetch queue state
  const fetchQueue = useCallback(async () => {
    try {
      const [queueRes, statsRes] = await Promise.all([
        apiFetch(apiUrl('/api/queue/with-tasks')),
        apiFetch(apiUrl('/api/queue/stats')),
      ]);

      const data = await queueRes.json();
      setQueue(data.queue || []);
      setBranchName(data.branchName || '');

      const statsData = await statsRes.json();
      setStats(statsData);

      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch queue:', err);
      setError('Failed to load queue');
      setLoading(false);
    }
  }, [apiUrl]);

  // Initial fetch and polling
  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 5000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  // Remove task from queue
  const handleRemove = async (specId: string, taskId: string) => {
    try {
      const res = await apiFetch(apiUrl(`/api/queue/${specId}/${taskId}`), {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove');
      }

      await fetchQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove');
    }
  };

  // Run queue
  const handleRun = async () => {
    setRunLoading(true);
    setError(null);

    try {
      const res = await apiFetch(apiUrl('/api/ralph/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ iterations: 25 }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to start');
      }

      await fetchQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start');
    } finally {
      setRunLoading(false);
    }
  };

  // Stop queue
  const handleStop = async () => {
    try {
      const res = await apiFetch(apiUrl('/api/ralph/stop'), {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to stop');
      }

      await fetchQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop');
    }
  };

  // Clear completed
  const handleClearCompleted = async () => {
    try {
      const res = await apiFetch(apiUrl('/api/queue/clear-completed'), {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to clear');
      }

      await fetchQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear');
    }
  };

  // Separate queue items
  const runningTasks = queue.filter(t => t.status === 'running');
  const pendingTasks = queue.filter(t => t.status === 'queued');
  const completedTasks = queue.filter(t => ['completed', 'failed', 'skipped'].includes(t.status));

  const isRunning = runningTasks.length > 0;

  if (loading) {
    return (
      <div className="h-full overflow-y-auto p-6">
        <div className="flex items-center justify-center h-[200px]">
          <Loading size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-4">
          <h2 className="m-0 text-xl font-semibold">Task Queue</h2>
          {branchName && (
            <Badge variant="ghost" size="sm" className="font-mono gap-1">
              <span>⑂</span>
              {branchName}
            </Badge>
          )}
        </div>

        <div className="flex gap-2">
          {isRunning ? (
            <Button variant="destructive" onClick={handleStop} size="sm">
              Stop
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleRun}
              disabled={runLoading || pendingTasks.length === 0}
              size="sm"
              isLoading={runLoading}
            >
              Run Queue
            </Button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="flex gap-4 p-3 bg-muted border border-border rounded-lg mb-5">
          <Badge variant="neutral" size="sm">{stats.total} total</Badge>
          <Badge variant="ghost" size="sm">{stats.queued} queued</Badge>
          <Badge variant="primary" size="sm">{stats.running} running</Badge>
          <Badge variant="success" size="sm">{stats.completed} done</Badge>
          {stats.failed > 0 && (
            <Badge variant="error" size="sm">{stats.failed} failed</Badge>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-5">
          <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>
        </div>
      )}

      {/* Running section */}
      {runningTasks.length > 0 && (
        <div className="mb-6">
          <h3 className="flex items-center gap-2 m-0 mb-3 text-sm font-semibold uppercase tracking-wide">
            <span className="text-xs">▶</span>
            Currently Running
          </h3>
          <div className="flex flex-col gap-2">
            {runningTasks.map(item => (
              <div key={`${item.specId}-${item.taskId}`} className="rounded-xl bg-muted border border-border border-l-4 border-l-success">
                <div className="p-3 flex flex-row items-center gap-3">
                  <span className="text-sm">{getStatusIcon(item.status)}</span>
                  <div className="flex flex-col gap-0.5 min-w-[120px]">
                    <span className="font-mono text-xs font-semibold">{item.taskId}</span>
                    <button className="text-xs text-primary text-left hover:underline" onClick={() => onNavigateToSpec?.(item.specId)}>
                      {item.specId}
                    </button>
                  </div>
                  {item.task && (
                    <span className="flex-1 text-sm truncate">{item.task.title}</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    Started {formatTime(item.startedAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Queued section */}
      <div className="mb-6">
        <h3 className="flex items-center gap-2 m-0 mb-3 text-sm font-semibold uppercase tracking-wide">
          <span className="text-xs">⏳</span>
          Queued ({pendingTasks.length})
        </h3>
        {pendingTasks.length === 0 ? (
          <div className="py-10 px-5 text-center text-muted-foreground text-sm bg-muted border border-dashed border-border rounded-lg">
            No tasks in queue. Add tasks from the Decompose tab.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {pendingTasks.map((item, idx) => (
              <div key={`${item.specId}-${item.taskId}`} className="rounded-xl bg-muted border border-border">
                <div className="p-3 flex flex-row items-center gap-3">
                  <span className="font-mono text-xs font-semibold text-muted-foreground min-w-[24px]">#{idx + 1}</span>
                  <span className="text-sm">{getStatusIcon(item.status)}</span>
                  <div className="flex flex-col gap-0.5 min-w-[120px]">
                    <span className="font-mono text-xs font-semibold">{item.taskId}</span>
                    <button className="text-xs text-primary text-left hover:underline" onClick={() => onNavigateToSpec?.(item.specId)}>
                      {item.specId}
                    </button>
                  </div>
                  {item.task && (
                    <span className="flex-1 text-sm truncate">{item.task.title}</span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 rounded-full"
                    onClick={() => handleRemove(item.specId, item.taskId)}
                    title="Remove from queue"
                  >
                    ✕
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed section */}
      {completedTasks.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 m-0 mb-3 text-sm font-semibold uppercase tracking-wide">
              <span className="text-xs">✓</span>
              Completed ({completedTasks.length})
            </h3>
            <div className="flex gap-2 mb-3">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowCompleted(!showCompleted)}
              >
                {showCompleted ? 'Hide' : 'Show'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={handleClearCompleted}
              >
                Clear
              </Button>
            </div>
          </div>
          {showCompleted && (
            <div className="flex flex-col gap-2 opacity-80">
              {completedTasks.map(item => (
                <div
                  key={`${item.specId}-${item.taskId}`}
                  className={`rounded-xl bg-muted border border-border border-l-4 ${item.status === 'completed' ? 'border-l-success' : item.status === 'failed' ? 'border-l-error' : 'border-l-muted-foreground/30'}`}
                >
                  <div className="p-3 flex flex-row items-center gap-3">
                    <span className="text-sm">{getStatusIcon(item.status)}</span>
                    <div className="flex flex-col gap-0.5 min-w-[120px]">
                      <span className="font-mono text-xs font-semibold">{item.taskId}</span>
                      <button className="text-xs text-primary text-left hover:underline" onClick={() => onNavigateToSpec?.(item.specId)}>
                        {item.specId}
                      </button>
                    </div>
                    {item.task && (
                      <span className="flex-1 text-sm truncate">{item.task.title}</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatTime(item.completedAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
