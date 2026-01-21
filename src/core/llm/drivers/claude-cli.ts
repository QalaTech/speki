import { ChildProcess, spawn } from 'child_process';
import { promises as fs } from 'fs';
import { Engine, EngineAvailability, RunStreamOptions, RunStreamResult, RunChatOptions, RunChatResult } from '../engine.js';
import type { ReviewOptions, ReviewResult, ReviewFeedback } from '../../../types/index.js';
import { detectCli } from '../../cli-detect.js';
import { runClaude } from '../../claude/runner.js';
import { runChatMessage, runChatMessageStream } from '../../spec-review/chat-runner.js';
import { resolveCliPath } from '../../cli-path.js';
import * as logger from '../../logger.js';

/** Timeout for Claude CLI execution in milliseconds (5 minutes) */
const CLAUDE_TIMEOUT_MS = 300000;

/**
 * Claude-specific review result (internal to driver)
 */
interface ClaudeReviewResult {
  success: boolean;
  feedback: ReviewFeedback;
  error?: string;
  stdout?: string;
  stderr?: string;
}

export class ClaudeCliEngine implements Engine {
  name = 'claude-cli';

  async isAvailable(): Promise<EngineAvailability> {
    const d = await detectCli('claude');
    return { available: d.available, name: this.name, version: d.version };
  }

  async runStream(options: RunStreamOptions): Promise<RunStreamResult> {
    const result = await runClaude({
      promptPath: options.promptPath,
      cwd: options.cwd,
      logDir: options.logDir,
      iteration: options.iteration,
      callbacks: options.callbacks,
      skipPermissions: options.skipPermissions ?? true,
      model: options.model,
    });
    return {
      success: result.success,
      isComplete: result.isComplete,
      durationMs: result.durationMs,
      output: result.output,
      jsonlPath: result.jsonlPath,
      stderrPath: result.stderrPath,
      exitCode: result.exitCode,
      claudePid: result.claudePid,
    };
  }

  async runChat(options: RunChatOptions): Promise<RunChatResult> {
    // Use streaming version if callback provided, otherwise non-streaming
    if (options.onStreamLine) {
      const res = await runChatMessageStream(
        options.sessionId,
        options.message,
        options.isFirstMessage,
        options.onStreamLine,
        {
          cwd: options.cwd,
          timeoutMs: options.timeoutMs,
          specContent: options.specContent,
          specPath: options.specPath,
        }
      );
      return res;
    } else {
      const res = await runChatMessage(options.sessionId, options.message, options.isFirstMessage, {
        cwd: options.cwd,
        timeoutMs: options.timeoutMs,
        specContent: options.specContent,
        specPath: options.specPath,
      });
      return res;
    }
  }

  /**
   * Run peer review using Claude CLI
   * This is the adapter that converts generic ReviewOptions to Claude-specific execution
   */
  async runReview(options: ReviewOptions): Promise<ReviewResult> {
    const { prompt, outputPath, projectPath, timeoutMs, model } = options;
    const timeout = timeoutMs ?? CLAUDE_TIMEOUT_MS;

    logger.debug(`runReview called (prompt length=${prompt.length}, projectPath=${projectPath})`, 'claude-cli');
    const startTime = Date.now();

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let processExited = false;

      logger.debug('Spawning Claude CLI...', 'claude-cli');
      const claudePath = resolveCliPath('claude');

      // Use same flags as decompose runner for consistent Claude CLI behavior
      const args = [
        '--dangerously-skip-permissions', // Required for non-interactive mode
        '--print',
        '--output-format',
        'text',
        '--tools',
        '', // Disable all tools - peer review is pure text analysis
      ];

      // Add model flag if specified
      if (model) {
        args.push('--model', model);
      }

      const claude: ChildProcess = spawn(claudePath, args, {
        cwd: projectPath,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Set up timeout
      const timeoutId = setTimeout(() => {
        if (!processExited) {
          timedOut = true;
          claude.kill('SIGTERM');
          // Force kill after 5 seconds if SIGTERM didn't work
          setTimeout(() => {
            if (!processExited) {
              claude.kill('SIGKILL');
            }
          }, 5000);
        }
      }, timeout);

      claude.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      claude.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      // Send prompt to stdin
      claude.stdin?.write(prompt);
      claude.stdin?.end();

      claude.on('close', async (code) => {
        processExited = true;
        clearTimeout(timeoutId);
        const durationMs = Date.now() - startTime;
        const elapsed = (durationMs / 1000).toFixed(1);
        logger.debug(`Claude closed after ${elapsed}s, exit code: ${code}, stdout length: ${stdout.length}`, 'claude-cli');

        // Write raw output to file
        try {
          await fs.writeFile(outputPath, stdout);
        } catch (writeError) {
          stderr += `\nFailed to write output file: ${writeError}`;
        }

        // Handle timeout
        if (timedOut) {
          resolve({
            success: false,
            feedback: { verdict: 'FAIL', missingRequirements: [], contradictions: [], dependencyErrors: [], duplicates: [], suggestions: [] },
            error: `Claude CLI timed out after ${timeout / 1000} seconds`,
            stdout,
            stderr,
            durationMs,
          });
          return;
        }

        // Handle non-zero exit
        if (code !== 0) {
          resolve({
            success: false,
            feedback: { verdict: 'FAIL', missingRequirements: [], contradictions: [], dependencyErrors: [], duplicates: [], suggestions: [] },
            error: `Claude CLI exited with code ${code}. Stderr: ${stderr}`,
            stdout,
            stderr,
            durationMs,
          });
          return;
        }

        // Parse the response as ReviewFeedback JSON
        try {
          const feedback = this.parseClaudeResponse(stdout);
          resolve({
            success: true,
            feedback,
            stdout,
            stderr,
            durationMs,
          });
        } catch (parseError) {
          const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
          resolve({
            success: false,
            feedback: { verdict: 'FAIL', missingRequirements: [], contradictions: [], dependencyErrors: [], duplicates: [], suggestions: [] },
            error: `Failed to parse Claude response: ${errorMsg}. Raw output: ${stdout.substring(0, 500)}`,
            stdout,
            stderr,
            durationMs,
          });
        }
      });

      claude.on('error', (err) => {
        processExited = true;
        clearTimeout(timeoutId);
        const durationMs = Date.now() - startTime;
        resolve({
          success: false,
          feedback: { verdict: 'FAIL', missingRequirements: [], contradictions: [], dependencyErrors: [], duplicates: [], suggestions: [] },
          error: `Failed to spawn Claude CLI: ${err.message}`,
          stdout,
          stderr,
          durationMs,
        });
      });
    });
  }

