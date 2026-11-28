/**
 * Floors — the passenger-facing grouping of Levels.
 *
 * Every operator numbers its own floors, so the model keeps one Level entity
 * per operator and floor (JR "B1F" and Keio "B1F" are different Levels). A
 * passenger, however, thinks of "B1F" as one floor of the station. A Floor is
 * therefore every Level that shares an `ordinal`, the model's vertical datum.
 *
 * This is a display grouping only. It does not claim that two operators'
 * floors of the same number are at the same height — see each Level's
 * `elevationNote`.
 */
import type { StationModel } from './types';

export interface Floor {
  ordinal: number;
  /** "2F", "1F", "B1F" … derived from the ordinal. */
  label: string;
  levelIds: string[];
}

export function floorLabel(ordinal: number): string {
  return ordinal >= 0 ? `${ordinal + 1}F` : `B${-ordinal}F`;
}

/** Floors of the model, top floor first. */
export function floorsOf(model: Pick<StationModel, 'levels'>): Floor[] {
  const byOrdinal = new Map<number, string[]>();
  for (const level of model.levels) {
    const list = byOrdinal.get(level.ordinal) ?? [];
    list.push(level.id);
    byOrdinal.set(level.ordinal, list);
  }
  return [...byOrdinal.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([ordinal, levelIds]) => ({ ordinal, label: floorLabel(ordinal), levelIds }));
}

/** Ordinal of every level, by id. */
export function ordinalByLevel(model: Pick<StationModel, 'levels'>): Map<string, number> {
  return new Map(model.levels.map((l) => [l.id, l.ordinal]));
}

/** Consecutive duplicates removed: the floors a list of levels passes through. */
export function floorSequence(levelIds: string[], ordinals: Map<string, number>): number[] {
  const out: number[] = [];
  for (const id of levelIds) {
    const o = ordinals.get(id);
    if (o !== undefined && out[out.length - 1] !== o) out.push(o);
  }
  return out;
}
