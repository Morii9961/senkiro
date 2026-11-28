import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@senkiro/contracts',
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
