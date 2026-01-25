import { ChildProcess, spawn } from 'child_process';
import { promises as fs } from 'fs';
import { Engine, EngineAvailability, RunStreamOptions, RunStreamResult, RunChatOptions, RunChatResult } from '../engine.js';
import type { ReviewOptions, ReviewResult, ReviewFeedback } from '../../types/index.js';
import { detectCli } from '../../cli-detect.js';
import { resolveCliPath } from '../../cli-path.js';
import { CodexStreamNormalizer } from '../normalizers/codex-normalizer.js';
import * as logger from '../../logger.js';

/** Timeout for Codex CLI execution in milliseconds (5 minutes) */
const CODEX_TIMEOUT_MS = 300000;

/**
 * Parse Codex CLI output to extract just the final assistant response.
 *
 * Handles two formats:
 * 1. JSONL format (when using --json flag):
 *    {"type":"text","text":"response content"}
 *
 * 2. Verbose timestamp format (legacy):
 *    [2026-01-19T08:07:22] codex
 *    ...response content...
 */
function parseCodexChatResponse(rawOutput: string): string {
  const lines = rawOutput.split('\n');

  // First, try to parse as JSONL format (used when --json flag is set)
  const textBlocks: string[] = [];
  let hasJsonl = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Try to parse as JSON
    if (trimmed.startsWith('{')) {
      try {
        const obj = JSON.parse(trimmed);
        hasJsonl = true;

        // Extract text content from various Codex formats
        if (obj.type === 'text' && obj.text) {
          textBlocks.push(obj.text);
        } else if (obj.type === 'agent_message' && obj.message) {
          // Codex agent_message format: {"type":"agent_message","message":"..."}
          textBlocks.push(obj.message);
        } else if (obj.type === 'message' && obj.message?.content) {
          // Handle wrapped message format
          const content = obj.message.content;
          if (typeof content === 'string') {
            textBlocks.push(content);
          } else if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && block.text) {
                textBlocks.push(block.text);
              }
            }
          }
        } else if (obj.msg?.type === 'agent_message' && obj.msg?.message) {
          // Nested format: {"id":"0","msg":{"type":"agent_message","message":"..."}}
          textBlocks.push(obj.msg.message);
        }
      } catch {
        // Not valid JSON, continue
      }
    }
  }

  // If we found JSONL text blocks, return the last one (final response)
  if (hasJsonl && textBlocks.length > 0) {
    return textBlocks[textBlocks.length - 1];
  }

  // Fall back to verbose timestamp format parsing
  const timestampPattern = /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\]\s+/;

  // Find all blocks - each block starts with a timestamp line
  const blocks: Array<{ type: string; content: string }> = [];
  let currentBlock: { type: string; content: string[] } | null = null;

  for (const line of lines) {
    const match = line.match(timestampPattern);
    if (match) {
      // Save previous block if exists
      if (currentBlock) {
        blocks.push({ type: currentBlock.type, content: currentBlock.content.join('\n').trim() });
      }
      // Start new block - type is the word after the timestamp
      const afterTimestamp = line.slice(match[0].length).trim();
      const type = afterTimestamp.split(/\s+/)[0] || 'unknown';
      currentBlock = { type, content: [] };
      // Add any content after the type on the same line
      const contentAfterType = afterTimestamp.slice(type.length).trim();
      if (contentAfterType) {
        currentBlock.content.push(contentAfterType);
      }
    } else if (currentBlock) {
      // Continue current block
      currentBlock.content.push(line);
    }
  }

  // Don't forget the last block
  if (currentBlock) {
    blocks.push({ type: currentBlock.type, content: currentBlock.content.join('\n').trim() });
  }

  // Find the last 'codex' block that has actual content (not just thinking labels)
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    if (block.type === 'codex' && block.content && !block.content.startsWith('Crafting') && !block.content.startsWith('Responding')) {
      // Skip blocks that are just thinking summaries
      if (block.content.length > 0) {
        return block.content;
      }
    }
  }

  // Fallback: return the raw output if parsing fails
  return rawOutput.trim();
}

/**
 * Convert a Codex log line to JSON format for UI streaming.
 * Maps Codex output format to a structure similar to Claude's JSONL.
 */
