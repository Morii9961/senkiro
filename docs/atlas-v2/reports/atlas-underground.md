# Progress Report — atlas-underground (`underground_railway_geometry_system`)

- **Status**: `READY_FOR_INTEGRATION`
- **Base Contract Commit**: `b30c00d` (`integration/atlas-v2`, merged cleanly via `ee81545`)
- **Latest Branch Commit**: `underground_railway_geometry_system` (HEAD)
- **Updated At**: 2026-11-22 22:53

## Completed Deliverables

1. **Canonical `UndergroundLayerAdapter` Implementation (`src/three/generators/tunnelGenerator.ts` & `src/three/underground/index.ts`)**:
   - `TunnelAndStationLayer` now directly implements Session 0's frozen `UndergroundLayerAdapter` (`src/three/contracts/adapters.ts`) and embeds `UndergroundRailwaySystem` (including its `TunnelLightingSystem` camera-following 6-`PointLight` pool) inside `this.group`, keeping 100% backward compatibility with `Metropolitan3DScene.ts` while also exporting `createUndergroundLayerAdapter()`.
   - Supports all 4 frozen `TunnelCutawayStyle` modes via `setCutawayState(state)`:
     - `solid_shell`: opaque dual-surface concrete lining (`FrontSide` inner + `FrontSide` outer)
     - `translucent_shell`: translucent outer shell (`opacity: 0.36`) for overhead cutaway visibility of moving virtual trains
     - `section_cutaway`: opens tunnel & station roofs (`tunnel_roof_open`) in O(1) without rebuilding geometry
     - `interior_view`: full opaque inner lining + interior lighting pool + subterranean depth attenuation shader
   - Exposes `getUndergroundAPI(): UndergroundRailwayQueryAPI` for Camera & Environment Sessions: enterable segments, curated interior viewpoints, arc-length `sampleTrackFrame(segmentId, distM, trackIndex)`, `projectPointToNearestTunnel()`, `getClearanceConstraint()`, `getStationCavernBounds()`, `getPortalCutoutHints()` (48 portals), and `setSectionCutState()`.

2. **True Dual-Surface Solid Tunnels, Enlarged Underground Station Caverns & Neutral Realistic Track**:
   - Supports circular shield bores (`shield_single` / `shield_double`), rectangular cut-and-cover concrete boxes (`box_single` / `box_double`), enlarged underground station caverns (`station_side` / `station_island`), smooth 24-vertex morphing `transition_collar` sections, and open hollow concrete portal headwalls with retaining wing walls.
   - Strictly complies with `TRACK_CLEARANCE_STANDARDS` (`src/contracts/atlasV2.ts`): `slabRailHeadOffsetM = 0.48m`, `conventionalHalfSpacingM = 1.85m`, `shinkansenHalfSpacingM = 2.15m`, `linearMetroHalfSpacingM = 1.75m`, `tunnelPortalThresholdY = -2.4m`, and minimum interior clearance envelopes for conventional (`>= 4.6m / >= 5.2m`), Shinkansen (`>= 5.6m / >= 5.8m`), and linear metro (`>= 4.2m / >= 4.2m`).
   - Realistic neutral underground track & wayside equipment: concrete slab track with drainage channel, 1435mm/1067mm steel rails, instanced short sleepers, inspection walkways + handrails, wall cable troughs, third rail + protective shroud (Ginza/Marunouchi) vs rigid overhead conductor rail + hangers (Fukutoshin/Hanzomon/Oedo), luminaires, center columns, wayside signals & emergency signs.
   - Operating line colors are strictly decoupled into `LineOverlayHighlightLayer` (default OFF).
   - `RailTrackLayer` (`src/three/generators/railTrackGenerator.ts`) cleanly clips above-ground track geometry at `y = -2.4m` (exact linear interpolation at portals) so surface/viaduct tracks meet underground tracks with zero Z-fighting.
   - GIS endpoint hairpin overshoot pruning + Euclidean station-cavern exclusion trimming prevents running tunnel bores from ever piercing station caverns (verified visually & by unit test at Omotesando).

