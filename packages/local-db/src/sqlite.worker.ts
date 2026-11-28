import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { SQLiteTransport, WebPersistenceMode } from './driver.ts';
import { createWasmTransport } from './wasm.ts';
import type { WorkerRequest, WorkerResponse } from './web-protocol.ts';

const scope = self as DedicatedWorkerGlobalScope;
let transport: SQLiteTransport | undefined;
let pausePool: (() => void) | undefined;

async function open(): Promise<WebPersistenceMode> {
  const sqlite = await sqlite3InitModule();
  const pool = await sqlite
    .installOpfsSAHPoolVfs({
      name: 'senkiro-journey-sahpool',
      directory: '.senkiro-journey-sahpool',
      preserveOnInitFailure: true,
    })
    .catch(() => null);

  const db = pool ? new pool.OpfsSAHPoolDb('/journeys.sqlite') : new sqlite.oo1.DB(':memory:');
  transport = createWasmTransport(sqlite, db);
  pausePool = pool
    ? () => {
        pool.pauseVfs();
      }
    : undefined;
  return pool ? 'opfs-sahpool' : 'memory-fallback';
}

async function invoke(
  request: WorkerRequest,
): Promise<Exclude<WorkerResponse, { error: string }>['value']> {
  if (request.operation === 'open') {
    if (transport) {
      throw new Error('SQLite worker is already open.');
    }
    return open();
  }
  if (!transport) {
    throw new Error('SQLite worker is closed.');
  }
  switch (request.operation) {
    case 'execute':
      return transport.execute(...request.args);
    case 'exportSQLite':
      return transport.exportSQLite();
    case 'importSQLite':
      await transport.importSQLite(...request.args);
      return undefined;
    case 'close':
      await transport.close();
      transport = undefined;
      pausePool?.();
      pausePool = undefined;
      return undefined;
  }
}

let queue = Promise.resolve();
scope.addEventListener('message', ({ data }: MessageEvent<WorkerRequest>) => {
  queue = queue.then(async () => {
    try {
      const value = await invoke(data);
      const response: WorkerResponse = { id: data.id, value };
      scope.postMessage(response, value instanceof Uint8Array ? [value.buffer] : []);
    } catch (error) {
      const response: WorkerResponse = {
        id: data.id,
        error: error instanceof Error ? error.message : String(error),
      };
      scope.postMessage(response);
    }
  });
});
