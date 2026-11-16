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
  /** Other marks after the minute (◆, ▲ …), explained in the legend. */
  misc: string;
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
      // the minute may be wrapped once more (<span class="minute"><span class="sp">34</span></span>) and followed by marks (◆▲)
      const minuteHtml = /<span class="minute">([\s\S]*?)(?:<span class="mark_etc">|<\/a>)/.exec(c)?.[1] ?? '';
      const minute = /(\d{1,2})/.exec(textOf(minuteHtml))?.[1];
      if (minute == null) continue;
      entries.push({
        hour,
        minute: Number(minute),
        mark: textOf(/<span class="train">([\s\S]*?)<\/span>/.exec(c)?.[1] ?? ''),
        misc: textOf(/<span class="mark_etc">([\s\S]*?)<\/span>/.exec(c)?.[1] ?? ''),
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
  /** 併結運転 notes, as printed (e.g. 東京－成田空港は2001Mに併結). */
  coupling: string[];
  /** The train's whole route as the page title gives it (e.g. 新宿－東京－成田空港), when it does. */
  route: string[] | null;
  /** Calls in the order of the page, only stations where the column has a time. */
  calls: TrainCall[];
}

/** Routes per column from the page title: 「停車駅一覧（A 1号（甲－乙）／A 1号（丙－丁－戊））」. */
function routesFromTitle(html: string): (string[] | null)[] {
  const title = textOf(/<title>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? '');
  const inner = /停車駅一覧（([\s\S]*)）/.exec(title)?.[1];
  if (!inner) return [];
  return inner.split('／').map((part) => {
    const m = /（([^（）]*)）\s*$/.exec(part);
    return m ? m[1]!.split('－').map((x) => x.trim()).filter(Boolean) : null;
  });
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
      if (columns.length === 0) {
        const routes = routesFromTitle(html);
        columns = cells.map((_, i) => ({ type: null, name: null, number: null, days: [], coupling: [], route: routes.length === cells.length ? (routes[i] ?? null) : null, calls: [] }));
      }
      cells.forEach((c, i) => {
        const col = columns[i];
        if (!col) return;
        const v = textOf(c) || null;
        if (label === '列車種別') col.type = v;
        else if (label === '列車名') col.name = v;
        else if (label === '列車番号') col.number = v;
        else if (label === '併結運転') col.coupling = [...c.matchAll(/<li>([\s\S]*?)(?=<li>|<\/li>|<\/ul>)/g)].map((m) => textOf(m[1]!)).filter(Boolean);
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

export interface DigitalColumn {
  number: string | null;
  name: string | null;
  /** 運転日 as printed (平日 / 全日 / 土曜・休日 …). */
  operatingDay: string | null;
  article: string | null;
  first: string | null;
  end: string | null;
  /** Times by station: arrival (着) and departure (発 or a row without a mark); HH:MM. */
  calls: { station: string; arr: string | null; dep: string | null }[];
  /** Track by station, from the 「<station>番線」 rows. */
  platforms: Record<string, string>;
}

export interface DigitalTimetable {
  title: string;
  /** 'weekday' or 'holiday' as the page heading says. */
  day: 'weekday' | 'holiday' | null;
  columns: DigitalColumn[];
}

const hhmm = (s: string): string | null => {
  const m = /^(\d{1,2})(\d{2})$/.exec(s.trim());
  return m ? `${m[1]!.padStart(2, '0')}:${m[2]}` : null;
};

/** A line timetable of the site's 「デジタル時刻表」 (timetable-v/<line><u|d><1|2>.html): every train of the line in one table. */
export function parseDigitalTimetable(html: string): DigitalTimetable {
  const title = textOf(/<h2[^>]*>([\s\S]*?)<\/h2>/.exec(html)?.[1] ?? '');
  const heading = /<h3 class="(weekday|holiday)"/.exec(html)?.[1] as 'weekday' | 'holiday' | undefined;
  const table = /<table class="paper_table">([\s\S]*?)<\/table>/.exec(html)?.[1] ?? '';
  let columns: DigitalColumn[] = [];
  for (const row of table.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    const cls = /<tr class="([^"]*)"/.exec(row)?.[1] ?? '';
    const th1 = textOf(/<th class="table_th01">([\s\S]*?)<\/th>/.exec(row)?.[1] ?? '');
    const th2 = textOf(/<th class="table_th02">([\s\S]*?)<\/th>/.exec(row)?.[1] ?? '');
    const tds = (row.match(/<td[\s\S]*?<\/td>/g) ?? []).map(textOf);
    if (cls === 'tableTr_trainNumber') {
      columns = tds.map((n) => ({ number: n || null, name: null, operatingDay: null, article: null, first: null, end: null, calls: [], platforms: {} }));
      continue;
    }
    const set = (key: 'name' | 'operatingDay' | 'article' | 'first' | 'end') => tds.forEach((v, i) => columns[i] && (columns[i]![key] = v || null));
    if (cls === 'tableTr_trainName') set('name');
    else if (cls === 'tableTr_operatingDay') set('operatingDay');
    else if (cls === 'tableTr_article') set('article');
    else if (cls === 'tableTr_firstTrain') set('first');
    else if (cls === 'tableTr_end') set('end');
    else if (cls === '' && th1) {
      const pf = /^(.+)番線$/.exec(th1);
      tds.forEach((v, i) => {
        const col = columns[i];
        if (!col) return;
        if (pf) {
          const n = halfWidth(v).replace(/[()（）\s]/g, '');
          if (n) col.platforms[pf[1]!] = n;
          return;
        }
        const t = hhmm(halfWidth(v));
        if (!t) return;
        let call = col.calls.find((c) => c.station === th1);
        if (!call) col.calls.push((call = { station: th1, arr: null, dep: null }));
        if (th2 === '着') call.arr = t;
        else call.dep = t;
      });
    }
  }
  return { title, day: heading ?? null, columns };
}
