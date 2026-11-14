import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  fromInstant, getEventsAroundTime, getPlatformEvents, getStationDepartures, getTrainByTripId, getVehicleAssignment,
  indexTimetable, mergeLayers, resolveServiceDateType, toInstant, vehicleLabel,
} from '../adapter/senkiroTimetable.ts';
import type { SenkiroTimetable } from '../adapter/senkiroTimetable.ts';

const DATA = new URL('../../data/shinjuku/', import.meta.url);
const pkg: SenkiroTimetable = JSON.parse(readFileSync(new URL('senkiro_timetable.json', DATA), 'utf8'));
const idx = indexTimetable(pkg);
const schema = JSON.parse(readFileSync(new URL('../adapter/senkiro_timetable.schema.json', import.meta.url), 'utf8'));
const CONTRACT_STATIONS = ['jr-east:shinjuku', 'odakyu:shinjuku', 'keio:shinjuku', 'keio:shinjuku-newline', 'tokyo-metro:shinjuku:M08', 'toei:shinjuku:S01', 'toei:shinjuku:E27',
  'seibu:seibu-shinjuku', 'tokyo-metro:shinjuku-sanchome:M09', 'tokyo-metro:shinjuku-sanchome:F13', 'toei:shinjuku-sanchome:S02', 'toei:shinjuku-nishiguchi:E01'];

test('all 12 contract station ids exist, unchanged and distinct', () => {
  assert.deepEqual(pkg.stations.map((s) => s.station_id).sort(), [...CONTRACT_STATIONS].sort());
});

test('every event carries every required field with legal enum values', () => {
  const ev = schema.$defs.event;
  for (const e of pkg.events) {
    for (const f of ev.required) assert.ok(f in e, `${e.stop_event_id} lacks ${f}`);
    for (const [f, spec] of Object.entries(ev.properties) as [string, { enum?: unknown[] }][]) if (spec.enum) assert.ok(spec.enum.includes((e as never)[f]), `${f}=${(e as never)[f]}`);
    const re = new RegExp(schema.$defs.hhmm.pattern);
    for (const t of [e.arrival_time_local, e.departure_time_local]) if (t !== null) assert.match(t, re);
  }
});

test('committed package contains only official, redistributable data', () => {
  const redistributable = new Set(pkg.sources.filter((s) => s.redistribution === 'yes').map((s) => s.source_id));
  for (const e of pkg.events) {
    assert.equal(e.data_status, 'official');
    assert.ok(redistributable.has(e.source_id), e.source_id);
  }
  assert.deepEqual(pkg.layers, ['official-open']);
});

test('E27 Shinjuku and E01 Shinjuku-nishiguchi are never merged', () => {
  for (const e of pkg.events) {
    if (e.station_id === 'toei:shinjuku:E27') assert.equal(e.original_station_code, 'odpt.Station:Toei.Oedo.Shinjuku');
    if (e.station_id === 'toei:shinjuku-nishiguchi:E01') assert.equal(e.original_station_code, 'odpt.Station:Toei.Oedo.ShinjukuNishiguchi');
  }
  assert.ok(idx.byStation.get('toei:shinjuku:E27')!.length > 700);
  assert.ok(idx.byStation.get('toei:shinjuku-nishiguchi:E01')!.length > 700);
});

test('platforms are namespaced by station and unknown platforms stay null', () => {
  const plat = new Map(pkg.platforms.map((p) => [p.platform_id, p]));
  for (const e of pkg.events) {
    if (e.platform_id === null) continue;
    assert.equal(plat.get(e.platform_id)?.station_id, e.station_id);
    assert.ok(e.platform_id.startsWith(`${e.station_id}:track-`));
  }
});

test('train numbers are real and never synthetic ids', () => {
  for (const e of pkg.events) {
    assert.equal(e.trip_id_is_synthetic, false);
    assert.match(e.train_number!, /^\d+[A-Z]$/);
  }
});

test('day types: 2026-11-14 Sat, 11-16 Mon weekday, 11-23 holiday, year end flagged', () => {
  assert.equal(resolveServiceDateType(idx, '2026-11-14').service_date_type, 'saturday_holiday');
  assert.equal(resolveServiceDateType(idx, '2026-11-16').service_date_type, 'weekday');
  const h = resolveServiceDateType(idx, '2026-11-23');
  assert.equal(h.service_date_type, 'saturday_holiday');
  assert.equal(h.holiday, '勤労感謝の日');
  assert.equal(resolveServiceDateType(idx, '2026-11-24').service_date_type, 'weekday');
  assert.equal(resolveServiceDateType(idx, '2026-12-31').special_operation_flag, 'year_end_new_year_unverified');
  assert.equal(resolveServiceDateType(idx, '2028-01-05').basis, 'weekday_rule_no_holiday_data');
});

test('instants are JST regardless of input offset; 24:xx maps to the next calendar day', () => {
  assert.equal(toInstant('2026-11-14', 24 * 3600 + 20 * 60), '2026-11-15T00:20:00+09:00');
  assert.deepEqual(fromInstant('2026-11-14T15:20:00Z'), { date: '2026-11-15', seconds: 1200 });
  assert.deepEqual(fromInstant('2026-11-15T00:20:00+09:00'), { date: '2026-11-15', seconds: 1200 });
});

