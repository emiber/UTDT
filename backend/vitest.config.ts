import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'backend',
    environment: 'node',
    // At most 4 test files at once, not one per CPU: each worker must start within Vitest's
    // fixed 60 s. Same value in both projects (see docs/ARCHITECTURE.md, Quality gate).
    maxWorkers: 4,
    // A file's first Fastify request loads modules lazily: ~0.3 s alone, but past the 5 s
    // default when the machine is busy (#8).
    testTimeout: 20_000,
  },
});
