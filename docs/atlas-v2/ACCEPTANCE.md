# SENKIRO Tokyo Atlas 3D v2.0 — Acceptance Criteria & Verification Gates

This document defines the objective pass/fail verification gates enforced by the Lead Architect before marking **SENKIRO Tokyo Atlas 3D v2.0** complete on `integration/atlas-v2`.

---

## 1. Per-Merge Gate (Enforced After Every Specialist Branch Merge)

1. `npm run build` (`tsc --noEmit && vite build`) in `labs/a-tokyo-atlas-fare/` exits `0` with **zero TypeScript errors**.
2. `npm test` (Vitest) exits `0` with **100% passing** across all existing 42+ unit tests AND all newly added subsystem unit tests.
3. Zero unintended modifications outside the merging branch's declared write boundary.
4. ODbL isolation invariant (`alignmentAndData.test.ts`) and JR Fare Engine tests (`fareEngine.test.ts`, 26/26) remain 100% green.

---

## 2. Cross-Subsystem Integration Gates

### 2.1 Spatial & Coordinate Consistency
- Ground buildings, roads, rivers, parks, landmarks, tracks, viaduct piers, underground tunnels, platforms, and virtual trains share the single `TOKYO_ORIGIN` metric tangent plane (`1 unit = 1m`).
- Double-track virtual trains obey Japanese Left-Hand Running (`左側通行`) and never overlap opposing trains.
- Rolling stock wheel bottoms sit flush on rail heads (`+0.68m` surface / `+0.48m` viaduct & underground) and NEVER stretch vertically when `verticalExaggeration > 1.0`.

### 2.2 City & Underground Depth Occlusion
- Zero Z-fighting across ground, bay, rivers, parks, roads, and buildings in surface mode (opaque surface pass + `logarithmicDepthBuffer: true`).
- Radial GPU cutaway cleanly opens a sharp aperture into underground railways while keeping outside buildings solid and 13 landmarks as translucent reference anchors.
- Tunnel cutaway styles (`solid_shell`, `translucent_shell`, `section_cutaway`, `interior_view`) render underground trains, stations, and tunnels cleanly without near-plane clipping (`camera.near = 0.25m` underground).

### 2.3 Rolling Stock Realism & Clearance
- Recognizable procedural prototype-scale Tokyo train models (including JR E235-0 Yamanote, E233, Shinkansen N700S/E5, Tokyo Metro 1000/2000/16000/17000/18000, Toei 12-600 Oedo linear metro) with articulated multi-car consists, directional headlights/taillights, and distance LOD.
- Zero clipping against tunnel shells, station platforms, or overhead catenary structures.

### 2.4 Virtual Train Simulation Fidelity & Honesty
- Trains move continuously and smoothly along real `PhysicalTrack` topology, accelerate/cruise/brake realistically, dwell at stations with door states, traverse portals between surface/elevated/underground tiers, and turn back or through-run cleanly at line boundaries.
- **Honesty Check**: Every simulation panel, train inspector, and telemetry banner explicitly labels trains as **Virtual Simulation / 仮想運行シミュレーション** (synthetic) — never real-time/live.

### 2.5 Camera, Interaction & UI Coherence
- Seamless transitions between Map Browse, Free Explore, Follow Train (`chase`, `side`, `cab`, `overhead_cutaway`), Underground Inspect, and one-click Return to Surface.
- Clicking a 3D train opens the Train Inspector and synchronizes with line highlight & simulation controls.
- Clicking a 3D station or line continues to synchronize bidirectionally with DetailPanel, FarePanel, 2D MapLibre, and StripMapView.
- Full JA / EN bilingual UI + Light / Dark theme support + zero console/page errors.

---

## 3. Performance & Stability Budgets

Measured via Playwright Chromium (`1440×900`, SwiftShader software WebGL for deterministic relative benchmarking, matching Phase 2 methodology) + `window.__SENKIRO_3D_METRICS__`:

| Metric | Acceptance Target |
| --- | --- |
| Console errors / Uncaught page errors | **0 / 0** |
| Initial 3D scene ready (`initialLoadMs`) | `<= 8,000 ms` |
| Overview (`tokyo23`) Draw Calls | `<= 220` |
| Overview (`tokyo23`) Triangles | `<= 750k` |
| Hub surface (`shibuya` / `shinjuku` / `tokyo`) Draw Calls (with active virtual trains) | `<= 320` |
| Hub underground cutaway Draw Calls (with active virtual trains) | `<= 500` |
| Memory / GPU hygiene | Zero unbounded geometry/texture leaks on `dispose()`, chunk eviction, or train respawn |

---

## 4. Final Delivery Artifacts Required

1. Runnable integrated application on `integration/atlas-v2` passing `npm run build`, `npm test`, and `npm run test:e2e`.
2. Real browser screenshots covering surface hubs, city skyline/night, underground cutaway hubs, close-up rolling stock, and train-following views.
3. **Complete Underground Virtual Train Run Demonstration**: captured visual frame sequence / interactive demo flow showing a virtual train entering/running through Tokyo underground tunnels & stations with follow/cab camera and telemetry verification.
4. Real measured performance benchmark table (FPS, Draw Calls, Triangles, active trains, load times).
5. Explicit list of known data accuracy & schematic limits.
6. Complete Git commit & merge ledger across all 5 worktree branches + `integration/atlas-v2`.
7. Remaining / deferred backlog items honestly listed.
