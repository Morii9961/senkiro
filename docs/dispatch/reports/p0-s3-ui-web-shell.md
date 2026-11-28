# Dispatch Report — P0-S3 (`p0-ui-web-shell`)

- **Status**: `READY_FOR_MERGE`
- **Branch**: `feat/p0-ui-web-shell`
- **Base Commit**: `4baebcbca3cfbd780d34691a748110837aa30010` (`integration/phase-0`)
- **Head Commit**: the commit that adds this final report, a direct child of `e2c827a`. A
  commit cannot contain its own SHA; run `git rev-parse feat/p0-ui-web-shell` to get it.
- **Model Used**: Claude Opus 5.5 (`claude-opus-5-5`, Claude Code desktop)

| Milestone | Commit | Subject |
| --- | --- | --- |
| M1 | `5b567a1` | feat(ui-kit): M1 SENKIRO original wayfinding design system |
| — | `e79424a` | docs(dispatch): P0-S3 handoff report (PAUSED_QUOTA after M1), now replaced by this report |
| M2 | `a29022f` | feat(web): M2 full-screen map shell, trilingual UI and typed URL routing |
| M3 | `e2c827a` | test(web): M3 shell, routing and URL-sync tests |
| M3 | *(this commit)* | docs(dispatch): P0-S3 final handoff report |

Notes on intermediate commits. At `5b567a1` and `e79424a`, the lockfile already listed
the `apps/web` importer before `apps/web` was committed. At `a29022f`, `apps/web` has no
test files yet, so its `vitest run` would report "no tests". Both resolve at `e2c827a`.
Only the head commit is meant to be merged.

## 1. Owned Paths Check

- Modified/created files stay strictly inside `ownedPaths`: `YES`
- `git diff --name-only 4baebcb...HEAD` gives 71 files, all under `packages/ui-kit/**`,
  `apps/web/**`, `pnpm-lock.yaml` and this report. A filter for anything else matched
  nothing.
- The root `package.json`, `tsconfig.base.json`, `biome.json`, `turbo.json`,
  `vitest.config.ts`, `pnpm-workspace.yaml` and `packages/contracts/**` are untouched.
- `pnpm-lock.yaml` changed only through `pnpm install` / `pnpm add` inside `ui-kit` and
  `web`.
- The local preview config used for the browser check lives in the main checkout's
  git-ignored `.claude/launch.json`. It is not part of this branch.

## 2. Milestones Completed

- [x] **M1 · `@senkiro/ui-kit`**: an original Japanese-wayfinding design system, with no
  Tailwind.
  - **Tokens** (`src/styles/tokens.css`):
    - A washi-paper light theme and a graphite dark theme (`#181c22` / `#262b33`). Both
      define the identical set of `--sk-color-*` tokens, and a test enforces this.
    - Themes are selected with `data-theme`; dark is the default.
    - Line identity colours are never tokens for surfaces. They appear only as 4px strips
      and badge rings, and only after a hex-only check.
  - **Components** (CSS Modules + Radix):
    - `LineBadge`: station-number prefix plus colour strip. A `null` prefix shows a dashed
      "unverified" badge and is never guessed.
    - `ProvenanceTag`: a `DataNature` chip with a Radix Popover listing sources, licence,
      retrieval date and `lastVerifiedAt`.
      - Source IDs missing from the registry are flagged as such.
      - Only http(s) URLs become links, with `rel="noopener noreferrer"`.
      - A synthetic warning appears via `requiresSyntheticDisclosure`, including for
        frequency/demo schedules.
    - `UnknownValue`: `unknown` / `unverified` / `pending` in all three languages, with a
      labelled `note` role.
    - `SegmentedControl`: a Radix ToggleGroup radiogroup with roving focus that can never
      be cleared.
    - `FloatingCard`: a region or complementary landmark labelled by its heading.
    - `DrawerPanel`: a non-modal Radix Dialog. It is a side panel on desktop and a bottom
      sheet below 768px. Escape and the close button close it; outside clicks do not, so
      the map stays usable. It accepts a portal `container`.
    - `SignCode` and `VisuallyHidden`.
  - Copy for zh-CN / ja / en lives in `src/strings.ts`.
