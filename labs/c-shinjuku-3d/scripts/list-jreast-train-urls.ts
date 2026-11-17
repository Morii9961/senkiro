/**
 * Lists the stop-list pages linked from JR East station timetables saved by hand, so that they can be
 * saved in turn (the site refuses this machine's scripts, so pages are saved in a browser).
 *
 *   npx tsx scripts/list-jreast-train-urls.ts [destination-mark]
 *
 * Reads data/raw/jreast-saved/stations/*.html (station timetable pages, e.g. 池袋 埼京線 大崎方面) and
 * writes data/raw/jreast-saved/train-urls.md: one line per train, with its time and destination mark.
 * With a destination mark (e.g. 新), only trains carrying that mark are listed. Nothing is fetched.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStationTimetable } from './jreast/parse';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'data/raw/jreast-saved/stations');
const mark = process.argv[2] ?? null;
const BASE = 'https://timetables.jreast.co.jp/2611/timetable/tt0000/';

if (!existsSync(dir)) {
  console.error(`no folder ${dir}: save the station timetable pages there first`);
  process.exit(1);
}
const lines: string[] = ['# 要保存的单班详情页（由 scripts/list-jreast-train-urls.ts 生成）', '', '保存到 `data/raw/jreast-saved/trains/`（Ctrl+S，「网页，仅 HTML」，文件名随意）。', ''];
const seen = new Set<string>();
for (const f of readdirSync(dir).filter((x) => /\.html?$/i.test(x)).sort()) {
  const st = parseStationTimetable(readFileSync(resolve(dir, f), 'utf8'));
  lines.push(`## ${st.title || f}`, '');
  for (const e of st.entries) {
    if (!e.href || (mark && e.dest !== mark)) continue;
    // the saved page's own address is unknown, so links are resolved against the site's timetable folder
    const url = new URL(e.href, BASE).toString();
    const dup = seen.has(url);
    seen.add(url);
    lines.push(`- ${String(e.hour).padStart(2, '0')}:${String(e.minute).padStart(2, '0')} ${e.mark} ${e.dest || ''} <${url}>${dup ? '（同上，已列出）' : ''}`);
  }
  lines.push('');
}
writeFileSync(resolve(root, 'data/raw/jreast-saved/train-urls.md'), lines.join('\n'));
console.log(`${seen.size} distinct pages listed in data/raw/jreast-saved/train-urls.md`);
