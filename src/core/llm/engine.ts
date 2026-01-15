import type { StreamCallbacks } from '../claude/types.js';

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
}
