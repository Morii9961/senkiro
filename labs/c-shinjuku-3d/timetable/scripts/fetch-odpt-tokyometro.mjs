// Fetches Tokyo Metro station / train timetables for M08, M09 and F13 from the
// ODPT API. Tokyo Metro data is under the 公共交通オープンデータ基本ライセンス
// (Public Transportation Open Data Basic License), which
//   * requires a registered developer account (consumer key), and
//   * forbids republishing the data or restorable derived data in a form third
//     parties can reuse (Art. 8-4-1).
// So the result is written ONLY to gitignored paths:
//   data/raw/odpt/tokyometro/*.json  and later data/shinjuku/local/.
// The key is read from the repository-root .env.local (ODPT_CONSUMER_KEY) and
// is never printed or written anywhere.
//
// Status at the time of writing: no key was available, so this script has NOT
// been run against the live API. Field handling in build.mjs mirrors the Toei
// path, which uses the same ODPT vocabulary.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../../..');
const envPath = join(repoRoot, '.env.local');
let key = process.env.ODPT_CONSUMER_KEY ?? '';
if (!key && existsSync(envPath)) {
  const m = /^ODPT_CONSUMER_KEY=(.*)$/m.exec(readFileSync(envPath, 'utf8'));
  key = m ? m[1].trim() : '';
}
if (!key) {
  console.error('ODPT_CONSUMER_KEY is not set (repository-root .env.local). Tokyo Metro data stays a documented gap.');
  process.exit(2);
}
const out = join(here, '../../data/raw/odpt/tokyometro');
mkdirSync(out, { recursive: true });
const BASE = 'https://api.odpt.org/api/v4';
const jobs = {
  'train_timetable_marunouchi.json': 'odpt:TrainTimetable?odpt:railway=odpt.Railway:TokyoMetro.Marunouchi',
  'train_timetable_fukutoshin.json': 'odpt:TrainTimetable?odpt:railway=odpt.Railway:TokyoMetro.Fukutoshin',
  'station_timetable_M08.json': 'odpt:StationTimetable?odpt:station=odpt.Station:TokyoMetro.Marunouchi.Shinjuku',
  'station_timetable_M09.json': 'odpt:StationTimetable?odpt:station=odpt.Station:TokyoMetro.Marunouchi.ShinjukuSanchome',
  'station_timetable_F13.json': 'odpt:StationTimetable?odpt:station=odpt.Station:TokyoMetro.Fukutoshin.ShinjukuSanchome',
  'train_type.json': 'odpt:TrainType?odpt:operator=odpt.Operator:TokyoMetro',
};
const manifest = { retrievedAt: new Date().toISOString(), license: '公共交通オープンデータ基本ライセンス', redistribution: 'no', files: {} };
for (const [file, q] of Object.entries(jobs)) {
  const url = `${BASE}/${q}&acl:consumerKey=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${file}`); // URL not printed: it contains the key
  const body = await res.json();
  writeFileSync(join(out, file), JSON.stringify(body));
  manifest.files[file] = { query: q, records: Array.isArray(body) ? body.length : null };
  console.log(`${file}: ${manifest.files[file].records} records`);
  await new Promise((r) => setTimeout(r, 500));
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
