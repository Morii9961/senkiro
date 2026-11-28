/**
 * `@senkiro/local-db` status probe for the Profile / Journey slots.
 *
 * It opens the real journey database, shows the persistence mode (`opfs-sahpool` or
 * `memory-fallback`) and the ready tables, and offers three self-checks: write one synthetic
 * self-check row, clear those rows, and export the database as JSON.
 *
 * The OPFS SAH-pool VFS holds exclusive file handles, so two open connections in one page
 * would make the second one fall back to memory. All probes therefore share one
 * reference-counted connection; the last probe to unmount closes it (`driver.close()`) after
 * a short grace period, which also absorbs React StrictMode's mount → unmount → mount.
 *
 * `memory-fallback` is explained by the optional `persistenceFallbackReason` the driver may
 * carry (spec §5.3, added to `@senkiro/local-db` in P1-S3). Drivers without the field are
 * still accepted; the probe then says the cause was not reported instead of guessing one.
 */
import {
  JOURNEY_DDL,
  JourneyRepository,
  type LocalDbDriver,
  type LocalDbPersistenceMode,
} from '@senkiro/local-db';
import { openWebLocalDb } from '@senkiro/local-db/web';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MESSAGES } from '../../i18n/messages.ts';
import styles from '../../modules/modules.module.css';
import type { LocalDbStatusProbeSlotProps } from '../slots.tsx';

export type OpenLocalDb = () => Promise<LocalDbDriver>;

/** IDs of synthetic self-check rows; never a real ride. */
export const PROBE_RIDE_PREFIX = 'sk:ride:local:probe-';
const PROBE_STATION = 'sk:station:local:probe';
const PROBE_NODE_ID = 'web_probe';
const CLOSE_GRACE_MS = 250;

/** Table names in the journey schema, read from the package's own DDL. */
export const JOURNEY_TABLES: readonly string[] = JOURNEY_DDL.flatMap((ddl) => {
  const match = /CREATE TABLE IF NOT EXISTS (\w+)/.exec(ddl);
  return match?.[1] === undefined ? [] : [match[1]];
});

interface Session {
  repository: JourneyRepository;
  driver: LocalDbDriver;
}

interface SharedConnection {
  users: number;
  session: Promise<Session>;
  closeTimer: ReturnType<typeof setTimeout> | undefined;
}

const connections = new Map<OpenLocalDb, SharedConnection>();
/** A close still in flight; the next open waits for it so handles are free again. */
const closing = new Map<OpenLocalDb, Promise<void>>();

function acquire(open: OpenLocalDb): Promise<Session> {
  const existing = connections.get(open);
  if (existing !== undefined) {
    existing.users += 1;
    if (existing.closeTimer !== undefined) {
      clearTimeout(existing.closeTimer);
      existing.closeTimer = undefined;
    }
    return existing.session;
  }
  const session = (closing.get(open) ?? Promise.resolve()).then(async () => {
    const driver = await open();
    try {
      const repository = await JourneyRepository.open(driver, { nodeId: PROBE_NODE_ID });
      return { driver, repository };
    } catch (error) {
      await driver.close();
      throw error;
    }
  });
  const shared: SharedConnection = { users: 1, session, closeTimer: undefined };
  connections.set(open, shared);
  // A failed open is not kept: the next probe retries.
  session.catch(() => {
    if (connections.get(open) === shared) {
      connections.delete(open);
    }
  });
  return session;
}

function release(open: OpenLocalDb): void {
  const shared = connections.get(open);
  if (shared === undefined) {
    return;
  }
  shared.users -= 1;
  if (shared.users > 0) {
    return;
  }
  shared.closeTimer = setTimeout(() => {
    if (connections.get(open) !== shared || shared.users > 0) {
      return;
    }
    connections.delete(open);
    const closed = shared.session
      .then(({ driver }) => driver.close())
      .catch(() => undefined)
      .finally(() => {
        if (closing.get(open) === closed) {
          closing.delete(open);
        }
      });
    closing.set(open, closed);
  }, CLOSE_GRACE_MS);
}

/** Resolves once every probe connection opened through `open` has been closed (tests). */
export async function settleLocalDbProbes(open: OpenLocalDb): Promise<void> {
  const shared = connections.get(open);
  if (shared?.closeTimer !== undefined) {
    await new Promise((resolve) => setTimeout(resolve, CLOSE_GRACE_MS + 10));
  }
  await closing.get(open);
}

