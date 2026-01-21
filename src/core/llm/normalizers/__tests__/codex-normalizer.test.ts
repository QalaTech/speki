import { describe, it, expect } from 'vitest';
import { CodexStreamNormalizer } from '../codex-normalizer.js';

describe('CodexStreamNormalizer', () => {
  const normalizer = new CodexStreamNormalizer();

  it('CodexStreamNormalizer_VerboseThinking_ReturnsThinkingEvent', () => {
    const chunk = '[2024-01-21T10:00:00] thinking Let me analyze this problem';
    const events = normalizer.normalize(chunk);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'thinking',
      content: 'Let me analyze this problem',
    });
  });

  it('CodexStreamNormalizer_VerboseText_ReturnsTextEvent', () => {
    const chunk = '[2024-01-21T10:00:00] codex Here is my response';
    const events = normalizer.normalize(chunk);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'text',
      content: 'Here is my response',
    });
  });

  it('CodexStreamNormalizer_VerboseExec_ReturnsToolCallEvent', () => {
    const chunk = '[2024-01-21T10:00:00] exec ls -la /tmp';
    const events = normalizer.normalize(chunk);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'tool_call',
      id: '',
      name: 'bash',
      input: { command: 'ls -la /tmp' },
    });
  });

  it('CodexStreamNormalizer_JsonText_ReturnsTextEvent', () => {
    const chunk = JSON.stringify({
      type: 'text',
      text: 'This is a response',
    });
    const events = normalizer.normalize(chunk);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'text',
      content: 'This is a response',
    });
  });

  it('CodexStreamNormalizer_TurnComplete_ReturnsCompleteEvent', () => {
    const chunk = JSON.stringify({
      msg: { type: 'turn_complete' },
      reason: 'completed',
    });
    const events = normalizer.normalize(chunk);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'complete',
      reason: 'completed',
    });
  });

  it('CodexStreamNormalizer_NonJson_ReturnsTextEvent', () => {
    const chunk = 'This is plain text without JSON or timestamp';
    const events = normalizer.normalize(chunk);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'text',
      content: 'This is plain text without JSON or timestamp',
    });
  });

  it('CodexStreamNormalizer_EmptyLine_ReturnsEmptyArray', () => {
    const chunk = '\n\n   \n';
    const events = normalizer.normalize(chunk);

    expect(events).toHaveLength(0);
  });
});
