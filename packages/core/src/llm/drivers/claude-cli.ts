import { ChildProcess, spawn } from 'child_process';
import { promises as fs } from 'fs';
import { Engine, EngineAvailability, RunStreamOptions, RunStreamResult, RunChatOptions, RunChatResult } from '../engine.js';
import type { ReviewOptions, ReviewResult, ReviewFeedback } from '../../types/index.js';
import { detectCli } from '../../cli-detect.js';
import { runClaude } from '../../claude/runner.js';
import { resolveCliPath } from '../../cli-path.js';
import * as logger from '../../logger.js';

/** Timeout for Claude CLI execution in milliseconds (5 minutes) */
import { ClaudeStreamNormalizer } from '../normalizers/claude-normalizer.js';
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
      permissionMode: options.permissionMode,
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
    const {
      sessionId,
      message,
      isFirstMessage,
      onStreamLine,
      cwd = process.cwd(),
      timeoutMs = 1_200_000, // 20 minutes default
      specContent,
      specPath,
      model,
    } = options;

    // Track which sessions have been initialized
    const initializedSessions = new Set<string>();

    // Build system prompt
    let systemPrompt = `You are a helpful assistant reviewing a software specification document.
Your role is to help the user improve their spec by:
- Answering questions about best practices for PRDs/specs
- Suggesting improvements to specific sections
- Clarifying requirements
- Identifying potential issues or ambiguities
- Making edits to the spec file when the user asks you to

## CRITICAL: Your Scope is SPEC REFINEMENT ONLY (PLANNING PHASE)

You are part of a spec-first development workflow:
1. **Planning Phase** (YOU ARE HERE): Write and refine specs → AI review → iterate
2. **Decompose Phase**: Spec gets broken into implementation tasks
3. **Execution Phase**: Task runner implements tasks one at a time

**YOUR ROLE:** Help refine THIS specification document. That's it.

**ABSOLUTELY FORBIDDEN - NEVER DO THESE:**
- ❌ NEVER offer to implement: "Want me to implement this?", "I can write the code...", "Let me build that..."
- ❌ NEVER offer to create: "Want me to create the CLI?", "Shall I write the script?", "I could set that up..."
- ❌ NEVER write code outside this spec file
- ❌ NEVER run implementation commands
- ❌ NEVER ask leading questions about implementation
- ❌ NEVER create files mentioned IN the spec - the spec DESCRIBES what should be created, you don't create it!

**CRITICAL: SPEC FILE vs FILES MENTIONED IN SPEC**
The spec file DESCRIBES files/features to be created. Your job is to edit THE SPEC DOCUMENT ITSELF.
- If the spec says "Create HelloWorld.md" and user says "change that to HelloWorld2.md" → UPDATE THE SPEC TEXT
- Do NOT actually create HelloWorld.md or HelloWorld2.md - that's implementation!
- You only modify ONE file: the spec file itself (at the path given below)

**WHY THIS MATTERS:**
The whole point of this system is well-written specs that get decomposed into tasks. If you jump to implementation, you defeat the purpose. The decomposition engine and task runner handle implementation - NOT you.

**WHEN USER MENTIONS IMPLEMENTATION:**
Do NOT offer to help with implementation. Instead say something like:
"That's an implementation detail. Let's make sure the spec captures the requirement clearly. Once you're happy with the spec, use **Decompose** to generate implementation tasks."

**YOUR ALLOWED ACTIONS:**
✅ Answer questions about the spec content
✅ Suggest improvements to spec wording/structure
✅ Edit THIS spec file (and ONLY this spec file) when asked
✅ Identify gaps, ambiguities, or issues in the spec
✅ Help with acceptance criteria and requirements

**SELECTION CONTEXT:**
When the user highlights/selects text from the spec and asks you to change it:
- They want you to UPDATE THAT TEXT IN THE SPEC FILE
- They are NOT asking you to create or modify files MENTIONED in that text
- Example: If spec says "Create foo.md" and user selects it saying "change to bar.md"
  → Edit the spec to say "Create bar.md" (don't create any files!)

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

    if (specPath) {
      systemPrompt += `\n\n## Spec File - EXACT PATH