  /**
   * Find all JSON object candidates in text by matching braces
   */
  private *findJsonCandidates(text: string): Generator<string> {
    // Try direct parse first
    yield text.trim();

    // Try to find JSON in markdown code blocks
    const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      yield codeBlockMatch[1];
    }

    // Find JSON objects by matching braces
    let start = text.indexOf('{');
    while (start !== -1) {
      let depth = 0;
      for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') {
          depth--;
          if (depth === 0) {
            yield text.substring(start, i + 1);
            break;
          }
        }
      }
      start = text.indexOf('{', start + 1);
    }
  }

  /**
   * Parse Claude response to extract ReviewFeedback JSON
   */
  private parseClaudeResponse(output: string): ReviewFeedback {
    for (const candidate of this.findJsonCandidates(output)) {
      try {
        const parsed = JSON.parse(candidate);
        return this.validateReviewFeedback(parsed);
      } catch (err) {
        // If it's a validation error (parsed JSON but invalid schema), rethrow
        if (err instanceof Error && err.message.includes('verdict')) {
          throw err;
        }
        // Continue to next candidate for parse errors
      }
    }

    throw new Error('No valid ReviewFeedback JSON found in output');
  }

  /**
   * Validate and normalize parsed JSON to ReviewFeedback schema
   */
  private validateReviewFeedback(obj: unknown): ReviewFeedback {
    if (typeof obj !== 'object' || obj === null) {
      throw new Error('Response is not an object');
    }

    const data = obj as Record<string, unknown>;

    // Validate verdict
    if (data.verdict !== 'PASS' && data.verdict !== 'FAIL') {
      throw new Error(`Invalid verdict: ${data.verdict}. Must be 'PASS' or 'FAIL'`);
    }

    // Helper to convert item to string - handles both string and object formats
    const itemToString = (item: unknown): string => {
      if (typeof item === 'string') return item;
      if (typeof item === 'object' && item !== null) {
        const obj = item as Record<string, unknown>;
        // Build a readable string from object properties
        const parts: string[] = [];
        if (obj.taskId) parts.push(`[${obj.taskId}]`);
        if (obj.taskIds && Array.isArray(obj.taskIds)) parts.push(`[${obj.taskIds.join(', ')}]`);
        if (obj.requirement) parts.push(String(obj.requirement));
        if (obj.issue) parts.push(String(obj.issue));
        if (obj.reason) parts.push(String(obj.reason));
        if (obj.action) parts.push(String(obj.action));
        if (obj.prdSection) parts.push(`(PRD: ${obj.prdSection})`);
        if (obj.dependsOn) parts.push(`(depends on: ${obj.dependsOn})`);
        return parts.join(' ') || JSON.stringify(item);
      }
      return String(item);
    };

    // Build validated feedback with defaults for optional arrays
    const feedback: ReviewFeedback = {
      verdict: data.verdict,
      missingRequirements: Array.isArray(data.missingRequirements) ? data.missingRequirements.map(itemToString) : [],
      contradictions: Array.isArray(data.contradictions) ? data.contradictions.map(itemToString) : [],
      dependencyErrors: Array.isArray(data.dependencyErrors) ? data.dependencyErrors.map(itemToString) : [],
      duplicates: Array.isArray(data.duplicates) ? data.duplicates.map(itemToString) : [],
      suggestions: Array.isArray(data.suggestions) ? data.suggestions.map(itemToString) : [],
      taskGroupings: Array.isArray(data.taskGroupings)
        ? data.taskGroupings.map((g: unknown) => {
            const grouping = g as Record<string, unknown>;
            return {
              taskIds: Array.isArray(grouping.taskIds) ? grouping.taskIds.map(String) : [],
              reason: String(grouping.reason || ''),
              complexity: grouping.complexity === 'low' || grouping.complexity === 'medium' ? grouping.complexity : 'medium',
            };
          })
        : undefined,
      standaloneTasks: Array.isArray(data.standaloneTasks)
        ? data.standaloneTasks.map((s: unknown) => {
            const standalone = s as Record<string, unknown>;
            return {
              taskId: String(standalone.taskId || ''),
              reason: String(standalone.reason || ''),
            };
          })
        : undefined,
    };

    return feedback;
  }
}
