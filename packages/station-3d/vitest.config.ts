import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@senkiro/station-3d',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
  },
});
