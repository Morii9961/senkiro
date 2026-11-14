import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { timetableDataFrom } from '../../src/providers/timetableProvider';
import { datasetFromFiles, parseCsv, recordsFromCsv, recordsFromJson, recordsToCsv, toRecord } from '../../src/timetable/adapter';
import { DEMO_SOURCE_ID, buildDemoRecords, demoFixture } from '../../src/timetable/demoFixture';
import { LINE_REGISTRY, STATION_REGISTRY, lineEntry, resolveTrack, stationEntry, trackNumberOf } from '../../src/timetable/registry';
import { formatClockTime, formatServiceTime, parseServiceTime, serviceClockAt, serviceDateTypeApplies } from '../../src/timetable/time';
import { TIMETABLE_FIELDS, type TimetableDataset, type TimetableRecord } from '../../src/timetable/types';
import { validateDataset, validateRecord } from '../../src/timetable/validate';
import { loadModel } from './helpers';

const here = dirname(fileURLToPath(import.meta.url));
const model = loadModel();

const base: TimetableRecord = {
  station_id: 'jr-east:shinjuku', operator_id: 'jr-east', line_id: 'jr-east:yamanote', platform_id: 'jr-east:shinjuku:14', direction_id: null,
  service_date_type: 'weekday', trip_id: 't1', train_number: null, arrival_time_local: '08:00:20', departure_time_local: '08:01:00',
  destination_text: null, service_class: null, vehicle_series: null, formation_length: null, vehicle_assignment_status: 'unknown',
  source_id: 'src:x', valid_from: null, valid_until: null, remarks: null,
};
const rec = (over: Partial<TimetableRecord>): TimetableRecord => ({ ...base, ...over });
const codes = (r: TimetableRecord) => validateRecord(r, 0).map((i) => i.code);
const dataset = (records: TimetableRecord[], kind: TimetableDataset['kind'] = 'timetable'): TimetableDataset => ({
  kind, label: 'test', generatedAt: null, records,
  sources: [{ id: kind === 'timetable' ? 'src:x' : DEMO_SOURCE_ID, title: 'x', publisher: null, url: null, retrievedAt: null, license: null, notes: null }],
});

describe('timetable times', () => {
  it('reads times past midnight as part of the same service day', () => {
    expect(parseServiceTime('05:00')).toBe(18000);
    expect(parseServiceTime('24:35')).toBe(24 * 3600 + 35 * 60);
    expect(parseServiceTime('25:10:30')).toBe(25 * 3600 + 630);
    expect(parseServiceTime('7:05')).toBe(7 * 3600 + 300);
    for (const bad of ['', '30:00', '12:60', 'noon', '12', null]) expect(parseServiceTime(bad), String(bad)).toBeNull();
  });

  it('formats service time and wall-clock time', () => {
    expect(formatServiceTime(25 * 3600 + 600)).toBe('25:10');
    expect(formatClockTime(25 * 3600 + 600)).toBe('01:10');
    expect(formatServiceTime(18005, true)).toBe('05:00:05');
  });

  it('puts the small hours on the previous service day, in Japan time whatever the machine zone', () => {
    // 2026-11-14 16:30 UTC = 2026-11-15 01:30 JST (a Sunday) → still Saturday's service
    const c = serviceClockAt(new Date('2026-11-14T16:30:00Z'));
    expect(c.serviceDate).toBe('2026-11-14');
    expect(c.dayType).toBe('saturday');
    expect(c.seconds).toBe(25 * 3600 + 1800);
    // 2026-11-13 23:00 UTC = 2026-11-14 08:00 JST
    const d = serviceClockAt(new Date('2026-11-13T23:00:00Z'));
    expect(d).toMatchObject({ serviceDate: '2026-11-14', dayType: 'saturday', seconds: 8 * 3600 });
    expect(serviceClockAt(new Date('2026-11-16T00:00:00Z')).dayType).toBe('weekday');
  });

  it('matches day types as operators publish them', () => {
    expect(serviceDateTypeApplies('weekday', 'weekday')).toBe(true);
    expect(serviceDateTypeApplies('平日', 'saturday')).toBe(false);
    expect(serviceDateTypeApplies('土休日', 'saturday')).toBe(true);
    expect(serviceDateTypeApplies('saturday-holiday', 'sunday')).toBe(true);
    expect(serviceDateTypeApplies('holiday', 'sunday')).toBe(true);
    expect(serviceDateTypeApplies('saturday', 'sunday')).toBe(false);
    expect(serviceDateTypeApplies('everyday', 'weekday')).toBe(true);
    expect(serviceDateTypeApplies('something else', 'weekday')).toBe(false);
  });
});

