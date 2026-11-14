// Fetches the official list of Japanese national holidays (国民の祝日・休日)
// published by the Cabinet Office (内閣府) as CSV (Shift_JIS). Used to resolve
// calendar dates to operator day types. Output: data/raw/holidays/syukujitsu.csv (UTF-8).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '../../data/raw/holidays');
mkdirSync(out, { recursive: true });
const url = 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv';
const res = await fetch(url);
if (!res.ok) throw new Error(`${res.status} ${url}`);
const text = new TextDecoder('shift_jis').decode(await res.arrayBuffer());
writeFileSync(join(out, 'syukujitsu.csv'), text, 'utf8');
writeFileSync(join(out, 'manifest.json'), JSON.stringify({ url, retrievedAt: new Date().toISOString() }, null, 2));
console.log(`holidays: ${text.trim().split(/\r?\n/).length - 1} rows`);
