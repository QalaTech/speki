import { ChildProcess, spawn } from 'child_process';
import { promises as fs, createWriteStream } from 'fs';
import { join } from 'path';
import { Engine, EngineAvailability, RunStreamOptions, RunStreamResult, RunChatOptions, RunChatResult } from '../engine.js';
import type { ReviewOptions, ReviewResult, ReviewFeedback } from '../../types/index.js';
import { detectCli } from '../../cli-detect.js';
import { resolveCliPath } from '../../cli-path.js';
import { GeminiStreamNormalizer } from '../normalizers/gemini-normalizer.js';
import * as logger from '../../logger.js';
import { extractSpecId, getSpecDir } from '../../spec-review/spec-metadata.js';

/** Timeout for Gemini CLI execution in milliseconds (5 minutes) */
const GEMINI_TIMEOUT_MS = 300000;

/** Default model to use when none is specified */
const DEFAULT_GEMINI_MODEL = 'gemini-3-flash-preview';

/** Gemini models to try if preview capacity is exhausted */
const GEMINI_CAPACITY_FALLBACK_MODELS = [
  'gemini-2.5-flash'
];

/** Maximum output size to prevent memory exhaustion (10MB) */
const MAX_OUTPUT_SIZE = 10 * 1024 * 1024;

/** Maximum stderr size (1MB) */
const MAX_STDERR_SIZE = 1024 * 1024;

/** Regex for extracting JSON from code blocks - hoisted for performance */
const CODE_BLOCK_REGEX = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/;

/** Valid model name pattern to prevent command injection */
const VALID_MODEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/** Maximum normalized lines to prevent memory exhaustion in chat */
const MAX_NORM_LINES = 10000;

/** Maximum session history entries */
const MAX_SESSION_HISTORY = 100;

/** Markers returned by Gemini when the selected model has no serving capacity */
const GEMINI_CAPACITY_ERROR_PATTERNS = [
  'RESOURCE_EXHAUSTED',
  'MODEL_CAPACITY_EXHAUSTED',
  'No capacity available for model',
];
const GEMINI_CAPACITY_RETRY_DELAYS_MS = [1000, 2000, 4000];

function resolveGeminiModel(model?: string): string {
  return model && VALID_MODEL_PATTERN.test(model) ? model : DEFAULT_GEMINI_MODEL;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isGeminiCapacityError(stderr: string): boolean {
  return GEMINI_CAPACITY_ERROR_PATTERNS.some((pattern) => stderr.includes(pattern));
}

function getGeminiFallbackModel(currentModel: string, attemptedModels: Set<string>): string | undefined {
  const candidates: string[] = [];

  candidates.push(...GEMINI_CAPACITY_FALLBACK_MODELS);

  for (const candidate of candidates) {
    if (!VALID_MODEL_PATTERN.test(candidate)) continue;
    if (candidate === currentModel) continue;
    if (attemptedModels.has(candidate)) continue;
    return candidate;
  }

  return undefined;
}

/**
 * Build Gemini CLI spawn arguments
 */
function buildGeminiArgs(model?: string, outputFormat: 'stream-json' | 'json' = 'stream-json'): string[] {
  const args = [
    '-p', '-',                       // Non-interactive, read from stdin
    '--yolo',                        // Auto-approve tool calls
    '--output-format', outputFormat,
  ];

  const validatedModel = resolveGeminiModel(model);
  args.push('-m', validatedModel);

  return args;
}

/**
 * Parse Gemini CLI output to extract the final assistant response.
 *
 * Handles two formats:
 * 1. JSON format (when using --output-format json):
 *    {"type":"text","text":"response content"}
 *
 * 2. Plain text output (default non-interactive mode)
 */
function parseGeminiChatResponse(rawOutput: string): string {
  const lines = rawOutput.split('\n');

  // Collect assistant message blocks with their indices, tracking tool usage
  const assistantBlocks: Array<{ index: number; content: string }> = [];
  let lastToolIndex = -1;
  let hasJsonl = false;
  let lineIndex = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('{')) {
      try {
        const obj = JSON.parse(trimmed);
        hasJsonl = true;

        // Track tool usage so we can extract only the final response
        if (obj.type === 'tool_use' || obj.type === 'tool_result') {
          lastToolIndex = lineIndex;
        }

        // Collect assistant text content
        if (obj.type === 'message' && obj.role === 'assistant' && obj.content) {
          if (typeof obj.content === 'string') {
            assistantBlocks.push({ index: lineIndex, content: obj.content });
          }
        } else if (obj.type === 'text' && obj.text) {
          assistantBlocks.push({ index: lineIndex, content: obj.text });
        }

        lineIndex++;
      } catch {
        lineIndex++;
      }
    }
  }

  if (hasJsonl && assistantBlocks.length > 0) {
    // Only include assistant messages after the last tool result
    // This gives us the final response, not intermediate "I'll read the file" messages
    const finalBlocks = lastToolIndex >= 0
      ? assistantBlocks.filter(b => b.index > lastToolIndex)
      : assistantBlocks;

    if (finalBlocks.length > 0) {
      return finalBlocks.map(b => b.content).join('');
    }
    // Fallback to all assistant blocks if nothing after tool results
    return assistantBlocks.map(b => b.content).join('');
  }

  // Fallback: return raw output
  return rawOutput.trim();
}

