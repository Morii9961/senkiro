/**
 * Public exports for SENKIRO Atlas v2 City Environment & Streetscape Showcase (`atlas-city`).
 */

export {
  buildTokyoAirportComplexes,
  type AirportComplexesHandle,
} from './airportComplexes.js';
export { CityLayerV2, createCityLayerAdapter, type CityLayerV2Options } from './CityLayerV2.js';
export {
  detectSurfaceIntersections,
  getEffectiveRiverWidth,
  isSurfaceRiverVisible,
  pointInPoly,
  showcaseZoneBounds,
  StreetClearanceGrid,
  TERRAIN_ELEVATION_LEVELS,
  type BoundingBoxXZ,
  type DetectedIntersection,
  type TerrainLayerSpec,
} from './cityGeometryHelpers.js';
export {
  buildImperialPalaceModel,
  IMPERIAL_PALACE_EXCLUSION_POLY,
  IMPERIAL_PALACE_INNER_POLY,
  IMPERIAL_PALACE_MOAT_POLYS,
  IMPERIAL_PALACE_PLATEAU_Y,
  isPointInImperialExclusion,
  isPointInImperialMoat,
  isPointOnImperialPlateau,
  type ImperialPalaceHandle,
} from './imperialPalace.js';
export {
  buildTokyoStreetLightNetwork,
  type StreetLightNetworkHandle,
} from './streetLights.js';
export { ShibuyaStreetscapeLayer } from './streetscapeGenerator.js';
export {
  getStreetscapeForCutaway,
  registerStreetscapeForCutaway,
  SHIBUYA_SHOWCASE_ZONE,
  type CityShowcaseZone,
  type StreetscapeLodTier,
} from './streetscapeRegistry.js';
export { SkyEnvironmentSystem } from '../environment/skyEnvironment.js';
export {
  CityChunkManager,
  type BuildingProvenanceCounts,
} from '../generators/buildingGenerator.js';
export { CityTerrainLayer } from '../generators/cityTerrainGenerator.js';
export {
  FacadeMaterialLibrary,
  getBuildingTintHex,
  selectFacadeVariant,
  type BuildingFacadeVariant,
} from '../materials/facadeLibrary.js';
