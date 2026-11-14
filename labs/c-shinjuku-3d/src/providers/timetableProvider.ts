/**
 * Timetable provider.
 *
 * A timetable handed over by its producer is dropped into `data/timetable/`
 * as `.csv` and/or `.json` files (see data/timetable/README.md). They are
 * picked up at build time; nothing is fetched at run time. While that folder
 * holds no usable record, the demo fixture is used instead — as a whole, and
 * labelled as such. The two are never combined.
 */
import { datasetFromFiles, type TimetableFile } from '../timetable/adapter';
import { demoFixture } from '../timetable/demoFixture';
import type { TimetableDataset, TimetableIssue, TimetableRecord } from '../timetable/types';
import { validateDataset } from '../timetable/validate';

export interface TimetableData {
  dataset: TimetableDataset;
  /** Records that passed validation: the only ones the simulation uses. */
  records: TimetableRecord[];
  issues: TimetableIssue[];
  errorCount: number;
  warningCount: number;
  /** Files found in data/timetable/ — empty while the demo fixture is in use. */
  files: string[];
}

export function timetableDataFrom(files: TimetableFile[]): TimetableData {
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
      };
    }
  }
  const dataset = demoFixture();
  const v = validateDataset(dataset);
  return { dataset, records: v.usable, issues: v.issues, errorCount: v.errorCount, warningCount: v.warningCount, files: [] };
}

let cached: TimetableData | null = null;

export function loadTimetableData(): TimetableData {
  if (!cached) {
    const found = import.meta.glob<string>(['../../data/timetable/*.csv', '../../data/timetable/*.json'], { eager: true, query: '?raw', import: 'default' });
    const files = Object.entries(found)
      .map(([path, content]) => ({ name: path.split('/').pop() ?? path, content }))
      .sort((a, b) => a.name.localeCompare(b.name));
    cached = timetableDataFrom(files);
  }
  return cached;
}
