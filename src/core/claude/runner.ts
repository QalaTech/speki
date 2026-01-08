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
import type { ParsedOutput, StreamCallbacks } from './types.js';

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
  } = options;

  // Ensure log directory exists
  await fs.mkdir(logDir, { recursive: true });

  const jsonlPath = join(logDir, `iteration_${iteration}.jsonl`);
  const stderrPath = join(logDir, `iteration_${iteration}.err`);

  // Read the prompt content
  const promptContent = await fs.readFile(promptPath, 'utf-8');

  const startTime = Date.now();

  // Build Claude CLI arguments
  const args = ['--print', '--verbose', '--output-format', 'stream-json'];
  if (skipPermissions) {
    args.unshift('--dangerously-skip-permissions');
  }

  // Spawn Claude CLI
  const claude = spawn('claude', args, {
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
  const stderrStream = createWriteStream(stderrPath);

  // Tee stdout: one copy to JSONL file, one to parser
  const parserStream = new PassThrough();

  claude.stdout.on('data', (chunk: Buffer) => {
    // Write to JSONL file
    jsonlStream.write(chunk);
    // Pass to parser
    parserStream.write(chunk);
  });

  claude.stdout.on('end', () => {
    jsonlStream.end();
    parserStream.end();
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

  // Close streams
  await new Promise<void>((resolve) => {
    jsonlStream.on('finish', resolve);
    if (jsonlStream.writableFinished) resolve();
  });

  return {
    success: exitCode === 0 || exitCode === 141, // 141 = SIGPIPE, normal for piped output
    isComplete: parsed.isComplete,
    durationMs,
    output: parsed.fullText,
    jsonlPath,
    stderrPath,
    exitCode,
    parsed,
  };
}

/**
 * Check if Claude CLI is available
 */
export async function isClaudeAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const check = spawn('claude', ['--version'], {
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
