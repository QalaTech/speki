import { useState, useEffect, useCallback } from 'react';
import type { QueuedTaskReference, QueueStats, UserStory } from '../../types';
import './QueueView.css';

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
        fetch(apiUrl('/api/queue/with-tasks')),
        fetch(apiUrl('/api/queue/stats')),
      ]);

      if (queueRes.ok) {
        const data = await queueRes.json();
        setQueue(data.queue || []);
        setBranchName(data.branchName || '');
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

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
      const res = await fetch(apiUrl(`/api/queue/${specId}/${taskId}`), {
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
      const res = await fetch(apiUrl('/api/ralph/start'), {
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
      const res = await fetch(apiUrl('/api/ralph/stop'), {
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
      const res = await fetch(apiUrl('/api/queue/clear-completed'), {
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
      <div className="queue-view">
        <div className="queue-loading">Loading queue...</div>
      </div>
    );
  }

  return (
    <div className="queue-view">
      {/* Header */}
      <div className="queue-header">
        <div className="queue-header-info">
          <h2 className="queue-title">Task Queue</h2>
          {branchName && (
            <span className="queue-branch">
              <span className="queue-branch-icon">⑂</span>
              {branchName}
            </span>
          )}
        </div>

        <div className="queue-header-actions">
          {isRunning ? (
            <button
              className="queue-btn queue-btn--stop"
              onClick={handleStop}
            >
              ⏹ Stop
            </button>
          ) : (
            <button
              className="queue-btn queue-btn--run"
              onClick={handleRun}
              disabled={runLoading || pendingTasks.length === 0}
            >
              {runLoading ? '⏳ Starting...' : '▶ Run Queue'}
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="queue-stats">
          <span className="queue-stat queue-stat--total">{stats.total} total</span>
          <span className="queue-stat queue-stat--queued">{stats.queued} queued</span>
          <span className="queue-stat queue-stat--running">{stats.running} running</span>
          <span className="queue-stat queue-stat--completed">{stats.completed} done</span>
          {stats.failed > 0 && (
            <span className="queue-stat queue-stat--failed">{stats.failed} failed</span>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="queue-error">
          <span className="queue-error-icon">⚠</span>
          <span className="queue-error-message">{error}</span>
          <button className="queue-error-dismiss" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Running section */}
      {runningTasks.length > 0 && (
        <div className="queue-section">
          <h3 className="queue-section-title">
            <span className="queue-section-icon">▶</span>
            Currently Running
          </h3>
          <div className="queue-list">
            {runningTasks.map(item => (
              <div key={`${item.specId}-${item.taskId}`} className="queue-item queue-item--running">
                <span className="queue-item-status">{getStatusIcon(item.status)}</span>
                <div className="queue-item-info">
                  <span className="queue-item-task">{item.taskId}</span>
                  <span className="queue-item-spec" onClick={() => onNavigateToSpec?.(item.specId)}>
                    {item.specId}
                  </span>
                </div>
                {item.task && (
                  <span className="queue-item-title">{item.task.title}</span>
                )}
                <span className="queue-item-time">
                  Started {formatTime(item.startedAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Queued section */}
      <div className="queue-section">
        <h3 className="queue-section-title">
          <span className="queue-section-icon">⏳</span>
          Queued ({pendingTasks.length})
        </h3>
        {pendingTasks.length === 0 ? (
          <div className="queue-empty">
            No tasks in queue. Add tasks from the Decompose tab.
          </div>
        ) : (
          <div className="queue-list">
            {pendingTasks.map((item, idx) => (
              <div key={`${item.specId}-${item.taskId}`} className="queue-item">
                <span className="queue-item-position">#{idx + 1}</span>
                <span className="queue-item-status">{getStatusIcon(item.status)}</span>
                <div className="queue-item-info">
                  <span className="queue-item-task">{item.taskId}</span>
                  <span className="queue-item-spec" onClick={() => onNavigateToSpec?.(item.specId)}>
                    {item.specId}
                  </span>
                </div>
                {item.task && (
                  <span className="queue-item-title">{item.task.title}</span>
                )}
                <button
                  className="queue-item-remove"
                  onClick={() => handleRemove(item.specId, item.taskId)}
                  title="Remove from queue"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed section */}
      {completedTasks.length > 0 && (
        <div className="queue-section queue-section--completed">
          <div className="queue-section-header">
            <h3 className="queue-section-title">
              <span className="queue-section-icon">✓</span>
              Completed ({completedTasks.length})
            </h3>
            <div className="queue-section-actions">
              <button
                className="queue-section-toggle"
                onClick={() => setShowCompleted(!showCompleted)}
              >
                {showCompleted ? 'Hide' : 'Show'}
              </button>
              <button
                className="queue-section-clear"
                onClick={handleClearCompleted}
              >
                Clear
              </button>
            </div>
          </div>
          {showCompleted && (
            <div className="queue-list queue-list--completed">
              {completedTasks.map(item => (
                <div
                  key={`${item.specId}-${item.taskId}`}
                  className={`queue-item queue-item--${item.status}`}
                >
                  <span className="queue-item-status">{getStatusIcon(item.status)}</span>
                  <div className="queue-item-info">
                    <span className="queue-item-task">{item.taskId}</span>
                    <span className="queue-item-spec" onClick={() => onNavigateToSpec?.(item.specId)}>
                      {item.specId}
                    </span>
                  </div>
                  {item.task && (
                    <span className="queue-item-title">{item.task.title}</span>
                  )}
                  <span className="queue-item-time">
                    {formatTime(item.completedAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
