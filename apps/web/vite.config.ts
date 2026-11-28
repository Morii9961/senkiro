import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Cross-origin isolation for the SQLite WASM OPFS `sahpool` VFS used by
 * `@senkiro/local-db/web`. `credentialless` keeps cross-origin no-cors subresources loadable
 * while still isolating the page. Static hosting must send the same two headers.
 */
const CROSS_ORIGIN_ISOLATION = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
} as const;

export default defineConfig({
  plugins: [react()],
  server: { headers: CROSS_ORIGIN_ISOLATION },
  preview: { headers: CROSS_ORIGIN_ISOLATION },
  // The SQLite WASM build locates `sqlite3.wasm` relative to its own module URL; prebundling
  // it into `.vite/deps` would break that lookup in dev.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es' },
  build: {
    target: 'es2023',
    sourcemap: true,
    // Chunks above Vite's 500 kB default are lazy only: three.js inside the station-explorer
    // adapter and the Shinjuku dataset (~80 kB gzip). The shell entry stays ~150 kB gzip.
    chunkSizeWarningLimit: 1200,
  },
});