describe('station and line registry', () => {
  it('lists the twelve canonical stations, each operator\'s Shinjuku on its own', () => {
    expect(STATION_REGISTRY.map((s) => s.station_id)).toEqual([
      'jr-east:shinjuku', 'odakyu:shinjuku', 'keio:shinjuku', 'keio:shinjuku-newline', 'tokyo-metro:shinjuku:M08', 'toei:shinjuku:S01', 'toei:shinjuku:E27',
      'seibu:seibu-shinjuku', 'tokyo-metro:shinjuku-sanchome:M09', 'tokyo-metro:shinjuku-sanchome:F13', 'toei:shinjuku-sanchome:S02', 'toei:shinjuku-nishiguchi:E01',
    ]);
    // 新宿西口 (E01) is not 大江戸線新宿 (E27)
    expect(stationEntry('toei:shinjuku-nishiguchi:E01')!.modelStationId).not.toBe(stationEntry('toei:shinjuku:E27')!.modelStationId);
    expect(stationEntry('toei:shinjuku-nishiguchi:E01')!.station_complex_id).toBe('shinjuku-nishiguchi');
  });

  it('every registered line of a station in the model maps to a rail line of the model', () => {
    const modelLines = new Set(model.railLines.map((l) => l.id));
    const modelStations = new Set(model.stations.map((s) => s.id));
    for (const s of STATION_REGISTRY) {
      if (!modelStations.has(s.modelStationId)) continue;
      for (const id of s.line_ids) {
        const line = lineEntry(id);
        expect(line, id).not.toBeNull();
        for (const m of line!.modelLineIds) expect(modelLines.has(m), `${id} → ${m}`).toBe(true);
      }
    }
    expect(new Set(LINE_REGISTRY.map((l) => l.line_id)).size).toBe(LINE_REGISTRY.length);
    expect(lineEntry('odpt.Railway:JR-East.Yamanote')?.line_id).toBe('jr-east:yamanote');
  });

  it('resolves namespaced platform ids to tracks of the model', () => {
    expect(trackNumberOf('jr-east:shinjuku:14', 'jr-east:shinjuku')).toBe('14');
    expect(trackNumberOf('tokyo-metro:shinjuku:M08:2', 'tokyo-metro:shinjuku:M08')).toBe('2');
    expect(trackNumberOf('14', 'jr-east:shinjuku')).toBe('14');
    expect(resolveTrack(model, 'jr-east:shinjuku', 'jr-east:shinjuku:14')?.platform.id).toBe('sk:platform:jr-east-shinjuku-13-14');
    // the same "1" is a different track at each operator
    expect(resolveTrack(model, 'tokyo-metro:shinjuku:M08', 'tokyo-metro:shinjuku:M08:1')?.platform.id).toBe('sk:platform:tokyo-metro-shinjuku-1-2');
    expect(resolveTrack(model, 'seibu:seibu-shinjuku', 'seibu:seibu-shinjuku:1')?.platform.id).toBe('sk:platform:seibu-shinjuku-1');
    // Keio New Line and Toei Shinjuku Line share one station of the model: tracks 4 and 5
    expect(resolveTrack(model, 'keio:shinjuku-newline', 'keio:shinjuku-newline:4')?.platform.id).toBe('sk:platform:keio-new-line-shinjuku-4-5');
    expect(resolveTrack(model, 'toei:shinjuku:S01', 'toei:shinjuku:S01:5')?.trackNumber).toBe('5');
    expect(resolveTrack(model, 'jr-east:shinjuku', 'jr-east:shinjuku:99')).toBeNull();
    expect(resolveTrack(model, 'nowhere:x', 'nowhere:x:1')).toBeNull();
  });
});

