# @senkiro/contracts

Authoritative TypeScript implementation of the
[SENKIRO Domain Contract v1.0](../../docs/01-domain-contract-v1.0.md).
Every cross-package type, ID validator, trilingual fallback and honesty guard lives here.

- **Runtime dependencies:** only `zod`. No React, Three.js or Node-only APIs, so the package
  runs unchanged in the browser, Web Workers, Node 24 and Expo/Hermes.
- **Consumption:** workspace packages import the TypeScript sources directly
  (`exports` → `src/index.ts`, no build step and no code generation). `pnpm build` emits
  `dist/` (ESM + `.d.ts`) for the publish path (`publishConfig.exports`).

## Modules

| Module | Contents |
| --- | --- |
| `ids.ts` | `SkId<T>`, `makeSkId`, `isSkId`, `parseSkId`, `safeParseSkId`, `parseLegacyLabId` |
| `locale.ts` | `Locale`, `LocalizedNames`, `resolveLocalizedName` (honest fallback, no machine translation) |
| `base.ts` | `BaseEntity`, `SourceRecord`, `Provenance`, `SourcedFact`, `requiresSyntheticDisclosure` |
| `track.ts` | Graph 1 `TrackGraph` (+ separate ODbL `TrackVerticalLayer`) |
| `station.ts` | Graph 2 `StationGraph`, `StationHubDataset`, station route query/result |
| `service.ts` | Graph 3 `ServiceGraph`, `OperationalStatus`, service-time helpers |
| `fare.ts` | Graph 4 `FarePassGraph`, six-state `FareQuote` union, `TariffProvider`, `RegionalFareRulePack` |
| `journey.ts` | Graph 5 `JourneyGraph`, `passed_through`-safe visit counting, line coverage, `SyncOpLogEntry` |
| `guards.ts` | `assertHonestFareQuote`, `assertValidCommemorativeTicket`, `assertOdbLIsolation` |
| `app-search-params.ts` | `AppSearchParams`, `appSearchParamsSchema` (Zod), `parseAppSearchParams`, `serializeAppSearchParams` |

## Design decisions beyond the contract text

- **`SkId<T>` is an unbranded template literal** (`sk:${T}:${string}:${string}`). Wrong entity
  kinds and legacy three-segment IDs fail to compile. Segment characters are checked at
  runtime by the validators.
- **`FareQuote` is a discriminated union.** Non-`OK` quotes are typed `totalAmountYen: null` and
  `breakdown: []`. `assertHonestFareQuote` turns untrusted `FareQuoteDraft`s into `FareQuote`s.
  An `OK` quote must have a whole-yen total equal to the sum of a non-empty breakdown.
- **`parseLegacyLabId` never guesses.** Lab B/C indoor kinds map through
  `LEGACY_ENTITY_ALIASES` (`platform`/`area`/… → `place`; `vertical`/`elevator`/… → `link`).
  Ambiguous kinds (`passage`) and non-entities need an explicit `options.entity`. Slugs are
  never re-cased or re-punctuated.
- **`assertOdbLIsolation`** rejects share-alike and `shareAlike: 'unknown'` sources in a main
  dataset, as well as any `sourceId` that does not resolve in the dataset's registry.
- **`AppSearchParams` parsing works field by field.** A bad field falls back to its default
  or is dropped, unknown keys are stripped, free text is capped at 256 characters, and a
  `hub` implies its region (a hub that contradicts an explicit `region` is dropped).
