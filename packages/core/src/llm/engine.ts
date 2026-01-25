import type { StreamCallbacks } from '../claude/types.js';
import type { ReviewOptions, ReviewResult } from '../types/index.js';

export interface EngineAvailability {
  available: boolean;
  name: string;
  version?: string;
}

export interface RunStreamOptions {
  promptPath: string;
  cwd: string;
  logDir: string;
  iteration: number;
  callbacks?: StreamCallbacks;
  skipPermissions?: boolean;
  model?: string;
  /** Permission mode to use (e.g., 'plan' for deep planning mode) */
  permissionMode?: 'acceptEdits' | 'bypassPermissions' | 'default' | 'delegate' | 'dontAsk' | 'plan';
}

export interface RunStreamResult {
  success: boolean;
  isComplete: boolean;
  durationMs: number;
  output: string;
  jsonlPath: string;
  stderrPath: string;
  exitCode: number | null;
  claudePid?: number; // driver-specific
}

export interface RunChatOptions {
  sessionId: string;
  message: string;
  isFirstMessage: boolean;
  cwd?: string;
  timeoutMs?: number;
  specContent?: string;
  specPath?: string;
  model?: string;
  /** Optional streaming callback for real-time updates (JSONL lines) */
  onStreamLine?: (line: string) => void;
}

export interface RunChatResult {
  content: string;
  durationMs: number;
  error?: string;
}

export interface Engine {
  /** Engine identifier */
  name: string;
  /** Is engine available on this system */
  isAvailable(): Promise<EngineAvailability>;
  /** Run a streaming completion with a prompt file */
  runStream(options: RunStreamOptions): Promise<RunStreamResult>;
  /** Run a chat message with optional session semantics */
  runChat(options: RunChatOptions): Promise<RunChatResult>;
  /** Run a peer review with generic options (agent-agnostic) */
  runReview(options: ReviewOptions): Promise<ReviewResult>;
}
