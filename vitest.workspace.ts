import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'core',
      root: './packages/core',
      include: ['**/*.test.ts'],
      environment: 'node',
      globals: false,
    },
  },
  {
    test: {
      name: 'server',
      root: './packages/server',
      include: ['**/*.test.ts'],
      environment: 'node',
      globals: false,
    },
  },
  {
    test: {
      name: 'cli',
      root: './packages/cli',
      include: ['**/*.test.ts'],
      environment: 'node',
      globals: false,
    },
  },
  {
    test: {
      name: 'web',
      root: './packages/web',
      include: ['**/*.test.{ts,tsx}'],
      exclude: ['**/*.perf.test.ts', '**/*.perf.test.tsx'],
      environment: 'jsdom',
      globals: false,
      setupFiles: ['./src/test/setup.ts'],
    },
  },
]);
