export type VehicleAssignmentStatus = 'verified' | 'representative' | 'unknown'

/** One stop of one trip. Times use JST with hours that can extend past 24. */
export interface TimetableRecord {
  station_id: string
  operator_id: string
  line_id: string | null
  platform_id: string | null
  platform_number?: string | null
  direction_id: string | null
  service_date_type: string
  trip_id: string
  train_number: string | null
  arrival_time_local: string | null
  departure_time_local: string | null
  destination_text: string | null
  service_class: string | null
  vehicle_series: string | null
  formation_length: number | null
  vehicle_assignment_status: VehicleAssignmentStatus
  source_id: string
  related_source_ids?: readonly string[]
  source_date?: string | null
  valid_from: string | null
  valid_until: string | null
  remarks: string | null
}

export interface TimetableSource {
  id: string
  title: string
  publisher: string | null
  url: string | null
  retrievedAt: string | null
  license: string | null
  notes: string | null
}

export type TimetableKind = 'demo-fixture' | 'timetable'

interface DatasetContent {
  label: string
  generatedAt: string | null
  sources: readonly TimetableSource[]
  records: readonly TimetableRecord[]
}

export type TimetableDataset = DatasetContent &
  ({ kind: 'demo-fixture'; dataNature: 'synthetic' } | { kind: 'timetable' })

export type FeedMode =
  | { kind: 'off' }
  | { kind: 'demo'; dataset: Extract<TimetableDataset, { kind: 'demo-fixture' }> }
  | { kind: 'timetable-sim'; dataset: Extract<TimetableDataset, { kind: 'timetable' }> }
  | { kind: 'live'; available: false; reason: 'no-licensed-feed' }

export type TrainLiveState = 'scheduled' | 'live_adjusted' | 'live_position' | 'stale' | 'cancelled' | 'suspended'

export interface TimetableIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
  index: number | null
  trip_id: string | null
}
