/**
 * Query key factory for settings-related queries.
 */
export const settingsKeys = {
  all: ['settings'] as const,
  detection: ['settings', 'detection'] as const,
  cliDetection: ['settings', 'detection', 'cli'] as const,
  modelDetection: ['settings', 'detection', 'models'] as const,
} as const;
