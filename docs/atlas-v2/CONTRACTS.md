# SENKIRO Tokyo Atlas 3D v2.0 — Frozen Interface & Data Contracts

> **Canonical TypeScript Source of Truth**:
> - Pure-TS Contracts: `labs/a-tokyo-atlas-fare/src/contracts/atlasV2.ts`
> - `physical_track` Builder & Pose Sampler: `labs/a-tokyo-atlas-fare/src/contracts/physicalTrackBuilder.ts`
> - Three.js Adapter Interfaces: `labs/a-tokyo-atlas-fare/src/three/contracts/adapters.ts`
> - Baseline Domain Entities: `labs/a-tokyo-atlas-fare/src/domain/types.ts` & `src/domain/elevationSolver.ts`
>
> **Change Control Rule**: Cross-module contract modifications MUST be proposed to the Lead Architect (`integration/atlas-v2`) first. Worktree sessions MUST NOT edit `src/contracts/**` or `src/three/contracts/**` directly.

---

## 1. Geographic, Local Metric & Elevation Coordinate Contract

| Property | Specification | Source |
| --- | --- | --- |
| Geographic CRS | WGS84 `[lon, lat]` (`GeoLonLat`) | `src/domain/types.ts` |
| Local World Projection | Tangent plane, right-handed Three.js: `+X = East`, `+Y = Up`, `-Z = North` (`+Z = South`), `1 unit = 1.0 meter` | `src/three/geoProjection.ts` |
| Projection Origin | Tokyo Station `(139.7671°E, 35.6812°N)` → `(0, 0, 0)` | `TOKYO_ORIGIN` |
| Scale Constants | `METERS_PER_DEG_LAT = 111_132.95`, `METERS_PER_DEG_LON_AT_EQ = 111_319.49` | `src/three/geoProjection.ts` |
| Spatial Chunk Grid | `CHUNK_SIZE_METERS = 2000`, `cx = floor(x / 2000)`, `cz = floor(z / 2000)` | `worldToChunkCoords()` |

### 1.1 Surface Elevation Stratification (`SURFACE_ELEVATION_LAYERS`)
All `atlas-city` ground/water/park/road meshes MUST honor these non-overlapping Y levels (when `datumKind === 'flat_datum'`):
- Base ground plane: `-1.25m` (`polygonOffsetFactor = 6`)
- Tokyo Bay: `-0.95m` (`5`)
- Landuse blocks (industrial / residential / commercial): `-0.83m / -0.80m / -0.76m` (`4`)
- River quays & inner water: `-0.65m` / `-0.58m .. -0.49m` (`3`)
- Parks & greenery: `-0.34m .. -0.22m` (`2`)
- Railway gravel corridors: `-0.14m` (`2`)
- Sidewalks & station plazas: `-0.06m` (`1`)
- Local / Secondary / Arterial roads: `+0.03m / +0.09m / +0.16m` (`1`)
- Elevated expressways: `+7.40m`

### 1.2 Railway Schematic Tiers & Portal Threshold
- `L+2 (+20)`, `L+1 (+10)`, `L0 (0)`, `L-1 (-10)`, `L-2 (-20)`, `L-3 (-30)`, `L-4 (-40)` (`SCHEMATIC_TIERS` in `elevationSolver.ts`).
- Underground tunnel threshold: `y < -2.4` (`TRACK_CLEARANCE_STANDARDS.tunnelPortalThresholdY`).
- Minimum vertical deconfliction clearance at non-junction crossings: `>= 5.5` schematic units (`elevationSolver.ts` targets `6.5`).

---

## 2. Track-to-Train-to-Tunnel Clearance & Orientation Contract

Every subsystem touching tracks, tunnels, stations, rolling stock, or cameras MUST adhere to `TRACK_CLEARANCE_STANDARDS`:

