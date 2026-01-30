/**
 * Decompose Routes
 *
 * API endpoints for PRD decomposition.
 */

import { Router } from 'express';
import { promises as fs } from 'fs';
import { join, relative } from 'path';
import { projectContext } from '../middleware/project-context.js';
import { runDecompose } from '@speki/core';
import { publishDecompose } from '../sse.js';
import { generateTechSpec } from '@speki/core';
import { calculateLoopLimit } from '@speki/core';
import { getRunningLoop } from './ralph.js';
import {
  extractSpecId,
  loadDecomposeStateForSpec,
  saveDecomposeStateForSpec,
  getSpecLogsDir,
  loadPRDForSpec,
  savePRDForSpec,
  createTechSpecFromPrd,
  getChildSpecs,
  getParentSpec,
} from '@speki/core';
import type { DecomposeState, PRDData } from '@speki/core';

const router = Router();

// Server startup time - used to detect stale status from before server restart
const SERVER_STARTUP_TIME = new Date().toISOString();

// Active decompose statuses that indicate a process is in progress
const ACTIVE_DECOMPOSE_STATUSES = ['INITIALIZING', 'DECOMPOSING', 'REVIEWING', 'REVISING'];

// Track active tech spec generations (in-memory, per project)
// Map: projectPath -> { prdSpecId, techSpecName, startedAt }
const activeTechSpecGenerations = new Map<string, {
  prdSpecId: string;
  techSpecName: string;
  startedAt: string;
}>();

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
      { path: join(projectPath, '.speki', 'specs'), name: '.speki/specs' },
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
 * Get current decomposition state for a specific spec.
 * Query params: specPath (required) - path to the spec file
 */
