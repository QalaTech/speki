/**
 * Chat runner for persistent Claude sessions.
 * Uses Claude CLI's --session-id and --resume flags to maintain conversation context.
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { resolveCliPath } from '../cli-path.js';
import { loadGlobalSettings } from '../settings.js';
import type { CliType, ReasoningEffort } from '../../types/index.js';

// Track which Claude sessions have been initialized in this server instance
const initializedSessions = new Set<string>();

/**
 * Check if a Claude session has been initialized in this server instance.
 * This is important after server restarts - even if chat messages exist,
 * the Claude CLI session needs to be reinitialized with spec content.
 */
export function isSessionInitialized(sessionId: string): boolean {
  return initializedSessions.has(sessionId);
}

import { convertCodexLineToJson } from '../llm/drivers/codex-cli.js';

export interface ChatRunnerOptions {
  /** Working directory for CLI */
  cwd?: string;
  /** Timeout in milliseconds (default: 120000 = 2 minutes) */
  timeoutMs?: number;
  /** Spec file content to include in context */
  specContent?: string;
  /** Spec file path for reference */
  specPath?: string;
  /** CLI agent to use (defaults to settings or 'claude') */
  agent?: CliType;
  /** Model identifier */
  model?: string;
  /** Reasoning effort for Codex models */
  reasoningEffort?: ReasoningEffort;
}

export interface ChatResponse {
  content: string;
  durationMs: number;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 1_200_000; // 20 minutes

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
- Making edits to the spec file when the user asks you to

## CRITICAL: Your Scope is SPEC REFINEMENT ONLY
You are a spec reviewer, NOT an implementer. Your job is ONLY to help refine and improve the specification document.

**NEVER offer to:**
- Implement the feature or write code
- Update application code, tests, or non-spec files
- Execute commands or run the implementation
- Ask "Want me to update the code?" or similar

**ALWAYS defer implementation:**
- Say "Implementation will be handled by the task runner when this spec is decomposed."
- Focus ONLY on making the spec clearer, more complete, and better structured
- Your edits are limited to THIS spec/PRD file only

If the user asks about implementation, respond: "My role is to help refine this spec. Once finalized, use Decompose to generate implementation tasks."

## Fast Mode
Answer from prior context only; do not read files unless absolutely necessary to answer a question.
Do not run tools or open files unless explicitly requested.
For simple greetings ("hi", "thanks") or quick questions, respond immediately without tools.

## Response Format - CRITICAL
Your responses are displayed in a chat bubble UI. The LAST text you output becomes the chat message the user sees.

**DO NOT narrate your thinking process.** Never write things like:
- "**Considering the options**" or "**Planning my response**"
- "I'm thinking about..." or "Let me analyze..."
- Headers describing your mental process

**DO** give the answer directly:
- Output ONLY the final answer - no preamble about your thought process
- Keep it concise and conversational
- Use simple formatting (short paragraphs, basic lists)
- Plain text with occasional bold for emphasis

**IMPORTANT: Last message matters**
The user only sees your FINAL text output in the chat window. If you have:
- Questions to ask the user
- Feedback or suggestions
- A summary of what you did
These MUST be in your last/final message, not scattered throughout your output.

**WRONG:** "**Analyzing the spec** I'm looking at... **Proposing changes** Here's what I suggest..."
**RIGHT:** "Here's what I suggest: [the actual suggestion]"

Keep your internal reasoning internal. Only output what the user needs to see.

## IMPORTANT: Spec File Updates
When the user asks you to update, edit, or modify the spec file, you MUST:
1. Use your file editing tools to make the requested changes to the spec file
2. Include the exact marker **[SPEC_UPDATED]** at the END of your response (after your normal message)

This marker tells the UI to refresh the spec content. Always include it when you've modified the file, never include it if you haven't.

Be concise and actionable in your responses.`;

  // Note: We DON'T embed the full spec content - we just reference the file path.
  // This saves tokens on simple messages. Claude can read the file when needed.
  if (specPath) {
    prompt += `

## Spec File - EXACT PATH
The spec file you are reviewing is at this EXACT path: ${specPath}

**CRITICAL:**
- Use this EXACT file path. Do NOT search for files or use similar paths.
- Do NOT read files from .ralph/ directory - those are internal state files.
- The spec file is in the specs/ folder, not .ralph/specs/.
- Read this file ONLY when needed to answer the user's question.`;
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

