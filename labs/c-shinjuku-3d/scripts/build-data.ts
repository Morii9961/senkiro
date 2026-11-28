/**
 * npm run data:build   — validate the hand-entered model and write
 *                        data/processed/{station,graph}.json, data/sources.json
 *                        and the element table inside SOURCES.md.
 * npm run data:check   — same, but writes nothing and fails if any generated
 *                        file is stale (used by `npm run build`).
 *
 * There is no download step for the model: the "raw source" of the station
 * model is data/manual/*.ts, typed by hand while reading the official floor
 * maps listed in data/manual/sources.ts.
 *
 * Both commands also validate the timetable files: data/timetable/ (committed)
 * and, when present, data/raw/timetable/ (git-ignored, local only). A record
 * with an error fails the build, and every source of a committed record must
 * be a SourceRecord whose licence allows redistribution.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stationModelInput } from '../data/manual/index';
import { RETRIEVED_AT, sources } from '../data/manual/sources';
import { buildGraph } from '../src/domain/graph';
import type { SourceRecord, StationElementBase, StationModel } from '../src/domain/types';
import { allElements, validateModel } from '../src/domain/validate';
import { timetableDataFrom } from '../src/providers/timetableProvider';
import type { TimetableFile } from '../src/timetable/adapter';
import { buildTrainPlans } from '../src/trains/simulate';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

const model: StationModel = { ...stationModelInput, generatedAt: RETRIEVED_AT };

const issues = validateModel(model, sources);
if (issues.length > 0) {
  console.error(`✗ ${issues.length} validation issue(s):`);
  for (const i of issues) console.error(`  [${i.rule}] ${i.elementId}: ${i.message}`);
  process.exit(1);
}

const graph = buildGraph(model);

// --- timetable ------------------------------------------------------------------------
function timetableFiles(dir: string): TimetableFile[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.(csv|json)$/i.test(f))
    .sort()
    .map((name) => ({ name, content: readFileSync(resolve(dir, name), 'utf8') }));
}
const committedTimetable = timetableFiles(resolve(root, 'data/timetable'));
const localTimetable = timetableFiles(resolve(root, 'data/raw/timetable'));
const timetable = timetableDataFrom({ committed: committedTimetable, local: localTimetable });
{
  const problems: string[] = [];
  if (committedTimetable.length + localTimetable.length > 0 && timetable.dataset.kind === 'demo-fixture') problems.push('timetable files are present but hold no usable record');
  for (const i of timetable.issues.filter((x) => x.severity === 'error').slice(0, 30)) problems.push(`[${i.code}] ${i.trip_id ?? '-'}: ${i.message}`);
  const committedRecords = new Set(committedTimetable.length ? datasetSourceIds(committedTimetable) : []);
  for (const id of committedRecords) {
    const s = sources.find((x) => x.id === id);
    if (!s) problems.push(`committed timetable source ${id} is not a SourceRecord in data/manual/sources.ts`);
    else if (s.redistribution !== 'yes') problems.push(`committed timetable source ${id} does not allow redistribution (${s.redistribution})`);
  }
  if (problems.length) {
    console.error(`✗ timetable: ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  const placed = buildTrainPlans(model, timetable.records, { dayType: null });
  const reasons = new Map<string, number>();
  for (const u of placed.unplaced) reasons.set(u.reason, (reasons.get(u.reason) ?? 0) + 1);
  const warnings = new Map<string, number>();
  for (const i of timetable.issues) if (i.severity === 'warning') warnings.set(i.code, (warnings.get(i.code) ?? 0) + 1);
  console.log(
    `✓ timetable (${timetable.dataset.kind}): ${timetable.records.length} records, ${placed.plans.length} placed on a track; lines: ${timetable.coveredLineIds.join(', ')}` +
      (timetable.localFiles.length ? `; local only: ${timetable.localFiles.join(', ')}` : '') +
      (reasons.size ? `; not placed: ${JSON.stringify(Object.fromEntries(reasons))}` : '') +
      (warnings.size ? `; warnings: ${JSON.stringify(Object.fromEntries(warnings))}` : ''),
  );
}

/** Source ids used by the records of some timetable files. */
function datasetSourceIds(files: TimetableFile[]): string[] {
  const d = timetableDataFrom(files);
  return d.dataset.kind === 'timetable' ? [...new Set(d.records.map((r) => r.source_id))] : [];
}

function elementKind(e: StationElementBase): string {
  const k = (e as { kind?: string }).kind ?? '?';
  if (k === 'vertical') return (e as { verticalKind?: string }).verticalKind ?? k;
  return k;
}

function label(e: StationElementBase): string {
  return e.names.ja ?? e.names.en ?? '（無名）';
}

function sourceDates(e: StationElementBase, byId: Map<string, SourceRecord>): string {
  const dates = e.provenance.sourceIds.map((id) => byId.get(id)?.sourceDate ?? '不明');
  return [...new Set(dates)].join(', ');
}

function elementTable(): string {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const rows = allElements(model).map(
    (e) =>
      `| \`${e.id}\` | ${elementKind(e)} | ${label(e).replaceAll('|', '／')} | ${e.provenance.sourceIds
        .map((s) => `\`${s}\``)
        .join('<br>')} | ${sourceDates(e, byId)} | ${e.existence} | ${e.geometryConfidence} | ${e.provenance.dataNature} |`,
  );
  return [
    `共 ${rows.length} 个元素。本表由 \`npm run data:build\` 从 \`data/manual/shinjuku.ts\` 生成，请勿手改。`,
    '',
    '| 元素 ID | 类型 | 名称（资料原文） | 依据资料 | 资料日期 | existence | geometry_confidence | dataNature |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

const BEGIN = '<!-- BEGIN:element-table (generated by npm run data:build) -->';
const END = '<!-- END:element-table -->';

const outputs: { path: string; content: string }[] = [
  { path: 'data/processed/station.json', content: JSON.stringify(model, null, 2) + '\n' },
  { path: 'data/processed/graph.json', content: JSON.stringify(graph, null, 2) + '\n' },
  { path: 'data/sources.json', content: JSON.stringify(sources, null, 2) + '\n' },
];

const sourcesMd = resolve(root, 'SOURCES.md');
if (existsSync(sourcesMd)) {
  const current = readFileSync(sourcesMd, 'utf8');
  const start = current.indexOf(BEGIN);
  const end = current.indexOf(END);
  if (start >= 0 && end > start) {
    outputs.push({
      path: 'SOURCES.md',
      content: `${current.slice(0, start)}${BEGIN}\n\n${elementTable()}\n\n${current.slice(end)}`,
    });
  }
}

let stale = 0;
for (const o of outputs) {
  const file = resolve(root, o.path);
  const existing = existsSync(file) ? readFileSync(file, 'utf8').replaceAll('\r\n', '\n') : null;
  if (existing === o.content) continue;
  if (check) {
    stale += 1;
    console.error(`✗ stale: ${o.path} — run "npm run data:build"`);
  } else {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, o.content, 'utf8');
    console.log(`wrote ${o.path}`);
  }
}

if (stale > 0) process.exit(1);

const counts = {
  levels: model.levels.length,
  areas: model.areas.length,
  platforms: model.areas.filter((a) => a.kind === 'platform').length,
  gates: model.gates.length,
  entrances: model.entrances.length,
  verticals: model.verticals.length,
  passages: model.passages.length,
  unverifiedBlocks: model.unverifiedBlocks.length,
  services: model.services.length,
  graphNodes: graph.nodes.length,
  graphEdges: graph.edges.length,
};
console.log(`✓ model valid${check ? ' and generated files up to date' : ''}:`, JSON.stringify(counts));