describe('record validation', () => {
  it('accepts a plain record', () => {
    expect(validateRecord(base, 0)).toEqual([]);
  });

  it('reports what is wrong and never repairs it', () => {
    expect(codes(rec({ station_id: 'jr-east:nowhere' }))).toContain('unknown-station');
    expect(codes(rec({ operator_id: 'keio' }))).toContain('operator-mismatch');
    expect(codes(rec({ line_id: 'jr-east:made-up' }))).toContain('unknown-line');
    expect(codes(rec({ line_id: 'keio:keio' }))).toContain('line-not-at-station');
    expect(codes(rec({ arrival_time_local: '8 o\'clock' }))).toContain('bad-time');
    expect(codes(rec({ arrival_time_local: null, departure_time_local: null }))).toContain('no-time');
    expect(codes(rec({ arrival_time_local: '08:02', departure_time_local: '08:01' }))).toContain('departs-before-arrival');
    expect(codes(rec({ formation_length: 10.5 }))).toContain('bad-formation');
    expect(codes(rec({ formation_length: 0 }))).toContain('bad-formation');
    expect(codes(rec({ vehicle_assignment_status: 'verified' }))).toContain('vehicle-status-without-series');
    expect(codes(rec({ vehicle_assignment_status: 'maybe' as never }))).toContain('bad-vehicle-status');
    expect(codes(rec({ train_number: 't1' }))).toContain('train-number-equals-trip-id');
    expect(codes(rec({ valid_from: '2026/03/14' }))).toContain('bad-date');
    expect(codes(rec({ valid_from: '2026-03-14', valid_until: '2026-03-01' }))).toContain('validity-reversed');
    expect(codes(rec({ platform_id: null }))).toContain('no-platform');
    expect(codes(rec({ platform_id: '14' }))).toContain('platform-not-namespaced');
  });

  it('accepts a departure-only record and a time past midnight', () => {
    expect(validateRecord(rec({ arrival_time_local: null, departure_time_local: '24:35' }), 0)).toEqual([]);
  });

  it('finds duplicates, unknown sources and two trains on one track at once', () => {
    const v = validateDataset(dataset([
      base,
      rec({}),
      rec({ trip_id: 't2', source_id: 'src:other' }),
      rec({ trip_id: 't3', arrival_time_local: '08:00:40', departure_time_local: '08:02:00' }),
    ]));
    const byCode = (c: string) => v.issues.filter((i) => i.code === c);
    expect(byCode('duplicate-trip')).toHaveLength(1);
    expect(byCode('unknown-source')).toHaveLength(1);
    expect(byCode('track-conflict').length).toBeGreaterThan(0);
    expect(v.usable.map((r) => r.trip_id)).toEqual(['t1', 't3']);
  });

  it('keeps demo records and timetable records apart', () => {
    const demoInTimetable = validateDataset({ ...dataset([rec({ source_id: DEMO_SOURCE_ID, trip_id: 'demo:1' })]), sources: [{ id: DEMO_SOURCE_ID, title: '', publisher: null, url: null, retrievedAt: null, license: null, notes: null }] });
    expect(demoInTimetable.issues.map((i) => i.code)).toContain('mixed-dataset');
    expect(demoInTimetable.usable).toEqual([]);
    const realInDemo = validateDataset({ ...dataset([base], 'demo-fixture'), sources: [{ id: 'src:x', title: '', publisher: null, url: null, retrievedAt: null, license: null, notes: null }] });
    expect(realInDemo.issues.map((i) => i.code)).toContain('mixed-dataset');
    expect(codes(rec({ source_id: DEMO_SOURCE_ID, train_number: '123G' }))).toContain('demo-train-number');
  });
});

