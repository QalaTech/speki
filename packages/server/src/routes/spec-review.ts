import { Router } from 'express';
import { promises as fs } from 'fs';
import { join, basename, dirname } from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { projectContext } from '../middleware/project-context.js';
import { runSpecReview } from '@speki/core';
import { executeSplit, buildSplitContent } from '@speki/core';
import { generateSplitProposal, detectGodSpec } from '@speki/core';
import { loadSession, saveSession } from '@speki/core';
import { loadSpecContent, isSessionInitialized } from '@speki/core';
import { selectEngine } from '@speki/core';
import {
  extractSpecId,
  getSpecLogsDir,
  readSpecMetadata,
  initSpecMetadata,
  detectSpecType,
  getChildSpecs,
  loadPRDForSpec,
} from '@speki/core';
import { publishSpecReview } from '../sse.js';
import type { SessionFile, SplitProposal, CodebaseContext, ChatMessage } from '@speki/core';

const router = Router();

// Apply project context middleware to all routes
router.use(projectContext(true));

/**
 * POST /api/spec-review/chat/stream
 * Send a chat message with SSE streaming for inner monologue (tool calls, thinking, etc.)
 * This endpoint streams JSONL output from Claude CLI in real-time.
 */
router.post('/chat/stream', async (req, res) => {
  console.log('[chat/stream] REQUEST START:', {
    body: req.body,
    projectPath: req.projectPath,
    hasProjectPath: !!req.projectPath,
  });

  try {
    const { sessionId, message, suggestionId, selectedText, specPath } = req.body;

    if (!message) {
      console.log('[chat/stream] ERROR: No message provided');
      return res.status(400).json({ error: 'message is required' });
    }

    const projectPath = req.projectPath!;
    console.log('[chat/stream] Using projectPath:', projectPath);
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
        console.log('[chat/stream] Created new chat-only session:', { sessionId: newSessionId, specPath });
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

    // Determine if this is truly the first message (no chat messages yet)
    // vs. a resumed session after server restart (sessionId exists but not in memory)
    const isFirstMessage = !session.chatMessages || session.chatMessages.length === 0;
    const needsInitialization = isFirstMessage || !isSessionInitialized(session.sessionId);

    // Use request specPath if provided, otherwise fall back to session's specFilePath
    // This ensures the user sees context for the spec they have open, not a stale session spec
    const effectiveSpecPath = specPath || session.specFilePath;
    const fullSpecPath = effectiveSpecPath ? join(projectPath, effectiveSpecPath) : undefined;

    // If spec changed from what's in session, create a new session for the new spec
    const specChanged = specPath && session.specFilePath && specPath !== session.specFilePath;
    if (specChanged) {
      console.log('[chat/stream] Spec changed - creating new session:', { oldSpec: session.specFilePath, newSpec: specPath });
      // Create a new session for the new spec (don't reuse old session)
      const newSessionId = randomUUID();
      session = {
        sessionId: newSessionId,
        specFilePath: specPath,
        status: 'completed',
        startedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        suggestions: [],
        chatMessages: [],
        changeHistory: [],
      };
      await saveSession(session, projectPath);
    }

    // Load spec content for context on first message OR when spec changed
    // This ensures the assistant always has context for the currently open spec
    let specContent: string | undefined;
    const needsSpecContent = isFirstMessage || specChanged;
    if (needsSpecContent && fullSpecPath) {
      console.log('[chat/stream] Loading spec content:', { reason: specChanged ? 'spec changed' : 'first message', fullSpecPath });
      specContent = await loadSpecContent(fullSpecPath);
      console.log('[chat/stream] Spec content loaded:', { length: specContent?.length || 0, hasContent: !!specContent });
    }

    // Set up SSE headers
    console.log('[chat/stream] Setting up SSE headers');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(': connected\n\n');
    console.log('[chat/stream] SSE headers sent, connection established');

    // Stream callback - publishes each JSONL line via SSE
    // Also detects file modifications and publishes file-changed events
    const onStreamLine = (line: string) => {
      console.log('[chat/stream] Streaming line:', line.substring(0, 100));
      publishSpecReview(projectPath, 'spec-review/chat-stream', {
        sessionId: session!.sessionId,
        line,
      });

      // Detect file modifications from the stream (handles both Codex and Claude CLI formats)
      try {
        const parsed = JSON.parse(line);

        // Codex format: {"type":"text","text":"{\"id\":\"0\",\"msg\":{\"type\":\"patch_apply_end\",...}}"}
        if (parsed.type === 'text' && parsed.text) {
          try {
            const inner = JSON.parse(parsed.text);
            if (inner.msg?.type === 'patch_apply_end' || inner.msg?.type === 'turn_diff') {
              const filePath = inner.msg?.file_path || inner.msg?.path || session!.specFilePath;
              if (filePath) {
                console.log('[chat/stream] Codex file modification detected:', filePath);
                publishSpecReview(projectPath, 'spec-review/file-changed', {
                  filePath: filePath,
                  changeType: 'change',
                });
              }
            }
          } catch {
            // Inner text isn't JSON, ignore
          }
        }

        // File changes are detected by the fs watcher (file-watcher.ts).
        // No need to emit file-changed events from tool_result — the watcher
        // already covers actual file modifications and avoids false positives
        // from read-only tools (Read, Grep, Bash, etc.).
      } catch {
        // Not JSON or parsing failed - ignore, it's fine
      }
    };

    // Run the streaming chat message via Engine abstraction
    console.log('[chat/stream] Starting engine.runChat with streaming...');
    const { engine, model } = await selectEngine({
      engineName: req.body.engineName,
      model: req.body.model,
      projectPath,
      purpose: 'specChat',
    });
    console.log('[chat/stream] Using model:', model);
    // Treat as first message if no chat history OR spec changed (need to reinitialize with new context)
    const needsNewSystemPrompt = isFirstMessage || specChanged;
    const chatResponse = await engine.runChat({
      sessionId: session.sessionId,
      message: messageContent,
      isFirstMessage: needsNewSystemPrompt, // True if no history or spec changed
      cwd: projectPath,
      specContent,
      specPath: fullSpecPath, // Use absolute path so agent doesn't confuse with .speki/specs/ files
      model, // Pass the selected model to the engine
      onStreamLine,
    });
    console.log('[chat/stream] runChatMessageStream completed:', {
      hasError: !!chatResponse.error,
      contentLength: chatResponse.content?.length,
      durationMs: chatResponse.durationMs,
    });

    if (chatResponse.error) {
      console.error('[chat/stream] Engine error:', chatResponse.error);
    }

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

    // Send final response as SSE event
    console.log('[chat/stream] Sending complete event');
    res.write(`event: complete\n`);
    res.write(`data: ${JSON.stringify({
      success: !chatResponse.error,
      sessionId: session.sessionId,
      userMessage,
      assistantMessage,
      durationMs: chatResponse.durationMs,
      error: chatResponse.error || null,
    })}\n\n`);

    console.log('[chat/stream] Ending response');
    res.end();
    console.log('[chat/stream] REQUEST COMPLETE');
  } catch (error) {
    console.error('[chat/stream] ERROR:', error);
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({
      error: 'Failed to send chat message',
      details: error instanceof Error ? error.message : String(error),
    })}\n\n`);
    res.end();
  }
});

/**
 * POST /api/spec-review/chat/clear
 * Clear chat messages for a session (start fresh conversation)
 */
router.post('/chat/clear', async (req, res) => {
  const projectPath = req.projectPath;
  const { specPath } = req.body;

  if (!specPath) {
    return res.status(400).json({ error: 'specPath is required' });
  }

  try {
    // Load existing session
    const session = await loadSession(specPath, projectPath);

    if (!session) {
      return res.status(404).json({ error: 'No session found for this spec' });
    }

    // Clear chat messages and generate new session ID (so Claude CLI starts fresh)
    const newSessionId = randomUUID();
    session.sessionId = newSessionId;
    session.chatMessages = [];

    // Save updated session
    await saveSession(session, projectPath);

    console.log('[chat/clear] Cleared chat for spec:', { specPath, newSessionId });

    return res.json({
      success: true,
      sessionId: newSessionId,
      message: 'Chat cleared successfully'
    });
  } catch (error) {
    console.error('[chat/clear] Error:', error);
    return res.status(500).json({
      error: 'Failed to clear chat',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

const SPECS_DIRECTORY = 'specs';

interface SpecFileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: SpecFileNode[];
  reviewStatus?: 'reviewed' | 'pending' | 'god-spec' | 'in-progress' | 'none';
  specType?: 'prd' | 'tech-spec' | 'bug';
  /** Parent spec path (for tech specs linked to PRDs) */
  parentSpecId?: string;
  /** Linked child specs (tech specs under PRDs) */
  linkedSpecs?: SpecFileNode[];
  /** Progress for PRDs: completed user stories / total */
  progress?: { completed: number; total: number };
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

  // Sort: directories first, then files, by date descending (newest first)
  nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return b.name.localeCompare(a.name);
  });

  return nodes;
}

/**
 * Extract base name from spec filename (without type suffix and extension).
 * e.g., "foo.prd.md" -> "foo", "foo.tech.md" -> "foo"
 */
function getSpecBaseName(filename: string): string {
  return filename
    .replace(/\.(prd|tech|bug)\.md$/i, '')
    .replace(/\.md$/i, '');
}

/**
 * Enrich tree nodes with metadata (specType, parent/child links, progress).
 * Tech specs are moved under their parent PRDs as linkedSpecs.
 */
async function enrichTreeWithMetadata(
  nodes: SpecFileNode[],
  projectPath: string
): Promise<SpecFileNode[]> {
  // First pass: collect all file nodes and enrich with metadata
  const fileNodeMap = new Map<string, SpecFileNode>();
  const prdsByBaseName = new Map<string, SpecFileNode>();
  const techSpecsWithParent: Array<{ node: SpecFileNode; parentPath: string }> = [];

  async function collectAndEnrich(nodeList: SpecFileNode[]): Promise<void> {
    for (const node of nodeList) {
      if (node.type === 'file' && node.name.endsWith('.md')) {
        const specId = extractSpecId(node.path);
        fileNodeMap.set(node.path, node);

        // Detect spec type
        const fullPath = join(projectPath, node.path);
        const detected = await detectSpecType(fullPath);
        node.specType = detected.type;

        // Track PRDs by base name for filename-based parent inference
        if (detected.type === 'prd') {
          const baseName = getSpecBaseName(node.name);
          prdsByBaseName.set(baseName, node);
        }

        // Check for parent (tech specs linked to PRDs)
        // First check frontmatter (from detectSpecType), then check metadata.json
        let parentPath = detected.parent;

        if (!parentPath) {
          // Check metadata.json for parent link
          try {
            const metadata = await readSpecMetadata(projectPath, specId);
            if (metadata?.parent) {
              parentPath = metadata.parent;
            }
          } catch {
            // No metadata file
          }
        }

        if (parentPath) {
          // Parent path is like "specs/foo.prd.md" - normalize to relative path
          const normalizedParentPath = parentPath.startsWith('specs/')
            ? parentPath
            : `specs/${parentPath}`;
          node.parentSpecId = normalizedParentPath;
          techSpecsWithParent.push({ node, parentPath: normalizedParentPath });
        }

        // For PRDs, load progress
        if (detected.type === 'prd') {
          try {
            const prdData = await loadPRDForSpec(projectPath, specId);
            if (prdData?.userStories) {
              const total = prdData.userStories.length;
              const completed = prdData.userStories.filter(s => s.passes).length;
              node.progress = { completed, total };
            }
          } catch {
            // PRD data not available yet
          }
        }
      }

      if (node.children) {
        await collectAndEnrich(node.children);
      }
    }
  }

  await collectAndEnrich(nodes);

  // Fallback: infer parent from filename pattern for tech specs without explicit parent
  // e.g., "foo.tech.md" links to "foo.prd.md" if both exist
  for (const [path, node] of fileNodeMap) {
    if (node.specType === 'tech-spec' && !node.parentSpecId) {
      const baseName = getSpecBaseName(node.name);
      const parentPrd = prdsByBaseName.get(baseName);
      if (parentPrd) {
        node.parentSpecId = parentPrd.path;
        techSpecsWithParent.push({ node, parentPath: parentPrd.path });
      }
    }
  }

  // Second pass: move tech specs under their parent PRDs as linkedSpecs
  const techSpecPaths = new Set(techSpecsWithParent.map(t => t.node.path));

  for (const { node: techSpec, parentPath } of techSpecsWithParent) {
    const parentNode = fileNodeMap.get(parentPath);
    if (parentNode) {
      if (!parentNode.linkedSpecs) {
        parentNode.linkedSpecs = [];
      }
      parentNode.linkedSpecs.push(techSpec);
    }
  }

  // Third pass: filter out tech specs from the main tree (they're now under parents)
  function filterTechSpecs(nodeList: SpecFileNode[]): SpecFileNode[] {
    return nodeList
      .filter(node => !techSpecPaths.has(node.path))
      .map(node => {
        if (node.children) {
          return { ...node, children: filterTechSpecs(node.children) };
        }
        return node;
      });
  }

  return filterTechSpecs(nodes);
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

    // Enrich with metadata and build parent/child links
    const enrichedFiles = await enrichTreeWithMetadata(files, projectPath);

    res.json({ files: enrichedFiles });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to list spec files',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Type suffix mappings for spec filenames
 */
const TYPE_SUFFIXES: Record<string, string> = {
  'prd': '.prd.md',
  'tech-spec': '.tech.md',
  'bug': '.bug.md',
};

// Module-level path resolution for template loading
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load template for a spec type
 */
async function loadSpecTemplate(type: string): Promise<string> {
  const templateNames: Record<string, string> = {
    'prd': 'prd.md',
    'tech-spec': 'tech-spec.md',
    'bug': 'bug.md',
  };

  const templateName = templateNames[type] || 'prd.md';

  // Try loading from:
  // 1. Project's .speki/templates/
  // 2. CLI package's templates/specs/ (relative to server package)
  const templatePaths = [
    join(process.cwd(), '.speki', 'templates', templateName),
    // From server dist: packages/server/dist/routes -> packages/cli/templates/specs
    join(__dirname, '..', '..', '..', 'cli', 'templates', 'specs', templateName),
    // From server src (dev): packages/server/src/routes -> packages/cli/templates/specs
    join(__dirname, '..', '..', '..', 'cli', 'templates', 'specs', templateName),
  ];

  for (const templatePath of templatePaths) {
    try {
      const content = await fs.readFile(templatePath, 'utf-8');
      console.log(`[loadSpecTemplate] Loaded template from: ${templatePath}`);
      return content;
    } catch {
      // Try next path
    }
  }

  console.log(`[loadSpecTemplate] No template found, using default for type: ${type}`);
  // Return minimal default if no template found
  return `---
type: ${type}
status: draft
created: {{date}}
---

# {{title}}

`;
}

/**
 * POST /api/spec-review/new
 * Create a new spec file with datetime prefix and type
 */
router.post('/new', async (req, res) => {
  try {
    const { name, type = 'prd', parent } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'name is required' });
    }

    // Validate type
    const validTypes = ['prd', 'tech-spec', 'bug'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid type: ${type}. Must be one of: ${validTypes.join(', ')}` });
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

    // Build filename with type suffix
    const typeSuffix = TYPE_SUFFIXES[type] || '.md';
    const fileName = `${datePrefix}-${sanitizedName}${typeSuffix}`;
    const relativePath = join(SPECS_DIRECTORY, fileName);
    const fullPath = join(projectPath, relativePath);

    // Check if file already exists
    try {
      await fs.access(fullPath);
      return res.status(409).json({ error: 'A file with this name already exists' });
    } catch {
      // File doesn't exist, good to proceed
    }

    // Load template and fill in placeholders
    let content = await loadSpecTemplate(type);
    content = content
      .replace(/\{\{date\}\}/g, now.toISOString())
      .replace(/\{\{title\}\}/g, name.trim())
      .replace(/\{\{parent\}\}/g, parent || '');

    await fs.writeFile(fullPath, content, 'utf-8');

    // Initialize metadata so it appears in lists immediately
    try {
      await initSpecMetadata(projectPath, fullPath, { type });
    } catch (metaError) {
      console.error('[new] Failed to initialize metadata:', metaError);
      // Don't fail the whole request if only metadata fails
    }

    res.json({
      success: true,
      filePath: relativePath,
      fileName,
      type,
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
    const decodedPath = decodeURIComponent(req.params.encodedPath);
    // Handle both absolute and relative paths
    const fullPath = decodedPath.startsWith('/')
      ? decodedPath
      : join(req.projectPath!, decodedPath);

    // Security: ensure path is within project directory
    if (!fullPath.startsWith(req.projectPath!)) {
      return res.status(403).json({ error: 'Access denied: path outside project' });
    }

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
    const decodedPath = decodeURIComponent(req.params.encodedPath);
    // Handle both absolute and relative paths
    const fullPath = decodedPath.startsWith('/')
      ? decodedPath
      : join(req.projectPath!, decodedPath);

    // Security: ensure path is within project directory
    if (!fullPath.startsWith(req.projectPath!)) {
      return res.status(403).json({ error: 'Access denied: path outside project' });
    }

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
    const { specFile, timeout, engineName, model, sessionId: existingSessionId } = req.body;
    console.log('[spec-review/start] Request received:', { specFile, existingSessionId, engineName, model, projectPath: req.projectPath });

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
    publishSpecReview(projectPath, 'spec-review/status', { sessionId, status: 'in_progress' });

    // Return immediately - review runs in background
    res.status(202).json({
      sessionId,
      status: 'in_progress',
      message: 'Spec review started',
    });

    // Run review in background (fire-and-forget)
    (async () => {
      try {
        // Use per-spec log directory for isolation
        const specId = extractSpecId(resolvedSpecFile);
        const specLogsDir = getSpecLogsDir(projectPath, specId);

        // Create stream callbacks for real-time log output
        const streamCallbacks = {
          onText: (text: string) => {
            publishSpecReview(projectPath, 'spec-review/log', { sessionId, line: text });
          },
          onToolCall: (name: string, detail: string) => {
            publishSpecReview(projectPath, 'spec-review/log', { sessionId, line: `🔧 ${name}: ${detail}` });
          },
          onToolResult: (result: string) => {
            publishSpecReview(projectPath, 'spec-review/log', { sessionId, line: result });
          },
        };

        const result = await runSpecReview(resolvedSpecFile, {
          cwd: projectPath,
          timeoutMs: timeout,
          engineName,
          model,
          logDir: specLogsDir,
          streamCallbacks,
        });

        session.status = 'completed';
        session.completedAt = new Date().toISOString();
        session.lastUpdatedAt = session.completedAt;
        session.reviewResult = result;
        session.suggestions = result.suggestions;
        session.logPath = result.logPath;

        await saveSession(session, projectPath);

        publishSpecReview(projectPath, 'spec-review/result', {
          sessionId,
          verdict: result.verdict,
          suggestions: result.suggestions,
          logPath: result.logPath,
        });
        publishSpecReview(projectPath, 'spec-review/complete', { sessionId });
      } catch (reviewError) {
        session.status = 'needs_attention';
        session.lastUpdatedAt = new Date().toISOString();

        await saveSession(session, projectPath);
        publishSpecReview(projectPath, 'spec-review/status', { sessionId, status: 'needs_attention' });
        publishSpecReview(projectPath, 'spec-review/error', {
          sessionId,
          error: reviewError instanceof Error ? reviewError.message : String(reviewError),
        });
      }
    })();
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

    if (!action || !['approved', 'rejected', 'edited', 'dismissed', 'resolved'].includes(action)) {
      return res.status(400).json({ error: 'action must be one of: approved, rejected, edited, dismissed, resolved' });
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
 * PUT /api/spec-review/suggestion
 * Update a suggestion's status (approve/reject/edit/dismiss)
 */
router.put('/suggestion', async (req, res) => {
  try {
    const { sessionId, suggestionId, action, userVersion } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    if (!suggestionId) {
      return res.status(400).json({ error: 'suggestionId is required' });
    }

    if (!action || !['approved', 'rejected', 'edited', 'dismissed', 'resolved'].includes(action)) {
      return res.status(400).json({ error: 'action must be one of: approved, rejected, edited, dismissed, resolved' });
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
      error: 'Failed to update suggestion',
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

    // Determine if this is truly the first message (no sessionId in session file yet)
    // vs. a resumed session after server restart (sessionId exists but not in memory)
    const isFirstMessage = !session.sessionId;

    // Compute full absolute path for the spec file
    const fullSpecPath = session.specFilePath ? join(projectPath, session.specFilePath) : undefined;

    // Load spec content for context on first message (not on resume)
    let specContent: string | undefined;
    if (isFirstMessage && fullSpecPath) {
      console.log('[chat] Loading spec content for first message:', { specFilePath: session.specFilePath, fullSpecPath });
      specContent = await loadSpecContent(fullSpecPath);
      console.log('[chat] Spec content loaded:', { length: specContent?.length || 0, hasContent: !!specContent });
    }

    // Run the chat message via Engine abstraction
    const { engine, model } = await selectEngine({
      engineName: req.body.engineName,
      model: req.body.model,
      projectPath,
      purpose: 'specChat',
    });
    const chatResponse = await engine.runChat({
      sessionId: session.sessionId,
      message: messageContent,
      isFirstMessage, // Only true if no sessionId exists yet
      cwd: projectPath,
      specContent,
      specPath: fullSpecPath, // Use absolute path so agent doesn't confuse with .speki/specs/ files
      model, // Pass the selected model to the engine
    });

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
  const specsDir = join(projectPath, '.speki', 'specs');

  try {
    const specIds = await fs.readdir(specsDir);

    for (const specId of specIds) {
      try {
        const sessionPath = join(specsDir, specId, 'session.json');
        const content = await fs.readFile(sessionPath, 'utf-8');
        const session = JSON.parse(content) as SessionFile;

        if (session.sessionId === sessionId) {
          return session;
        }
      } catch {
        // Skip specs without session files
        continue;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export default router;
