import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { createManagedDriver } from './driver.ts';
import { createWasmTransport } from './wasm.ts';

let initialization: Promise<Sqlite3Static> | undefined;

/** Node's conditional export initializes the same SQLite WASM build without a browser. */
export async function openNodeLocalDb() {
  initialization ??= sqlite3InitModule();
  const sqlite = await initialization;
  return createManagedDriver(createWasmTransport(sqlite, new sqlite.oo1.DB(':memory:')), 'memory');
}