3. **Real Browser Visual Verification & Performance Telemetry (Pilot Corridors)**:
   - Verified 7 real Headless Chrome WebGL screenshots (`1440×900`, 0 console/page errors) across Ginza Line (`渋谷 → 表参道 → 外苑前 → 青山一丁目`), Fukutoshin Line circular shield (`渋谷 → 明治神宮前`, `L-3 -30m`), Marunouchi Line (`東京 → 大手町`), Omotesando widened station cavern, Shibuya open portal, and roof cutaway + line overlay (stored in `src/three/underground/screenshots/*.png`).
   - Per-segment chunking (303 `TunnelChunk`s + 301 `StationCavern`s) with frustum + distance culling:
     - Surface mode: `0` visible underground chunks (`DC = 154`)
     - Enclosed interior mode: Draw Calls cut by `60%–83%` (`1,673 -> 244–371 DC`, `6` active PointLights, zero per-frame geometry rebuilds).

## Files Created / Modified (Strictly within `atlas-underground` Exclusive Write Boundary)

- `labs/a-tokyo-atlas-fare/src/three/underground/index.ts`
- `labs/a-tokyo-atlas-fare/src/three/underground/UndergroundRailwaySystem.ts`
- `labs/a-tokyo-atlas-fare/src/three/underground/tunnelMaterials.ts`
- `labs/a-tokyo-atlas-fare/src/three/underground/tunnelShellBuilder.ts`
- `labs/a-tokyo-atlas-fare/src/three/underground/undergroundTrackBuilder.ts`
- `labs/a-tokyo-atlas-fare/src/three/underground/tunnelLightingSystem.ts`
- `labs/a-tokyo-atlas-fare/src/three/underground/lineOverlayHighlight.ts`
- `labs/a-tokyo-atlas-fare/src/three/underground/domain/tunnelTypes.ts`
- `labs/a-tokyo-atlas-fare/src/three/underground/domain/tunnelProfileSpecs.ts`
- `labs/a-tokyo-atlas-fare/src/three/underground/domain/tunnelCenterlineBuilder.ts`
- `labs/a-tokyo-atlas-fare/src/three/underground/screenshots/*.png` (7 real WebGL verification screenshots)
- `labs/a-tokyo-atlas-fare/src/three/generators/tunnelGenerator.ts`
- `labs/a-tokyo-atlas-fare/src/three/generators/railTrackGenerator.ts`
- `labs/a-tokyo-atlas-fare/tests/unit/undergroundGeometry.test.ts`
- `docs/atlas-v2/reports/atlas-underground.md`

## Verification Evidence (Actually Run)

- `npm --prefix labs/a-tokyo-atlas-fare run build` (`tsc --noEmit && vite build`): **PASS** (`0 errors`)
- `npm --prefix labs/a-tokyo-atlas-fare test` (`vitest run`): **PASS** (`8 files, 70/70 tests passed`, including `undergroundGeometry.test.ts` 7/7 + `contractsV2.test.ts` 3/3 + `simulationRollingStockIntegration.test.ts`)

## Contract / Integration Requests (for Lead Architect / Session 0)

- **Zero merge conflicts & zero contract changes required** — `TunnelAndStationLayer` already works as a drop-in replacement in `Metropolitan3DScene.ts` out of the box!
- **Recommended 3-line wiring in `Metropolitan3DScene.ts` (owned by Session 0)** to unlock full `TunnelCutawayStyle`, camera-following PointLights, and subterranean lighting balance:
  1. In `animate()`: change `this.tunnelLayer.updateLod(camDist);` → `this.tunnelLayer.updateLod(camDist, this.camera.position);`
  2. In `setUndergroundCutawayStyle(style)` & `applyFilters()`: call `this.tunnelLayer.setCutawayState({ ...cutawayState, tunnelCutawayStyle: this.tunnelCutawayStyle });`
  3. Optional: expose `this.tunnelLayer.getUndergroundAPI()` on `AtlasV2SceneApi` for `atlas-camera-ui` (`getCuratedViewpoints()`, `getClearanceConstraint()`, `projectPointToNearestTunnel()`) and `atlas-city` (`getPortalCutoutHints()`).

## Known Limitations & Honesty Notes

- All underground depths continue to come from `elevationSolver.ts` schematic tiers (`L-1..-4`) and are explicitly tagged `depthReliability: 'schematic'` everywhere (never represented as surveyed civil as-built meters).
- Portal surface cutout footprints (`getPortalCutoutHints()`) are exported ready for `atlas-city` terrain integration so descending portal ramps do not rely on radial cutaway to open the ground plane.
