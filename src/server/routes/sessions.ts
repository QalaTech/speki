import { Router } from 'express';
import { projectContext } from '../middleware/project-context.js';
import { loadSession, saveSession, getSessionPath, getAllSessionStatuses } from '../../core/spec-review/session-file.js';
import { access } from 'fs/promises';
import type { SessionFile } from '../../types/index.js';

const router = Router();

router.use(projectContext(true));

/**
 * GET /api/sessions/spec/:specPath
 * Load a session for the given spec file path
 *
 * @param specPath - URL-encoded path to the spec file
 * @returns Session if exists, null otherwise
 */
router.get('/spec/:specPath', async (req, res) => {
  try {
    const specPath = decodeURIComponent(req.params.specPath);
    const projectPath = req.projectPath;
    console.log('[sessions/spec] Loading session:', { specPath, projectPath });
    const session = await loadSession(specPath, projectPath);
    console.log('[sessions/spec] Session result:', { found: !!session, sessionId: session?.sessionId, status: session?.status });

    res.json({ session });
  } catch (error) {
    console.error('[sessions/spec] Error:', error);
    res.status(500).json({
      error: 'Failed to load session',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/sessions/spec/:specPath
 * Save session state for the given spec file path
 *
 * @param specPath - URL-encoded path to the spec file
 * @body session - The session data to save
 */
router.put('/spec/:specPath', async (req, res) => {
  try {
    const specPath = decodeURIComponent(req.params.specPath);
    const projectPath = req.projectPath;
    const { session } = req.body;

    if (!session) {
      return res.status(400).json({ error: 'session is required in request body' });
    }

    // Ensure specFilePath matches the URL parameter
    const sessionToSave: SessionFile = {
      ...session,
      specFilePath: specPath,
      lastUpdatedAt: new Date().toISOString(),
    };

    await saveSession(sessionToSave, projectPath);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to save session',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/sessions/spec/:specPath/exists
 * Check if a session exists for the given spec file path
 *
 * @param specPath - URL-encoded path to the spec file
 * @returns { exists: boolean }
 */
router.get('/spec/:specPath/exists', async (req, res) => {
  try {
    const specPath = decodeURIComponent(req.params.specPath);
    const projectPath = req.projectPath;
    const sessionPath = getSessionPath(specPath, projectPath);
    const exists = await access(sessionPath).then(() => true, () => false);

    res.json({ exists });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to check session existence',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/sessions/statuses
 * Get review statuses for all specs
 *
 * @returns { statuses: Record<specPath, status> }
 */
router.get('/statuses', async (req, res) => {
  try {
    const projectPath = req.projectPath!;
    const statuses = await getAllSessionStatuses(projectPath);

    res.json({ statuses });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get session statuses',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
