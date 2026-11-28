import type { RegionalAtlasBundle } from '../types.ts';
import {
  kansaiThroughServices,
  kansaiTrackGraph,
  kansaiUnalignedRecords,
} from './generated/kansai-meta.ts';

export { kansaiThroughServices, kansaiTrackGraph, kansaiUnalignedRecords };

export const kansaiAtlasBundle: RegionalAtlasBundle = {
  region: 'kansai',
  trackGraph: kansaiTrackGraph,
  throughServices: kansaiThroughServices,
  pmtilesUrl: '/tiles/kansai-rail.pmtiles',
};