router.get('/state', async (req, res) => {
  try {
    const specPath = req.query.specPath as string;
    if (!specPath) {
      return res.status(400).json({ error: 'specPath query parameter is required' });
    }

    const specId = extractSpecId(specPath);
    const state = await loadDecomposeStateForSpec(req.projectPath!, specId);

    // If state is "active" (decomposing, reviewing, etc.), validate it's not stale
    if (ACTIVE_DECOMPOSE_STATUSES.includes(state.status)) {
      // Check if startedAt is before server startup - if so, it's from a previous session
      if (state.startedAt && state.startedAt < SERVER_STARTUP_TIME) {
        console.log(`[Decompose] State says ${state.status} but startedAt (${state.startedAt}) is before server startup (${SERVER_STARTUP_TIME}) - resetting to IDLE`);
        const resetState: DecomposeState = {
          status: 'IDLE',
          message: 'Process was interrupted (server restart detected)',
        };
        await saveDecomposeStateForSpec(req.projectPath!, specId, resetState);
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
 * Get the current draft PRD from decomposition for a specific spec.
 * Query params: specPath (required) - path to the spec file
 */
router.get('/draft', async (req, res) => {
  try {
    const specPath = req.query.specPath as string;
    if (!specPath) {
      return res.status(400).json({ error: 'specPath query parameter is required' });
    }

    const specId = extractSpecId(specPath);
    const draft = await loadPRDForSpec(req.projectPath!, specId);

    if (!draft) {
      return res.json({ draft: null, draftPath: null });
    }

    // Construct the path for reference
    const draftPath = join(req.projectPath!, '.speki', 'specs', specId, 'tasks.json');
    res.json({ draft, draftPath });
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
 * Query params: specPath (optional) - path to spec file for per-spec feedback
 */
router.get('/feedback', async (req, res) => {
  try {
    // Try per-spec feedback first if specPath provided
    const specPath = req.query.specPath as string;
    if (specPath) {
      const specId = extractSpecId(specPath);
      const logsDir = getSpecLogsDir(req.projectPath!, specId);
      const content = await fs.readFile(join(logsDir, 'decompose_feedback.json'), 'utf-8');
      const feedback = JSON.parse(content);
      return res.json({ feedback });
    }

    // Fallback to global path
    const content = await fs.readFile(req.project!.decomposeFeedbackPath, 'utf-8');
    const feedback = JSON.parse(content);
    res.json({ feedback });
  } catch {
    res.json({ feedback: null });
  }
});

/**
 * GET /api/decompose/review-logs
 * Get review log files for a specific spec.
 * Query params: specPath (required) - path to the spec file
 */
router.get('/review-logs', async (req, res) => {
  try {
    const specPath = req.query.specPath as string;
    if (!specPath) {
      return res.status(400).json({ error: 'specPath query parameter is required' });
    }

    const specId = extractSpecId(specPath);
    const logsDir = getSpecLogsDir(req.projectPath!, specId);

    let files: string[];
    try {
      files = await fs.readdir(logsDir);
    } catch {
      return res.json({ logs: [] });
    }

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
 * Get the latest review log for a specific spec.
 * Query params: specPath (required) - path to the spec file
 */
router.get('/review-log', async (req, res) => {
  try {
    const specPath = req.query.specPath as string;
    if (!specPath) {
      return res.status(400).json({ error: 'specPath query parameter is required' });
    }

    const specId = extractSpecId(specPath);
    const logsDir = getSpecLogsDir(req.projectPath!, specId);

    let files: string[];
    try {
      files = await fs.readdir(logsDir);
    } catch {
      return res.json({ log: null });
    }

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
 * GET /api/decompose/decompose-review
 * Get the latest decompose review JSON for a specific spec.
 * Query params: specPath (required) - path to the spec file
 */
router.get('/decompose-review', async (req, res) => {
  try {
    const specPath = req.query.specPath as string;
    if (!specPath) {
      return res.status(400).json({ error: 'specPath query parameter is required' });
    }

    const specId = extractSpecId(specPath);
    const logsDir = getSpecLogsDir(req.projectPath!, specId);

    let files: string[];
    try {
      files = await fs.readdir(logsDir);
    } catch {
      return res.json({ review: null });
    }

    // Find decompose-review JSON files and sort by timestamp (newest first)
    const reviewFiles = files
      .filter(f => f.startsWith('decompose-review-') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (reviewFiles.length === 0) {
      return res.json({ review: null });
    }

    const content = await fs.readFile(join(logsDir, reviewFiles[0]), 'utf-8');
    const review = JSON.parse(content);
    res.json({ review });
  } catch {
    res.json({ review: null });
  }
});

/**
 * DELETE /api/decompose/draft/task/:taskId
 * Delete a task from the draft
 * Query params: specPath (required) - path to the spec file
 */
router.delete('/draft/task/:taskId', async (req, res) => {
  try {
    const specPath = req.query.specPath as string;
    if (!specPath) {
      return res.status(400).json({ error: 'specPath query parameter is required' });
    }

    const specId = extractSpecId(specPath);
    const prd = await loadPRDForSpec(req.projectPath!, specId);

    if (!prd) {
      return res.status(400).json({ error: 'No draft available' });
    }

    const taskIndex = prd.userStories.findIndex(s => s.id === req.params.taskId);
    if (taskIndex === -1) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Remove the task
    prd.userStories.splice(taskIndex, 1);

    // Save updated draft
    await savePRDForSpec(req.projectPath!, specId, prd);

    res.json({ success: true, remainingTasks: prd.userStories.length });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to delete task',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/decompose/execute-task
 * Execute a single task by adding it to the spec's tasks.json (or creating one)
 * Body: { task, projectName?, branchName?, language?, sourceFile?, specId? }
 */
router.post('/execute-task', async (req, res) => {
  try {
    const { task, projectName, branchName, language, sourceFile, specId: bodySpecId } = req.body;

    if (!task) {
      return res.status(400).json({ error: 'Task is required' });
    }

    // Derive specId from body or sourceFile path
    const specId = bodySpecId || (sourceFile ? extractSpecId(sourceFile) : null);
    if (!specId) {
      return res.status(400).json({ error: 'specId or sourceFile is required' });
    }

    const projectPath = req.projectPath!;

    // Load existing PRD or create new one
    let prd = await loadPRDForSpec(projectPath, specId);

    if (prd) {
      // Check if task already exists
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
        standardsFile: `.speki/standards/${language || 'nodejs'}.md`,
        description: `Execute task: ${task.title}`,
        userStories: [task],
      };
    }

    // Save updated PRD
    await savePRDForSpec(projectPath, specId, prd);

    // Update loop limit if Ralph is running
    const runningLoop = getRunningLoop(projectPath);
    if (runningLoop) {
      const incompleteTasks = prd.userStories.filter(s => !s.passes).length;
      const newLimit = calculateLoopLimit(incompleteTasks);
      if (newLimit > runningLoop.maxIterations) {
        runningLoop.updateMaxIterations(newLimit);
        runningLoop.maxIterations = newLimit;
        console.log(`[Decompose] Updated loop limit to ${newLimit} after adding task ${task.id}`);
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
 * Activate draft as the active PRD.
 * In the per-spec model, tasks are already in .speki/specs/<specId>/tasks.json
 * (written by the decompose runner), so activation validates they exist.
 * Query params: specPath (required) - path to the spec file
 */
router.post('/activate', async (req, res) => {
  try {
    const specPath = req.query.specPath as string;
    if (!specPath) {
      return res.status(400).json({ error: 'specPath query parameter is required' });
    }

    const specId = extractSpecId(specPath);
    const projectPath = req.projectPath!;

    // In the per-spec model, draft and PRD are the same file (tasks.json).
    // Verify tasks exist in the spec's tasks.json.
    const prd = await loadPRDForSpec(projectPath, specId);

    if (!prd || !prd.userStories || prd.userStories.length === 0) {
      return res.status(400).json({ error: 'No tasks to activate. Run decompose first.' });
    }

    res.json({ success: true, storyCount: prd.userStories.length });
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

    // Resolve path - if relative, join with projectPath
    const resolvedPrdFile = prdFile.startsWith('/') ? prdFile : join(req.projectPath!, prdFile);

    // Capture project context for background execution
    const project = req.project!;
    const projectPath = req.projectPath!;
    const specId = extractSpecId(resolvedPrdFile);

    // Update state to indicate start (per-spec)
    await saveDecomposeStateForSpec(projectPath, specId, {
      status: 'INITIALIZING',
      message: 'Starting decomposition...',
      prdFile: resolvedPrdFile,
    });

    // Create stream callbacks for real-time log output
    const streamCallbacks = {
      onText: (text: string) => {
        publishDecompose(projectPath, 'decompose/log', { line: text });
      },
      onToolCall: (name: string, detail: string) => {
        publishDecompose(projectPath, 'decompose/log', { line: `🔧 ${name}: ${detail}` });
      },
      onToolResult: (result: string) => {
        publishDecompose(projectPath, 'decompose/log', { line: result });
      },
    };

    // Return immediately - decompose runs in background
    res.status(202).json({
      success: true,
      message: 'Decomposition started',
      status: 'INITIALIZING',
    });

    // Run decomposition in background (fire-and-forget)
    runDecompose(project, {
      prdFile: resolvedPrdFile,
      branchName,
      language,
      outputName,
      freshStart,
      forceRedecompose,
      maxReviewAttempts,
      streamCallbacks,
      onProgress: async (state) => {
        // Progress updates are already saved by runDecompose internally
        // Just publish SSE events for real-time UI updates
        publishDecompose(projectPath, 'decompose/state', state);
      },
    })
      .then(async (result) => {
        if (result.success) {
          publishDecompose(projectPath, 'decompose/complete', {
            success: true,
            storyCount: result.storyCount,
            outputPath: result.outputPath,
            verdict: result.verdict,
          });
        } else {
          await saveDecomposeStateForSpec(projectPath, specId, {
            status: 'ERROR',
            message: 'Decomposition failed',
            error: result.error,
          });
          publishDecompose(projectPath, 'decompose/error', {
            success: false,
            error: result.error,
          });
        }
      })
      .catch(async (error) => {
        // Update state to error
        await saveDecomposeStateForSpec(projectPath, specId, {
          status: 'ERROR',
          message: 'Decomposition failed',
          error: error instanceof Error ? error.message : String(error),
        });
        publishDecompose(projectPath, 'decompose/error', {
          error: 'Failed to decompose PRD',
          details: error instanceof Error ? error.message : String(error),
        });
      });
  } catch (error) {
    // This only catches errors in the setup phase (before async execution)
    res.status(500).json({
      error: 'Failed to start decomposition',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/decompose/approve
 * Approve the current decomposition draft.
 * In the per-spec model, tasks are already in tasks.json, so this validates
 * and updates the decompose state to COMPLETED.
 * Query params: specPath (required) - path to the spec file
 */
router.post('/approve', async (req, res) => {
  try {
    const specPath = req.query.specPath as string;
    if (!specPath) {
      return res.status(400).json({ error: 'specPath query parameter is required' });
    }

    const specId = extractSpecId(specPath);
    const projectPath = req.projectPath!;

    const prd = await loadPRDForSpec(projectPath, specId);
    const storyCount = prd?.userStories?.length || 0;

    if (storyCount === 0) {
      return res.status(400).json({ error: 'No tasks to approve' });
    }

    // Update state to completed
    const state = await loadDecomposeStateForSpec(projectPath, specId);
    await saveDecomposeStateForSpec(projectPath, specId, {
      ...state,
      status: 'COMPLETED',
      message: 'Decomposition approved and activated',
    });

    res.json({ success: true, storyCount });
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
 * Query params: specPath (optional) - path to the spec file for per-spec state
 */
router.post('/feedback', async (req, res) => {
  try {
    const { feedback } = req.body;

    if (!feedback) {
      return res.status(400).json({ error: 'Feedback required' });
    }

    const projectPath = req.projectPath!;

    // Save feedback to per-spec location if specPath provided, else global
    const specPath = req.query.specPath as string;
    if (specPath) {
      const specId = extractSpecId(specPath);
      const logsDir = getSpecLogsDir(projectPath, specId);
      await fs.mkdir(logsDir, { recursive: true });
      await fs.writeFile(
        join(logsDir, 'decompose_feedback.json'),
        JSON.stringify({ feedback, timestamp: new Date().toISOString() }, null, 2)
      );

      // Update per-spec state
      await saveDecomposeStateForSpec(projectPath, specId, {
        status: 'REVIEWING',
        message: 'Feedback submitted, ready for re-decomposition',
      });
    } else {
      // Fallback to global path
      await fs.writeFile(
        req.project!.decomposeFeedbackPath,
        JSON.stringify({ feedback, timestamp: new Date().toISOString() }, null, 2)
      );
    }

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
 * Query params: specPath (optional) - path to the spec file for per-spec state
 */
router.post('/reset', async (req, res) => {
  try {
    const specPath = req.query.specPath as string;
    if (specPath) {
      const specId = extractSpecId(specPath);
      await saveDecomposeStateForSpec(req.projectPath!, specId, {
        status: 'IDLE',
        message: 'Ready to decompose PRD',
      });
    }

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
    const { runTaskFeedback } = await import('@speki/core');

    const { taskId, feedback, prdFile, specId } = req.body;

    if (!taskId || !feedback) {
      return res.status(400).json({ error: 'taskId and feedback are required' });
    }

    if (!specId) {
      return res.status(400).json({ error: 'specId is required' });
    }

    const projectPath = req.project!.projectPath;
    const state = await loadDecomposeStateForSpec(projectPath, specId);

    if (!state?.draftFile) {
      return res.status(400).json({ error: 'No draft file found' });
    }

    const logDir = getSpecLogsDir(projectPath, specId);

    const result = await runTaskFeedback({
      taskId,
      feedback,
      draftPath: state.draftFile,
      prdPath: prdFile || state.prdFile,
      project: req.project!,
      logDir,
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
 * POST /api/decompose/update-task
 * Directly update a task's fields (for manual editing)
 */
router.post('/update-task', async (req, res) => {
  try {
    const { specId, task } = req.body;

    if (!specId || !task?.id) {
      return res.status(400).json({ error: 'Missing specId or task' });
    }

    // Load current PRD data for the spec (PRDData has userStories)
    const prd = await loadPRDForSpec(req.project!.projectPath, specId);

    if (!prd?.userStories) {
      return res.status(404).json({ error: 'No tasks found for this spec' });
    }

    // Find and update the task
    const taskIndex = prd.userStories.findIndex(s => s.id === task.id);
    if (taskIndex === -1) {
      return res.status(404).json({ error: `Task ${task.id} not found` });
    }

    // Update the task with new values
    prd.userStories[taskIndex] = {
      ...prd.userStories[taskIndex],
      ...task,
      id: prd.userStories[taskIndex].id, // Preserve original ID
    };

    // Save the updated PRD data
    await savePRDForSpec(req.project!.projectPath, specId, prd);

    res.json({
      success: true,
      task: prd.userStories[taskIndex],
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to update task',
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
    const { runPeerReview } = await import('@speki/core');

    const { specId } = req.body;

    if (!specId) {
      return res.status(400).json({ error: 'specId is required' });
    }

    const projectPath = req.project!.projectPath;
    const state = await loadDecomposeStateForSpec(projectPath, specId);

    if (!state?.draftFile) {
      return res.status(400).json({ error: 'No draft available to review' });
    }

    if (!state.prdFile) {
      return res.status(400).json({ error: 'No PRD file specified' });
    }

    // Load the draft tasks
    const draftContent = await fs.readFile(state.draftFile, 'utf-8');
    const tasks = JSON.parse(draftContent) as PRDData;

    // Get current attempt number from logs
    const logDir = getSpecLogsDir(projectPath, specId);
    let attemptNumber = 1;
    try {
      const files = await fs.readdir(logDir);
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
    await saveDecomposeStateForSpec(projectPath, specId, {
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
      logDir,
    });

    // Update state with result
    if (result.success) {
      await saveDecomposeStateForSpec(projectPath, specId, {
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

      await saveDecomposeStateForSpec(projectPath, specId, {
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

/**
 * POST /api/decompose/create-tech-spec
 * Create a tech spec from a PRD's user stories
 */
router.post('/create-tech-spec', async (req, res) => {
  try {
    const { prdSpecId, techSpecName } = req.body;

    if (!prdSpecId) {
      return res.status(400).json({ error: 'prdSpecId is required' });
    }

    // Create the tech spec
    const result = await createTechSpecFromPrd(
      req.projectPath!,
      prdSpecId,
      techSpecName
    );

    res.json({
      success: true,
      specId: result.specId,
      filePath: result.filePath,
      message: `Tech spec created: ${result.specId}`,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to create tech spec',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/decompose/generate-tech-spec
 * Generate a tech spec using AI from PRD + user stories
 * Streams progress via SSE (decompose channel)
 */
router.post('/generate-tech-spec', async (req, res) => {
  try {
    const { prdSpecId, techSpecName, engineName, model } = req.body;

    if (!prdSpecId) {
      return res.status(400).json({ error: 'prdSpecId is required' });
    }

    // Build the PRD file path
    const prdPath = join(req.projectPath!, 'specs', `${prdSpecId}.md`);

    // Verify PRD exists
    try {
      await fs.access(prdPath);
    } catch {
      return res.status(404).json({
        error: 'PRD file not found',
        details: `Expected at: ${prdPath}`,
      });
    }

    // Create stream callbacks for real-time output
    const streamCallbacks = {
      onText: (text: string) => {
        publishDecompose(req.projectPath!, 'decompose/log', { line: text });
      },
      onToolCall: (name: string, detail: string) => {
        publishDecompose(req.projectPath!, 'decompose/log', { line: `🔧 ${name}: ${detail}` });
      },
      onToolResult: (result: string) => {
        publishDecompose(req.projectPath!, 'decompose/log', { line: result });
      },
    };

    // Track active generation
    activeTechSpecGenerations.set(req.projectPath!, {
      prdSpecId,
      techSpecName: techSpecName || `${prdSpecId}.tech.md`,
      startedAt: new Date().toISOString(),
    });

    // Publish start event via decompose/log (no dedicated techspec channel)
    publishDecompose(req.projectPath!, 'decompose/log', {
      line: '📝 Starting tech spec generation...',
    });

    // Run AI-powered generation
    const result = await generateTechSpec({
      prdPath,
      projectRoot: req.projectPath!,
      outputName: techSpecName,
      engineName,
      model,
      onProgress: (message) => {
        publishDecompose(req.projectPath!, 'decompose/log', {
          line: `📝 ${message}`,
        });
      },
      streamCallbacks,
    });

    // Clear generation tracking
    activeTechSpecGenerations.delete(req.projectPath!);

    if (result.success && result.outputPath) {
      // Publish success event
      publishDecompose(req.projectPath!, 'decompose/log', {
        line: `✅ Tech spec generated: ${result.outputPath}`,
      });

      // Return relative path (e.g. "specs/foo.tech.md") to match tree nodes and SSE events
      const relativePath = relative(req.projectPath!, result.outputPath);

      res.json({
        success: true,
        outputPath: relativePath,
        specId: extractSpecId(result.outputPath),
      });
    } else {
      // Publish failure event
      publishDecompose(req.projectPath!, 'decompose/log', {
        line: `❌ Tech spec generation failed: ${result.error || 'Unknown error'}`,
      });

      res.status(400).json({
        success: false,
        error: result.error,
        validationErrors: result.validationErrors,
      });
    }
  } catch (error) {
    // Clear generation tracking on error
    activeTechSpecGenerations.delete(req.projectPath!);

    publishDecompose(req.projectPath!, 'decompose/log', {
      line: `❌ Error: ${error instanceof Error ? error.message : String(error)}`,
    });

    res.status(500).json({
      error: 'Failed to generate tech spec',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/decompose/generation-status
 * Check if a tech spec generation is in progress
 */
router.get('/generation-status', (req, res) => {
  const generation = activeTechSpecGenerations.get(req.projectPath!);

  if (generation) {
    res.json({
      generating: true,
      prdSpecId: generation.prdSpecId,
      techSpecName: generation.techSpecName,
      startedAt: generation.startedAt,
    });
  } else {
    res.json({ generating: false });
  }
});

/**
 * GET /api/decompose/child-specs/:specId
 * Get child tech specs for a PRD
 */
router.get('/child-specs/:specId', async (req, res) => {
  try {
    const { specId } = req.params;

    const children = await getChildSpecs(req.projectPath!, specId);

    res.json({
      specId,
      children: children.map(c => ({
        specId: extractSpecId(c.specPath),
        specPath: c.specPath,
        status: c.status,
        type: c.type,
      })),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get child specs',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/decompose/parent-spec/:specId
 * Get parent PRD for a tech spec
 */
router.get('/parent-spec/:specId', async (req, res) => {
  try {
    const { specId } = req.params;

    const parent = await getParentSpec(req.projectPath!, specId);

    if (!parent) {
      return res.json({ specId, parent: null });
    }

    res.json({
      specId,
      parent: {
        specId: extractSpecId(parent.specPath),
        specPath: parent.specPath,
        status: parent.status,
        type: parent.type,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get parent spec',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