  // Get agent from options or load from settings
  let agent = options.agent;
  let model = options.model;
  let reasoningEffort = options.reasoningEffort;

  if (!agent) {
    try {
      const settings = await loadGlobalSettings();
      agent = settings.specChat.agent;
      model = model ?? settings.specChat.model;
      reasoningEffort = reasoningEffort ?? settings.specChat.reasoningEffort;
    } catch {
      agent = 'claude'; // Fallback to claude
    }
  }

  const cliPath = resolveCliPath(agent);

  console.log('[runChatMessage] Starting chat:', {
    sessionId,
    isFirstMessage,
    agent,
    model,
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

  // Use the isFirstMessage parameter to determine initialization vs resume
  // isFirstMessage=true means no sessionId exists yet (truly first message)
  // isFirstMessage=false means sessionId exists (resume, even after server restart)
  if (isFirstMessage) {
    // First message ever - initialize with spec content
    args.push('--session-id', sessionId);
    const systemPrompt = buildSystemPrompt(options.specContent, options.specPath);
    console.log('[runChatMessage] Initializing new Claude session with spec:', {
      sessionId,
      hasSpecContent: !!options.specContent,
      specContentLength: options.specContent?.length || 0,
      systemPromptLength: systemPrompt.length,
    });
    args.push('--system-prompt', systemPrompt);
    initializedSessions.add(sessionId); // Mark as initialized
  } else {
    // Resume existing Claude CLI session (sessionId already exists in Claude's storage)
    args.push('--resume', sessionId);
    initializedSessions.add(sessionId); // Track in memory too
    console.log('[runChatMessage] Resuming existing Claude session:', { sessionId });
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
 * Streaming chat callback - invoked for each JSONL line from Claude
 */
export type ChatStreamCallback = (line: string) => void;

/**
 * Run a chat message with JSONL streaming (for showing inner monologue).
 * Same as runChatMessage but uses stream-json format and calls onStreamLine for each JSONL line.
 *
 * @param sessionId - UUID for the chat session
 * @param message - The user's message
 * @param isFirstMessage - Whether this is the first message in the session
 * @param onStreamLine - Callback invoked for each JSONL line (tool calls, thinking, etc.)
 * @param options - Additional options
 * @returns The assistant's final response
 */
export async function runChatMessageStream(
  sessionId: string,
  message: string,
  isFirstMessage: boolean,
  onStreamLine: ChatStreamCallback,
  options: ChatRunnerOptions = {}
): Promise<ChatResponse> {
  const startTime = Date.now();
  const cwd = options.cwd ?? process.cwd();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Get agent from options or load from settings
  let agent = options.agent;
  let model = options.model;
  let reasoningEffort = options.reasoningEffort;

  if (!agent) {
    try {
      const settings = await loadGlobalSettings();
      agent = settings.specChat.agent;
      model = model ?? settings.specChat.model;
      reasoningEffort = reasoningEffort ?? settings.specChat.reasoningEffort;
    } catch {
      agent = 'claude'; // Fallback to claude
    }
  }

  // Normalize agent name for comparison
  const isCodex = agent === 'codex';
  const cliPath = resolveCliPath(agent);

  console.log('[runChatMessageStream] Starting streaming chat:', {
    sessionId,
    isFirstMessage,
    agent,
    isCodex,
    model,
    hasSpecContent: !!options.specContent,
  });

  // Build args based on CLI type
  let args: string[];
  let stdinContent: string;
  const systemPrompt = buildSystemPrompt(options.specContent, options.specPath);

  if (isCodex) {
    // Codex/OpenAI CLI uses different args
    // -s danger-full-access: explicit full filesystem access
    // --dangerously-bypass-approvals-and-sandbox: skip all confirmations
    // -C sets the working directory root for file operations
    // --json outputs JSONL format for streaming
    args = ['exec', '-s', 'danger-full-access', '--dangerously-bypass-approvals-and-sandbox', '-C', cwd, '--json', '-'];
    if (model) {
      args.push('--model', model);
    }
    // For Codex, we need to include the system prompt and message in stdin
    // Codex doesn't have session management, so we include context each time
    stdinContent = `${systemPrompt}\n\n---\nUser: ${message}`;
    initializedSessions.add(sessionId);
    console.log('[runChatMessageStream] Using Codex CLI:', { model });
  } else {
    // Claude CLI args
    args = [
      '--print',
      '--output-format', 'stream-json',
      '--verbose',
      '--dangerously-skip-permissions',
    ];

    // Add extended thinking if reasoningEffort is set
    if (reasoningEffort) {
      const thinkingBudgets: Record<string, number> = {
        'minimal': 2000,
        'low': 5000,
        'medium': 10000,
        'high': 20000,
      };
      const budget = thinkingBudgets[reasoningEffort] || 10000;
      args.push('--thinking-budget', String(budget));
    }

    // Use the isFirstMessage parameter to determine initialization vs resume
    if (isFirstMessage) {
      args.push('--session-id', sessionId);
      args.push('--system-prompt', systemPrompt);
      initializedSessions.add(sessionId);
      console.log('[runChatMessageStream] Initializing new Claude session with spec:', {
        sessionId,
        hasSpecContent: !!options.specContent,
        specContentLength: options.specContent?.length || 0,
        specPath: options.specPath,
      });
    } else {
      args.push('--resume', sessionId);
      initializedSessions.add(sessionId);
      console.log('[runChatMessageStream] Resuming existing Claude session:', { sessionId });
    }
    stdinContent = message;
  }

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let finalResponse = '';

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

    // Capture stdout line-by-line and stream each JSONL line
    let buffer = '';
    let lastToolResultIndex = -1;
    let currentLineIndex = 0;
    const textBlocks: Array<{ index: number; text: string }> = [];

    // Use imported convertCodexLineToJson from codex-cli.ts

    cliProcess.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      buffer += text;

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim()) {
          // Both Claude and Codex (with --json) output JSONL format
          const jsonLine = line.trim();

          // Invoke callback for each JSONL line (this sends to SSE)
          onStreamLine(jsonLine);

          // Track text blocks and tool results to separate thinking from final response
          try {
            const parsed = JSON.parse(jsonLine);

            // Track when tool results appear (marks end of thinking phase)
            if (parsed.type === 'user' && parsed.message?.content) {
              const content = parsed.message.content;
              if (Array.isArray(content) && content.some(block => block.type === 'tool_result')) {
                lastToolResultIndex = currentLineIndex;
              }
            }

            // Collect text blocks with their index (works for both Claude and Codex formats)
            if (parsed.type === 'text' && parsed.text) {
              textBlocks.push({ index: currentLineIndex, text: parsed.text });
            } else if (parsed.type === 'assistant' && parsed.message?.content) {
              const content = parsed.message.content;
              if (Array.isArray(content)) {
                for (const block of content) {
                  if (block.type === 'text' && block.text) {
                    textBlocks.push({ index: currentLineIndex, text: block.text });
                  }
                }
              }
            }

            currentLineIndex++;
          } catch {
            // Ignore parse errors - some lines might not be JSON
            currentLineIndex++;
          }
        }
      }
    });

    cliProcess.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    // Send the message via stdin
    cliProcess.stdin.write(stdinContent);
    cliProcess.stdin.end();

    cliProcess.on('close', (code) => {
      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;

      // Process any remaining buffer
      if (buffer.trim()) {
        onStreamLine(buffer.trim());
      }

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

      // Build final response from text blocks that appear AFTER the last tool result
      // This filters out thinking/inner monologue text that appears during tool use
      if (lastToolResultIndex >= 0) {
        finalResponse = textBlocks
          .filter(block => block.index > lastToolResultIndex)
          .map(block => block.text)
          .join('');
      } else {
        // No tool results - include all text blocks (simple chat without tools)
        finalResponse = textBlocks
          .map(block => block.text)
          .join('');
      }

      resolve({
        content: finalResponse.trim() || stdout.trim(),
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
