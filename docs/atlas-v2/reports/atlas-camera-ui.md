# Progress Report — atlas-camera-ui (`camera_experience_ux`)

- **Status**: `READY_FOR_INTEGRATION`
- **Base Contract Commit**: `036a3e4` (`integration/atlas-v2` — frozen architecture, contracts, `PhysicalTrackGraph`, Wave 1 `atlas-simulation`, and Wave 2 `atlas-rollingstock` integrated)
- **Latest Code Commit**: `b081a42` (`camera_experience_ux`, synced cleanly on top of `integration/atlas-v2`)
- **Updated At**: 2026-11-22 23:05

## Completed Deliverables

1. **Unified 5-Mode Spatial Camera State Machine & `CameraControllerV2Adapter` (`src/three/camera/cameraModeStateMachine.ts`, `src/three/cameraController.ts`, `src/three/camera/collisionGuard.ts`, `src/three/camera/controllerBridge.ts`)**:
   - Implemented the 5-mode FSM (`city_overview`, `street_level`, `underground_cutaway`, `underground_explorer`, `train_follow`) with bidirectional Session 0 contract mapping (`toCameraModeV2`, `toSession0FollowView`, and `CameraControllerV2Adapter`: `getMode`, `getModeV2`, `setMode`, `setModeV2`, `followTrain`, `updateTrainTarget`, `getSnapshot`, `returnToSurface`).
   - Preserved 100% backward compatibility with `Metropolitan3DScene.ts` (`SpatialCameraController(camera, domElement, onCameraMoved)`) and existing desktop map controls (`Left Click` select entity, `Left Drag` orbit rotate, `Middle / Right Drag` ground-plane pan with auto-scroll suppressed, `Wheel` zoom / tunnel advance, `Double-Click` focus).
   - Added explicit **Free Look** toggle (`toggle-camera-mode` button or key `F`) with collision-guarded `WASD/Arrows` flight, `E/Space` ascend, `Q/Shift` descend, configurable speed (`slow | normal | fast`), key `R` overview reset, and `Esc` exit / return-to-surface safety transitions.
   - **Street-Level** lowers camera into near-surface architectural view with `StreetCollisionGuard` OBB push-out (preventing landmark/building wall clipping) and live cardinal compass + nearest-landmark distance readout.
   - **Underground Explorer** enters stitched subterranean rail corridors (`SolvedRailwayNetwork3D`), constrains camera within tunnel bore clearance (`±2.2m` lateral, `1.4–4.1m` height, `near = 0.25m`, `1:1` unexaggerated tunnel scale, ground buildings occluded above), provides live nearest-station / tier / crossing-line hop controls, and offers one-click **Return to Surface**.
   - **Train Follow** supports Frame-1 immediate target convergence, smooth exponential curve damping (`exp(-11·dt)` position, `exp(-4.2·dt)` tangent), and 5 selectable rigs (`cab`, `front`, `side`, `chase`, `overhead_cutaway`), lowering `OrbitControls.minDistance` to `6m` so close/cab rigs are never clipped.

2. **Hierarchical 4-Tier Screen-Space Label Layout & Deconfliction (`src/three/camera/labelLayout.ts`, `src/three/camera/labelSystem.ts`, `src/ui/CameraHud.tsx`)**:
   - Pure-TS zoom-tier classification (`overview` -> `mid` -> `close` -> `underground`) and 2D bounding-box spatial deconfliction with HUD/inspector safe margins (`top`, `bottom`, `left`, `right`), local cell density cap (`<= 2` per `220×120` cell), per-line deduplication, distance fading, and guaranteed priority for selected entities.
   - Live projection consumes `AtlasDataset`, `SolvedRailwayNetwork3D`, cached landmark anchors, and live `SimulatedTrainState[]` (`headPose` already incorporating `verticalExaggeration`, tagged `SIM` / `模擬`).