export type PersistenceFallbackReason = 'unsupported' | 'pool-busy' | 'unknown';

const FALLBACK_REASONS: readonly PersistenceFallbackReason[] = [
  'unsupported',
  'pool-busy',
  'unknown',
];

function isFallbackReason(value: unknown): value is PersistenceFallbackReason {
  return typeof value === 'string' && (FALLBACK_REASONS as readonly string[]).includes(value);
}

/**
 * Reads the optional `persistenceFallbackReason` without depending on a driver type that
 * has it, so the probe works with drivers from before and after P1-S3. Anything other than
 * one of the three documented reasons counts as "not reported".
 */
export function readFallbackReason(driver: LocalDbDriver): PersistenceFallbackReason | null {
  const value: unknown = Reflect.get(driver, 'persistenceFallbackReason');
  return isFallbackReason(value) ? value : null;
}

interface ProbeStatus {
  mode: LocalDbPersistenceMode;
  fallbackReason: PersistenceFallbackReason | null;
  tablesReady: number;
  probeRows: number;
}

async function readStatus({ driver }: Session): Promise<ProbeStatus> {
  const placeholders = JOURNEY_TABLES.map(() => '?').join(', ');
  const [tables] = await driver.execute(
    `SELECT count(*) FROM sqlite_schema WHERE type = 'table' AND name IN (${placeholders})`,
    JOURNEY_TABLES,
  );
  const [rows] = await driver.execute('SELECT count(*) FROM ride_records WHERE id LIKE ?', [
    `${PROBE_RIDE_PREFIX}%`,
  ]);
  return {
    mode: driver.persistenceMode,
    fallbackReason: readFallbackReason(driver),
    tablesReady: Number(tables?.[0] ?? 0),
    probeRows: Number(rows?.[0] ?? 0),
  };
}

