import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@senkiro/fare-engine',
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
