import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv } from '../scripts/lib/csv.mjs';
import { toBusinessSeconds, formatBusiness } from '../scripts/lib/time.mjs';

const D = new URL('../../data/shinjuku/', import.meta.url);
const csv = (f) => { const [h, ...rows] = parseCsv(readFileSync(new URL(f, D), 'utf8')); return rows.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
const CORE = ['station_id', 'operator_id', 'line_id', 'platform_id', 'direction_id', 'service_date_type', 'trip_id', 'train_number', 'arrival_time_local', 'departure_time_local',
  'destination_text', 'service_class', 'vehicle_series', 'formation_length', 'vehicle_assignment_status', 'source_id', 'valid_from', 'valid_until', 'remarks'];

test('timetable_events.csv has all core contract columns', () => {
  const [h] = parseCsv(readFileSync(new URL('timetable_events.csv', D), 'utf8'));
  for (const c of CORE) assert.ok(h.includes(c), c);
});

test('every referenced source_id exists in sources.csv', () => {
  const src = new Set(csv('sources.csv').map((s) => s.source_id));
  for (const f of ['timetable_events.csv', 'vehicle_catalog.csv', 'platforms.csv', 'stations.csv', 'services.csv', 'calendar_dates.csv'])
    for (const r of csv(f)) assert.ok(src.has(r.source_id), `${f}: ${r.source_id}`);
  for (const r of csv('trip_vehicle_assignments.csv')) if (r.vehicle_source_id) assert.ok(src.has(r.vehicle_source_id));
});

test('vehicle catalog: one row per series × formation, statuses legal', () => {
  const v = csv('vehicle_catalog.csv');
  assert.equal(new Set(v.map((x) => `${x.vehicle_series}|${x.formation_length}`)).size, v.length);
  for (const x of v) assert.ok(['verified', 'representative', 'unknown'].includes(x.verification_status));
  assert.ok(v.filter((x) => x.vehicle_series === 'E233-0').length >= 2, 'E233-0 must have more than one formation');
});

test('business-day time helpers', () => {
  assert.equal(toBusinessSeconds('00:05'), 24 * 3600 + 300);
  assert.equal(toBusinessSeconds('24:05', { rollover: false }), 24 * 3600 + 300);
  assert.equal(toBusinessSeconds('05:00'), 5 * 3600);
  assert.equal(formatBusiness(25 * 3600 + 60), '25:01');
  assert.equal(toBusinessSeconds('25:61'), null);
});

test('coverage matrix lists every contract station', () => {
  const cov = JSON.parse(readFileSync(new URL('coverage_report.json', D), 'utf8'));
  const st = new Set(cov.committed_layer.matrix.map((r) => r.station_id));
  assert.equal(st.size, 12);
  const gaps = cov.committed_layer.matrix.filter((r) => r.station_id.includes('sanchome:F13'));
  assert.ok(gaps.every((r) => r.collected === 0 && r.gap));
});
