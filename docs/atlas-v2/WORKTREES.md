# SENKIRO Tokyo Atlas 3D v2.0 — Worktree, Branch & Cross-Session Coordination Protocol

> **Lead Architect & Integration Coordinator Worktree**: `E:/SENKIRO`  
> **Integration Branch**: `integration/atlas-v2`  
> **Protected Baseline Branches (DO NOT MODIFY)**: `main`, `lab/a-tokyo-atlas-fare`, `lab/*`, `claude/*`

---

## 1. Active Worktree & Branch Registry

Each session has **one dedicated Git worktree**, **one dedicated feature branch**, and **one exclusive file write boundary**:

| Role / Session ID | Actual Git Branch | Worktree Path | Exclusive Write Zone (inside `labs/a-tokyo-atlas-fare/` unless noted) | Progress Report File |
| --- | --- | --- | --- | --- |
| **Lead Architect (Coordinator)** | `integration/atlas-v2` | `E:/SENKIRO` | `docs/atlas-v2/**` (except session reports), `src/contracts/**`, `src/three/contracts/**`, `src/three/Metropolitan3DScene.ts`, `src/ui/App.tsx`, `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `tests/e2e/**`, `scripts/eval-stage.mjs`, `tests/unit/contractsV2.test.ts` | `docs/atlas-v2/reports/INTEGRATION_STATUS.md` |
| **1. `atlas-city`** | `tokyo_environment_upgrade` | `C:/Users/Morii/.gemini/antigravity/worktrees/SENKIRO/tokyo_environment_upgrade` | `src/three/city/**`, `src/three/generators/cityTerrainGenerator.ts`, `src/three/generators/buildingGenerator.ts`, `src/three/materials/facadeLibrary.ts`, `src/three/environment/skyEnvironment.ts`, `tests/unit/city*.test.ts` | `docs/atlas-v2/reports/atlas-city.md` |
| **2. `atlas-underground`** | `underground_railway_geometry_system` | `C:/Users/Morii/.gemini/antigravity/worktrees/SENKIRO/underground_railway_geometry_system` | `src/three/underground/**`, `src/three/generators/tunnelGenerator.ts`, `src/three/generators/railTrackGenerator.ts`, `src/three/generators/viaductGenerator.ts`, `src/three/environment/cutawayVisuals.ts`, `tests/unit/underground*.test.ts` | `docs/atlas-v2/reports/atlas-underground.md` |
| **3. `atlas-rollingstock`** | `japanese_rolling_stock_assets` | `C:/Users/Morii/.gemini/antigravity/worktrees/SENKIRO/japanese_rolling_stock_assets` | `src/three/rollingstock/**`, `tests/unit/rollingstock*.test.ts` | `docs/atlas-v2/reports/atlas-rollingstock.md` |
| **4. `atlas-simulation`** | `train_simulation_engine` | `C:/Users/Morii/.gemini/antigravity/worktrees/SENKIRO/train_simulation_engine` | `src/simulation/**`, `tests/unit/simulation*.test.ts` | `docs/atlas-v2/reports/atlas-simulation.md` |
| **5. `atlas-camera-ui`** | `camera_experience_ux` | `C:/Users/Morii/.gemini/antigravity/worktrees/SENKIRO/camera_experience_ux` | `src/three/cameraController.ts`, `src/three/camera/**`, `src/ui/Tokyo3DCanvas.tsx`, `src/ui/SimulationPanel.tsx`, `src/ui/TrainInspector.tsx`, `src/ui/CameraHud.tsx`, `src/ui/i18n.ts`, `src/ui/styles.css`, `tests/unit/camera*.test.ts` | `docs/atlas-v2/reports/atlas-camera-ui.md` |

> **Note on Branch Naming**: Antigravity initialized the five worktree branches as `tokyo_environment_upgrade`, `underground_railway_geometry_system`, `japanese_rolling_stock_assets`, `train_simulation_engine`, and `camera_experience_ux` (corresponding to logical roles `atlas-city`, `atlas-underground`, `atlas-rollingstock`, `atlas-simulation`, and `atlas-camera-ui`). Keep using these exact checked-out worktree branch names so no worktree breaks!

---

## 2. Hard Multi-Session Guardrails

1. **Sync Frozen Contracts First**: Before implementing any v2.0 feature, every worktree session MUST run:
   ```bash
   git merge integration/atlas-v2
   ```
   and read `docs/atlas-v2/ARCHITECTURE.md`, `docs/atlas-v2/CONTRACTS.md`, `docs/atlas-v2/WORKTREES.md`, and `docs/atlas-v2/ACCEPTANCE.md`.
2. **Zero Cross-Zone Edits**:
   - NEVER edit `main`, `lab/a-tokyo-atlas-fare`, `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `src/ui/App.tsx`, `src/three/Metropolitan3DScene.ts`, `src/contracts/**`, or `src/three/contracts/**` from a specialist worktree!
   - If you need a new shared type, scene hook, or dependency, record the request in your progress report (`docs/atlas-v2/reports/<session>.md`) under `## Contract / Integration Requests` and commit it; the Coordinator will update `integration/atlas-v2` and notify.
3. **Commit Visibility Discipline**:
   - Sibling sessions DO NOT share live conversation context and CANNOT see uncommitted working-tree changes.
   - Communicate state ONLY via clean Git commits on your own branch + updates to `docs/atlas-v2/reports/<session>.md`.
4. **Keep Every Commit Green**:
   - Run `npm run build && npm test` inside `labs/a-tokyo-atlas-fare` before committing any milestone.
   - Maintain backward compatibility on existing exported classes (`CityTerrainLayer`, `CityChunkManager`, `TunnelAndStationLayer`, `RailTrackLayer`, `ViaductLayer`, `SpatialCameraController`) while adding v2.0 capabilities and adapters.
5. **No `git push`, No Destructive Reset**:
   - All coordination happens via local Git branches and commits until explicit user approval.

---

## 3. Progress Report Format (`docs/atlas-v2/reports/<session>.md`)

Every specialist session MUST create and periodically commit `docs/atlas-v2/reports/<session>.md` containing:

```markdown
# Progress Report — <session-id> (<branch-name>)

- **Status**: IN_PROGRESS | READY_FOR_INTEGRATION | BLOCKED | INTEGRATED
- **Base Contract Commit**: <short sha of merged integration/atlas-v2>
- **Latest Branch Commit**: <short sha>
- **Updated At**: YYYY-MM-DD HH:MM

## Completed Deliverables
- ...

## Files Created / Modified
- ...

## Verification Evidence (Actually Run)
- `npm run build`: PASS / FAIL / NOT RUN
- `npm test`: X/Y passed

## Contract / Integration Requests (for Lead Architect)
- None (or exact API/wiring instructions for Metropolitan3DScene.ts)

## Known Limitations & Honesty Notes
- ...
```

---

## 4. Integration Cadence (Lead Architect)

The Coordinator does NOT wait for all five modules to finish before running integration:
1. **Wave 0 (Contract Freeze)**: Commit docs, `src/contracts/**`, `src/three/contracts/**`, `Metropolitan3DScene.ts` v2 facade, and `tests/unit/contractsV2.test.ts` on `integration/atlas-v2`.
2. **Incremental Merges (Waves 1–5)**: As soon as any specialist branch reaches a clean milestone (`READY_FOR_INTEGRATION` or verified commits), Coordinator merges that branch into `integration/atlas-v2`, wires its adapter into `Metropolitan3DScene.ts` / `App.tsx`, and runs `npm run build && npm test`.
3. **Cross-Module Integration Verification**: After `atlas-simulation` + `atlas-rollingstock` + `atlas-underground` are merged, immediately run browser E2E + underground train demonstration + visual screenshot inspection to catch coordinate/occlusion/scale mismatches early!
4. **Final Stabilization**: Merge all 5 branches, resolve visual/depth/camera/UI polish issues, run full build + unit + Playwright E2E + real screenshots + performance benchmark + underground virtual train run demo, and publish the final v2.0 Integration Report.
