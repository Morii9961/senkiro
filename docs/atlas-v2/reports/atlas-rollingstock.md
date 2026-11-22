# Progress Report — atlas-rollingstock (`japanese_rolling_stock_assets`)

- **Status**: `READY_FOR_INTEGRATION`
- **Base Contract Commit**: `166cf17` (`integration/atlas-v2` — frozen architecture, contracts, `PhysicalTrackGraph`, scene plugin facade & `E2E_PORT` config)
- **Latest Branch Commit**: `japanese_rolling_stock_assets` (HEAD)
- **Updated At**: 2026-11-22 19:18

## Completed Deliverables

1. **Canonical v2.0 `RollingStockRendererAdapter` Implementation (`src/three/rollingstock/v2Adapter.ts` & `src/three/rollingstock/index.ts`)**:
   - Exported `RollingStockRendererV2` and factory `createRollingStockRenderer()` from `src/three/rollingstock/index.ts` implementing `RollingStockRendererAdapter` (`src/three/contracts/adapters.ts`).
   - Supports all **12 Tokyo models** in `ROLLING_STOCK_CATALOG` (`jr-e235-0`, `metro-1000`, `metro-17000`, `jr-e233-0`, `jr-e233-3000`, `shinkansen-n700s`, `shinkansen-e5`, `metro-2000`, `metro-16000`, `metro-18000`, `toei-12-600`, `private-commuter-generic`).
   - Enforces Session 0's **Mandatory Vehicle Local Axes (`CONTRACTS.md` §2.3)**:
     - Local `+Z` = Forward (front cab nose at `+Z`, tail at `-Z`).
     - Local `+Y` = Up.
     - Local `y = 0.0` = Bottom of wheel tread (flush on rail head, verified by bounding-box unit test `|bb.min.y| < 1e-3`).
     - Euler order `'YXZ'` (`carMesh.rotation.set(cp.pitchRad, cp.yawRad, cp.rollRad, 'YXZ')`).
   - Enforces **`group.scale.y === 1.0` invariant** at all times so `verticalExaggeration` (`1.0× .. 2.5×`) never stretches car bodies vertically.
   - **Single-Draw-Call Vertex-Color Baked Templates (`bakeObject3DToVertexColorGeometry`)**: Bakes each `(modelId, role, lod, doorOpen)` multi-mesh car hierarchy into a cached single vertex-colored `THREE.BufferGeometry`, reducing per-car GPU draw calls from ~70 to **1 Draw Call per car** while preserving 100% of the 3D geometry and livery colors.
   - Implements 3-tier camera-distance LOD (`high` `< 380m`, `medium` `380m..1350m`, `low` `>= 1350m`), dynamic open/closed sliding door states during station dwell, night-mode cabin/emissive lighting (`isDark`), selection highlighting (`setSelectedTrain`), raycast picking (`interactiveTrainMeshes` + `resolveTrainHit`), and telemetry (`getStats(): RollingStockRenderStats`).

