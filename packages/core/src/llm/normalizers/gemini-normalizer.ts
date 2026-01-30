/**
 * Gemini stream normalizer - converts Gemini CLI output to normalized events
 *
 * Gemini CLI outputs JSON when using `--output-format stream-json`.
 * Each line is a JSON object with a type field.
 */

import type { NormalizedEvent, StreamNormalizer } from '../../types/index.js';

interface GeminiMessage {
  type?: string;
  text?: string;
  thinking?: string;
  id?: string;
  role?: string;
  name?: string;
  input?: Record<string, unknown>;
  reason?: string;
  content?: string;
  message?: {
    role?: string;
    content?: string | Array<{
      type: string;
      text?: string;
      id?: string;
      name?: string;
      input?: Record<string, unknown>;
      toolCall?: { name?: string; args?: Record<string, unknown> };
    }>;
  };
  toolCall?: { name?: string; args?: Record<string, unknown> };
  toolResult?: { output?: string };
  tool_use_id?: string;
  [key: string]: unknown;
}

export class GeminiStreamNormalizer implements StreamNormalizer {
  normalize(chunk: string): NormalizedEvent[] {
    const events: NormalizedEvent[] = [];
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const obj = JSON.parse(line) as GeminiMessage;

        if (obj.type === 'text' && obj.text) {
          events.push({ type: 'text', content: obj.text });
        } else if ((obj.type === 'assistant' || obj.type === 'user' || (obj.type === 'message' && (obj.role === 'assistant' || obj.role === 'user'))) && (obj.content || obj.message?.content)) {
          // Handle complex message format (similar to Claude) or flat format
          const content = obj.content || obj.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && block.text) {
                events.push({ type: 'text', content: block.text });
              } else if (block.type === 'tool_use' || block.type === 'tool_call' || block.type === 'call') {
                events.push({
                  type: 'tool_call',
                  id: block.id || '',
                  name: block.name || (block as any).toolCall?.name || '',
                  input: block.input || (block as any).toolCall?.args || {},
                });
              } else if (block.type === 'tool_result' || block.type === 'result') {
                events.push({
                  type: 'tool_result',
                  tool_use_id: (block as any).tool_use_id || block.id || '',
                  content: (block as any).content || (block as any).toolResult?.output || '',
                  is_error: !!(block as any).is_error,
                });
              }
            }
          } else if (typeof content === 'string') {
            events.push({ type: 'text', content });
          }
        } else if (obj.type === 'thinking' && obj.thinking) {
          events.push({ type: 'thinking', content: obj.thinking });
        } else if ((obj.type === 'tool_use' || obj.type === 'tool_call' || obj.type === 'call') && (obj.name || obj.toolCall?.name)) {
          events.push({
            type: 'tool_call',
            id: obj.id || '',
            name: obj.name || obj.toolCall?.name || '',
            input: obj.input || obj.toolCall?.args || {},
          });
        } else if ((obj.type === 'tool_result' || obj.type === 'result' || obj.toolResult) && (obj.tool_use_id || obj.id)) {
          events.push({
            type: 'tool_result',
            tool_use_id: obj.tool_use_id || obj.id || '',
            content: typeof obj.content === 'string' ? obj.content : obj.toolResult?.output || '',
            is_error: !!obj.is_error,
          });
        } else if (obj.type === 'turn_complete' || obj.type === 'complete') {
          events.push({ type: 'complete', reason: obj.reason });
        } else if (obj.type === 'usage') {
          events.push({ type: 'metadata', data: obj });
        } else {
          events.push({ type: 'metadata', data: obj });
        }
      } catch {
        // Not JSON - treat as plain text
        events.push({ type: 'text', content: line });
      }
    }

    return events;
  }
}