/**
 * Claude CLI Runner
 *
 * Spawns the Claude CLI with the correct flags and handles:
 * - Piping prompt content to stdin
 * - Capturing stdout as JSONL
 * - Parsing the stream in real-time
 * - Saving logs to files
 * - Capturing stderr separately
 */

import { spawn } from 'child_process';
import { createWriteStream, promises as fs } from 'fs';
import { join } from 'path';
import { PassThrough } from 'stream';
import { parseStream, createConsoleCallbacks } from './stream-parser.js';
import { resolveCliPath } from '../cli-path.js';
import { ClaudeStreamNormalizer } from '../llm/normalizers/claude-normalizer.js';
import type { ParsedOutput, StreamCallbacks } from './types.js';

/** Permission mode options for Claude CLI */
export type PermissionMode = 'acceptEdits' | 'bypassPermissions' | 'default' | 'delegate' | 'dontAsk' | 'plan';

export interface RunOptions {
  /** Path to the prompt file to send to Claude */
  promptPath: string;
  /** Working directory for Claude CLI */
  cwd: string;
  /** Directory to save logs */
  logDir: string;
  /** Iteration number (for log file naming) */
  iteration: number;
  /** Callbacks for stream events */
  callbacks?: StreamCallbacks;
  /** Skip permissions check (--dangerously-skip-permissions) */
  skipPermissions?: boolean;
  /** Optional timeout for the CLI process in milliseconds */
  timeoutMs?: number;
  /** Disable tool use for this invocation */
  disableTools?: boolean;
  /** Optional model identifier to pass to CLI */
  model?: string;
  /** Permission mode (e.g., 'plan' for deep planning mode) */
  permissionMode?: PermissionMode;
  /** Session ID for session continuity */
  sessionId?: string;
  /** If true, resume an existing session rather than creating a new one */
  resumeSession?: boolean;
}

export interface RunResult {
  /** Whether the run completed without errors */
  success: boolean;
  /** Whether Claude signaled completion with <promise>COMPLETE</promise> */
  isComplete: boolean;
  /** Duration of the run in milliseconds */
  durationMs: number;
  /** Full text output from Claude */
  output: string;
  /** Path to the JSONL log file */
  jsonlPath: string;
  /** Path to the stderr log file */
  stderrPath: string;
  /** Exit code from Claude CLI */
  exitCode: number | null;
  /** Parsed output with tool calls */
  parsed: ParsedOutput;
  /** PID of the Claude subprocess */
  claudePid: number | undefined;
}

/**
 * Run Claude CLI with a prompt and return the result
 */
