/**
 * Task Queue Routes
 *
 * API endpoints for managing the task execution queue.
 */

import { Router } from 'express';
import { projectContext } from '../middleware/project-context.js';
import {
  loadTaskQueue,
  saveTaskQueue,
  initTaskQueue,
  getOrCreateTaskQueue,
  addTaskToQueue,
  addTasksToQueue,
  removeTaskFromQueue,
  reorderQueue,
  getNextQueuedTask,
  markTaskRunning,
  markTaskCompleted,
  markTaskFailed,
  getQueueStats,
  loadQueueWithTaskData,
  clearCompletedTasks,
  isTaskInQueue,
  getTaskQueuePosition,
  loadQueueAsPRDData,
} from '../../core/task-queue/queue-manager.js';
import {
  processTaskCompletion,
  calculatePrdProgress,
} from '../../core/task-queue/completion-chain.js';
import type { TaskQueue, QueuedTaskReference } from '../../types/index.js';
import { publishUnified } from '../sse.js';

const router = Router();

// Apply project context middleware to all routes
router.use(projectContext(true));

/**
 * Publish queue update to SSE subscribers.
 * Loads queue as PRDData and publishes tasks/updated event.
 */
async function publishQueueUpdate(projectPath: string): Promise<void> {
  try {
    const prdData = await loadQueueAsPRDData(projectPath);
    if (prdData) {
      publishUnified(projectPath, 'tasks/updated', prdData);
    }
  } catch {
    // Ignore publish errors
  }
}

/**
 * GET /api/queue
 * Get the current task queue
 */
