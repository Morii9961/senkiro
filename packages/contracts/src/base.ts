import type { EntityIdPrefix, SkId } from './ids.ts';
import type { LocalizedNames } from './locale.ts';

export type DataNature =
  | 'official'
  | 'licensed-third-party'
  | 'derived'
  | 'manual-verified'
  | 'synthetic'
  | 'unknown';

export type LicensePermission = 'yes' | 'no' | 'conditional' | 'unknown';

export interface SourceRecord {
  id: SkId<'source'> | string;
  title: string;
  publisher: string;
  url: string | null;
  /** ISO-8601 date. */
  retrievedAt: string;
  /** Print or publication date of the original, when known. */
  sourceDate: string | null;
  license: string;
  licenseUrl: string | null;
  commercialUse: LicensePermission;
  redistribution: LicensePermission;
  shareAlike: boolean | 'unknown';
  attributionText: string;
  notes: string;
}

export interface Provenance {
  sourceIds: string[];
  dataNature: DataNature;
  /** ISO-8601 date. */
  lastVerifiedAt: string | null;
  note?: string;
}

export interface BaseEntity<T extends EntityIdPrefix = EntityIdPrefix> {
  id: SkId<T>;
  /** e.g. `{ odpt: "...", ksj: "...", osm: "..." }` */
  externalIds: Record<string, string>;
  names: LocalizedNames;
  provenance: Provenance;
  /** Business validity start; `null` when unknown. */
  validFrom: string | null;
  /** Business validity end; `null` when current or unknown. */
  validTo: string | null;
}

/** A fact carrying its own sources, for details recorded after the element itself. */
export type SourcedFact<T> = T & { sourceIds: string[]; note: string };

export type SchedulePrecision = 'timetable' | 'frequency' | 'demo_synthetic';

/**
 * Invariant 4: synthetic or estimated data must be disclosed in data, domain and UI layers.
 * True when the provenance is synthetic or a schedule is not an exact per-trip timetable.
 */
export function requiresSyntheticDisclosure(
  provenance: Pick<Provenance, 'dataNature'>,
  schedulePrecision?: SchedulePrecision,
): boolean {
  return (
    provenance.dataNature === 'synthetic' ||
    schedulePrecision === 'frequency' ||
    schedulePrecision === 'demo_synthetic'
  );
}
