# Dispatch Report — P0-S2 (station-3d)

- **Status**: `PAUSED_QUOTA`
- **Branch**: `feat/p0-station-3d`
- **Base Commit**: `4baebcb`
- **Head Commit**: see `git log -1` (WIP checkpoint commit "wip(station-3d): M1 core ...")
- **Model Used**: Claude Opus 5.5

## 1. Owned Paths Check
- Modified/created files stay inside `ownedPaths`: `YES` (`packages/station-3d/**`, `pnpm-lock.yaml`, this report)

## 2. Milestones
- [~] M1: written — graph build (`src/graph/build.ts`), fare-boundary policy (`policy.ts`), dataset validator (`validate.ts`), lexicographic state-expanded Dijkstra (`src/route/search.ts`, `standard` / `step_free`, roadway + unverified cross-operator transfer never used), split-panel layout (`src/plan2d/layout.ts`), stateless `<StationPlan2D />`, local `<UnknownValue />`, trilingual UI strings, light/dark palettes. **Not yet green on lint.**
- [ ] M2: `StationSceneController` (imperative Three.js, InstancedMesh, render-on-demand, dispose) + `<StationExplorer />`.
- [ ] M3: `@senkiro/data-stations` (Umeda from `lab/b-umeda-3d:labs/b-umeda-3d/data/processed/station.json`, Shinjuku from `lab/c-shinjuku-3d:labs/c-shinjuku-3d/data/processed/station.json`), all-pairs invariants, final report.

## 3. Verification Results (Real Runs Only)
- `npx vitest run` in `packages/station-3d` → 31/31 passed (route 12, validate 12, plan2d 7).
- `npx tsc -p tsconfig.json --noEmit` in `packages/station-3d` → no output (pass).
- `npx biome check --error-on-warnings packages/station-3d` → **7 errors** (noArrayIndexKey in `StationPlan2D.tsx` track/footprint keys, and others not yet triaged).
- Root `pnpm check && pnpm build && pnpm test`: not run.

## 4. Contract Requests (draft, to confirm in M3)
- `Station.coordinates` / `StationComplex.coordinates`: neither lab has coordinates. Shinjuku can use Lab A's KSJ N02-24–derived points (`lab/a-tokyo-atlas-fare:labs/a-tokyo-atlas-fare/data/processed/atlas.json`). Umeda has none: either make the field `LonLat | null` or approve a CC0 (Wikidata) or KSJ source.
- Plan orientation: add `StationHubDataset.planFrame` (north axis). Lab C: north = `x-`; Lab B: north = `z-`. For now `<StationPlan2D planNorth>` is a prop, and it shows "unverified" when absent.
- `StationPlace.serviceLineIds`: Lab B records lines per platform, not per track.
- `UnknownValue` is a local copy until `packages/ui-kit` (P0-S3) lands.

## 5. Open-Source & Honesty Self-Check
- [x] No keys, `.env` or `data/raw/` committed
- [x] Test fixture is synthetic and marked `dataNature: 'synthetic'`
- [x] Route `distanceMeters` / `durationMinutes` always `null`

## 6. Resume Instructions
1. `cd E:\Workteree\SENKIRO\p0-station-3d\packages\station-3d`, then run `npx biome check --error-on-warnings .` and fix the 7 errors (use stable keys such as `${place.id}-r${i}` with a biome-ignore comment, or ids).
2. Re-run `npx vitest run` and `npx tsc -p tsconfig.json --noEmit`, then amend into a proper M1 commit.
3. M2 base: `git show lab/b-umeda-3d:labs/b-umeda-3d/src/Scene.tsx` plus Lab C `src/ui/scene/arch/*.ts` (railings, stair end strips, gate arrays, platform doors, buffer stops).
4. M3 mapping (decided): Lab C vertical stops become `landing` places joined to the host area by `passage` links, with one vertical link per consecutive stop pair. Gates become `gate` links (`exit-only` maps to `direction: 'forward'` paid→unpaid). Entrances become `entrance` places plus a `passage` link. Umeda `zone: 'paid'` becomes `paid:<station operator slug>`. Use `parseLegacyLabId` scopes `umeda` / `shinjuku`, with `{entity:'link'}` for `sk:gate:` and `sk:passage:`. Detect ID collisions (Lab C `sk:area:x` vs `sk:platform:x`). Busta / public-space are not railway operators, so their level `operatorId` is `null`.