export async function runClaude(options: RunOptions): Promise<RunResult> {
  const {
    promptPath,
    cwd,
    logDir,
    iteration,
    callbacks = createConsoleCallbacks(),
    skipPermissions = true,
    timeoutMs,
    disableTools = false,
    model,
    permissionMode,
    sessionId,
    resumeSession,
  } = options;

  // Ensure log directory exists
  await fs.mkdir(logDir, { recursive: true });

  const jsonlPath = join(logDir, `iteration_${iteration}.jsonl`);
  const normPath = join(logDir, `iteration_${iteration}.norm.jsonl`);
  const stderrPath = join(logDir, `iteration_${iteration}.err`);

  // Read the prompt content
  const promptContent = await fs.readFile(promptPath, 'utf-8');

  const startTime = Date.now();

  // Build Claude CLI arguments
  const args = ['--print', '--verbose', '--output-format', 'stream-json'];
  if (skipPermissions) {
    args.unshift('--dangerously-skip-permissions');
  }
  if (disableTools) {
    args.push('--tools', '');
  }

  // Add model if provided
  if (model && model.trim()) {
    args.push('--model', model.trim());
  }

  // Add permission mode if provided (e.g., 'plan' for deep planning mode)
  if (permissionMode) {
    args.push('--permission-mode', permissionMode);
  }

  // Add session flags for session continuity
  if (sessionId) {
    if (resumeSession) {
      args.push('--resume', sessionId);
    } else {
      args.push('--session-id', sessionId);
    }
  }

  // Resolve Claude CLI path - handles cases where claude is an alias not in PATH
  const claudePath = resolveCliPath('claude');

  // Spawn Claude CLI
  const claude = spawn(claudePath, args, {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      // Ensure no TTY coloring that could interfere
      NO_COLOR: '1',
      FORCE_COLOR: '0',
    },
  });

  // Create write streams for logs
  const jsonlStream = createWriteStream(jsonlPath);
  const normStream = createWriteStream(normPath);
  const stderrStream = createWriteStream(stderrPath);

  let timedOut = false;
  const timeoutId = timeoutMs && timeoutMs > 0
    ? setTimeout(() => {
      timedOut = true;
      claude.kill('SIGTERM');
      setTimeout(() => {
        claude.kill('SIGKILL');
      }, 5000);
    }, timeoutMs)
    : undefined;

  // Write initial engine metadata line to JSONL for downstream parsers (UI-safe; system lines are ignored by existing parser)
  try {
    const meta = JSON.stringify({ type: 'system', subtype: 'qala-engine', engine: 'claude-cli' });
    jsonlStream.write(meta + "\n");
  } catch {
    // non-fatal
  }

  // Write initial metadata to normalized stream
  try {
    const metaEvent = JSON.stringify({ type: 'metadata', data: { engine: 'claude-cli', timestamp: new Date().toISOString() } });
    normStream.write(metaEvent + '\n');
  } catch {
    // non-fatal
  }

  // Tee stdout: one copy to JSONL file, one to parser, and normalize in real-time
  const parserStream = new PassThrough();
  const normalizer = new ClaudeStreamNormalizer();

  claude.stdout.on('data', (chunk: Buffer) => {
    const text = chunk.toString();

    // Write to JSONL file
    jsonlStream.write(chunk);

    // Pass to parser
    parserStream.write(chunk);

    // Normalize and write to .norm.jsonl in real-time
    try {
      const events = normalizer.normalize(text);
      for (const event of events) {
        normStream.write(JSON.stringify(event) + '\n');
      }
    } catch {
      // Ignore normalization errors - continue streaming
    }
  });

  claude.stdout.on('end', () => {
    jsonlStream.end();
    parserStream.end();
    normStream.end();
  });

  // Capture stderr
  claude.stderr.pipe(stderrStream);

  // Send prompt to stdin
  claude.stdin.write(promptContent);
  claude.stdin.end();

  // Parse the stream
  const parsed = await parseStream(parserStream, callbacks);

  // Wait for process to exit
  const exitCode = await new Promise<number | null>((resolve) => {
    claude.on('close', (code) => {
      resolve(code);
    });
    claude.on('error', () => {
      resolve(null);
    });
  });

  const durationMs = Date.now() - startTime;
  if (timeoutId) clearTimeout(timeoutId);

  // Close streams
  await Promise.all([
    new Promise<void>((resolve) => {
      jsonlStream.on('finish', resolve);
      if (jsonlStream.writableFinished) resolve();
    }),
    new Promise<void>((resolve) => {
      normStream.on('finish', resolve);
      if (normStream.writableFinished) resolve();
    }),
  ]);

    return {
      success: !timedOut && (exitCode === 0 || exitCode === 141), // 141 = SIGPIPE, normal for piped output
      isComplete: parsed.isComplete,
      durationMs,
      output: timedOut
        ? `${parsed.fullText}\nReview timed out after ${timeoutMs}ms`
        : parsed.fullText,
      jsonlPath,
      // expose normPath for future use
      stderrPath,
      exitCode,
      parsed,
      claudePid: claude.pid,
    };
}

/**
 * Check if Claude CLI is available
 */
export async function isClaudeAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    // Resolve Claude CLI path - handles cases where claude is an alias not in PATH
    const claudePath = resolveCliPath('claude');

    const check = spawn(claudePath, ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    check.on('close', (code) => {
      resolve(code === 0);
    });

    check.on('error', () => {
      resolve(false);
    });
  });
}
