/**
 * Timetable provider.
 *
 * Timetable files are picked up at build time from two folders; nothing is
 * fetched at run time:
 *   - data/timetable/      committed: only data whose licence allows it to be
 *                          published with this repository (see its README.md);
 *   - data/raw/timetable/  git-ignored, local only: timetables whose terms do
 *                          not allow redistribution. They are read when they
 *                          are present on the machine that builds, are marked
 *                          "local only" in the interface, and never committed.
 * Both feed one dataset of real timetables. While neither holds a usable
 * record, the demo fixture is used instead — as a whole, and labelled as
 * such. A timetable and the demo fixture are never combined.
 */
import { datasetFromFiles, type TimetableFile } from '../timetable/adapter';
import { demoFixture } from '../timetable/demoFixture';
import { lineEntry } from '../timetable/registry';
import type { TimetableDataset, TimetableIssue, TimetableRecord } from '../timetable/types';
import { validateDataset } from '../timetable/validate';

export interface TimetableData {
  dataset: TimetableDataset;
  /** Records that passed validation: the only ones the simulation uses. */
  records: TimetableRecord[];
  issues: TimetableIssue[];
  errorCount: number;
  warningCount: number;
  /** Files read — empty while the demo fixture is in use. */
  files: string[];
  /** The subset of `files` that came from the git-ignored local folder. */
  localFiles: string[];
  /** Canonical line ids that have at least one usable record, in registry order. */
  coveredLineIds: string[];
}

export interface TimetableFileSet {
  /** From data/timetable/ (committed). */
  committed: TimetableFile[];
  /** From data/raw/timetable/ (git-ignored, local only). */
  local?: TimetableFile[];
}

function coveredLines(records: TimetableRecord[]): string[] {
  const ids = new Set(records.map((r) => lineEntry(r.line_id)?.line_id ?? r.line_id));
  return [...ids];
}

export function timetableDataFrom(input: TimetableFile[] | TimetableFileSet): TimetableData {
  const set: TimetableFileSet = Array.isArray(input) ? { committed: input } : input;
  const local = (set.local ?? []).map((f) => ({ ...f, name: `local/${f.name}` }));
  const files = [...set.committed, ...local];
  if (files.length > 0) {
    const { dataset, issues: fileIssues } = datasetFromFiles(files, 'timetable');
    const v = validateDataset(dataset);
    if (v.usable.length > 0) {
      const issues = [...fileIssues, ...v.issues];
      return {
        dataset,
        records: v.usable,
        issues,
        errorCount: issues.filter((i) => i.severity === 'error').length,
        warningCount: issues.filter((i) => i.severity === 'warning').length,
        files: files.map((f) => f.name),
        localFiles: local.map((f) => f.name),
        coveredLineIds: coveredLines(v.usable),
      };
    }
  }
  const dataset = demoFixture();
  const v = validateDataset(dataset);
  return { dataset, records: v.usable, issues: v.issues, errorCount: v.errorCount, warningCount: v.warningCount, files: [], localFiles: [], coveredLineIds: coveredLines(v.usable) };
}

let cached: TimetableData | null = null;

const toFiles = (found: Record<string, string>): TimetableFile[] =>
  Object.entries(found)
    .map(([path, content]) => ({ name: path.split('/').pop() ?? path, content }))
    .sort((a, b) => a.name.localeCompare(b.name));

export function loadTimetableData(): TimetableData {
  if (!cached) {
    const committed = import.meta.glob<string>(['../../data/timetable/*.csv', '../../data/timetable/*.json'], { eager: true, query: '?raw', import: 'default' });
    const local = import.meta.glob<string>(['../../data/raw/timetable/*.csv', '../../data/raw/timetable/*.json'], { eager: true, query: '?raw', import: 'default' });
    cached = timetableDataFrom({ committed: toFiles(committed), local: toFiles(local) });
  }
  return cached;
}
