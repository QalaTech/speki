import { useState, useCallback } from 'react';
import { apiFetch } from '../../../components/ui/ErrorContext';
import type { QueuedTaskReference } from '../../../types';

interface UseQueueManagementOptions {
  specId: string;
  projectPath: string;
}

interface UseQueueManagementReturn {
  queueTasks: QueuedTaskReference[];
  setQueueTasks: React.Dispatch<React.SetStateAction<QueuedTaskReference[]>>;
  queueLoading: Set<string>;
  completedIds: Set<string>;
  setCompletedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  loadQueueTasks: () => Promise<void>;
  addToQueue: (taskId: string) => Promise<void>;
  removeFromQueue: (taskId: string) => Promise<void>;
  isTaskQueued: (taskId: string) => boolean;
  getQueuePosition: (taskId: string) => number | null;
  getQueuedTaskStatus: (taskId: string) => QueuedTaskReference['status'];
}

/**
 * Hook to manage task queue operations
 */
export function useQueueManagement({ specId, projectPath }: UseQueueManagementOptions): UseQueueManagementReturn {
  const [queueTasks, setQueueTasks] = useState<QueuedTaskReference[]>([]);
  const [queueLoading, setQueueLoading] = useState<Set<string>>(new Set());
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  const loadQueueTasks = useCallback(async () => {
    if (!specId) return;
    try {
      const params = new URLSearchParams({ project: projectPath });
      const res = await apiFetch(`/api/queue/with-tasks?${params}`);
      if (res.ok) {
        const data = await res.json();
        const allTasks: QueuedTaskReference[] = data.queue || [];
        const specTasks = allTasks.filter((t: QueuedTaskReference) => t.specId === specId);
        setQueueTasks(specTasks);

        const completed = new Set<string>(
          specTasks
            .filter((t: QueuedTaskReference) => t.status === 'completed')
            .map((t: QueuedTaskReference) => t.taskId)
        );
        setCompletedIds(completed);
      }
    } catch (err) {
      console.error('Failed to load queue tasks:', err);
    }
  }, [specId, projectPath]);

  const addToQueue = useCallback(async (taskId: string) => {
    if (!specId) return;
    setQueueLoading(prev => new Set(prev).add(taskId));
    try {
      const params = new URLSearchParams({ project: projectPath });
      await apiFetch(`/api/queue/add?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specId, taskId }),
      });
      await loadQueueTasks();
    } finally {
      setQueueLoading(prev => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  }, [specId, projectPath, loadQueueTasks]);

  const removeFromQueue = useCallback(async (taskId: string) => {
    if (!specId) return;
    setQueueLoading(prev => new Set(prev).add(taskId));
    try {
      const params = new URLSearchParams({ project: projectPath });
      await apiFetch(`/api/queue/${specId}/${taskId}?${params}`, { method: 'DELETE' });
      await loadQueueTasks();
    } finally {
      setQueueLoading(prev => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  }, [specId, projectPath, loadQueueTasks]);

  const isTaskQueued = useCallback((taskId: string) => {
    return queueTasks.some(t => t.taskId === taskId);
  }, [queueTasks]);

  const getQueuePosition = useCallback((taskId: string) => {
    const pending = queueTasks.filter(t => t.status === 'queued' || t.status === 'running');
    const idx = pending.findIndex(t => t.taskId === taskId);
    return idx >= 0 ? idx + 1 : null;
  }, [queueTasks]);

  const getQueuedTaskStatus = useCallback((taskId: string): QueuedTaskReference['status'] => {
    return queueTasks.find(t => t.taskId === taskId)?.status || 'queued';
  }, [queueTasks]);

  return {
    queueTasks,
    setQueueTasks,
    queueLoading,
    completedIds,
    setCompletedIds,
    loadQueueTasks,
    addToQueue,
    removeFromQueue,
    isTaskQueued,
    getQueuePosition,
    getQueuedTaskStatus,
  };
}
