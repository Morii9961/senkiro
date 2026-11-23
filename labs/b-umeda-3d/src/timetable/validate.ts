import type { TimetableRegistry } from './registry.ts'
import { parseServiceTime } from './time.ts'
import type { TimetableDataset, TimetableIssue } from './types.ts'

const demoId = (id: string) => id.startsWith('demo:')

function validDate(value: string) {
  const date = new Date(value + 'T00:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** The list may retain a valid trip without a known platform. The renderer may not. */
export function validateDataset(dataset: TimetableDataset, registry: TimetableRegistry) {
  const issues: TimetableIssue[] = []
  const sourceIds = new Set<string>()
  const demo = dataset.kind === 'demo-fixture'
  for (const { id } of dataset.sources) {
    if (demoId(id) !== demo) {
      issues.push({ severity: 'error', code: 'mixed-dataset', message: 'Wrong source kind for ' + id, index: null, trip_id: null })
    }
    if (!id.trim() || sourceIds.has(id)) {
      issues.push({ severity: 'error', code: 'invalid-source-id', message: 'Source ID must be nonempty and unique: ' + id, index: null, trip_id: null })
    }
    sourceIds.add(id)
  }

  const datasetError = issues.length > 0
  const bad = new Set<number>()
  const seen = new Set<string>()
  for (const [index, row] of dataset.records.entries()) {
    const add = (severity: TimetableIssue['severity'], code: string, message: string) => {
      issues.push({ severity, code, message, index, trip_id: row.trip_id || null })
      if (severity === 'error') bad.add(index)
    }
    for (const field of ['station_id', 'operator_id', 'line_id', 'service_date_type', 'trip_id', 'source_id'] as const) {
      if (!row[field].trim()) add('error', 'missing-field', field + ' is required')
    }
    if (demoId(row.source_id) !== demo) add('error', 'mixed-dataset', 'Record source has the wrong kind')
    if (!sourceIds.has(row.source_id)) add('error', 'unknown-source', 'Source is absent from the dataset')
    if (demo && !demoId(row.trip_id)) add('error', 'demo-trip-id', 'Fixture trip IDs use the demo: prefix')
    if (row.train_number !== null && (demo || !row.train_number.trim() || row.train_number === row.trip_id)) {
      add('error', 'invalid-train-number', 'Only a number provided by a source can be published')
    }

    const station = registry.stations.get(row.station_id)
    const line = registry.lines.get(row.line_id)
    if (!station) add('error', 'unknown-station', 'Station ID is absent from the Umeda registry')
    if (!line) add('error', 'unknown-line', 'Line ID is absent from the Umeda registry')
    if ((station && station.operatorId !== row.operator_id) || (line && line.operatorId !== row.operator_id)) {
      add('error', 'operator-mismatch', 'The station and line must belong to the record operator')
    }
    if (station && line && !station.lineIds.includes(line.id)) {
      add('error', 'line-not-at-station', 'The line is absent from the station registry entry')
    }
    if (row.platform_id === null) {
      add('warning', 'no-platform', 'Without a known platform the record is list-only')
    } else {
      const platform = registry.platforms.get(row.platform_id)
      if (!platform || platform.stationId !== row.station_id || !platform.serviceLineIds?.includes(row.line_id)) {
        add('error', 'platform-mismatch', 'The platform must serve the given station and line')
      }
    }

    const arrival = parseServiceTime(row.arrival_time_local)
    const departure = parseServiceTime(row.departure_time_local)
    if ((row.arrival_time_local !== null && arrival === null) || (row.departure_time_local !== null && departure === null)) {
      add('error', 'bad-time', 'Use JST time HH:MM[:SS]')
    } else if (arrival === null && departure === null) {
      add('error', 'no-time', 'At least one scheduled time is required')
    } else if (arrival !== null && departure !== null && departure < arrival) {
      add('error', 'departs-before-arrival', 'Departure precedes arrival')
    }
    const status = row.vehicle_assignment_status
    const series = row.vehicle_series?.trim()
    if (!['unknown', 'representative', 'verified'].includes(status)) {
      add('error', 'bad-vehicle-status', 'Vehicle status must be unknown, representative or verified')
    } else if (!series && status !== 'unknown') {
      add('error', 'vehicle-status-without-series', 'A missing series requires unknown vehicle status')
    } else if (series && status === 'unknown') {
      add('warning', 'series-marked-unknown', 'An unconfirmed series is shown with a neutral vehicle')
    }
    const cars = row.formation_length
    if (cars !== null && (!Number.isInteger(cars) || cars < 1 || cars > 20)) {
      add('error', 'bad-formation', 'Formation must be a whole number of cars from 1 to 20')
    }
    const { valid_from: from, valid_until: until } = row
    if ((from !== null && !validDate(from)) || (until !== null && !validDate(until))) {
      add('error', 'bad-date', 'Validity dates must be real calendar dates in YYYY-MM-DD format')
    } else if (from && until && until < from) {
      add('error', 'validity-reversed', 'Validity ends before it starts')
    }
    const key = JSON.stringify([row.station_id, row.service_date_type.trim().toLowerCase(), row.trip_id])
    if (seen.has(key)) add('error', 'duplicate-trip', 'The trip stops twice at the same station and day type')
    if (!bad.has(index)) seen.add(key)
  }

  const usable = datasetError ? [] : dataset.records.filter((_, index) => !bad.has(index))
  return { issues, usable, runnable: usable.filter((row) => row.platform_id !== null) }
}
