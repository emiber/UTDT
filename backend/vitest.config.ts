import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'backend',
    environment: 'node',
    // A file's first Fastify request loads modules lazily: ~0.3 s alone, but past the 5 s
    // default when the machine is busy (seen even with maxWorkers capped, see #18).
    testTimeout: 20_000,
  },
});
