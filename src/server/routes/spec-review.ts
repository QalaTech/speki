import { Router } from 'express';
import { promises as fs } from 'fs';
import { join, basename } from 'path';
import { randomUUID } from 'crypto';
import { projectContext } from '../middleware/project-context.js';
import { runSpecReview } from '../../core/spec-review/runner.js';
import { executeSplit, buildSplitContent } from '../../core/spec-review/splitter.js';
import { generateSplitProposal, detectGodSpec } from '../../core/spec-review/god-spec-detector.js';
import { loadSession, saveSession } from '../../core/spec-review/session-file.js';
import type { SessionFile, SplitProposal, CodebaseContext, ChatMessage } from '../../types/index.js';

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

    const session = await findSessionById(projectPath, sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      sessionId: session.sessionId,
      specFilePath: session.specFilePath,
      status: session.status,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      reviewResult: session.reviewResult,
      suggestions: session.suggestions,
      logPath: session.logPath,
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

/**
 * POST /api/spec-review/feedback
 * Handle user feedback on suggestions (approve/reject/edit)
 */
router.post('/feedback', async (req, res) => {
  try {
    const { sessionId, suggestionId, action, userVersion } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    if (!suggestionId) {
      return res.status(400).json({ error: 'suggestionId is required' });
    }

    if (!action || !['approved', 'rejected', 'edited'].includes(action)) {
      return res.status(400).json({ error: 'action must be one of: approved, rejected, edited' });
    }

    if (action === 'edited' && !userVersion) {
      return res.status(400).json({ error: 'userVersion is required when action is edited' });
    }

    const projectPath = req.projectPath!;
    const session = await findSessionById(projectPath, sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const suggestionIndex = session.suggestions.findIndex((s) => s.id === suggestionId);
    if (suggestionIndex === -1) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }

    session.suggestions[suggestionIndex] = {
      ...session.suggestions[suggestionIndex],
      status: action,
      userVersion: action === 'edited' ? userVersion : undefined,
      reviewedAt: new Date().toISOString(),
    };
    session.lastUpdatedAt = new Date().toISOString();

    await saveSession(session);

    res.json({
      success: true,
      suggestion: session.suggestions[suggestionIndex],
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to process feedback',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/spec-review/chat
 * Send a chat message for the review session
 */
router.post('/chat', async (req, res) => {
  try {
    const { sessionId, message, suggestionId, selectedText } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    const projectPath = req.projectPath!;
    const session = await findSessionById(projectPath, sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Build message content with selection context if provided
    let messageContent = message;
    if (selectedText && typeof selectedText === 'string' && selectedText.trim()) {
      messageContent = `[Selection: "${selectedText.trim()}"]\n\n${message}`;
    }

    const userMessage: ChatMessage = {
      id: randomUUID(),
      role: 'user',
      content: messageContent,
      timestamp: new Date().toISOString(),
      suggestionId,
    };

    session.chatMessages.push(userMessage);
    session.lastUpdatedAt = new Date().toISOString();

    await saveSession(session);

    res.json({
      success: true,
      message: userMessage,
      // Return selection context in response for debugging/UI
      selectionContext: selectedText || null,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to send chat message',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/spec-review/revert
 * Revert a change from the change history
 */
router.post('/revert', async (req, res) => {
  try {
    const { sessionId, changeId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    if (!changeId) {
      return res.status(400).json({ error: 'changeId is required' });
    }

    const projectPath = req.projectPath!;
    const session = await findSessionById(projectPath, sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const changeIndex = session.changeHistory.findIndex((c) => c.id === changeId);
    if (changeIndex === -1) {
      return res.status(404).json({ error: 'Change not found' });
    }

    const change = session.changeHistory[changeIndex];

    if (change.reverted) {
      return res.status(400).json({ error: 'Change has already been reverted' });
    }

    await fs.writeFile(change.filePath, change.beforeContent, 'utf-8');

    session.changeHistory[changeIndex] = {
      ...change,
      reverted: true,
    };
    session.lastUpdatedAt = new Date().toISOString();

    await saveSession(session);

    res.json({
      success: true,
      change: session.changeHistory[changeIndex],
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to revert change',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/spec-review/suggestions/:sessionId
 * Get pending suggestions for a session
 */
router.get('/suggestions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const projectPath = req.projectPath!;

    const session = await findSessionById(projectPath, sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const pendingSuggestions = session.suggestions.filter((s) => s.status === 'pending');

    res.json({
      sessionId,
      suggestions: pendingSuggestions,
      totalCount: session.suggestions.length,
      pendingCount: pendingSuggestions.length,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get suggestions',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/spec-review/split/preview-content
 * Generate preview content for split files without creating them
 */
router.post('/split/preview-content', async (req, res) => {
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

    const specContent = await fs.readFile(specFile, 'utf-8');
    const specBasename = basename(specFile);
    const typedProposal = proposal as SplitProposal;

    const previewFiles = typedProposal.proposedSpecs.map((spec) => ({
      filename: spec.filename,
      description: spec.description,
      content: buildSplitContent(
        specContent,
        specBasename,
        spec.sections,
        spec.description
      ),
      proposedSpec: spec,
    }));

    res.json({
      previewFiles,
      originalFile: specFile,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to generate preview content',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/spec-review/split/execute
 * Execute a split with custom content (from preview editing)
 */
router.post('/split/execute', async (req, res) => {
  try {
    const { specFile, files, sessionId } = req.body;

    if (!specFile) {
      return res.status(400).json({ error: 'specFile is required' });
    }

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'files array is required' });
    }

    // Verify original file exists
    try {
      await fs.access(specFile);
    } catch {
      return res.status(404).json({ error: 'Spec file not found' });
    }

    const projectPath = req.projectPath!;
    const specDir = join(specFile, '..');
    const createdFiles: string[] = [];

    // Write each file
    for (const file of files) {
      if (!file.filename || typeof file.content !== 'string') {
        return res.status(400).json({ error: 'Each file must have filename and content' });
      }

      const filePath = join(specDir, file.filename);
      await fs.writeFile(filePath, file.content, 'utf-8');
      createdFiles.push(filePath);
    }

    // Update session with splitSpecs if sessionId is provided
    if (sessionId) {
      const session = await findSessionById(projectPath, sessionId);
      if (session) {
        session.splitSpecs = files.map((file: { filename: string; description: string }) => ({
          filename: file.filename,
          description: file.description || '',
        }));
        session.lastUpdatedAt = new Date().toISOString();
        await saveSession(session);
      }
    }

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
 * Helper function to find a session by its ID
 */
async function findSessionById(projectPath: string, sessionId: string): Promise<SessionFile | null> {
  const sessionsDir = join(projectPath, '.ralph', 'sessions');

  try {
    const sessionFiles = await fs.readdir(sessionsDir);

    for (const file of sessionFiles) {
      if (!file.endsWith('.session.json')) continue;

      const content = await fs.readFile(join(sessionsDir, file), 'utf-8');
      const session = JSON.parse(content) as SessionFile;

      if (session.sessionId === sessionId) {
        return session;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export default router;
