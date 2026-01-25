/**
 * Task Queue Manager
 *
 * Manages the central task queue stored in .speki/task-queue.json.
 * The queue contains references to tasks in spec decompose_state files,
 * not duplicate task data.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  TaskQueue,
  QueuedTaskReference,
  QueuedTaskStatus,
  QueueStats,
  UserStory,
  PRDData,
} from '../../types/index.js';
import { loadPRDForSpec } from '../spec-review/spec-metadata.js';

const QUEUE_FILENAME = 'task-queue.json';

/**
 * Get the path to the task queue file.
 */
export function getQueuePath(projectRoot: string): string {
  return path.join(projectRoot, '.speki', QUEUE_FILENAME);
}

/**
 * Load the task queue from disk.
 * Returns null if the queue doesn't exist.
 */
export async function loadTaskQueue(
  projectRoot: string
): Promise<TaskQueue | null> {
  const queuePath = getQueuePath(projectRoot);

  try {
    const content = await fs.readFile(queuePath, 'utf-8');
    return JSON.parse(content) as TaskQueue;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Save the task queue to disk.
 */
export async function saveTaskQueue(
  projectRoot: string,
  queue: TaskQueue
): Promise<void> {
  const queuePath = getQueuePath(projectRoot);

  // Update the timestamp
  queue.updatedAt = new Date().toISOString();

  await fs.writeFile(queuePath, JSON.stringify(queue, null, 2), 'utf-8');
}

/**
 * Initialize a new empty task queue.
 */
export async function initTaskQueue(
  projectRoot: string,
  config: { projectName: string; branchName: string; language: string }
): Promise<TaskQueue> {
  const now = new Date().toISOString();

  const queue: TaskQueue = {
    version: 1,
    projectName: config.projectName,
    branchName: config.branchName,
    language: config.language,
    queue: [],
    createdAt: now,
    updatedAt: now,
  };

  await saveTaskQueue(projectRoot, queue);
  return queue;
}

/**
 * Get or create the task queue.
 */
export async function getOrCreateTaskQueue(
  projectRoot: string,
  config: { projectName: string; branchName: string; language: string }
): Promise<TaskQueue> {
  const existing = await loadTaskQueue(projectRoot);
  if (existing) {
    return existing;
  }
  return initTaskQueue(projectRoot, config);
}

/**
 * Add a task to the queue.
 * Returns the created reference, or null if task is already queued.
 */
export async function addTaskToQueue(
  projectRoot: string,
  specId: string,
  taskId: string
): Promise<QueuedTaskReference | null> {
  const queue = await loadTaskQueue(projectRoot);
  if (!queue) {
    throw new Error('Task queue not initialized. Call initTaskQueue first.');
  }

  // Check if task is already in queue
  const existing = queue.queue.find(
    (ref) => ref.specId === specId && ref.taskId === taskId
  );
  if (existing) {
    return null; // Already in queue
  }

  const ref: QueuedTaskReference = {
    specId,
    taskId,
    queuedAt: new Date().toISOString(),
    status: 'queued',
  };

  queue.queue.push(ref);
  await saveTaskQueue(projectRoot, queue);

  return ref;
}

/**
 * Add multiple tasks to the queue at once.
 * Returns the number of tasks actually added (skips duplicates).
 */
export async function addTasksToQueue(
  projectRoot: string,
  tasks: Array<{ specId: string; taskId: string }>
): Promise<number> {
  const queue = await loadTaskQueue(projectRoot);
  if (!queue) {
    throw new Error('Task queue not initialized. Call initTaskQueue first.');
  }

  let added = 0;
  const now = new Date().toISOString();

  for (const { specId, taskId } of tasks) {
    const existing = queue.queue.find(
      (ref) => ref.specId === specId && ref.taskId === taskId
    );
    if (!existing) {
      queue.queue.push({
        specId,
        taskId,
        queuedAt: now,
        status: 'queued',
      });
      added++;
    }
  }

  if (added > 0) {
    await saveTaskQueue(projectRoot, queue);
  }

  return added;
}

/**
 * Remove a task from the queue.
 * Returns true if removed, false if not found.
 */
export async function removeTaskFromQueue(
  projectRoot: string,
  specId: string,
  taskId: string
): Promise<boolean> {
  const queue = await loadTaskQueue(projectRoot);
  if (!queue) {
    return false;
  }

  const index = queue.queue.findIndex(
    (ref) => ref.specId === specId && ref.taskId === taskId
  );
  if (index === -1) {
    return false;
  }

  queue.queue.splice(index, 1);
  await saveTaskQueue(projectRoot, queue);

  return true;
}

/**
 * Reorder the queue.
 * Takes an array of {specId, taskId} in the new order.
 * Only reorders existing items; ignores items not in the queue.
 */
export async function reorderQueue(
  projectRoot: string,
  newOrder: Array<{ specId: string; taskId: string }>
): Promise<void> {
  const queue = await loadTaskQueue(projectRoot);
  if (!queue) {
    throw new Error('Task queue not initialized.');
  }

  // Build a map of existing refs
  const refMap = new Map<string, QueuedTaskReference>();
  for (const ref of queue.queue) {
    refMap.set(`${ref.specId}:${ref.taskId}`, ref);
  }

  // Reorder based on newOrder
  const reordered: QueuedTaskReference[] = [];
  const seen = new Set<string>();

  for (const { specId, taskId } of newOrder) {
    const key = `${specId}:${taskId}`;
    const ref = refMap.get(key);
    if (ref && !seen.has(key)) {
      reordered.push(ref);
      seen.add(key);
    }
  }

  // Append any refs not in newOrder (preserve them at end)
  for (const ref of queue.queue) {
    const key = `${ref.specId}:${ref.taskId}`;
    if (!seen.has(key)) {
      reordered.push(ref);
    }
  }

  queue.queue = reordered;
  await saveTaskQueue(projectRoot, queue);
}

/**
 * Get the next task that's ready to execute.
 * Returns the first task with status 'queued'.
 */
export async function getNextQueuedTask(
  projectRoot: string
): Promise<QueuedTaskReference | null> {
  const queue = await loadTaskQueue(projectRoot);
  if (!queue) {
    return null;
  }

  return queue.queue.find((ref) => ref.status === 'queued') || null;
}

/**
 * Mark a task as running.
 */
export async function markTaskRunning(
  projectRoot: string,
  specId: string,
  taskId: string
): Promise<void> {
  await updateTaskStatus(projectRoot, specId, taskId, 'running', {
    startedAt: new Date().toISOString(),
  });
}

/**
 * Mark a task as completed.
 */
export async function markTaskCompleted(
  projectRoot: string,
  specId: string,
  taskId: string
): Promise<void> {
  await updateTaskStatus(projectRoot, specId, taskId, 'completed', {
    completedAt: new Date().toISOString(),
  });
}

/**
 * Mark a task as failed.
 */
export async function markTaskFailed(
  projectRoot: string,
  specId: string,
  taskId: string
): Promise<void> {
  await updateTaskStatus(projectRoot, specId, taskId, 'failed', {
    completedAt: new Date().toISOString(),
  });
}

/**
 * Mark a task as skipped.
 */
export async function markTaskSkipped(
  projectRoot: string,
  specId: string,
  taskId: string
): Promise<void> {
  await updateTaskStatus(projectRoot, specId, taskId, 'skipped', {
    completedAt: new Date().toISOString(),
  });
}

/**
 * Update a task's status in the queue.
 */
async function updateTaskStatus(
  projectRoot: string,
  specId: string,
  taskId: string,
  status: QueuedTaskStatus,
  additionalFields?: Partial<QueuedTaskReference>
): Promise<void> {
  const queue = await loadTaskQueue(projectRoot);
  if (!queue) {
    throw new Error('Task queue not initialized.');
  }

  const ref = queue.queue.find(
    (r) => r.specId === specId && r.taskId === taskId
  );
  if (!ref) {
    throw new Error(`Task ${specId}:${taskId} not found in queue.`);
  }

  ref.status = status;
  if (additionalFields) {
    Object.assign(ref, additionalFields);
  }

  await saveTaskQueue(projectRoot, queue);
}

/**
 * Get queue statistics.
 */
export async function getQueueStats(projectRoot: string): Promise<QueueStats> {
  const queue = await loadTaskQueue(projectRoot);

  if (!queue) {
    return {
      total: 0,
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
    };
  }

  const stats: QueueStats = {
    total: queue.queue.length,
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
  };

  for (const ref of queue.queue) {
    switch (ref.status) {
      case 'queued':
        stats.queued++;
        break;
      case 'running':
        stats.running++;
        break;
      case 'completed':
        stats.completed++;
        break;
      case 'failed':
        stats.failed++;
        break;
      case 'skipped':
        stats.skipped++;
        break;
    }
  }

  return stats;
}

/**
 * Load the actual task data from a spec's decompose_state.
 */
export async function loadTaskFromSpec(
  projectRoot: string,
  specId: string,
  taskId: string
): Promise<UserStory | null> {
  const prd = await loadPRDForSpec(projectRoot, specId);
  if (!prd) {
    return null;
  }

  return prd.userStories.find((story) => story.id === taskId) || null;
}

/**
 * Load all tasks for a queue reference with their full data.
 */
export async function loadQueueWithTaskData(
  projectRoot: string
): Promise<Array<QueuedTaskReference & { task?: UserStory }>> {
  const queue = await loadTaskQueue(projectRoot);
  if (!queue) {
    return [];
  }

  // Group refs by specId to minimize file reads
  const refsBySpec = new Map<string, QueuedTaskReference[]>();
  for (const ref of queue.queue) {
    const refs = refsBySpec.get(ref.specId) || [];
    refs.push(ref);
    refsBySpec.set(ref.specId, refs);
  }

  // Load PRD data for each spec and attach task data
  const result: Array<QueuedTaskReference & { task?: UserStory }> = [];
  const prdCache = new Map<string, PRDData | null>();

  for (const ref of queue.queue) {
    // Load PRD if not cached
    if (!prdCache.has(ref.specId)) {
      const prd = await loadPRDForSpec(projectRoot, ref.specId);
      prdCache.set(ref.specId, prd);
    }

    const prd = prdCache.get(ref.specId);
    const task = prd?.userStories.find((s) => s.id === ref.taskId);

    result.push({
      ...ref,
      task,
    });
  }

  return result;
}

/**
 * Clear all completed/failed/skipped tasks from the queue.
 * Returns the number of tasks removed.
 */
export async function clearCompletedTasks(projectRoot: string): Promise<number> {
  const queue = await loadTaskQueue(projectRoot);
  if (!queue) {
    return 0;
  }

  const originalLength = queue.queue.length;
  queue.queue = queue.queue.filter((ref) => ref.status === 'queued' || ref.status === 'running');
  const removed = originalLength - queue.queue.length;

  if (removed > 0) {
    await saveTaskQueue(projectRoot, queue);
  }

  return removed;
}

/**
 * Check if a task is currently in the queue.
 */
export async function isTaskInQueue(
  projectRoot: string,
  specId: string,
  taskId: string
): Promise<boolean> {
  const queue = await loadTaskQueue(projectRoot);
  if (!queue) {
    return false;
  }

  return queue.queue.some(
    (ref) => ref.specId === specId && ref.taskId === taskId
  );
}

/**
 * Get the queue position of a task (1-indexed).
 * Returns null if task is not in queue.
 */
export async function getTaskQueuePosition(
  projectRoot: string,
  specId: string,
  taskId: string
): Promise<number | null> {
  const queue = await loadTaskQueue(projectRoot);
  if (!queue) {
    return null;
  }

  const index = queue.queue.findIndex(
    (ref) => ref.specId === specId && ref.taskId === taskId
  );

  return index === -1 ? null : index + 1;
}

/**
 * Load queued tasks as PRDData format for the execution page.
 * This converts task-queue.json references to full UserStory objects.
 */
export async function loadQueueAsPRDData(
  projectRoot: string
): Promise<PRDData | null> {
  const queueWithTasks = await loadQueueWithTaskData(projectRoot);

  if (queueWithTasks.length === 0) {
    return null;
  }

  // Convert queue refs with task data to UserStory array
  // Mark task status based on queue status
  const userStories: UserStory[] = queueWithTasks
    .filter(ref => ref.task) // Only include refs with resolved task data
    .map(ref => {
      const task = ref.task!;
      // Map queue status to task.passes for KanbanView column placement
      // - queued/running → not passed (todo/running columns)
      // - completed → passed (done column)
      return {
        ...task,
        passes: ref.status === 'completed',
        // Add queue metadata for display
        queueStatus: ref.status,
        queuedAt: ref.queuedAt,
      };
    });

  // Load queue metadata for project info
  const queue = await loadTaskQueue(projectRoot);

  return {
    projectName: queue?.projectName || path.basename(projectRoot),
    branchName: queue?.branchName || '',
    language: queue?.language || '',
    standardsFile: '',
    description: '',
    userStories,
  };
}
