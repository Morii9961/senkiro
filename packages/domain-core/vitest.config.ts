import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@senkiro/domain-core',
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