The spec file you are reviewing is at this EXACT path: ${specPath}

**CRITICAL:**
- Use this EXACT file path. Do NOT search for files or use similar paths.
- Do NOT read files from .speki/ directory - those are internal state files.
- The spec file is in the specs/ folder, not .speki/specs/.
- Read this file ONLY when needed to answer the user's question.`;
    }

    if (specContent) {
      systemPrompt += `\n\n## Specification Content\n${specContent}`;
    }

    // Build Claude CLI args
    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--verbose',
      '--dangerously-skip-permissions',
    ];

    // Use the isFirstMessage parameter to determine initialization vs resume
    if (isFirstMessage) {
      args.push('--session-id', sessionId);
      args.push('--system-prompt', systemPrompt);
      initializedSessions.add(sessionId);
      logger.debug(
        `Initializing new Claude session with spec: ${sessionId} (hasContent=${!!specContent}) path=${specPath}`,
        'claude-cli'
      );
    } else {
      args.push('--resume', sessionId);
      initializedSessions.add(sessionId);
      logger.debug(`Resuming existing Claude session: ${sessionId}`, 'claude-cli');
    }

    if (model) {
      args.push('--model', model);
    }

    const startTime = Date.now();
    const claudePath = resolveCliPath('claude');

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let finalResponse = '';

      // Normalizer and normalized events array for .norm.jsonl output
      const normalizer = new ClaudeStreamNormalizer();
      const normLines: string[] = [];

      const cliProcess = spawn(claudePath, args, {
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

      // Track streaming output
      let buffer = '';
      let lastToolResultIndex = -1;
      let currentLineIndex = 0;
      const textBlocks: Array<{ index: number; text: string }> = [];

      cliProcess.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;
        buffer += text;

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            const jsonLine = line.trim();

            // Stream to callback if provided
            if (onStreamLine) {
              onStreamLine(jsonLine);
            }

            // Normalize for .norm.jsonl
            const events = normalizer.normalize(jsonLine);
            for (const event of events) {
              normLines.push(JSON.stringify(event));
            }

            // Track text blocks for final response extraction
            try {
              const parsed = JSON.parse(jsonLine);

              // Track when tool results appear
              if (parsed.type === 'user' && parsed.message?.content) {
                const content = parsed.message.content;
                if (Array.isArray(content) && content.some(block => block.type === 'tool_result')) {
                  lastToolResultIndex = currentLineIndex;
                }
              }

              // Collect text blocks
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
              // Ignore parse errors
              currentLineIndex++;
            }
          }
        }
      });

      cliProcess.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      // Send the message via stdin
      cliProcess.stdin.write(message);
      cliProcess.stdin.end();

      cliProcess.on('close', async (code) => {
        clearTimeout(timeoutId);
        const durationMs = Date.now() - startTime;

        // Process any remaining buffer
        if (buffer.trim() && onStreamLine) {
          onStreamLine(buffer.trim());
          // Normalize remaining buffer
          const events = normalizer.normalize(buffer.trim());
          for (const event of events) {
            normLines.push(JSON.stringify(event));
          }
        }

        // Write normalized JSONL file
        if (normLines.length > 0) {
          const { join } = await import('path');
          const { dirname } = await import('path');
          const normPath = join(cwd, '.speki', 'sessions', sessionId, 'chat.norm.jsonl');
          await fs.mkdir(dirname(normPath), { recursive: true }).catch(() => {});
          await fs.writeFile(normPath, normLines.join('\n') + '\n', 'utf-8').catch(() => {});
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
        if (lastToolResultIndex >= 0) {
          finalResponse = textBlocks
            .filter(block => block.index > lastToolResultIndex)
            .map(block => block.text)
            .join('');
        } else {
          // No tool results - include all text blocks
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
