/**
 * Data Providers for Core Atlas (CC BY / Public Data License) and Isolated ODbL Vertical Layer.
 */

import atlasRaw from '../../data/processed/atlas.json';
import allSourcesRaw from '../../data/sources.json';
import type {
  AtlasDataset,
  OsmVerticalDataset,
  SourceRecord,
  TrackVerticalAttribute,
} from '../domain/types.js';

export interface AtlasDataProvider {
  readonly providerId: string;
  getAtlasDataset(): AtlasDataset;
  getAllSources(): SourceRecord[];
  loadOsmVerticalOverlay(): Promise<OsmVerticalDataset>;
}

export class StaticAtlasProvider implements AtlasDataProvider {
  readonly providerId = 'static-processed-atlas-v1';
  private verticalCache: OsmVerticalDataset | null = null;

  getAtlasDataset(): AtlasDataset {
    return atlasRaw as unknown as AtlasDataset;
  }

  getAllSources(): SourceRecord[] {
    return allSourcesRaw as unknown as SourceRecord[];
  }

  /**
   * Lazy-loads the isolated ODbL 1.0 dataset (data/processed/osm-vertical.json)
   * strictly on demand when 3D stereoscopic layering is enabled.
   */
  async loadOsmVerticalOverlay(): Promise<OsmVerticalDataset> {
    if (this.verticalCache) return this.verticalCache;
    const mod = await import('../../data/processed/osm-vertical.json');
    this.verticalCache = mod.default as unknown as OsmVerticalDataset;
    return this.verticalCache;
  }
}

export function indexVerticalOverlay(
  overlay: OsmVerticalDataset | null,
): Map<string, TrackVerticalAttribute> {
  const map = new Map<string, TrackVerticalAttribute>();
  if (!overlay) return map;
  for (const rec of overlay.records) {
    map.set(rec.trackSegmentId, rec);
  }
  return map;
}
