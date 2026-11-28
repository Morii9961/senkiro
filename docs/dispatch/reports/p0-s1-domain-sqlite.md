# Dispatch Report — P0-S1 (`p0-domain-sqlite`)

- **Status** `READY_FOR_MERGE`
- **Branch** `feat/p0-domain-sqlite`
- **Worktree** `E:\Workteree\SENKIRO\p0-domain-sqlite`
- **Base Commit** `4baebcb` (`integration/phase-0`)
- **Last verified code commit** `2afc6a66ee645d509a0631e4ac48a946c7276ec2` (M3). The immediately following commit updates this report.
- **Model Used** Claude Opus 5.5 (M1), Codex (M2/M3).

## 1. Owned Paths Check

- **Within owned paths** `YES`. The M1 `domain-core` tree is identical to `db908c2`.
- `git diff --name-only 4baebcb...HEAD`

```text
docs/dispatch/reports/p0-s1-domain-sqlite.md
packages/domain-core/package.json
packages/domain-core/src/alignment.ts
packages/domain-core/src/elevation-solver.ts
packages/domain-core/src/fare-rule-graph.ts
packages/domain-core/src/geo/projection.ts
packages/domain-core/src/index.ts
packages/domain-core/src/internal/min-heap.ts
packages/domain-core/src/service-graph.ts
packages/domain-core/src/track-graph.ts
packages/domain-core/tests/alignment.test.ts
packages/domain-core/tests/elevation-solver.test.ts
packages/domain-core/tests/fixtures.ts
packages/domain-core/tests/region-neutrality.test.ts
packages/domain-core/tests/service-graph.test.ts
packages/domain-core/tests/track-graph.test.ts
packages/domain-core/tsconfig.build.json
packages/domain-core/tsconfig.json
packages/domain-core/vitest.config.ts
packages/fare-engine/package.json
packages/fare-engine/src/engine.ts
packages/fare-engine/src/index.ts
packages/fare-engine/src/pack.ts
packages/fare-engine/src/packs/kansai/index.ts
packages/fare-engine/src/packs/kanto-jr/equivalence.ts
packages/fare-engine/src/packs/kanto-jr/index.ts
packages/fare-engine/src/packs/kanto-jr/rules.ts
packages/fare-engine/src/packs/kanto-jr/tariff.ts
packages/fare-engine/src/route.ts
packages/fare-engine/tests/fixtures/atlas.json
packages/fare-engine/tests/fixtures/atlas.ts
packages/fare-engine/tests/kanto-jr.test.ts
packages/fare-engine/tests/pipeline.test.ts
packages/fare-engine/tsconfig.build.json
packages/fare-engine/tsconfig.json
packages/fare-engine/vitest.config.ts
packages/local-db/package.json
packages/local-db/src/backup.ts
packages/local-db/src/db.ts
packages/local-db/src/ddl.ts
packages/local-db/src/driver.ts
packages/local-db/src/hlc.ts
packages/local-db/src/index.ts
packages/local-db/src/node.ts
packages/local-db/src/repository.ts
packages/local-db/src/schema.ts
packages/local-db/src/sqlite.worker.ts
packages/local-db/src/validation.ts
packages/local-db/src/wasm.ts
packages/local-db/src/web-protocol.ts
packages/local-db/src/web.ts
packages/local-db/tests/journey.test.ts
packages/local-db/tsconfig.build.json
packages/local-db/tsconfig.json
packages/local-db/vitest.config.ts
pnpm-lock.yaml
```

## 2. Milestones Completed

