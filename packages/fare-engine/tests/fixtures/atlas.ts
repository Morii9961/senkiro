import type { TrackGraph } from '@senkiro/contracts';
import atlas from './atlas.json';

// JSON does not retain the LonLat tuple or SkId template literal types.
export const dataset = atlas as unknown as TrackGraph;
