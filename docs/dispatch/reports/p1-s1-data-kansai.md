# Dispatch Report — P1-S1 (`p1-data-kansai`)

- **Status**: `READY_FOR_MERGE`
- **Branch**: `feat/p1-data-kansai`
- **Worktree**: `E:\Workteree\SENKIRO\p1-data-kansai`
- **Base Commit**: `734aa5acd77e492840f637b44b2087bc9594f0f4` (`integration/phase-1`)
- **Head Commit**: the commit adding this report, a direct child of `073ab2dd8006e69e7ae20f9aad6b5d780517a941`. Run `git rev-parse feat/p1-data-kansai` to inspect.
- **Model Used**: Gemini 4 Neon

| Milestone | Commit | Subject |
| --- | --- | --- |
| M1 | `3d70c8b` | feat(data-pipeline): add KSJ N02-24 reader, corridor slot assigner, and pure TS MVT/PMTiles v3 builder |
| M2 | `2c5f80c` | feat(data-kansai): build Kansai 8-operator atlas, Kanto preview migration, and PMTiles v3 archives |
| M3 | `073ab2d` | test(data-kansai): add Kansai invariants, Kanto preview isolation, and PMTiles v3 verification suites |
| M3 | *(this commit)* | docs(dispatch): P1-S1 final handoff report |

## 1. Owned Paths Check

- Modified/created files stay strictly inside `ownedPaths` (`packages/data-pipeline/**`, `packages/data-kansai/**`, `docs/dispatch/reports/p1-s1-data-kansai.md`, `pnpm-lock.yaml`): `YES`
- Output of `git diff --name-only 734aa5a...HEAD` (46 files prior to this report + `docs/dispatch/reports/p1-s1-data-kansai.md` = 47 files total):
  - `docs/dispatch/reports/p1-s1-data-kansai.md`
  - `packages/data-kansai/package.json`
  - `packages/data-kansai/scripts/build-datasets.ts`
  - `packages/data-kansai/scripts/build-kansai.ts`
  - `packages/data-kansai/scripts/build-kanto-preview.ts`
  - `packages/data-kansai/src/index.ts`
  - `packages/data-kansai/src/kansai/catalog.ts`
  - `packages/data-kansai/src/kansai/generated/kansai-meta.ts`
  - `packages/data-kansai/src/kansai/generated/kansai-segments-1.ts`
  - `packages/data-kansai/src/kansai/generated/kansai-segments-2.ts`
  - `packages/data-kansai/src/kansai/generated/kansai-segments-3.ts`
  - `packages/data-kansai/src/kansai/generated/kansai-segments-4.ts`
  - `packages/data-kansai/src/kansai/generated/kansai-segments.ts`
  - `packages/data-kansai/src/kansai/generated/kansai-stations.ts`
  - `packages/data-kansai/src/kansai/index.ts`
  - `packages/data-kansai/src/kanto-preview/generated/kanto-meta.ts`
  - `packages/data-kansai/src/kanto-preview/generated/kanto-segments-1.ts`
  - `packages/data-kansai/src/kanto-preview/generated/kanto-segments-2.ts`
  - `packages/data-kansai/src/kanto-preview/generated/kanto-segments.ts`
  - `packages/data-kansai/src/kanto-preview/generated/kanto-stations.ts`
  - `packages/data-kansai/src/kanto-preview/generated/kanto-vertical-odbl.ts`
  - `packages/data-kansai/src/kanto-preview/index.ts`
  - `packages/data-kansai/src/types.ts`
  - `packages/data-kansai/tests/kansai-invariants.test.ts`
  - `packages/data-kansai/tests/kanto-preview.test.ts`
  - `packages/data-kansai/tests/pmtiles-archives.test.ts`
  - `packages/data-kansai/tiles/kansai-rail.pmtiles`
  - `packages/data-kansai/tiles/kanto-rail-vertical.odbl.pmtiles`
  - `packages/data-kansai/tiles/kanto-rail.pmtiles`
  - `packages/data-kansai/tsconfig.build.json`
  - `packages/data-kansai/tsconfig.json`
  - `packages/data-kansai/vitest.config.ts`
  - `packages/data-pipeline/package.json`
  - `packages/data-pipeline/src/alignment-pipeline.ts`
  - `packages/data-pipeline/src/corridor-slots.ts`
  - `packages/data-pipeline/src/geojson-vt-bridge.ts`
  - `packages/data-pipeline/src/geojson-vt.d.ts`
  - `packages/data-pipeline/src/index.ts`
  - `packages/data-pipeline/src/ksj-reader.ts`
  - `packages/data-pipeline/src/mvt-decoder.ts`
  - `packages/data-pipeline/src/mvt-encoder.ts`
  - `packages/data-pipeline/src/pmtiles-writer.ts`
  - `packages/data-pipeline/src/zip-reader.ts`
  - `packages/data-pipeline/tests/corridor-slots.test.ts`
  - `packages/data-pipeline/tests/ksj-split.test.ts`
  - `packages/data-pipeline/tests/mvt-pmtiles.test.ts`
  - `packages/data-pipeline/tsconfig.build.json`
  - `packages/data-pipeline/tsconfig.json`
  - `packages/data-pipeline/vitest.config.ts`
  - `pnpm-lock.yaml`

## 2. Milestones Completed

