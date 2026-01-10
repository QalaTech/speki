/**
 * Ralph Control Routes
 *
 * API endpoints for controlling Ralph execution.
 */

import { Router } from 'express';
import { projectContext } from '../middleware/project-context.js';
import { Registry } from '../../core/registry.js';
import { runRalphLoop } from '../../core/ralph-loop/runner.js';
import { calculateLoopLimit } from '../../core/ralph-loop/loop-limit.js';
import type { RalphStatus } from '../../types/index.js';

const router = Router();

// Track running Ralph loops by project path
interface RunningLoop {
  abort: () => void;
  promise: Promise<void>;
  startedAt: number;
  /** Current max iterations - can be updated dynamically */
  maxIterations: number;
  /** Update the max iterations for this loop */
  updateMaxIterations: (newMax: number) => void;
}
const runningLoops = new Map<string, RunningLoop>();

// Server startup time - used to detect stale status from before server restart
const SERVER_STARTUP_TIME = new Date().toISOString();

/**
 * Get a running loop for a project path (used by other routes to update loop limit)
 */
export function getRunningLoop(projectPath: string): RunningLoop | undefined {
  return runningLoops.get(projectPath);
}

// Apply project context middleware to all routes
router.use(projectContext(true));

/**
 * Check if a process is running
 */
function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 doesn't kill the process, just checks if it exists
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * GET /api/ralph/status
 * Get Ralph execution status
 */
router.get('/status', async (req, res) => {
  try {
    const status = await req.project!.loadStatus();
    const isRunning = runningLoops.has(req.projectPath!);

    // If status says running, validate it's actually running
    if (status.status === 'running') {
      // Check 1: Is our in-memory loop tracker aware of it?
      if (!isRunning) {
        console.log(`[Ralph] Status says running but no active loop in memory - resetting to idle`);
        status.status = 'idle';
        await req.project!.saveStatus(status);
      }
      // Check 2: If status has a startedAt before server startup, it's stale from a previous server session
      else if (status.startedAt && status.startedAt < SERVER_STARTUP_TIME) {
        console.log(`[Ralph] Status says running but startedAt (${status.startedAt}) is before server startup (${SERVER_STARTUP_TIME}) - resetting to idle`);
        status.status = 'idle';
        runningLoops.delete(req.projectPath!);
        await req.project!.saveStatus(status);
      }
      // Check 3: If we have a PID, is that process still alive?
      else if (status.pid && !isProcessRunning(status.pid)) {
        console.log(`[Ralph] Status says running but PID ${status.pid} is dead - resetting to idle`);
        status.status = 'idle';
        runningLoops.delete(req.projectPath!);
        await req.project!.saveStatus(status);
      }
    }

    res.json({ ...status, isRunning: runningLoops.has(req.projectPath!) });
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

    // Load PRD to count tasks
    const prd = await project.loadPRD();
    if (!prd) {
      return res.status(400).json({ error: 'No PRD loaded. Run decompose first.' });
    }

    // Calculate loop limit based on incomplete task count + 20% buffer
    const incompleteTasks = prd.userStories.filter(s => !s.passes).length;
    const calculatedLimit = calculateLoopLimit(incompleteTasks);

    // Allow override from request, but default to calculated limit
    const maxIterations = req.body.maxIterations ?? calculatedLimit;

    console.log(`[Ralph] Starting loop for ${projectPath} with ${incompleteTasks} incomplete tasks, max ${maxIterations} iterations (calculated: ${calculatedLimit})`);

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

    // Create mutable max iterations that can be updated when tasks are added
    let currentMaxIterations = maxIterations;
    const getMaxIterations = () => currentMaxIterations;
    const updateMaxIterations = (newMax: number) => {
      console.log(`[Ralph] Updating max iterations: ${currentMaxIterations} → ${newMax}`);
      currentMaxIterations = newMax;
    };

    // Note: progress.txt is managed by Claude per prompt instructions, not by the runner

    // Run the loop asynchronously (don't await - return immediately)
    const loopPromise = (async () => {
      try {
        const result = await runRalphLoop(project, {
          maxIterations: getMaxIterations, // Pass getter for dynamic updates
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
          maxIterations: getMaxIterations(),
        });
      } catch (error) {
        console.error(`[Ralph] Loop error:`, error);
        await project.saveStatus({ status: 'error' });
      } finally {
        runningLoops.delete(projectPath);
        await Registry.updateStatus(projectPath, 'idle');
      }
    })();

    runningLoops.set(projectPath, {
      abort,
      promise: loopPromise,
      startedAt: Date.now(),
      maxIterations: currentMaxIterations,
      updateMaxIterations,
    });

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

/**
 * GET /api/ralph/peer-feedback
 * Get peer feedback / knowledge base
 */
router.get('/peer-feedback', async (req, res) => {
  try {
    const feedback = await req.project!.loadPeerFeedback();
    res.json(feedback);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load peer feedback',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
