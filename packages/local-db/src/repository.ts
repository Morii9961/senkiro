import {
  type CommemorativeTicketDraft,
  computeLineCoverage,
  isCountableVisit,
  type LineCoverage,
  type LineSegmentRef,
  type LocalizedNames,
  type MunicipalityVisit,
  parseSkId,
  type RideRecord,
  type RideSegment,
  type SkId,
  type SyncOpLogEntry,
  type VisitedStation,
} from '@senkiro/contracts';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import {
  countableVisit,
  exportJourneyJson,
  municipalityEvidence,
  parseJourneyJson,
  restoreJourneyJson,
} from './backup.ts';
import { createJourneyDb, insertRows, type JourneyDb } from './db.ts';
import { initializeJourneySchema } from './ddl.ts';
import type { LocalDbDriver } from './driver.ts';
import { appendSyncUpsert, readHlc } from './hlc.ts';
import {
  commemorativeTickets,
  municipalityVisits,
  rideRecords,
  rideSegments,
  syncOpLog,
  visitedStations,
} from './schema.ts';
import { validateRide, validateTicket } from './validation.ts';

export interface StationMunicipality {
  stationId: SkId<'station'>;
  municipalityCode: string;
  names: LocalizedNames;
  prefectureCode: string;
}

export interface RecordRideInput {
  ride: RideRecord;
  segments: readonly RideSegment[];
  visits: readonly VisitedStation[];
  /** Caller-supplied mappings from the station catalog. Unknown municipalities may be omitted. */
  municipalities?: readonly StationMunicipality[];
}

export interface JourneyRepositoryOptions {
  /** Stable, distinct device/installation ID using the contract's HLC character set. */
  nodeId: string;
  now?: () => number;
}

export interface JourneyFootprint {
  visitedStationIds: SkId<'station'>[];
  municipalities: MunicipalityVisit[];
  lineCoverage: Array<LineCoverage & { lineId: SkId<'line'> }>;
  vehicleSeriesIds: SkId<'vehicle'>[];
}

export class JourneyRepository {
  private constructor(
    private readonly driver: LocalDbDriver,
    private readonly nodeId: string,
    private readonly now: () => number,
  ) {}

  static async open(
    driver: LocalDbDriver,
    { nodeId, now = Date.now }: JourneyRepositoryOptions,
  ): Promise<JourneyRepository> {
    if (!/^[A-Za-z0-9_]+$/.test(nodeId)) {
      throw new Error('The HLC node ID may only contain letters, digits, and underscores.');
    }
    await initializeJourneySchema(driver);
    return new JourneyRepository(driver, nodeId, now);
  }

  /** Add a new ride and its child records as one transaction. Ride IDs are unique. */
  async recordRide(input: RecordRideInput): Promise<SyncOpLogEntry> {
    const { ride, segments, visits, municipalities = [] } = structuredClone(input);
    validateRide(ride, segments, visits);
    const byStation = new Map<SkId<'station'>, StationMunicipality>();
    const byCode = new Map<string, StationMunicipality>();
    for (const place of municipalities) {
      parseSkId(place.stationId, 'station');
      if (
        !place.municipalityCode.trim() ||
        !place.prefectureCode.trim() ||
        (byStation.has(place.stationId) &&
          byStation.get(place.stationId)?.municipalityCode !== place.municipalityCode)
      ) {
        throw new Error(
          'A station municipality must have unambiguous municipality and prefecture codes.',
        );
      }
      byStation.set(place.stationId, place);
      byCode.set(place.municipalityCode, place);
    }

    return this.driver.transaction(async (connection) => {
      const db = createJourneyDb(connection);
      await db.insert(rideRecords).values(ride);
      await insertRows(segments, (rows) => db.insert(rideSegments).values(rows));
      const stationRows = visits.map((visit) => ({
        ...visit,
        municipalityCode: isCountableVisit(visit)
          ? (byStation.get(visit.stationId)?.municipalityCode ?? null)
          : null,
      }));
      await insertRows(stationRows, (rows) => db.insert(visitedStations).values(rows));
      const areas = await db
        .selectDistinct({ code: visitedStations.municipalityCode })
        .from(visitedStations)
        .where(
          and(
            eq(visitedStations.rideId, ride.id),
            isNotNull(visitedStations.municipalityCode),
            countableVisit,
          ),
        );
      const qualified: MunicipalityVisit[] = [];
      for (const { code } of areas) {
        const place = code === null ? undefined : byCode.get(code);
        if (!place) {
          continue;
        }
        const visit: MunicipalityVisit = {
          municipalityCode: place.municipalityCode,
          names: place.names,
          prefectureCode: place.prefectureCode,
          firstVisitedAt: ride.travelDate,
          triggeredByRideId: ride.id,
        };
        await db
          .insert(municipalityVisits)
          .values(visit)
          .onConflictDoUpdate({
            target: municipalityVisits.municipalityCode,
            set: visit,
            setWhere: sql`(excluded.first_visited_at, excluded.triggered_by_ride_id) < (${municipalityVisits.firstVisitedAt}, ${municipalityVisits.triggeredByRideId})`,
          });
        qualified.push(visit);
      }
      return appendSyncUpsert(db, this.nodeId, this.now(), 'ride', ride.id, {
        ride,
        segments,
        visits: stationRows,
        municipalityVisits: qualified,
      });
    });
  }

