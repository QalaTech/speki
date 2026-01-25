import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  test: {
    globals: false,
    exclude: ['**/node_modules/**', '**/dist/**'],
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          include: ['packages/{core,server,cli}/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        plugins: [react()],
        resolve: {
          alias: {
            '@': path.resolve(__dirname, './packages/web/src'),
            '@features': path.resolve(__dirname, './packages/web/src/features'),
            '@shared': path.resolve(__dirname, './packages/web/src/shared'),
            '@test': path.resolve(__dirname, './packages/web/src/test'),
          },
        },
        test: {
          name: 'jsdom',
          include: ['packages/web/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['./packages/web/src/test/setup.ts'],
          deps: {
            // Inline these problematic packages so they can be mocked
            inline: [/@codesandbox/, /@stitches/],
          },
          alias: {
            // Mock sandpack-react to avoid @stitches/core CSS parsing issues in jsdom
            '@codesandbox/sandpack-react': path.resolve(__dirname, './packages/web/__mocks__/@codesandbox/sandpack-react.js'),
          },
        },
      },
    ],
  },
});
