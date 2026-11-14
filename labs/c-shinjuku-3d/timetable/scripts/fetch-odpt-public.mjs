// Fetches the Toei (Bureau of Transportation, Tokyo Metropolitan Government)
// railway datasets from the ODPT public endpoint. These datasets are CC BY 4.0
// and need no consumer key (https://developer.odpt.org/terms).
//
// Output: ../../data/raw/odpt/toei/*.json (gitignored; the build derives the
// committed files from these). Also writes manifest.json with retrieval time
// and the dc:date / dct:issued values seen, so validity can be audited.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '../../data/raw/odpt/toei');
mkdirSync(out, { recursive: true });
const BASE = 'https://api-public.odpt.org/api/v4';

const jobs = {
  'railway.json': 'odpt:Railway?odpt:operator=odpt.Operator:Toei',
  'station.json': 'odpt:Station?odpt:operator=odpt.Operator:Toei',
  'train_type.json': 'odpt:TrainType?odpt:operator=odpt.Operator:Toei',
  'rail_direction.json': 'odpt:RailDirection',
  'train_timetable_shinjuku.json': 'odpt:TrainTimetable?odpt:railway=odpt.Railway:Toei.Shinjuku',
  'train_timetable_oedo.json': 'odpt:TrainTimetable?odpt:railway=odpt.Railway:Toei.Oedo',
  'station_timetable_S01.json': 'odpt:StationTimetable?odpt:station=odpt.Station:Toei.Shinjuku.Shinjuku',
  'station_timetable_S02.json': 'odpt:StationTimetable?odpt:station=odpt.Station:Toei.Shinjuku.ShinjukuSanchome',
  'station_timetable_E27.json': 'odpt:StationTimetable?odpt:station=odpt.Station:Toei.Oedo.Shinjuku',
  'station_timetable_E01.json': 'odpt:StationTimetable?odpt:station=odpt.Station:Toei.Oedo.ShinjukuNishiguchi',
};

const manifest = { retrievedAt: new Date().toISOString(), endpoint: BASE, license: 'CC BY 4.0', files: {} };
for (const [file, q] of Object.entries(jobs)) {
  const url = `${BASE}/${q}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'SENKIRO-Lab-timetable/0.1 (open-data build)' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const body = await res.json();
  writeFileSync(join(out, file), JSON.stringify(body));
  const dates = {}; const issued = {};
  if (Array.isArray(body)) for (const x of body) {
    if (x['dc:date']) dates[x['dc:date']] = (dates[x['dc:date']] ?? 0) + 1;
    if (x['dct:issued']) issued[x['dct:issued']] = (issued[x['dct:issued']] ?? 0) + 1;
  }
  manifest.files[file] = { url, records: Array.isArray(body) ? body.length : null, dcDate: dates, dctIssued: issued };
  console.log(`${file}: ${manifest.files[file].records} records`);
  await new Promise((r) => setTimeout(r, 500));
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
