/**
 * The whole hand-entered model: JR East and the Keio Line (shinjuku.ts) joined
 * with the other operators and the links between them (extensions.ts), and
 * the neighbouring 新宿三丁目 stations (sanchome.ts) and 新宿西口 (nishiguchi.ts).
 */
import type { StationModel } from '../../src/domain/types';
import { EXT_IDS, extensions } from './extensions';
import { applyLaterFacts } from './laterFacts';
import { NG, nishiguchi } from './nishiguchi';
import { SC, sanchome } from './sanchome';
import { IDS as BASE_IDS, baseModel } from './shinjuku';

// platform doors, termini and one-way escalators read later from other sources (laterFacts.ts)
const later = applyLaterFacts(
  [...baseModel.areas, ...extensions.areas, ...sanchome.areas, ...nishiguchi.areas],
  [...baseModel.verticals, ...extensions.verticals, ...sanchome.verticals, ...nishiguchi.verticals],
);

export const stationModelInput: Omit<StationModel, 'generatedAt'> = {
  schemaVersion: 1,
  unitNote:
    'All plan coordinates and elevations are unit-less schematic units invented for legibility. They are not metres and must not be used to derive distances or walking times.',
  operators: baseModel.operators,
  railLines: [...baseModel.railLines, ...extensions.railLines, ...sanchome.railLines],
  complex: baseModel.complex,
  stations: [...baseModel.stations, ...extensions.stations, ...sanchome.stations, ...nishiguchi.stations],
  levels: [...baseModel.levels, ...extensions.levels, ...sanchome.levels, ...nishiguchi.levels],
  areas: later.areas,
  passages: [...baseModel.passages, ...extensions.passages, ...sanchome.passages, ...nishiguchi.passages],
  gates: [...baseModel.gates, ...extensions.gates, ...sanchome.gates, ...nishiguchi.gates],
  entrances: [...baseModel.entrances, ...extensions.entrances, ...sanchome.entrances, ...nishiguchi.entrances],
  verticals: later.verticals,
  unverifiedBlocks: extensions.unverifiedBlocks,
  services: extensions.services,
  unconfirmedConnections: baseModel.unconfirmedConnections,
};

/** Stable ids that the UI and tests refer to by name. */
export const IDS = { ...BASE_IDS, ...EXT_IDS, SC, NG } as const;
