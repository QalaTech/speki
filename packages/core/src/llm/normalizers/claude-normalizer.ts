/**
 * Claude stream normalizer - converts Claude CLI JSONL output to normalized events
 */

import type { NormalizedEvent, StreamNormalizer } from '../../types/index.js';

/**
 * Claude CLI message structure (stream-json format)
 */
interface ClaudeMessage {
  type: 'assistant' | 'user' | 'result' | 'system';
  message?: {
    content?: Array<{
      type: string;
      text?: string;
      id?: string;
      name?: string;
      input?: Record<string, unknown>;
      tool_use_id?: string;
      content?: string | Array<{ type: string; text?: string }>;
      is_error?: boolean;
    }>;
  };
  result?: {
    stop_reason?: string;
  };
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
 * Extract text from tool result content (handles string or array format)
 */
function extractToolResultContent(content: string | Array<{ type: string; text?: string }> | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(block => block.type === 'text' && block.text)
      .map(block => block.text)
      .join('\n');
  }
  return String(content);
}

export class ClaudeStreamNormalizer implements StreamNormalizer {
  /**
   * Convert Claude JSONL chunk to normalized events.
   * Returns array because a single line may contain multiple events (e.g., multiple tool calls)
   */
  normalize(chunk: string): NormalizedEvent[] {
    const events: NormalizedEvent[] = [];

    // Split chunk into lines (may contain multiple JSONL lines)
    const lines = chunk.split('\n').filter(line => line.trim());

    for (const line of lines) {
      let obj: ClaudeMessage;
      try {
        obj = JSON.parse(line) as ClaudeMessage;
      } catch {
        // Skip non-JSON lines
        continue;
      }

      if (obj.type === 'assistant') {
        const content = obj.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'tool_use') {
              // Tool call
              events.push({
                type: 'tool_call',
                id: block.id || '',
                name: block.name || '',
                input: block.input || {},
                detail: formatToolDetail(block.name || '', block.input || {}),
              });
            } else if (block.type === 'text' && block.text) {
              // Text response
              events.push({
                type: 'text',
                content: block.text,
              });
            }
          }
        }
      } else if (obj.type === 'user') {
        // Handle tool results
        const content = obj.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'tool_result') {
              const isError = block.is_error || false;
              const resultContent = extractToolResultContent(block.content);
              events.push({
                type: 'tool_result',
                tool_use_id: block.tool_use_id || '',
                content: resultContent,
                is_error: isError,
              });
            }
          }
        }
      } else if (obj.type === 'result') {
        // Completion event
        events.push({
          type: 'complete',
          reason: obj.result?.stop_reason,
        });
      } else if (obj.type === 'system') {
        // System/metadata event (e.g., qala-engine line)
        events.push({
          type: 'metadata',
          data: obj as unknown as Record<string, unknown>,
        });
      }
    }

    return events;
  }
}
