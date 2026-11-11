/**
 * Station data adapter. The model ships with the app as a JSON file generated
 * by `npm run data:build`; nothing is fetched at run time.
 */
import stationJson from '../../data/processed/station.json';
import sourcesJson from '../../data/sources.json';
import { buildGraph, type StationGraph } from '../domain/graph';
import type { SourceRecord, StationModel } from '../domain/types';

export interface StationData {
  model: StationModel;
  graph: StationGraph;
  sources: SourceRecord[];
}

let cached: StationData | null = null;

export function loadStationData(): StationData {
  if (!cached) {
    const model = stationJson as unknown as StationModel;
    cached = {
      model,
      // Built in the browser from the same model the views draw, so the two cannot disagree.
      graph: buildGraph(model),
      sources: sourcesJson as unknown as SourceRecord[],
    };
  }
  return cached;
}
