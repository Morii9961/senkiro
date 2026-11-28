import { createManagedDriver } from './driver.ts';
import type { WorkerOperations, WorkerRequest, WorkerResponse } from './web-protocol.ts';

type WorkerValue = WorkerOperations[keyof WorkerOperations]['result'];

export async function openWebLocalDb() {
  const worker = new Worker(new URL('./sqlite.worker.js', import.meta.url), { type: 'module' });
  let nextId = 0;
  let failure: Error | undefined;
  const pending = new Map<
    number,
    { resolve: (value: WorkerValue) => void; reject: (error: Error) => void }
  >();

  function fail(error: Error) {
    failure = error;
    for (const { reject } of pending.values()) {
      reject(error);
    }
    pending.clear();
    worker.terminate();
  }

  worker.addEventListener('error', ({ message }) =>
    fail(new Error(message || 'SQLite worker failed to load.')),
  );
  worker.addEventListener('messageerror', () =>
    fail(new Error('SQLite worker response could not be decoded.')),
  );
  worker.addEventListener('message', ({ data }: MessageEvent<WorkerResponse>) => {
    const request = pending.get(data.id);
    if (!request) {
      return;
    }
    pending.delete(data.id);
    if ('error' in data) {
      request.reject(new Error(data.error));
    } else {
      request.resolve(data.value);
    }
  });

  function call<K extends keyof WorkerOperations>(
    operation: K,
    ...args: WorkerOperations[K]['args']
  ): Promise<WorkerOperations[K]['result']> {
    return new Promise<WorkerValue>((resolve, reject) => {
      if (failure) {
        reject(failure);
        return;
      }
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      try {
        worker.postMessage({ id, operation, args } as WorkerRequest);
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    }) as Promise<WorkerOperations[K]['result']>;
  }

  try {
    const persistenceMode = await call('open');
    return createManagedDriver(
      {
        execute: (sql, parameters = []) => call('execute', sql, parameters),
        exportSQLite: () => call('exportSQLite'),
        importSQLite: (bytes) => call('importSQLite', bytes),
        async close() {
          try {
            await call('close');
          } finally {
            worker.terminate();
          }
        },
      },
      persistenceMode,
    );
  } catch (error) {
    worker.terminate();
    throw error;
  }
}
