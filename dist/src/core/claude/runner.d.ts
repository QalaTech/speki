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
export declare function runClaude(options: RunOptions): Promise<RunResult>;
/**
 * Check if Claude CLI is available
 */
export declare function isClaudeAvailable(): Promise<boolean>;
//# sourceMappingURL=runner.d.ts.map