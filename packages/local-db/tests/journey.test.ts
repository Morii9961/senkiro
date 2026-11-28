import {
  COMMEMORATIVE_WATERMARK,
  type CommemorativeTicket,
  type LineSegmentRef,
  type LocalizedNames,
  parseHlc,
  type RideRecord,
  type SkId,
} from '@senkiro/contracts';
import { getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  commemorativeTickets,
  createJourneyDb,
  JourneyRepository,
  type LocalDbDriver,
  municipalityVisits,
  type RecordRideInput,
  rideRecords,
  rideSegments,
  syncOpLog,
  visitedStations,
} from '../src/index.ts';
import { openNodeLocalDb } from '../src/node.ts';

const origin = 'sk:station:testville:west';
const destination = 'sk:station:testville:central';
const passed = 'sk:station:testville:park';
const segmentA = 'sk:segment:testville:west-park';
const segmentB = 'sk:segment:testville:park-central';
const line = 'sk:line:testville:main';
const names: LocalizedNames = { ja: null, ja_kana: null, en: 'Testville', zh: null };
const clock = Date.parse('2026-11-28T00:00:00Z');

const common = {
  externalIds: {},
  names,
  provenance: {
    sourceIds: ['sk:source:testville:synthetic'],
    dataNature: 'synthetic' as const,
    lastVerifiedAt: null,
  },
  validFrom: null,
  validTo: null,
};

function input(slug = 'outbound', date = '2026-11-15'): RecordRideInput {
  const id: SkId<'ride'> = `sk:ride:testville:${slug}`;
  const ride: RideRecord = {
    ...common,
    id,
    travelDate: date,
    originStationId: origin,
    destinationStationId: destination,
    segmentIds: [segmentA, segmentB],
    lineId: line,
    vehicleSeriesId: 'sk:vehicle:testville:test1',
    trainNumber: null,
    farePaidYen: null,
    notes: 'Synthetic fixture',
    createdAt: '2026-11-15T10:00:00Z',
    updatedAt: '2026-11-15T10:00:00Z',
  };
  return {
    ride,
    segments: [
      { rideId: id, segmentId: segmentA, direction: 'forward', operatingKm: 2 },
      { rideId: id, segmentId: segmentB, direction: 'forward', operatingKm: 3 },
    ],
    visits: [
      { rideId: id, stationId: origin, visitKind: 'boarded' },
      { rideId: id, stationId: destination, visitKind: 'alighted' },
      { rideId: id, stationId: passed, visitKind: 'passed_through' },
    ],
    municipalities: [
      { stationId: origin, municipalityCode: 'test-1', names, prefectureCode: 'test' },
      { stationId: destination, municipalityCode: 'test-1', names, prefectureCode: 'test' },
      { stationId: passed, municipalityCode: 'test-pass-only', names, prefectureCode: 'test' },
    ],
  };
}

function ticketFor(rideId: SkId<'ride'> | null): CommemorativeTicket {
  return {
    ...common,
    id: 'sk:ticket:testville:anniversary',
    rideId,
    templateId: 'jnr-seiji',
    displayOrigin: names,
    displayDestination: names,
    travelDate: '2026-11-15',
    seatClassLabel: null,
    nonValidWatermark: COMMEMORATIVE_WATERMARK,
    allowsBarcode: false,
  };
}

