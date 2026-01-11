/**
 * Chat runner for persistent Claude sessions.
 * Uses Claude CLI's --session-id and --resume flags to maintain conversation context.
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { resolveCliPath } from '../cli-path.js';

export interface ChatRunnerOptions {
  /** Working directory for Claude CLI */
  cwd?: string;
  /** Timeout in milliseconds (default: 120000 = 2 minutes) */
  timeoutMs?: number;
  /** Spec file content to include in context */
  specContent?: string;
  /** Spec file path for reference */
  specPath?: string;
}

export interface ChatResponse {
  content: string;
  durationMs: number;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 120000; // 2 minutes

/**
 * Build the system prompt for the chat session.
 */
function buildSystemPrompt(specContent?: string, specPath?: string): string {
  let prompt = `You are a helpful assistant reviewing a software specification document.
Your role is to help the user improve their spec by:
- Answering questions about best practices for PRDs/specs
- Suggesting improvements to specific sections
- Clarifying requirements
- Identifying potential issues or ambiguities

## Response Format
Your responses are displayed in a chat bubble UI on the frontend. Format your messages for this context:
- Keep responses concise and conversational
- Use simple formatting (short paragraphs, basic lists)
- Avoid heavy markdown formatting (tables, complex headers) as they don't render well in chat bubbles
- Avoid ASCII art or diagrams
- Use plain text with occasional bold (**text**) for emphasis
- Break up long responses into digestible paragraphs

Be concise and actionable in your responses.`;

  if (specContent && specPath) {
    prompt += `

## Current Spec Being Reviewed
File: ${specPath}

\`\`\`markdown
${specContent}
\`\`\``;
  }

  return prompt;
}

/**
 * Run a chat message through Claude with session persistence.
 *
 * @param sessionId - UUID for the chat session (used for persistence)
 * @param message - The user's message
 * @param isFirstMessage - Whether this is the first message in the session
 * @param options - Additional options
 * @returns The assistant's response
 */
export async function runChatMessage(
  sessionId: string,
  message: string,
  isFirstMessage: boolean,
  options: ChatRunnerOptions = {}
): Promise<ChatResponse> {
  const startTime = Date.now();
  const cwd = options.cwd ?? process.cwd();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cliPath = resolveCliPath('claude');

  console.log('[runChatMessage] Starting chat:', {
    sessionId,
    isFirstMessage,
    hasSpecContent: !!options.specContent,
    specContentLength: options.specContent?.length || 0,
    specPath: options.specPath,
    cwd,
  });

  // Build args
  const args = [
    '--print',
    '--output-format', 'text',
    '--dangerously-skip-permissions',
  ];

  // First message uses --session-id to create session
  // Subsequent messages use --resume to continue
  if (isFirstMessage) {
    args.push('--session-id', sessionId);

    // Add system prompt for first message to set context
    const systemPrompt = buildSystemPrompt(options.specContent, options.specPath);
    console.log('[runChatMessage] System prompt length:', systemPrompt.length);
    args.push('--system-prompt', systemPrompt);
  } else {
    args.push('--resume', sessionId);
  }

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const cliProcess = spawn(cliPath, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NO_COLOR: '1',
        FORCE_COLOR: '0',
      },
    });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      cliProcess.kill('SIGTERM');
      setTimeout(() => {
        cliProcess.kill('SIGKILL');
      }, 5000);
    }, timeoutMs);

    cliProcess.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    cliProcess.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    // Send the message via stdin
    cliProcess.stdin.write(message);
    cliProcess.stdin.end();

    cliProcess.on('close', (code) => {
      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;

      if (timedOut) {
        resolve({
          content: '',
          durationMs,
          error: 'Chat response timed out',
        });
        return;
      }

      if (code !== 0 && !stdout.trim()) {
        resolve({
          content: '',
          durationMs,
          error: stderr || `Claude CLI exited with code ${code}`,
        });
        return;
      }

      resolve({
        content: stdout.trim(),
        durationMs,
      });
    });

    cliProcess.on('error', (err) => {
      clearTimeout(timeoutId);
      resolve({
        content: '',
        durationMs: Date.now() - startTime,
        error: `Failed to spawn Claude CLI: ${err.message}`,
      });
    });
  });
}

/**
 * Load spec content from file for chat context.
 */
export async function loadSpecContent(specPath: string): Promise<string> {
  try {
    const content = await fs.readFile(specPath, 'utf-8');
    console.log(`[loadSpecContent] Successfully loaded spec from: ${specPath} (${content.length} chars)`);
    return content;
  } catch (err) {
    console.error(`[loadSpecContent] Failed to load spec from: ${specPath}`, err);
    return '';
  }
}
