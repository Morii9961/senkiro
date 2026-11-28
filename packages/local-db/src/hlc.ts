import { parseHlc, type SyncEntityType, type SyncOpLogEntry } from '@senkiro/contracts';
import type { JourneyDb } from './db.ts';
import { syncOpLog } from './schema.ts';

export function readHlc(hlc: string) {
  const clock = parseHlc(hlc);
  const time = clock && (/^\d+$/.test(clock.time) ? Number(clock.time) : Date.parse(clock.time));
  if (
    clock === null ||
    time === null ||
    !Number.isSafeInteger(time) ||
    !Number.isSafeInteger(clock.counter)
  ) {
    throw new Error(`Invalid sync HLC: ${hlc}`);
  }
  return { time, counter: clock.counter };
}

export async function appendSyncUpsert(
  db: JourneyDb,
  nodeId: string,
  now: number,
  entityType: SyncEntityType,
  entityId: string,
  payload: unknown,
): Promise<SyncOpLogEntry> {
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new Error('The sync clock must provide a non-negative epoch timestamp in milliseconds.');
  }

  // Read while holding the write transaction. Imports, multiple repository instances,
  // and a wall clock moving backwards all use the same persisted high-water mark.
  let time = now;
  let counter = -1;
  for (const row of await db.select({ hlc: syncOpLog.hlc }).from(syncOpLog)) {
    const previous = readHlc(row.hlc);
    if (previous.time > time) {
      ({ time, counter } = previous);
    } else if (previous.time === time) {
      counter = Math.max(counter, previous.counter);
    }
  }
  if (!Number.isSafeInteger(counter + 1)) {
    throw new Error('The sync HLC counter overflowed.');
  }
  const hlc = `${time}-${counter + 1}-${nodeId}`;
  const entry: SyncOpLogEntry = {
    hlc,
    opId: `upsert:${hlc}`,
    entityType,
    entityId,
    op: 'upsert',
    payloadJson: JSON.stringify(payload),
    syncedAt: null,
    createdAt: new Date(now).toISOString(),
  };
  await db.insert(syncOpLog).values(entry);
  return entry;
}
