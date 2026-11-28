import { COMMEMORATIVE_WATERMARK, COUNTABLE_VISIT_SQL_PREDICATE } from '@senkiro/contracts';
import type { LocalDbDriver } from './driver.ts';

export const SCHEMA_VERSION = 1;

export const MUNICIPALITY_EVIDENCE_SQL = `EXISTS (
  SELECT 1 FROM visited_stations
  WHERE visited_stations.ride_id = municipality_visits.triggered_by_ride_id
    AND visited_stations.municipality_code = municipality_visits.municipality_code
    AND ${COUNTABLE_VISIT_SQL_PREDICATE}
)`;

// Keep these definitions aligned with schema.ts. SQLite stores them in sqlite_schema
// without IF NOT EXISTS, so the same statements identify a valid v1 binary backup.
export const JOURNEY_DDL = [
  `CREATE TABLE IF NOT EXISTS ride_records (
    id TEXT NOT NULL PRIMARY KEY,
    external_ids TEXT NOT NULL CHECK (json_valid(external_ids)),
    names TEXT NOT NULL CHECK (json_valid(names)),
    provenance TEXT NOT NULL CHECK (json_valid(provenance)),
    valid_from TEXT,
    valid_to TEXT,
    travel_date TEXT NOT NULL,
    origin_station_id TEXT NOT NULL,
    destination_station_id TEXT NOT NULL,
    segment_ids TEXT NOT NULL CHECK (json_valid(segment_ids)),
    line_id TEXT,
    vehicle_series_id TEXT,
    train_number TEXT,
    fare_paid_yen INTEGER,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS ride_segments (
    ride_id TEXT NOT NULL REFERENCES ride_records(id) ON DELETE CASCADE,
    segment_id TEXT NOT NULL,
    direction TEXT NOT NULL CONSTRAINT ride_direction CHECK (direction IN ('forward','reverse','unknown')),
    operating_km REAL,
    PRIMARY KEY (ride_id, segment_id, direction)
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS visited_stations (
    ride_id TEXT NOT NULL REFERENCES ride_records(id) ON DELETE CASCADE,
    station_id TEXT NOT NULL,
    visit_kind TEXT NOT NULL CONSTRAINT visit_kind_allowed CHECK (visit_kind IN ('boarded','alighted','transferred','passed_through')),
    municipality_code TEXT,
    CONSTRAINT municipality_countable_visit CHECK (municipality_code IS NULL OR (${COUNTABLE_VISIT_SQL_PREDICATE})),
    PRIMARY KEY (ride_id, station_id, visit_kind)
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS municipality_visits (
    municipality_code TEXT NOT NULL PRIMARY KEY,
    names TEXT NOT NULL CHECK (json_valid(names)),
    prefecture_code TEXT NOT NULL,
    first_visited_at TEXT NOT NULL,
    triggered_by_ride_id TEXT NOT NULL REFERENCES ride_records(id)
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS commemorative_tickets (
    id TEXT NOT NULL PRIMARY KEY,
    external_ids TEXT NOT NULL CHECK (json_valid(external_ids)),
    names TEXT NOT NULL CHECK (json_valid(names)),
    provenance TEXT NOT NULL CHECK (json_valid(provenance)),
    valid_from TEXT,
    valid_to TEXT,
    ride_id TEXT REFERENCES ride_records(id) ON DELETE SET NULL,
    template_id TEXT NOT NULL CONSTRAINT ticket_template CHECK (template_id IN ('jnr-seiji','showa-b-ticket','kansai-maroon')),
    display_origin TEXT NOT NULL CHECK (json_valid(display_origin)),
    display_destination TEXT NOT NULL CHECK (json_valid(display_destination)),
    travel_date TEXT NOT NULL,
    seat_class_label TEXT,
    non_valid_watermark TEXT NOT NULL CONSTRAINT ticket_watermark CHECK (non_valid_watermark = '${COMMEMORATIVE_WATERMARK}'),
    allows_barcode INTEGER NOT NULL CONSTRAINT ticket_no_barcode CHECK (allows_barcode = 0)
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS sync_oplog (
    op_id TEXT NOT NULL PRIMARY KEY,
    hlc TEXT NOT NULL,
    entity_type TEXT NOT NULL CONSTRAINT sync_entity_type CHECK (entity_type IN ('ride','ride_segment','visited_station','municipality_visit','ticket')),
    entity_id TEXT NOT NULL,
    op TEXT NOT NULL CONSTRAINT sync_op_allowed CHECK (op IN ('upsert','delete')),
    payload_json TEXT CHECK (payload_json IS NULL OR json_valid(payload_json)),
    synced_at TEXT,
    created_at TEXT NOT NULL
  ) STRICT`,
] as const;

export async function initializeJourneySchema(driver: LocalDbDriver): Promise<void> {
  await driver.execute('PRAGMA foreign_keys = ON');
  await driver.transaction(async (transaction) => {
    const version = (await transaction.execute('PRAGMA user_version'))[0]?.[0];
    if (version === SCHEMA_VERSION) {
      return;
    }
    if (version !== 0) {
      throw new Error(`Unsupported journey database schema version: ${String(version)}`);
    }
    for (const ddl of JOURNEY_DDL) {
      await transaction.execute(ddl);
    }
    await transaction.execute(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
}
