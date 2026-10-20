import { defineConfig } from 'vitest/config';

// Runs both workspaces as Vitest projects and reports one combined coverage.
// The thresholds are the project's Quality gate (see docs/ARCHITECTURE.md).
export default defineConfig({
  test: {
    projects: ['backend', 'frontend'],
    coverage: {
      provider: 'v8',
      include: ['backend/src/**/*.ts', 'frontend/src/**/*.{ts,vue}'],
      // Entry points only: they just call tested functions.
      exclude: [
        '**/*.test.ts',
        'backend/src/server.ts',
        'backend/src/seed-cli.ts',
        'backend/src/eval-cli.ts',
        'frontend/src/main.ts',
      ],
      reporter: ['text', 'html'],
      thresholds: {
        lines: 85,
        statements: 85,
        functions: 85,
        branches: 85,
      },
    },
  },
});
