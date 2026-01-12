import { Router } from 'express';
import { promises as fs } from 'fs';
import { join, basename } from 'path';
import { randomUUID } from 'crypto';
import { projectContext } from '../middleware/project-context.js';
import { runSpecReview } from '../../core/spec-review/runner.js';
import { executeSplit, buildSplitContent } from '../../core/spec-review/splitter.js';
import { generateSplitProposal, detectGodSpec } from '../../core/spec-review/god-spec-detector.js';
import { loadSession, saveSession } from '../../core/spec-review/session-file.js';
import { runChatMessage, loadSpecContent } from '../../core/spec-review/chat-runner.js';
import type { SessionFile, SplitProposal, CodebaseContext, ChatMessage } from '../../types/index.js';

const router = Router();

router.use(projectContext(true));

const SPECS_DIRECTORY = 'specs';

interface SpecFileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: SpecFileNode[];
  reviewStatus?: 'reviewed' | 'pending' | 'god-spec' | 'in-progress' | 'none';
}

/**
 * Recursively scan a directory and build a tree structure
 */
async function scanDirectory(dirPath: string, relativePath: string): Promise<SpecFileNode[]> {
  const nodes: SpecFileNode[] = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden files/directories
      if (entry.name.startsWith('.')) continue;

      const entryPath = join(relativePath, entry.name);
      const fullPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const children = await scanDirectory(fullPath, entryPath);
        // Only include directories that have files
        if (children.length > 0) {
          nodes.push({
            name: entry.name,
            path: entryPath,
            type: 'directory',
            children,
          });
        }
      } else if (entry.isFile()) {
        nodes.push({
          name: entry.name,
          path: entryPath,
          type: 'file',
          reviewStatus: 'none', // TODO: Load actual status from sessions
        });
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  // Sort: directories first, then files, alphabetically
  nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

/**
 * GET /api/spec-review/files
 * List available spec files as a tree structure (specs/ folder only)
 */
router.get('/files', async (req, res) => {
  try {
    const projectPath = req.projectPath!;
    const specsDir = join(projectPath, SPECS_DIRECTORY);

    const files = await scanDirectory(specsDir, SPECS_DIRECTORY);

    res.json({ files });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to list spec files',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/spec-review/new
 * Create a new spec file with datetime prefix
 */
router.post('/new', async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'name is required' });
    }

    const projectPath = req.projectPath!;
    const specsDir = join(projectPath, SPECS_DIRECTORY);

    // Ensure specs directory exists
    try {
      await fs.mkdir(specsDir, { recursive: true });
    } catch {
      // Directory might already exist
    }

    // Generate datetime prefix
    const now = new Date();
    const datePrefix = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      '-',
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0'),
    ].join('');

    // Sanitize filename
    const sanitizedName = name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!sanitizedName) {
      return res.status(400).json({ error: 'Name must contain at least one valid character' });
    }

    const fileName = `${datePrefix}-${sanitizedName}.md`;
    const relativePath = join(SPECS_DIRECTORY, fileName);
    const fullPath = join(projectPath, relativePath);

    // Check if file already exists
    try {
      await fs.access(fullPath);
      return res.status(409).json({ error: 'A file with this name already exists' });
    } catch {
      // File doesn't exist, good to proceed
    }

    // Create the file with default content
    const defaultContent = `# ${name.trim()}

Let your imagination go wild.
`;

    await fs.writeFile(fullPath, defaultContent, 'utf-8');

    res.json({
      success: true,
      filePath: relativePath,
      fileName,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to create spec file',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/spec-review/content/:encodedPath
 * Read the content of a spec file
 */
router.get('/content/:encodedPath', async (req, res) => {
  try {
    const relativePath = decodeURIComponent(req.params.encodedPath);
    const fullPath = join(req.projectPath!, relativePath);

    // Verify file exists
    try {
      await fs.access(fullPath);
    } catch {
      return res.status(404).json({ error: 'Spec file not found' });
    }

    // Read file content
    const content = await fs.readFile(fullPath, 'utf-8');
    res.json({ content });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to read spec file',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/spec-review/content/:encodedPath
 * Save the content of a spec file
 */
router.put('/content/:encodedPath', async (req, res) => {
  try {
    const relativePath = decodeURIComponent(req.params.encodedPath);
    const fullPath = join(req.projectPath!, relativePath);
    const { content } = req.body;

    if (content === undefined) {
      return res.status(400).json({ error: 'content is required' });
    }

    // Verify file exists (don't create new files)
    try {
      await fs.access(fullPath);
    } catch {
      return res.status(404).json({ error: 'Spec file not found' });
    }

    // Write file content
    await fs.writeFile(fullPath, content, 'utf-8');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to save spec file',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/spec-review/start
 * Initiate a spec review session (or re-review with existing session)
 */
router.post('/start', async (req, res) => {
  try {
    const { specFile, timeout, cli, sessionId: existingSessionId } = req.body;
    console.log('[spec-review/start] Request received:', { specFile, existingSessionId, projectPath: req.projectPath });

    if (!specFile) {
      return res.status(400).json({ error: 'specFile is required' });
    }

    // Resolve path - if relative, join with projectPath
    const resolvedSpecFile = specFile.startsWith('/') ? specFile : join(req.projectPath!, specFile);
    console.log('[spec-review/start] Resolved spec path:', resolvedSpecFile);

    // Verify file exists
    try {
      await fs.access(resolvedSpecFile);
    } catch {
      console.log('[spec-review/start] File not found:', resolvedSpecFile);
      return res.status(404).json({ error: 'Spec file not found' });
    }

    // Verify it's a markdown file
    if (!resolvedSpecFile.endsWith('.md')) {
      return res.status(400).json({ error: 'Only markdown files (.md) are supported' });
    }

    const projectPath = req.projectPath!;
    const now = new Date().toISOString();

    // Check if re-reviewing with existing session
    let sessionId: string;
    let existingChatMessages: ChatMessage[] = [];

    if (existingSessionId) {
      // Load existing session to preserve chat history
      const existingSession = await findSessionById(projectPath, existingSessionId);
      if (existingSession) {
        sessionId = existingSessionId;
        existingChatMessages = existingSession.chatMessages || [];
        console.log('[spec-review/start] Re-review with existing session, preserving', existingChatMessages.length, 'chat messages');
      } else {
        sessionId = randomUUID();
        console.log('[spec-review/start] Existing session not found, creating new one');
      }
    } else {
      sessionId = randomUUID();
    }

    const session: SessionFile = {
      sessionId,
      specFilePath: specFile, // Keep original path for consistent lookup
      status: 'in_progress',
      startedAt: now,
      lastUpdatedAt: now,
      suggestions: [],
      changeHistory: [],
      chatMessages: existingChatMessages, // Preserve chat history on re-review
    };

    console.log('[spec-review/start] Saving session:', { sessionId, specFilePath: session.specFilePath, status: session.status });
    await saveSession(session, projectPath);
    console.log('[spec-review/start] Session saved successfully');

    try {
      const result = await runSpecReview(resolvedSpecFile, {
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

      await saveSession(session, projectPath);

      res.json({
        sessionId,
        status: 'completed',
        verdict: result.verdict,
        logPath: result.logPath,
      });
    } catch (reviewError) {
      session.status = 'needs_attention';
      session.lastUpdatedAt = new Date().toISOString();

      await saveSession(session, projectPath);

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

    await saveSession(session, projectPath);

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
 * Send a chat message for the review session and get AI response.
 * If no session exists and specPath is provided, creates a new chat-only session.
 */
router.post('/chat', async (req, res) => {
  try {
    const { sessionId, message, suggestionId, selectedText, specPath } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    const projectPath = req.projectPath!;
    let session: SessionFile | null = null;

    // Try to find existing session by ID
    if (sessionId) {
      session = await findSessionById(projectPath, sessionId);
    }

    // If no session and specPath provided, try to load by specPath or create new
    if (!session && specPath) {
      session = await loadSession(specPath, projectPath);

      // Create a new chat-only session if none exists
      if (!session) {
        const newSessionId = randomUUID();
        session = {
          sessionId: newSessionId,
          specFilePath: specPath,
          status: 'completed', // Chat-only sessions are "completed" (no review pending)
          startedAt: new Date().toISOString(),
          lastUpdatedAt: new Date().toISOString(),
          suggestions: [],
          chatMessages: [],
          changeHistory: [],
        };
        await saveSession(session, projectPath);
        console.log('[chat] Created new chat-only session:', { sessionId: newSessionId, specPath });
      }
    }

    // TypeScript guard - session is guaranteed to exist at this point
    if (!session) {
      return res.status(400).json({ error: 'Either sessionId or specPath is required' });
    }

    // Build message content with context
    let messageContent = message;

    // Add suggestion context if discussing a specific suggestion
    if (suggestionId) {
      const suggestion = session.suggestions.find((s) => s.id === suggestionId);
      if (suggestion) {
        messageContent = `[Discussing Suggestion]
Issue: ${suggestion.issue}
Your previous suggestion: ${suggestion.suggestedFix}

User's question: ${message}`;
      }
    }
    // Add selection context if provided (and not discussing a suggestion)
    else if (selectedText && typeof selectedText === 'string' && selectedText.trim()) {
      messageContent = `[Selection: "${selectedText.trim()}"]\n\n${message}`;
    }

    // Create user message
    const userMessage: ChatMessage = {
      id: randomUUID(),
      role: 'user',
      content: messageContent,
      timestamp: new Date().toISOString(),
      suggestionId,
    };

    // Check if this is the first chat message (need to initialize Claude session)
    const isFirstMessage = session.chatMessages.length === 0;

    // Load spec content for context on first message
    let specContent: string | undefined;
    if (isFirstMessage && session.specFilePath) {
      // Resolve the spec path relative to project root
      const fullSpecPath = join(projectPath, session.specFilePath);
      console.log('[chat] Loading spec content for first message:', { specFilePath: session.specFilePath, fullSpecPath });
      specContent = await loadSpecContent(fullSpecPath);
      console.log('[chat] Spec content loaded:', { length: specContent?.length || 0, hasContent: !!specContent });
    }

    // Run the chat message through Claude
    const chatResponse = await runChatMessage(
      session.sessionId, // Use session's ID (may be newly created)
      messageContent,
      isFirstMessage,
      {
        cwd: projectPath,
        specContent,
        specPath: session.specFilePath,
      }
    );

    // Add user message to session
    session.chatMessages.push(userMessage);

    // Create and add assistant message
    const assistantMessage: ChatMessage = {
      id: randomUUID(),
      role: 'assistant',
      content: chatResponse.error
        ? `Error: ${chatResponse.error}`
        : chatResponse.content,
      timestamp: new Date().toISOString(),
    };
    session.chatMessages.push(assistantMessage);

    session.lastUpdatedAt = new Date().toISOString();
    await saveSession(session, projectPath);

    res.json({
      success: !chatResponse.error,
      sessionId: session.sessionId, // Return session ID so frontend can track it
      userMessage,
      assistantMessage,
      durationMs: chatResponse.durationMs,
      error: chatResponse.error || null,
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

    await saveSession(session, projectPath);

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
        await saveSession(session, projectPath);
      }
    }

    // Create child sessions for each split file with parentSpecPath
    const now = new Date().toISOString();
    for (const filePath of createdFiles) {
      const childSession: SessionFile = {
        sessionId: randomUUID(),
        specFilePath: filePath,
        status: 'in_progress',
        startedAt: now,
        lastUpdatedAt: now,
        suggestions: [],
        changeHistory: [],
        chatMessages: [],
        parentSpecPath: specFile,
      };
      await saveSession(childSession);
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
