import type {
  CommemorativeTicket,
  MunicipalityVisit,
  RideRecord,
  RideSegment,
  SyncOpLogEntry,
} from '@senkiro/contracts';
import { COUNTABLE_VISIT_SQL_PREDICATE, isCountableVisit } from '@senkiro/contracts';
import { sql } from 'drizzle-orm';
import { insertRows, type JourneyDb } from './db.ts';
import { MUNICIPALITY_EVIDENCE_SQL, SCHEMA_VERSION } from './ddl.ts';
import { readHlc } from './hlc.ts';
import {
  commemorativeTickets,
  municipalityVisits,
  rideRecords,
  rideSegments,
  syncOpLog,
  visitedStations,
} from './schema.ts';
import { validateRide, validateTicket } from './validation.ts';

export type StoredStationVisit = typeof visitedStations.$inferSelect;
export const countableVisit = sql.raw(COUNTABLE_VISIT_SQL_PREDICATE);

export interface JourneyBackup {
  schemaVersion: typeof SCHEMA_VERSION;
  rides: RideRecord[];
  rideSegments: RideSegment[];
  visitedStations: StoredStationVisit[];
  municipalityVisits: MunicipalityVisit[];
  tickets: CommemorativeTicket[];
  opLog: SyncOpLogEntry[];
}

export const municipalityEvidence = sql.raw(MUNICIPALITY_EVIDENCE_SQL);

export async function exportJourneyJson(db: JourneyDb): Promise<string> {
  const snapshot: JourneyBackup = {
    schemaVersion: SCHEMA_VERSION,
    rides: await db.select().from(rideRecords).orderBy(rideRecords.id),
    rideSegments: await db
      .select()
      .from(rideSegments)
      .orderBy(rideSegments.rideId, rideSegments.segmentId, rideSegments.direction),
    visitedStations: await db
      .select()
      .from(visitedStations)
      .orderBy(visitedStations.rideId, visitedStations.stationId, visitedStations.visitKind),
    municipalityVisits: await db
      .select()
      .from(municipalityVisits)
      .orderBy(municipalityVisits.municipalityCode),
    tickets: await db.select().from(commemorativeTickets).orderBy(commemorativeTickets.id),
    opLog: await db.select().from(syncOpLog).orderBy(syncOpLog.opId),
  };
  return JSON.stringify(snapshot);
}

function groupByRide<T extends { rideId: string }>(rows: readonly T[]): Map<string, T[]> {
  const byRide = new Map<string, T[]>();
  for (const row of rows) {
    const group = byRide.get(row.rideId);
    if (group) {
      group.push(row);
    } else {
      byRide.set(row.rideId, [row]);
    }
  }
  return byRide;
}

export function parseJourneyJson(json: string): JourneyBackup {
  const input: unknown = JSON.parse(json);
  if (
    typeof input !== 'object' ||
    input === null ||
    !('schemaVersion' in input) ||
    input.schemaVersion !== SCHEMA_VERSION
  ) {
    throw new Error('Unsupported journey JSON backup version.');
  }
  for (const key of [
    'rides',
    'rideSegments',
    'visitedStations',
    'municipalityVisits',
    'tickets',
    'opLog',
  ] as const) {
    if (!Array.isArray((input as Record<string, unknown>)[key])) {
      throw new Error(`Invalid journey JSON backup array: ${key}.`);
    }
  }
  const snapshot = input as JourneyBackup;
  const segmentsByRide = groupByRide(snapshot.rideSegments);
  const visitsByRide = groupByRide(snapshot.visitedStations);
  for (const ride of snapshot.rides) {
    validateRide(ride, segmentsByRide.get(ride.id) ?? [], visitsByRide.get(ride.id) ?? []);
  }
  for (const ticket of snapshot.tickets) {
    validateTicket(ticket);
  }
  for (const operation of snapshot.opLog) {
    readHlc(operation.hlc);
  }
  for (const visit of snapshot.visitedStations) {
    if (
      visit.municipalityCode !== null &&
      (!isCountableVisit(visit) ||
        typeof visit.municipalityCode !== 'string' ||
        !visit.municipalityCode)
    ) {
      throw new Error('A municipality needs a countable station visit with a municipality code.');
    }
  }
  return snapshot;
}

export async function restoreJourneyJson(db: JourneyDb, snapshot: JourneyBackup): Promise<void> {
  await db.delete(syncOpLog);
  await db.delete(commemorativeTickets);
  await db.delete(municipalityVisits);
  await db.delete(rideRecords); // Cascades to ride_segments and visited_stations.
  await insertRows(snapshot.rides, (rows) => db.insert(rideRecords).values(rows));
  await insertRows(snapshot.rideSegments, (rows) => db.insert(rideSegments).values(rows));
  await insertRows(snapshot.visitedStations, (rows) => db.insert(visitedStations).values(rows));
  await insertRows(snapshot.municipalityVisits, (rows) =>
    db.insert(municipalityVisits).values(rows),
  );
  await insertRows(snapshot.tickets, (rows) => db.insert(commemorativeTickets).values(rows));
  await insertRows(snapshot.opLog, (rows) => db.insert(syncOpLog).values(rows));

  const orphan = await db
    .select({ code: municipalityVisits.municipalityCode })
    .from(municipalityVisits)
    .where(sql`NOT ${municipalityEvidence}`)
    .limit(1);
  if (orphan.length) {
    throw new Error('A restored municipality lacks a countable station visit.');
  }
}
