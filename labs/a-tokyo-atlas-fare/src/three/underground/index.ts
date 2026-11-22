/**
 * SENKIRO Tokyo Atlas 3D v2.0 — Underground Railway Geometry & Tunnel System Public Entry.
 *
 * Exports the canonical `UndergroundLayerAdapter` factory (`createUndergroundLayerAdapter`)
 * implementing `src/three/contracts/adapters.ts`, plus the underlying `UndergroundRailwaySystem`
 * and pure-TS domain geometry/clearance types for Camera & Virtual Train integration.
 */

import type * as THREE from 'three';
import type { SolvedRailwayNetwork3D } from '../../domain/elevationSolver.js';
import type { UndergroundLayerAdapter } from '../contracts/adapters.js';
import { TunnelAndStationLayer } from '../generators/tunnelGenerator.js';

export { TunnelAndStationLayer } from '../generators/tunnelGenerator.js';
export { UndergroundRailwaySystem } from './UndergroundRailwaySystem.js';
export { LineOverlayHighlightLayer } from './lineOverlayHighlight.js';
export { TunnelLightingSystem } from './tunnelLightingSystem.js';
export { TunnelMaterialLibrary } from './tunnelMaterials.js';
export * from './domain/tunnelTypes.js';
export * from './domain/tunnelProfileSpecs.js';
export * from './domain/tunnelCenterlineBuilder.js';

export function createUndergroundLayerAdapter(
  solved: SolvedRailwayNetwork3D,
  clipPlanes: THREE.Plane[],
): UndergroundLayerAdapter & TunnelAndStationLayer {
  return new TunnelAndStationLayer(solved, clipPlanes);
}