test('getEventsAroundTime across midnight finds the previous business day', () => {
  const res = getEventsAroundTime(idx, '2026-11-15T00:20:00+09:00', ['toei:shinjuku:S01', 'toei:shinjuku-sanchome:S02', 'toei:shinjuku:E27', 'toei:shinjuku-nishiguchi:E01'], { beforeMinutes: 15, afterMinutes: 15 });
  assert.ok(res.length > 0);
  for (const e of res) {
    assert.equal(e.service_date, '2026-11-14');
    assert.equal(e.service_date_type, 'saturday_holiday');
    assert.ok((e.departure_seconds ?? e.arrival_seconds)! >= 86400);
    assert.ok((e.departure_instant ?? e.arrival_instant)!.startsWith('2026-11-15T00:'));
  }
});

test('S02 departures on 2026-11-14 equal the official Sat/Hol station timetable count', () => {
  const sttCount = 173 + 174; // odpt:StationTimetable S02 SaturdayHoliday, east + west
  assert.equal(getStationDepartures(idx, 'toei:shinjuku-sanchome:S02', '2026-11-14').length, sttCount);
  const e = getStationDepartures(idx, 'toei:shinjuku-sanchome:S02', '2026-11-14', { directionId: 'toei:shinjuku:eastbound' });
  assert.equal(e.length, 173);
  for (let i = 1; i < e.length; i++) assert.ok(e[i].departure_seconds! >= e[i - 1].departure_seconds!);
});

test('a westbound through train links S02 → S01 with S01 arrival only', () => {
  const trip = pkg.trips.find((t) => t.line_id === 'toei:shinjuku' && t.through_to_text && t.service_date_type === 'saturday_holiday')!;
  const r = getTrainByTripId(idx, trip.trip_id)!;
  const s02 = r.events.find((e) => e.station_id === 'toei:shinjuku-sanchome:S02')!;
  const s01 = r.events.find((e) => e.station_id === 'toei:shinjuku:S01')!;
  assert.ok(s01.arrival_seconds! > s02.departure_seconds!);
  assert.equal(s01.departure_time_local, null);
  assert.equal(s01.arrival_departure_type, 'arrival_only');
  assert.equal(r.links.length, 1);
  assert.equal(r.links[0].match_status, 'verified_same_trip_in_source');
});

test('Oedo trips reach E27 and E01 via Tochomae, never as consecutive stops', () => {
  const links = pkg.trip_links.filter((l) => [l.from_station_id, l.to_station_id].sort().join() === ['toei:shinjuku-nishiguchi:E01', 'toei:shinjuku:E27'].sort().join());
  assert.ok(links.length > 0);
  for (const l of links) assert.ok((l as unknown as { intermediate_stops_in_source: number }).intermediate_stops_in_source >= 1);
});

test('vehicle answers never claim the actual car unless verified', () => {
  const oedo = pkg.trips.find((t) => t.line_id === 'toei:oedo')!;
  const v = getVehicleAssignment(idx, oedo.trip_id);
  assert.equal(v.status, 'representative');
  assert.equal(v.formation_length, 8);
  assert.equal(v.isActualForThisTrain, false);
  assert.match(vehicleLabel({ vehicle_series: null, formation_length: 8, vehicle_assignment_status: 'representative' }), /代表例/);
  assert.equal(getVehicleAssignment(idx, 'no-such-trip').status, 'unknown');
});

test('unknown platforms are not defaulted to a track', () => {
  // Toei open data gives platform numbers only at train origins, none at S01/S02/E27/E01.
  assert.equal(pkg.events.filter((e) => e.platform_id !== null).length, 0);
  assert.deepEqual(getPlatformEvents(idx, 'toei:shinjuku:E27', 'toei:shinjuku:E27:track-6', { serviceDate: '2026-11-14', fromSeconds: 0, toSeconds: 48 * 3600 }), []);
});

test('getPlatformEvents (local layer) returns only that namespaced platform', { skip: !existsSync(new URL('local/senkiro_timetable.full.json', DATA)) }, () => {
  const full: SenkiroTimetable = JSON.parse(readFileSync(new URL('local/senkiro_timetable.full.json', DATA), 'utf8'));
  const m = indexTimetable(mergeLayers(pkg, full));
  const res = getPlatformEvents(m, 'jr-east:shinjuku', 'jr-east:shinjuku:track-14', { serviceDate: '2026-11-14', fromSeconds: 8 * 3600, toSeconds: 8 * 3600 + 900 });
  assert.ok(res.length >= 3);
  for (const e of res) { assert.equal(e.platform_id, 'jr-east:shinjuku:track-14'); assert.equal(e.line_id, 'jr-east:yamanote'); }
});

test('optional local legacy layer merges without clobbering official events', { skip: !existsSync(new URL('local/senkiro_timetable.full.json', DATA)) }, () => {
  const full: SenkiroTimetable = JSON.parse(readFileSync(new URL('local/senkiro_timetable.full.json', DATA), 'utf8'));
  const merged = indexTimetable(mergeLayers(pkg, full));
  assert.ok(merged.data.events.length > pkg.events.length);
  assert.ok(merged.data.layers.includes('legacy-unverified'));
  const jr = getStationDepartures(merged, 'jr-east:shinjuku', '2026-11-14');
  assert.ok(jr.length > 1000);
  for (const e of jr) { assert.equal(e.data_status, 'legacy_unverified'); assert.equal(e.train_number, null); assert.equal(e.trip_id_is_synthetic, true); }
  assert.equal(getStationDepartures(merged, 'jr-east:shinjuku', '2026-11-14', { includeLegacy: false }).length, 0);
});
