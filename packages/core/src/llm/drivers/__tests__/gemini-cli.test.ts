import { describe, it, expect } from 'vitest';
import { GeminiCliEngine } from '../gemini-cli.js';

describe('GeminiCliEngine', () => {
  it('has correct engine name', () => {
    const engine = new GeminiCliEngine();
    expect(engine.name).toBe('gemini-cli');
  });

  it('implements all Engine interface methods', () => {
    const engine = new GeminiCliEngine();
    expect(typeof engine.isAvailable).toBe('function');
    expect(typeof engine.runStream).toBe('function');
    expect(typeof engine.runChat).toBe('function');
    expect(typeof engine.runReview).toBe('function');
  });
});