export function convertCodexLineToJson(line: string): string | null {
  const timestampPattern = /^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\]\s+/;
  const match = line.match(timestampPattern);

  if (match) {
    const timestamp = match[1];
    const content = line.slice(match[0].length);
    const firstWord = content.split(/\s+/)[0];
    const rest = content.slice(firstWord.length).trim();

    if (firstWord === 'thinking') {
      // Thinking/reasoning block
      return JSON.stringify({
        type: 'thinking',
        thinking: rest || '...',
        timestamp,
      });
    } else if (firstWord === 'codex') {
      // Assistant text output
      if (rest) {
        return JSON.stringify({
          type: 'text',
          text: rest,
          timestamp,
        });
      }
      return null; // Empty codex line, skip
    } else if (firstWord === 'exec') {
      // Tool execution
      return JSON.stringify({
        type: 'tool_use',
        name: 'bash',
        input: { command: rest },
        timestamp,
      });
    } else if (firstWord === 'tokens') {
      // Token usage info
      return JSON.stringify({
        type: 'usage',
        info: rest,
        timestamp,
      });
    } else {
      // Other system info (model, provider, etc.)
      return JSON.stringify({
        type: 'system',
        subtype: firstWord,
        content: rest || firstWord,
        timestamp,
      });
    }
  } else if (line.trim()) {
    // Non-timestamped line - likely continuation of previous content
    return JSON.stringify({
      type: 'text',
      text: line,
    });
  }

  return null;
}

export class CodexCliEngine implements Engine {
  name = 'codex-cli';

  async isAvailable(): Promise<EngineAvailability> {
    const d = await detectCli('codex');
    return { available: d.available, name: this.name, version: d.version };
  }

  async runStream(options: RunStreamOptions): Promise<RunStreamResult> {
    const { promptPath, cwd, logDir, iteration, callbacks, model } = options;

    // Ensure log directory exists
    await fs.mkdir(logDir, { recursive: true });

    const { join } = await import('path');
    const { createWriteStream } = await import('fs');

    const jsonlPath = join(logDir, `iteration_${iteration}.jsonl`);
    const normPath = join(logDir, `iteration_${iteration}.norm.jsonl`);
    const stderrPath = join(logDir, `iteration_${iteration}.err`);

    // Read the prompt content
    const promptContent = await fs.readFile(promptPath, 'utf-8');

    const startTime = Date.now();

    // Build Codex CLI arguments
    // -s danger-full-access: explicit full filesystem access (needed for writing verdict files)
    // --dangerously-bypass-approvals-and-sandbox: skip confirmations
    const args = [
      'exec',
      '-s', 'danger-full-access',
      '--dangerously-bypass-approvals-and-sandbox',
      '-C', cwd,
      '--json',
      '-',  // Read from stdin
    ];

    // Add model if specified
    if (model) {
      // Codex may use --model flag
      args.push('--model', model);
    }

    // Resolve Codex CLI path
    const codexPath = resolveCliPath('codex');

    // Spawn Codex CLI
    const codex = spawn(codexPath, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Create write streams for logs
    const jsonlStream = createWriteStream(jsonlPath);
    const normStream = createWriteStream(normPath);
    const stderrStream = createWriteStream(stderrPath);

    // Write initial engine metadata
    try {
      const meta = JSON.stringify({ type: 'system', subtype: 'qala-engine', engine: 'codex-cli' });
      jsonlStream.write(meta + '\n');
    } catch {
      // non-fatal
    }

    // Write initial metadata to normalized stream
    try {
      const metaEvent = JSON.stringify({ type: 'metadata', data: { engine: 'codex-cli', timestamp: new Date().toISOString() } });
      normStream.write(metaEvent + '\n');
    } catch {
      // non-fatal
    }

    let output = '';
    let isComplete = false;
    const normalizer = new CodexStreamNormalizer();

    // Capture stdout
    codex.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      jsonlStream.write(chunk);

      // Normalize and write to .norm.jsonl in real-time
      try {
        const events = normalizer.normalize(text);
        for (const event of events) {
          normStream.write(JSON.stringify(event) + '\n');
        }
      } catch {
        // Ignore normalization errors - continue streaming
      }

      // Invoke text callback if provided
      if (callbacks?.onText) {
        callbacks.onText(text);
      }

      // Check for completion marker
      if (text.includes('<promise>COMPLETE</promise>')) {
        isComplete = true;
      }
    });

    codex.stdout.on('end', () => {
      jsonlStream.end();
      normStream.end();
    });

    // Capture stderr
    codex.stderr.pipe(stderrStream);

    // Send prompt to stdin
    codex.stdin.write(promptContent);
    codex.stdin.end();

