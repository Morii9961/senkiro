import { drizzle } from 'drizzle-orm/sqlite-proxy';
import type { LocalDbConnection, SQLiteValue } from './driver.ts';
import * as schema from './schema.ts';

/** Drizzle maps typed columns to and from the transport's positional SQLite rows. */
export function createJourneyDb(connection: LocalDbConnection) {
  return drizzle(
    async (sql, params, method) => {
      const rows = await connection.execute(sql, params);
      // Drizzle's get() treats undefined as no row, although its callback type only permits arrays.
      return { rows: method === 'get' ? (rows[0] as SQLiteValue[]) : rows };
    },
    { schema },
  );
}

export type JourneyDb = ReturnType<typeof createJourneyDb>;

export async function insertRows<T>(
  rows: readonly T[],
  insert: (rows: T[]) => PromiseLike<unknown>,
): Promise<void> {
  // The widest table has 17 columns. Keep well below SQLite's bind variable limit.
  for (let i = 0; i < rows.length; i += 500) {
    await insert(rows.slice(i, i + 500));
  }
}
