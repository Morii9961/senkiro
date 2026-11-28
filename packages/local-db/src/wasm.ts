import type { Database, Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { JOURNEY_DDL, MUNICIPALITY_EVIDENCE_SQL, SCHEMA_VERSION } from './ddl.ts';
import type { SQLiteTransport, SQLiteValue } from './driver.ts';

const schemaDefinitions = new Set<string>(
  JOURNEY_DDL.map((ddl) => ddl.replace(' IF NOT EXISTS', '')),
);

function restoreSQLite(sqlite: Sqlite3Static, destination: Database, bytes: Uint8Array): void {
  if (new TextDecoder().decode(bytes.subarray(0, 16)) !== 'SQLite format 3\0') {
    throw new Error('Invalid SQLite file header.');
  }
  const { capi, wasm } = sqlite;
  // SQLite recommends padding the deserialization buffer for malformed files.
  const bufferSize = bytes.byteLength + 32;
  const buffer = capi.sqlite3_malloc(bufferSize);
  try {
    const source = new sqlite.oo1.DB(':memory:');
    try {
      const heap = wasm.heap8u();
      heap.set(bytes, buffer);
      heap.fill(0, buffer + bytes.byteLength, buffer + bufferSize);
      const deserialize = capi.sqlite3_deserialize(
        source,
        'main',
        buffer,
        bytes.byteLength,
        bufferSize,
        capi.SQLITE_DESERIALIZE_READONLY,
      );
      if (deserialize !== capi.SQLITE_OK) {
        throw new Error(`SQLite could not read the backup (${deserialize}).`);
      }
      source.exec('PRAGMA trusted_schema = OFF');
      const version = source.selectValue('PRAGMA user_version');
      const schema = source.selectValues(
        "SELECT sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'",
      );
      if (
        version !== SCHEMA_VERSION ||
        schema.length !== schemaDefinitions.size ||
        !schema.every((ddl) => typeof ddl === 'string' && schemaDefinitions.has(ddl))
      ) {
        throw new Error('The backup has an unsupported journey database schema.');
      }
      if (
        source.selectValue('PRAGMA integrity_check') !== 'ok' ||
        source.selectValue('PRAGMA foreign_key_check') !== undefined
      ) {
        throw new Error('The backup failed SQLite integrity validation.');
      }

      if (
        source.selectValue(
          `SELECT 1 FROM municipality_visits WHERE NOT ${MUNICIPALITY_EVIDENCE_SQL} LIMIT 1`,
        ) !== undefined
      ) {
        throw new Error('A restored municipality lacks a countable station visit.');
      }

      // The backup API replaces pages inside SQLite's destination transaction, including on OPFS.
      const backup = capi.sqlite3_backup_init(destination, 'main', source, 'main');
      if (!backup) {
        throw new Error(
          `SQLite could not open the destination: ${capi.sqlite3_errmsg(destination)}`,
        );
      }
      let result: number;
      let finish: number;
      try {
        result = capi.sqlite3_backup_step(backup, -1);
      } finally {
        finish = capi.sqlite3_backup_finish(backup);
      }
      if (result !== capi.SQLITE_DONE || finish !== capi.SQLITE_OK) {
        throw new Error(`SQLite could not restore the backup (${result}, ${finish}).`);
      }
    } finally {
      source.close();
    }
  } finally {
    capi.sqlite3_free(buffer);
  }
}

export function createWasmTransport(sqlite: Sqlite3Static, db: Database): SQLiteTransport {
  db.exec('PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF; PRAGMA temp_store = MEMORY');
  return {
    async execute(sql, parameters = []) {
      const statement = db.prepare(sql);
      try {
        if (parameters.length !== statement.parameterCount) {
          throw new Error('SQLite binding count does not match the statement.');
        }
        if (parameters.length > 0) {
          statement.bind(parameters);
        }
        const rows: SQLiteValue[][] = [];
        while (statement.step()) {
          // SQLite WASM returns BLOB columns as Uint8Array.
          rows.push(statement.get([]) as SQLiteValue[]);
        }
        return rows;
      } finally {
        statement.finalize();
      }
    },
    async exportSQLite() {
      return sqlite.capi.sqlite3_js_db_export(db);
    },
    async importSQLite(bytes) {
      restoreSQLite(sqlite, db, bytes);
    },
    async close() {
      db.close();
    },
  };
}