    return new Promise((resolve) => {
      codex.on('close', (code) => {
        const durationMs = Date.now() - startTime;
        resolve({
          success: code === 0,
          isComplete,
          durationMs,
          output,
          jsonlPath,
          stderrPath,
          exitCode: code ?? -1,
          claudePid: codex.pid,
        });
      });

      codex.on('error', (err) => {
        const durationMs = Date.now() - startTime;
        logger.debug(`Codex spawn error: ${err.message}`, 'codex-cli');
        resolve({
          success: false,
          isComplete: false,
          durationMs,
          output: '',
          jsonlPath,
          stderrPath,
          exitCode: -1,
          claudePid: codex.pid,
        });
      });
    });
  }

  async runChat(options: RunChatOptions): Promise<RunChatResult> {
    // Codex doesn't have native sessions - emulate via conversation history
    const { sessionId, message, cwd = process.cwd(), timeoutMs, isFirstMessage, specContent, specPath, onStreamLine } = options;

    const { join } = await import('path');
    const { extractSpecId, getSpecDir } = await import('../../spec-review/spec-metadata.js');

    // Store Codex conversation history in per-spec directory for consistency
    // .speki/specs/<spec-id>/codex/history.json
    let codexDir: string;
    if (specPath) {
      const specId = extractSpecId(specPath);
      const specDir = getSpecDir(cwd, specId);
      codexDir = join(specDir, 'codex');
    } else {
      // Fallback: if no specPath, use session-based directory (legacy compatibility)
      codexDir = join(cwd, '.speki', 'engines', 'codex', sessionId);
    }

    await fs.mkdir(codexDir, { recursive: true });
    const historyPath = join(codexDir, 'history.json');
    const normJsonlPath = join(codexDir, `chat_${Date.now()}.norm.jsonl`);

    // Load conversation history
    interface ChatMessage {
      role: 'user' | 'assistant';
      content: string;
    }

    let history: ChatMessage[] = [];
    try {
      const historyData = await fs.readFile(historyPath, 'utf-8');
      history = JSON.parse(historyData);
    } catch {
      // No history yet - this is fine for first message
    }

    // Add current message
    history.push({ role: 'user', content: message });

    // Build conversation prompt
    // Note: We DON'T embed the full spec content - we just reference the file path.
    // This saves tokens on simple messages. The model can read the file when needed.
    let conversationPrompt = '';

    if (specPath && isFirstMessage) {
      // Just tell the model about the spec file - don't embed the content
      conversationPrompt += `# Context\n\n`;
      conversationPrompt += `You are helping review and discuss a specification document.\n`;
      conversationPrompt += `The spec file is located at: ${specPath}\n`;
      conversationPrompt += `Read this file ONLY if you need to reference its contents to answer the user's question.\n`;
      conversationPrompt += `For simple greetings or general questions, there's no need to read the file.\n\n`;

      // CRITICAL: Planning-phase-only instructions
      conversationPrompt += `## CRITICAL: Your Scope is SPEC REFINEMENT ONLY (PLANNING PHASE)\n\n`;
      conversationPrompt += `You are part of a spec-first development workflow:\n`;
      conversationPrompt += `1. **Planning Phase** (YOU ARE HERE): Write and refine specs\n`;
      conversationPrompt += `2. **Decompose Phase**: Spec gets broken into implementation tasks\n`;
      conversationPrompt += `3. **Execution Phase**: Task runner implements tasks one at a time\n\n`;
      conversationPrompt += `**ABSOLUTELY FORBIDDEN:**\n`;
      conversationPrompt += `- ❌ NEVER offer to implement: "Want me to implement?", "I can write the code..."\n`;
      conversationPrompt += `- ❌ NEVER write code outside this spec file\n`;
      conversationPrompt += `- ❌ NEVER ask leading questions about implementation\n\n`;
      conversationPrompt += `**YOUR ALLOWED ACTIONS:** Answer questions, suggest spec improvements, edit THIS spec file when asked.\n\n`;
      conversationPrompt += `If user mentions implementation, say: "Let's capture that in the spec. Once ready, use Decompose to generate tasks."\n\n`;
    }

    conversationPrompt += '# Conversation History\n\n';
    for (const msg of history) {
      conversationPrompt += `**${msg.role}**: ${msg.content}\n\n`;
    }

    conversationPrompt += 'Please respond to the latest user message.';

    // Save prompt for debugging (optional, not passed to Codex)
    const promptPath = join(codexDir, `prompt_${Date.now()}.md`);
    await fs.writeFile(promptPath, conversationPrompt, 'utf-8').catch(() => {});

    // Run Codex with proper flags
    // -s danger-full-access: explicit full filesystem access
    // --dangerously-bypass-approvals-and-sandbox: skip confirmations
    // -C sets working directory
    // --json outputs JSONL format for streaming
    // - reads prompt from stdin (not a file, to avoid agent reading the prompt file)
    const codexPath = resolveCliPath('codex');
    const args = [
      'exec',
      '-s', 'danger-full-access',
      '--dangerously-bypass-approvals-and-sandbox',
      '-C', cwd,
      '--json',
      '-',  // Read from stdin
    ];

    const startTime = Date.now();

    const codex = spawn(codexPath, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Write prompt to stdin instead of passing file path
    codex.stdin?.write(conversationPrompt);
    codex.stdin?.end();

    let response = '';
    let lineBuffer = '';
    // Completion checker - gets assigned inside the Promise once resolveOnce is available
    let onCompletionCheck: ((line: string) => void) | null = null;

    // Normalizer and normalized events array for .norm.jsonl output
    const normalizer = new CodexStreamNormalizer();
    const normLines: string[] = [];

    codex.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      response += text;

      // Stream lines to callback for real-time UI updates
      if (onStreamLine) {
        lineBuffer += text;
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            // Convert Codex log format to JSON for UI consumption
            const jsonLine = convertCodexLineToJson(line);
            if (jsonLine) {
              onStreamLine(jsonLine);
              // Check if this line signals completion (e.g., turn_complete)
              if (onCompletionCheck) {
                onCompletionCheck(jsonLine);
              }

              // Write normalized event to .norm.jsonl
              const events = normalizer.normalize(line);
              for (const event of events) {
                normLines.push(JSON.stringify(event));
              }
            }
          }
        }
      }
    });

    return new Promise((resolve) => {
      const timeout = timeoutMs ?? 600000; // 10 minutes for chat (large specs can take time)
      let resolved = false;

      const resolveOnce = (result: RunChatResult) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        codex.kill('SIGTERM'); // Ensure process is terminated
        resolve(result);
      };

      const timeoutId = setTimeout(() => {
        resolveOnce({
          content: '',
          error: 'Chat timed out',
          durationMs: Date.now() - startTime,
        });
      }, timeout);

      // Detect completion from stream - Codex sends turn_complete or turn_diff at end
      const checkForCompletion = (line: string) => {
        try {
          const parsed = JSON.parse(line);
          // Codex signals completion with turn_complete message
          if (parsed.type === 'text' && parsed.text) {
            const inner = JSON.parse(parsed.text);
            if (inner.msg?.type === 'turn_complete') {
              // Give a short delay for any final output, then resolve
              setTimeout(async () => {
                const durationMs = Date.now() - startTime;
                const parsedResponse = parseCodexChatResponse(response);
                history.push({ role: 'assistant', content: parsedResponse });
                await fs.writeFile(historyPath, JSON.stringify(history, null, 2), 'utf-8').catch(() => {});

                // Write normalized JSONL file
                if (normLines.length > 0) {
                  await fs.writeFile(normJsonlPath, normLines.join('\n') + '\n', 'utf-8').catch(() => {});
                }

                resolveOnce({ content: parsedResponse, durationMs });
              }, 500);
            }
          }
        } catch {
          // Not JSON, ignore
        }
      };

      // Wire up the completion checker now that resolveOnce is available
      onCompletionCheck = checkForCompletion;

      codex.on('close', async (code) => {
        clearTimeout(timeoutId);
        const durationMs = Date.now() - startTime;

        // Flush any remaining line buffer
        if (onStreamLine && lineBuffer.trim()) {
          const jsonLine = convertCodexLineToJson(lineBuffer);
          if (jsonLine) {
            onStreamLine(jsonLine);

            // Write normalized event from remaining buffer
            const events = normalizer.normalize(lineBuffer);
            for (const event of events) {
              normLines.push(JSON.stringify(event));
            }
          }
        }

        if (code === 0 && response) {
          // Parse Codex verbose output to extract just the final response
          // Codex outputs: [timestamp] type\ncontent\n...
          // We want only the final assistant response (last [timestamp] codex block)
          const parsedResponse = parseCodexChatResponse(response);

          // Add assistant response to history
          history.push({ role: 'assistant', content: parsedResponse });

          // Save updated history
          await fs.writeFile(historyPath, JSON.stringify(history, null, 2), 'utf-8').catch(() => {});

          // Write normalized JSONL file
          if (normLines.length > 0) {
            await fs.writeFile(normJsonlPath, normLines.join('\n') + '\n', 'utf-8').catch(() => {});
          }

          resolve({
            content: parsedResponse,
            durationMs,
          });
        } else {
          resolve({
            content: '',
            error: response || 'No response from Codex',
            durationMs,
          });
        }
      });

      codex.on('error', (err) => {
        clearTimeout(timeoutId);
        resolve({
          content: '',
          error: `Failed to spawn Codex: ${err.message}`,
          durationMs: Date.now() - startTime,
        });
      });
    });
  }

  /**
   * Run peer review using Codex CLI
   * This is the adapter that converts generic ReviewOptions to Codex-specific execution
   */
  async runReview(options: ReviewOptions): Promise<ReviewResult> {
    const { prompt, outputPath, projectPath, timeoutMs, model } = options;
    const timeout = timeoutMs ?? CODEX_TIMEOUT_MS;

    logger.debug(`runReview called (prompt length=${prompt.length}, projectPath=${projectPath})`, 'codex-cli');
    const startTime = Date.now();

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let processExited = false;

      logger.debug('Spawning Codex CLI...', 'codex-cli');
      const codexPath = resolveCliPath('codex');

      const args = ['exec', '--output-last-message', outputPath, '-'];

      // Add model flag if specified (adapt to Codex format if supported)
      if (model) {
        // Codex may have different model flag syntax
        // args.push('--model', model);
      }

      const codex: ChildProcess = spawn(codexPath, args, {
        cwd: projectPath,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Set up timeout
      const timeoutId = setTimeout(() => {
        if (!processExited) {
          timedOut = true;
          codex.kill('SIGTERM');
          // Force kill after 5 seconds if SIGTERM didn't work
          setTimeout(() => {
            if (!processExited) {
              codex.kill('SIGKILL');
            }
          }, 5000);
        }
      }, timeout);

      codex.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      codex.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      // Send prompt to stdin
      codex.stdin?.write(prompt);
      codex.stdin?.end();

      codex.on('close', async (code) => {
        processExited = true;
        clearTimeout(timeoutId);
        const durationMs = Date.now() - startTime;
        const elapsed = (durationMs / 1000).toFixed(1);
        logger.debug(`Codex closed after ${elapsed}s, exit code: ${code}, stdout length: ${stdout.length}`, 'codex-cli');

        // Handle timeout
        if (timedOut) {
          resolve({
            success: false,
            feedback: { verdict: 'FAIL', missingRequirements: [], contradictions: [], dependencyErrors: [], duplicates: [], suggestions: [] },
            error: `Codex CLI timed out after ${timeout / 1000} seconds`,
            stdout,
            stderr,
            durationMs,
          });
          return;
        }

        // Read the raw output file if it was created
        let rawOutput = '';
        try {
          rawOutput = await fs.readFile(outputPath, 'utf-8');
        } catch {
          rawOutput = stdout; // Fall back to stdout if raw file not created
        }

        // Extract JSON from output
        const feedback = this.extractJson(rawOutput);

        if (!feedback) {
          resolve({
            success: false,
            feedback: { verdict: 'FAIL', missingRequirements: [], contradictions: [], dependencyErrors: [], duplicates: [], suggestions: [] },
            error: 'Reviewer output could not be parsed as JSON',
            stdout,
            stderr,
            durationMs,
          });
          return;
        }

        // Ensure verdict exists
        if (!feedback.verdict) {
          feedback.verdict = 'FAIL';
        }

        resolve({
          success: code === 0,
          feedback,
          stdout,
          stderr,
          durationMs,
        });
      });

      codex.on('error', (err) => {
        processExited = true;
        clearTimeout(timeoutId);
        const durationMs = Date.now() - startTime;
        resolve({
          success: false,
          feedback: { verdict: 'FAIL', missingRequirements: [], contradictions: [], dependencyErrors: [], duplicates: [], suggestions: [] },
          error: `Failed to spawn Codex CLI: ${err.message}`,
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
   * Extract JSON from potentially mixed text output
   */
  private extractJson(text: string): ReviewFeedback | null {
    for (const candidate of this.findJsonCandidates(text)) {
      try {
        const obj = JSON.parse(candidate) as Partial<ReviewFeedback>;
        if ('verdict' in obj && obj.verdict) {
          // Normalize to full ReviewFeedback structure
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

    // Last resort: check for explicit FAIL
    if (text.toUpperCase().includes('FAIL')) {
      return {
        verdict: 'FAIL',
        missingRequirements: ['Review indicated failure but JSON not parseable'],
        contradictions: [],
        dependencyErrors: [],
        duplicates: [],
        suggestions: [],
      };
    }

    return null;
  }
}
