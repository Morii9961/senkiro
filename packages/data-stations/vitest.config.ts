import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@senkiro/data-stations',
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
