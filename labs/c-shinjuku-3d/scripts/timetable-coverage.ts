/**
 * Which tracks of the model have trains, and from which timetable.
 *
 *   npx tsx scripts/timetable-coverage.ts
 *
 * Reads the same files as the app (data/timetable/ and, when present, the git-ignored
 * data/raw/timetable/) and prints, physical track by physical track, how many trains stop there on a
 * weekday and on a Sunday, and the sources they come from. A platform number names one side of a
 * platform, not a track: where a track has a platform on both sides (小田急 5・6, 7・8, 9・10; 京王 2・3
 * with the alighting-only platform), both numbers are listed on one line and the trains are counted once.
 * A track with 0 / 0 has no timetable at all.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stationModelInput } from '../data/manual/index';
import type { Platform, StationModel } from '../src/domain/types';
import { timetableDataFrom } from '../src/providers/timetableProvider';
import type { TimetableFile } from '../src/timetable/adapter';
import { buildTrainPlans } from '../src/trains/simulate';
import { physicalTrackKey, trackLine } from '../src/trains/trackGeometry';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = (dir: string): TimetableFile[] =>
  existsSync(dir) ? readdirSync(dir).filter((f) => /\.(csv|json)$/i.test(f)).sort().map((name) => ({ name, content: readFileSync(resolve(dir, name), 'utf8') })) : [];
const data = timetableDataFrom({ committed: files(resolve(root, 'data/timetable')), local: files(resolve(root, 'data/raw/timetable')) });
const model = { ...stationModelInput, generatedAt: 'coverage' } as StationModel;

const stationName = (id: string): string => model.stations.find((s) => s.id === id)?.names.ja ?? id;
const lineName = (id: string): string => model.railLines.find((l) => l.id === id)?.names.ja ?? id;

/** One physical track: the platform faces along it, in model order. */
interface TrackGroup {
  key: string;
  station: string;
  faces: string[];
  lines: Set<string>;
}
const groups = new Map<string, TrackGroup>();
for (const a of model.areas.filter((x): x is Platform => x.kind === 'platform')) {
  for (const t of a.tracks) {
    const line = trackLine(a, t.number);
    // a face without a drawn track (the Keio alighting platform) belongs to the track of the same number at the station
    const key = line ? physicalTrackKey(line) : `${a.stationId}#${t.number}`;
    const sameNumber = [...groups.values()].find((g) => g.station === a.stationId && g.faces.includes(t.number));
    const g = groups.get(key) ?? (line ? undefined : sameNumber) ?? { key, station: a.stationId ?? '', faces: [], lines: new Set<string>() };
    if (!g.faces.includes(t.number)) g.faces.push(t.number);
    for (const s of t.services) g.lines.add(lineName(s.railLineId));
    groups.set(g.key, g);
  }
}

const count = (day: 'weekday' | 'sunday') => {
  const m = new Map<string, { n: number; sources: Set<string> }>();
  for (const p of buildTrainPlans(model, data.records, { dayType: day }).plans) {
    const e = m.get(p.physicalTrack) ?? { n: 0, sources: new Set<string>() };
    e.n++;
    e.sources.add(p.record.source_id);
    m.set(p.physicalTrack, e);
  }
  return m;
};
const wk = count('weekday');
const su = count('sunday');

console.log(`dataset: ${data.dataset.kind}, ${data.records.length} records; files: ${data.files.join(', ')}`);
console.log('station | platform numbers on this track | lines the model lists | weekday | Sunday | sources');
let empty = 0;
for (const g of groups.values()) {
  const w = wk.get(g.key);
  const s = su.get(g.key);
  if (!w && !s) empty++;
  const sources = [...new Set([...(w?.sources ?? []), ...(s?.sources ?? [])])].join(', ');
  console.log(`${stationName(g.station)} | ${g.faces.join('・')} | ${[...g.lines].join('・') || '—'} | ${w?.n ?? 0} | ${s?.n ?? 0} | ${sources || '—'}`);
}
console.log(`${groups.size} physical tracks, ${empty} with no train at all`);