- [x] **M2 · `apps/web`**: Vite 8 + React 19.3 + TanStack Router 1.170 (code-based
  only) + zod + zustand.
  - **Router (Zero-Codegen)**:
    - `createRootRoute({ validateSearch: parseAppSearchParams })`, plus the `/` index
      and a `/$module` alias that redirects `/route` to `/?module=route`. No router
      plugin, no generated files.
    - A custom `parseSearch` reads plain strings, so `stepFree=1` is not coerced to a
      number. A custom `stringifySearch` goes through `serializeAppSearchParams`, so
      defaults are omitted and the canonical home URL has no query.
  - **URL ⇄ state**:
    - Language, theme, region, module, hub, level/selection, from/to and stepFree all
      live in the URL. Refresh and shared links restore the view.
    - Language and theme use `replace`; module, hub and region push history.
    - zustand holds only throwaway UI state: panel open, preferences open, route draft
      and a focus request.
  - **Trilingual UI**:
    - One `Messages` interface types `zh-CN` / `ja` / `en`, so a missing key is a compile
      error.
    - Module names are "SENKIRO Atlas/Route/Tickets/Journey/Profile" in every locale.
      Regions are 京阪神核心圈 / 关东预览区 (ja: 京阪神コアエリア / 関東プレビューエリア;
      en: Keihanshin core / Kanto preview).
    - Hub names go through `resolveLocalizedName`.
    - `<html lang>`, `data-theme` and the document title follow the URL.
  - **Full-screen map base (D-02)**:
    - A `100dvh` SVG latitude/longitude grid over approximate region view presets, with
      a centre crosshair.
    - The presets are labelled on screen as approximate camera presets, not station
      coordinates.
    - A `[data-map-mount="maplibre"]` element is ready for a MapLibre adapter.
    - **No railway lines are drawn.**
  - **Floating Command Dock** (top-left):
    - A station-sign style brand band.
    - An origin/destination entry that opens the Route panel and focuses "from".
    - The five module links: `aria-current`, explicit accessible names, and arrow
      keys / Home / End moving focus.
    - Region, language and theme `SegmentedControl`s.
    - On phones it becomes a full-width dock with bottom sheets; checked at 375px with no
      horizontal scroll.
  - **Hub quick entry and hub panel**:
    - Kyoto shows "Phase 1 建设中（诚实占位）" and never mounts the slot.
    - Umeda and Shinjuku show "待连接 @senkiro/station-3d 枢纽槽位" until the slot is
      wired.
    - Choosing a hub in the other region switches the region.
  - **Slots** (`src/slots/`):
    - Typed `StationExplorerSlotProps` (hub, lang, theme, level, selection, stepFree,
      `onLevelChange`, `onSelectionChange`) and `LocalDbStatusProbeSlotProps`.
    - A `ShellSlotsProvider`, plus a `SlotBoundary` (Suspense + error boundary) so a
      broken slot cannot take the shell down.
    - `DEFAULT_SHELL_SLOTS` in `registry.ts` is empty; see §4 for wiring.
- [x] **M3**: 30 web tests, the full gate, and this report.

## 3. Verification Results (Real Runs Only)

Final gate, run at the worktree root with `TURBO_FORCE=true` after deleting every `dist/`:

- `pnpm install --frozen-lockfile` → Exit `0`.
- `pnpm check` → Exit `0`.
  - Biome `--error-on-warnings`: `Checked 100 files … No fixes applied`.
  - `turbo run typecheck`: `3 successful, 3 total`.
- `pnpm build` → Exit `0`, `3 successful, 3 total`.
  - ui-kit lib: `dist/index.js` 15.3 kB and `dist/ui-kit.css` 13.7 kB.
  - web: JS 471 kB (150 kB gzip), CSS 16.4 kB. No warnings.
