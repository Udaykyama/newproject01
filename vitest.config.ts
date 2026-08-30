import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // The API tests bind a real socket, so run each file in its own process
    // to keep port binding and SQLite connections isolated.
    pool: 'forks',
  },
});
