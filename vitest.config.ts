import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // The API tests bind a real socket; a single worker keeps port usage and
    // SQLite handles predictable.
    pool: 'forks',
  },
});