- `pnpm test` → Exit `0`, `5 successful, 5 total`.
  - contracts: 75/75.
  - ui-kit: 27/27.
  - web: 30/30.
  - No warnings in the output. Web tests also fail on any `console.error`.
- **Web test coverage**:
  - Switching zh-CN → ja → en → zh-CN.
  - Light/dark theme.
  - kansai/kanto region, and hub-region correction in both directions.
  - Hostile params (`lang=xx&theme=neon&module=nope&region=mars&station=bad&stepFree=maybe`)
    fall back field by field.
  - Refresh restores the view.
  - Switching all five modules, and the `/route` alias.
  - Keyboard navigation.
  - Route entry writes `from` / `to` / `stepFree`.
  - Kyoto/Umeda placeholders, slot props, a failing slot contained, and the local-db
    probe slot.
  - Desktop and narrow renders.
- **Manual browser check**: Vite dev server in the Claude browser pane.
  - Desktop: dark and light themes; ja and en; Route panel; Shinjuku hub switching the
    region.
  - 375×812 phone: dock, hub cards, Tickets bottom sheet, and
    `scrollWidth === innerWidth`.
  - A fresh tab on `?region=kanto&hub=umeda&lang=ja&module=route` logged no console
    errors and showed only the Route panel.
- **Known limits**:
  - jsdom does not apply CSS media queries. The "narrow" unit test therefore proves
    error-free rendering only; the bottom-sheet layout itself was checked in the real
    browser.
  - No Playwright E2E was added in this session.

### Finding worth knowing at integration

TanStack Router merges the raw query into the root route's validated search
(`{ ...raw, ...validated }`). Keys the contract parser *drops* would therefore come back
through `useSearch()` — for example a hub that contradicts the region, or a malformed
`station`. `apps/web/src/app/hooks.ts#useAppSearch` re-validates with
`parseAppSearchParams`, memoised per search object. Any new code should read params
through `useAppSearch()`, not `useSearch()` directly.

The router's own location (`router.state.location.searchStr`) is canonical and all links
build on it. The address bar keeps the raw query until the next navigation.

## 4. Contract Requests

- **None.** Everything uses the existing `@senkiro/contracts` exports.
- **Integration note for the coordinator (not a contract change).** To wire Wave 1
  packages, fill `apps/web/src/slots/registry.ts` with lazy imports of thin adapters that
  map `StationExplorerSlotProps` onto `@senkiro/station-3d`'s `<StationExplorer />` and
  `LocalDbStatusProbeSlotProps` onto the `@senkiro/local-db` probe. The example code is
  in that file's doc comment. Kyoto deliberately never mounts the slot until its Phase 1
  data exists.
- **Version note.** The plan names MapLibre GL JS v5, but no MapLibre dependency was
  added: Phase 0 only needs the mount point, and the current major on npm is 6.x. The
  version choice is left to P1-S2 / the coordinator.

## 5. Open-Source & Honesty Self-Check

- [x] No API keys, tokens, `.env` or `data/raw/` committed. The only "token" files are CSS
  design tokens.
- [x] No made-up station, fare or schedule facts.
  - Lines, stations, fares, routes and footprints all render `<UnknownValue kind="pending">`.
  - Region extents are labelled as approximate view presets.
  - Hub names are place names only.
  - ui-kit test fixtures are clearly fictional (`example.com`, "Test Line").
- [x] Synthetic data is always disclosed (`ProvenanceTag`). Keepsake-ticket copy states
  the mandatory `SAMPLE · 記念用 · 乗車不可` watermark and that tickets carry no barcode.
- [x] Branding:
  - The UI says `SENKIRO`, plus `Atlas / Route / Tickets / Journey / Profile`.
  - The dock mark, favicon and `SignCode` glyphs are original.
  - No operator logos, official maps or station images are used.
  - The UI states that SENKIRO is not an official railway-operator product.

## 6. Resume Instructions

Not required: the status is `READY_FOR_MERGE`.
