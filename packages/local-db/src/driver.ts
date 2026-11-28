export type SQLiteValue = string | number | bigint | Uint8Array | null;

export interface LocalDbConnection {
  /** Execute one parameterized statement and return positional rows. */
  execute(sql: string, parameters?: readonly SQLiteValue[]): Promise<SQLiteValue[][]>;
}

export type WebPersistenceMode = 'opfs-sahpool' | 'memory-fallback';
export type LocalDbPersistenceMode = WebPersistenceMode | 'memory' | 'native';

export interface LocalDbDriver extends LocalDbConnection {
  readonly persistenceMode: LocalDbPersistenceMode;
  /** An exclusive transaction. Use the supplied connection for all queries in the callback. */
  transaction<T>(work: (connection: LocalDbConnection) => Promise<T>): Promise<T>;
  exportSQLite(): Promise<Uint8Array>;
  /** Validate before atomically replacing this database's contents. */
  importSQLite(bytes: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

/** Implemented by the Phase 5 expo-sqlite adapter. */
export interface ExpoSqliteDriverContract extends LocalDbDriver {
  readonly persistenceMode: 'native';
}

export type SQLiteTransport = Pick<
  LocalDbDriver,
  'execute' | 'exportSQLite' | 'importSQLite' | 'close'
>;

export function createManagedDriver<M extends LocalDbPersistenceMode>(
  transport: SQLiteTransport,
  persistenceMode: M,
): LocalDbDriver & { readonly persistenceMode: M } {
  let queue = Promise.resolve();
  let closed = false;

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = queue.then(work);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function withConnection<T>(work: () => Promise<T>): Promise<T> {
    return enqueue(() => {
      if (closed) {
        throw new Error('The local database is closed.');
      }
      return work();
    });
  }

  return {
    persistenceMode,
    execute: (sql, parameters) => withConnection(() => transport.execute(sql, parameters)),
    transaction(work) {
      return withConnection(async () => {
        await transport.execute('BEGIN IMMEDIATE');
        try {
          const result = await work({
            execute: (sql, parameters) => transport.execute(sql, parameters),
          });
          await transport.execute('COMMIT');
          return result;
        } catch (error) {
          try {
            await transport.execute('ROLLBACK');
          } catch (rollbackError) {
            closed = true;
            await transport.close();
            throw new AggregateError(
              [error, rollbackError],
              'The SQLite transaction could not roll back.',
            );
          }
          throw error;
        }
      });
    },
    exportSQLite: () => withConnection(() => transport.exportSQLite()),
    importSQLite(bytes) {
      const snapshot = bytes.slice();
      return withConnection(() => transport.importSQLite(snapshot));
    },
    close() {
      return enqueue(async () => {
        if (!closed) {
          closed = true;
          await transport.close();
        }
      });
    },
  };
}
