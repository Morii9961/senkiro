import { demoTimetable } from '../../data/manual/demoTimetable'
import { station } from '../model'
import { createTimetableRegistry } from '../timetable/registry'
import type { FeedMode, TimetableIssue } from '../timetable/types'
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

export function availableFeed(kind: FeedMode['kind']): FeedMode {
  if (kind === 'demo') return demoMode
  if (kind === 'live') return { kind: 'live', available: false, reason: 'no-licensed-feed' }
  return { kind: 'off' }
}
