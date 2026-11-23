import type { TimetableDataset, TimetableRecord } from '../../src/timetable/types.ts'

const sourceId = 'demo:umeda-fictional-timetable'
const stationId = 'sk:station:hankyu-osaka-umeda'

// Synthetic trips authored for this demo. All times and trip properties are invented.
const first: TimetableRecord = {
  station_id: stationId,
  operator_id: 'sk:operator:hankyu',
  line_id: 'sk:line:hk-kyoto',
  platform_id: 'sk:platform:hk-3',
  direction_id: null,
  service_date_type: 'everyday',
  trip_id: 'demo:umeda-kyoto',
  train_number: null,
  arrival_time_local: '09:00:30',
  departure_time_local: '09:01:30',
  destination_text: '京都方面',
  service_class: '特急',
  vehicle_series: 'sk:vehicle:hankyu-9300',
  formation_length: null,
  vehicle_assignment_status: 'representative',
  source_id: sourceId,
  valid_from: null,
  valid_until: null,
  remarks: null,
}

export const demoTimetable: Extract<TimetableDataset, { kind: 'demo-fixture' }> = {
  kind: 'demo-fixture',
  dataNature: 'synthetic',
  label: 'DEMO',
  generatedAt: '2026-11-23',
  sources: [{
    id: sourceId,
    title: 'Synthetic Umeda timetable fixture',
    publisher: 'SENKIRO Lab',
    url: null,
    retrievedAt: '2026-11-23',
    license: 'Project-authored synthetic data',
    notes: 'Authored for the illustration. No timetable or actual train assignments were used.',
  }],
  records: [
    first,
    {
      ...first,
      line_id: 'sk:line:hk-takarazuka',
      platform_id: 'sk:platform:hk-5',
      trip_id: 'demo:umeda-takarazuka',
      service_date_type: 'weekday',
      arrival_time_local: null,
      departure_time_local: '09:03:00',
      destination_text: '宝塚方面',
      service_class: '普通',
      vehicle_series: 'sk:vehicle:hankyu-1000',
    },
    {
      ...first,
      line_id: 'sk:line:hk-kobe',
      platform_id: 'sk:platform:hk-8',
      trip_id: 'demo:umeda-kobe',
      service_date_type: 'saturday-holiday',
      arrival_time_local: '09:02:00',
      departure_time_local: '09:02:30',
      destination_text: '神戸方面',
      service_class: null,
      vehicle_series: null,
      vehicle_assignment_status: 'unknown',
    },
    {
      ...first,
      platform_id: null,
      trip_id: 'demo:umeda-unassigned',
      arrival_time_local: null,
      departure_time_local: '09:04:00',
      destination_text: null,
      service_class: null,
      vehicle_series: null,
      vehicle_assignment_status: 'unknown',
    },
  ],
}
