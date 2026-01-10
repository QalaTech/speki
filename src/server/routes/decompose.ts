/**
 * Decompose Routes
 *
 * API endpoints for PRD decomposition.
 */

import { Router } from 'express';
import { promises as fs } from 'fs';
import { join } from 'path';
import { projectContext } from '../middleware/project-context.js';
import { runDecompose } from '../../core/decompose/runner.js';
import { calculateLoopLimit } from '../../core/ralph-loop/loop-limit.js';
import { getRunningLoop } from './ralph.js';
import type { DecomposeState, PRDData } from '../../types/index.js';

const router = Router();

// Server startup time - used to detect stale status from before server restart
const SERVER_STARTUP_TIME = new Date().toISOString();

// Active decompose statuses that indicate a process is in progress
const ACTIVE_DECOMPOSE_STATUSES = ['INITIALIZING', 'DECOMPOSING', 'REVIEWING', 'REVISING'];

// Apply project context middleware to all routes
router.use(projectContext(true));

/**
 * GET /api/prd-files
 * List PRD/spec files available for decomposition
 */
router.get('/prd-files', async (req, res) => {
  try {
    const projectPath = req.projectPath!;
    const files: { name: string; path: string; dir: string }[] = [];

    // Common directories to look for PRD/spec files
    const searchDirs = [
      { path: join(projectPath, 'specs'), name: 'specs' },
      { path: join(projectPath, 'docs'), name: 'docs' },
      { path: join(projectPath, 'prd'), name: 'prd' },
      { path: join(projectPath, '.ralph', 'specs'), name: '.ralph/specs' },
    ];

    for (const dir of searchDirs) {
      try {
        const dirFiles = await fs.readdir(dir.path);
        const mdFiles = dirFiles.filter(
          (f) => f.endsWith('.md') && !f.startsWith('.')
        );
        files.push(
          ...mdFiles.map((f) => ({
            name: f,
            path: join(dir.path, f),
            dir: dir.name,
          }))
        );
      } catch {
        // Directory doesn't exist, skip
      }
    }

    // Also check root for common PRD file names
    try {
      const rootFiles = await fs.readdir(projectPath);
      const prdFiles = rootFiles.filter(
        (f) =>
          f.endsWith('.md') &&
          !f.startsWith('.') &&
          (f.toLowerCase().includes('prd') ||
            f.toLowerCase().includes('spec') ||
            f.toLowerCase().includes('requirement'))
      );
      files.push(
        ...prdFiles.map((f) => ({
          name: f,
          path: join(projectPath, f),
          dir: '.',
        }))
      );
    } catch {
      // Ignore errors
    }

    res.json({ files });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to list PRD files',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/decompose/state
 * Get current decomposition state
 */
router.get('/state', async (req, res) => {
  try {
    const state = await req.project!.loadDecomposeState();

    // If state is "active" (decomposing, reviewing, etc.), validate it's not stale
    if (ACTIVE_DECOMPOSE_STATUSES.includes(state.status)) {
      // Check if startedAt is before server startup - if so, it's from a previous session
      if (state.startedAt && state.startedAt < SERVER_STARTUP_TIME) {
        console.log(`[Decompose] State says ${state.status} but startedAt (${state.startedAt}) is before server startup (${SERVER_STARTUP_TIME}) - resetting to IDLE`);
        const resetState: DecomposeState = {
          status: 'IDLE',
          message: 'Process was interrupted (server restart detected)',
        };
        await req.project!.saveDecomposeState(resetState);
        return res.json(resetState);
      }
    }

    res.json(state);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get decompose state',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/decompose/draft
 * Get the current draft PRD from decomposition
 */
router.get('/draft', async (req, res) => {
  try {
    const state = await req.project!.loadDecomposeState();

    if (!state.draftFile) {
      return res.json({ draft: null, draftPath: null });
    }

    try {
      const content = await fs.readFile(state.draftFile, 'utf-8');
      const draft = JSON.parse(content);
      res.json({ draft, draftPath: state.draftFile });
    } catch {
      res.json({ draft: null, draftPath: state.draftFile, error: 'Could not read draft file' });
    }
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get draft',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/decompose/feedback
 * Get current feedback
 */
router.get('/feedback', async (req, res) => {
  try {
    const content = await fs.readFile(req.project!.decomposeFeedbackPath, 'utf-8');
    const feedback = JSON.parse(content);
    res.json({ feedback });
  } catch {
    res.json({ feedback: null });
  }
});

/**
 * GET /api/decompose/review-logs
 * Get review log files (only peer_review .log files, not .raw or decompose logs)
 */
router.get('/review-logs', async (req, res) => {
  try {
    const logsDir = req.project!.logsDir;
    const files = await fs.readdir(logsDir);

    // Only match peer_review_attempt_N_*.log files (not .raw files or decompose logs)
    const reviewLogs = files.filter(f =>
      f.startsWith('peer_review_attempt_') && f.endsWith('.log')
    );

    const logs = await Promise.all(
      reviewLogs.map(async (file) => {
        // Extract attempt number from filename: peer_review_attempt_N_timestamp.log
        const attemptMatch = file.match(/peer_review_attempt_(\d+)_/);
        const attempt = attemptMatch ? parseInt(attemptMatch[1], 10) : 1;

        try {
          const content = await fs.readFile(join(logsDir, file), 'utf-8');
          return { attempt, path: file, content };
        } catch {
          return { attempt, path: file, content: null };
        }
      })
    );

    // Sort by attempt number
    logs.sort((a, b) => a.attempt - b.attempt);

    res.json({ logs });
  } catch {
    res.json({ logs: [] });
  }
});

/**
 * GET /api/decompose/review-log
 * Get the latest review log
 */
router.get('/review-log', async (req, res) => {
  try {
    const logsDir = req.project!.logsDir;
    const files = await fs.readdir(logsDir);
    const reviewLogs = files.filter(f => f.includes('review') || f.includes('decompose')).sort().reverse();

    if (reviewLogs.length === 0) {
      return res.json({ log: null });
    }

    const content = await fs.readFile(join(logsDir, reviewLogs[0]), 'utf-8');
    res.json({ log: content });
  } catch {
    res.json({ log: null });
  }
});

/**
 * DELETE /api/decompose/draft/task/:taskId
 * Delete a task from the draft
 */
router.delete('/draft/task/:taskId', async (req, res) => {
  try {
    const state = await req.project!.loadDecomposeState();

    if (!state.draftFile) {
      return res.status(400).json({ error: 'No draft available' });
    }

    const content = await fs.readFile(state.draftFile, 'utf-8');
    const draft = JSON.parse(content) as PRDData;

    const taskIndex = draft.userStories.findIndex(s => s.id === req.params.taskId);
    if (taskIndex === -1) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Remove the task
    draft.userStories.splice(taskIndex, 1);

    // Save updated draft
    await fs.writeFile(state.draftFile, JSON.stringify(draft, null, 2));

    res.json({ success: true, remainingTasks: draft.userStories.length });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to delete task',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/decompose/execute-task
 * Execute a single task by adding it to prd.json (or creating one)
 */
router.post('/execute-task', async (req, res) => {
  try {
    const { task, projectName, branchName, language, sourceFile } = req.body;

    if (!task) {
      return res.status(400).json({ error: 'Task is required' });
    }

    // Load existing PRD or create new one
    let prd = await req.project!.loadPRD();

    if (prd) {
      // Check if task already exists in prd.json
      const existingTask = prd.userStories.find(s => s.id === task.id);
      if (existingTask) {
        return res.json({
          success: true,
          message: `Task ${task.id} already in execution queue`,
          taskId: task.id,
          alreadyQueued: true,
        });
      }

      // Add task to existing PRD
      prd.userStories.push(task);
    } else {
      // Create new PRD with this task
      prd = {
        projectName: projectName || 'Single Task Execution',
        branchName: branchName || 'main',
        language: language || 'nodejs',
        standardsFile: `.ralph/standards/${language || 'nodejs'}.md`,
        description: `Execute task: ${task.title}`,
        userStories: [task],
      };
    }

    // Save updated PRD
    await req.project!.savePRD(prd);

    // Update loop limit if Ralph is running
    const runningLoop = getRunningLoop(req.projectPath!);
    if (runningLoop) {
      const incompleteTasks = prd.userStories.filter(s => !s.passes).length;
      const newLimit = calculateLoopLimit(incompleteTasks);
      if (newLimit > runningLoop.maxIterations) {
        runningLoop.updateMaxIterations(newLimit);
        runningLoop.maxIterations = newLimit;
        console.log(`[Decompose] Updated loop limit to ${newLimit} after adding task ${task.id}`);
      }
    }

    // Remove task from source file after adding to prd.json
    if (sourceFile) {
      try {
        const sourceContent = await fs.readFile(sourceFile, 'utf-8');
        const sourceData = JSON.parse(sourceContent) as PRDData;

        const taskIndex = sourceData.userStories.findIndex(s => s.id === task.id);
        if (taskIndex !== -1) {
          // Remove the task from the source file
          sourceData.userStories.splice(taskIndex, 1);
          await fs.writeFile(sourceFile, JSON.stringify(sourceData, null, 2));
        }
      } catch (err) {
        // Don't fail the request if we can't update source file
        console.warn('Could not update source file:', err);
      }
    }

    res.json({
      success: true,
      message: `Task ${task.id} queued for execution`,
      taskId: task.id,
      loopLimitUpdated: !!runningLoop,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to queue task for execution',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/decompose/activate
 * Activate draft as the active PRD
 */
router.post('/activate', async (req, res) => {
  try {
    const state = await req.project!.loadDecomposeState();

    if (!state.draftFile) {
      return res.status(400).json({ error: 'No draft to activate' });
    }

    const content = await fs.readFile(state.draftFile, 'utf-8');
    const prd = JSON.parse(content) as PRDData;
    const storyCount = prd.userStories?.length || 0;

    await req.project!.savePRD(prd);

    // Clear tasks from the draft file after activation
    prd.userStories = [];
    await fs.writeFile(state.draftFile, JSON.stringify(prd, null, 2));

    res.json({ success: true, storyCount });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to activate draft',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/decompose/start
 * Start PRD decomposition
 */
router.post('/start', async (req, res) => {
  try {
    const {
      prdFile,
      branchName,
      language,
      outputName,
      freshStart = false,
      forceRedecompose = false,
      maxReviewAttempts,
    } = req.body;

    if (!prdFile) {
      return res.status(400).json({ error: 'PRD file path required' });
    }

    // Update state to indicate start
    await req.project!.saveDecomposeState({
      status: 'INITIALIZING',
      message: 'Starting decomposition...',
      prdFile,
    });

    // Run decomposition (this is blocking, runs in request context)
    // For long-running PRDs, consider making this async with WebSocket updates
    const result = await runDecompose(req.project!, {
      prdFile,
      branchName,
      language,
      outputName,
      freshStart,
      forceRedecompose,
      maxReviewAttempts,
      onProgress: async (state) => {
        // Progress updates are saved to file for polling
        await req.project!.saveDecomposeState(state);
      },
    });

    if (result.success) {
      res.json({
        success: true,
        storyCount: result.storyCount,
        outputPath: result.outputPath,
        verdict: result.verdict,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    // Update state to error
    await req.project!.saveDecomposeState({
      status: 'ERROR',
      message: 'Decomposition failed',
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      error: 'Failed to decompose PRD',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/decompose/approve
 * Approve the current decomposition draft
 */
router.post('/approve', async (req, res) => {
  try {
    const state = await req.project!.loadDecomposeState();

    if (!state.draftFile) {
      return res.status(400).json({ error: 'No draft to approve' });
    }

    // Load draft and save as active PRD
    const { promises: fs } = await import('fs');
    const content = await fs.readFile(state.draftFile, 'utf-8');
    const prd = JSON.parse(content);

    await req.project!.savePRD(prd);

    // Update state
    await req.project!.saveDecomposeState({
      ...state,
      status: 'COMPLETED',
      message: 'Decomposition approved and activated',
    });

    res.json({ success: true, storyCount: prd.userStories?.length || 0 });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to approve decomposition',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/decompose/feedback
 * Submit feedback for re-decomposition
 */
router.post('/feedback', async (req, res) => {
  try {
    const { feedback } = req.body;

    if (!feedback) {
      return res.status(400).json({ error: 'Feedback required' });
    }

    // Save feedback
    const { promises: fs } = await import('fs');
    await fs.writeFile(
      req.project!.decomposeFeedbackPath,
      JSON.stringify({ feedback, timestamp: new Date().toISOString() }, null, 2)
    );

    // Update state
    await req.project!.saveDecomposeState({
      status: 'REVIEWING',
      message: 'Feedback submitted, ready for re-decomposition',
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to save feedback',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/decompose/reset
 * Reset decomposition state
 */
router.post('/reset', async (req, res) => {
  try {
    await req.project!.saveDecomposeState({
      status: 'IDLE',
      message: 'Ready to decompose PRD',
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to reset state',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/decompose/task-feedback
 * Submit feedback to update a specific task using Claude
 */
router.post('/task-feedback', async (req, res) => {
  try {
    const { runTaskFeedback } = await import('../../core/decompose/task-feedback.js');

    const { taskId, feedback, prdFile } = req.body;

    if (!taskId || !feedback) {
      return res.status(400).json({ error: 'taskId and feedback are required' });
    }

    const state = await req.project!.loadDecomposeState();

    if (!state.draftFile) {
      return res.status(400).json({ error: 'No draft file found' });
    }

    const result = await runTaskFeedback({
      taskId,
      feedback,
      draftPath: state.draftFile,
      prdPath: prdFile || state.prdFile,
      project: req.project!,
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'Task updated',
        task: result.updatedTask,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to update task',
      });
    }
  } catch (error) {
    res.status(500).json({
      error: 'Failed to process task feedback',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/decompose/retry-review
 * Retry peer review for the current draft
 */
router.post('/retry-review', async (req, res) => {
  try {
    const { runPeerReview } = await import('../../core/decompose/peer-review.js');

    const state = await req.project!.loadDecomposeState();

    if (!state.draftFile) {
      return res.status(400).json({ error: 'No draft available to review' });
    }

    if (!state.prdFile) {
      return res.status(400).json({ error: 'No PRD file specified' });
    }

    // Load the draft tasks
    const draftContent = await fs.readFile(state.draftFile, 'utf-8');
    const tasks = JSON.parse(draftContent) as PRDData;

    // Get current attempt number from logs
    const logsDir = req.project!.logsDir;
    let attemptNumber = 1;
    try {
      const files = await fs.readdir(logsDir);
      const reviewLogs = files.filter(f =>
        f.startsWith('peer_review_attempt_') && f.endsWith('.log')
      );
      if (reviewLogs.length > 0) {
        const maxAttempt = Math.max(...reviewLogs.map(f => {
          const match = f.match(/peer_review_attempt_(\d+)_/);
          return match ? parseInt(match[1], 10) : 0;
        }));
        attemptNumber = maxAttempt + 1;
      }
    } catch {
      // Logs dir might not exist yet
    }

    // Update state to indicate retry
    await req.project!.saveDecomposeState({
      ...state,
      status: 'REVIEWING',
      message: `Retrying peer review (attempt ${attemptNumber})...`,
    });

    // Run peer review
    const result = await runPeerReview({
      prdFile: state.prdFile,
      tasks,
      project: req.project!,
      attempt: attemptNumber,
    });

    // Update state with result
    if (result.success) {
      await req.project!.saveDecomposeState({
        ...state,
        status: 'COMPLETED',
        message: `Peer review complete: ${result.feedback.verdict}`,
        verdict: result.feedback.verdict,
      });

      res.json({
        success: true,
        verdict: result.feedback.verdict,
        logPath: result.logPath,
      });
    } else {
      // Determine error type for UI
      const errorType = result.error?.includes('not available')
        ? 'CLI_UNAVAILABLE'
        : result.error?.includes('timed out')
          ? 'TIMEOUT'
          : 'CRASH';

      await req.project!.saveDecomposeState({
        ...state,
        status: 'ERROR',
        message: 'Peer review failed',
        error: result.error,
        errorType,
      });

      res.status(500).json({
        success: false,
        error: result.error,
        errorType,
        logPath: result.logPath,
      });
    }
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retry peer review',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
