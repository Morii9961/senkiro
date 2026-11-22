# SENKIRO Tokyo Atlas 3D v2.0 — System Architecture

> **Status**: FROZEN CONTRACT BASELINE v2.0.0  
> **Integration Branch**: `integration/atlas-v2` (branched from `lab/a-tokyo-atlas-fare @ 6001e82`)  
> **App Root**: `labs/a-tokyo-atlas-fare/` (React 19 + TypeScript 5.8 strict + Vite 6 + MapLibre GL 5.4 + Three.js 0.187)

---

## 1. Architectural Vision & Subsystem Topology

SENKIRO Tokyo Atlas 3D v2.0 upgrades the Phase 2 procedural Tokyo 3D Railway Atlas (`labs/a-tokyo-atlas-fare`) into a spatially unified, interactive, multi-layer 3D metropolitan & subterranean railway simulation platform developed across **six coordinated Git worktrees** (1 Lead Architect + 5 specialist worktree sessions).

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                 SHARED DATA & FROZEN CONTRACTS (Coordinator)                 │
│  data/processed/atlas.json           (CC BY · 15 ops · 40 lines · 481 stns)  │
│  data/processed/osm-vertical.json    (ODbL 1.0 · isolated vertical tags)     │
│  public/data/urban-chunks/*          (ODbL 1.0 · 145 chunks · 48,696 bldgs)  │
│  src/three/geoProjection.ts          (Origin: Tokyo Stn 139.7671E, 35.6812N) │
│  src/domain/elevationSolver.ts       (C0 3D splines + L+2..L-4 + deconflict) │
│  src/contracts/atlasV2.ts            (Frozen Pure-TS v2.0 domain contracts)  │
│  src/contracts/physicalTrackBuilder.ts (PhysicalTrackGraph + pose sampler)   │
│  src/three/contracts/adapters.ts     (Three.js subsystem adapter interfaces) │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────────────────┐
        ▼                       ▼                                   ▼
┌───────────────────┐ ┌───────────────────────┐         ┌──────────────────────┐
│ 1. atlas-city     │ │ 2. atlas-underground  │         │ 4. atlas-simulation  │
│ (tokyo_env_upg)   │ │ (underground_rail...) │         │ (train_sim_engine)   │
│ CityTerrainLayer  │ │ TunnelAndStationLayer │         │ VirtualTrainSimEngine│
│ CityChunkManager  │ │ RailTrackLayer        │         │ (Pure TS, zero DOM)  │
│ FacadeLibrary     │ │ ViaductLayer          │         └──────────┬───────────┘
│ SkyEnvironment    │ │ CutawayPitVisuals     │                    │
└────────┬──────────┘ └───────────┬───────────┘                    ▼
         │                        │                     ┌──────────────────────┐
         │                        │                     │ 3. atlas-rollingstock│
         │                        │                     │ (japanese_rolling...)│
         │                        │                     │ RollingStockLayer    │
         │                        │                     │ 12 Tokyo EMU/Shink.  │
         │                        │                     │ (UNSCALED scale.y=1) │
         │                        │                     └──────────┬───────────┘
         └────────────────────────┼────────────────────────────────┘
                                  ▼
                ┌──────────────────────────────────────┐
                │   Metropolitan3DScene (Coordinator)  │
                │   - LogarithmicDepthBuffer           │
                │   - Adaptive near (0.25m..75m)       │
                │   - Shared CutawayUniforms           │
                │   - Plugin slots + AtlasV2SceneApi   │
                └─────────────────┬────────────────────┘
                                  ▼
                ┌──────────────────────────────────────┐
                │   5. atlas-camera-ui                 │
                │   (camera_experience_ux)             │
                │   SpatialCameraController (v2 modes) │
                │   Tokyo3DCanvas + Simulation HUD     │
                │   Train Inspector + Underground UX   │
                └──────────────────────────────────────┘
```

---

## 2. Existing Baseline Audit (Protected Invariants)

All five sessions MUST preserve the verified Phase 2 baseline (`lab/a-tokyo-atlas-fare @ 6001e82`):

1. **Stack**: React 19.1, TypeScript 5.8 (`strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`), Vite 6.3, MapLibre GL 5.4 (2D geo view), Three.js 0.187 (3D view), Vitest 3.1 (42+ unit tests), Playwright 1.52 (12 E2E tests).
2. **Three-Graph Separation (`src/domain/graphs.ts`)**:
   - `TrackGraph` (physical topology), `ServiceGraph` (operating patterns & through-services), and `FareRuleGraph` (JR statutory billing) remain strictly separate.
   - **JR Fare Engine (`src/domain/fareEngine.ts`) MUST NEVER be mutated by 3D geometry length, vertical exaggeration, or virtual train simulation.**
3. **ODbL 1.0 Share-Alike Isolation**:
   - `data/processed/atlas.json` contains **zero** `shareAlike: true` sources (`alignmentAndData.test.ts` enforces this!).
   - `data/processed/osm-vertical.json` and `public/data/urban-chunks/*` remain strictly separate files joined only at render/view time.
4. **P0 Zero Z-Fighting & Opaque Surface Pass**:
   - `WebGLRenderer` uses `logarithmicDepthBuffer: true`, `PCFSoftShadowMap`, `localClippingEnabled: true`, `ACESFilmicToneMapping`.
   - Surface city layers render strictly opaque (`transparent: false, depthWrite: true, FrontSide`) with calibrated elevation stratification (`-1.25m .. +7.40m`) and progressive `polygonOffsetFactor`.

---

## 3. Core Architectural Decisions for v2.0

### 3.1 Single Metric Coordinate Spine (`1 unit = 1 meter`)
- Origin `(0, 0, 0)` = Tokyo Station (`139.7671°E, 35.6812°N`), `+X = East`, `+Y = Up`, `-Z = North`.
- All 5 subsystems use `src/three/geoProjection.ts` (`lonLatToWorld`, `worldToLonLat`, `CHUNK_SIZE_METERS = 2000`) and `src/contracts/physicalTrackBuilder.ts`.

### 3.2 Strict Separation of Truth Domains (Honesty Discipline)
Every layer, dataset, and UI indicator MUST strictly distinguish four non-interchangeable domains:
1. **2D Geographic Alignment (`geo_accurate_2d`)**: KSJ N02 railway alignments and OSM footprints/roads.
2. **3D Schematic Verticality (`manual_verified_relative` / `osm_derived_3d` / `schematic_inferred`)**: Relative tiers `L+2 (+20)` down to `L-4 (-40)` — **NEVER presented as officially surveyed depth in meters**.
3. **Procedural Urban Infill & Prototype-Scale Assets (`procedural_infill` / `procedural_prototype_scale`)**: Street-block infill buildings (`hb="p"`), procedural tunnel interiors, and metric-scale 3D train models.
4. **Virtual Train Simulation (`synthetic_simulation` / `dataNature: 'synthetic'`)**: Deterministic physics-driven synthetic trains running on real `physical_track` topology — **MUST ALWAYS carry explicit "Virtual Simulation / 仮想運行シミュレーション" disclosure and NEVER impersonate live/real-time railway operations**.

### 3.3 Vertical Exaggeration Safety Invariant
- Macro cutaway views allow visual-only `verticalExaggeration` (`1.0× .. 2.5×`).
- `railLayer.group`, `viaductLayer.group`, and `tunnelLayer.group` may scale along Y for macroscopic separation; **HOWEVER, `rollingStockRenderer.group` MUST NEVER inherit `scale.y = verticalExaggeration`!**
- Instead, `samplePhysicalTrackPose(track, distM, dir, verticalExaggeration)` scales only `centerY = rawY * verticalExaggeration` and then adds unscaled `railHeadOffsetM` (`0.68m` surface / `0.48m` slab/tunnel), while computing exact grade `pitchRad`. Trains remain 1:1 metric proportion and flush on rail heads at every exaggeration setting.

### 3.4 Underground Camera Entry & Exit Continuity
- Above-ground overview: `camera.near` scales adaptively `4m .. 75m` for optimal depth precision across 30km.
- Inside tunnels / cab ride / underground close inspection (`camera.position.y < -1.5` or `cab_ride`): `Metropolitan3DScene` dynamically drops `camera.near` to `0.25m` so tunnel walls, lighting fixtures, platforms, and oncoming trains never near-clip.
- Radial GPU cutaway (`src/three/materials/cutawayShader.ts`) stays synchronized across terrain, buildings, cutaway strata pit, and tunnel cutaway styles (`solid_shell`, `translucent_shell`, `section_cutaway`, `interior_view`).

### 3.5 Performance Budget Architecture
- Instanced batching is mandatory for repeating assets: buildings (LOD1 `InstancedMesh` + lazy LOD0 + 5.8km eviction), sleepers/catenary/piers/stations (`InstancedMesh`), tunnel rings/lights (instanced or merged per line-tier), and rolling stock (LOD0 near articulated cars / LOD1 mid simplified box-cars / LOD2 far high-contrast light strips).
- Target budgets are defined in [ACCEPTANCE.md](./ACCEPTANCE.md).
