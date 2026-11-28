/**
 * Reads a timetable export — CSV or JSON — into TimetableRecord objects.
 *
 * The adapters normalise spelling only: empty cells and "null" / "unknown"
 * become null, times get two-digit hours, the vehicle status is lower-cased.
 * They do not fill anything in. What is wrong with a record is reported by
 * ./validate.ts.
 */
import { TIMETABLE_FIELDS, type TimetableDataset, type TimetableIssue, type TimetableKind, type TimetableRecord, type TimetableSource, type VehicleAssignmentStatus } from './types';

/** RFC 4180-style CSV: quoted fields, doubled quotes, CR/LF inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

const NULLISH = new Set(['', 'null', 'none', 'n/a', 'na', '-', '不明', '未知']);

function text(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return NULLISH.has(s.toLowerCase()) ? null : s;
}

function time(v: unknown): string | null {
  const s = text(v);
  if (s == null) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  // Left as written when it is not a time: validation reports it.
  return m ? `${m[1]!.padStart(2, '0')}:${m[2]}${m[3] ? `:${m[3]}` : ''}` : s;
}

function count(v: unknown): number | null {
  const s = text(v);
  if (s == null || s.toLowerCase() === 'unknown') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** One loosely typed row → a record. Unknown keys are ignored. */
export function toRecord(row: Record<string, unknown>): TimetableRecord {
  const status = (text(row.vehicle_assignment_status) ?? 'unknown').toLowerCase() as VehicleAssignmentStatus;
  const series = text(row.vehicle_series);
  return {
    station_id: text(row.station_id) ?? '',
    operator_id: text(row.operator_id) ?? '',
    line_id: text(row.line_id) ?? '',
    platform_id: text(row.platform_id),
    direction_id: text(row.direction_id),
    service_date_type: text(row.service_date_type) ?? '',
    trip_id: text(row.trip_id) ?? '',
    train_number: text(row.train_number),
    arrival_time_local: time(row.arrival_time_local),
    departure_time_local: time(row.departure_time_local),
    destination_text: text(row.destination_text),
    service_class: text(row.service_class),
    vehicle_series: series?.toLowerCase() === 'unknown' ? null : series,
    formation_length: count(row.formation_length),
    vehicle_assignment_status: status,
    source_id: text(row.source_id) ?? '',
    valid_from: text(row.valid_from),
    valid_until: text(row.valid_until),
    remarks: text(row.remarks),
  };
}

export interface ParsedRecords {
  records: TimetableRecord[];
  /** Problems with the file itself (missing columns, not an array…). */
  issues: TimetableIssue[];
}

const fileIssue = (code: string, message: string): TimetableIssue => ({ severity: 'error', code, message, index: null, trip_id: null });

/** A CSV whose first row names the fields. Column order is free; extra columns are ignored. */
export function recordsFromCsv(csv: string): ParsedRecords {
  const rows = parseCsv(csv);
  const header = rows[0]?.map((h) => h.trim());
  if (!header) return { records: [], issues: [fileIssue('empty-file', 'the CSV has no header row')] };
  const issues: TimetableIssue[] = [];
  const missing = TIMETABLE_FIELDS.filter((f) => !header.includes(f));
  if (missing.length) issues.push(fileIssue('missing-columns', `the CSV has no column for: ${missing.join(', ')}`));
  const records = rows.slice(1).map((cells) => toRecord(Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']))));
  return { records, issues };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Either an array of records, or an object with a `records` array. */
export function recordsFromJson(value: unknown): ParsedRecords {
  const list = Array.isArray(value) ? value : isObj(value) && Array.isArray(value.records) ? value.records : null;
  if (!list) return { records: [], issues: [fileIssue('not-a-record-list', 'expected an array of records or an object with a "records" array')] };
  const issues: TimetableIssue[] = [];
  const records: TimetableRecord[] = [];
  list.forEach((row, i) => {
    if (isObj(row)) records.push(toRecord(row));
    else issues.push({ severity: 'error', code: 'not-an-object', message: `entry ${i} is not an object`, index: null, trip_id: null });
  });
  return { records, issues };
}

function sourcesFromJson(value: unknown): TimetableSource[] {
  if (!isObj(value) || !Array.isArray(value.sources)) return [];
  return value.sources.filter(isObj).map((s) => ({
    id: text(s.id) ?? '',
    title: text(s.title) ?? text(s.id) ?? '',
    publisher: text(s.publisher),
    url: text(s.url),
    retrievedAt: text(s.retrievedAt) ?? text(s.retrieved_at),
    license: text(s.license),
    notes: text(s.notes),
  }));
}

export interface TimetableFile {
  /** File name, used in messages and as the label. */
  name: string;
  content: string;
}

/**
 * Builds one dataset from the files of a timetable hand-over: any number of
 * `.csv` / `.json` record files, plus optionally a JSON file with a `sources`
 * array. A source id used by a record but described nowhere still gets an
 * entry, with everything but the id unknown, so that it stays traceable.
 */
export function datasetFromFiles(files: TimetableFile[], kind: TimetableKind = 'timetable'): { dataset: TimetableDataset; issues: TimetableIssue[] } {
  const records: TimetableRecord[] = [];
  const sources = new Map<string, TimetableSource>();
  const issues: TimetableIssue[] = [];
  let generatedAt: string | null = null;

  for (const file of files) {
    let parsed: ParsedRecords;
    if (/\.csv$/i.test(file.name)) parsed = recordsFromCsv(file.content);
    else {
      let json: unknown;
      try {
        json = JSON.parse(file.content);
      } catch {
        issues.push(fileIssue('bad-json', `${file.name} is not valid JSON`));
        continue;
      }
      for (const s of sourcesFromJson(json)) if (s.id) sources.set(s.id, s);
      if (isObj(json) && typeof json.generatedAt === 'string') generatedAt = json.generatedAt;
      // A file that only lists sources is fine.
      if (isObj(json) && !Array.isArray(json.records) && Array.isArray(json.sources)) continue;
      parsed = recordsFromJson(json);
    }
    for (const i of parsed.issues) issues.push({ ...i, message: `${file.name}: ${i.message}` });
    records.push(...parsed.records);
  }

  for (const r of records) {
    if (r.source_id && !sources.has(r.source_id)) {
      sources.set(r.source_id, { id: r.source_id, title: r.source_id, publisher: null, url: null, retrievedAt: null, license: null, notes: 'Not described in the hand-over; only the id is known.' });
    }
  }

  return {
    dataset: { kind, label: files.map((f) => f.name).join(', '), generatedAt, sources: [...sources.values()], records },
    issues,
  };
}

/** A dataset as CSV, in the agreed column order — the example file is written with this. */
export function recordsToCsv(records: TimetableRecord[]): string {
  const cell = (v: unknown): string => {
    if (v == null) return '';
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [TIMETABLE_FIELDS.join(','), ...records.map((r) => TIMETABLE_FIELDS.map((f) => cell(r[f])).join(','))].join('\n') + '\n';
}
