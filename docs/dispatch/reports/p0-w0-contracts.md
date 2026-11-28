# Dispatch Report — P0-W0 (`p0-w0-contracts`)

- **Status**: `READY_FOR_MERGE`
- **Branch**: `feat/p0-w0-contracts`
- **Base Commit**: `a7d94cb8282f33b8581e3f217db42b68a25646e7` (`integration/phase-0`)
- **Head Commit**: the commit that adds this report, a direct child of
  `14f10f41e856af266b102111b11fa397b0549818`. A commit cannot contain its own SHA; run
  `git rev-parse feat/p0-w0-contracts` to get it.
- **Model Used**: Claude Opus 5.5 (`claude-opus-5-5`, Claude Code desktop)

Milestone commits:

| Milestone | Commit | Subject |
| --- | --- | --- |
| M1 | `fd639cd` | chore(p0-w0): M1 monorepo foundation (pnpm + Turborepo + Biome + TS strict + Vitest) |
| M2 | `a6d09e1` | feat(contracts): M2 implement SENKIRO Domain Contract v1.0 in @senkiro/contracts |
| M3 | `14f10f4` | test(contracts): M3 add 75 Vitest contract tests and package README |
| M3 | *(this commit)* | docs(dispatch): P0-W0 handoff report; drop stale `onlyBuiltDependencies` entry |

## 1. Owned Paths Check

- Modified/created files stay strictly inside `ownedPaths`: `YES`
- `pnpm-lock.yaml` is committed at the root, as the brief allows ("任务背景与技术要点补充").
- Output of `git diff --name-only integration/phase-0...HEAD` (taken with this report staged):

```text
biome.json
docs/dispatch/reports/p0-w0-contracts.md
package.json
packages/contracts/README.md
packages/contracts/package.json
packages/contracts/src/app-search-params.ts
packages/contracts/src/base.ts
packages/contracts/src/errors.ts
packages/contracts/src/fare.ts
packages/contracts/src/guards.ts
packages/contracts/src/ids.ts
packages/contracts/src/index.ts
packages/contracts/src/journey.ts
packages/contracts/src/locale.ts
packages/contracts/src/service.ts
packages/contracts/src/station.ts
packages/contracts/src/track.ts
packages/contracts/tests/app-search-params.test.ts
packages/contracts/tests/fare.test.ts
packages/contracts/tests/fixtures.ts
packages/contracts/tests/ids.test.ts
packages/contracts/tests/journey.test.ts
packages/contracts/tests/locale.test.ts
packages/contracts/tests/odbl-and-service.test.ts
packages/contracts/tests/ticket.test.ts
packages/contracts/tests/version.test.ts
packages/contracts/tsconfig.build.json
packages/contracts/tsconfig.json
packages/contracts/vitest.config.ts
pnpm-lock.yaml
pnpm-workspace.yaml
tsconfig.base.json
turbo.json
vitest.config.ts
```

Nothing under `labs/`, `docs/01-domain-contract-v1.0.md` or any other `docs/` file was
modified. Lab branches were read only through `git show` / `git grep`.

## 2. Milestones Completed

