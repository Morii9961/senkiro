import { describe, expect, test } from 'vitest'
import { model } from '../data/manual/model'
import { demoTimetable, demoTimetableProvider } from '../src/providers/timetable'
import { createTimetableRegistry } from '../src/timetable/registry'
import { validateDataset } from '../src/timetable/validate'
import { formatServiceTime, parseServiceTime, serviceClockAt, serviceDateTypeApplies } from '../src/timetable/time'

const registry = createTimetableRegistry(model)
const first = () => demoTimetable.records[0]!

describe('AT-TT-01: Umeda timetable validation', () => {
  test('keeps fixture and official sources apart in both directions', () => {
    const mixed = validateDataset({
      ...demoTimetable,
      sources: [...demoTimetable.sources, { ...demoTimetable.sources[0]!, id: 'official:test' }],
      records: [first(), { ...first(), source_id: 'official:test' }],
    }, registry)
    expect(mixed.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error', code: 'mixed-dataset', index: null }),
      expect.objectContaining({ severity: 'error', code: 'mixed-dataset', index: 1 }),
    ]))
    expect(mixed.runnable).toEqual([])
    expect(validateDataset({ ...demoTimetable, kind: 'timetable' }, registry).runnable).toEqual([])
  })

  test('excludes invalid records and keeps platformless departures for the list only', () => {
    const missingPlatform = { ...first(), trip_id: 'demo:no-platform', platform_id: null }
    const result = validateDataset({ ...demoTimetable, records: [
      first(),
      { ...first(), trip_id: 'demo:no-series', vehicle_series: null, vehicle_assignment_status: 'verified' },
      missingPlatform,
      { ...first(), trip_id: 'demo:wrong-platform', platform_id: 'sk:platform:jr-3-4' },
      { ...first(), trip_id: 'demo:wrong-time', arrival_time_local: '25:72' },
      { ...first(), trip_id: 'demo:wrong-line', line_id: 'sk:line:hk-kobe' },
    ] }, registry)
    expect(result.issues.map(({ index, code }) => [index, code])).toEqual(expect.arrayContaining([
      [1, 'vehicle-status-without-series'], [2, 'no-platform'], [3, 'platform-mismatch'],
      [4, 'bad-time'], [5, 'platform-mismatch'],
    ]))
    expect(result.usable).toEqual([first(), missingPlatform])
    expect(result.runnable).toEqual([first()])
  })

  test('loads only a local fixture with explicit synthetic provenance', async () => {
    const feed = await demoTimetableProvider.load()
    expect(feed.mode).toMatchObject({ kind: 'demo', dataset: { kind: 'demo-fixture', dataNature: 'synthetic' } })
    expect(feed.issues.filter(({ severity }) => severity === 'error')).toEqual([])
    expect(demoTimetable.records.every((record) => record.source_id.startsWith('demo:') && record.train_number === null)).toBe(true)
  })

  test('keeps service days in JST past midnight and matches the chosen day type', () => {
    expect(parseServiceTime('25:10:07')).toBe(90607)
    expect(formatServiceTime(90607, true)).toBe('25:10:07')
    expect(parseServiceTime('25:72')).toBeNull()
    expect(serviceClockAt(new Date('2026-11-21T16:10:07Z'))).toEqual({
      seconds: 90607, serviceDate: '2026-11-21',
    })
    expect(serviceDateTypeApplies('土休日', 'weekday')).toBe(false)
    expect(serviceDateTypeApplies('土休日', 'weekend')).toBe(true)
    expect(serviceDateTypeApplies('everyday', 'weekend')).toBe(true)
  })
})
