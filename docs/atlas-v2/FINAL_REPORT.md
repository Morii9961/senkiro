# SENKIRO Tokyo Atlas 3D v2.0 — Final Integration & Delivery Report

> **Integration Branch**: `integration/atlas-v2` (branched from protected `lab/a-tokyo-atlas-fare @ 6001e82`)  
> **App Root**: `labs/a-tokyo-atlas-fare/`  
> **Coordinator**: Lead Architect & Integration Coordinator (`E:/SENKIRO`)  
> **Date**: 2026-11-23

---

## 1. Executive Summary

All **five independent Git worktree sessions** (`atlas-simulation`, `atlas-rollingstock`, `atlas-underground`, `atlas-camera-ui`, and `atlas-city`) have been integrated into `integration/atlas-v2` across **five zero-conflict `--no-ff` merge waves**, followed by cross-module visual, camera, and GPU performance stabilization.

- **Build (`npm run build`: `tsc --noEmit && vite build`)**: **PASS** (`0` TypeScript errors, 1,716 modules transformed, built in `5.45s`).
- **Unit & Cross-Module Integration Tests (`npm test`: Vitest)**: **PASS** (**10 test files, 83/83 tests passed** in `5.19s`).
- **End-to-End Browser Verification (`E2E_PORT=18491 npm run test:e2e`: Playwright Chromium WebGL)**: **PASS** (**14/14 tests passed** in `3.0m`, including 2 new v2.0 tests verifying live simulation, rolling stock rendering, underground train follow, enclosed underground explorer, zero label overlap, and safe return to surface).
- **Real WebGL Visual & Performance Benchmark (`eval-v2.mjs final-v2`)**: **12/12 real `1440×900` screenshots captured**, **0 console errors, 0 uncaught page errors, 0 label bounding-box overlaps across all views**, and a complete **5-step Underground Virtual Train Run Demonstration** (`46.6m` verified live cab-POV tunnel progression).

---

## 2. How to Run the Integrated Application

```bash
cd labs/a-tokyo-atlas-fare
npm install
npm run build
npm test
npm run dev          # http://127.0.0.1:5173 -> switch top bar to "3D 都市アトラス"
# Optional E2E & v2 visual benchmark:
E2E_PORT=18491 npm run test:e2e
EVAL_PORT=18492 node scripts/eval-v2.mjs final-v2 ../../docs/atlas-v2/screenshots
```

---

## 3. Cross-Module Integration Resolutions Completed

1. **Unified Metric & Vertical Spine (`src/contracts/atlasV2.ts`, `physicalTrackBuilder.ts`)**:
   - All 503 physical track segments (`sk:physical_track:*`), 481 stations, 303 underground tunnel chunks, 301 station caverns, 108 virtual trains, 48,696 buildings, and 13 landmarks share the single `TOKYO_ORIGIN` metric tangent plane (`1 unit = 1m`).
   - Japanese Left-Hand Running (`左側通行`), rail-head elevations (`+0.68m` surface / `+0.48m` slab & tunnel), and mandatory vehicle local axes (`+Z` forward, `+Y` up, `y = 0` wheel tread, `'YXZ'` Euler) are enforced by unit tests (`contractsV2.test.ts` + `rollingstock.test.ts`).
   - `RollingStockRendererV2.group.scale.y` remains strictly `1.0` even under `1.0× .. 2.5×` cutaway vertical exaggeration; only track spline centerlines scale vertically.
2. **Zero-Lag Driver Cab POV (`src/three/cameraController.ts`, commit `c49350c`)**:
   - Visual inspection caught that exponential position damping caused the `cab` camera to lag 4–6m behind the nose into Car 0's opaque carbody at `2×` speed. Fixing `cab` mode to rigidly mount `+0.75m` ahead of the un-lagged front nose tip (`y = hp.y + 2.35`) with smooth look-ahead damping eliminated carbody occlusion across all simulation speeds (`0.5× .. 10×`).
3. **Overview & Interior Draw-Call Optimization (`src/three/rollingstock/v2Adapter.ts` + `Metropolitan3DScene.ts`, commit `c49350c`)**:
   - Added a single-draw-call `THREE.InstancedMesh` far-LOD batch (`>= 1350m`, capacity 1,600 cars, preserving `instanceId` picking) and surface-mode deep-tunnel train culling (hiding buried `isUnderground && inTunnel` trains while ground is opaque).
   - Combined with `atlas-city`'s merged landmarks and overview LOD0 gate, Tokyo 23-ward Overview Draw Calls dropped from **`389` → `105`** (`-73%`, well under the `<= 220` budget!).
