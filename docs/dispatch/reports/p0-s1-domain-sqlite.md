# Dispatch Report — P0-S1 (`p0-domain-sqlite`)

- **Status**: `PAUSED_QUOTA`
- **Branch**: `feat/p0-domain-sqlite` (worktree `E:\Workteree\SENKIRO\p0-domain-sqlite`)
- **Base Commit**: `4baebcb` (`integration/phase-0`)
- **Last green commit**: `db908c2` (M1). This report is added in the commit right after it.
- **Model Used**: Claude Opus 5.5 (`claude-opus-5-5`, Claude Code desktop)

## 1. Owned Paths Check
- Modified/created files stay strictly inside `ownedPaths`: `YES`
- `git diff --name-only 4baebcb...HEAD`: `packages/domain-core/**`, `pnpm-lock.yaml` (workspace link only), this report.

## 2. Milestones Completed
- [x] M1: `@senkiro/domain-core`: `TrackGraphIndex`, `ServiceGraphIndex`, `FareRuleGraph`, 650 m alignment guard (`alignExternalStations`), schematic C0 elevation solver (`solveRailwayNetwork3D`), local projection and haversine helpers.
- [ ] M2: `@senkiro/fare-engine` (region-free engine + `packs/kanto-jr` + Kansai slot).
- [ ] M3: `@senkiro/local-db` (Drizzle schema, `LocalDbDriver`, sqlite-wasm OPFS worker, Node test driver), full-repo verification.

## 3. Verification Results (Real Runs Only)
- `pnpm install --frozen-lockfile` → exit 0 (Wave 0 baseline).
- `packages/domain-core`: `vitest run` → 5 files, 47/47 passed; `biome check --error-on-warnings .` → clean; `tsc -p tsconfig.json --noEmit` → exit 0; `tsc -p tsconfig.build.json` → exit 0.
- Not run yet: root `pnpm check && pnpm build && pnpm test` (due at M3).

## 4. Contract Requests (if any)
- None yet. Expected at M2: `RegionalFareRulePack` has no hooks for actual-path resolution of `pack:*` route preferences, validity days / stopover, per-operator pricing units, or surcharges. Plan: define these as an optional extension interface inside `packages/fare-engine` and ask the coordinator to promote them into `@senkiro/contracts`.

## 5. Open-Source & Honesty Self-Check
- [x] No API keys, tokens, `.env` or `data/raw/` committed
- [x] No fabricated station/fare/schedule facts. Tests use an invented "Testville" network (`dataNature: 'synthetic'`), plus Lab A's real name-normalisation cases as alignment fixtures.
- [x] Honesty fixes over Lab A: shinkansen heights with no evidence are now `inferred-schematic` (Lab A labelled them `osm-derived-schematic`); the unsourced `isDoubleTrack` hint was dropped; verified overrides are keyed by station ID and carry `sourceIds`; results list the share-alike sources they used.

## 6. Resume Instructions
1. Work in `E:\Workteree\SENKIRO\p0-domain-sqlite` on `feat/p0-domain-sqlite`. Do not switch branches in `E:\SENKIRO`, which is on `lab/a-tokyo-atlas-fare` with uncommitted changes.
2. **M2:** read Lab A `fareEngine.ts`, `fareRules.ts`, `fareTariff.ts` and `tests/unit/fareEngine.test.ts` (26 golden cases) with `git show lab/a-tokyo-atlas-fare:labs/a-tokyo-atlas-fare/...`.
   - Build a test fixture from the 72 JR stations and 80 JR segments in Lab A `data/processed/atlas.json`. Convert IDs to v1.0 (`sk:station:kanto:<slug>`, `sk:operator:jp:jr-east`), map `inTokyoSuburbanArea` to the `'suburban:tokyo'` fare-zone tag and `inFareSlice` to a slice tag, and copy the matching `sources.json` records.
   - Engine order: date format check (ERROR), then station existence (MISSING_DATA), then same origin/destination (NOT_APPLICABLE), then pack selection by operator slug (NOT_APPLICABLE when no pack matches; ERROR when several do), then the pack's `validFrom`/`validTo` window (STALE_RULE), then the pack precheck (IC card / outside slice gives UNSUPPORTED), then path resolution, `appliesTo`, `evaluate`, `TariffProvider` pricing and surcharge.
   - Wrap every output in `createUnpricedFareQuote` / `assertHonestFareQuote`.
   - Use `createKantoJrRulePack({ trackGraph, fareRuleGraph, tariffProviders? })`, with route preferences `pack:saikyo_bypass`, `pack:yokosuka_bypass`, `pack:oku_bypass` and `pack:yamanote_loop_detour`.
   - Add a placeholder Kansai pack that returns UNSUPPORTED.
3. **M3:** use `drizzle-orm@^0.45.4` (sqlite-proxy) and `@sqlite.org/sqlite-wasm@^3.54.1-build1`. Its `node` export lets the in-memory Node test driver use the same engine as the browser.
   - Write the DDL by hand (no drizzle-kit), and add a test that checks `PRAGMA table_info` against the schema.
   - Add CHECK constraints for the watermark literal, `allows_barcode = 0`, `visit_kind` and `op`.
   - Count visits with `COUNTABLE_VISIT_SQL_PREDICATE`.
   - Use `lib: ["ES2023","WebWorker"]` in local-db only.
   - Then run root `pnpm check && pnpm build && pnpm test`, set this report to `READY_FOR_MERGE`, and commit.
