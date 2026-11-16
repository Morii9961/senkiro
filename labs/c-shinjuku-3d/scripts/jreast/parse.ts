/**
 * Readers for two kinds of page of JR East's station timetable site
 * (timetables.jreast.co.jp): the station's line list, a station timetable
 * (one line, one direction, one kind of day) and a train's stop list.
 *
 * Used only by scripts/fetch-timetable-jreast.ts, which keeps everything it
 * reads on the local machine (data/raw/, git-ignored): the site's terms of use
 * do not allow the timetables to be redistributed. Plain regular expressions,
 * no HTML library; whatever is not recognised is left out, never guessed.
 */

const ENTITIES: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

export function textOf(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e] ?? ' ')
    .replace(/[\s　]+/g, ' ')
    .trim();
}

/** Full-width digits and letters → ASCII. */
export function halfWidth(s: string): string {
  return s.replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

export interface LineListEntry {
  line: string;
  direction: string;
  weekday: string | null;
  holiday: string | null;
}

/** The rows of a station's line list (list<code>.html): line, direction and the two timetable links. */
export function parseLineList(html: string): LineListEntry[] {
  const out: LineListEntry[] = [];
  for (const row of html.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    const links = [...row.matchAll(/<a href="([^"]*timetable\/tt\d+\/\d+\.html)"[^>]*>([\s\S]*?)<\/a>/g)];
    if (links.length === 0) continue;
    const cells = (row.match(/<t[dh][\s\S]*?<\/t[dh]>/g) ?? []).map(textOf).filter((c) => c !== '');
    const weekday = links.find((l) => textOf(l[2]!) === '平日')?.[1] ?? null;
    const holiday = links.find((l) => /土曜|休日/.test(textOf(l[2]!)))?.[1] ?? null;
    if (cells.length < 2) continue;
    out.push({ line: cells[0]!, direction: cells[1]!, weekday, holiday });
  }
  return out;
}

export interface StationTimetableEntry {
  hour: number;
  minute: number;
  /** Type / name mark as printed (e.g. "NEX", "快"), empty for the unmarked type. */
  mark: string;
  /** Destination mark as printed, empty for the unmarked destination. */
  dest: string;
  /** Link to the train's stop list, as written in the page (relative). */
  href: string | null;
}

export interface StationTimetable {
  title: string;
  entries: StationTimetableEntry[];
  /** The legend under the table, as printed ("無印=特急 NEX=成田エクスプレス" …). */
  legend: string;
}

/** A station timetable page (tt<code>/<code><nn><d>.html). */
export function parseStationTimetable(html: string): StationTimetable {
  const title = textOf(/<h2[^>]*>([\s\S]*?)<\/h2>/.exec(html)?.[1] ?? '');
  const entries: StationTimetableEntry[] = [];
  for (const row of html.matchAll(/<tr id="time_(\d+)">([\s\S]*?)<\/tr>/g)) {
    const hour = Number(row[1]);
    for (const cell of row[2]!.matchAll(/<div class="timetable_time"[\s\S]*?<\/div>/g)) {
      const c = cell[0];
      const minute = /<span class="minute">\s*(\d{1,2})\s*<\/span>/.exec(c)?.[1];
      if (minute == null) continue;
      entries.push({
        hour,
        minute: Number(minute),
        mark: textOf(/<span class="train">([\s\S]*?)<\/span>/.exec(c)?.[1] ?? ''),
        dest: textOf(/<span class="dest(?:ination)?">([\s\S]*?)<\/span>/.exec(c)?.[1] ?? ''),
        href: /<a href="([^"]+)"/.exec(c)?.[1] ?? null,
      });
    }
  }
  const legendStart = html.indexOf('列車種別・列車名');
  const legend = legendStart >= 0 ? textOf(html.slice(legendStart, legendStart + 4000).split(/<div class="(?:btn|reservation|search)/)[0]!).slice(0, 600) : '';
  return { title, entries, legend };
}

export interface TrainCall {
  station: string;
  /** Station list code from the link, when the row has one. */
  code: string | null;
  arr: string | null;
  dep: string | null;
  platform: string | null;
}

export interface TrainColumn {
  type: string | null;
  name: string | null;
  number: string | null;
  /** 運転日 notes, as printed. */
  days: string[];
  /** Calls in the order of the page, only stations where the column has a time. */
  calls: TrainCall[];
}

function cellsOf(row: string): string[] {
  return (row.match(/<td[\s\S]*?<\/td>/g) ?? []);
}

/** A train's stop list (train/<nnn>/<nnnnnn>.html). One column per train shown on the page (a page can show two trains running coupled). */
export function parseTrainPage(html: string): TrainColumn[] {
  const table = /<table id="tbl_train"[\s\S]*?<\/table>/.exec(html)?.[0];
  if (!table) return [];
  const rows = table.match(/<tr class="[^"]*"[\s\S]*?<\/tr>/g) ?? [];
  let columns: TrainColumn[] = [];
  for (const row of rows) {
    const cls = /<tr class="([^"]*)"/.exec(row)![1];
    if (cls === 'train') {
      const label = textOf(/<th[^>]*>([\s\S]*?)<\/th>/.exec(row)?.[1] ?? '');
      const cells = cellsOf(row);
      if (columns.length === 0) columns = cells.map(() => ({ type: null, name: null, number: null, days: [], calls: [] }));
      cells.forEach((c, i) => {
        const col = columns[i];
        if (!col) return;
        const v = textOf(c) || null;
        if (label === '列車種別') col.type = v;
        else if (label === '列車名') col.name = v;
        else if (label === '列車番号') col.number = v;
        else if (label === '運転日') col.days = [...c.matchAll(/<li>([\s\S]*?)(?=<li>|<\/li>|<\/ul>)/g)].map((m) => textOf(m[1]!)).filter(Boolean);
      });
    } else if (cls === 'time') {
      const th = /<th class="time">([\s\S]*?)<\/th>/.exec(row)?.[1] ?? '';
      const station = textOf(th);
      const code = /list(\d+)\.html/.exec(th)?.[1] ?? null;
      const cells = cellsOf(row);
      for (let i = 0; i < columns.length; i++) {
        const timeCell = cells[i * 2] ?? '';
        const pfCell = cells[i * 2 + 1] ?? '';
        const times = [...textOf(timeCell).matchAll(/(\d{1,2}:\d{2})\s*(着|発)/g)];
        const arr = times.find((t) => t[2] === '着')?.[1] ?? null;
        const dep = times.find((t) => t[2] === '発')?.[1] ?? null;
        if (arr == null && dep == null) continue;
        const pf = halfWidth(textOf(pfCell));
        columns[i]!.calls.push({ station, code, arr, dep, platform: pf || null });
      }
    }
  }
  return columns;
}