  async getRide(id: SkId<'ride'>): Promise<RideRecord | undefined> {
    parseSkId(id, 'ride');
    return createJourneyDb(this.driver)
      .select()
      .from(rideRecords)
      .where(eq(rideRecords.id, id))
      .get();
  }

  async saveCommemorativeTicket(draft: CommemorativeTicketDraft): Promise<SyncOpLogEntry> {
    const ticket = validateTicket(structuredClone(draft));
    return this.driver.transaction(async (connection) => {
      const db = createJourneyDb(connection);
      await db
        .insert(commemorativeTickets)
        .values(ticket)
        .onConflictDoUpdate({ target: commemorativeTickets.id, set: ticket });
      return appendSyncUpsert(db, this.nodeId, this.now(), 'ticket', ticket.id, ticket);
    });
  }

  async readSyncOpLog(): Promise<SyncOpLogEntry[]> {
    const entries = await createJourneyDb(this.driver).select().from(syncOpLog);
    return entries
      .map((entry) => ({ entry, ...readHlc(entry.hlc) }))
      .sort(
        (a, b) =>
          a.time - b.time ||
          a.counter - b.counter ||
          (a.entry.hlc < b.entry.hlc ? -1 : a.entry.hlc > b.entry.hlc ? 1 : 0),
      )
      .map(({ entry }) => entry);
  }

  aggregateFootprint(
    lines: ReadonlyMap<SkId<'line'>, readonly LineSegmentRef[]>,
  ): Promise<JourneyFootprint> {
    return this.driver.transaction(async (connection) => {
      const db = createJourneyDb(connection);
      return this.readFootprint(db, lines);
    });
  }

  private async readFootprint(
    db: JourneyDb,
    lines: ReadonlyMap<SkId<'line'>, readonly LineSegmentRef[]>,
  ): Promise<JourneyFootprint> {
    const stations = await db
      .selectDistinct({ id: visitedStations.stationId })
      .from(visitedStations)
      .where(countableVisit)
      .orderBy(visitedStations.stationId);
    const municipalities = await db
      .select()
      .from(municipalityVisits)
      .where(municipalityEvidence)
      .orderBy(municipalityVisits.municipalityCode);
    const segments = await db.selectDistinct({ id: rideSegments.segmentId }).from(rideSegments);
    const ridden = new Set(segments.map(({ id }) => id));
    const vehicles = await db
      .selectDistinct({ id: rideRecords.vehicleSeriesId })
      .from(rideRecords)
      .where(isNotNull(rideRecords.vehicleSeriesId))
      .orderBy(rideRecords.vehicleSeriesId);
    return {
      visitedStationIds: stations.map(({ id }) => id),
      municipalities,
      lineCoverage: [...lines].map(([lineId, refs]) => ({
        lineId,
        ...computeLineCoverage(refs, ridden),
      })),
      vehicleSeriesIds: vehicles.flatMap(({ id }) => (id !== null ? [id] : [])),
    };
  }

  exportSQLite(): Promise<Uint8Array> {
    return this.driver.exportSQLite();
  }

  importSQLite(bytes: Uint8Array): Promise<void> {
    return this.driver.importSQLite(bytes);
  }

  exportJSON(): Promise<string> {
    return this.driver.transaction((connection) => exportJourneyJson(createJourneyDb(connection)));
  }

  async importJSON(json: string): Promise<void> {
    const snapshot = parseJourneyJson(json);
    return this.driver.transaction((connection) =>
      restoreJourneyJson(createJourneyDb(connection), snapshot),
    );
  }
}
