import { describe, it, expect } from 'vitest';
import type { NormalizedEvent } from '../index.js';

describe('NormalizedEvent', () => {
  describe('thinking type', () => {
    it('NormalizedEvent_ThinkingType_AcceptsValidThinkingEvent', () => {
      // Arrange
      const thinkingEvent: NormalizedEvent = {
        type: 'thinking',
        content: 'Let me think about this problem...',
      };

      // Act & Assert
      expect(thinkingEvent.type).toBe('thinking');
      expect(thinkingEvent.content).toBe('Let me think about this problem...');
    });

    it('NormalizedEvent_ThinkingType_RequiresContentField', () => {
      // Arrange & Act & Assert
      // This test verifies that the thinking type requires a content field
      const thinkingEvent: NormalizedEvent = {
        type: 'thinking',
        content: 'Reasoning through the solution',
      };

      expect(thinkingEvent).toHaveProperty('type');
      expect(thinkingEvent).toHaveProperty('content');
      expect(typeof thinkingEvent.content).toBe('string');
    });

    it('should discriminate thinking type from text type', () => {
      // Arrange
      const thinkingEvent: NormalizedEvent = {
        type: 'thinking',
        content: 'Internal reasoning',
      };
      const textEvent: NormalizedEvent = {
        type: 'text',
        content: 'Public output',
      };

      // Act & Assert
      expect(thinkingEvent.type).not.toBe(textEvent.type);
      expect(thinkingEvent.type).toBe('thinking');
      expect(textEvent.type).toBe('text');
    });

    it('should work with other NormalizedEvent types', () => {
      // Arrange
      const events: NormalizedEvent[] = [
        { type: 'thinking', content: 'Analyzing the problem' },
        { type: 'text', content: 'Here is the solution' },
        {
          type: 'tool_call',
          id: '1',
          name: 'my-tool',
          input: { key: 'value' },
        },
      ];

      // Act
      const thinkingEvents = events.filter((e) => e.type === 'thinking');
      const textEvents = events.filter((e) => e.type === 'text');

      // Assert
      expect(thinkingEvents).toHaveLength(1);
      expect(textEvents).toHaveLength(1);
      expect(thinkingEvents[0].type).toBe('thinking');
      if (thinkingEvents[0].type === 'thinking') {
        expect(thinkingEvents[0].content).toBe('Analyzing the problem');
      }
    });
  });
});