2. **Three Flagship High-Fidelity Japanese Rolling Stock Series (Zero Generic Box Recoloring)**:
   - **JR East E235-0 Series — Yamanote Line (`jr-e235-0` / `jr-east-e235-0`, `builders/e235Builder.ts`)**:
     - Official specs: `20.00m` coupler pitch (lead body `19.57m`, mid `19.50m`), **`2.950m` wide-body barrel cross-section (`wide_body_barrel`)**, `3.620m` roof height, `1,067mm` narrow gauge, **4 double-leaf doors/side**, 1,500V DC overhead catenary, 11-car official consist (`6M5T`).
     - Visual hallmarks: Ken Okuyama "Flat Digital Frame" black glass front mask with rounded Uguisu Green (`#80C241`) outer bezel, high-mounted upper-corner rectangular LED headlights, upper full-color LED destination sign, silver-white crash-energy skirt (`排障器`), Sustina flush stainless body with **4 vertical Uguisu Green graduated dot-matrix door bands per side** (no horizontal waist band) + green eave stripe, DT80/TR264 bogies, 2 AU737 roof HVAC pods, PS33H single-arm pantograph.
   - **Tokyo Metro 1000 Series — Ginza Line (`metro-1000` / `tokyo-metro-1000`, `builders/metro1000Builder.ts`)**:
     - Official specs: **`16.00m` compact coupler pitch** (lead body `15.52m`, mid `15.40m`), **`2.550m` flat-sided subway cross-section (`compact_subway_flat`)**, `3.465m` roof height, **`1,435mm` standard gauge**, **3 double-leaf doors/side**, **600V DC third-rail collection (zero roof pantographs)**, 6-car official consist (`6M`).
     - Visual hallmarks: 1927 Type 1000 retro-modern tribute with full Lemon-Yellow (`#F5B100`) body, classic Maroon/Reddish-Brown (`#683024`) arched roof & overhanging front brow, Ginza Orange (`#FF8C00`) + White + Dark Brown horizontal waist belt, symmetrical front with central swing-out emergency door & vertical decorative trim ribs, lower vertically-stacked dual round headlamp/taillamp clusters, and standard-gauge SC101 steerable bogies with yellow **third-rail collector shoes (`集電靴`)**.
   - **Tokyo Metro 17000 Series — Yurakucho & Fukutoshin Lines (`metro-17000` / `tokyo-metro-17000`, `builders/metro17000Builder.ts`)**:
     - Official specs: `20.00m` coupler pitch (lead body `19.63m`, mid `19.50m`), **`2.800m` Hitachi A-train tapered double-skin aluminum profile (`atrain_tapered`)**, `3.635m` roof height, `1,067mm` narrow gauge, **4 double-leaf doors/side**, 1,500V DC overhead catenary, 10-car (`4M6T`) and 8-car (`4M4T`) official consists.
     - Visual hallmarks: Streamlined backward-sloped 3D curved black glass front dome, assistant-side offset emergency door with circular porthole window, signature **twin circular ring LED headlights (`丸目ヘッドライト`)** inheriting the 7000/10000 series lineage, sculpted Champagne-Gold (`#C5A467`) & Espresso-Brown (`#8F5126`) front skirt, continuous horizontal **Yurakucho Gold (`#C8A96E`) + Fukutoshin Brown (`#8F5126`) dual waist & eave belts**, circular end accent windows, FS779 bogies, PT71 single-arm pantograph.

3. **Standalone Consist Factory, 3D Curve Articulation Solver, Khronos glTF 2.0 (`.glb`) Assets & Real Screenshots**:
   - `RollingStockFactory.ts` & `domain/articulation.ts`: Standalone multi-car consist controller supporting smooth door opening/closing (`left` / `right` / `both`), travel direction reversal with automatic headlight/taillight swapping, wheel rotation, and 3D curve bogie-chord articulation.
   - `glbExporterAndCache.ts` & `assets/*.glb`: 9 pre-built, Khronos-compliant glTF 2.0 binary `.glb` assets (`116–153 KB` per car, `388–430 KB` per 3-car consist) + `assets/manifest.json` + `assets/rolling-stock-catalog.json`, verified via Three.js `GLTFLoader`.
   - `screenshots/*.png`: 8 real running WebGL verification screenshots (`1440×900`) covering 3-series front lineup, side proportions, 150m+ far-distance distinctness, E235-0 open doors close-up, Metro 1000 third-rail close-up, Metro 17000 S-curve close-up, night mode with reversed travel direction lights, and multi-car S-curve overview.

## Files Created / Modified (Strictly within `atlas-rollingstock` Exclusive Write Boundary)

