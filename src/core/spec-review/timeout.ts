/**
 * Timeout configuration for spec review operations.
 */

const DEFAULT_TIMEOUT_MS = 600_000; // 10 minutes
const MIN_TIMEOUT_MS = 30_000; // 30 seconds
const MAX_TIMEOUT_MS = 1_800_000; // 30 minutes

/**
 * Validates and clamps a timeout value to the allowed range.
 * Logs a warning to console when clamping occurs.
 *
 * @param ms - The timeout value in milliseconds
 * @returns The validated timeout, clamped to [30s, 30min]
 */
export function validateTimeout(ms: number): number {
  if (ms < MIN_TIMEOUT_MS) {
    console.warn(
      `Timeout ${ms}ms is below minimum. Clamping to ${MIN_TIMEOUT_MS}ms (30 seconds).`
    );
    return MIN_TIMEOUT_MS;
  }
  if (ms > MAX_TIMEOUT_MS) {
    console.warn(
      `Timeout ${ms}ms exceeds maximum. Clamping to ${MAX_TIMEOUT_MS}ms (30 minutes).`
    );
    return MAX_TIMEOUT_MS;
  }
  return ms;
}

/**
 * Resolves the review timeout from CLI flag > env var > default.
 *
 * Priority:
 * 1. CLI flag (cliTimeout parameter)
 * 2. Environment variable RALPH_REVIEW_TIMEOUT_MS
 * 3. Default (600000ms / 10 minutes)
 *
 * @param cliTimeout - Optional timeout from CLI flag
 * @returns The resolved timeout in milliseconds, validated to [30s, 30min]
 */
export function getReviewTimeout(cliTimeout?: number): number {
  // CLI flag takes precedence
  if (cliTimeout !== undefined) {
    return validateTimeout(cliTimeout);
  }

  // Environment variable takes precedence over default
  const envTimeout = process.env.RALPH_REVIEW_TIMEOUT_MS;
  if (envTimeout !== undefined) {
    const parsed = parseInt(envTimeout, 10);
    if (!isNaN(parsed)) {
      return validateTimeout(parsed);
    }
  }

  // Return default (no validation needed - it's within range)
  return DEFAULT_TIMEOUT_MS;
}