- [x] **M1** `db908c2` delivers `TrackGraphIndex`, `ServiceGraphIndex`, `FareRuleGraph`, the 650 m alignment guard, the schematic C0 elevation solver, and geographic distance helpers.
- [x] **M2** `7827276` and `6eadf35` deliver the region-neutral quote pipeline, local `FareEngineRulePack` extension, the Kanto JR pack, and the Kansai placeholder. The test fixture has 72 JR stations, 80 JR segments, one non-JR negative control, and seven source records. Lab A marks 66 stations and 74 segments as within the priced slice. For segments lacking an explicit slice flag, the fixture uses membership at both endpoints. The latest 40 tests include all 26 Lab A cases and separate regressions for Art. 16-2 on both sides of Atami.
- [x] **M3** `2afc6a6` delivers six Drizzle SQLite tables and deterministic DDL, an OPFS SAH-pool Worker and a Node WASM driver, the Expo adapter contract, and `JourneyRepository`. Ride writes include their segments, station and municipality evidence, and an HLC upsert in one transaction. Statistics use the contract visit predicate and `computeLineCoverage`. SQLite and JSON restores validate before committing a replacement.

The SQLite `visited_stations.municipality_code` column retains the caller-supplied station-to-area mapping for a countable visit. The aggregate and both restore routes require a matching countable visit on the triggering ride. `recordRide` adds a ride with a unique ID. The HLC node ID comes from the caller and the next clock value is derived under the write transaction.

