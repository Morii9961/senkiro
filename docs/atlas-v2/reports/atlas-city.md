# Progress Report — atlas-city (`tokyo_environment_upgrade`)

- **Status**: `READY_FOR_INTEGRATION`
- **Base Contract Commit**: `b30c00d` (`integration/atlas-v2` — frozen architecture, contracts, Wave 1 `atlas-simulation`, Wave 2 `atlas-rollingstock`, and `E2E_PORT` test harness)
- **Latest Branch Commit**: `tokyo_environment_upgrade` (HEAD)
- **Updated At**: 2026-11-23 07:28

## Completed Deliverables

1. **Real-OSM City Geometry & Architectural Morphology (`src/three/generators/buildingGenerator.ts`)**:
   - Upgraded `CityChunkManager` LOD0 building generation with grounded `-1.25m` foundation skirts (`foundationPlinth` + dark sub-grade vertex AO shading) matching `SURFACE_ELEVATION_LAYERS.baseGroundY`, eliminating floating buildings across all surface terrain tiers.
   - Added street-level `groundStorefront` retail/lobby plinths, podium/shaft/crown setback articulation, gable pitched roofs (`makeGableRoofRaw`) on compact low-rise residential structures, rooftop HVAC equipment clusters, and per-building horizontal UV phase offsets.
   - Merged multi-part geometry per distinct material inside each of the 13 procedural Tokyo landmarks (`buildProceduralLandmark`), cutting landmark draw calls roughly in half while keeping exact world placement and silhouettes intact.
   - Gated LOD0 activation on camera distance (`allowLod0 = camDist < 2400`) in `updateForCamera` so distant metropolitan overviews remain on `LOD1` `InstancedMesh` batches (`L0:0/L1:38-39`) without unnecessary detail draw calls or synchronous LOD0 builds, while hub close-ups and mid views keep full LOD0 morphology (`lod0EnterRadius = 1550m`, `lod0ExitRadius = 2000m`).
   - Added explicit `BuildingProvenanceCounts` (`hb = 'o'` explicit OSM height, `'l'` OSM levels, `'i'` estimated height, `'p'` schematic infill) and `landmarkCount` reporting in `getStats()`.

2. **Procedural PBR Architectural Material Library (`src/three/materials/facadeLibrary.ts`)**:
   - Expanded from uniform curtain walls to **15 distinct procedural PBR material families** (`officeGlassCool`, `officeGlassWarm`, `commercialStone`, `commercialMetal`, `commercialTile`, `concreteModern`, `residentialBalcony`, `residentialPlaster`, `groundStorefront`, `stationCivic`, `heritageBrick`, `roof`, `roofPitched`, `roofEquipment`, `foundationPlinth`), each with procedural albedo, roughness, bump, and day/night emissive `CanvasTexture` maps plus `selectFacadeVariant` and expanded day/night tint palettes.

3. **Terrain Winding Fix, Elevation Stratification & Watertight Road Network (`src/three/generators/cityTerrainGenerator.ts`, `src/three/city/cityGeometryHelpers.ts`, `src/three/city/surfaceTextures.ts`)**:
   - Fixed inverted triangle winding in `buildRibbonGeometryXZ` (`+Y` normals verified), restoring all OSM surface roads, sidewalks, rivers, quays, and railway corridors with `THREE.FrontSide` rendering and zero back-face culling.
   - Aligned `TERRAIN_ELEVATION_LEVELS` strictly to frozen `SURFACE_ELEVATION_LAYERS` (`-1.25m` base ground up to `+0.16m` trunk roads, `+0.175m` intersection aprons, and `+0.192m` crosswalks — strictly ordered and safely below `+0.32m` surface railway roadbeds) with monotonic polygon-offset factors and strictly opaque (`transparent: false, depthWrite: true`) surface rendering for zero Z-fighting.
   - Generated 4-tier Japanese asphalt road textures (`trunk`, `primary`, `secondary`, `tertiary`), unmarked intersection aprons + watertight road-endpoint caps, paved sidewalks & station plazas, culverted river exclusion (`isSurfaceRiverVisible` filters `暗渠`) & river width normalization (`getEffectiveRiverWidth`), and `128x128` procedural water ripple maps (`createWaterTextureSet`).
   - Added `CityTerrainLayer.elevationSampler` (`datumKind: 'flat_datum'`) and embedded `ShibuyaStreetscapeLayer` registered via `registerStreetscapeForCutaway`.

