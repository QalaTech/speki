/**
 * Codex stream normalizer - converts Codex CLI output to normalized events
 *
 * NOTE: This is a placeholder implementation. Codex format needs to be determined
 * based on actual Codex CLI output format.
 */

import type { NormalizedEvent, StreamNormalizer } from '../../../types/index.js';

/**
 * Codex CLI output structure - handles both verbose and JSON formats
 */
interface CodexMessage {
  // JSON format fields
  type?: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  msg?: { type?: string };
  reason?: string;
  message?: string;

  // Verbose format fields (converted to JSON)
  timestamp?: string;
  subtype?: string;
  info?: string;
  content?: string;

  // Allow unknown fields
  [key: string]: unknown;
}

export class CodexStreamNormalizer implements StreamNormalizer {
  private timestampPattern = /^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\]\s+/;

  /**
   * Convert Codex output chunk to normalized events.
   *
   * Handles two formats:
   * 1. Verbose format with timestamps: `[2024-01-21T10:00:00] <subtype> <content>`
   * 2. JSON format (--json flag): One JSON object per line
   *
   * Maps all Codex output formats to NormalizedEvent variants.
   */
  normalize(chunk: string): NormalizedEvent[] {
    const events: NormalizedEvent[] = [];

    // Split chunk into lines and process each
    const lines = chunk.split('\n');

    for (const line of lines) {
      // Skip empty lines
      if (!line.trim()) {
        continue;
      }

      // Try to parse as JSON first
      try {
        const obj = JSON.parse(line) as CodexMessage;

        // Handle different JSON formats
        if (obj.type === 'text' && obj.text) {
          events.push({
            type: 'text',
            content: obj.text,
          });
        } else if (obj.type === 'thinking' && obj.thinking) {
          events.push({
            type: 'thinking',
            content: obj.thinking,
          });
        } else if (obj.type === 'tool_use' && obj.name) {
          events.push({
            type: 'tool_call',
            id: obj.id || '',
            name: obj.name,
            input: obj.input || {},
          });
        } else if (obj.msg?.type === 'turn_complete') {
          events.push({
            type: 'complete',
            reason: obj.reason,
          });
        } else if (obj.type === 'usage') {
          // Token usage info
          events.push({
            type: 'metadata',
            data: { usage: obj.info },
          });
        } else if (obj.type === 'system') {
          // System metadata
          events.push({
            type: 'metadata',
            data: {
              subtype: obj.subtype,
              value: obj.content,
            },
          });
        } else {
          // Generic metadata for unknown JSON structures
          events.push({
            type: 'metadata',
            data: obj,
          });
        }
      } catch {
        // Not JSON - try verbose format parsing
        const match = line.match(this.timestampPattern);

        if (match) {
          const content = line.slice(match[0].length);
          const [subtype, ...rest] = content.split(/\s+/);
          const value = rest.join(' ');

          if (subtype === 'thinking') {
            events.push({
              type: 'thinking',
              content: value,
            });
          } else if (subtype === 'codex') {
            events.push({
              type: 'text',
              content: value,
            });
          } else if (subtype === 'exec') {
            events.push({
              type: 'tool_call',
              id: '',
              name: 'bash',
              input: { command: value },
            });
          } else if (subtype === 'tokens') {
            events.push({
              type: 'metadata',
              data: { usage: value },
            });
          } else {
            // Other system info (model, provider, etc.)
            events.push({
              type: 'metadata',
              data: {
                subtype,
                value,
              },
            });
          }
        } else {
          // Non-timestamped line - treat as plain text continuation
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
