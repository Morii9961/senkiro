import stationJson from '../../data/processed/station.json';
import sourcesJson from '../../data/sources.json';
import { buildGraph } from '../../src/domain/graph';
import type { SourceRecord, StationModel } from '../../src/domain/types';

/** The shipped model, exactly as the app loads it. */
export function loadModel(): StationModel {
  return structuredClone(stationJson) as unknown as StationModel;
}

export function loadSources(): SourceRecord[] {
  return structuredClone(sourcesJson) as unknown as SourceRecord[];
}

export function loadGraph() {
  return buildGraph(loadModel());
}

export function levelLabels(model: StationModel, levelIds: string[]): string[] {
  const byId = new Map(model.levels.map((l) => [l.id, l.label]));
  return levelIds.map((id) => byId.get(id) ?? '?');
}
