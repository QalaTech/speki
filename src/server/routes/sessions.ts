import { Router } from 'express';
import { projectContext } from '../middleware/project-context.js';
import { loadSession, saveSession, getSessionPath } from '../../core/spec-review/session-file.js';
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
    const session = await loadSession(specPath);

    res.json({ session });
  } catch (error) {
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

    await saveSession(sessionToSave);

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
    const sessionPath = getSessionPath(specPath);
    const exists = await access(sessionPath).then(() => true, () => false);

    res.json({ exists });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to check session existence',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
