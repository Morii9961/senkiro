# Dispatch Report — P0-S3 (`p0-ui-web-shell`)

- **Status**: `PAUSED_QUOTA`
- **Branch**: `feat/p0-ui-web-shell`
- **Base Commit**: `4baebcbca3cfbd780d34691a748110837aa30010` (`integration/phase-0`)
- **Latest green commit**: `5b567a1` (M1). This report is committed on top of it.
- **Model Used**: Claude Opus 5.5 (`claude-opus-5-5`, Claude Code desktop)

## 1. Owned Paths Check

- Modified/created files stay strictly inside `ownedPaths`: `YES`
- Committed so far: `packages/ui-kit/**`, `pnpm-lock.yaml`, and this report.
- `pnpm-lock.yaml` was updated by `pnpm install` / `pnpm add`. Root `package.json` and
  the other root configs are unchanged.

## 2. Milestones Completed

- [x] **M1** · `@senkiro/ui-kit` (commit `5b567a1`)
  - Tokens (`src/styles/tokens.css`): a washi-paper light theme and a graphite dark theme
    (`#181c22` / `#262b33`), both with the same set of colour tokens (a test checks this).
    The theme is selected with `data-theme` on `<html>`, and dark is the default.
  - CSS Modules + Radix: `LineBadge`, `ProvenanceTag` (Popover; synthetic-data warning
    driven by `requiresSyntheticDisclosure`; only http(s) links), `UnknownValue`,
    `SegmentedControl` (ToggleGroup radiogroup that can never be cleared), `FloatingCard`,
    `DrawerPanel` (non-modal Radix Dialog; becomes a bottom sheet below 768px; accepts a
    `container` portal target), `SignCode` and `VisuallyHidden`.
  - Copy for zh-CN / ja / en lives in `src/strings.ts`.
  - Checks: 27 tests, `tsc`, `biome check --error-on-warnings` and `vite build` (lib
    mode) all passed.
- [ ] **M2** · `apps/web` shell (started, not committed)
- [ ] **M3** · web tests, full `pnpm check && pnpm build && pnpm test`, final report

## 3. Verification Results (Real Runs Only)

Run in `packages/ui-kit` at `5b567a1`:

- `pnpm exec vitest run` → Exit `0`: `Test Files 7 passed (7)`, `Tests 27 passed (27)`,
  with no console warnings.
- `pnpm exec tsc -p tsconfig.json --noEmit` → Exit `0`.
- `pnpm exec biome check --error-on-warnings .` → Exit `0`, `Checked 32 files`.
- `pnpm build` → Exit `0`, producing `dist/index.js` and `dist/ui-kit.css`.
- **Not run yet**: the root-level `pnpm check && pnpm build && pnpm test`.
- **Known caveat**: at `5b567a1` the lockfile already has an `apps/web` importer, but
  `apps/web` is not committed yet. Commit `apps/web` (M2) before running a frozen install.

## 4. Contract Requests

- None.

## 5. Open-Source & Honesty Self-Check

- [x] No API keys, tokens, `.env` or `data/raw/` committed
- [x] No railway facts made up. Test fixtures are clearly fictional (`example.com`, "Test Line").
- [x] Synthetic data always gets a disclosure in `ProvenanceTag`.

## 6. Resume Instructions

Work in the same worktree, `E:\Workteree\SENKIRO\p0-ui-web-shell`.

1. These `apps/web` files exist but are **uncommitted**: `package.json` (deps are already
   installed and locked), `tsconfig.json`, `index.html`, `public/favicon.svg`,
   `vite.config.ts` and `vitest.config.ts`. The `src/{app,i18n,state,data,slots,shell,modules}`
   folders are empty. There is no `tests/setup.ts` yet; copy it from
   `packages/ui-kit/tests/setup.ts` and add a `matchMedia` stub.
2. Planned M2 design:
   - **Router**: code-based routes only. `createRootRoute({ validateSearch: (s) => parseAppSearchParams(s) })`,
     plus an index route `/` and a `/$module` alias that redirects to `/?module=…`.
     - Set a custom router `parseSearch` that reads plain strings via `URLSearchParams`.
     - Set a custom `stringifySearch` that calls `serializeAppSearchParams(parseAppSearchParams(search))`.
     - Write search updates as `parseAppSearchParams({ ...prev, ...patch })`. Passing
       `hub: undefined` clears the hub, and the parser drops a hub that conflicts with the region.
   - **Zustand**: ephemeral UI only. `panelOpen: boolean | null` (`null` means "open
     unless module is atlas"), `prefsOpen`, the route draft for from/to, and a focus request.
   - **i18n**: `src/i18n/messages.ts`, with a typed `Messages` object for each locale.
     Module names stay "SENKIRO Atlas/Route/Tickets/Journey/Profile". Regions are
     京阪神核心圈 / 关东预览区 (ja: 京阪神コアエリア / 関東プレビューエリア; en: Keihanshin core / Kanto preview).
   - **Map canvas**: a full-screen `100dvh` SVG coordinate graticule over approximate
     region view presets. Mark them as "view presets, not station data". Kansai is roughly
     W135.05 S34.45 E136.0 N35.15; Kanto roughly W139.55 S35.52 E139.95 N35.82. Add a
     `mapEngine` slot for MapLibre. Do not draw any lines.
   - **Floating Command Dock**: placed top-left. It contains:
     - a brand sign band;
     - an origin/destination entry button that opens the Route panel;
     - links for the five modules (arrow-key roving);
     - region / language / theme `SegmentedControl`s.
   - **Module panel**: a left `DrawerPanel`, portalled into the shell root. Put a CSS
     variable on the shell root for the dock's bottom edge so the panel sits below the dock.
   - **Hub panel**: a right `DrawerPanel`, opened from quick cards for Umeda, Kyoto and Shinjuku.
     - Kyoto shows "Phase 1 建设中（诚实占位）".
     - Umeda and Shinjuku show "待连接 @senkiro/station-3d 枢纽槽位" until a slot is provided.
   - **Slots**: `src/slots` defines `StationExplorerSlotProps`, `LocalDbStatusProbeSlotProps`,
     a `ShellSlotsProvider` and an empty `DEFAULT_SHELL_SLOTS` for the coordinator to wire
     up. Wrap each slot in Suspense plus an error boundary.
   - On every change, set `document.documentElement` `data-theme` and `lang`.
3. M3: write tests covering:
   - language and theme switching;
   - kansai/kanto switching and hub-region correction;
   - bad URL params falling back safely;
   - switching between the five modules;
   - narrow and desktop renders without errors.

   Use `createMemoryHistory` for the router in tests. Then run `pnpm check && pnpm build && pnpm test`
   at the worktree root, and update this report to `READY_FOR_MERGE`.
4. Each commit must end with both trailers: the Claude `Co-Authored-By` and
   `Co-authored-by: gemini-code-assist[bot] <176961590+gemini-code-assist[bot]@users.noreply.github.com>`.
