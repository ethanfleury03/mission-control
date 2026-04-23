import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    fileParallelism: false,
    pool: 'forks',
    include: [
      'lib/directory-scraper/__tests__/**/*.test.ts',
      'lib/lead-generation/__tests__/**/*.test.ts',
      'lib/hubspot/__tests__/**/*.test.ts',
      'lib/geo-intelligence/__tests__/**/*.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
