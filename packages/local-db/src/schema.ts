import {
  COMMEMORATIVE_WATERMARK,
  COUNTABLE_VISIT_SQL_PREDICATE,
  type CommemorativeTemplateId,
  type LocalizedNames,
  type Provenance,
  type RideSegment,
  type SkId,
  type SyncEntityType,
  type SyncOpLogEntry,
  type VisitKind,
} from '@senkiro/contracts';
import { sql } from 'drizzle-orm';
import { check, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const entityColumns = <T extends 'ride' | 'ticket'>() => ({
  id: text('id').$type<SkId<T>>().primaryKey().notNull(),
  externalIds: text('external_ids', { mode: 'json' }).$type<Record<string, string>>().notNull(),
  names: text('names', { mode: 'json' }).$type<LocalizedNames>().notNull(),
  provenance: text('provenance', { mode: 'json' }).$type<Provenance>().notNull(),
  validFrom: text('valid_from'),
  validTo: text('valid_to'),
});

const countableVisit = sql.raw(COUNTABLE_VISIT_SQL_PREDICATE);

export const rideRecords = sqliteTable('ride_records', {
  ...entityColumns<'ride'>(),
  travelDate: text('travel_date').notNull(),
  originStationId: text('origin_station_id').$type<SkId<'station'>>().notNull(),
  destinationStationId: text('destination_station_id').$type<SkId<'station'>>().notNull(),
  segmentIds: text('segment_ids', { mode: 'json' }).$type<SkId<'segment'>[]>().notNull(),
  lineId: text('line_id').$type<SkId<'line'>>(),
  vehicleSeriesId: text('vehicle_series_id').$type<SkId<'vehicle'>>(),
  trainNumber: text('train_number'),
  farePaidYen: integer('fare_paid_yen'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const rideSegments = sqliteTable(
  'ride_segments',
  {
    rideId: text('ride_id')
      .$type<SkId<'ride'>>()
      .notNull()
      .references(() => rideRecords.id, { onDelete: 'cascade' }),
    segmentId: text('segment_id').$type<SkId<'segment'>>().notNull(),
    direction: text('direction').$type<RideSegment['direction']>().notNull(),
    operatingKm: real('operating_km'),
  },
  (t) => [
    primaryKey({ columns: [t.rideId, t.segmentId, t.direction] }),
    check('ride_direction', sql`${t.direction} IN ('forward','reverse','unknown')`),
  ],
);

export const visitedStations = sqliteTable(
  'visited_stations',
  {
    rideId: text('ride_id')
      .$type<SkId<'ride'>>()
      .notNull()
      .references(() => rideRecords.id, { onDelete: 'cascade' }),
    stationId: text('station_id').$type<SkId<'station'>>().notNull(),
    visitKind: text('visit_kind').$type<VisitKind>().notNull(),
    // Keep the station-to-municipality evidence needed to audit the aggregate after a restore.
    municipalityCode: text('municipality_code'),
  },
  (t) => [
    primaryKey({ columns: [t.rideId, t.stationId, t.visitKind] }),
    check(
      'visit_kind_allowed',
      sql`${t.visitKind} IN ('boarded','alighted','transferred','passed_through')`,
    ),
    check(
      'municipality_countable_visit',
      sql`${t.municipalityCode} IS NULL OR (${countableVisit})`,
    ),
  ],
);

export const municipalityVisits = sqliteTable('municipality_visits', {
  municipalityCode: text('municipality_code').primaryKey().notNull(),
  names: text('names', { mode: 'json' }).$type<LocalizedNames>().notNull(),
  prefectureCode: text('prefecture_code').notNull(),
  firstVisitedAt: text('first_visited_at').notNull(),
  triggeredByRideId: text('triggered_by_ride_id')
    .$type<SkId<'ride'>>()
    .notNull()
    .references(() => rideRecords.id),
});

export const commemorativeTickets = sqliteTable(
  'commemorative_tickets',
  {
    ...entityColumns<'ticket'>(),
    rideId: text('ride_id')
      .$type<SkId<'ride'>>()
      .references(() => rideRecords.id, { onDelete: 'set null' }),
    templateId: text('template_id').$type<CommemorativeTemplateId>().notNull(),
    displayOrigin: text('display_origin', { mode: 'json' }).$type<LocalizedNames>().notNull(),
    displayDestination: text('display_destination', { mode: 'json' })
      .$type<LocalizedNames>()
      .notNull(),
    travelDate: text('travel_date').notNull(),
    seatClassLabel: text('seat_class_label'),
    nonValidWatermark: text('non_valid_watermark')
      .$type<typeof COMMEMORATIVE_WATERMARK>()
      .notNull(),
    allowsBarcode: integer('allows_barcode', { mode: 'boolean' }).$type<false>().notNull(),
  },
  (t) => [
    check(
      'ticket_watermark',
      sql`${t.nonValidWatermark} = ${sql.raw(`'${COMMEMORATIVE_WATERMARK}'`)}`,
    ),
    check('ticket_no_barcode', sql`${t.allowsBarcode} = 0`),
    check(
      'ticket_template',
      sql`${t.templateId} IN ('jnr-seiji','showa-b-ticket','kansai-maroon')`,
    ),
  ],
);

export const syncOpLog = sqliteTable(
  'sync_oplog',
  {
    opId: text('op_id').primaryKey().notNull(),
    hlc: text('hlc').notNull(),
    entityType: text('entity_type').$type<SyncEntityType>().notNull(),
    entityId: text('entity_id').notNull(),
    op: text('op').$type<SyncOpLogEntry['op']>().notNull(),
    payloadJson: text('payload_json'),
    syncedAt: text('synced_at'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    check('sync_op_allowed', sql`${t.op} IN ('upsert','delete')`),
    check(
      'sync_entity_type',
      sql`${t.entityType} IN ('ride','ride_segment','visited_station','municipality_visit','ticket')`,
    ),
  ],
);