1. **Rail Head Height (`railHeadOffsetM`)**:
   - Surface ballasted track (`L0`): `+0.68m` above track spline `y` (`0.32m` ballast + `0.36m` rail).
   - Viaduct & Underground slab track (`L+1`, `L+2`, `L-1..L-4`): `+0.48m` above track spline `y` (`0.12m` slab + `0.36m` rail).
2. **Japanese Left-Hand Running (`左側通行`)**:
   - Segment forward tangent `(dx, dz)` defines right-hand normal `(rx, rz) = (-dz/len, dx/len)`.
   - `direction = +1` (`fromStation -> toStation`): runs on **LEFT** track (`lateralOffsetM = -trackHalfSpacingM`).
   - `direction = -1` (`toStation -> fromStation`): runs on **RIGHT** side of `+1` centerline (`+trackHalfSpacingM`), which is LEFT when facing `-1`.
   - Single track: `lateralOffsetM = 0.0m`.
   - Half track center-to-center spacing (`trackHalfSpacingM`):
     - Conventional double-track: `1.85m` (`3.70m` center-to-center)
     - Shinkansen double-track: `2.15m` (`4.30m` center-to-center)
     - Linear Metro (Toei Oedo): `1.75m` (`3.50m` center-to-center)
3. **Mandatory Vehicle Local Axes (`atlas-rollingstock` & `atlas-simulation`)**:
   - Local `+Z` = Forward (front cab nose faces `+Z`, tail faces `-Z`).
   - Local `+Y` = Up.
   - Local `y = 0.0` = Bottom of wheel tread (rests flush on rail head).
   - Rotation Euler order = `'YXZ'`:
     - `yawRad = Math.atan2(dirX, dirZ)`
     - `pitchRad = -Math.asin(clamp(dirY, -0.98, 0.98))`
     - `rollRad = 0`
   - Verified by unit test in `tests/unit/contractsV2.test.ts`.
4. **Minimum Tunnel Structure Gauge Envelope (`atlas-underground` vs `atlas-rollingstock`)**:
   - Conventional tunnel interior: `halfWidthM >= 4.6m`, `headroomAboveRailM >= 5.2m`.
   - Shinkansen tunnel interior: `halfWidthM >= 5.6m`, `headroomAboveRailM >= 5.8m`.
   - Linear Metro (Oedo) tunnel interior: `halfWidthM >= 4.2m`, `headroomAboveRailM >= 4.2m`.
   - Every car in `ROLLING_STOCK_CATALOG` is unit-tested to stay strictly inside these envelopes with zero wall or oncoming-train collisions.

---

## 3. `physical_track` & Topology Contract

Built deterministically via `buildPhysicalTrackGraph(dataset, solved)` in `src/contracts/physicalTrackBuilder.ts`:

- **`PhysicalTrack`**: 1:1 with `SolvedSegment3D` (`id: sk:physical_track:<slug>`), carrying `segmentId`, `primaryLineId`, `railLineIds`, `operatorId`, `fromStationId`, `toStationId`, `isDoubleTrack`, `isShinkansen`, `gaugeMm` (`1067 | 1372 | 1435`), `electrification` (`overhead_dc_1500v | overhead_ac_25kv | third_rail_600v | linear_motor_dc_1500v`), `trackHalfSpacingM`, `railHeadOffsetM`, `operatingKm` (immutable statutory km), `geometryLengthM` (3D metric length), `maxSpeedKmh`, `points`, `portals`, `dominantTier`, `dominantStructure`, `heightBasis`, `geometryFidelity`, `provenance`.
- **`TrackConnection`**: Directed topological links at station endpoints (`continuation | branch | loop_closure | through_service | turnback`) with gauge compatibility enforced.
- **`StationAnchor3D`**: Exact 3D station platform anchors aligned with track tangents, `stationComplexId`, `platformLengthM`, and `platformLayout`.
- **`samplePhysicalTrackPose(track, distM, direction, verticalExaggeration)`**: Canonical pose sampler shared by simulation, rolling stock, tunnel fixtures, and train-follow cameras.

---