describe('adapters', () => {
  it('parses CSV with quotes, commas, line breaks and a BOM', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\n"two\nlines",z\n\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['two\nlines', 'z']]);
  });

  it('normalises spelling only: empty and "null" become null, nothing is filled in', () => {
    const r = toRecord({ station_id: ' jr-east:shinjuku ', operator_id: 'jr-east', line_id: 'jr-east:yamanote', platform_id: '', service_date_type: 'weekday', trip_id: 'a',
      train_number: 'null', arrival_time_local: '', departure_time_local: '7:05', vehicle_series: 'unknown', formation_length: '', vehicle_assignment_status: 'Unknown', source_id: 's', extra: 1 });
    expect(r).toMatchObject({ station_id: 'jr-east:shinjuku', platform_id: null, train_number: null, arrival_time_local: null, departure_time_local: '07:05',
      vehicle_series: null, formation_length: null, vehicle_assignment_status: 'unknown', destination_text: null });
    expect(toRecord({ formation_length: '11' }).formation_length).toBe(11);
    expect(Number.isNaN(toRecord({ formation_length: 'eleven' }).formation_length)).toBe(true);
  });

  it('round-trips records through CSV and JSON', () => {
    const records = buildDemoRecords().slice(0, 40);
    const csv = recordsToCsv(records);
    expect(csv.split('\n')[0]).toBe(TIMETABLE_FIELDS.join(','));
    expect(recordsFromCsv(csv)).toEqual({ records, issues: [] });
    expect(recordsFromJson(JSON.parse(JSON.stringify(records)))).toEqual({ records, issues: [] });
    expect(recordsFromJson({ records }).records).toEqual(records);
    expect(recordsFromJson({ nope: 1 }).issues[0]!.code).toBe('not-a-record-list');
    expect(recordsFromCsv('station_id,trip_id\na,b\n').issues[0]!.code).toBe('missing-columns');
  });

  it('builds one dataset from several files and keeps every source id traceable', () => {
    const records = [rec({ source_id: 'src:a' }), rec({ trip_id: 't2', source_id: 'src:b' })];
    const { dataset: d, issues } = datasetFromFiles([
      { name: 'a.csv', content: recordsToCsv([records[0]!]) },
      { name: 'b.json', content: JSON.stringify({ generatedAt: '2026-11-14', sources: [{ id: 'src:b', title: 'B timetable', publisher: 'B', url: 'https://example.invalid/b' }], records: [records[1]] }) },
      { name: 'broken.json', content: '{' },
    ]);
    expect(issues.map((i) => i.code)).toEqual(['bad-json']);
    expect(d.records).toEqual(records);
    expect(d.generatedAt).toBe('2026-11-14');
    expect(d.sources.find((s) => s.id === 'src:b')!.title).toBe('B timetable');
    expect(d.sources.find((s) => s.id === 'src:a')!.notes).toMatch(/only the id is known/);
    expect(validateDataset(d).errorCount).toBe(0);
  });
});

describe('demo fixture', () => {
  const fixture = demoFixture();
  const v = validateDataset(fixture);

  it('is valid, labelled as a demo throughout, and claims no train number, destination or vehicle', () => {
    expect(fixture.kind).toBe('demo-fixture');
    expect(v.errorCount).toBe(0);
    expect(v.issues.filter((i) => i.code === 'track-conflict')).toEqual([]);
    expect(fixture.records.length).toBeGreaterThan(1000);
    for (const r of fixture.records) {
      expect(r.source_id).toBe(DEMO_SOURCE_ID);
      expect(r.trip_id.startsWith('demo:')).toBe(true);
      expect(r.train_number).toBeNull();
      expect(r.destination_text).toBeNull();
      expect(r.vehicle_series).toBeNull();
      expect(r.formation_length).toBeNull();
      expect(r.remarks).toMatch(/DEMO FIXTURE/);
    }
  });

  it('places every record on a track of the model and runs past midnight', () => {
    for (const r of fixture.records) expect(resolveTrack(model, r.station_id, r.platform_id), r.platform_id!).not.toBeNull();
    expect(fixture.records.some((r) => parseServiceTime(r.departure_time_local)! >= 86400)).toBe(true);
    expect(fixture.records.some((r) => r.arrival_time_local === null)).toBe(true);
  });

  it('the committed sample file is the fixture in hand-over format', () => {
    const csv = readFileSync(resolve(here, '../../data/timetable-example/demo-fixture.sample.csv'), 'utf8');
    const parsed = recordsFromCsv(csv);
    expect(parsed.issues).toEqual([]);
    const all = new Map(fixture.records.map((r) => [r.trip_id, r]));
    for (const r of parsed.records) expect(r).toEqual(all.get(r.trip_id));
    expect(validateDataset({ ...fixture, records: parsed.records }).errorCount).toBe(0);
  });
});

describe('timetable provider', () => {
  it('uses the demo fixture as a whole while no timetable file is present', () => {
    const data = timetableDataFrom([]);
    expect(data.dataset.kind).toBe('demo-fixture');
    expect(data.files).toEqual([]);
  });

  it('drops the demo fixture entirely once a usable timetable is handed over', () => {
    const data = timetableDataFrom([{ name: 'real.csv', content: recordsToCsv([base, rec({ trip_id: 'broken', departure_time_local: 'x' })]) }]);
    expect(data.dataset.kind).toBe('timetable');
    expect(data.records.map((r) => r.trip_id)).toEqual(['t1']);
    expect(data.records.some((r) => r.source_id === DEMO_SOURCE_ID)).toBe(false);
    expect(data.errorCount).toBeGreaterThan(0);
  });

  it('falls back to the demo fixture when the files hold no usable record', () => {
    expect(timetableDataFrom([{ name: 'empty.csv', content: 'station_id\n' }]).dataset.kind).toBe('demo-fixture');
  });
});