- [x] **M1** · Root monorepo foundation
  - Environment: Node.js `v24.15.0`, pnpm `10.33.0`.
  - Root `package.json` has `packageManager: "pnpm@10.33.0"`, `license: "AGPL-3.0-only"`,
    `engines.node: ">=24.0.0"`, and the scripts `build`, `typecheck`, `lint`, `format`,
    `check` (`biome check --error-on-warnings . && turbo run typecheck`) and `test`.
  - `pnpm-workspace.yaml` covers `packages/*` and `apps/*`. `turbo.json` defines the
    `build` / `typecheck` / `lint` / `check` / `test` task graph. `biome.json` is strict and
    ignores `dist`, `node_modules`, `labs`, `worktrees`, `docs`, `*.md` and the lockfile.
    `tsconfig.base.json` sets `strict`, `noUncheckedIndexedAccess`,
    `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `moduleResolution: "bundler"`,
    `target: "ES2023"` and `skipLibCheck`, plus `noImplicitOverride`, `noImplicitReturns`,
    `noUnused*` and `rewriteRelativeImportExtensions`. The root `vitest.config.ts`
    aggregates the package and app projects.
  - Resolved toolchain: `typescript 7.0.2`, `turbo 2.11.13`, `@biomejs/biome 2.6.9`,
    `vitest 5.1.2` (Vite 8 / rolldown), `zod 4.6.7`.
- [x] **M2** · `@senkiro/contracts` implements the full contract
  - `SkId<T>`, `makeSkId`, `isSkId`, `parseSkId`, `safeParseSkId`, `parseLegacyLabId`.
  - `Locale` (`zh-CN` / `ja` / `en`), `LocalizedNames`, `resolveLocalizedName` (honest
    fallback chains from §2, never translates, all-null input gives `—` / `unknown`).
  - `BaseEntity`, `SourceRecord`, `Provenance` and the five graphs: `TrackGraph` (plus a
    physically separate ODbL `TrackVerticalLayer`), `StationGraph` / `StationHubDataset` /
    `StationRouteQuery|Result`, `ServiceGraph`, `FarePassGraph` (`TariffProvider`,
    `RegionalFareRulePack`, `PassProduct`, `PassEligibility`) and `JourneyGraph` (including
    `SyncOpLogEntry`).
  - Guards: `assertHonestFareQuote`, `assertValidCommemorativeTicket`, `assertOdbLIsolation`.
    Also `isCountableVisit`, `countVisitedStations`, `canTriggerMunicipalityVisit`,
    `computeLineCoverage` and `COUNTABLE_VISIT_SQL_PREDICATE`.
  - `appSearchParamsSchema` (Zod 4, output type exactly `AppSearchParams`),
    `createAppSearchParamsSchema(defaults)`, `parseAppSearchParams` (never throws) and
    `serializeAppSearchParams`.
- [x] **M3** · 75 Vitest tests (the brief asks for ≥ 30) and this report
  - Files: `ids` 13, `locale` 11, `fare` 13, `ticket` 8, `journey` 11, `odbl-and-service` 8,
    `app-search-params` 10, `version` 1.
  - Compile-time locks are checked with `@ts-expect-error` under `tsc`, which fails on an
    unused directive (verified with a throw-away probe file). The locks cover: non-`OK`
    quote with a yen amount or a breakdown, ticket with `allowsBarcode: true` or a wrong
    watermark, wrong-entity and legacy three-segment `SkId`s, and a non-v1.0 entity passed
    to `makeSkId`.

## 3. Verification Results (Real Runs Only)

All commands were run from the worktree root (`E:\Workteree\SENKIRO\p0-w0-contracts`) with
`TURBO_FORCE=true` (no Turbo cache) after `rm -rf packages/contracts/dist`:

- `pnpm install --frozen-lockfile` → Exit `0`, "Lockfile is up to date … Already up to date".
- `pnpm check` → Exit `0`. Biome: `Checked 31 files … No fixes applied.` (0 errors,
  0 warnings, run with `--error-on-warnings`). `turbo run typecheck`: `1 successful, 1 total`.
- `pnpm build` → Exit `0`. `tsc -p tsconfig.build.json` emitted `dist/` (ESM + `.d.ts` +
  maps): `1 successful, 1 total`.
- `pnpm test` → Exit `0`. `Test Files 8 passed (8)`, `Tests 75 passed (75)`.
- Extra checks:
  - `pnpm exec vitest run` from the root, through the root projects config: passed.
  - Node ESM smoke import of `dist/index.js`: 49 exports.
  - A scratch consumer type-checked against the emitted `dist/*.d.ts` with
    `moduleResolution: nodenext` and `skipLibCheck: false`: only its deliberate error appeared.
- Unrun checks: none required by the brief. No Playwright or E2E tests exist in this package.

## 4. Contract Requests (if any)

- **None blocking.** Where the contract text was silent, I made these decisions, all documented
  in `packages/contracts/README.md`. I recommend recording them in the next revision of
  `01-domain-contract-v1.0.md`:
  1. `SkId<T>` is an unbranded template literal (`sk:${T}:${string}:${string}`).
     Segment characters are validated at runtime.
  2. `FareQuote` is a discriminated union (`PricedFareQuote | UnpricedFareQuote`). Untrusted
     engine or JSON output is typed `FareQuoteDraft` until it passes `assertHonestFareQuote`.
     That guard also requires an `OK` quote to have a whole-yen total equal to the sum of a
     non-empty breakdown, and a non-blank `tariffDisclaimer` when `isSyntheticTariff`.
  3. `ResolvedPath.commonFareZoneTags: string[]` replaces Lab A's
     `allWithinTokyoSuburbanArea`. `FareRoutePreference = 'shortest' | 'shinkansen' |
     \`pack:${string}\`` replaces the Tokyo-specific route preferences.
  4. Shapes the doc names but does not define:
     - `StationExternalLink` (`kind`, `label`, `url`, `operatorId`, `stationId`, `sourceId`).
     - `StationHubDataset.disclaimer: LocalizedNames`.
     - `StationRouteStep` and the found / not-found result fields.
     - `Trip.direction` (Lab A enum).
     - `PassProduct.validityDays: number | null`.
     - `PassEligibility.uncoveredSegmentIds` / `requiredSupplements`.
     - `RegionalFareRulePack.appliesTo` / `evaluate` hooks.
     - The `TariffProvider.lookupBaseFare` result union.

     P0-S1 (fare engine) may want to refine the rule-pack hooks via its own Contract Request.
  5. Lab B/C use entity kinds that have no v1.0 prefix. `parseLegacyLabId` maps them through
     `LEGACY_ENTITY_ALIASES` (`platform`, `concourse`, `landing`, `entrance`, `area` → `place`;
     `vertical`, `elevator`, `escalator`, `stairs` → `link`). It refuses `passage`
     (a place in some labs and a link in others), `physical_track`, `direction`, `context`,
     `update` and `block` unless the caller passes `options.entity`. Slugs are never
     re-cased.
  6. `assertOdbLIsolation` treats `shareAlike: 'unknown'` and unregistered `sourceId`s as
     violations in a main dataset (conservative choice).
  7. `parseAppSearchParams` drops a `hub` that contradicts an explicit `region`; a `hub` alone
     implies its region. Free-text params are capped at 256 characters.
- **Deviation from the brief, for the coordinator to note:** `zod` is a `dependency` of
  `@senkiro/contracts`, not a root devDependency. The contracts package needs it at runtime,
  and the brief says zod is its only allowed runtime dependency.
- **Toolchain note:** pnpm resolved TypeScript **7.0.2** (native compiler). Every config used
  works with it. Wave 1 sessions inherit it through the lockfile.
- **Housekeeping (outside my owned paths, not touched):** Biome 2.6 also formats Markdown
  and JSON, and `docs/status/project-status.json` and `README.md` do not match its format.
  So `docs/` and `*.md` are excluded in `biome.json`. If the coordinator wants them
  formatted, it is a one-line `biome.json` change plus `biome check --write` on those files.

## 5. Open-Source & Honesty Self-Check

- [x] No API keys, tokens, `.env` or `data/raw/` committed. `node_modules/`, `dist/` and
  `.turbo/` are git-ignored.
- [x] No fabricated station, fare or schedule facts. Test fixtures use placeholder IDs
  (`test-a`, `test-operator` …) and amounts that are explicitly labelled "not a real fare".
  Contract examples come only from §3.1 of the contract doc. Unknown values are `null`.
- [x] Synthetic data and non-valid tickets are explicitly guarded:
  - `requiresSyntheticDisclosure` flags synthetic or non-timetable data.
  - Synthetic tariffs require a disclaimer.
  - Commemorative tickets require the exact `SAMPLE · 記念用 · 乗車不可` literal and
    `allowsBarcode: false`, and are rejected if they carry any QR, barcode, magnetic-stripe
    or NFC field.

## 6. Resume Instructions (Required if PAUSED_QUOTA or BLOCKED)

- Not applicable (`READY_FOR_MERGE`). Coordinator next step, per `HANDOFF_PROTOCOL.md` §5:
  verify the diff above, then `git merge --no-ff feat/p0-w0-contracts` into
  `integration/phase-0`, run `pnpm install --frozen-lockfile && pnpm check && pnpm build &&
  pnpm test`, and release Wave 1 (P0-S1 / P0-S2 / P0-S3).
