import type { SQLiteValue, WebPersistenceMode } from './driver.ts';

export interface WorkerOperations {
  open: { args: []; result: WebPersistenceMode };
  execute: { args: [sql: string, parameters: readonly SQLiteValue[]]; result: SQLiteValue[][] };
  exportSQLite: { args: []; result: Uint8Array };
  importSQLite: { args: [Uint8Array]; result: undefined };
  close: { args: []; result: undefined };
}

export type WorkerRequest = {
  [K in keyof WorkerOperations]: { id: number; operation: K; args: WorkerOperations[K]['args'] };
}[keyof WorkerOperations];

export type WorkerResponse =
  | { id: number; value: WorkerOperations[keyof WorkerOperations]['result'] }
  | { id: number; error: string };
