import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Library build: ESM bundle + one extracted stylesheet in `dist/`. Workspace consumers
 * import `src/` directly (see package.json `exports`), so this build is a packaging check.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index',
      cssFileName: 'ui-kit',
    },
    sourcemap: true,
    rolldownOptions: {
      external: [/^react($|\/)/, /^react-dom($|\/)/, /^@radix-ui\//, /^@senkiro\//],
    },
  },
});
