// Minimal RFC 4180 CSV reader/writer. No dependencies.
import { readFileSync, writeFileSync } from 'node:fs';

export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

export function readCsvObjects(path) {
  const [header, ...rows] = parseCsv(readFileSync(path, 'utf8'));
  return rows.map((r, i) => {
    const o = { __line: i + 2 };
    header.forEach((h, j) => { o[h] = r[j] ?? ''; });
    return o;
  });
}

const cell = (v) => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Writes UTF-8 (no BOM), LF line endings, header from `columns`. null → empty cell. */
export function writeCsv(path, columns, objects) {
  const lines = [columns.join(',')];
  for (const o of objects) lines.push(columns.map((c) => cell(o[c])).join(','));
  writeFileSync(path, lines.join('\n') + '\n', 'utf8');
}