3. **SENKIRO Precision HUD, Simulation Control Dock & Contextual Entity Inspector (`src/ui/Tokyo3DCanvas.tsx`, `src/ui/CameraHud.tsx`, `src/ui/SimulationPanel.tsx`, `src/ui/TrainInspector.tsx`, `src/ui/styles.css`)**:
   - **Direct Wave 1 & Wave 2 Integration**: `Tokyo3DCanvas.tsx` instantiates `createTrainSimulationEngine()` and `createRollingStockRenderer()`, passing them via `AtlasV2ScenePlugins` to `Metropolitan3DScene` without modifying any Coordinator file (`App.tsx` or `Metropolitan3DScene.ts`).
   - **Simulation Control Bar (`SimulationPanel.tsx`)**: Non-obstructive bottom-center collapsible dock with prominent `SIMULATED · SYNTHETIC` / `模擬運行 · 非実時` honesty badge, Play/Pause, Speed (`0.5× | 1× | 2× | 5× | 10×`), Fleet Density (`low | normal | rush`), Visible Train Count cap (`4 | 8 | 12 | 20 | All`), Train Picker, Show/Hide toggle, Follow button, Reset, and Exit Follow.
   - **Contextual 3D Inspector (`TrainInspector.tsx`)**: Top-right card displaying selected `SimulatedTrainState` (`RollingStockCatalog` model/gauge/electrification specs, route segment & direction, speed/phase/doors, non-realtime disclosure, follow + rig buttons), plus contextual Station card (operators, lines, in/out-gate complex transfers, provenance, Station Atlas entry) and Line card (coverage, honest through-service status, fit line, quick follow).

4. **Automated Unit Tests & Real WebGL Verification Screenshots (`tests/unit/cameraAndLabels.test.ts`, `src/three/camera/screenshots/*.png`)**:
   - Added 7 unit tests verifying the 5-mode FSM transitions, `CameraModeV2` mappings, safe near-plane/occlusion capabilities, 4-tier label deconfliction (`0` overlaps), real `VirtualTrainSimulationEngine` label projection, and `StreetCollisionGuard` OBB push-out.
   - Captured 6 real Chromium WebGL (`1440×900`) verification screenshots with `0` console/page errors and `0` label overlaps (`01-city-overview.png`, `02-street-level.png`, `03-underground-cutaway.png`, `04-underground-explorer.png`, `05-train-follow-side.png`, `06-train-follow-front.png`).

## Files Created / Modified (Strictly within `atlas-camera-ui` Exclusive Write Boundary)

- `labs/a-tokyo-atlas-fare/src/three/cameraController.ts`
- `labs/a-tokyo-atlas-fare/src/three/camera/cameraModeStateMachine.ts`
- `labs/a-tokyo-atlas-fare/src/three/camera/collisionGuard.ts`
- `labs/a-tokyo-atlas-fare/src/three/camera/controllerBridge.ts`
- `labs/a-tokyo-atlas-fare/src/three/camera/labelLayout.ts`
- `labs/a-tokyo-atlas-fare/src/three/camera/labelSystem.ts`
- `labs/a-tokyo-atlas-fare/src/three/camera/screenshots/01-city-overview.png`
- `labs/a-tokyo-atlas-fare/src/three/camera/screenshots/02-street-level.png`
- `labs/a-tokyo-atlas-fare/src/three/camera/screenshots/03-underground-cutaway.png`
- `labs/a-tokyo-atlas-fare/src/three/camera/screenshots/04-underground-explorer.png`
- `labs/a-tokyo-atlas-fare/src/three/camera/screenshots/05-train-follow-side.png`
- `labs/a-tokyo-atlas-fare/src/three/camera/screenshots/06-train-follow-front.png`
- `labs/a-tokyo-atlas-fare/src/ui/Tokyo3DCanvas.tsx`
- `labs/a-tokyo-atlas-fare/src/ui/CameraHud.tsx`
- `labs/a-tokyo-atlas-fare/src/ui/SimulationPanel.tsx`
- `labs/a-tokyo-atlas-fare/src/ui/TrainInspector.tsx`
- `labs/a-tokyo-atlas-fare/src/ui/styles.css`
- `labs/a-tokyo-atlas-fare/tests/unit/cameraAndLabels.test.ts`
- `docs/atlas-v2/reports/atlas-camera-ui.md`

## Verification Evidence (Actually Run)

