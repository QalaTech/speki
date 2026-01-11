import { Router } from 'express';
import { promises as fs } from 'fs';
import { join, basename } from 'path';
import { randomUUID } from 'crypto';
import { projectContext } from '../middleware/project-context.js';
import { runSpecReview } from '../../core/spec-review/runner.js';
import { executeSplit } from '../../core/spec-review/splitter.js';
import { generateSplitProposal, detectGodSpec } from '../../core/spec-review/god-spec-detector.js';
import { loadSession, saveSession } from '../../core/spec-review/session-file.js';
import type { SessionFile, SplitProposal, CodebaseContext } from '../../types/index.js';

const router = Router();

router.use(projectContext(true));

const SPEC_SEARCH_DIRECTORIES = ['specs', 'docs', '.ralph/specs', '.'];

/**
 * GET /api/spec-review/files
 * List available spec files for review
 */
router.get('/files', async (req, res) => {
  try {
    const projectPath = req.projectPath!;
    const files: { name: string; path: string; dir: string }[] = [];

    for (const dir of SPEC_SEARCH_DIRECTORIES) {
      const dirPath = join(projectPath, dir);
      try {
        const dirFiles = await fs.readdir(dirPath);
        const mdFiles = dirFiles.filter(
          (f) => f.endsWith('.md') && !f.startsWith('.')
        );
        files.push(
          ...mdFiles.map((f) => ({
            name: f,
            path: join(dirPath, f),
            dir,
          }))
        );
      } catch {
        // Directory doesn't exist
      }
    }

    res.json({ files });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to list spec files',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/spec-review/start
 * Initiate a spec review session
 */
router.post('/start', async (req, res) => {
  try {
    const { specFile, timeout, cli } = req.body;

    if (!specFile) {
      return res.status(400).json({ error: 'specFile is required' });
    }

    // Verify file exists
    try {
      await fs.access(specFile);
    } catch {
      return res.status(404).json({ error: 'Spec file not found' });
    }

    // Verify it's a markdown file
    if (!specFile.endsWith('.md')) {
      return res.status(400).json({ error: 'Only markdown files (.md) are supported' });
    }

    const projectPath = req.projectPath!;
    const sessionId = randomUUID();
    const now = new Date().toISOString();

    const session: SessionFile = {
      sessionId,
      specFilePath: specFile,
      status: 'in_progress',
      startedAt: now,
      lastUpdatedAt: now,
      suggestions: [],
      changeHistory: [],
      chatMessages: [],
    };

    await saveSession(session);

    try {
      const result = await runSpecReview(specFile, {
        cwd: projectPath,
        timeoutMs: timeout,
        cli,
        logDir: join(projectPath, '.ralph', 'logs'),
      });

      session.status = 'completed';
      session.completedAt = new Date().toISOString();
      session.lastUpdatedAt = session.completedAt;
      session.reviewResult = result;
      session.suggestions = result.suggestions;
      session.logPath = result.logPath;

      await saveSession(session);

      res.json({
        sessionId,
        status: 'completed',
        verdict: result.verdict,
        logPath: result.logPath,
      });
    } catch (reviewError) {
      session.status = 'needs_attention';
      session.lastUpdatedAt = new Date().toISOString();

      await saveSession(session);

      res.status(500).json({
        sessionId,
        status: 'error',
        error: reviewError instanceof Error ? reviewError.message : String(reviewError),
      });
    }
  } catch (error) {
    res.status(500).json({
      error: 'Failed to start spec review',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/spec-review/status/:sessionId
 * Get the status and results of a review session
 */
router.get('/status/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const projectPath = req.projectPath!;

    const sessionsDir = join(projectPath, '.ralph', 'sessions');
    let foundSession: SessionFile | null = null;

    try {
      const sessionFiles = await fs.readdir(sessionsDir);

      for (const file of sessionFiles) {
        if (!file.endsWith('.session.json')) continue;

        const content = await fs.readFile(join(sessionsDir, file), 'utf-8');
        const session = JSON.parse(content) as SessionFile;

        if (session.sessionId === sessionId) {
          foundSession = session;
          break;
        }
      }
    } catch {
      // Sessions directory doesn't exist
    }

    if (!foundSession) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      sessionId: foundSession.sessionId,
      specFilePath: foundSession.specFilePath,
      status: foundSession.status,
      startedAt: foundSession.startedAt,
      completedAt: foundSession.completedAt,
      reviewResult: foundSession.reviewResult,
      suggestions: foundSession.suggestions,
      logPath: foundSession.logPath,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get session status',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/spec-review/split
 * Execute a spec split based on the proposal
 */
router.post('/split', async (req, res) => {
  try {
    const { specFile, proposal } = req.body;

    if (!specFile) {
      return res.status(400).json({ error: 'specFile is required' });
    }

    if (!proposal) {
      return res.status(400).json({ error: 'proposal is required' });
    }

    // Verify file exists
    try {
      await fs.access(specFile);
    } catch {
      return res.status(404).json({ error: 'Spec file not found' });
    }

    const createdFiles = await executeSplit(specFile, proposal as SplitProposal);

    res.json({
      success: true,
      createdFiles,
      originalFile: specFile,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to execute split',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/spec-review/split/preview
 * Preview split files without creating them
 */
router.post('/split/preview', async (req, res) => {
  try {
    const { specFile } = req.body;

    if (!specFile) {
      return res.status(400).json({ error: 'specFile is required' });
    }

    // Verify file exists
    try {
      await fs.access(specFile);
    } catch {
      return res.status(404).json({ error: 'Spec file not found' });
    }

    const specContent = await fs.readFile(specFile, 'utf-8');
    const specBasename = basename(specFile);
    const emptyContext: CodebaseContext = { projectType: 'unknown', existingPatterns: [], relevantFiles: [] };
    const godSpecResult = detectGodSpec(specContent, emptyContext);

    if (!godSpecResult.isGodSpec) {
      return res.json({
        isGodSpec: false,
        message: 'This spec does not appear to be a god spec and does not need splitting',
        indicators: godSpecResult.indicators,
      });
    }

    const proposal = generateSplitProposal(specContent, godSpecResult, specBasename);

    res.json({
      isGodSpec: true,
      proposal,
      indicators: godSpecResult.indicators,
      estimatedStories: godSpecResult.estimatedStories,
      featureDomains: godSpecResult.featureDomains,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to preview split',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