router.get('/', async (req, res) => {
  try {
    const queue = await loadTaskQueue(req.projectPath!);
    if (!queue) {
      return res.json({ queue: null, message: 'Queue not initialized' });
    }
    res.json({ queue });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load queue',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/queue/with-tasks
 * Get the queue with full task data attached
 */
router.get('/with-tasks', async (req, res) => {
  try {
    const queueWithTasks = await loadQueueWithTaskData(req.projectPath!);
    res.json({ queue: queueWithTasks });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load queue with tasks',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/queue/stats
 * Get queue statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await getQueueStats(req.projectPath!);
    res.json({ stats });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get queue stats',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/queue/next
 * Get the next queued task
 */
router.get('/next', async (req, res) => {
  try {
    const next = await getNextQueuedTask(req.projectPath!);
    res.json({ next });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get next task',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/queue/init
 * Initialize the task queue
 */
router.post('/init', async (req, res) => {
  try {
    const { projectName, branchName, language } = req.body;

    if (!projectName || !branchName || !language) {
      return res.status(400).json({
        error: 'Missing required fields: projectName, branchName, language',
      });
    }

    const queue = await initTaskQueue(req.projectPath!, {
      projectName,
      branchName,
      language,
    });

    res.json({ queue, message: 'Queue initialized' });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to initialize queue',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/queue/add
 * Add a task to the queue
 */
router.post('/add', async (req, res) => {
  try {
    const { specId, taskId } = req.body;

    if (!specId || !taskId) {
      return res.status(400).json({
        error: 'Missing required fields: specId, taskId',
      });
    }

    // Ensure queue exists
    const config = await req.project!.loadConfig();
    await getOrCreateTaskQueue(req.projectPath!, {
      projectName: config?.name || 'Unknown',
      branchName: config?.branchName || 'ralph/feature',
      language: config?.language || 'nodejs',
    });

    const ref = await addTaskToQueue(req.projectPath!, specId, taskId);

    if (!ref) {
      return res.json({ added: false, message: 'Task already in queue' });
    }

    // Publish queue update to SSE subscribers
    await publishQueueUpdate(req.projectPath!);

    res.json({ added: true, ref });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to add task to queue',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/queue/add-many
 * Add multiple tasks to the queue
 */
router.post('/add-many', async (req, res) => {
  try {
    const { tasks } = req.body;

    if (!Array.isArray(tasks)) {
      return res.status(400).json({
        error: 'tasks must be an array of { specId, taskId }',
      });
    }

    // Ensure queue exists
    const config = await req.project!.loadConfig();
    await getOrCreateTaskQueue(req.projectPath!, {
      projectName: config?.name || 'Unknown',
      branchName: config?.branchName || 'ralph/feature',
      language: config?.language || 'nodejs',
    });

    const addedCount = await addTasksToQueue(req.projectPath!, tasks);

    // Publish queue update to SSE subscribers
    if (addedCount > 0) {
      await publishQueueUpdate(req.projectPath!);
    }

    res.json({ addedCount, totalTasks: tasks.length });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to add tasks to queue',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/queue/quick-start
 * Quick Start: Queue all user stories from a PRD as tasks
 * Used to execute user stories directly without creating a tech spec
 */
router.post('/quick-start', async (req, res) => {
  try {
    const { specId } = req.body;

    if (!specId) {
      return res.status(400).json({
        error: 'Missing required field: specId',
      });
    }

    // Load the decompose state to get user stories
    const { promises: fs } = await import('fs');
    const { join } = await import('path');

    const specDir = join(req.projectPath!, '.speki', 'specs', specId);
    const decomposeStatePath = join(specDir, 'decompose_state.json');

    let decomposeState;
    try {
      const content = await fs.readFile(decomposeStatePath, 'utf-8');
      decomposeState = JSON.parse(content);
    } catch {
      return res.status(404).json({
        error: `No decompose state found for spec: ${specId}. Generate user stories first.`,
      });
    }

    const userStories = decomposeState.userStories || [];
    if (userStories.length === 0) {
      return res.status(400).json({
        error: 'No user stories found to queue',
      });
    }

    // Ensure queue exists
    const config = await req.project!.loadConfig();
    await getOrCreateTaskQueue(req.projectPath!, {
      projectName: config?.name || decomposeState.projectName || 'Unknown',
      branchName: config?.branchName || decomposeState.branchName || 'ralph/feature',
      language: config?.language || decomposeState.language || 'nodejs',
    });

    // Create task references from user stories
    const tasks = userStories
      .filter((story: { passes?: boolean }) => !story.passes) // Skip completed stories
      .map((story: { id: string }) => ({
        specId,
        taskId: story.id,
      }));

    const addedCount = await addTasksToQueue(req.projectPath!, tasks);

    // Publish queue update to SSE subscribers
    if (addedCount > 0) {
      await publishQueueUpdate(req.projectPath!);
    }

    res.json({
      success: true,
      addedCount,
      totalStories: userStories.length,
      queuedStories: tasks.length,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to quick start',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/queue/:specId/:taskId
 * Remove a task from the queue
 */
router.delete('/:specId/:taskId', async (req, res) => {
  try {
    const { specId, taskId } = req.params;

    const removed = await removeTaskFromQueue(req.projectPath!, specId, taskId);

    // Publish queue update to SSE subscribers
    if (removed) {
      await publishQueueUpdate(req.projectPath!);
    }

    res.json({ removed });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to remove task from queue',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/queue/reorder
 * Reorder the queue
 */
router.put('/reorder', async (req, res) => {
  try {
    const { order } = req.body;

    if (!Array.isArray(order)) {
      return res.status(400).json({
        error: 'order must be an array of { specId, taskId }',
      });
    }

    await reorderQueue(req.projectPath!, order);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to reorder queue',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/queue/:specId/:taskId/running
 * Mark a task as running
 */
router.post('/:specId/:taskId/running', async (req, res) => {
  try {
    const { specId, taskId } = req.params;

    await markTaskRunning(req.projectPath!, specId, taskId);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to mark task as running',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/queue/:specId/:taskId/completed
 * Mark a task as completed and process completion chain
 */
router.post('/:specId/:taskId/completed', async (req, res) => {
  try {
    const { specId, taskId } = req.params;

    // Mark in queue
    await markTaskCompleted(req.projectPath!, specId, taskId);

    // Process completion chain
    const chainResult = await processTaskCompletion(
      req.projectPath!,
      specId,
      taskId
    );

    res.json({
      success: true,
      completionChain: chainResult,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to mark task as completed',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/queue/:specId/:taskId/failed
 * Mark a task as failed
 */
router.post('/:specId/:taskId/failed', async (req, res) => {
  try {
    const { specId, taskId } = req.params;

    await markTaskFailed(req.projectPath!, specId, taskId);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to mark task as failed',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/queue/clear-completed
 * Remove all completed/failed/skipped tasks from queue
 */
router.post('/clear-completed', async (req, res) => {
  try {
    const removedCount = await clearCompletedTasks(req.projectPath!);

    res.json({ removedCount });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to clear completed tasks',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/queue/check/:specId/:taskId
 * Check if a task is in the queue and get its position
 */
router.get('/check/:specId/:taskId', async (req, res) => {
  try {
    const { specId, taskId } = req.params;

    const inQueue = await isTaskInQueue(req.projectPath!, specId, taskId);
    const position = inQueue
      ? await getTaskQueuePosition(req.projectPath!, specId, taskId)
      : null;

    res.json({ inQueue, position });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to check task in queue',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/queue/prd-progress/:specId
 * Get progress for a PRD based on linked tech specs
 */
router.get('/prd-progress/:specId', async (req, res) => {
  try {
    const { specId } = req.params;

    const progress = await calculatePrdProgress(req.projectPath!, specId);

    res.json({ progress });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to calculate PRD progress',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