4. **Shibuya 800m × 800m Showcase Streetscape & Tokyo Park Vegetation (`src/three/city/streetscapeGenerator.ts`, `src/three/city/streetscapeRegistry.ts`)**:
   - Built `SHIBUYA_SHOWCASE_ZONE` (`centerX: -5920, centerZ: 2578, halfSizeM: 450`) from real OSM roads, intersections (including Shibuya Scramble diagonals via `detectSurfaceIntersections`), parks, plazas, and loaded OSM building footprints deconflicted via `StreetClearanceGrid`.
   - Batched crosswalks + raised curbs into merged `BufferGeometry` layers and streetlights, traffic signals, guardrails, bollards, benches, shelters, Miyashita Park & street trees, and Tokyo-wide major park trees into `InstancedMesh` layers with 3-tier camera distance LOD (`near`, `mid`, `far`) + hysteresis and GPU radial cutaway support (`injectRadialCutaway`).
   - Wired `CityTerrainLayer` ↔ `CityChunkManager` coordination through per-scene `WeakMap<CutawayUniforms, ShibuyaStreetscapeLayer>` (`streetscapeRegistry.ts`), requiring zero edits to `Metropolitan3DScene.ts`.

5. **Atmospheric Sky & Day/Dusk/Night Presets (`src/three/environment/skyEnvironment.ts`)**:
   - Tuned sun vector `(0.62, 0.56, 0.54)`, procedural PMREM studio-sky environment reflections, and added `CityLightingPreset` (`'day' | 'dusk' | 'night'`) with `DUSK_PALETTE` while keeping boolean `isDark` call signatures backward-compatible.

6. **Frozen `CityLayerAdapter` Implementation (`src/three/city/CityLayerV2.ts`, `src/three/city/index.ts`)**:
   - Exported `CityLayerV2` and `createCityLayerAdapter` implementing `CityLayerAdapter` (`src/three/contracts/adapters.ts`): exposes `group`, `landmarksGroup`, `elevationSampler`, `setTheme(isDark, preset?)`, `setUndergroundCutaway(state)`, `updateForCamera(camera, focusTarget, dtSec)`, `getStats(): CityRenderStats`, and `dispose()`.

## Files Created / Modified (Strictly within `atlas-city` Exclusive Write Boundary)

- `labs/a-tokyo-atlas-fare/src/three/city/CityLayerV2.ts`
- `labs/a-tokyo-atlas-fare/src/three/city/cityGeometryHelpers.ts`
- `labs/a-tokyo-atlas-fare/src/three/city/streetscapeGenerator.ts`
- `labs/a-tokyo-atlas-fare/src/three/city/streetscapeRegistry.ts`
- `labs/a-tokyo-atlas-fare/src/three/city/surfaceTextures.ts`
- `labs/a-tokyo-atlas-fare/src/three/city/index.ts`
- `labs/a-tokyo-atlas-fare/src/three/generators/buildingGenerator.ts`
- `labs/a-tokyo-atlas-fare/src/three/generators/cityTerrainGenerator.ts`
- `labs/a-tokyo-atlas-fare/src/three/materials/facadeLibrary.ts`
- `labs/a-tokyo-atlas-fare/src/three/environment/skyEnvironment.ts`
- `labs/a-tokyo-atlas-fare/tests/unit/cityEnvironment.test.ts`
- `labs/a-tokyo-atlas-fare/src/three/city/screenshots/before/*.png` + `metrics.json` (9 baseline captures on `6001e82`)
- `labs/a-tokyo-atlas-fare/src/three/city/screenshots/after/*.png` + `metrics.json` (9 post-merge captures with active virtual trains)
- `docs/atlas-v2/reports/atlas-city.md`

## Verification Evidence (Actually Run)