## 4. Subsystem Adapter Contracts (`src/three/contracts/adapters.ts`)

| Session | Adapter / Primary Export | Required Contract Responsibilities |
| --- | --- | --- |
| `atlas-city` | `CityLayerAdapter` (plus backward-compatible `CityTerrainLayer`, `CityChunkManager`, `FacadeMaterialLibrary`, `SkyEnvironmentSystem`) | Preserve `CutawayUniforms` radial excavation compatibility; expose `CityTerrainElevationSampler` (`flat_datum` or `dem_meters`); keep real OSM vs schematic infill counts honest (`hb='p'`); support day/dusk/night lighting. |
| `atlas-underground` | `UndergroundLayerAdapter` (plus backward-compatible `TunnelAndStationLayer`, `RailTrackLayer`, `ViaductLayer`, `CutawayPitVisuals`) | Respect `minTunnelClearance` envelope; support `TunnelCutawayStyle` (`solid_shell`, `translucent_shell`, `section_cutaway`, `interior_view`); preserve station `InstancedMesh` picking (`resolveStationHit`); ensure portals/shafts/concourses align with `PhysicalTrack.portals` & `StationAnchor3D`. |
| `atlas-rollingstock` | `RollingStockRendererAdapter` (exported from `src/three/rollingstock/index.ts`) | Implement prototype-scale procedural 3D trains matching `ROLLING_STOCK_CATALOG` (12 Tokyo models including E235-0, E233, N700S, E5, Metro 1000/2000/16000/17000/18000, Toei 12-600); follow local `+Z` forward & `y=0` wheel tread; keep `group.scale.y === 1.0`; support 3-tier distance LOD, headlights/taillights, interior glow, and `resolveTrainHit()`. |
| `atlas-simulation` | `TrainSimulationEngineAdapter` (exported from `src/simulation/index.ts`, Pure TS zero Three.js/React) | Drive deterministic multi-car virtual trains strictly on `PhysicalTrackGraph` using `samplePhysicalTrackPose()`; compute per-car articulated `carPoses[]` bending around curves & vertical grades; model acceleration/cruise/braking/station dwell/door state/turnback & through-running; tag every state with `isVirtualSimulation: true, dataNature: 'synthetic'`; provide deterministic `getDemoUndergroundTrainId()`. |
| `atlas-camera-ui` | `CameraControllerV2Adapter` + UI panels (`src/ui/Tokyo3DCanvas.tsx`, `SimulationPanel.tsx`, `TrainInspector.tsx`, `CameraHud.tsx`) | Consume `Metropolitan3DScene` via `AtlasV2SceneApi`; support `map`, `free`, `follow_train` (`chase/side/cab/overhead_cutaway`), `underground_inspect`, `station_focus`; guarantee clean underground entry/exit & one-click Return to Surface; prominently label virtual simulation as synthetic (never real-time); keep EN/JA i18n, dark/light themes, and existing `data-testid` hooks intact. |

---

## 5. Data Provenance, License & Geometry Fidelity Rules

1. **No Conflation**: UI and telemetry MUST separately report:
   - Geographic accuracy (`KSJ N02` / `OSM` 2D)
   - Schematic 3D vertical depth (`L+2..L-4`, NOT surveyed meters)
   - Procedural infill buildings (`hb='p'`) vs real OSM buildings (`o/l/i`)
   - Virtual simulation trains (`dataNature: 'synthetic'`, `disclaimerCode: 'VIRTUAL_SIMULATION_NOT_REALTIME'`)
2. **ODbL Isolation**: Never import `osm-vertical.json` or `urban-chunks/*` into `src/domain/fareEngine.ts` or `data/processed/atlas.json`.
3. **No Fabricated Real-Time Claims**: Never display real timetables, live delays, or live train numbers as real-time feeds unless backed by a licensed, verified live `SourceRecord`.
4. **Open-Source Hygiene**: Zero secrets/API keys, zero copyrighted operator logos or official station maps, and zero unvetted binary assets committed to Git.
