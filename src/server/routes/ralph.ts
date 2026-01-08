/**
 * Ralph Control Routes
 *
 * API endpoints for controlling Ralph execution.
 */

import { Router } from 'express';
import { projectContext } from '../middleware/project-context.js';
import { Registry } from '../../core/registry.js';
import { runRalphLoop } from '../../core/ralph-loop/runner.js';
import type { RalphStatus } from '../../types/index.js';

const router = Router();

// Track running Ralph loops by project path (using AbortController for cancellation)
const runningLoops = new Map<string, { abort: () => void; promise: Promise<void> }>();

// Apply project context middleware to all routes
router.use(projectContext(true));

/**
 * GET /api/ralph/status
 * Get Ralph execution status
 */
router.get('/status', async (req, res) => {
  try {
    const status = await req.project!.loadStatus();
    const isRunning = runningLoops.has(req.projectPath!);

    // If we think it's running but our loop isn't active, it might have crashed
    if (status.status === 'running' && !isRunning) {
      status.status = 'idle';
      await req.project!.saveStatus(status);
    }

    res.json({ ...status, isRunning });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get status',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/ralph/start
 * Start Ralph loop for the project
 */
router.post('/start', async (req, res) => {
  try {
    const { maxIterations = 10 } = req.body;
    const projectPath = req.projectPath!;
    const project = req.project!;

    // Check if already running
    if (runningLoops.has(projectPath)) {
      return res.status(400).json({ error: 'Ralph is already running for this project' });
    }

    const currentStatus = await project.loadStatus();
    if (currentStatus.status === 'running') {
      return res.status(400).json({ error: 'Ralph is already running' });
    }

    console.log(`[Ralph] Starting loop for ${projectPath} with max ${maxIterations} iterations`);

    // Update status immediately
    const status: RalphStatus = {
      status: 'running',
      maxIterations,
      currentIteration: 0,
      startedAt: new Date().toISOString(),
      pid: process.pid,
    };
    await project.saveStatus(status);
    await Registry.updateStatus(projectPath, 'running', process.pid);

    // Create abort mechanism
    let aborted = false;
    const abort = () => {
      aborted = true;
    };

    // Note: progress.txt is managed by Claude per prompt instructions, not by the runner

    // Run the loop asynchronously (don't await - return immediately)
    const loopPromise = (async () => {
      try {
        const result = await runRalphLoop(project, {
          maxIterations,
          onIterationStart: async (iteration, story) => {
            if (aborted) throw new Error('Aborted');
            console.log(`[Ralph] Iteration ${iteration} starting: ${story?.id || 'none'}`);
          },
          onIterationEnd: async (iteration, completed, allComplete) => {
            // Don't check abort here - only check at start of new work
            console.log(`[Ralph] Iteration ${iteration} ended: completed=${completed}, allComplete=${allComplete}`);
          },
        });

        console.log(`[Ralph] Loop finished: allComplete=${result.allComplete}, storiesCompleted=${result.storiesCompleted}`);

        // Update final status
        await project.saveStatus({
          status: result.allComplete ? 'completed' : 'idle',
          currentIteration: result.iterationsRun,
          maxIterations,
        });
      } catch (error) {
        console.error(`[Ralph] Loop error:`, error);
        await project.saveStatus({ status: 'error' });
      } finally {
        runningLoops.delete(projectPath);
        await Registry.updateStatus(projectPath, 'idle');
      }
    })();

    runningLoops.set(projectPath, { abort, promise: loopPromise });

    res.json({ success: true, status });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to start Ralph',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/ralph/stop
 * Stop Ralph loop for the project
 */
router.post('/stop', async (req, res) => {
  try {
    const projectPath = req.projectPath!;

    // Signal abort to the running loop
    const running = runningLoops.get(projectPath);
    if (running) {
      console.log(`[Ralph] Stopping loop for ${projectPath}`);
      running.abort();
      runningLoops.delete(projectPath);
    }

    // Update status
    await req.project!.saveStatus({ status: 'idle' });
    await Registry.updateStatus(projectPath, 'idle');

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to stop Ralph',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/ralph/progress
 * Get progress log content
 */
router.get('/progress', async (req, res) => {
  try {
    const content = await req.project!.readProgress();
    res.type('text/plain').send(content);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to read progress',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/ralph/logs
 * List available log files
 */
router.get('/logs', async (req, res) => {
  try {
    const logs = await req.project!.listLogs();
    res.json(logs);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to list logs',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/ralph/logs/:filename
 * Get a specific log file
 */
router.get('/logs/:filename', async (req, res) => {
  try {
    const { promises: fs } = await import('fs');
    const { join } = await import('path');
    const logPath = join(req.project!.logsDir, req.params.filename);
    const content = await fs.readFile(logPath, 'utf-8');
    res.type('text/plain').send(content);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to read log',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