- `npm --prefix labs/a-tokyo-atlas-fare run build` (`tsc --noEmit && vite build`): **PASS** (`0` TypeScript errors, `dist/` built cleanly in 8.94s)
- `npm --prefix labs/a-tokyo-atlas-fare test` (`vitest run`): **PASS** (`8 test files, 70/70 tests passed`: `fareEngine.test.ts` 26/26, `alignmentAndData.test.ts` 9/9, `contractsV2.test.ts` 3/3, `cameraAndLabels.test.ts` 7/7, `rollingstock.test.ts` 6/6, `simulationRollingStockIntegration.test.ts` 1/1, `elevationSolver.test.ts` 7/7, `simulationEngine.test.ts` 11/11)
- `E2E_PORT=18486 npm --prefix labs/a-tokyo-atlas-fare run test:e2e` (`playwright test`, Chromium + SwiftShader WebGL): **PASS** (`12/12 tests passed`)
- Multi-mode WebGL interactive Playwright check (`verify-ux-v2-e2e.mjs` against `vite preview --port 18487`): **PASS** (`0` console/page errors, `0` label bounding-box overlaps across checked views, verified `108` active virtual trains / `648` rendered rolling stock cars, confirmed `KeyW` displacement inside Underground Explorer at `y=-27m`, confirmed `TrainInspector` `SIMULATED · SYNTHETIC` disclosure and safe surface reset).

## Contract / Integration Requests (for Lead Architect / Session 0)

No blocking contract changes required — the full v2 camera, label, simulation HUD, and rolling stock experience works out of the box when merging `camera_experience_ux` into `integration/atlas-v2`! When performing Coordinator polish in `Metropolitan3DScene.ts` / `App.tsx`, two small optional upgrades are recommended:

1. **Delegate `updateTrainFollowCamera` & `setCameraModeV2` in `Metropolitan3DScene.ts` to `SpatialCameraController`** (so `'cab'`, `'side'`, `'chase'`, and `'overhead_cutaway'` inherit curve damping + `StreetCollisionGuard` wall avoidance instead of the temporary Coordinator lerp, and close external views get tight `near = 0.25m`):
   ```ts
   // In Metropolitan3DScene.ts:
   setCameraModeV2(mode: CameraModeV2, target?: CameraTargetV2): void {
     this.tracePlaying = false;
     this.camCtrl.setModeV2(mode, target);
   }
   // Inside animate() when (this.followTrainId && targetTrain):
   this.camCtrl.updateTrainTarget(targetTrain, dtSec);
   // Inside adaptive near-plane check (~line 663):
   const isCloseOrInterior =
     this.camera.position.y < -1.5 ||
     camDist < 120 ||
     (this.followTrainId !== null && this.followTrainView === 'cab');
   ```
2. **Wait for Wave 3 (`atlas-underground`) tunnel interior wall textures / portal geometry**: In `04-underground-explorer.png` and close-range subway `cab` views (`06-train-follow-cab` test before switching to `front`), Shibuya surface slabs/semi-transparent pre-Wave-3 tunnel extrusions were still using `integration/atlas-v2 @ 036a3e4` baseline tunnel meshes. Merging `atlas-underground` (`underground_railway_geometry_system`) will provide the opaque double-sided bore walls, portal clearance openings, and station caverns expected inside Underground Explorer and subway Cab Ride views.
3. **Optional Sidebar `DetailPanel.tsx` Sync in `App.tsx`**: Currently 3D train/station/line details render in the 3D-local `TrainInspector.tsx` drawer inside `Tokyo3DCanvas`. If desired, `App.tsx` left-sidebar `Detail` tab can also subscribe to `onSelectTrain` for persistent 2D/3D train inspection.

## Known Limitations & Honesty Notes

- All train positions, speeds, run numbers (`A01`, `185A`, `321A`, etc.), headways, and dwell states displayed in `SimulationPanel`, `TrainInspector`, and 3D map labels are deterministic synthetic simulations (`dataNature: 'synthetic'`, `isVirtualSimulation: true`, `disclaimerCode: 'VIRTUAL_SIMULATION_NOT_REALTIME'`), explicitly badged in-UI and never presented as real-time train operations.
- Underground heights and tier labels (`L+2 .. L-4`) remain schematic per `docs/00-shared-contract.md` and `osm-vertical.json`; 3D building collision avoidance in `StreetCollisionGuard` uses cached `base-environment.json` landmark boxes and runtime chunk boxes added via `addBuildingBoxes()` (surface altitude floor `y >= 4.5m` is always enforced).
- Line/entity colors remain strictly reserved for railway line identification dots, left-border accents, and selected highlights; UI controls follow a neutral restrained palette with amber reserved for synthetic/schematic honesty disclosures.