- `labs/a-tokyo-atlas-fare/src/three/rollingstock/index.ts`
- `labs/a-tokyo-atlas-fare/src/three/rollingstock/v2Adapter.ts`
- `labs/a-tokyo-atlas-fare/src/three/rollingstock/materials.ts`
- `labs/a-tokyo-atlas-fare/src/three/rollingstock/components.ts`
- `labs/a-tokyo-atlas-fare/src/three/rollingstock/RollingStockFactory.ts`
- `labs/a-tokyo-atlas-fare/src/three/rollingstock/glbExporterAndCache.ts`
- `labs/a-tokyo-atlas-fare/src/three/rollingstock/RollingStockPreviewScene.ts`
- `labs/a-tokyo-atlas-fare/src/three/rollingstock/builders/e235Builder.ts`
- `labs/a-tokyo-atlas-fare/src/three/rollingstock/builders/metro1000Builder.ts`
- `labs/a-tokyo-atlas-fare/src/three/rollingstock/builders/metro17000Builder.ts`
- `labs/a-tokyo-atlas-fare/src/three/rollingstock/domain/index.ts`
- `labs/a-tokyo-atlas-fare/src/three/rollingstock/domain/types.ts`
- `labs/a-tokyo-atlas-fare/src/three/rollingstock/domain/specs.ts`
- `labs/a-tokyo-atlas-fare/src/three/rollingstock/domain/articulation.ts`
- `labs/a-tokyo-atlas-fare/src/three/rollingstock/assets/manifest.json`
- `labs/a-tokyo-atlas-fare/src/three/rollingstock/assets/rolling-stock-catalog.json`
- `labs/a-tokyo-atlas-fare/src/three/rollingstock/assets/*.glb` (9 binary glTF 2.0 files)
- `labs/a-tokyo-atlas-fare/src/three/rollingstock/screenshots/*.png` (8 real running WebGL screenshots)
- `labs/a-tokyo-atlas-fare/tests/unit/rollingstock.test.ts`
- `docs/atlas-v2/reports/atlas-rollingstock.md`

## Verification Evidence (Actually Run)

- `npm --prefix labs/a-tokyo-atlas-fare run build` (`tsc --noEmit && vite build`): **PASS** (`0 errors`, `dist/` built cleanly)
- `npm --prefix labs/a-tokyo-atlas-fare test` (`vitest run`): **PASS** (`5 test files, 51/51 tests passed`: `fareEngine.test.ts` 26/26, `alignmentAndData.test.ts` 9/9, `contractsV2.test.ts` 3/3, `elevationSolver.test.ts` 7/7, `rollingstock.test.ts` 6/6)

## Contract / Integration Requests (for Lead Architect / Session 0)

- **Zero contract changes or extra dependencies needed** — `RollingStockRendererV2` implements `RollingStockRendererAdapter` from `src/three/contracts/adapters.ts` out-of-the-box.
- **One-line wiring in `Metropolitan3DScene.ts` (or plugin injection)**:
  ```ts
  import { createRollingStockRenderer } from './rollingstock/index.js';
  // Inside Metropolitan3DScene constructor:
  this.attachRollingStockRenderer(plugins?.rollingStockRenderer ?? createRollingStockRenderer());
  ```

## Known Limitations & Honesty Notes

- All 3D meshes and procedural PBR textures (`DataTexture`) are 100% original procedural creations by SENKIRO Lab (`MIT / CC BY 4.0`, `dataNature: 'manual-verified'`) based on official published dimensions and color schemes from JR East (`https://www.jreast.co.jp/train/local/e235.html`) and Tokyo Metro (`https://www.tokyometro.jp/corporate/enterprise/passenger_rail/cars/`).
- Registered operator corporate logos/trademarks (JR logo, Tokyo Metro Heart-M emblem) are intentionally omitted from the 3D meshes in accordance with `docs/00-shared-contract.md` §6–7.
- Cabin interiors (seats, straps) are simplified to tinted window glass with toggleable night-mode warm interior illumination to keep multi-train city rendering within the `<= 320` hub draw call budget.
