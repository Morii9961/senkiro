import { defineConfig } from 'vitest/config';

/**
 * Root Vitest entry: aggregates every workspace package/app that ships its own
 * `vitest.config.ts`, so `pnpm vitest` at the root (and IDE runners) see all tests.
 * CI uses `pnpm test` (Turborepo fan-out); both paths run the same project configs.
 */
export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts', 'apps/*/vitest.config.ts'],
  },
});