- [x] **M1 · `@senkiro/data-pipeline`**:
  - Read-only ZIP (`node:zlib`) and KSJ N02-24 GeoJSON extractor with Kansai bounding box (`[134.60, 34.20, 136.35, 35.35]`) and deterministic JR West `東海道線`/`山陽線` split at `京都` and `大阪` (`jr-west-biwako`, `jr-west-kyoto`, `jr-west-kobe`).
  - 650 m cross-source spatial alignment wrapper over `@senkiro/domain-core` (`alignKsjStationsToTargets`) and deterministic parallel corridor slot assigner (`assignCorridorSlots`).
  - Pure TypeScript MVT v2.1 Protobuf encoder/decoder (`encodeMvtTile` / `decodeMvtTile`) and PMTiles v3 archive builder (`buildPmtilesArchive`, `buildAtlasPmtiles`, `buildVerticalOdblPmtiles`) with SHA-256 tile deduplication, RLE compression, and automatic leaf directory splitting. Zero external binaries or `postinstall` scripts (`geojson-vt ^4.0.2`, `pmtiles ^4.3.0`).
- [x] **M2 · `@senkiro/data-kansai`**:
  - Kansai 8-operator atlas (`kansaiTrackGraph`, `kansaiThroughServices`, `kansaiAtlasBundle`): 8 operators, 63 frozen lines (including all 19 Umeda lines), 878 stations, 908 segments, 16 complexes, 32 interchanges, 5 through services, and 161 explicit `UnalignedRecord` disclosures.
  - Strict hub boundaries: `osaka-umeda` 7 stations 100% aligned with `@senkiro/data-stations/umeda`; `kyoto` strictly 4 stations (`jr-west-kyoto`, `jr-central-kyoto`, `kintetsu-kyoto`, `kyoto-subway-kyoto`) with `explicitlyExcluded` covering `hankyu-kyoto-kawaramachi`, `keihan-gion-shijo`, `hankyu-karasuma`, `kyoto-subway-shijo`, `keihan-shichijo`; `takeda` excludes Hyogo Bantan Line `竹田` (`005116`).
  - Kanto preview migration (`kantoTrackGraph`, `kantoThroughServices`, `kantoPreviewAtlasBundle`) read-only from `lab/a-tokyo-atlas-fare`, upgraded via `parseLegacyLabId` to v1.0 four-segment `SkId`, aligned with `shinjukuHubDataset` 10-station IDs and `kanto-jr` fare-engine line IDs.
  - Physically isolated ODbL 1.0 vertical layer (`kantoVerticalLayer` in `src/kanto-preview/generated/kanto-vertical-odbl.ts` and `tiles/kanto-rail-vertical.odbl.pmtiles`).
- [x] **M3 · `.pmtiles` Archives & Invariant Verification**:
  - Generated `tiles/kansai-rail.pmtiles` (`2,012,576` bytes, `z6–z15`), `tiles/kanto-rail.pmtiles` (`1,145,420` bytes, `z6–z15`), and `tiles/kanto-rail-vertical.odbl.pmtiles` (`417,495` bytes, `z10–z15`).
  - Verified all invariants in `@senkiro/data-pipeline` (8 tests) and `@senkiro/data-kansai` (12 tests) plus full workspace checks across all 10 packages.

## 3. Verification Results (Real Runs Only)

- Command: `pnpm --filter @senkiro/data-kansai data:build` → Exit `0`
  - Built Kansai (8 operators, 63 lines, 878 stations, 908 segments, 16 complexes, 32 interchanges, 161 unaligned) and Kanto preview (15 operators, 40 lines, 482 stations, 503 segments, 401 complexes, 503 ODbL vertical records) + 3 PMTiles v3 archives.
- Command: `pnpm check` (`biome check --error-on-warnings . && turbo run typecheck`) → Exit `0`
  - Biome checked 246 files (0 errors, 0 warnings); Turbo typecheck passed 10/10 packages.
- Command: `pnpm build` (`turbo run build`) → Exit `0`
  - Turbo build passed 10/10 packages (including `@senkiro/web` Vite production build).
- Command: `pnpm test` (`turbo run test`) → Exit `0`
  - Turbo test passed 17/17 tasks across all 10 projects (40 test files, 327 passed tests, 0 failed, 0 skipped):
    - `@senkiro/contracts`: 9 files, 83 tests
    - `@senkiro/ui-kit`: 7 files, 27 tests
    - `@senkiro/domain-core`: 5 files, 47 tests
    - `@senkiro/data-pipeline`: 3 files, 8 tests
    - `@senkiro/fare-engine`: 2 files, 40 tests
    - `@senkiro/local-db`: 1 file, 12 tests
    - `@senkiro/data-kansai`: 3 files, 12 tests
    - `@senkiro/station-3d`: 6 files, 49 tests
    - `@senkiro/data-stations`: 1 file, 8 tests
    - `@senkiro/web`: 3 files, 41 tests
- Unrun checks: `pnpm test:e2e` (Playwright browser E2E not required/scoped for Wave 1 data packages).

## 4. Contract Requests (if any)

- None.

## 5. Open-Source & Honesty Self-Check

- [x] No API keys, tokens, `.env` or `data/raw/` / `.zip` files committed
- [x] No fabricated station/fare/schedule facts; unverified `operatingKm` and `walkingMinutes` are `null`, unverified translations remain `null`, and out-of-scope KSJ stations are retained in `unalignedRecords`
- [x] ODbL 1.0 (`shareAlike: true`) data physically isolated in `kanto-vertical-odbl.ts` and `kanto-rail-vertical.odbl.pmtiles`; `assertOdbLIsolation` passes on both `kansaiTrackGraph` and `kantoTrackGraph`
- [x] Synthetic data / non-valid tickets explicitly guarded (`@senkiro/contracts` / `@senkiro/fare-engine` unmodified and passing)