- `npm --prefix labs/a-tokyo-atlas-fare run build` (`tsc --noEmit && vite build`): **PASS** (`0` TypeScript errors, 1,700 modules transformed, built in `8.25s`).
- `npm --prefix labs/a-tokyo-atlas-fare test` (`vitest run`): **PASS** (`8 test files, 69/69 tests passed` — `fareEngine.test.ts` 26/26, `alignmentAndData.test.ts` 9/9, `contractsV2.test.ts` 3/3, `rollingstock.test.ts` 6/6, `simulationRollingStockIntegration.test.ts` 1/1, `elevationSolver.test.ts` 7/7, `simulationEngine.test.ts` 11/11, `cityEnvironment.test.ts` 6/6).
- `E2E_PORT=18476 npm --prefix labs/a-tokyo-atlas-fare run test:e2e`: **11/12 passed** (`Test 12` failed at `tests/e2e/atlas-fare.spec.ts:407` with `flyMoved = 0`; see upstream focus note in Contract/Integration Requests below).
- **Playwright Chromium + SwiftShader CPU WebGL (`1440×900`) Visual & Performance Benchmarks**:
  - Console errors / Page errors: **0 / 0** in both `eval-city-v2.mjs` (`after`) and `scripts/eval-v2.mjs` (`atlas-city`).
  - Camera drag stability (`eval-city-v2.mjs` `dragStability`): **8/8 steps non-blank** (`allNonBlank: true`).
  - Internal scene urban load (`debugMetrics.loadTimeMs`): `2,754 ms` (`eval-city-v2`) / `3,146 ms` (`eval-v2`); full Playwright page load + 2.6s wait (`initialLoadMs`): `8,687 ms` (`eval-city-v2`) / `9,007 ms` (`eval-v2`) in CPU SwiftShader (note: Baseline before Wave 1+2 trains was `6,976 ms`).

| View (`eval-city-v2.mjs` / `eval-v2.mjs`) | Baseline Before (`6001e82`, 0 trains) | Post-Merge After (`tokyo_environment_upgrade` + `b30c00d`, **108 trains / 648 cars**) | `ACCEPTANCE.md` §3 Target |
| --- | --- | --- | --- |
| `overview-day` / `01-overview-day` | `2.0 FPS` · `DC 141` · `Tris 446,889` (`L0:4/L1:37`) | `1.4–1.7 FPS` · `DC 361 / 354` · `Tris 552,780 / 510,300` (`L0:0/L1:38`) | Tris `<= 750k` PASS (`DC` note below) |
| `shibuya-surface-day` / `02-shibuya-surface` | `1.3 FPS` · `DC 203` · `Tris 1,615,062` | `0.9 FPS` · `DC 308 / 310` · `Tris 2,090,538 / 2,091,842` | `DC <= 320` PASS |
| `shibuya-street-day` | `1.3 FPS` · `DC 205` · `Tris 1,594,801` | `0.9 FPS` · `DC 300` · `Tris 2,063,418` | `DC <= 320` PASS |
| `shibuya-scramble-closeup` | `1.4 FPS` · `DC 199` · `Tris 1,581,991` | `1.0 FPS` · `DC 294` · `Tris 2,050,608` | `DC <= 320` PASS |
| `shibuya-street-night` | `1.3 FPS` · `DC 205` · `Tris 1,594,801` | `1.0 FPS` · `DC 300` · `Tris 2,062,650` | `DC <= 320` PASS |
| `shibuya-mid-lod` | `1.4 FPS` · `DC 220` · `Tris 1,658,077` | `1.0 FPS` · `DC 311` · `Tris 2,097,506` | `DC <= 320` PASS |
| `shibuya-underground` / `03-shibuya-underground` | `1.0 FPS` · `DC 399` · `Tris 2,478,237` | `0.8 / 0.7 FPS` · `DC 480 / 496` · `Tris 2,920,002 / 2,948,718` | `DC <= 500` PASS |
| `shinjuku-surface-day` / `04-shinjuku-surface` | `1.4 FPS` · `DC 172` · `Tris 1,512,128` | `1.1 / 0.9 FPS` · `DC 282 / 283` · `Tris 1,845,456 / 1,845,040` | `DC <= 320` PASS |
| `05-shinjuku-underground` | — | `0.7 FPS` · `DC 416` · `Tris 2,722,320` | `DC <= 500` PASS |
| `tokyo-surface-day` | `1.8 FPS` · `DC 165` · `Tris 1,245,250` | `1.3 FPS` · `DC 300` · `Tris 1,609,891` | `DC <= 320` PASS |
| `06-tokyo-otemachi-underground` | — | `0.8 FPS` · `DC 492` · `Tris 2,684,267` | `DC <= 500` PASS |
| `07-shinjuku-night` | — | `1.1 FPS` · `DC 278` · `Tris 1,841,768` | `DC <= 320` PASS |

