import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getReviewTimeout, validateTimeout } from '../spec-review/timeout.js';

describe('timeout utility', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.RALPH_REVIEW_TIMEOUT_MS;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('getReviewTimeout', () => {
    it('should return CLI value when provided', () => {
      const result = getReviewTimeout(120_000);

      expect(result).toBe(120_000);
    });

    it('should return env var value when no CLI flag', () => {
      process.env.RALPH_REVIEW_TIMEOUT_MS = '180000';

      const result = getReviewTimeout();

      expect(result).toBe(180_000);
    });

    it('should return default when no override', () => {
      const result = getReviewTimeout();

      expect(result).toBe(600_000);
    });

    it('should prefer CLI value over env var', () => {
      process.env.RALPH_REVIEW_TIMEOUT_MS = '180000';

      const result = getReviewTimeout(240_000);

      expect(result).toBe(240_000);
    });
  });

  describe('validateTimeout', () => {
    it('should clamp values below minimum to 30 seconds', () => {
      const result = validateTimeout(10_000);

      expect(result).toBe(30_000);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('below minimum')
      );
    });

    it('should clamp values above maximum to 30 minutes', () => {
      const result = validateTimeout(3_600_000);

      expect(result).toBe(1_800_000);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('exceeds maximum')
      );
    });

    it('should return value unchanged when within range', () => {
      const result = validateTimeout(300_000);

      expect(result).toBe(300_000);
      expect(console.warn).not.toHaveBeenCalled();
    });
  });
});
