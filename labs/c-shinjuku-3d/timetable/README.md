# SENKIRO Lab C · Greater Shinjuku timetable database

Builds the station timetable database used by the Shinjuku 3D V3 prototype. Zero dependencies; Node ≥ 23.6 (runs `.ts` directly).

```bash
cd labs/c-shinjuku-3d/timetable
npm run fetch            # Toei ODPT open data (CC BY 4.0) + Cabinet Office holidays → ../data/raw (gitignored)
npm run fetch:tokyometro # optional: needs ODPT_CONSUMER_KEY in repo-root .env.local; output stays local
npm run build            # → ../data/shinjuku/*  and  ../data/shinjuku/local/* (gitignored)
npm run scenarios        # V3 integration scenarios → v3_scenarios.json
npm test                 # node --test
```

The legacy CSV is read from `../data/raw/legacy/新宿駅_全列車時刻表.csv` if present (copy it there; it is gitignored). Without it the build still produces the official layer.

| Path | Role |
| --- | --- |
| `scripts/reference.mjs` | hand-maintained stations, lines, platforms, calendars, sources, vehicle catalog |
| `scripts/build.mjs` | normalisation, cross-checks, validation, coverage, output |
| `scripts/lib/time.mjs` | business-day time (24:xx) handling |
| `adapter/senkiroTimetable.ts` | types + queries for the front end |
| `adapter/senkiro_timetable.schema.json` | JSON Schema of the package |

Docs: `../docs/LEGACY_CSV_AUDIT.md`, `DATA_SOURCES.md`, `DATA_DICTIONARY.md`, `TIMETABLE_VALIDATION.md`, `FABLE_INTEGRATION.md`.