describe('JourneyRepository with the Node SQLite WASM runtime', () => {
  let driver: LocalDbDriver;
  let repo: JourneyRepository;
  const sqliteWarnings: unknown[][] = [];

  beforeAll(() => {
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      sqliteWarnings.push(args);
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  async function expectSQLiteRejection(
    operation: Promise<unknown>,
    error: string | RegExp,
    diagnostic: string,
  ) {
    await expect(operation).rejects.toThrow(error);
    expect(sqliteWarnings.shift()).toEqual(expect.arrayContaining([diagnostic]));
  }

  beforeEach(async () => {
    driver = await openNodeLocalDb();
    repo = await JourneyRepository.open(driver, { nodeId: 'test_node', now: () => clock });
  });

  afterEach(async () => {
    await driver.close();
    expect(sqliteWarnings.splice(0)).toEqual([]);
  });

  it('keeps every SQLite table column, affinity, nullability and primary key aligned with Drizzle', async () => {
    const tables = [
      rideRecords,
      rideSegments,
      visitedStations,
      municipalityVisits,
      commemorativeTickets,
      syncOpLog,
    ];
    for (const table of tables) {
      const rows = await driver.execute(`PRAGMA table_info(${getTableName(table)})`);
      const { columns, primaryKeys } = getTableConfig(table);
      const expected = columns.map((column) => {
        const pk = primaryKeys[0]?.columns.findIndex(({ name }) => name === column.name);
        const primaryOrder = column.primary ? 1 : (pk ?? -1) + 1;
        return [
          column.name,
          column.getSQLType().toUpperCase(),
          Number(column.notNull),
          primaryOrder,
        ];
      });
      expect(rows.map((r) => [r[1], r[2], r[3], r[5]])).toEqual(expected);
    }
    expect(await driver.execute('PRAGMA foreign_keys')).toEqual([[1]]);
    expect(await driver.execute('PRAGMA user_version')).toEqual([[1]]);
  });

  it('enforces visit and sync-operation enums in direct SQLite writes', async () => {
    const { ride } = input();
    await repo.recordRide(input());
    await expectSQLiteRejection(
      driver.execute('UPDATE visited_stations SET visit_kind = ? WHERE ride_id = ?', [
        'photographed',
        ride.id,
      ]),
      'CHECK constraint failed',
      'SQLITE_CONSTRAINT_CHECK',
    );
    await expectSQLiteRejection(
      driver.execute(
        "UPDATE visited_stations SET municipality_code = 'wrong' WHERE visit_kind = 'passed_through'",
      ),
      'CHECK constraint failed',
      'SQLITE_CONSTRAINT_CHECK',
    );
    await expectSQLiteRejection(
      driver.execute("UPDATE sync_oplog SET op = 'replace'"),
      'CHECK constraint failed',
      'SQLITE_CONSTRAINT_CHECK',
    );
  });

  it('guards tickets at both the repository and SQL boundary', async () => {
    const ticket = ticketFor(null);
    await expect(
      repo.saveCommemorativeTicket({ ...ticket, nonValidWatermark: 'VALID' }),
    ).rejects.toThrow('nonValidWatermark');
    await expect(repo.saveCommemorativeTicket({ ...ticket, allowsBarcode: true })).rejects.toThrow(
      'allowsBarcode must be false',
    );
    const counterfeit = { ...ticket, qrPayload: 'forbidden' };
    await expect(repo.saveCommemorativeTicket(counterfeit)).rejects.toThrow(
      'machine-readable field',
    );
    expect(await repo.readSyncOpLog()).toEqual([]);
    await repo.saveCommemorativeTicket(ticket);
    await expectSQLiteRejection(
      driver.execute("UPDATE commemorative_tickets SET non_valid_watermark = 'VALID'"),
      'CHECK constraint failed',
      'SQLITE_CONSTRAINT_CHECK',
    );
    await expectSQLiteRejection(
      driver.execute('UPDATE commemorative_tickets SET allows_barcode = 1'),
      'CHECK constraint failed',
      'SQLITE_CONSTRAINT_CHECK',
    );
    expect(await createJourneyDb(driver).select().from(commemorativeTickets)).toEqual([ticket]);
  });

  it('aggregates partial line coverage, station visits, municipalities and vehicle IDs independently', async () => {
    const journey = input();
    await repo.recordRide(journey);
    const refs = new Map<SkId<'line'>, LineSegmentRef[]>([
      [
        line,
        [
          { id: segmentA, operatingKm: 2 },
          { id: segmentB, operatingKm: 3 },
          { id: 'sk:segment:testville:central-east' as const, operatingKm: 5 },
        ],
      ],
    ]);
    const footprint = await repo.aggregateFootprint(refs);
    expect(footprint.visitedStationIds).toEqual([destination, origin]);
    expect(footprint.municipalities).toEqual([
      {
        municipalityCode: 'test-1',
        names,
        prefectureCode: 'test',
        firstVisitedAt: journey.ride.travelDate,
        triggeredByRideId: journey.ride.id,
      },
    ]);
    expect(footprint.vehicleSeriesIds).toEqual([journey.ride.vehicleSeriesId]);
    expect(footprint.lineCoverage).toEqual([
      {
        lineId: line,
        totalSegments: 3,
        riddenSegments: 2,
        segmentRatio: 2 / 3,
        kmRatio: 0.5,
        isComplete: false,
      },
    ]);
    expect(
      await driver.execute(
        'SELECT visit_kind, municipality_code FROM visited_stations WHERE station_id = ?',
        [passed],
      ),
    ).toEqual([['passed_through', null]]);
  });

  it('filters a municipality row with no qualifying station evidence', async () => {
    const journey = input();
    await repo.recordRide(journey);
    await driver.execute('INSERT INTO municipality_visits VALUES (?, ?, ?, ?, ?)', [
      'test-pass-only',
      JSON.stringify(names),
      'test',
      journey.ride.travelDate,
      journey.ride.id,
    ]);
    const footprint = await repo.aggregateFootprint(new Map());
    expect(footprint.municipalities.map(({ municipalityCode }) => municipalityCode)).toEqual([
      'test-1',
    ]);
  });

  it('keeps the earliest countable ride as municipality evidence after historical entry', async () => {
    await repo.recordRide(input());
    const earlier = input('earlier', '2026-01-15');
    await repo.recordRide(earlier);
    const footprint = await repo.aggregateFootprint(new Map());
    expect(footprint.municipalities).toMatchObject([
      { firstVisitedAt: '2026-01-15', triggeredByRideId: earlier.ride.id },
    ]);
  });

  it('writes monotonic HLC operations across simultaneous calls and a backwards wall clock', async () => {
    const other = await JourneyRepository.open(driver, {
      nodeId: 'second_node',
      now: () => clock - 100,
    });
    const [rideOp, ticketOp] = await Promise.all([
      repo.recordRide(input()),
      other.saveCommemorativeTicket(ticketFor(null)),
    ]);
    const entries = await repo.readSyncOpLog();
    expect(entries).toEqual([rideOp, ticketOp]);
    expect(rideOp).toMatchObject({
      entityType: 'ride',
      entityId: input().ride.id,
      op: 'upsert',
      syncedAt: null,
    });
    expect(parseHlc(rideOp.hlc)).toEqual({ time: String(clock), counter: 0, nodeId: 'test_node' });
    expect(parseHlc(ticketOp.hlc)).toEqual({
      time: String(clock),
      counter: 1,
      nodeId: 'second_node',
    });
    expect(JSON.parse(rideOp.payloadJson ?? '')).toMatchObject({ ride: input().ride });
  });

  it('rolls back the ride, segments, visits and HLC on a late error', async () => {
    const invalidClockRepo = await JourneyRepository.open(driver, {
      nodeId: 'test_node',
      now: () => -1,
    });
    const journey = input();
    await expect(invalidClockRepo.recordRide(journey)).rejects.toThrow('sync clock');
    expect(await repo.getRide(journey.ride.id)).toBeUndefined();
    expect(await repo.readSyncOpLog()).toEqual([]);
    for (const table of [rideSegments, visitedStations, municipalityVisits]) {
      expect(await driver.execute(`SELECT count(*) FROM ${getTableName(table)}`)).toEqual([[0]]);
    }
    await expect(repo.recordRide(journey)).resolves.toMatchObject({ entityId: journey.ride.id });
  });

  it('exports and restores a full SQLite binary and preserves the target on rejection', async () => {
    const journey = input();
    await repo.recordRide(journey);
    await repo.saveCommemorativeTicket(ticketFor(journey.ride.id));
    const bytes = await repo.exportSQLite();
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(bytes.subarray(0, 16))).toBe('SQLite format 3\0');
    const target = await openNodeLocalDb();
    try {
      const restored = await JourneyRepository.open(target, {
        nodeId: 'restored',
        now: () => clock,
      });
      await restored.recordRide(input('will-be-replaced'));
      await restored.importSQLite(bytes);
      expect(await restored.exportJSON()).toBe(await repo.exportJSON());
      await expectSQLiteRejection(
        restored.importSQLite(bytes.slice(0, 512)),
        /malformed/,
        'SQLITE_CORRUPT',
      );
      expect(await restored.getRide(journey.ride.id)).toEqual(journey.ride);
      const followup = await restored.recordRide(input('after-restore'));
      expect(parseHlc(followup.hlc)).toMatchObject({ counter: 2, nodeId: 'restored' });
    } finally {
      await target.close();
    }
  });

  it('rejects a binary whose table shape or constraints changed', async () => {
    const target = await openNodeLocalDb();
    try {
      await JourneyRepository.open(target, { nodeId: 'alternate' });
      await target.execute('ALTER TABLE ride_records ADD COLUMN extra TEXT');
      const bytes = await target.exportSQLite();
      const keep = input();
      await repo.recordRide(keep);
      await expect(repo.importSQLite(bytes)).rejects.toThrow('unsupported journey database schema');
      expect(await repo.getRide(keep.ride.id)).toEqual(keep.ride);
    } finally {
      await target.close();
    }
  });

  it('rejects a binary with a municipality backed only by a passed-through station', async () => {
    const target = await openNodeLocalDb();
    try {
      const alternate = await JourneyRepository.open(target, { nodeId: 'alternate' });
      const journey = input();
      await alternate.recordRide(journey);
      await target.execute('INSERT INTO municipality_visits VALUES (?, ?, ?, ?, ?)', [
        'test-pass-only',
        JSON.stringify(names),
        'test',
        journey.ride.travelDate,
        journey.ride.id,
      ]);
      const bytes = await target.exportSQLite();
      const before = await repo.exportJSON();
      await expect(repo.importSQLite(bytes)).rejects.toThrow('lacks a countable station visit');
      expect(await repo.exportJSON()).toBe(before);
    } finally {
      await target.close();
    }
  });

  it('round-trips all six tables through JSON and rejects invalid replacements atomically', async () => {
    const journey = input();
    await repo.recordRide(journey);
    await repo.saveCommemorativeTicket(ticketFor(journey.ride.id));
    const json = await repo.exportJSON();
    const target = await openNodeLocalDb();
    try {
      const restored = await JourneyRepository.open(target, { nodeId: 'restored' });
      await restored.recordRide(input('before-import'));
      await restored.importJSON(json);
      expect(await restored.exportJSON()).toBe(json);
      const snapshot = JSON.parse(json);
      snapshot.municipalityVisits[0].municipalityCode = 'test-pass-only';
      await expect(restored.importJSON(JSON.stringify(snapshot))).rejects.toThrow(
        'lacks a countable station visit',
      );
      expect(await restored.exportJSON()).toBe(json);
      snapshot.tickets[0].allowsBarcode = true;
      await expect(restored.importJSON(JSON.stringify(snapshot))).rejects.toThrow(
        'allowsBarcode must be false',
      );
      expect(await restored.exportJSON()).toBe(json);
    } finally {
      await target.close();
    }
  });
});