The Kanto default fares and the four seat surcharges carry a synthetic disclaimer. `tariffProviders: []` withholds base prices when no table is available. The pre/post-revision cross-company pricing units reproduce the Lab A demo model. The post-March 14 line treatment keeps Atami–Mishima eligible for equivalence and preserves the separate Tokyo–Atami route. [JR East Art. 16-2](https://www.jreast.co.jp/ryokaku/02_hen/01_syo/01_setsu/03.html) · [JR East Art. 69](https://www.jreast.co.jp/ryokaku/02_hen/03_syo/01_setsu/03.html)

The Web driver returns `opfs-sahpool` or `memory-fallback`. OPFS initialization preserves existing pool storage on failure. SQLite's backup API copies staged, validated pages into the active database. [SQLite WASM persistence](https://sqlite.org/wasm/doc/trunk/persistence.md) · [SQLite Online Backup API](https://sqlite.org/c3ref/backup_finish.html) · [Drizzle proxy](https://orm.drizzle.team/docs/connect-drizzle-proxy)

## 3. Verification Results

- **M1 handoff evidence** `pnpm install --frozen-lockfile` exited 0. Biome, TypeScript typecheck and build passed for `domain-core`. Vitest passed 47 tests in five files.
- **Dependencies** The initial offline install lacked metadata for `vite@8.4.0`. `pnpm install --prefer-offline` completed after registry retries. `pnpm --filter @senkiro/local-db add drizzle-orm @sqlite.org/sqlite-wasm --prefer-offline` exited 0, locking `drizzle-orm@0.45.4` and `@sqlite.org/sqlite-wasm@3.54.1-build1`.
- **Final workspace run** On 2026-11-28, `pnpm check && pnpm build && pnpm test` exited 0 with no errors or warnings. Turbo executed all tasks with `TURBO_FORCE=true` and zero cache hits. The first workspace run reported Turbo's default shared worktree cache. The final run set `TURBO_CACHE_DIR` inside the assigned worktree. The Node negative tests assert the expected SQLite constraint and corrupt-file diagnostics.
- **Test totals** `contracts` 75, `domain-core` 47, `fare-engine` 40, `local-db` 12. Total 174 tests across 16 files.
- **Browser smoke** Headless Chromium ran the Web Worker in Vite dev and production builds. Writing, SQLite binary restore, and close/reopen passed on OPFS. A production build with `createSyncAccessHandle` disabled reported `memory-fallback`, completed the same round trip within the session, and reopened empty. Native Expo remains a type contract for Phase 5. Browser coverage is Chromium.

### M2 package run

`pnpm --filter @senkiro/fare-engine check && pnpm --filter @senkiro/fare-engine build && pnpm --filter @senkiro/fare-engine test` → exit `0`.

```text
Checked 17 files in 35ms. Fixed 2 files.

> @senkiro/fare-engine@0.1.0 check E:\Workteree\SENKIRO\p0-domain-sqlite\packages\fare-engine
> biome check --error-on-warnings . && tsc -p tsconfig.json --noEmit

Checked 17 files in 23ms. No fixes applied.

> @senkiro/fare-engine@0.1.0 build E:\Workteree\SENKIRO\p0-domain-sqlite\packages\fare-engine
> tsc -p tsconfig.build.json


> @senkiro/fare-engine@0.1.0 test E:\Workteree\SENKIRO\p0-domain-sqlite\packages\fare-engine
> vitest run


 RUN  v5.1.2 E:/Workteree/SENKIRO/p0-domain-sqlite/packages/fare-engine


 Test Files  2 passed (2)
      Tests  40 passed (40)
   Start at  16:47:41
   Duration  434ms (transform 63%, import 30%, tests 5%, worker 1%)
```

### M3 package run

`pnpm --filter @senkiro/local-db check && pnpm --filter @senkiro/local-db test` → exit `0`.

```text
Checked 1 file in 14ms. No fixes applied.

> @senkiro/local-db@0.1.0 check E:\Workteree\SENKIRO\p0-domain-sqlite\packages\local-db
> biome check --error-on-warnings . && tsc -p tsconfig.json --noEmit

Checked 19 files in 14ms. No fixes applied.

> @senkiro/local-db@0.1.0 test E:\Workteree\SENKIRO\p0-domain-sqlite\packages\local-db
> vitest run


 RUN  v5.1.2 E:/Workteree/SENKIRO/p0-domain-sqlite/packages/local-db


 Test Files  1 passed (1)
      Tests  12 passed (12)
   Start at  16:50:17
   Duration  657ms (import 62%, tests 23%, transform 14%, worker 1%)
```

### Chromium smoke output

```text
Chrome/159.0.8154.33
Vite dev {"mode":"opfs-sahpool","persisted":true,"byteLength":106496}
Vite build {"mode":"opfs-sahpool","persisted":true,"byteLength":106496}
Vite build, OPFS API unavailable {"mode":"memory-fallback","persisted":false,"byteLength":106496}
```

### Final workspace output

```text
> senkiro@0.0.0 check E:\Workteree\SENKIRO\p0-domain-sqlite
> biome check --error-on-warnings . && turbo run typecheck

Checked 85 files in 47ms. No fixes applied.

   • turbo 2.11.13
   • Packages in scope: @senkiro/contracts, @senkiro/domain-core, @senkiro/fare-engine, @senkiro/local-db
   • Running typecheck in 4 packages
   • Remote caching disabled

@senkiro/contracts:typecheck: cache bypass, force executing 57b87f9f1ed4c1a1
@senkiro/contracts:typecheck:
@senkiro/contracts:typecheck: > @senkiro/contracts@1.0.0 typecheck E:\Workteree\SENKIRO\p0-domain-sqlite\packages\contracts
@senkiro/contracts:typecheck: > tsc -p tsconfig.json --noEmit
@senkiro/contracts:typecheck:
@senkiro/domain-core:typecheck: cache bypass, force executing e23115dfb16187d2
@senkiro/local-db:typecheck: cache bypass, force executing 4a4d9fcd8302c7f7
@senkiro/domain-core:typecheck:
@senkiro/domain-core:typecheck: > @senkiro/domain-core@0.1.0 typecheck E:\Workteree\SENKIRO\p0-domain-sqlite\packages\domain-core
@senkiro/domain-core:typecheck: > tsc -p tsconfig.json --noEmit
@senkiro/domain-core:typecheck:
@senkiro/local-db:typecheck:
@senkiro/local-db:typecheck: > @senkiro/local-db@0.1.0 typecheck E:\Workteree\SENKIRO\p0-domain-sqlite\packages\local-db
@senkiro/local-db:typecheck: > tsc -p tsconfig.json --noEmit
@senkiro/local-db:typecheck:
@senkiro/fare-engine:typecheck: cache bypass, force executing e809937702e55b2c
@senkiro/fare-engine:typecheck:
@senkiro/fare-engine:typecheck: > @senkiro/fare-engine@0.1.0 typecheck E:\Workteree\SENKIRO\p0-domain-sqlite\packages\fare-engine
@senkiro/fare-engine:typecheck: > tsc -p tsconfig.json --noEmit
@senkiro/fare-engine:typecheck:

 Tasks:    4 successful, 4 total
Cached:    0 cached, 4 total
  Time:    1.814s


> senkiro@0.0.0 build E:\Workteree\SENKIRO\p0-domain-sqlite
> turbo run build


   • turbo 2.11.13
   • Packages in scope: @senkiro/contracts, @senkiro/domain-core, @senkiro/fare-engine, @senkiro/local-db
   • Running build in 4 packages
   • Remote caching disabled

@senkiro/contracts:build: cache bypass, force executing b5cc7e9755a88120
@senkiro/contracts:build:
@senkiro/contracts:build: > @senkiro/contracts@1.0.0 build E:\Workteree\SENKIRO\p0-domain-sqlite\packages\contracts
@senkiro/contracts:build: > tsc -p tsconfig.build.json
@senkiro/contracts:build:
@senkiro/local-db:build: cache bypass, force executing c9a0235599f4a1c7
@senkiro/domain-core:build: cache bypass, force executing 0f56fd4b402d4b10
@senkiro/local-db:build:
@senkiro/local-db:build: > @senkiro/local-db@0.1.0 build E:\Workteree\SENKIRO\p0-domain-sqlite\packages\local-db
@senkiro/local-db:build: > tsc -p tsconfig.build.json
@senkiro/local-db:build:
@senkiro/domain-core:build:
@senkiro/domain-core:build: > @senkiro/domain-core@0.1.0 build E:\Workteree\SENKIRO\p0-domain-sqlite\packages\domain-core
@senkiro/domain-core:build: > tsc -p tsconfig.build.json
@senkiro/domain-core:build:
@senkiro/fare-engine:build: cache bypass, force executing e54668019ff3fa01
@senkiro/fare-engine:build:
@senkiro/fare-engine:build: > @senkiro/fare-engine@0.1.0 build E:\Workteree\SENKIRO\p0-domain-sqlite\packages\fare-engine
@senkiro/fare-engine:build: > tsc -p tsconfig.build.json
@senkiro/fare-engine:build:

 Tasks:    4 successful, 4 total
Cached:    0 cached, 4 total
  Time:    1.865s


> senkiro@0.0.0 test E:\Workteree\SENKIRO\p0-domain-sqlite
> turbo run test


   • turbo 2.11.13
   • Packages in scope: @senkiro/contracts, @senkiro/domain-core, @senkiro/fare-engine, @senkiro/local-db
   • Running test in 4 packages
   • Remote caching disabled

@senkiro/contracts:typecheck: cache bypass, force executing 57b87f9f1ed4c1a1
@senkiro/contracts:test: cache bypass, force executing 6c1973ae5793c82a
@senkiro/contracts:typecheck:
@senkiro/contracts:typecheck: > @senkiro/contracts@1.0.0 typecheck E:\Workteree\SENKIRO\p0-domain-sqlite\packages\contracts
@senkiro/contracts:typecheck: > tsc -p tsconfig.json --noEmit
@senkiro/contracts:typecheck:
@senkiro/contracts:test:
@senkiro/contracts:test: > @senkiro/contracts@1.0.0 test E:\Workteree\SENKIRO\p0-domain-sqlite\packages\contracts
@senkiro/contracts:test: > vitest run
@senkiro/contracts:test:
@senkiro/domain-core:test: cache bypass, force executing 5b3a33ba7abf5450
@senkiro/domain-core:typecheck: cache bypass, force executing e23115dfb16187d2
@senkiro/local-db:test: cache bypass, force executing 811cf9c0005b921b
@senkiro/contracts:test:
@senkiro/contracts:test:  RUN  v5.1.2 E:/Workteree/SENKIRO/p0-domain-sqlite/packages/contracts
@senkiro/contracts:test:
@senkiro/domain-core:test:
@senkiro/domain-core:test: > @senkiro/domain-core@0.1.0 test E:\Workteree\SENKIRO\p0-domain-sqlite\packages\domain-core
@senkiro/domain-core:test: > vitest run
@senkiro/domain-core:test:
@senkiro/domain-core:typecheck:
@senkiro/domain-core:typecheck: > @senkiro/domain-core@0.1.0 typecheck E:\Workteree\SENKIRO\p0-domain-sqlite\packages\domain-core
@senkiro/domain-core:typecheck: > tsc -p tsconfig.json --noEmit
@senkiro/domain-core:typecheck:
@senkiro/local-db:test:
@senkiro/local-db:test: > @senkiro/local-db@0.1.0 test E:\Workteree\SENKIRO\p0-domain-sqlite\packages\local-db
@senkiro/local-db:test: > vitest run
@senkiro/local-db:test:
@senkiro/contracts:test:  ✓ |@senkiro/contracts| tests/fare.test.ts (13 tests) 12ms
@senkiro/contracts:test:  ✓ |@senkiro/contracts| tests/app-search-params.test.ts (10 tests) 18ms
@senkiro/contracts:test:  ✓ |@senkiro/contracts| tests/ids.test.ts (13 tests) 12ms
@senkiro/contracts:test:  ✓ |@senkiro/contracts| tests/ticket.test.ts (8 tests) 12ms
@senkiro/contracts:test:  ✓ |@senkiro/contracts| tests/odbl-and-service.test.ts (8 tests) 7ms
@senkiro/contracts:test:  ✓ |@senkiro/contracts| tests/journey.test.ts (11 tests) 6ms
@senkiro/contracts:test:  ✓ |@senkiro/contracts| tests/locale.test.ts (11 tests) 6ms
@senkiro/contracts:test:  ✓ |@senkiro/contracts| tests/version.test.ts (1 test) 3ms
@senkiro/contracts:test:
@senkiro/contracts:test:  Test Files  8 passed (8)
@senkiro/contracts:test:       Tests  75 passed (75)
@senkiro/contracts:test:    Start at  16:50:36
@senkiro/contracts:test:    Duration  672ms (import 74%, transform 16%, tests 6%, worker 4%)
@senkiro/contracts:test:
@senkiro/fare-engine:test: cache bypass, force executing b8e896cf2cc166a9
@senkiro/domain-core:test:
@senkiro/domain-core:test:  RUN  v5.1.2 E:/Workteree/SENKIRO/p0-domain-sqlite/packages/domain-core
@senkiro/domain-core:test:
@senkiro/local-db:test:
@senkiro/local-db:test:  RUN  v5.1.2 E:/Workteree/SENKIRO/p0-domain-sqlite/packages/local-db
@senkiro/local-db:test:
@senkiro/domain-core:test:  ✓ |@senkiro/domain-core| tests/track-graph.test.ts (14 tests) 11ms
@senkiro/domain-core:test:  ✓ |@senkiro/domain-core| tests/elevation-solver.test.ts (14 tests) 14ms
@senkiro/domain-core:test:  ✓ |@senkiro/domain-core| tests/service-graph.test.ts (3 tests) 4ms
@senkiro/domain-core:test:  ✓ |@senkiro/domain-core| tests/region-neutrality.test.ts (10 tests) 8ms
@senkiro/domain-core:test:  ✓ |@senkiro/domain-core| tests/alignment.test.ts (6 tests) 5ms
@senkiro/fare-engine:test:
@senkiro/fare-engine:test: > @senkiro/fare-engine@0.1.0 test E:\Workteree\SENKIRO\p0-domain-sqlite\packages\fare-engine
@senkiro/fare-engine:test: > vitest run
@senkiro/fare-engine:test:
@senkiro/domain-core:test:
@senkiro/domain-core:test:  Test Files  5 passed (5)
@senkiro/domain-core:test:       Tests  47 passed (47)
@senkiro/domain-core:test:    Start at  16:50:36
@senkiro/domain-core:test:    Duration  574ms (import 60%, transform 30%, tests 6%, worker 4%)
@senkiro/domain-core:test:
@senkiro/fare-engine:test:
@senkiro/fare-engine:test:  RUN  v5.1.2 E:/Workteree/SENKIRO/p0-domain-sqlite/packages/fare-engine
@senkiro/fare-engine:test:
@senkiro/local-db:test:  ✓ |@senkiro/local-db| tests/journey.test.ts (12 tests) 123ms
@senkiro/local-db:test:
@senkiro/local-db:test:  Test Files  1 passed (1)
@senkiro/local-db:test:       Tests  12 passed (12)
@senkiro/local-db:test:    Start at  16:50:36
@senkiro/local-db:test:    Duration  897ms (import 61%, tests 21%, transform 17%, worker 1%)
@senkiro/local-db:test:
@senkiro/fare-engine:test:  ✓ |@senkiro/fare-engine| tests/kanto-jr.test.ts (29 tests) 20ms
@senkiro/fare-engine:test:  ✓ |@senkiro/fare-engine| tests/pipeline.test.ts (11 tests) 12ms
@senkiro/fare-engine:test:
@senkiro/fare-engine:test:  Test Files  2 passed (2)
@senkiro/fare-engine:test:       Tests  40 passed (40)
@senkiro/fare-engine:test:    Start at  16:50:37
@senkiro/fare-engine:test:    Duration  333ms (import 65%, transform 20%, tests 12%, worker 3%)
@senkiro/fare-engine:test:

 Tasks:    6 successful, 6 total
Cached:    0 cached, 6 total
  Time:    2.856s
```

## Contract Requests

- `RegionalFareRulePack.precheck(context)` for checks before path resolution, with typed status, reason, and optional explanation steps. `FarePrecheckContext` carries the request and resolved endpoint stations.
- `RegionalFareRulePack.resolveRoutePreference(request)` for `pack:*` and optional default guidance. Promote a contract-owned description of waypoints, preferred or avoided line IDs, and filtering constraints so that `contracts` can remain independent of `domain-core` search types.
- `RegionalFareRulePack.resolveRuleVersion(travelDate)` for an active version within a single registration that has multiple date windows.
- `RegionalFareRulePack.computeValidityAndStopover(context)` for validity days, stopover permission, and optional rejection based on the actual and billed paths.
- `RegionalFareRulePack.pricingUnits(context)` for through or per-operator distance units. Each unit identifies the provider scope, display operator, distance, and shared zone tags. Official cross-company fare integration may also need to distinguish through tables from company-specific additions.
- `RegionalFareRulePack.lookupSurcharge(context)` for a priced seat charge with provenance and a disclaimer, or an honest unpriced result.
- `TariffProvider.sourceIds` for tariff-table attribution. All promoted hooks can remain optional to preserve compatibility with existing v1.0 packs.

## 5. Open-Source & Honesty Self-Check

- [x] Committed paths contain source, tests, package manifests, the lockfile, and this report. The processed Lab A fixture is attributed and passes ODbL isolation checks.
- [x] Non-OK quotes have a null total and an empty breakdown. The engine validates every result. Kansai quotes are unsupported until Phase 2 rules are loaded.
- [x] Synthetic prices carry the synthetic label and source. The SQLite and repository guards enforce the exact commemorative watermark and disabled barcode.
- [x] M1 retains its schematic elevation classifications and ODbL side-layer treatment.
