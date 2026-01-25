import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getReviewTimeout, validateTimeout } from '../timeout.js';

describe('timeout', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.RALPH_REVIEW_TIMEOUT_MS;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('getReviewTimeout_WithCliFlag_ReturnsCliValue', () => {
    const cliTimeout = 120_000;

    const result = getReviewTimeout(cliTimeout);

    expect(result).toBe(cliTimeout);
  });

  it('getReviewTimeout_WithEnvVar_ReturnsEnvValue', () => {
    process.env.RALPH_REVIEW_TIMEOUT_MS = '300000';

    const result = getReviewTimeout();

    expect(result).toBe(300_000);
  });

  it('getReviewTimeout_WithNoConfig_ReturnsDefault', () => {
    const result = getReviewTimeout();

    expect(result).toBe(1_200_000); // 20 minutes default
  });

  it('getReviewTimeout_WithCliFlagAndEnvVar_PrefersCliFlag', () => {
    process.env.RALPH_REVIEW_TIMEOUT_MS = '300000';
    const cliTimeout = 180_000;

    const result = getReviewTimeout(cliTimeout);

    expect(result).toBe(cliTimeout);
  });

  it('validateTimeout_BelowMinimum_ReturnsMinimum', () => {
    const result = validateTimeout(10_000);

    expect(result).toBe(30_000);
    expect(console.warn).toHaveBeenCalledWith(
      'Timeout 10000ms is below minimum. Clamping to 30000ms (30 seconds).'
    );
  });

  it('validateTimeout_AboveMaximum_ReturnsMaximum', () => {
    const result = validateTimeout(3_600_000);

    expect(result).toBe(1_800_000);
    expect(console.warn).toHaveBeenCalledWith(
      'Timeout 3600000ms exceeds maximum. Clamping to 1800000ms (30 minutes).'
    );
  });

  it('validateTimeout_WithinBounds_ReturnsValue', () => {
    const timeout = 900_000;

    const result = validateTimeout(timeout);

    expect(result).toBe(timeout);
    expect(console.warn).not.toHaveBeenCalled();
  });
});
