import { describe, it, expect } from 'vitest';
import { ClaudeStreamNormalizer } from '../claude-normalizer.js';
import type { NormalizedEvent } from '../../../types/index.js';

describe('ClaudeStreamNormalizer', () => {
  const normalizer = new ClaudeStreamNormalizer();

  describe('assistant messages - text blocks', () => {
    it('ClaudeStreamNormalizer_AssistantText_ReturnsTextEvent', () => {
      const chunk = JSON.stringify({
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Hello world' }],
        },
      });

      const events = normalizer.normalize(chunk);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'text',
        content: 'Hello world',
      });
    });

    it('ClaudeStreamNormalizer_MultipleTextBlocks_ReturnsMultipleTextEvents', () => {
      const chunk = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'First response' },
            { type: 'text', text: 'Second response' },
          ],
        },
      });

      const events = normalizer.normalize(chunk);

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({ type: 'text', content: 'First response' });
      expect(events[1]).toEqual({ type: 'text', content: 'Second response' });
    });
  });

  describe('assistant messages - tool_use blocks', () => {
    it('ClaudeStreamNormalizer_AssistantToolUse_ReturnsToolCallEvent', () => {
      const chunk = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tool_123',
              name: 'Bash',
              input: { command: 'ls -la' },
            },
          ],
        },
      });

      const events = normalizer.normalize(chunk);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'tool_call',
        id: 'tool_123',
        name: 'Bash',
        input: { command: 'ls -la' },
        detail: 'ls -la',
      });
    });

    it('ClaudeStreamNormalizer_ToolUseRead_FormatsReadDetail', () => {
      const chunk = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tool_456',
              name: 'Read',
              input: { file_path: '/home/user/file.txt' },
            },
          ],
        },
      });

      const events = normalizer.normalize(chunk);

      expect(events).toHaveLength(1);
      const event = events[0] as NormalizedEvent & { detail?: string };
      expect(event.type).toBe('tool_call');
      expect(event.detail).toBe('/home/user/file.txt');
    });

    it('ClaudeStreamNormalizer_ToolUseGrep_FormatsGrepDetail', () => {
      const chunk = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tool_789',
              name: 'Grep',
              input: { pattern: 'error', path: 'src/' },
            },
          ],
        },
      });

      const events = normalizer.normalize(chunk);

      expect(events).toHaveLength(1);
      const event = events[0] as NormalizedEvent & { detail?: string };
      expect(event.detail).toContain('pattern="error"');
      expect(event.detail).toContain('src/');
    });

    it('ClaudeStreamNormalizer_MultipleToolCalls_ReturnsMultipleToolCallEvents', () => {
      const chunk = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tool_1',
              name: 'Read',
              input: { file_path: '/file1.txt' },
            },
            {
              type: 'tool_use',
              id: 'tool_2',
              name: 'Read',
              input: { file_path: '/file2.txt' },
            },
          ],
        },
      });

      const events = normalizer.normalize(chunk);

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('tool_call');
      expect(events[1].type).toBe('tool_call');
    });

    it('ClaudeStreamNormalizer_TextAndToolUse_ReturnsTextAndToolCall', () => {
      const chunk = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Let me check that file' },
            {
              type: 'tool_use',
              id: 'tool_mix',
              name: 'Read',
              input: { file_path: '/test.txt' },
            },
          ],
        },
      });

      const events = normalizer.normalize(chunk);

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('text');
      expect(events[1].type).toBe('tool_call');
    });
  });

  describe('user messages - tool results', () => {
    it('ClaudeStreamNormalizer_ToolResultSuccess_ReturnsToolResultEvent', () => {
      const chunk = JSON.stringify({
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool_123',
              content: 'File contents here',
            },
          ],
        },
      });

      const events = normalizer.normalize(chunk);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'tool_result',
        tool_use_id: 'tool_123',
        content: 'File contents here',
        is_error: false,
      });
    });

    it('ClaudeStreamNormalizer_ToolResultError_MarksAsError', () => {
      const chunk = JSON.stringify({
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool_456',
              content: 'Command failed',
              is_error: true,
            },
          ],
        },
      });

      const events = normalizer.normalize(chunk);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'tool_result',
        tool_use_id: 'tool_456',
        content: 'Command failed',
        is_error: true,
      });
    });

    it('ClaudeStreamNormalizer_ToolResultContentArray_ExtractsText', () => {
      const chunk = JSON.stringify({
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool_789',
              content: [
                { type: 'text', text: 'First line' },
                { type: 'text', text: 'Second line' },
              ],
            },
          ],
        },
      });

      const events = normalizer.normalize(chunk);

      expect(events).toHaveLength(1);
      const event = events[0] as NormalizedEvent;
      expect(event.type).toBe('tool_result');
      expect((event as any).content).toContain('First line');
      expect((event as any).content).toContain('Second line');
    });

    it('ClaudeStreamNormalizer_ToolResultContentString_UsesDirectly', () => {
      const chunk = JSON.stringify({
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool_str',
              content: 'Simple string result',
            },
          ],
        },
      });

      const events = normalizer.normalize(chunk);

      expect(events).toHaveLength(1);
      const event = events[0] as NormalizedEvent;
      expect((event as any).content).toBe('Simple string result');
    });

    it('ClaudeStreamNormalizer_MultipleToolResults_ReturnsMultipleEvents', () => {
      const chunk = JSON.stringify({
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool_a',
              content: 'Result A',
            },
            {
              type: 'tool_result',
              tool_use_id: 'tool_b',
              content: 'Result B',
            },
          ],
        },
      });

      const events = normalizer.normalize(chunk);

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('tool_result');
      expect(events[1].type).toBe('tool_result');
    });
  });

  describe('result messages - completion', () => {
    it('ClaudeStreamNormalizer_ResultMessage_ReturnsCompleteEvent', () => {
      const chunk = JSON.stringify({
        type: 'result',
        result: { stop_reason: 'end_turn' },
      });

      const events = normalizer.normalize(chunk);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'complete',
        reason: 'end_turn',
      });
    });

    it('ClaudeStreamNormalizer_ResultMessageWithoutStopReason_ReturnsCompleteWithUndefinedReason', () => {
      const chunk = JSON.stringify({
        type: 'result',
        result: {},
      });

      const events = normalizer.normalize(chunk);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('complete');
    });
  });

  describe('system messages - metadata', () => {
    it('ClaudeStreamNormalizer_SystemMessage_ReturnsMetadataEvent', () => {
      const chunk = JSON.stringify({
        type: 'system',
        engine: 'claude-3-5-sonnet',
      });

      const events = normalizer.normalize(chunk);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('metadata');
    });
  });

  describe('edge cases', () => {
    it('ClaudeStreamNormalizer_EmptyLine_ReturnsEmptyArray', () => {
      const chunk = '\n\n   \n';

      const events = normalizer.normalize(chunk);

      expect(events).toHaveLength(0);
    });

    it('ClaudeStreamNormalizer_MalformedJSON_SkipsAndContinues', () => {
      const chunk = 'invalid json here\n' +
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Valid message' }] },
        });

      const events = normalizer.normalize(chunk);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'text',
        content: 'Valid message',
      });
    });

    it('ClaudeStreamNormalizer_MultipleJSONLines_ParsesAll', () => {
      const chunk = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Line 1' }] },
      }) + '\n' +
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Line 2' }] },
      });

      const events = normalizer.normalize(chunk);

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({ type: 'text', content: 'Line 1' });
      expect(events[1]).toEqual({ type: 'text', content: 'Line 2' });
    });

    it('ClaudeStreamNormalizer_EmptyContent_SkipsEmptyTextBlocks', () => {
      const chunk = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: '' },
            { type: 'text', text: 'Actual content' },
          ],
        },
      });

      const events = normalizer.normalize(chunk);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'text',
        content: 'Actual content',
      });
    });

    it('ClaudeStreamNormalizer_MissingOptionalFields_HandlesGracefully', () => {
      const chunk = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              // Missing id, name, input
            },
          ],
        },
      });

      const events = normalizer.normalize(chunk);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('tool_call');
      const event = events[0] as any;
      expect(event.id).toBe('');
      expect(event.name).toBe('');
      expect(event.input).toEqual({});
    });

    it('ClaudeStreamNormalizer_ToolUseWithLongBashCommand_TruncatesDetail', () => {
      const longCmd = 'echo ' + 'x'.repeat(100);
      const chunk = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tool_long',
              name: 'Bash',
              input: { command: longCmd },
            },
          ],
        },
      });

      const events = normalizer.normalize(chunk);

      expect(events).toHaveLength(1);
      const event = events[0] as any;
      expect(event.detail.length).toBeLessThanOrEqual(83); // 80 + '...'
    });

    it('ClaudeStreamNormalizer_ToolUseWithComplexInput_PreservesStructure', () => {
      const complexInput = {
        file_path: '/src/test.ts',
        old_string: 'const x = 1;',
        new_string: 'const x = 2;',
      };

      const chunk = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tool_complex',
              name: 'Edit',
              input: complexInput,
            },
          ],
        },
      });

      const events = normalizer.normalize(chunk);

      expect(events).toHaveLength(1);
      const event = events[0] as any;
      expect(event.input).toEqual(complexInput);
    });
  });

  describe('golden fixtures - realistic scenarios', () => {
    it('ClaudeStreamNormalizer_TypicalInteraction_HandlesCompleteFlow', () => {
      // Simulate a typical Claude interaction: text -> tool call -> tool result -> completion
      const chunk1 = JSON.stringify({
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Let me check the file' }],
        },
      });

      const chunk2 = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tool_read_1',
              name: 'Read',
              input: { file_path: '/src/main.ts' },
            },
          ],
        },
      });

      const chunk3 = JSON.stringify({
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool_read_1',
              content: 'export function main() {\n  console.log("Hello")\n}',
            },
          ],
        },
      });

      const chunk4 = JSON.stringify({
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'The file looks good' }],
        },
      });

      const chunk5 = JSON.stringify({
        type: 'result',
        result: { stop_reason: 'end_turn' },
      });

      const events1 = normalizer.normalize(chunk1);
      const events2 = normalizer.normalize(chunk2);
      const events3 = normalizer.normalize(chunk3);
      const events4 = normalizer.normalize(chunk4);
      const events5 = normalizer.normalize(chunk5);

      const allEvents = [...events1, ...events2, ...events3, ...events4, ...events5];

      expect(allEvents.length).toBeGreaterThan(0);
      expect(allEvents[0].type).toBe('text');
      expect(allEvents.some(e => e.type === 'tool_call')).toBe(true);
      expect(allEvents.some(e => e.type === 'tool_result')).toBe(true);
      expect(allEvents.some(e => e.type === 'complete')).toBe(true);
    });
  });
});
