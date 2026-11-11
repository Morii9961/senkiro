import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Relative base so the built prototype can be opened from any sub-path.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