export class GeminiCliEngine implements Engine {
  name = 'gemini-cli';

  async isAvailable(): Promise<EngineAvailability> {
    const d = await detectCli('gemini');
    return { available: d.available, name: this.name, version: d.version };
  }

  async runStream(options: RunStreamOptions): Promise<RunStreamResult> {
    return this.runStreamWithRetry(options, new Set<string>(), 0);
  }

  private async runStreamWithRetry(
    options: RunStreamOptions,
    attemptedModels: Set<string>,
    capacityRetryAttempt: number
  ): Promise<RunStreamResult> {
    const { promptPath, cwd, logDir, iteration, callbacks, model } = options;

    await fs.mkdir(logDir, { recursive: true });
    const selectedModel = resolveGeminiModel(model);
    attemptedModels.add(selectedModel);

    const jsonlPath = join(logDir, `iteration_${iteration}.jsonl`);
    const normPath = join(logDir, `iteration_${iteration}.norm.jsonl`);
    const stderrPath = join(logDir, `iteration_${iteration}.err`);

    // Read the prompt content
    let promptContent = await fs.readFile(promptPath, 'utf-8');
    const originalPromptContent = promptContent;

    // Emulate session support using conversation history
    if (options.sessionId && options.resumeSession) {
      const historyPath = join(logDir, `session_${options.sessionId}_history.json`);
      try {
        const historyData = await fs.readFile(historyPath, 'utf-8');
        const history = JSON.parse(historyData);
        let contextPrefix = '## Previous conversation context:\n\n';
        for (const entry of history) {
          contextPrefix += `### ${entry.role}:\n${entry.content}\n\n`;
        }
        promptContent = contextPrefix + '\n---\n\n## Current request:\n\n' + promptContent;
      } catch {
        // No history yet
      }
    }

    const startTime = Date.now();

    // Build Gemini CLI arguments for non-interactive mode
    const args = buildGeminiArgs(model, 'stream-json');

    const geminiPath = resolveCliPath('gemini');

    const gemini = spawn(geminiPath, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const jsonlStream = createWriteStream(jsonlPath);
    const normStream = createWriteStream(normPath);
    const stderrStream = createWriteStream(stderrPath);

    // Handle stream errors to prevent uncaught exceptions
    jsonlStream.on('error', (err) => logger.debug(`jsonlStream error: ${err.message}`, 'gemini-cli'));
    normStream.on('error', (err) => logger.debug(`normStream error: ${err.message}`, 'gemini-cli'));
    stderrStream.on('error', (err) => logger.debug(`stderrStream error: ${err.message}`, 'gemini-cli'));

    // Write initial engine metadata
    try {
      const meta = JSON.stringify({ type: 'system', subtype: 'qala-engine', engine: 'gemini-cli' });
      jsonlStream.write(meta + '\n');
    } catch (err) {
      logger.debug(`Failed to write engine metadata: ${(err as Error).message}`, 'gemini-cli');
    }

    try {
      const metaEvent = JSON.stringify({ type: 'metadata', data: { engine: 'gemini-cli', timestamp: new Date().toISOString() } });
      normStream.write(metaEvent + '\n');
    } catch (err) {
      logger.debug(`Failed to write normalizer metadata: ${(err as Error).message}`, 'gemini-cli');
    }

    let output = '';
    let isComplete = false;
    let lineBuffer = '';
    let pendingText = ''; // Buffer for onText callbacks to avoid too many small chunks
    let outputSize = 0;
    let terminatedDueToSize = false;
    let sawCapacityError = false;
    let stderrTail = '';
    const seenTools = new Set<string>();
    const normalizer = new GeminiStreamNormalizer();

    const flushPendingText = () => {
      if (pendingText) {
        if (callbacks?.onText) {
          callbacks.onText(pendingText);
        }
        pendingText = '';
      }
    };

    const formatToolDetail = (name: string, input: Record<string, unknown>): string => {
      switch (name) {
        case 'Read':
          return (input.file_path as string) || '';
        case 'Grep': {
          const pattern = input.pattern || '';
          const path = input.path || '.';
          return `pattern=${JSON.stringify(pattern)} in ${path}`;
        }
        case 'Glob':
          return (input.pattern as string) || '';
        case 'Bash': {
          const cmd = (input.command as string) || '';
          return cmd.length > 80 ? cmd.substring(0, 80) + '...' : cmd;
        }
        case 'Task':
          return (input.description as string) || '';
        case 'Edit':
        case 'Write':
          return (input.file_path as string) || '';
        default: {
          const desc = input.description as string;
          if (desc) return desc;
          const str = JSON.stringify(input);
          return str.length > 60 ? str.substring(0, 60) + '...' : str;
        }
      }
    };

    gemini.stdout.on('data', (chunk: Buffer) => {
      if (terminatedDueToSize) return;
      outputSize += chunk.length;
      if (outputSize > MAX_OUTPUT_SIZE) {
        terminatedDueToSize = true;
        logger.warn(`Output exceeded ${MAX_OUTPUT_SIZE} bytes, terminating process`, 'gemini-cli');
        gemini.kill('SIGTERM');
        return;
      }

      const text = chunk.toString();
      jsonlStream.write(chunk);

      lineBuffer += text;
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        // Normalize and write to .norm.jsonl
        try {
          const events = normalizer.normalize(line);
          let hasJsonEvents = false;
          for (const event of events) {
            normStream.write(JSON.stringify(event) + '\n');
            hasJsonEvents = true;
            
            if (event.type === 'text') {
              output += event.content;
              
              // Buffer text and flush on newlines to avoid too many small SSE events
              pendingText += event.content;
              if (pendingText.includes('\n')) {
                flushPendingText();
              }
            } else {
              // Non-text event, flush any pending text first
              flushPendingText();

              if (event.type === 'tool_call') {
                const toolId = event.id || `${event.name}-${Date.now()}`;
                if (!seenTools.has(toolId)) {
                  seenTools.add(toolId);
                  if (callbacks?.onToolCall) {
                    const detail = formatToolDetail(event.name, event.input);
                    callbacks.onToolCall(event.name, detail);
                  }
                }
              } else if (event.type === 'tool_result') {
                if (callbacks?.onToolResult) {
                  // Format tool result similar to Claude - show actual content when short
                  const resultContent = event.content || '';
                  let summary: string;
                  if (event.is_error) {
                    summary = `❌ Error: ${resultContent.substring(0, 200)}`;
                  } else if (resultContent && resultContent.length < 500) {
                    // Show short results with content
                    summary = `  ✓ ${resultContent.substring(0, 100)}${resultContent.length > 100 ? '...' : ''}`;
                  } else {
                    summary = '  ✓ result received';
                  }
                  callbacks.onToolResult(summary);
                }
              }
            }
          }
          // If normalizer treated it as text because it wasn't JSON
          if (!hasJsonEvents && !line.trim().startsWith('{')) {
            const textContent = line + '\n';
            output += textContent;
            pendingText += textContent;
            flushPendingText();
          }
        } catch {
          // If normalization fails, append raw line as a fallback
          if (!line.trim().startsWith('{')) {
            const textContent = line + '\n';
            output += textContent;
            pendingText += textContent;
            flushPendingText();
          }
        }

        if (line.includes('<promise>COMPLETE</promise>')) {
          isComplete = true;
        }
      }
    });

    gemini.stdout.on('end', () => {
      // Process remaining buffer
      if (lineBuffer.trim()) {
        const events = normalizer.normalize(lineBuffer.trim());
        for (const event of events) {
          normStream.write(JSON.stringify(event) + '\n');
          if (event.type === 'text') {
            output += event.content;
            pendingText += event.content;
          }
        }
      }
      flushPendingText();
      jsonlStream.end();
      normStream.end();
    });

    gemini.stderr.on('data', (chunk: Buffer) => {
      if (!sawCapacityError) {
        const chunkText = chunk.toString();
        const combined = stderrTail + chunkText;
        if (isGeminiCapacityError(combined)) {
          sawCapacityError = true;
        }
        // Keep a small tail so split error markers across chunks are still detected.
        stderrTail = combined.slice(-200);
      }
    });
    gemini.stderr.pipe(stderrStream);

    // Send prompt to stdin
    gemini.stdin.write(promptContent);
    gemini.stdin.end();

    return new Promise((resolve) => {
      gemini.on('close', async (code) => {
        const durationMs = Date.now() - startTime;
        flushPendingText();

        // Mark as incomplete if terminated due to size limit
        if (terminatedDueToSize) {
          isComplete = false;
        }

        const success = code === 0 && !terminatedDueToSize;
        const hasCapacityError = !success && sawCapacityError;
        if (hasCapacityError && capacityRetryAttempt < GEMINI_CAPACITY_RETRY_DELAYS_MS.length) {
          const delayMs = GEMINI_CAPACITY_RETRY_DELAYS_MS[capacityRetryAttempt];
          logger.warn(
            `Gemini model ${selectedModel} capacity exhausted; retrying in ${delayMs}ms (attempt ${capacityRetryAttempt + 1}/${GEMINI_CAPACITY_RETRY_DELAYS_MS.length})`,
            'gemini-cli'
          );
          await sleep(delayMs);
          resolve(await this.runStreamWithRetry(options, attemptedModels, capacityRetryAttempt + 1));
          return;
        }

        const fallbackModel = hasCapacityError
          ? getGeminiFallbackModel(selectedModel, attemptedModels)
          : undefined;
        if (fallbackModel) {
          logger.warn(`Gemini model ${selectedModel} capacity exhausted; retrying with ${fallbackModel}`, 'gemini-cli');
          resolve(await this.runStreamWithRetry({ ...options, model: fallbackModel }, attemptedModels, 0));
          return;
        }

        // Save conversation history for session emulation
        if (options.sessionId) {
          const historyPath = join(logDir, `session_${options.sessionId}_history.json`);
          let history: Array<{ role: string; content: string }> = [];
          try {
            history = JSON.parse(await fs.readFile(historyPath, 'utf-8'));
          } catch { /* first entry */ }
          history.push({ role: 'user', content: originalPromptContent });
          history.push({ role: 'assistant', content: output });
          await fs.writeFile(historyPath, JSON.stringify(history, null, 2));
        }

        resolve({
          success,
          isComplete,
          durationMs,
          output,
          jsonlPath,
          stderrPath,
          exitCode: code ?? -1,
          claudePid: gemini.pid,
          sessionId: options.sessionId,
        });
      });

      gemini.on('error', (err) => {
        const durationMs = Date.now() - startTime;
        logger.debug(`Gemini spawn error: ${err.message}`, 'gemini-cli');
        // Ensure process is killed on error
        if (!gemini.killed) {
          gemini.kill('SIGKILL');
        }
        // Clean up streams on error
        jsonlStream.end();
        normStream.end();
        stderrStream.end();
        resolve({
          success: false,
          isComplete: false,
          durationMs,
          output: '',
          jsonlPath,
          stderrPath,
          exitCode: -1,
          claudePid: gemini.pid,
        });
      });
    });
  }

