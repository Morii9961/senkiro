/**
 * Writes data/timetable-example/demo-fixture.sample.csv: the first records of
 * the demo fixture in the hand-over CSV format, as a format example.
 * Run with: npx tsx scripts/write-timetable-sample.ts
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordsToCsv } from '../src/timetable/adapter';
import { buildDemoRecords } from '../src/timetable/demoFixture';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const all = buildDemoRecords();
const seen = new Map<string, number>();
// two records per track, plus the last one of the day (a time past 24:00)
const sample = all.filter((r) => {
  const n = (seen.get(r.platform_id!) ?? 0) + 1;
  seen.set(r.platform_id!, n);
  return n <= 2;
});
sample.push(all.filter((r) => r.platform_id === 'jr-east:shinjuku:14').at(-1)!);
writeFileSync(resolve(root, 'data/timetable-example/demo-fixture.sample.csv'), recordsToCsv(sample));
console.log(`wrote ${sample.length} sample records`);
