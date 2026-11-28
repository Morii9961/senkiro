import { demoTimetable } from '../../data/manual/demoTimetable'
import { station } from '../model'
import { createTimetableRegistry } from '../timetable/registry'
import type { FeedMode, TimetableDataset, TimetableIssue } from '../timetable/types'
import { validateDataset } from '../timetable/validate'

export { demoTimetable }

export interface TimetableProvider {
  load(): Promise<{ mode: FeedMode; issues: TimetableIssue[] }>
}

export const timetableRegistry = createTimetableRegistry(station)
const { issues, usable } = validateDataset(demoTimetable, timetableRegistry)
export const demoMode: Extract<FeedMode, { kind: 'demo' }> = {
  kind: 'demo',
  dataset: { ...demoTimetable, records: usable },
}

export const demoTimetableProvider: TimetableProvider = {
  load: async () => ({ mode: demoMode, issues }),
}

export type OfficialTimetable = Extract<TimetableDataset, { kind: 'timetable' }>

export async function loadOfficialTimetable(signal: AbortSignal): Promise<OfficialTimetable | null> {
  if (window.location.hostname !== '127.0.0.1') return null
  const response = await fetch(import.meta.env.BASE_URL + 'local-official-timetable', { signal })
  if (!response.ok || !response.headers.get('Content-Type')?.includes('application/json')) return null
  const dataset = await response.json() as OfficialTimetable
  if (dataset.kind !== 'timetable' || !Array.isArray(dataset.records) || !Array.isArray(dataset.sources)) return null
  const { issues, usable } = validateDataset(dataset, timetableRegistry)
  return usable.length && !issues.some(({ severity }) => severity === 'error') ? dataset : null
}

export function availableFeed(kind: FeedMode['kind'], timetable: OfficialTimetable | null = null): FeedMode {
  if (kind === 'demo') return demoMode
  if (kind === 'timetable-sim' && timetable) return { kind, dataset: timetable }
  if (kind === 'live') return { kind: 'live', available: false, reason: 'no-licensed-feed' }
  return { kind: 'off' }
}
