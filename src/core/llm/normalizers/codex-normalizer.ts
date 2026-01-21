/**
 * Codex stream normalizer - converts Codex CLI output to normalized events
 *
 * NOTE: This is a placeholder implementation. Codex format needs to be determined
 * based on actual Codex CLI output format.
 */

import type { NormalizedEvent, StreamNormalizer } from '../../../types/index.js';

/**
 * Codex CLI output structure (to be determined based on actual output)
 * For now, assuming simple line-based text output
 */
interface CodexMessage {
  type?: string;
  content?: string;
  [key: string]: unknown;
}

export class CodexStreamNormalizer implements StreamNormalizer {
  /**
   * Convert Codex output chunk to normalized events.
   *
   * TODO: Update this based on actual Codex CLI output format.
   * Current implementation assumes:
   * - If JSON: try to parse and extract content
   * - If plain text: treat as text event
   */
  normalize(chunk: string): NormalizedEvent[] {
    const events: NormalizedEvent[] = [];

    // Split chunk into lines
    const lines = chunk.split('\n').filter(line => line.trim());

    for (const line of lines) {
      // Try to parse as JSON first
      try {
        const obj = JSON.parse(line) as CodexMessage;

        // If it has a type field, handle it accordingly
        if (obj.type === 'text' && obj.content) {
          events.push({
            type: 'text',
            content: obj.content,
          });
        } else if (obj.type === 'tool_call') {
          // TODO: Handle tool calls when Codex format is known
          events.push({
            type: 'tool_call',
            id: (obj.id as string) || '',
            name: (obj.name as string) || '',
            input: (obj.input as Record<string, unknown>) || {},
          });
        } else if (obj.type === 'complete') {
          events.push({
            type: 'complete',
            reason: obj.reason as string | undefined,
          });
        } else if (obj.type === 'error') {
          events.push({
            type: 'error',
            message: (obj.message as string) || 'Unknown error',
          });
        } else {
          // Generic metadata event for unknown JSON
          events.push({
            type: 'metadata',
            data: obj,
          });
        }
      } catch {
        // Not JSON - treat as plain text
        if (line.trim()) {
          events.push({
            type: 'text',
            content: line,
          });
        }
      }
    }

    return events;
  }
}
