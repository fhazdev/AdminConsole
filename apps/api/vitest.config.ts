import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Integration tests share one Postgres schema, so run files serially
    // rather than letting them fight over the same seeded rows.
    fileParallelism: false,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Env must be set before any module reads config.ts at import time.
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
