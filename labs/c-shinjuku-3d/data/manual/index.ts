/**
 * The whole hand-entered model: JR East and the Keio Line (shinjuku.ts) joined
 * with the other operators and the links between them (extensions.ts).
 */
import type { StationModel } from '../../src/domain/types';
import { EXT_IDS, extensions } from './extensions';
import { IDS as BASE_IDS, baseModel } from './shinjuku';

export const stationModelInput: Omit<StationModel, 'generatedAt'> = {
  schemaVersion: 1,
  unitNote:
    'All plan coordinates and elevations are unit-less schematic units invented for legibility. They are not metres and must not be used to derive distances or walking times.',
  operators: baseModel.operators,
  railLines: [...baseModel.railLines, ...extensions.railLines],
  complex: baseModel.complex,
  stations: [...baseModel.stations, ...extensions.stations],
  levels: [...baseModel.levels, ...extensions.levels],
  areas: [...baseModel.areas, ...extensions.areas],
  passages: [...baseModel.passages, ...extensions.passages],
  gates: [...baseModel.gates, ...extensions.gates],
  entrances: [...baseModel.entrances, ...extensions.entrances],
  verticals: [...baseModel.verticals, ...extensions.verticals],
  unverifiedBlocks: extensions.unverifiedBlocks,
  unconfirmedConnections: baseModel.unconfirmedConnections,
};

/** Stable ids that the UI and tests refer to by name. */
export const IDS = { ...BASE_IDS, ...EXT_IDS } as const;