- **Visual Screenshot Audit**: Inspected `src/three/city/screenshots/after/{overview-day,shibuya-surface-day,shibuya-street-day,shibuya-scramble-closeup,shibuya-street-night,shibuya-underground}.png`. Confirmed crisp Shibuya Scramble diagonals & crosswalks, continuous dark asphalt lane-marked roads, raised curbs, Miyashita Park & street trees, varied PBR facades with podiums/setbacks/gable roofs/HVAC details/ground storefronts, warm night emissives, clean GPU radial cutaway with translucent landmarks, and zero visible Z-fighting or clipping against surface roads/railbeds.

## Contract / Integration Requests (for Lead Architect / Session 0 & Sibling Teams)

1. **Optional `CityLayerV2` Adapter Adoption (`Metropolitan3DScene.ts`)**:
   - Existing `CityTerrainLayer` + `CityChunkManager` + `SkyEnvironmentSystem` already auto-coordinate `ShibuyaStreetscapeLayer` with zero edits needed in `Metropolitan3DScene.ts`. When ready to route through the unified v2 adapter, `createCityLayerAdapter` / `CityLayerV2` is exported from `src/three/city/index.ts`.
2. **Optional Adaptive Texel-Snapped Directional Shadow Frustum (`Metropolitan3DScene.ts`)**:
   - Tightening & texel-snapping `sunLight.shadow.camera` around `focusTarget` dynamically in `Metropolitan3DScene.ts` will further crisp up building & tree shadows during close-up Shibuya inspection.
3. **Overview Draw Call Attribution (`atlas-rollingstock` / Session 0)**:
   - On integrated `overview-day`, total DC is `354–361` (vs `<= 220` budget) even with `atlas-city` at `lod0Chunks: 0` and merged landmarks, because Wave 1+2's 108 active trains (`648` cars) render un-instanced multi-car draw calls at metropolitan overview distance (baseline `6001e82` with 0 trains was `DC 141`). Enabling far-overview instancing or distance culling in `RollingStockRendererV2` will drop integrated overview DC cleanly below `220`.
4. **E2E Test 12 Upstream `<select>` Focus Finding (`atlas-camera-ui` / Session 0)**:
   - In `tests/e2e/atlas-fare.spec.ts:381`, `selectOption('fast')` leaves focus on `<select data-testid="free-speed-select">` (`src/ui/Tokyo3DCanvas.tsx:318-324`). `SpatialCameraController.handleKeyDown` (`src/three/cameraController.ts:375,431`) ignores keyboard navigation whenever `document.activeElement.tagName === 'SELECT'`, yielding `flyMoved === 0` at `atlas-fare.spec.ts:407`. Blurring `<select>` inside `onChange` (`e.currentTarget.blur()`) or clicking the canvas before `KeyW`/`KeyE` in the E2E spec fixes Test 12.
5. **Optional Provenance Registry Entry (`SOURCES.md` / `data/sources.json`)**:
   - Register `src-procedural-city-pbr` in `SOURCES.md` / `data/sources.json` if Session 0 wants explicit catalog tracking for the original procedural PBR facade & surface `CanvasTexture` generators.

## Known Limitations & Honesty Notes

- **ODbL 1.0 Isolation**: Real OSM building footprints, roads, water polygons, rivers, plazas, and parks (`public/data/urban-chunks/*`) remain strictly ODbL 1.0 isolated from CC-BY `AtlasDataset` and the JR Fare Engine (`alignmentAndData.test.ts` 9/9 green).
- **Height & Infill Provenance**: Building heights explicitly track `hb = 'o'` (explicit OSM height), `'l'` (OSM `building:levels`), `'i'` (estimated height), and `'p'` (schematic infill); no random geometry replaces real OSM footprints and no live/real-time external API data is fabricated.
- **Procedural Assets**: All 15 building PBR facade material sets and 7 terrain/road/water `CanvasTexture` sets are 100% original procedural Canvas2D code under the repository's MIT license.
- **Streetscape Scope & Terrain Datum**: High-detail streetscape furniture/crosswalks/curbs focus on `SHIBUYA_SHOWCASE_ZONE` (~800m × 800m + 50m blend), while Tokyo-wide coverage provides parks vegetation, 4-tier lane-marked roads, rivers/Tokyo Bay, and chunked LOD0/LOD1 OSM buildings on a flat ground datum (`datumKind: 'flat_datum'`, DEM elevation left as future enhancement).