async function writeProbeRow({ repository }: Session): Promise<void> {
  const now = new Date();
  const stamp = now.toISOString();
  const id = `${PROBE_RIDE_PREFIX}${now.getTime().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  await repository.recordRide({
    ride: {
      id: id as `sk:ride:${string}:${string}`,
      externalIds: {},
      names: { ja: null, ja_kana: null, en: 'SENKIRO local-db self-check', zh: null },
      provenance: { sourceIds: [], dataNature: 'synthetic', lastVerifiedAt: null },
      validFrom: null,
      validTo: null,
      travelDate: stamp.slice(0, 10),
      originStationId: PROBE_STATION,
      destinationStationId: PROBE_STATION,
      segmentIds: [],
      lineId: null,
      vehicleSeriesId: null,
      trainNumber: null,
      farePaidYen: null,
      notes: 'Synthetic self-check row written by the SENKIRO web status probe. Not a journey.',
      createdAt: stamp,
      updatedAt: stamp,
    },
    segments: [],
    visits: [],
  });
}

async function clearProbeRows({ driver }: Session): Promise<void> {
  const pattern = `${PROBE_RIDE_PREFIX}%`;
  await driver.transaction(async (connection) => {
    await connection.execute(
      "DELETE FROM sync_oplog WHERE entity_type = 'ride' AND entity_id LIKE ?",
      [pattern],
    );
    await connection.execute('DELETE FROM ride_records WHERE id LIKE ?', [pattern]);
  });
}

type ProbeState =
  | { phase: 'opening' }
  | { phase: 'failed'; error: string }
  | { phase: 'ready'; status: ProbeStatus };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface LocalDbStatusProbeProps extends LocalDbStatusProbeSlotProps {
  /** Driver factory; the web slot passes `openWebLocalDb`, tests a Node WASM driver. */
  open: OpenLocalDb;
}

export function LocalDbStatusProbe({ open, lang }: LocalDbStatusProbeProps) {
  const m = MESSAGES[lang].probe;
  const [state, setState] = useState<ProbeState>({ phase: 'opening' });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [exported, setExported] = useState<{ bytes: number; url: string } | null>(null);
  const session = useRef<Session | null>(null);

  useEffect(() => {
    let active = true;
    // Both the open and the first status read can fail; either one ends "opening".
    acquire(open)
      .then(async (opened) => {
        if (active) {
          session.current = opened;
        }
        const status = await readStatus(opened);
        if (active) {
          setState({ phase: 'ready', status });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          session.current = null;
          setState({ phase: 'failed', error: errorText(error) });
        }
      });
    return () => {
      active = false;
      session.current = null;
      release(open);
    };
  }, [open]);

  useEffect(() => () => (exported ? URL.revokeObjectURL(exported.url) : undefined), [exported]);

  const run = useCallback(async (action: (opened: Session) => Promise<void>) => {
    const opened = session.current;
    if (opened === null) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await action(opened);
      const status = await readStatus(opened);
      if (session.current === opened) {
        setState({ phase: 'ready', status });
      }
    } catch (error) {
      // An operation failure is not an open failure: keep the status and every button.
      if (session.current === opened) {
        setActionError(errorText(error));
      }
    } finally {
      setBusy(false);
    }
  }, []);

  if (state.phase === 'opening') {
    return (
      <p role="status" data-local-db-probe="opening">
        {m.opening}
      </p>
    );
  }
  if (state.phase === 'failed') {
    return (
      <p role="alert" data-local-db-probe="failed">
        {m.failed.replace('{error}', state.error)}
      </p>
    );
  }
  const { status } = state;
  const mode = status.mode === 'opfs-sahpool' ? 'opfs-sahpool' : 'memory-fallback';
  const isolated = typeof crossOriginIsolated === 'boolean' && crossOriginIsolated;
  const fallback = mode === 'memory-fallback' ? (status.fallbackReason ?? 'unreported') : null;
  return (
    <div
      className={styles.stack}
      data-local-db-probe="ready"
      data-persistence-mode={status.mode}
      data-fallback-reason={fallback ?? undefined}
      data-tables-ready={status.tablesReady}
      data-probe-rows={status.probeRows}
    >
      <dl className={styles.facts}>
        <dt>{m.mode}</dt>
        <dd>
          <code>{status.mode}</code> · {m.modes[mode]}
        </dd>
        {status.fallbackReason !== null && mode === 'memory-fallback' ? (
          <>
            <dt>{m.fallbackReason}</dt>
            <dd>
              <code>{status.fallbackReason}</code>
            </dd>
          </>
        ) : null}
        <dt>{m.isolation}</dt>
        <dd>{isolated ? m.yes : m.no}</dd>
        <dt>{m.tables}</dt>
        <dd>
          {status.tablesReady} / {JOURNEY_TABLES.length}
        </dd>
        <dt>{m.probeRows}</dt>
        <dd>{status.probeRows}</dd>
      </dl>
      <p className={styles.lead} data-probe-mode-note={fallback ?? 'persistent'}>
        {fallback === null ? m.persistentNote : m.fallbackNotes[fallback]}
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          disabled={busy}
          data-probe-action="write"
          onClick={() => void run(writeProbeRow)}
        >
          {m.write}
        </button>
        <button
          type="button"
          className={styles.button}
          disabled={busy || status.probeRows === 0}
          data-probe-action="clear"
          onClick={() => void run(clearProbeRows)}
        >
          {m.clear}
        </button>
        <button
          type="button"
          className={styles.button}
          disabled={busy}
          data-probe-action="export"
          onClick={() =>
            void run(async ({ repository }) => {
              const json = await repository.exportJSON();
              const blob = new Blob([json], { type: 'application/json' });
              const url =
                typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : '';
              setExported({ bytes: blob.size, url });
            })
          }
        >
          {m.exportJson}
        </button>
      </div>
      {actionError !== null ? (
        <p role="alert" data-probe-action-error="">
          {m.actionFailed.replace('{error}', actionError)}
        </p>
      ) : null}
      {exported ? (
        <p role="status" data-probe-export-bytes={exported.bytes}>
          {m.exported.replace('{bytes}', String(exported.bytes))}
          {exported.url ? (
            <>
              {' · '}
              <a href={exported.url} download="senkiro-journeys.json">
                {m.download}
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      <p className={styles.notice}>{m.note}</p>
    </div>
  );
}

/** The web slot: a real `openWebLocalDb()` Worker (OPFS `sahpool`, else memory fallback). */
export function LocalDbStatusProbeSlot({ lang }: LocalDbStatusProbeSlotProps) {
  return <LocalDbStatusProbe open={openWebLocalDb} lang={lang} />;
}
