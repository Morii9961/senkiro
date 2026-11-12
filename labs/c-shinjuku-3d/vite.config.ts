import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * ODPT_CONSUMER_KEY from the environment or from the repository-root
 * .env.local. Read on the server only; never logged, never sent to the browser.
 */
function odptKey(): string | null {
  if (process.env.ODPT_CONSUMER_KEY) return process.env.ODPT_CONSUMER_KEY;
  const file = resolve(here, '..', '..', '.env.local');
  if (!existsSync(file)) return null;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*ODPT_CONSUMER_KEY\s*=\s*(.+?)\s*$/.exec(line);
    if (m?.[1]) return m[1].replace(/^['"]|['"]$/g, '');
  }
  return null;
}

/**
 * Development-only proxy for the ODPT "Challenge" API (local testing).
 * It serves one fixed snapshot — JR East train delays and the Shinjuku station
 * timetables — so the key stays on this machine and the browser cannot use
 * the proxy for anything else. Nothing is written to disk.
 */
function odptDevProxy(): Plugin {
  const base = 'https://api-challenge.odpt.org/api/v4/';
  const railways = ['Yamanote', 'ChuoRapid', 'ChuoSobuLocal', 'SaikyoKawagoe', 'ShonanShinjuku'];
  return {
    name: 'senkiro-odpt-dev-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__odpt/snapshot', (_req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.setHeader('cache-control', 'no-store');
          res.end(JSON.stringify(body));
        };
        const key = odptKey();
        if (!key) return send(503, { error: 'missing-key' });
        const get = async (query: string): Promise<unknown> => {
          const r = await fetch(`${base}${query}&acl:consumerKey=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(15_000) });
          if (!r.ok) throw new Error(`upstream ${r.status}`);
          return r.json();
        };
        Promise.all([
          get('odpt:Train?odpt:operator=odpt.Operator:JR-East'),
          ...railways.map((rw) => get(`odpt:StationTimetable?odpt:operator=odpt.Operator:JR-East&odpt:station=odpt.Station:JR-East.${rw}.Shinjuku`).catch(() => [])),
        ])
          .then(([trains, ...timetables]) => send(200, { fetchedAt: new Date().toISOString(), trains, stationTimetables: timetables.flat() }))
          // the error may carry the request URL (and with it the key): never pass it on
          .catch(() => send(502, { error: 'network-error' }));
      });
    },
  };
}

// Relative base so the built prototype can be opened from any sub-path.
export default defineConfig({
  base: './',
  plugins: [react(), odptDevProxy()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    // three.js + React Three Fiber sit in their own lazily loaded chunk (see App.tsx).
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
