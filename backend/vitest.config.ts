import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'backend',
    environment: 'node',
    // A file's first Fastify request loads modules lazily: ~0.3 s alone, but past the 5 s
    // default when the whole gate (coverage, frontend workers) runs on a busy machine.
    testTimeout: 20_000,
  },
});
