/**
 * Which tracks of the model have trains, and from which timetable.
 *
 *   npx tsx scripts/timetable-coverage.ts
 *
 * Reads the same files as the app (data/timetable/ and, when present, the
 * git-ignored data/raw/timetable/) and prints, track by track, how many trains
 * stop there on a weekday and on a Sunday, the lines the station model says
 * use the track, and the sources the trains come from. A track with 0 / 0 has
 * no timetable at all.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stationModelInput } from '../data/manual/index';
import type { Platform, StationModel } from '../src/domain/types';
import { timetableDataFrom } from '../src/providers/timetableProvider';
import type { TimetableFile } from '../src/timetable/adapter';
import { buildTrainPlans } from '../src/trains/simulate';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = (dir: string): TimetableFile[] =>
  existsSync(dir) ? readdirSync(dir).filter((f) => /\.(csv|json)$/i.test(f)).sort().map((name) => ({ name, content: readFileSync(resolve(dir, name), 'utf8') })) : [];
const data = timetableDataFrom({ committed: files(resolve(root, 'data/timetable')), local: files(resolve(root, 'data/raw/timetable')) });
const model = { ...stationModelInput, generatedAt: 'coverage' } as StationModel;

const count = (day: 'weekday' | 'sunday') => {
  const m = new Map<string, { n: number; sources: Set<string> }>();
  for (const p of buildTrainPlans(model, data.records, { dayType: day }).plans) {
    const k = `${p.platformAreaId}#${p.trackNumber}`;
    const e = m.get(k) ?? { n: 0, sources: new Set<string>() };
    e.n++;
    e.sources.add(p.record.source_id);
    m.set(k, e);
  }
  return m;
};
const wk = count('weekday');
const su = count('sunday');
const stationName = (id: string): string => model.stations.find((s) => s.id === id)?.names.ja ?? id;
const lineName = (id: string): string => model.railLines.find((l) => l.id === id)?.names.ja ?? id;

console.log(`dataset: ${data.dataset.kind}, ${data.records.length} records; files: ${data.files.join(', ')}`);
console.log('station | track | lines the model lists | weekday | Sunday | sources');
let empty = 0;
for (const a of model.areas.filter((x): x is Platform => x.kind === 'platform')) {
  for (const t of a.tracks) {
    const k = `${a.id}#${t.number}`;
    const lines = [...new Set(t.services.map((s) => lineName(s.railLineId)))].join('・') || '—';
    const w = wk.get(k);
    const s = su.get(k);
    if (!w && !s) empty++;
    const sources = [...new Set([...(w?.sources ?? []), ...(s?.sources ?? [])])].join(', ');
    console.log(`${stationName(a.stationId ?? '')} | ${t.number} | ${lines} | ${w?.n ?? 0} | ${s?.n ?? 0} | ${sources || '—'}`);
  }
}
console.log(`${empty} track faces have no train at all`);
