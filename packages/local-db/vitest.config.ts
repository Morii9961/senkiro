import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@senkiro/local-db',
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
