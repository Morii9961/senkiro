import type { RegionalAtlasBundle } from '../types.ts';
import {
  kantoThroughServices,
  kantoTrackGraph,
  kantoUnalignedRecords,
} from './generated/kanto-meta.ts';
import { kantoVerticalLayer } from './generated/kanto-vertical-odbl.ts';

export { kantoThroughServices, kantoTrackGraph, kantoUnalignedRecords, kantoVerticalLayer };

export const kantoPreviewAtlasBundle: RegionalAtlasBundle = {
  region: 'kanto',
  trackGraph: kantoTrackGraph,
  throughServices: kantoThroughServices,
  pmtilesUrl: '/tiles/kanto-rail.pmtiles',
  verticalLayer: kantoVerticalLayer,
  verticalPmtilesUrl: '/tiles/kanto-rail-vertical.odbl.pmtiles',
};
