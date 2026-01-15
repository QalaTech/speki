/**
 * Task/PRD Routes
 *
 * API endpoints for managing tasks within a project.
 * All routes require project context via ?project= query param.
 */

import { Router } from 'express';
import { promises as fs } from 'fs';
import { join, basename } from 'path';
import { projectContext } from '../middleware/project-context.js';
import type { PRDData, UserStory } from '../../types/index.js';
import { publishTasks } from '../sse.js';

const router = Router();

// Apply project context middleware to all routes
router.use(projectContext(true));

/**
 * GET /api/tasks
 * Get all user stories from active PRD
 */
router.get('/', async (req, res) => {
  try {
    const prd = await req.project!.loadPRD();
    if (!prd) {
      return res.json({ userStories: [] });
    }
    res.json(prd);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load tasks',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/tasks
 * Update entire PRD
 */
router.put('/', async (req, res) => {
  try {
    const prd = req.body as PRDData;
    await req.project!.savePRD(prd);
    publishTasks(req.projectPath!, 'tasks/updated', prd);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to save tasks',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/tasks/drafts
 * List available task drafts in tasks/ folder
 */
router.get('/drafts', async (req, res) => {
  try {
    const files = await req.project!.listTasks();
    const drafts = await Promise.all(
      files.map(async (filename) => {
        const task = await req.project!.loadTask(filename);
        return {
          filename,
          name: task?.projectName || filename,
          storyCount: task?.userStories?.length || 0,
        };
      })
    );
    res.json(drafts);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to list drafts',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/tasks/drafts/:filename
 * Get a specific draft
 */
router.get('/drafts/:filename', async (req, res) => {
  try {
    const task = await req.project!.loadTask(req.params.filename);
    if (!task) {
      return res.status(404).json({ error: 'Draft not found' });
    }
    res.json(task);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load draft',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/tasks/activate/:filename
 * Activate a draft as the active PRD
 */
router.post('/activate/:filename', async (req, res) => {
  try {
    const task = await req.project!.loadTask(req.params.filename);
    if (!task) {
      return res.status(404).json({ error: 'Draft not found' });
    }
    const storyCount = task.userStories?.length || 0;
    await req.project!.savePRD(task);

    // Clear tasks from the source file after activation
    task.userStories = [];
    await req.project!.saveTask(req.params.filename, task);

    res.json({ success: true, storyCount });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to activate draft',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/tasks/:storyId
 * Update a specific story
 */
router.put('/:storyId', async (req, res) => {
  try {
    const prd = await req.project!.loadPRD();
    if (!prd) {
      return res.status(404).json({ error: 'No active PRD' });
    }

    const storyIndex = prd.userStories.findIndex(
      (s) => s.id === req.params.storyId
    );
    if (storyIndex === -1) {
      return res.status(404).json({ error: 'Story not found' });
    }

    prd.userStories[storyIndex] = {
      ...prd.userStories[storyIndex],
      ...req.body,
    };

    await req.project!.savePRD(prd);
    publishTasks(req.projectPath!, 'tasks/updated', prd);
    res.json({ success: true, story: prd.userStories[storyIndex] });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to update story',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/tasks/:storyId/pass
 * Mark a story as passed
 */
router.put('/:storyId/pass', async (req, res) => {
  try {
    const prd = await req.project!.loadPRD();
    if (!prd) {
      return res.status(404).json({ error: 'No active PRD' });
    }

    const story = prd.userStories.find((s) => s.id === req.params.storyId);
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    story.passes = true;
    await req.project!.savePRD(prd);
    publishTasks(req.projectPath!, 'tasks/updated', prd);
    res.json({ success: true, story });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to update story',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/tasks/:storyId/fail
 * Mark a story as failed
 */
router.put('/:storyId/fail', async (req, res) => {
  try {
    const prd = await req.project!.loadPRD();
    if (!prd) {
      return res.status(404).json({ error: 'No active PRD' });
    }

    const story = prd.userStories.find((s) => s.id === req.params.storyId);
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    story.passes = false;
    await req.project!.savePRD(prd);
    res.json({ success: true, story });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to update story',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/tasks/:storyId
 * Delete a story
 */
router.delete('/:storyId', async (req, res) => {
  try {
    const prd = await req.project!.loadPRD();
    if (!prd) {
      return res.status(404).json({ error: 'No active PRD' });
    }

    const storyIndex = prd.userStories.findIndex(
      (s) => s.id === req.params.storyId
    );
    if (storyIndex === -1) {
      return res.status(404).json({ error: 'Story not found' });
    }

    prd.userStories.splice(storyIndex, 1);
    await req.project!.savePRD(prd);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to delete story',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
