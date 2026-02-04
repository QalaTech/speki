import { describe, it, expect } from 'vitest';
import { QUIRKY_MESSAGES, ACTIVE_DECOMPOSE_STATUSES, DECOMPOSE_COMPLETE_STATUSES } from '../constants';

describe('QUIRKY_MESSAGES', () => {
  it('contains at least 10 messages', () => {
    expect(QUIRKY_MESSAGES.length).toBeGreaterThanOrEqual(10);
  });

  it('each message has text and icon', () => {
    QUIRKY_MESSAGES.forEach((message) => {
      expect(message).toHaveProperty('text');
      expect(message).toHaveProperty('icon');
      expect(typeof message.text).toBe('string');
      expect(typeof message.icon).toBe('string');
      expect(message.text.length).toBeGreaterThan(0);
    });
  });

  it('includes expected quirky messages', () => {
    const texts = QUIRKY_MESSAGES.map((m) => m.text);
    expect(texts).toContain('Thinkering...');
    expect(texts).toContain('This is fine. Everything is fine.');
  });
});

describe('ACTIVE_DECOMPOSE_STATUSES', () => {
  it('contains expected active statuses', () => {
    expect(ACTIVE_DECOMPOSE_STATUSES).toContain('STARTING');
    expect(ACTIVE_DECOMPOSE_STATUSES).toContain('DECOMPOSING');
    expect(ACTIVE_DECOMPOSE_STATUSES).toContain('REVIEWING');
  });

  it('does not contain terminal statuses', () => {
    expect(ACTIVE_DECOMPOSE_STATUSES).not.toContain('COMPLETED');
    expect(ACTIVE_DECOMPOSE_STATUSES).not.toContain('DECOMPOSED');
  });
});

describe('DECOMPOSE_COMPLETE_STATUSES', () => {
  it('contains expected complete statuses', () => {
    expect(DECOMPOSE_COMPLETE_STATUSES).toContain('COMPLETED');
    expect(DECOMPOSE_COMPLETE_STATUSES).toContain('DECOMPOSED');
  });

  it('does not contain active statuses', () => {
    expect(DECOMPOSE_COMPLETE_STATUSES).not.toContain('STARTING');
    expect(DECOMPOSE_COMPLETE_STATUSES).not.toContain('DECOMPOSING');
  });
});