4. **Enclosed Subterranean Atmosphere & Surface Occlusion (`src/three/Metropolitan3DScene.ts`, commit `c49350c`)**:
   - Visual inspection caught daytime sky peeking through the far end of culled underground station caverns. Automatically hiding the sky dome and surface terrain/buildings/viaducts while enclosed underground (`camera.y < -4.2 && !cutawayActive`) with dark subterranean fog (`Fog(0x0a0f18, 85, 390)`) eliminated sky leak and cut interior Draw Calls by `44%–72%` (`402 → 227` in Underground Explorer, `513 → 141` in Cab Ride).
5. **Authentic Livery Highlight & Keyboard Focus Fix (`v2Adapter.ts`, `CameraHud.tsx`)**:
   - Replaced heavy cyan selection emissive (`0x38bdf8 @ 0.32`) with a subtle warm specular sheen (`0xfff8eb @ 0.08`) so selected trains keep authentic liveries (e.g. Marunouchi Glowing Red `#d61c24`).
   - Added `e.currentTarget.blur()` on `<select data-testid="free-speed-select">` so `WASD` free-flight controls work immediately after changing speed (resolving `atlas-city`'s E2E Test 12 finding).

---

## 4. Real Verified Screenshots & Underground Virtual Train Run Demonstration

All 12 screenshots below were captured from the integrated 5-module build (`docs/atlas-v2/screenshots/`, `1440×900` Chromium WebGL, `0` console/page errors) and visually audited:

### 4.1 Metropolitan City, Hubs, Night & Underground Explorer
- **Tokyo 23-Ward Overview (Day)**: [01-city-overview-day.png](./screenshots/01-city-overview-day.png) (`DC=105`, `Tris=498k`, `21,975` buildings, `108` active trains, `14` zero-overlap labels)
- **Shibuya Surface & 800m Showcase Streetscape**: [02-shibuya-surface.png](./screenshots/02-shibuya-surface.png) (15 procedural PBR facades, dark-asphalt 4-tier lane-marked avenues, crosswalks, Miyashita Park trees, Ginza 3F viaduct & Yamanote tracks, `DC=282`)
- **Shibuya Multi-Level Underground Cutaway**: [03-shibuya-underground-cutaway.png](./screenshots/03-shibuya-underground-cutaway.png) (Ginza 3F + Yamanote + Inokashira + Hanzomon/Den-en-toshi `L-2` + Fukutoshin/Toyoko `L-3` dual-surface tunnels + translucent landmarks)
- **Tokyo & Otemachi Section Cutaway (Open Tunnel Roofs)**: [04-tokyo-otemachi-section-cutaway.png](./screenshots/04-tokyo-otemachi-section-cutaway.png) (5 Otemachi subway lines with open concrete tunnel roofs & station caverns + Marunouchi red-brick station anchor + Tohoku Shinkansen `519A`)
- **Underground Explorer — Inside Fukutoshin Line Shield Tunnel**: [05-underground-explorer-interior.png](./screenshots/05-underground-explorer-interior.png) (`CamY=-27m`, segmented precast concrete shield rings, slab track, walkways, Shibuya widened station cavern with luminaires & tactile edge strips fading into dark tunnel bore, `DC=227`)
- **Shinjuku Street-Level with Dual Passing Yamanote E235-0 Trains**: [06-shinjuku-street-level.png](./screenshots/06-shinjuku-street-level.png) (`ALT 36.6m`, `NE 25°`, Cocoon Tower distance, left-hand passing Yamanote `128A` & `162B`, dark asphalt lanes, `DC=251`)
- **Shinjuku Night Cutaway**: [07-shinjuku-night.png](./screenshots/07-shinjuku-night.png) (warm emissive skyscraper windows, Oedo `L-4`, Toei Shinjuku `L-2`, Marunouchi `L-1`, Keio & Odakyu trains)

### 4.2 Complete Underground Virtual Train Run Demonstration (Tokyo Metro Marunouchi Line `117A` · 2000 Series · `2×` Speed)
1. **Step 1 — Underground Side Rig**: [08-ug-train-demo-1-side.png](./screenshots/08-ug-train-demo-1-side.png) — Authentic red Tokyo Metro 2000 series (`6 cars · 1435mm · third_rail_600v`) articulating cleanly around a box-tunnel curve with bogies flush on steel rails, `TrainInspector` displaying explicit `模擬運行・SYNTHETIC` badge (`DC=183`).
2. **Step 2 — Underground Trailing Chase Rig**: [09-ug-train-demo-2-chase.png](./screenshots/09-ug-train-demo-2-chase.png) — Oblique rear follow tracking `丸ノ内線 117A (L-1 · 50 km/h)` through the translucent concrete cutaway tunnel beneath Tokyo's skyline (`DC=333`).
3. **Step 3 — Underground Cab Ride POV (`t0`, `simClock = 22.2s`, `pos = [-12579, -8, -2430]`)**: [10-ug-train-demo-3-cab-t0.png](./screenshots/10-ug-train-demo-3-cab-t0.png) — Unobstructed driver front-window view inside the lit concrete box tunnel showing 1,435mm rails, yellow third-rail shroud, center columns, and ceiling luminaires (`DC=141`, `Tris=721k`).
4. **Step 4 — Underground Cab Ride Progression (`t1`, `simClock = 25.6s`, `pos = [-12541, -8, -2403]`)**: [11-ug-train-demo-4-cab-t1.png](./screenshots/11-ug-train-demo-4-cab-t1.png) — Verified **`46.6m` continuous forward travel** down the tunnel toward the upcoming curve (`DC=141`, `FPS=1.8`).
5. **Step 5 — Clean Exit to Surface Overview**: [12-ug-train-demo-5-surface-exit.png](./screenshots/12-ug-train-demo-5-surface-exit.png) — Exited train follow and restored opaque Tokyo 23-ward surface overview (`CamY=4186m`, `DC=109`, `Tris=535k`, `0` label overlaps).

---

## 5. Real Measured Performance Results (`1440×900`, Chromium SwiftShader CPU WebGL)

Measured directly from `docs/atlas-v2/screenshots/metrics.json` (`window.__SENKIRO_3D_METRICS__` + 10-frame RAF sampling; hardware GPU desktops typically run 25–60× faster than software SwiftShader):

| Scene / View | FPS (SwiftShader) | Draw Calls | Triangles | Active Trains (UG) | Rendered Cars | Visible Labels (Overlaps) | `ACCEPTANCE.md` Budget Check |
| --- | ---: | ---: | ---: | --- | ---: | --- | --- |
| `01-city-overview-day` | `1.5` | **`105`** | `497,552` | `108 (56)` | `312` | `14 (0)` | **PASS** (`DC <= 220`, `Tris <= 750k`) |
| `02-shibuya-surface` | `0.9` | **`282`** | `2,011,984` | `108 (56)` | `312` | `5 (0)` | **PASS** (`DC <= 320`) |
| `03-shibuya-underground-cutaway` | `0.8` | `519` | `2,331,732` | `108 (56)` | `648` | `6 (0)` | Soft +19 DC over 500 (Shibuya streetscape + rim LOD0 + tunnels) |
| `04-tokyo-otemachi-section-cutaway` | `1.0` | `536` | `2,137,999` | `108 (57)` | `648` | `9 (0)` | Soft +36 DC over 500 (5-line open-roof caverns + Marunouchi rim) |
| `05-underground-explorer-interior` | `1.1` | **`227`** | `846,768` | `108 (57)` | `648` | `5 (0)` | **PASS** (enclosed surface culling `-44% DC`) |
| `06-shinjuku-street-level` | `0.8` | **`251`** | `1,872,864` | `108 (56)` | `312` | `5 (0)` | **PASS** (`DC <= 320`) |
| `07-shinjuku-night` | `1.1` | **`448`** | `2,077,684` | `108 (57)` | `648` | `11 (0)` | **PASS** (`DC <= 500` cutaway night) |
| `08-ug-train-demo-1-side` | `1.1` | **`183`** | `1,666,154` | `108 (57)` | `648` | `0 (0)` | **PASS** |
| `09-ug-train-demo-2-chase` | `0.7` | **`333`** | `1,889,209` | `108 (56)` | `648` | `1 (0)` | **PASS** |
| `10-ug-train-demo-3-cab-t0` | `1.1` | **`141`** | `720,528` | `108 (57)` | `648` | `0 (0)` | **PASS** (`-72% DC` vs pre-polish `513`) |
| `11-ug-train-demo-4-cab-t1` | `1.8` | **`141`** | `720,528` | `108 (56)` | `648` | `0 (0)` | **PASS** (`46.6m` live tunnel travel) |
| `12-ug-train-demo-5-surface-exit` | `1.6` | **`109`** | `534,944` | `108 (56)` | `312` | `5 (0)` | **PASS** (`DC <= 220`, `Tris <= 750k`) |

- **Urban Asset Load (`loadTimeMs`)**: `4,479 ms` (CPU SwiftShader, 145 chunks + Shibuya streetscape + 15 PBR texture sets); **Full Playwright 3D Ready (`initialLoadMs`, includes fixed 2.8s stabilization wait)**: `11,619 ms` under concurrent CPU-bound SwiftShader testing (expected `~2–4s` on hardware GPU).
- **Console / Page Errors**: **`0 / 0`**.

---

## 6. Known Data Accuracy, Schematic & Honesty Limits

1. **Schematic 3D Verticality (NOT Surveyed Civil Depth)**: All underground tunnel depths (`L-1 .. L-4`) and elevated heights (`L+1`, `L+2`) are schematic relative tiers derived from `elevationSolver.ts` + isolated ODbL `osm-vertical.json` (`elevationM: null`), never official surveyed civil-engineering depths in meters.
2. **Virtual Train Simulation (Synthetic — NOT Real-Time)**: All 108 running trains, run numbers, speeds, headways, and dwell states are deterministic synthetic simulations (`isVirtualSimulation: true`, `dataNature: 'synthetic'`, `disclaimerCode: 'VIRTUAL_SIMULATION_NOT_REALTIME'`) running on real `PhysicalTrack` topology. Keyless realtime slot continues to report `unavailable / 無実時データ`.
3. **Flat Ground Datum (No DEM Yet)**: Surface terrain uses `datumKind: 'flat_datum'` (`y = 0` with `-1.25m .. +7.40m` stratification) rather than GSI DEM elevation; Shibuya valley and Yamanote plateau slopes are not yet modeled.
4. **Urban Building Provenance & Streetscape Scope**: 38,050 buildings are real OSM footprints (`hb = 'o' | 'l' | 'i'`) and 10,646 are schematic street-block infill (`hb = 'p'`) strictly avoiding roads/rail/water/parks. High-detail streetscape furniture focuses on `SHIBUYA_SHOWCASE_ZONE` (`~800m × 800m`).
5. **ODbL 1.0 Isolation & Trademark Hygiene**: Core `atlas.json` and the JR Fare Engine contain zero `shareAlike: true` sources (`alignmentAndData.test.ts` 9/9 PASS). Official operator logos/trademarks and official station maps are intentionally excluded.

---

## 7. Complete Worktree Commit & Merge Ledger

| Wave | Session / Role | Branch | Key Branch Commits | Integration Merge / Commit on `integration/atlas-v2` |
| --- | --- | --- | --- | --- |
| Baseline | Protected Phase 2 | `lab/a-tokyo-atlas-fare` | `6001e82` | Protected (untouched) |
| Wave 0 | Lead Architect | `integration/atlas-v2` | `be8db1b`, `166cf17` | Frozen contracts, `PhysicalTrackGraph`, `adapters.ts`, `eval-v2.mjs`, `E2E_PORT` |
| Wave 1 | `atlas-simulation` | `train_simulation_engine` | `6f9c56b`, `5b87921`, `f5aca66` | Merge `3eda191` + Wiring `b30c00d` |
| Wave 2 | `atlas-rollingstock` | `japanese_rolling_stock_assets` | `ba93594`, `815b354`, `c6e1be0` | Merge `af427f6` + Wiring `b30c00d` |
| Wave 3 | `atlas-underground` | `underground_railway_geometry_system` | `d24a097`, `ee81545`, `2cb0bf8` | Merge `face55e` + Wiring `036a3e4` |
| Wave 4 | `atlas-camera-ui` | `camera_experience_ux` | `2acc945`, `ec9a22e`, `38e9588`, `b081a42`, `ebf299a` | Merge `a2ef521` + Wiring `3960712` + Polish `c49350c` |
| Wave 5 | `atlas-city` | `tokyo_environment_upgrade` | `55a21d1` | Merge `c249524` + Final Verification Commit (HEAD) |

---

## 8. Deferred / Future Backlog (Not Blocking v2.0 Delivery)

1. **Terrain Portal Cutouts**: Wire `atlas-underground`'s exported `getPortalCutoutHints()` (48 portals) into `atlas-city` surface terrain so descending portal ramps carve permanent rectangular cutouts in ground slabs without requiring radial cutaway.
2. **Cutaway Rim Draw-Call Trim (`519/536 → <= 500`)**: Further merge or cull `ShibuyaStreetscapeLayer` furniture inside/beyond the active radial cutaway aperture during `underground_cutaway` mode to bring Shibuya & Tokyo cutaway Draw Calls strictly under `500`.
3. **Real GSI DEM Terrain**: Replace `flat_datum` (`y = 0`) with GSI DEM tiles and drape roads, buildings, and surface railway grades onto real Tokyo topography.
4. **Adaptive Texel-Snapped Shadow Frustum & `CityLayerV2` Direct Adoption**: Optionally route `Metropolitan3DScene` through `createCityLayerAdapter()` and tighten `sunLight.shadow.camera` dynamically at close-up distances for sharper shadows.
5. **Sidebar `DetailPanel.tsx` Train Sync**: Optionally mirror 3D `TrainInspector` selections into the left sidebar `Detail` tab in `App.tsx`.
6. **Code-Splitting Main Vite Chunk**: Split `three` / `maplibre-gl` / rolling-stock builders via Rollup `manualChunks` to shrink initial JS bundle (`3.5 MB` uncompressed / `800 KB` gzip) and improve SwiftShader cold startup (`initialLoadMs`).
