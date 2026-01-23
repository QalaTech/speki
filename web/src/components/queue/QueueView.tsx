import { useState, useEffect, useCallback } from 'react';
import type { QueuedTaskReference, QueueStats, UserStory } from '../../types';

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

  // Tailwind class helpers
  const btnBase = "inline-flex items-center gap-1.5 py-2.5 px-[18px] border-none rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed";
  const statColors: Record<string, string> = {
    total: 'text-text',
    queued: 'text-[#a371f7]',
    running: 'text-[#58a6ff]',
    completed: 'text-[#3fb950]',
    failed: 'text-[#f85149]',
  };

  const getItemClasses = (status: string) => {
    const base = "flex items-center gap-3 py-3 px-4 bg-surface border border-border rounded-lg transition-all duration-150 hover:border-text-muted";
    switch (status) {
      case 'running': return `${base} border-l-[3px] border-l-[#3fb950] bg-[rgba(35,134,54,0.05)]`;
      case 'completed': return `${base} border-l-[3px] border-l-[#3fb950]`;
      case 'failed': return `${base} border-l-[3px] border-l-[#f85149]`;
      case 'skipped': return `${base} border-l-[3px] border-l-[#8b949e] opacity-70`;
      default: return base;
    }
  };

  if (loading) {
    return (
      <div className="h-full overflow-y-auto p-6 bg-bg queue-scrollbar">
        <div className="flex items-center justify-center h-[200px] text-text-muted text-sm">Loading queue...</div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .queue-scrollbar::-webkit-scrollbar { width: 8px; }
        .queue-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .queue-scrollbar::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 4px; }
        .queue-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--color-text-muted); }
      `}</style>
      <div className="h-full overflow-y-auto p-6 bg-bg queue-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-4">
            <h2 className="m-0 text-xl font-semibold text-text">Task Queue</h2>
            {branchName && (
              <span className="inline-flex items-center gap-1.5 py-1 px-2.5 bg-surface border border-border rounded-md font-mono text-xs text-text-muted">
                <span className="text-sm">⑂</span>
                {branchName}
              </span>
            )}
          </div>

          <div className="flex gap-2">
            {isRunning ? (
              <button
                className={`${btnBase} bg-[rgba(218,54,51,0.15)] text-[#f85149] border border-[rgba(218,54,51,0.3)] hover:bg-[rgba(218,54,51,0.25)]`}
                onClick={handleStop}
              >
                ⏹ Stop
              </button>
            ) : (
              <button
                className={`${btnBase} bg-gradient-to-br from-[#3fb950] to-[#238636] text-white hover:from-[#4ac660] hover:to-[#2ea043]`}
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
          <div className="flex gap-4 py-3 px-4 bg-surface border border-border rounded-lg mb-5">
            <span className={`text-[13px] font-medium ${statColors.total}`}>{stats.total} total</span>
            <span className={`text-[13px] font-medium ${statColors.queued}`}>{stats.queued} queued</span>
            <span className={`text-[13px] font-medium ${statColors.running}`}>{stats.running} running</span>
            <span className={`text-[13px] font-medium ${statColors.completed}`}>{stats.completed} done</span>
            {stats.failed > 0 && (
              <span className={`text-[13px] font-medium ${statColors.failed}`}>{stats.failed} failed</span>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2.5 py-3 px-4 bg-[rgba(218,54,51,0.1)] border border-[rgba(218,54,51,0.3)] rounded-lg mb-5">
            <span className="text-base">⚠</span>
            <span className="flex-1 text-[13px] text-[#f85149]">{error}</span>
            <button className="bg-transparent border-none text-[#f85149] text-lg cursor-pointer px-1" onClick={() => setError(null)}>×</button>
          </div>
        )}

        {/* Running section */}
        {runningTasks.length > 0 && (
          <div className="mb-6">
            <h3 className="flex items-center gap-2 m-0 mb-3 text-sm font-semibold text-text uppercase tracking-[0.03em]">
              <span className="text-xs">▶</span>
              Currently Running
            </h3>
            <div className="flex flex-col gap-2">
              {runningTasks.map(item => (
                <div key={`${item.specId}-${item.taskId}`} className={getItemClasses(item.status)}>
                  <span className="text-sm min-w-[20px] text-center">{getStatusIcon(item.status)}</span>
                  <div className="flex flex-col gap-0.5 min-w-[120px]">
                    <span className="font-mono text-xs font-semibold text-text">{item.taskId}</span>
                    <span className="text-[11px] text-accent cursor-pointer hover:underline" onClick={() => onNavigateToSpec?.(item.specId)}>
                      {item.specId}
                    </span>
                  </div>
                  {item.task && (
                    <span className="flex-1 text-[13px] text-text whitespace-nowrap overflow-hidden text-ellipsis">{item.task.title}</span>
                  )}
                  <span className="text-[11px] text-text-muted whitespace-nowrap">
                    Started {formatTime(item.startedAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Queued section */}
        <div className="mb-6">
          <h3 className="flex items-center gap-2 m-0 mb-3 text-sm font-semibold text-text uppercase tracking-[0.03em]">
            <span className="text-xs">⏳</span>
            Queued ({pendingTasks.length})
          </h3>
          {pendingTasks.length === 0 ? (
            <div className="py-10 px-5 text-center text-text-muted text-sm bg-surface border border-dashed border-border rounded-lg">
              No tasks in queue. Add tasks from the Decompose tab.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {pendingTasks.map((item, idx) => (
                <div key={`${item.specId}-${item.taskId}`} className={getItemClasses(item.status)}>
                  <span className="font-mono text-[11px] font-semibold text-text-muted min-w-[24px]">#{idx + 1}</span>
                  <span className="text-sm min-w-[20px] text-center">{getStatusIcon(item.status)}</span>
                  <div className="flex flex-col gap-0.5 min-w-[120px]">
                    <span className="font-mono text-xs font-semibold text-text">{item.taskId}</span>
                    <span className="text-[11px] text-accent cursor-pointer hover:underline" onClick={() => onNavigateToSpec?.(item.specId)}>
                      {item.specId}
                    </span>
                  </div>
                  {item.task && (
                    <span className="flex-1 text-[13px] text-text whitespace-nowrap overflow-hidden text-ellipsis">{item.task.title}</span>
                  )}
                  <button
                    className="flex items-center justify-center w-6 h-6 bg-transparent border border-border rounded text-base text-text-muted cursor-pointer transition-all duration-150 hover:bg-[rgba(218,54,51,0.1)] hover:border-[rgba(218,54,51,0.3)] hover:text-[#f85149]"
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
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 m-0 mb-3 text-sm font-semibold text-text uppercase tracking-[0.03em]">
                <span className="text-xs">✓</span>
                Completed ({completedTasks.length})
              </h3>
              <div className="flex gap-2 mb-3">
                <button
                  className="py-1 px-2.5 bg-transparent border border-border rounded text-[11px] font-medium text-text-muted cursor-pointer transition-all duration-150 hover:bg-surface-hover hover:border-text-muted hover:text-text"
                  onClick={() => setShowCompleted(!showCompleted)}
                >
                  {showCompleted ? 'Hide' : 'Show'}
                </button>
                <button
                  className="py-1 px-2.5 bg-transparent border border-border rounded text-[11px] font-medium text-text-muted cursor-pointer transition-all duration-150 hover:bg-surface-hover hover:border-text-muted hover:text-text"
                  onClick={handleClearCompleted}
                >
                  Clear
                </button>
              </div>
            </div>
            {showCompleted && (
              <div className="flex flex-col gap-2 opacity-80">
                {completedTasks.map(item => (
                  <div
                    key={`${item.specId}-${item.taskId}`}
                    className={getItemClasses(item.status)}
                  >
                    <span className="text-sm min-w-[20px] text-center">{getStatusIcon(item.status)}</span>
                    <div className="flex flex-col gap-0.5 min-w-[120px]">
                      <span className="font-mono text-xs font-semibold text-text">{item.taskId}</span>
                      <span className="text-[11px] text-accent cursor-pointer hover:underline" onClick={() => onNavigateToSpec?.(item.specId)}>
                        {item.specId}
                      </span>
                    </div>
                    {item.task && (
                      <span className="flex-1 text-[13px] text-text whitespace-nowrap overflow-hidden text-ellipsis">{item.task.title}</span>
                    )}
                    <span className="text-[11px] text-text-muted whitespace-nowrap">
                      {formatTime(item.completedAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