  async runChat(options: RunChatOptions): Promise<RunChatResult> {
    const { sessionId, message, cwd = process.cwd(), timeoutMs, isFirstMessage, specContent, specPath, onStreamLine, model } = options;

    // Store Gemini conversation history in per-spec directory
    let geminiDir: string;
    if (specPath) {
      const specId = extractSpecId(specPath);
      const specDir = getSpecDir(cwd, specId);
      geminiDir = join(specDir, 'gemini');
    } else {
      geminiDir = join(cwd, '.speki', 'engines', 'gemini', sessionId);
    }

    await fs.mkdir(geminiDir, { recursive: true });
    const historyPath = join(geminiDir, 'history.json');
    const normJsonlPath = join(geminiDir, `chat_${Date.now()}.norm.jsonl`);

    interface ChatMessage {
      role: 'user' | 'assistant';
      content: string;
    }

    let history: ChatMessage[] = [];
    try {
      const historyData = await fs.readFile(historyPath, 'utf-8');
      history = JSON.parse(historyData);
      // Limit history size to prevent unbounded growth
      if (history.length > MAX_SESSION_HISTORY) {
        history = history.slice(-MAX_SESSION_HISTORY);
      }
    } catch {
      // No history yet
    }

    history.push({ role: 'user', content: message });

    // Build conversation prompt
    let conversationPrompt = '';

    if (specPath && isFirstMessage) {
      conversationPrompt += `# Context\n\n`;
      conversationPrompt += `You are helping review and discuss a specification document.\n`;
      conversationPrompt += `The spec file is located at: ${specPath}\n\n`;

      conversationPrompt += `## CRITICAL: Your Scope is SPEC REFINEMENT ONLY (PLANNING PHASE)\n\n`;
      conversationPrompt += `You are part of a spec-first development workflow:\n`;
      conversationPrompt += `1. **Planning Phase** (YOU ARE HERE): Write and refine specs\n`;
      conversationPrompt += `2. **Decompose Phase**: Spec gets broken into implementation tasks\n`;
      conversationPrompt += `3. **Execution Phase**: Task runner implements tasks one at a time\n\n`;
      conversationPrompt += `**ABSOLUTELY FORBIDDEN:**\n`;
      conversationPrompt += `- NEVER offer to implement: "Want me to implement?", "I can write the code..."\n`;
      conversationPrompt += `- NEVER write code outside this spec file\n`;
      conversationPrompt += `- NEVER ask leading questions about implementation\n\n`;
      conversationPrompt += `**YOUR ALLOWED ACTIONS:** Answer questions, suggest spec improvements, edit THIS spec file when asked.\n\n`;
      conversationPrompt += `If user mentions implementation, say: "Let's capture that in the spec. Once ready, use Decompose to generate tasks."\n\n`;

      if (specContent) {
        conversationPrompt += `## Specification Content\n\n${specContent}\n\n`;
      }
    }

    conversationPrompt += '# Conversation History\n\n';
    for (const msg of history) {
      conversationPrompt += `**${msg.role}**: ${msg.content}\n\n`;
    }

    conversationPrompt += 'Please respond to the latest user message.';

    // Save prompt for debugging
    const promptPath = join(geminiDir, `prompt_${Date.now()}.md`);
    await fs.writeFile(promptPath, conversationPrompt, 'utf-8').catch((err) => {
      logger.debug(`Failed to save prompt for debugging: ${(err as Error).message}`, 'gemini-cli');
    });

    // Build Gemini CLI args for non-interactive chat
    const geminiPath = resolveCliPath('gemini');
    const args = buildGeminiArgs(model, 'stream-json');

    const startTime = Date.now();

    const gemini = spawn(geminiPath, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    gemini.stdin?.write(conversationPrompt);
    gemini.stdin?.end();

    let response = '';
    let lineBuffer = '';

    const normalizer = new GeminiStreamNormalizer();
    const normLines: string[] = [];
    let normLinesTruncated = false;

    gemini.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      response += text;

      if (onStreamLine) {
        lineBuffer += text;
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            onStreamLine(line.trim());

            const events = normalizer.normalize(line);
            for (const event of events) {
              if (normLines.length < MAX_NORM_LINES) {
                normLines.push(JSON.stringify(event));
              } else if (!normLinesTruncated) {
                normLinesTruncated = true;
                logger.debug(`Normalized lines exceeded ${MAX_NORM_LINES}, truncating`, 'gemini-cli');
              }
            }
          }
        }
      }
    });

    return new Promise((resolve) => {
      const timeout = timeoutMs ?? 600000;
      let resolved = false;

      const resolveOnce = (result: RunChatResult) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        resolve(result);
      };

      const timeoutId = setTimeout(() => {
        gemini.kill('SIGTERM');
        resolveOnce({
          content: '',
          error: 'Chat timed out',
          durationMs: Date.now() - startTime,
        });
      }, timeout);

      gemini.on('close', async (code) => {
        clearTimeout(timeoutId);
        const durationMs = Date.now() - startTime;

        // Flush remaining buffer
        if (onStreamLine && lineBuffer.trim()) {
          onStreamLine(lineBuffer.trim());
          const events = normalizer.normalize(lineBuffer);
          for (const event of events) {
            if (normLines.length < MAX_NORM_LINES) {
              normLines.push(JSON.stringify(event));
            }
          }
        }

        if (code === 0 && response) {
          const parsedResponse = parseGeminiChatResponse(response);

          history.push({ role: 'assistant', content: parsedResponse });
          await fs.writeFile(historyPath, JSON.stringify(history, null, 2), 'utf-8').catch((err) => {
            logger.debug(`Failed to write chat history: ${(err as Error).message}`, 'gemini-cli');
          });

          if (normLines.length > 0) {
            await fs.writeFile(normJsonlPath, normLines.join('\n') + '\n', 'utf-8').catch((err) => {
              logger.debug(`Failed to write normalized output: ${(err as Error).message}`, 'gemini-cli');
            });
          }

          resolveOnce({ content: parsedResponse, durationMs });
        } else {
          resolveOnce({
            content: '',
            error: response || 'No response from Gemini',
            durationMs,
          });
        }
      });

      gemini.on('error', (err) => {
        clearTimeout(timeoutId);
        resolveOnce({
          content: '',
          error: `Failed to spawn Gemini: ${err.message}`,
          durationMs: Date.now() - startTime,
        });
      });
    });
  }

  async runReview(options: ReviewOptions): Promise<ReviewResult> {
    const { prompt, outputPath, projectPath, timeoutMs, model } = options;
    const timeout = timeoutMs ?? GEMINI_TIMEOUT_MS;

    logger.debug(`runReview called (prompt length=${prompt.length}, projectPath=${projectPath})`, 'gemini-cli');
    const startTime = Date.now();

    return new Promise((resolve) => {
      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];
      const stderrWriteErrors: string[] = [];
      let stdoutSize = 0;
      let stderrSize = 0;
      let timedOut = false;
      let processExited = false;

      logger.debug('Spawning Gemini CLI...', 'gemini-cli');
      const geminiPath = resolveCliPath('gemini');

      const args = buildGeminiArgs(model, 'json');

      const gemini: ChildProcess = spawn(geminiPath, args, {
        cwd: projectPath,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Ensure process cleanup on timeout
      let killTimeout: NodeJS.Timeout | null = null;
      const timeoutId = setTimeout(() => {
        if (!processExited) {
          timedOut = true;
          gemini.kill('SIGTERM');
          killTimeout = setTimeout(() => {
            if (!processExited) {
              gemini.kill('SIGKILL');
            }
          }, 5000);
        }
      }, timeout);

      gemini.stdout?.on('data', (chunk: Buffer) => {
        const str = chunk.toString();
        if (stdoutSize < MAX_OUTPUT_SIZE) {
          stdoutChunks.push(str);
          stdoutSize += str.length;
        }
      });

      gemini.stderr?.on('data', (chunk: Buffer) => {
        const str = chunk.toString();
        if (stderrSize < MAX_STDERR_SIZE) {
          stderrChunks.push(str);
          stderrSize += str.length;
        }
      });

      gemini.stdin?.write(prompt);
      gemini.stdin?.end();

      gemini.on('close', async (code) => {
        processExited = true;
        clearTimeout(timeoutId);
        if (killTimeout) clearTimeout(killTimeout);
        
        const stdout = stdoutChunks.join('');
        let stderr = stderrChunks.join('');
        const durationMs = Date.now() - startTime;
        const elapsed = (durationMs / 1000).toFixed(1);
        logger.debug(`Gemini closed after ${elapsed}s, exit code: ${code}, stdout length: ${stdout.length}`, 'gemini-cli');

        // Write raw output to file
        try {
          await fs.writeFile(outputPath, stdout);
        } catch (writeError) {
          stderrWriteErrors.push(`Failed to write output file: ${writeError}`);
        }
        
        const fullStderr = stderr + (stderrWriteErrors.length > 0 ? '\n' + stderrWriteErrors.join('\n') : '');

        if (timedOut) {
          resolve({
            success: false,
            feedback: { verdict: 'FAIL', missingRequirements: [], contradictions: [], dependencyErrors: [], duplicates: [], suggestions: [] },
            error: `Gemini CLI timed out after ${timeout / 1000} seconds`,
            stdout,
            stderr: fullStderr,
            durationMs,
          });
          return;
        }

        if (code !== 0 && !stdout.trim()) {
          resolve({
            success: false,
            feedback: { verdict: 'FAIL', missingRequirements: [], contradictions: [], dependencyErrors: [], duplicates: [], suggestions: [] },
            error: `Gemini CLI exited with code ${code}. Stderr: ${fullStderr}`,
            stdout,
            stderr: fullStderr,
            durationMs,
          });
          return;
        }

        // Extract the text content from Gemini JSON output
        let textOutput = stdout.trim();
        if (textOutput.startsWith('{')) {
          try {
            // gemini-cli can output multiple JSON objects if it uses tools or has multiple turns
            // We want to extract all 'text' blocks or the 'response' field
            const lines = textOutput.split('\n');
            const textParts: string[] = [];
            let hasParsedAny = false;

            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const parsed = JSON.parse(line.trim());
                hasParsedAny = true;
                if (parsed.response) {
                  textParts.push(parsed.response);
                } else if (parsed.text) {
                  textParts.push(parsed.text);
                }
              } catch {
                // Not a JSON line, maybe part of a multi-line JSON or just prose
              }
            }

            if (hasParsedAny && textParts.length > 0) {
              textOutput = textParts.join('');
            } else {
              // Try parsing the whole thing if line-by-line failed
              const parsed = JSON.parse(textOutput);
              if (parsed.response) textOutput = parsed.response;
              else if (parsed.text) textOutput = parsed.text;
            }
          } catch {
            // Not valid JSON, use stdout directly
          }
        }

        const feedback = this.extractJson(textOutput);

        if (!feedback) {
          resolve({
            success: false,
            feedback: { verdict: 'FAIL', missingRequirements: [], contradictions: [], dependencyErrors: [], duplicates: [], suggestions: [] },
            error: 'Reviewer output could not be parsed as JSON',
            stdout,
            stderr: fullStderr,
            durationMs,
          });
          return;
        }

        if (!feedback.verdict) {
          feedback.verdict = 'FAIL';
        }

        resolve({
          success: code === 0,
          feedback,
          stdout,
          stderr: fullStderr,
          durationMs,
        });
      });

      gemini.on('error', (err) => {
        processExited = true;
        clearTimeout(timeoutId);
        const durationMs = Date.now() - startTime;
        resolve({
          success: false,
          feedback: { verdict: 'FAIL', missingRequirements: [], contradictions: [], dependencyErrors: [], duplicates: [], suggestions: [] },
          error: `Failed to spawn Gemini CLI: ${err.message}`,
          stdout: stdoutChunks.join(''),
          stderr: stderrChunks.join(''),
          durationMs,
        });
      });
    });
  }

  private *findJsonCandidates(text: string): Generator<string> {
    yield text.trim();

    const codeBlockMatch = CODE_BLOCK_REGEX.exec(text);
    if (codeBlockMatch) {
      yield codeBlockMatch[1];
    }

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

  private extractJson(text: string): ReviewFeedback | null {
    for (const candidate of this.findJsonCandidates(text)) {
      try {
        const obj = JSON.parse(candidate) as Partial<ReviewFeedback>;
        if ('verdict' in obj && obj.verdict) {
          return {
            verdict: obj.verdict,
            missingRequirements: obj.missingRequirements ?? [],
            contradictions: obj.contradictions ?? [],
            dependencyErrors: obj.dependencyErrors ?? [],
            duplicates: obj.duplicates ?? [],
            suggestions: obj.suggestions ?? [],
            taskGroupings: obj.taskGroupings,
            standaloneTasks: obj.standaloneTasks,
          };
        }
      } catch {
        // Continue to next candidate
      }
    }

    if (text.toUpperCase().includes('FAIL')) {
      return {
        verdict: 'FAIL',
        missingRequirements: [{ id: 'parse-error-0', severity: 'critical', description: 'Review indicated failure but JSON not parseable' }],
        contradictions: [],
        dependencyErrors: [],
        duplicates: [],
        suggestions: [],
      };
    }

    return null;
  }
}
