/**
 * Chat runner for persistent Claude sessions.
 * Delegates to Engine.runChat for both Claude and Codex CLI spawning.
 */

import { promises as fs } from 'fs';
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

  // Import engine selection here to avoid circular deps
  const { selectEngine } = await import('../llm/engine-factory.js');

  // Select engine based on settings
  const { engine, model } = await selectEngine({
    engineName: options.agent,
    model: options.model,
    purpose: 'specChat',
  });

  // Delegate to engine.runChat
  const result = await engine.runChat({
    sessionId,
    message,
    isFirstMessage,
    cwd,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    model,
    specContent: options.specContent,
    specPath: options.specPath,
    onStreamLine,
  });

  return {
    content: result.content,
    durationMs: result.durationMs,
    error: result.error,
  };
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
