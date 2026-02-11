/**
 * TypeScript port of stream_parser.py
 *
 * Parses Claude CLI stream-json output in real-time:
 * - Reads JSONL line-by-line from a stream
 * - Deduplicates tool calls (shows each tool only once)
 * - Deduplicates text content (avoids repeating streaming chunks)
 * - Outputs to console in real-time with immediate flushing
 * - Extracts full text for completion detection
 */

import { createInterface } from 'readline';
import type { Readable } from 'stream';
import type {
  StreamMessage,
  ContentBlock,
  ToolCall,
  ParsedOutput,
  StreamCallbacks,
} from './types.js';

/**
 * Extract error message from XML-wrapped error content
 */
function extractErrorMessage(content: string): string {
  const patterns = [
    /<tool_use_error>([\s\S]*?)<\/tool_use_error>/,
    /<error>([\s\S]*?)<\/error>/,
    /<Error>([\s\S]*?)<\/Error>/,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return content.trim();
}

/**
 * Format tool detail for display based on tool type
 */
function formatToolDetail(name: string, input: Record<string, unknown>): string {
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
      return (input.file_path as string) || '';
    case 'Write':
      return (input.file_path as string) || '';
    default: {
      const desc = input.description as string;
      if (desc) return desc;
      const str = JSON.stringify(input);
      return str.length > 60 ? str.substring(0, 60) + '...' : str;
    }
  }
}

/**
 * Parse a single JSONL line and extract relevant information
 */
function parseLine(
  line: string,
  state: {
    fullText: string;
    seenTools: Set<string>;
    toolCalls: ToolCall[];
  },
  callbacks: StreamCallbacks
): void {
  if (!line.trim()) return;

  let obj: StreamMessage;
  try {
    obj = JSON.parse(line) as StreamMessage;
  } catch {
    // Skip non-JSON lines
    return;
  }

  if (obj.type === 'assistant') {
    const message = obj.message;
    const content = message?.content;

    if (Array.isArray(content)) {
      for (const block of content as ContentBlock[]) {
        if (block.type === 'tool_use') {
          const toolId = block.id;
          if (toolId && !state.seenTools.has(toolId)) {
            state.seenTools.add(toolId);
            const detail = formatToolDetail(block.name, block.input);
            state.toolCalls.push({
              id: toolId,
              name: block.name,
              input: block.input,
              detail,
            });
            callbacks.onToolCall?.(block.name, detail);
          }
        } else if (block.type === 'text') {
          const text = block.text;
          // Deduplicate text (same logic as Python)
          if (text && !state.fullText.includes(text)) {
            state.fullText += text;
            callbacks.onText?.(text);
          }
        }
      }
    }
  } else if (obj.type === 'user') {
    // Handle tool results
    const message = obj.message;
    const content = message?.content;

    if (Array.isArray(content)) {
      for (const block of content as ContentBlock[]) {
        if (block.type === 'tool_result') {
          const toolUseId = (block as unknown as { tool_use_id?: string }).tool_use_id;
          const isError = (block as unknown as { is_error?: boolean }).is_error;
          const resultContent = (block as unknown as { content?: string }).content;

          if (isError && resultContent) {
            callbacks.onToolResult?.(`❌ Error: ${extractErrorMessage(resultContent).substring(0, 200)}`);
          } else if (resultContent && resultContent.length < 500) {
            // Only show short results
            callbacks.onToolResult?.(`  ✓ ${resultContent.substring(0, 100)}${resultContent.length > 100 ? '...' : ''}`);
          } else {
            callbacks.onToolResult?.('  ✓ (result received)');
          }
        }
      }
    }
  } else if (obj.type === 'result') {
    const result = obj.result;
    const content = result?.content;

    if (Array.isArray(content)) {
      for (const block of content as ContentBlock[]) {
        if (block.type === 'text') {
          const text = block.text;
          if (text && !state.fullText.includes(text)) {
            state.fullText += text;
            callbacks.onText?.(text);
          }
        }
      }
    }
  }
}

/**
 * Parse a stream of JSONL data from Claude CLI
 *
 * @param stream - Readable stream of JSONL data
 * @param callbacks - Callbacks for text and tool events
 * @returns Parsed output with full text, tool calls, and completion status
 */
export async function parseStream(
  stream: Readable,
  callbacks: StreamCallbacks = {}
): Promise<ParsedOutput> {
  const state = {
    fullText: '',
    seenTools: new Set<string>(),
    toolCalls: [] as ToolCall[],
  };

  const rl = createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    try {
      parseLine(line, state, callbacks);
    } catch (error) {
      callbacks.onError?.(error as Error);
    }
  }

  return {
    fullText: state.fullText,
    toolCalls: state.toolCalls,
    // Only mark complete if the response ENDS with the completion tag (with optional whitespace)
    // This prevents false positives when Claude mentions the tag in explanations
    isComplete: /\<promise\>COMPLETE\<\/promise\>\s*$/.test(state.fullText),
  };
}

/**
 * Default console output callbacks
 */
export function createConsoleCallbacks(): StreamCallbacks {
  return {
    onText: (text: string) => {
      process.stdout.write(text);
    },
    onToolCall: (name: string, detail: string) => {
      console.log(`  🔧 ${name}: ${detail}`);
    },
    onError: (error: Error) => {
      console.error('Parse error:', error.message);
    },
  };
}

/**
 * Silent callbacks that collect data without output
 */
export function createSilentCallbacks(): StreamCallbacks {
  return {};
}

/**
 * Create callbacks that write to both console and a progress file
 */
export function createProgressCallbacks(
  appendToFile: (text: string) => Promise<void>
): StreamCallbacks {
  return {
    onText: async (text: string) => {
      process.stdout.write(text);
      await appendToFile(text);
    },
    onToolCall: async (name: string, detail: string) => {
      const line = `  🔧 ${name}: ${detail}\n`;
      console.log(line.trimEnd());
      await appendToFile(line);
    },
    onToolResult: async (result: string) => {
      console.log(result);
      await appendToFile(result + '\n');
    },
    onError: (error: Error) => {
      console.error('Parse error:', error.message);
    },
  };
}
