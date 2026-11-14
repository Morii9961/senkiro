/**
 * The whole hand-entered model: JR East and the Keio Line (shinjuku.ts) joined
 * with the other operators and the links between them (extensions.ts), and
 * the neighbouring 新宿三丁目 stations (sanchome.ts) and 新宿西口 (nishiguchi.ts).
 */
import type { StationModel } from '../../src/domain/types';
import { EXT_IDS, extensions } from './extensions';
import { NG, nishiguchi } from './nishiguchi';
import { SC, sanchome } from './sanchome';
import { IDS as BASE_IDS, baseModel } from './shinjuku';

export const stationModelInput: Omit<StationModel, 'generatedAt'> = {
  schemaVersion: 1,
  unitNote:
    'All plan coordinates and elevations are unit-less schematic units invented for legibility. They are not metres and must not be used to derive distances or walking times.',
  operators: baseModel.operators,
  railLines: [...baseModel.railLines, ...extensions.railLines, ...sanchome.railLines],
  complex: baseModel.complex,
  stations: [...baseModel.stations, ...extensions.stations, ...sanchome.stations, ...nishiguchi.stations],
  levels: [...baseModel.levels, ...extensions.levels, ...sanchome.levels, ...nishiguchi.levels],
  areas: [...baseModel.areas, ...extensions.areas, ...sanchome.areas, ...nishiguchi.areas],
  passages: [...baseModel.passages, ...extensions.passages, ...sanchome.passages, ...nishiguchi.passages],
  gates: [...baseModel.gates, ...extensions.gates, ...sanchome.gates, ...nishiguchi.gates],
  entrances: [...baseModel.entrances, ...extensions.entrances, ...sanchome.entrances, ...nishiguchi.entrances],
  verticals: [...baseModel.verticals, ...extensions.verticals, ...sanchome.verticals, ...nishiguchi.verticals],
  unverifiedBlocks: extensions.unverifiedBlocks,
  unconfirmedConnections: baseModel.unconfirmedConnections,
};

/** Stable ids that the UI and tests refer to by name. */
export const IDS = { ...BASE_IDS, ...EXT_IDS, SC, NG } as const;
