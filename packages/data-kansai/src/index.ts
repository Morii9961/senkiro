import type { RailLine, Station, StationComplex, TrackGraph } from '@senkiro/contracts';

export * from './kansai/catalog.ts';
export * from './kansai/index.ts';
export type * from './types.ts';

export interface AtlasSearchHit {
  kind: 'complex' | 'station' | 'line';
  id: string;
  names: Station['names'];
  operatorId?: string;
  stationComplexId?: string | null;
}

function matchesQuery(names: Station['names'], normalizedQuery: string): boolean {
  const fields = [names.ja, names.ja_kana, names.en, names.zh];
  for (const val of fields) {
    if (val?.toLowerCase().includes(normalizedQuery)) {
      return true;
    }
  }
  return false;
}

/**
 * Search complexes, stations, and lines across a `TrackGraph` without conflating
 * separate stations with complexes (e.g. 京都站 vs 京都河原町 / 祇園四条).
 */
export function searchAtlasEntities(trackGraph: TrackGraph, query: string): AtlasSearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) {
    return [];
  }
  const hits: AtlasSearchHit[] = [];

  const complexes: readonly StationComplex[] = trackGraph.complexes;
  for (const cx of complexes) {
    if (matchesQuery(cx.names, q)) {
      hits.push({ kind: 'complex', id: cx.id, names: cx.names });
    }
  }
  const stations: readonly Station[] = trackGraph.stations;
  for (const st of stations) {
    if (matchesQuery(st.names, q)) {
      hits.push({
        kind: 'station',
        id: st.id,
        names: st.names,
        operatorId: st.operatorId,
        stationComplexId: st.stationComplexId,
      });
    }
  }
  const lines: readonly RailLine[] = trackGraph.lines;
  for (const ln of lines) {
    if (matchesQuery(ln.names, q)) {
      hits.push({
        kind: 'line',
        id: ln.id,
        names: ln.names,
        operatorId: ln.operatorId,
      });
    }
  }
  return hits;
}
