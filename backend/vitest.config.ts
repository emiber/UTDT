import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'backend',
    environment: 'node',
    // At most 4 test files at once, the same in both projects (see the root vitest.config.ts).
    maxWorkers: 4,
    // A file's first Fastify request loads modules lazily: ~0.3 s alone, but past the 5 s
    // default when the machine is busy (#8; still seen in machine-wide stalls, see #27).
    testTimeout: 20_000,
  },
});
