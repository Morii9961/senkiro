// Builds the Greater Shinjuku timetable database.
//
//   inputs  data/raw/odpt/toei/*.json        (fetch-odpt-public.mjs, CC BY 4.0)
//           data/raw/odpt/tokyometro/*.json  (optional, fetch-odpt-tokyometro.mjs, NOT redistributable)
//           data/raw/holidays/syukujitsu.csv (fetch-holidays.mjs)
//           data/raw/legacy/新宿駅_全列車時刻表.csv (legacy, licence unknown)
//   outputs data/shinjuku/*            committable: official open data + reference + reports
//           data/shinjuku/local/*      gitignored: legacy layer, merged "full" JSON
//
// Nothing here invents a time, a train number, a platform or a vehicle. Fields
// the sources do not give stay null and are counted in coverage_report.json.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsvObjects, writeCsv } from './lib/csv.mjs';
import { formatBusiness, parseHm, toBusinessSeconds } from './lib/time.mjs';
import * as R from './reference.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const LAB = join(here, '../..');
const RAW = join(LAB, 'data/raw');
const OUT = join(LAB, 'data/shinjuku');
const LOCAL = join(OUT, 'local');
mkdirSync(LOCAL, { recursive: true });
const SCHEMA_VERSION = '1.0.0';
const GENERATED_AT = process.env.SENKIRO_BUILD_TIME ?? new Date().toISOString();
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const sha1 = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);

// =========================================================== helpers / maps
const stationById = new Map(R.STATIONS.map((s) => [s.station_id, s]));
const platformById = new Map(R.PLATFORMS.map((p) => [p.platform_id, p]));
const directionByOdpt = new Map(R.DIRECTIONS.filter((d) => d.odpt_direction).map((d) => [`${d.line_id}|${d.odpt_direction}`, d]));
const lineByOdpt = new Map(R.LINES.map((l) => [l.odpt_railway, l]));
const odptStationToInternal = new Map(R.STATIONS.map((s) => [s.original_station_code, s.station_id]));
const calendarType = { 'odpt.Calendar:Weekday': 'weekday', 'odpt.Calendar:SaturdayHoliday': 'saturday_holiday' };
const normDest = (s) => String(s ?? '').replace(/\(.*?\)|（.*?）/g, '').trim();

const toeiDir = join(RAW, 'odpt/toei');
if (!existsSync(join(toeiDir, 'manifest.json'))) throw new Error('Run `npm run fetch:toei` first.');
const toeiManifest = readJson(join(toeiDir, 'manifest.json'));
const toeiStations = readJson(join(toeiDir, 'station.json'));
const stationName = new Map(toeiStations.map((s) => [s['owl:sameAs'], { ja: s['dc:title'], en: s['odpt:stationTitle']?.en ?? null, code: s['odpt:stationCode'] ?? null }]));
for (const [k, v] of Object.entries(R.EXTRA_STATION_NAMES)) if (!stationName.has(k)) stationName.set(k, v);
const nameOf = (id) => stationName.get(id)?.ja ?? null;
const trainTypeTitle = new Map(readJson(join(toeiDir, 'train_type.json')).map((t) => [t['owl:sameAs'], t['dc:title']]));
const railDirTitle = new Map(readJson(join(toeiDir, 'rail_direction.json')).map((t) => [t['owl:sameAs'], t['dc:title']]));

const issues = []; // validation findings
const issue = (check, severity, detail, ref = null) => issues.push({ check, severity, detail, ref });

// =========================================================== 1. Toei official layer
const officialEvents = [];
const officialTrips = [];
const tripLinks = [];
const assignments = [];
const targetToeiStations = new Set(['toei:shinjuku:S01', 'toei:shinjuku-sanchome:S02', 'toei:shinjuku:E27', 'toei:shinjuku-nishiguchi:E01']);

for (const file of ['train_timetable_shinjuku.json', 'train_timetable_oedo.json']) {
  for (const tt of readJson(join(toeiDir, file))) {
    const line = lineByOdpt.get(tt['odpt:railway']);
    const dir = directionByOdpt.get(`${line.line_id}|${tt['odpt:railDirection']}`);
    const dayType = calendarType[tt['odpt:calendar']];
    if (!dayType) { issue('calendar_defined', 'error', `unknown calendar ${tt['odpt:calendar']}`, tt['owl:sameAs']); continue; }
    const trip_id = tt['owl:sameAs'];
    const trainNumber = tt['odpt:trainNumber'] ?? null;
    const originIds = tt['odpt:originStation'] ?? []; const destIds = tt['odpt:destinationStation'] ?? [];
    const typeJa = trainTypeTitle.get(tt['odpt:trainType']) ?? null;
    const stops = tt['odpt:trainTimetableObject'];
    const throughFrom = originIds.some((s) => !s.includes('.Toei.')) ? originIds.map(nameOf).join('・') : null;
    const throughTo = destIds.some((s) => !s.includes('.Toei.')) ? destIds.map(nameOf).join('・') : null;

    // vehicle rule (see VEHICLE_CATALOG): Shinjuku Line → 10 cars, owner by number suffix (T Toei / K Keio);
    // Oedo → 8 cars, series not attributable to a trip. All 'representative', never 'verified'.
    let veh;
    if (line.line_id === 'toei:shinjuku') {
      const suffix = (trainNumber ?? '').slice(-1);
      veh = suffix === 'T'
        ? { vehicle_series: '10-300', formation_length: 10, candidate_vehicle_ids: ['toei-10-300-10'], owner_operator_id: 'toei', basis: 'Train number suffix T = Toei-owned set (operating convention, not stated in the dataset); 10-300 is the only Toei type on the line; all sets 10 cars.' }
        : suffix === 'K'
          ? { vehicle_series: null, formation_length: 10, candidate_vehicle_ids: ['keio-9000-10', 'keio-5000-10'], owner_operator_id: 'keio', basis: 'Train number suffix K = Keio-owned set (operating convention, not stated in the dataset); 9000 or 5000 series cannot be told apart; all through sets 10 cars.' }
          : { vehicle_series: null, formation_length: null, candidate_vehicle_ids: [], owner_operator_id: null, basis: 'Unrecognised train number suffix.' };
    } else {
      veh = { vehicle_series: null, formation_length: 8, candidate_vehicle_ids: ['toei-12-000-8', 'toei-12-600-8'], owner_operator_id: 'toei', basis: 'Every Oedo Line set is 8 cars (Toei fleet overview, 2025-04-01); 12-000 vs 12-600 per trip not published.' };
    }
    const vstatus = veh.formation_length ? 'representative' : 'unknown';

    officialTrips.push({
      trip_id, trip_id_is_synthetic: false, original_trip_id: trip_id, train_number: trainNumber, train_number_source: 'src:odpt-toei-train-timetable',
      operator_id: 'toei', line_id: line.line_id, direction_id: dir.direction_id, service_date_type: dayType,
      service_calendar_id: dayType === 'weekday' ? 'cal:toei:weekday' : 'cal:toei:saturday-holiday',
      service_class: typeJa, service_class_unified: R.SERVICE_CLASS[typeJa] ?? 'other',
      origin_text: originIds.map(nameOf).join('・'), destination_text: destIds.map(nameOf).join('・'),
      through_from_text: throughFrom, through_to_text: throughTo, stop_count_in_source: stops.length,
      source_id: 'src:odpt-toei-train-timetable', valid_from: tt['dct:issued'] ?? null, valid_until: null, data_status: 'official', last_modified_in_source: tt['dc:date'] ?? null,
    });
    assignments.push({
      trip_id, train_number: trainNumber, vehicle_series: veh.vehicle_series, formation_length: veh.formation_length,
      candidate_vehicle_ids: veh.candidate_vehicle_ids.join(';'), owner_operator_id: veh.owner_operator_id, vehicle_assignment_status: vstatus,
      vehicle_source_id: line.line_id === 'toei:shinjuku' ? 'src:tetsudo-ch-10-300-10car' : 'src:toei-overview-fleet',
      formation_source_id: line.line_id === 'toei:shinjuku' ? 'src:tetsudo-ch-10-300-10car' : 'src:toei-overview-fleet',
      valid_from: tt['dct:issued'] ?? null, valid_until: null, basis: veh.basis,
    });

    let prevSec = -1; const tripTargetEvents = [];
    stops.forEach((o, idx) => {
      const sid = o['odpt:departureStation'] ?? o['odpt:arrivalStation'];
      const arrS = o['odpt:arrivalTime'] ?? null; const depS = o['odpt:departureTime'] ?? null;
      const arr = toBusinessSeconds(arrS); const dep = toBusinessSeconds(depS);
      for (const t of [arr, dep]) if (t !== null) {
        if (t < prevSec) issue('trip_time_order', 'error', `time goes backwards at ${sid}`, trip_id);
        prevSec = t;
      }
      if ((arrS && arr === null) || (depS && dep === null)) issue('invalid_time', 'error', `unparseable time at ${sid}`, trip_id);
      const station_id = odptStationToInternal.get(sid);
      if (!station_id || !targetToeiStations.has(station_id)) return;
      const isFirst = idx === 0; const isLast = idx === stops.length - 1;
      const plat = o['odpt:platformNumber'] ? `${station_id}:track-${o['odpt:platformNumber']}` : null;
      const platKnown = plat && platformById.has(plat);
      if (plat && !platKnown) issue('platform_line_match', 'warning', `platform ${o['odpt:platformNumber']} not in platform table for ${station_id}`, trip_id);
      const ev = {
        stop_event_id: `${trip_id}@${station_id}`, station_id, station_complex_id: stationById.get(station_id).station_complex_id,
        operator_id: 'toei', line_id: line.line_id, platform_id: platKnown ? plat : null, direction_id: dir.direction_id,
        service_date_type: dayType, service_calendar_id: dayType === 'weekday' ? 'cal:toei:weekday' : 'cal:toei:saturday-holiday',
        trip_id, trip_id_is_synthetic: false, original_trip_id: trip_id, train_number: trainNumber,
        arrival_time_local: formatBusiness(arr), departure_time_local: formatBusiness(dep),
        arrival_time_source: arrS, departure_time_source: depS, arrival_seconds: arr, departure_seconds: dep, time_precision: 'minute',
        arrival_departure_type: arr !== null && dep !== null ? 'arrival_departure' : dep !== null ? 'departure_only' : 'arrival_only',
        destination_text: destIds.map(nameOf).join('・'), destination_text_zh: destIds.map((d) => R.DEST_ZH[nameOf(d)] ?? null).every(Boolean) ? destIds.map((d) => R.DEST_ZH[nameOf(d)]).join('・') : null,
        origin_text: originIds.map(nameOf).join('・'),
        service_class: typeJa, service_class_unified: R.SERVICE_CLASS[typeJa] ?? 'other',
        is_origin_at_station: isFirst ? !throughFrom : false,
        is_terminal_at_station: isLast ? !throughTo : false,
        through_service_text: isFirst && throughFrom ? `${throughFrom}始発 京王線から直通` : isLast && throughTo ? `${throughTo}行 京王線へ直通 (以遠の時刻は京王の資料)` : null,
        vehicle_series: veh.vehicle_series, formation_length: veh.formation_length, vehicle_assignment_status: vstatus,
        platform_verification_status: platKnown ? 'verified' : 'unknown',
        route_pattern_id: `${line.line_id}:${dir.direction_id.split(':').pop()}:${originIds.map((s) => s.split('.').pop()).join('-')}>${destIds.map((s) => s.split('.').pop()).join('-')}`,
        original_station_code: sid, original_line_code: tt['odpt:railway'],
        source_id: 'src:odpt-toei-train-timetable', vehicle_source_id: assignments.at(-1).vehicle_source_id, formation_source_id: assignments.at(-1).formation_source_id,
        valid_from: tt['dct:issued'] ?? null, valid_until: null, source_confidence: 'high', data_status: 'official', last_verified_at: R.RETRIEVED_AT,
        remarks: [isLast && throughTo ? 'Departure towards the Keio side is not in Toei data: departure_time_local null by design.' : null,
          isFirst && throughFrom ? 'Arrival from the Keio side is not in Toei data: arrival_time_local null by design.' : null].filter(Boolean).join(' ') || null,
      };
      officialEvents.push(ev); tripTargetEvents.push(ev);
    });
    for (let i = 1; i < tripTargetEvents.length; i++) {
      const a = tripTargetEvents[i - 1]; const b = tripTargetEvents[i];
      const ta = a.departure_seconds ?? a.arrival_seconds; const tb = b.arrival_seconds ?? b.departure_seconds;
      tripLinks.push({
        trip_id, train_number: trainNumber, from_station_id: a.station_id, to_station_id: b.station_id,
        from_time_local: formatBusiness(ta), to_time_local: formatBusiness(tb), elapsed_minutes: (tb - ta) / 60,
        intermediate_stops_in_source: stops.findIndex((o) => (o['odpt:arrivalStation'] ?? o['odpt:departureStation']) === b.original_station_code) - stops.findIndex((o) => (o['odpt:departureStation'] ?? o['odpt:arrivalStation']) === a.original_station_code) - 1,
        match_status: 'verified_same_trip_in_source', source_id: 'src:odpt-toei-train-timetable',
      });
      if (tb < ta) issue('cross_station_time_order', 'error', `${a.station_id} → ${b.station_id} goes backwards`, trip_id);
    }
  }
}

// ---- cross-check against the station timetables (departures, origin flags)
const stationTimetableCheck = { compared: 0, matched: 0, only_in_station_timetable: [], only_in_train_timetable: 0, origin_flag_mismatch: [], origin_flag_reverse_mismatch: [] };
{
  const evIndex = new Map();
  for (const e of officialEvents) if (e.departure_time_source) evIndex.set(`${e.station_id}|${e.service_date_type}|${e.train_number}|${e.departure_time_source}`, e);
  const seen = new Set();
  for (const code of ['S01', 'S02', 'E27', 'E01']) {
    for (const st of readJson(join(toeiDir, `station_timetable_${code}.json`))) {
      const station_id = odptStationToInternal.get(st['odpt:station']);
      const dayType = calendarType[st['odpt:calendar']];
      for (const o of st['odpt:stationTimetableObject']) {
        stationTimetableCheck.compared++;
        const k = `${station_id}|${dayType}|${o['odpt:trainNumber']}|${o['odpt:departureTime']}`;
        const e = evIndex.get(k);
        if (!e) { stationTimetableCheck.only_in_station_timetable.push(k); continue; }
        stationTimetableCheck.matched++; seen.add(k);
        if (o['odpt:isOrigin'] === true && !e.is_origin_at_station) {
          // Station timetable says "starts here", train timetable names a Keio origin. Both are
          // official Toei data; the conflict is surfaced instead of being decided.
          stationTimetableCheck.origin_flag_mismatch.push(k);
          e.is_origin_at_station = null;
          e.remarks = [e.remarks, `Origin conflict in source: station timetable marks 当駅始発, train timetable gives origin ${e.origin_text}.`].filter(Boolean).join(' ');
        } else if (o['odpt:isOrigin'] !== true && e.is_origin_at_station === true) {
          stationTimetableCheck.origin_flag_reverse_mismatch.push(k);
          e.is_origin_at_station = null;
          e.remarks = [e.remarks, 'Origin conflict in source: train timetable starts here, station timetable has no 当駅始発 flag.'].filter(Boolean).join(' ');
        }
      }
    }
  }
  for (const k of evIndex.keys()) if (!seen.has(k)) stationTimetableCheck.only_in_train_timetable++;
  if (stationTimetableCheck.only_in_station_timetable.length) issue('source_cross_check', 'warning', `${stationTimetableCheck.only_in_station_timetable.length} station-timetable departures have no train-timetable counterpart`);
  if (stationTimetableCheck.origin_flag_mismatch.length) issue('origin_flag', 'warning', `${stationTimetableCheck.origin_flag_mismatch.length} departures: station timetable isOrigin=true but train timetable origin is a Keio station; is_origin_at_station set to null`);
  if (stationTimetableCheck.origin_flag_reverse_mismatch.length) issue('origin_flag', 'warning', `${stationTimetableCheck.origin_flag_reverse_mismatch.length} departures: train starts here per train timetable but station timetable has no isOrigin flag`);
}

// =========================================================== 2. legacy layer (local only)
const legacyPath = join(RAW, 'legacy/新宿駅_全列車時刻表.csv');
const legacy = existsSync(legacyPath) ? readCsvObjects(legacyPath) : [];
const legacyLineMap = new Map(R.LINES.flatMap((l) => l.legacy_names.map((n) => [n, l])));
const legacyStationOfLine = {
  'jr-east': 'jr-east:shinjuku', 'odakyu:odawara': 'odakyu:shinjuku', 'keio:keio': 'keio:shinjuku', 'keio:keio-new': 'keio:shinjuku-newline',
  'tokyo-metro:marunouchi': 'tokyo-metro:shinjuku:M08', 'toei:oedo': 'toei:shinjuku:E27', 'toei:shinjuku': 'toei:shinjuku:S01', 'seibu:shinjuku': 'seibu:seibu-shinjuku',
};
const TERMINUS = new Set(['odakyu:shinjuku', 'keio:shinjuku', 'seibu:seibu-shinjuku']); // every departure starts here
const dayOfLegacy = { 平日: 'weekday', 土休日: 'saturday_holiday' };

const audit = {
  file: 'data/raw/legacy/新宿駅_全列車時刻表.csv', sha256: '075a0a51e52f7fa6d020be1487d0bab76b170e3be3d780720d238c3a1af94e57',
  records: legacy.length, fields: legacy.length ? Object.keys(legacy[0]).filter((k) => k !== '__line') : [],
  by_operator: {}, by_line: {}, by_day_type: {}, origin_flag_values: {}, hour_range: null, times_over_24h: 0,
  time_field_inconsistent: 0, invalid_times: 0,
  exact_duplicates: { groups: 0, extra_rows: 0, resolution: null, examples: [] },
  same_minute_different_rows: 0, unknown_line_names: [],
};
const bump = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };
let minH = 99; let maxH = -1;
const dupGroups = new Map();
for (const r of legacy) {
  bump(audit.by_operator, r['公司']); bump(audit.by_line, `${r['公司']} / ${r['线路']}`); bump(audit.by_day_type, r['日种']); bump(audit.origin_flag_values, r['当站始发']);
  const h = Number(r['时']); minH = Math.min(minH, h); maxH = Math.max(maxH, h);
  if (h >= 24) audit.times_over_24h++;
  if (`${String(h).padStart(2, '0')}:${r['分']}` !== r['时刻']) audit.time_field_inconsistent++;
  if (!parseHm(r['时刻'])) audit.invalid_times++;
  const key = ['公司', '线路', '方向', '日种', '时刻', '种别', '行先', '番线', '当站始发'].map((f) => r[f]).join('|');
  if (!dupGroups.has(key)) dupGroups.set(key, []);
  dupGroups.get(key).push(r);
  if (!legacyLineMap.has(r['线路']) && !audit.unknown_line_names.includes(r['线路'])) audit.unknown_line_names.push(r['线路']);
}
audit.hour_range = [minH, maxH];
for (const [k, rows] of dupGroups) if (rows.length > 1) {
  audit.exact_duplicates.groups++; audit.exact_duplicates.extra_rows += rows.length - 1;
  // Only line numbers and grouping labels go into the committed report — no legacy row content.
  audit.exact_duplicates.examples.push({ line: rows[0]['线路'], day_type: rows[0]['日种'], count: rows.length, csv_lines: rows.map((r) => r.__line) });
}
audit.exact_duplicates.resolution = 'Rows identical in every field (same line, direction, day type, minute, type, destination AND platform) are one physical departure: a single track cannot dispatch two trains in the same minute. Each group is kept as ONE event with legacy_duplicate_count = n and a remark; the extra rows are not deleted from the raw file.';
{ // same minute, same line/direction/day, different platform or destination: kept as distinct trains
  const m = new Map();
  for (const r of legacy) { const k = [r['线路'], r['方向'], r['日种'], r['时刻']].join('|'); m.set(k, (m.get(k) ?? new Set()).add([r['种别'], r['行先'], r['番线']].join('|'))); }
  for (const s of m.values()) if (s.size > 1) audit.same_minute_different_rows++;
}

// Toei official departure index for verifying legacy Toei rows
const officialDepIndex = new Map(); // station|day|time|dest -> [events]
for (const e of officialEvents) if (e.departure_time_local) {
  const k = `${e.station_id}|${e.service_date_type}|${e.departure_time_local}|${normDest(e.destination_text)}`;
  officialDepIndex.set(k, [...(officialDepIndex.get(k) ?? []), e]);
}
const officialArrS01 = new Map(); // day -> westbound through arrivals at S01 (for Keio New Line candidates)
for (const e of officialEvents) if (e.station_id === 'toei:shinjuku:S01' && e.direction_id === 'toei:shinjuku:westbound' && e.arrival_seconds !== null) {
  officialArrS01.set(e.service_date_type, [...(officialArrS01.get(e.service_date_type) ?? []), e]);
}

const legacyEvents = []; const legacyTrips = []; const crosswalk = [];
const oedoVotes = {}; // legacy label -> {direction_id: n}
const legacyCheck = { toei_rows: 0, toei_matched: 0, toei_unmatched: [], keio_new_rows: 0, keio_new_candidates: 0 };
for (const [key, rows] of dupGroups) {
  const r = rows[0];
  const line = legacyLineMap.get(r['线路']);
  if (!line) continue;
  const station_id = legacyStationOfLine[line.operator_id === 'jr-east' ? 'jr-east' : line.line_id];
  const dayType = dayOfLegacy[r['日种']];
  let dir = R.DIRECTIONS.find((d) => d.line_id === line.line_id && d.legacy_label === r['方向']) ?? null;
  const sec = toBusinessSeconds(r['时刻'], { rollover: false });
  const plat = `${station_id}:track-${r['番线'].replace('・', '-')}`;
  const platKnown = platformById.has(plat);
  const trip_id = `legacy:${sha1(key)}`;
  const isTerminus = TERMINUS.has(station_id);
  let match = null; let matchStatus = 'not_checkable';
  if (line.operator_id === 'toei') {
    legacyCheck.toei_rows += rows.length;
    const cands = officialDepIndex.get(`${station_id}|${dayType}|${formatBusiness(sec)}|${normDest(r['行先'])}`) ?? [];
    if (cands.length === 1) { match = cands[0]; matchStatus = 'matched_official_open_data'; legacyCheck.toei_matched += rows.length; }
    else { matchStatus = cands.length ? 'ambiguous' : 'no_official_counterpart'; legacyCheck.toei_unmatched.push({ csv_lines: rows.map((x) => x.__line), time: r['时刻'], day: r['日种'], dest: r['行先'], line: r['线路'] }); }
    if (match && line.line_id === 'toei:oedo') { oedoVotes[r['方向']] ??= {}; bump(oedoVotes[r['方向']], match.direction_id); }
  } else if (line.line_id === 'keio:keio-new') {
    legacyCheck.keio_new_rows += rows.length;
    const c = (officialArrS01.get(dayType) ?? []).filter((e) => sec - e.arrival_seconds >= 0 && sec - e.arrival_seconds <= 120 && normDest(r['行先']) === normDest(e.destination_text));
    if (c.length === 1) { match = c[0]; matchStatus = 'candidate_through_train_unverified'; legacyCheck.keio_new_candidates += rows.length; }
  }
  if (match) crosswalk.push({ legacy_trip_id: trip_id, legacy_csv_lines: rows.map((x) => x.__line).join(';'), official_trip_id: match.trip_id, official_train_number: match.train_number, match_status: matchStatus, station_id });
  const ev = {
    stop_event_id: `${trip_id}@${station_id}`, station_id, station_complex_id: stationById.get(station_id).station_complex_id,
    operator_id: line.operator_id, line_id: line.line_id, platform_id: platKnown ? plat : null, direction_id: dir?.direction_id ?? null,
    service_date_type: dayType, service_calendar_id: `cal:${line.operator_id}:${dayType === 'weekday' ? 'weekday' : 'saturday-holiday'}:legacy`,
    trip_id, trip_id_is_synthetic: true, original_trip_id: null, train_number: null,
    arrival_time_local: null, departure_time_local: formatBusiness(sec), arrival_time_source: null, departure_time_source: r['时刻'],
    arrival_seconds: null, departure_seconds: sec, time_precision: 'minute', arrival_departure_type: 'departure_only',
    destination_text: r['行先'], destination_text_zh: null, origin_text: isTerminus ? stationById.get(station_id).name_ja : null,
    service_class: r['种别'], service_class_unified: R.SERVICE_CLASS[r['种别']] ?? 'other',
    is_origin_at_station: isTerminus ? true : null, is_terminal_at_station: false, through_service_text: null,
    vehicle_series: null, formation_length: null, vehicle_assignment_status: 'unknown',
    platform_verification_status: platKnown ? 'legacy_unverified' : 'unknown',
    route_pattern_id: null, original_station_code: null, original_line_code: r['线路'],
    source_id: 'src:legacy-shinjuku-csv', vehicle_source_id: null, formation_source_id: null, valid_from: null, valid_until: null,
    source_confidence: matchStatus === 'matched_official_open_data' ? 'medium' : 'low', data_status: 'legacy_unverified', last_verified_at: null,
    legacy_duplicate_count: rows.length, legacy_csv_lines: rows.map((x) => x.__line).join(';'), legacy_match_status: matchStatus,
    remarks: [rows.length > 1 ? `Legacy file lists this departure ${rows.length}× identically; kept once.` : null,
      isTerminus ? 'Origin derived from station topology (terminus), not from the legacy flag.' : 'Legacy 当站始发=1 on every row is not trusted; origin unknown.',
      matchStatus === 'candidate_through_train_unverified' ? `Candidate: Toei through train ${match.train_number} (time+destination only).` : null].filter(Boolean).join(' '),
  };
  legacyEvents.push(ev);
  legacyTrips.push({ trip_id, trip_id_is_synthetic: true, original_trip_id: null, train_number: null, train_number_source: null, operator_id: line.operator_id, line_id: line.line_id,
    direction_id: dir?.direction_id ?? null, service_date_type: dayType, service_calendar_id: ev.service_calendar_id, service_class: r['种别'], service_class_unified: ev.service_class_unified,
    origin_text: ev.origin_text, destination_text: r['行先'], through_from_text: null, through_to_text: null, stop_count_in_source: 1,
    source_id: 'src:legacy-shinjuku-csv', valid_from: null, valid_until: null, data_status: 'legacy_unverified', last_modified_in_source: null });
}
// Oedo legacy labels → ODPT direction by majority of verified matches
const oedoDirOfLabel = {};
for (const [label, votes] of Object.entries(oedoVotes)) oedoDirOfLabel[label] = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
for (const e of legacyEvents) if (e.line_id === 'toei:oedo' && !e.direction_id) {
  const label = legacy.find((x) => x.__line === Number(e.legacy_csv_lines.split(';')[0]))['方向'];
  e.direction_id = oedoDirOfLabel[label] ?? null;
}
for (const t of legacyTrips) t.direction_id = legacyEvents.find((e) => e.trip_id === t.trip_id).direction_id;
for (const e of legacyEvents) if (e.line_id === 'toei:shinjuku' && e.direction_id === null) e.direction_id = 'toei:shinjuku:eastbound';
for (const e of legacyEvents) if (!e.direction_id) issue('direction_mapping', 'warning', `no direction for ${e.original_line_code}`, e.trip_id);
// Same track, same minute, same service class, different destinations: a coupled train that
// splits later (e.g. Romancecar はこね+えのしま). Kept as separate destination records, tagged.
{
  const g = new Map();
  for (const e of legacyEvents) if (e.platform_id) { const k = `${e.platform_id}|${e.service_date_type}|${e.departure_seconds}|${e.service_class}`; g.set(k, [...(g.get(k) ?? []), e]); }
  for (const [k, evs] of g) if (evs.length > 1 && new Set(evs.map((e) => e.destination_text)).size === evs.length) {
    const id = `legacy-coupled:${sha1(k)}`;
    for (const e of evs) {
      e.legacy_coupled_group = id;
      e.remarks = [e.remarks, `Coupled-train candidate: same track and minute as ${evs.filter((x) => x !== e).map((x) => x.destination_text).join('/')}; physically one train with several destinations (unverified).`].join(' ');
    }
  }
}

// =========================================================== 3. calendars
const holidays = new Map();
const holPath = join(RAW, 'holidays/syukujitsu.csv');
if (existsSync(holPath)) for (const r of readCsvObjects(holPath)) {
  const [y, m, d] = Object.values(r)[1].split('/').map(Number);
  holidays.set(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, Object.values(r)[2]);
}
const calendarDates = [];
for (let t = Date.UTC(2026, 10, 1); t <= Date.UTC(2027, 2, 31); t += 86400000) {
  const d = new Date(t); const iso = d.toISOString().slice(0, 10); const dow = d.getUTCDay();
  const hol = holidays.get(iso) ?? null;
  const md = iso.slice(5);
  const yearEnd = md >= '12-29' || md <= '01-03';
  calendarDates.push({
    date: iso, weekday_ja: '日月火水木金土'[dow], national_holiday_name: hol,
    resolved_service_date_type: dow === 0 || dow === 6 || hol ? 'saturday_holiday' : 'weekday',
    special_operation_flag: yearEnd ? 'year_end_new_year_unverified' : null,
    remarks: yearEnd ? 'Operators often run a special or holiday timetable around New Year; not modelled — check operator notices.' : null,
    source_id: 'src:cao-holidays',
  });
}
const asOf = calendarDates.find((c) => c.date === R.AS_OF_DATE);
if (!asOf) issue('calendar_defined', 'error', 'as-of date not covered by calendar_dates');

// =========================================================== 4. validation of the merged event set
function validate(events, label) {
  const out = { layer: label, events: events.length, checks: {} };
  const c = (name, n, detail) => { out.checks[name] = { failures: n, detail }; };
  c('invalid_time', events.filter((e) => (e.arrival_time_local && e.arrival_seconds === null) || (e.departure_time_local && e.departure_seconds === null) || (e.arrival_seconds === null && e.departure_seconds === null)).length, 'event without any parseable time');
  c('arrival_after_departure', events.filter((e) => e.arrival_seconds !== null && e.departure_seconds !== null && e.arrival_seconds > e.departure_seconds).length, 'arrival later than departure at the same stop');
  const ids = new Map(); for (const e of events) ids.set(e.stop_event_id, (ids.get(e.stop_event_id) ?? 0) + 1);
  c('duplicate_stop_event_id', [...ids.values()].filter((n) => n > 1).length, 'stop_event_id must be unique');
  const phys = new Map();
  for (const e of events) if (e.platform_id && e.departure_seconds !== null && !e.legacy_coupled_group) { const k = `${e.platform_id}|${e.service_date_type}|${e.departure_seconds}`; phys.set(k, (phys.get(k) ?? 0) + 1); }
  c('same_platform_same_minute', [...phys.values()].filter((n) => n > 1).length, 'two departures from one track in the same minute (coupled multi-destination trains excluded and reported separately)');
  out.info = { coupled_multi_destination_records: events.filter((e) => e.legacy_coupled_group).length, coupled_groups: new Set(events.map((e) => e.legacy_coupled_group).filter(Boolean)).size };
  c('platform_station_mismatch', events.filter((e) => e.platform_id && platformById.get(e.platform_id)?.station_id !== e.station_id).length, 'platform belongs to another station / operator');
  c('station_operator_mismatch', events.filter((e) => stationById.get(e.station_id)?.operator_id !== e.operator_id).length, 'station not run by the event operator');
  c('line_not_at_station', events.filter((e) => !stationById.get(e.station_id)?.line_ids.includes(e.line_id)).length, 'line does not serve the station');
  c('direction_line_mismatch', events.filter((e) => e.direction_id && !e.direction_id.startsWith(`${e.line_id}:`)).length, 'direction id of another line');
  c('missing_direction', events.filter((e) => !e.direction_id).length, 'direction unknown');
  c('missing_calendar', events.filter((e) => !R.CALENDARS.some((k) => k.service_calendar_id === e.service_calendar_id)).length, 'service_calendar_id not defined');
  c('missing_source', events.filter((e) => !R.SOURCES.some((s) => s.source_id === e.source_id)).length, 'source_id not in sources.csv');
  c('origin_with_arrival', events.filter((e) => e.is_origin_at_station === true && e.arrival_time_local !== null).length, 'origin event must not have an arrival time');
  c('terminal_with_departure', events.filter((e) => e.is_terminal_at_station === true && e.departure_time_local !== null).length, 'terminating event must not have a departure time');
  c('synthetic_id_as_train_number', events.filter((e) => e.train_number && (e.train_number.startsWith('legacy:') || e.trip_id_is_synthetic)).length, 'internal ids must not appear as train numbers');
  const tripNums = new Map(); for (const e of events) if (e.train_number) { const k = `${e.trip_id}`; const s = tripNums.get(k) ?? new Set(); s.add(e.train_number); tripNums.set(k, s); }
  c('trip_with_several_train_numbers', [...tripNums.values()].filter((s) => s.size > 1).length, 'one trip_id linked to different train numbers');
  c('formation_vs_series', events.filter((e) => e.vehicle_series && e.formation_length && !R.VEHICLE_CATALOG.some((v) => v.vehicle_series === e.vehicle_series && v.formation_length === e.formation_length)).length, 'series/formation pair not in vehicle_catalog');
  c('validity_conflict', events.filter((e) => e.valid_from && e.valid_until && e.valid_from > e.valid_until).length, 'valid_from after valid_until');
  c('verified_vehicle_without_source', events.filter((e) => e.vehicle_assignment_status !== 'unknown' && !e.vehicle_source_id).length, 'vehicle claim without source');
  c('e27_e01_merged', events.filter((e) => (e.station_id === 'toei:shinjuku:E27' && e.original_station_code?.endsWith('ShinjukuNishiguchi')) || (e.station_id === 'toei:shinjuku-nishiguchi:E01' && e.original_station_code?.endsWith('Oedo.Shinjuku'))).length, 'E27 / E01 confusion');
  return out;
}

// =========================================================== 5. coverage
const EVENT_COLUMNS = ['stop_event_id', 'station_id', 'station_complex_id', 'operator_id', 'line_id', 'platform_id', 'direction_id', 'service_date_type', 'service_calendar_id',
  'trip_id', 'trip_id_is_synthetic', 'original_trip_id', 'train_number', 'arrival_time_local', 'departure_time_local', 'arrival_time_source', 'departure_time_source',
  'arrival_seconds', 'departure_seconds', 'time_precision', 'arrival_departure_type', 'destination_text', 'destination_text_zh', 'origin_text', 'service_class', 'service_class_unified',
  'is_origin_at_station', 'is_terminal_at_station', 'through_service_text', 'vehicle_series', 'formation_length', 'vehicle_assignment_status', 'platform_verification_status',
  'route_pattern_id', 'original_station_code', 'original_line_code', 'source_id', 'vehicle_source_id', 'formation_source_id', 'valid_from', 'valid_until',
  'source_confidence', 'data_status', 'last_verified_at', 'remarks'];
const LEGACY_EXTRA = ['legacy_duplicate_count', 'legacy_csv_lines', 'legacy_match_status', 'legacy_coupled_group'];

// Legacy rows of lines covered by official data are superseded in the merged view.
const supersededLines = new Set(['toei:shinjuku', 'toei:oedo']);
// In the LOCAL merged view only, an official event that a legacy row matched exactly
// borrows that row's platform, flagged legacy_unverified. The committed file keeps null.
const legacyPlatformOf = new Map();
for (const x of crosswalk) if (x.match_status === 'matched_official_open_data') {
  const le = legacyEvents.find((e) => e.trip_id === x.legacy_trip_id);
  if (le?.platform_id) legacyPlatformOf.set(`${x.official_trip_id}@${x.station_id}`, le.platform_id);
}
const mergedEvents = [
  ...officialEvents.map((e) => (legacyPlatformOf.has(e.stop_event_id) && !e.platform_id
    ? { ...e, platform_id: legacyPlatformOf.get(e.stop_event_id), platform_verification_status: 'legacy_unverified', remarks: [e.remarks, 'platform_id taken from the legacy file (exact time/destination match); not in the official open data.'].filter(Boolean).join(' ') }
    : e)),
  ...legacyEvents.filter((e) => !supersededLines.has(e.line_id)),
];

function coverage(events) {
  const rows = [];
  const expected = [];
  for (const s of R.STATIONS) for (const lid of s.line_ids) for (const d of R.DIRECTIONS.filter((x) => x.line_id === lid)) for (const dt of ['weekday', 'saturday_holiday']) expected.push([s.station_id, lid, d.direction_id, dt]);
  const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
  for (const [sid, lid, did, dt] of expected) {
    const ev = events.filter((e) => e.station_id === sid && e.line_id === lid && e.direction_id === did && e.service_date_type === dt);
    const verified = ev.filter((e) => e.data_status === 'official').length;
    let gap = null;
    const op = stationById.get(sid).operator_id;
    if (!ev.length) {
      if (op === 'tokyo-metro') gap = 'no_licensed_source_available: ODPT Basic License needs a developer key and forbids republishing (fetch-odpt-tokyometro.mjs ready)';
      else if (op !== 'toei') gap = 'no_licensed_source_available: ODPT data is challenge-only; official sites reserve all rights';
      else gap = 'not_collected';
    }
    const arrivals_note = ['odakyu:shinjuku', 'keio:shinjuku', 'seibu:seibu-shinjuku'].includes(sid) || (op !== 'toei' && ev.length)
      ? 'arrivals not in any usable source (legacy file lists departures only)' : null;
    rows.push({
      operator_id: stationById.get(sid).operator_id, station_id: sid, line_id: lid, direction_id: did, service_date_type: dt,
      collected: ev.length, verified, pending_verification: ev.length - verified, gap, arrivals_note,
      train_number_pct: pct(ev.filter((e) => e.train_number).length, ev.length), platform_pct: pct(ev.filter((e) => e.platform_id).length, ev.length),
      vehicle_series_pct: pct(ev.filter((e) => e.vehicle_series).length, ev.length), formation_pct: pct(ev.filter((e) => e.formation_length).length, ev.length),
      arrival_time_pct: pct(ev.filter((e) => e.arrival_time_local).length, ev.length), departure_time_pct: pct(ev.filter((e) => e.departure_time_local).length, ev.length),
      sources: [...new Set(ev.map((e) => e.source_id))].join(';') || null,
    });
  }
  const tot = (f) => events.filter(f).length;
  return {
    totals: {
      events: events.length, official: tot((e) => e.data_status === 'official'), legacy_unverified: tot((e) => e.data_status === 'legacy_unverified'),
      train_number_pct: pct(tot((e) => e.train_number), events.length), platform_pct: pct(tot((e) => e.platform_id), events.length),
      vehicle_series_pct: pct(tot((e) => e.vehicle_series), events.length), formation_pct: pct(tot((e) => e.formation_length), events.length),
      vehicle_status: { verified: tot((e) => e.vehicle_assignment_status === 'verified'), representative: tot((e) => e.vehicle_assignment_status === 'representative'), unknown: tot((e) => e.vehicle_assignment_status === 'unknown') },
    },
    matrix: rows,
  };
}

// =========================================================== 6. write outputs
const strip = (o, cols) => Object.fromEntries(cols.map((c) => [c, o[c] ?? null]));
const flatList = (v) => (Array.isArray(v) ? v.join(';') : v);
const sortEv = (a, b) => a.station_id.localeCompare(b.station_id) || a.line_id.localeCompare(b.line_id) || a.service_date_type.localeCompare(b.service_date_type)
  || ((a.departure_seconds ?? a.arrival_seconds) - (b.departure_seconds ?? b.arrival_seconds)) || a.trip_id.localeCompare(b.trip_id);
officialEvents.sort(sortEv); legacyEvents.sort(sortEv); mergedEvents.sort(sortEv);

writeCsv(join(OUT, 'operators.csv'), ['operator_id', 'name_ja', 'name_en', 'name_zh', 'odpt_operator', 'legacy_name'], R.OPERATORS);
writeCsv(join(OUT, 'lines.csv'), ['line_id', 'operator_id', 'name_ja', 'name_en', 'name_zh', 'line_code', 'odpt_railway', 'legacy_names', 'remarks'], R.LINES.map((l) => ({ ...l, legacy_names: flatList(l.legacy_names) })));
const stationRows = R.STATIONS.map((s) => ({ ...s, line_ids: flatList(s.line_ids), station_code_status: s.operator_id === 'toei' ? 'verified_odpt' : ['M08', 'M09', 'F13'].includes(s.station_code) ? 'contract_given_unverified' : 'unverified',
  odpt_station_code: stationName.get(s.original_station_code)?.code ?? null }));
writeCsv(join(OUT, 'stations.csv'), ['station_id', 'operator_id', 'station_complex_id', 'name_ja', 'name_en', 'name_zh', 'line_ids', 'station_code', 'station_code_status', 'odpt_station_code', 'original_station_code', 'model_station_ref', 'source_id', 'remarks'], stationRows);
writeCsv(join(OUT, 'station_id_map.csv'), ['station_id', 'id_scheme', 'external_id', 'status'], R.STATIONS.flatMap((s) => [
  { station_id: s.station_id, id_scheme: 'odpt', external_id: s.original_station_code, status: s.operator_id === 'toei' ? 'confirmed_in_odpt_response' : 'odpt_vocabulary_pattern_unconfirmed' },
  ...(s.model_station_ref ? [{ station_id: s.station_id, id_scheme: 'senkiro-lab-c-model', external_id: s.model_station_ref, status: 'model_v2_id' }] : []),
  ...(s.station_code ? [{ station_id: s.station_id, id_scheme: 'station_number', external_id: s.station_code, status: s.operator_id === 'toei' ? 'verified_odpt' : 'unverified' }] : []),
]));
writeCsv(join(OUT, 'directions.csv'), ['direction_id', 'line_id', 'label_ja', 'odpt_direction', 'odpt_direction_title', 'legacy_label'],
  R.DIRECTIONS.map((d) => ({ ...d, odpt_direction_title: d.odpt_direction ? railDirTitle.get(d.odpt_direction) ?? null : null,
    legacy_label: d.legacy_label ?? (Object.entries(oedoDirOfLabel).filter(([, v]) => v === d.direction_id).map(([k]) => k).join(';') || null) })));
const platformUse = new Map(); for (const e of mergedEvents) if (e.platform_id) { const s = platformUse.get(e.platform_id) ?? new Set(); s.add(e.line_id); platformUse.set(e.platform_id, s); }
writeCsv(join(OUT, 'platforms.csv'), ['platform_id', 'station_id', 'track_label', 'model_platform_ref', 'physical_group', 'level_text', 'lines_observed', 'source_id', 'verification_status', 'remarks'],
  R.PLATFORMS.map((p) => ({ ...p, lines_observed: [...(platformUse.get(p.platform_id) ?? [])].join(';') || null })));
writeCsv(join(OUT, 'calendars.csv'), ['service_calendar_id', 'operator_id', 'service_date_type', 'source_calendar', 'rule', 'special_dates_status', 'source_id', 'remarks'], R.CALENDARS);
writeCsv(join(OUT, 'calendar_dates.csv'), ['date', 'weekday_ja', 'national_holiday_name', 'resolved_service_date_type', 'special_operation_flag', 'remarks', 'source_id'], calendarDates);
const SOURCE_COLS = ['source_id', 'title', 'publisher', 'url', 'catalog_url', 'retrieved_at', 'license', 'license_url', 'commercial_use', 'redistribution', 'share_alike', 'attribution_text', 'data_nature', 'timetable_name', 'published_date', 'revision_date', 'effective_from', 'effective_until', 'notes'];
writeCsv(join(OUT, 'sources.csv'), SOURCE_COLS, R.SOURCES);
const VEH_COLS = ['vehicle_id', 'operator_id', 'vehicle_series', 'formation_length', 'service_lines', 'valid_from', 'valid_until', 'model_asset_id', 'source_id', 'verification_status', 'remarks'];
writeCsv(join(OUT, 'vehicle_catalog.csv'), VEH_COLS, R.VEHICLE_CATALOG.map((v) => ({ ...v, service_lines: flatList(v.service_lines) })));
const ASSIGN_COLS = ['trip_id', 'train_number', 'vehicle_series', 'formation_length', 'candidate_vehicle_ids', 'owner_operator_id', 'vehicle_assignment_status', 'vehicle_source_id', 'formation_source_id', 'valid_from', 'valid_until', 'basis'];
writeCsv(join(OUT, 'trip_vehicle_assignments.csv'), ASSIGN_COLS, assignments);
const TRIP_COLS = ['trip_id', 'trip_id_is_synthetic', 'original_trip_id', 'train_number', 'train_number_source', 'operator_id', 'line_id', 'direction_id', 'service_date_type', 'service_calendar_id', 'service_class', 'service_class_unified', 'origin_text', 'destination_text', 'through_from_text', 'through_to_text', 'stop_count_in_source', 'source_id', 'valid_from', 'valid_until', 'data_status', 'last_modified_in_source'];
writeCsv(join(OUT, 'services.csv'), TRIP_COLS, officialTrips);
const LINK_COLS = ['trip_id', 'train_number', 'from_station_id', 'to_station_id', 'from_time_local', 'to_time_local', 'elapsed_minutes', 'intermediate_stops_in_source', 'match_status', 'source_id'];
writeCsv(join(OUT, 'trip_links.csv'), LINK_COLS, tripLinks);
writeCsv(join(OUT, 'timetable_events.csv'), EVENT_COLUMNS, officialEvents);
// local, gitignored
writeCsv(join(LOCAL, 'timetable_events.legacy.csv'), [...EVENT_COLUMNS, ...LEGACY_EXTRA], legacyEvents);
writeCsv(join(LOCAL, 'timetable_events.all.csv'), [...EVENT_COLUMNS, ...LEGACY_EXTRA], mergedEvents);
writeCsv(join(LOCAL, 'services.legacy.csv'), TRIP_COLS, legacyTrips);
writeCsv(join(LOCAL, 'legacy_crosswalk.csv'), ['legacy_trip_id', 'legacy_csv_lines', 'official_trip_id', 'official_train_number', 'match_status', 'station_id'], crosswalk);

const reference = {
  operators: R.OPERATORS, lines: R.LINES, stations: stationRows.map((s) => ({ ...s, line_ids: s.line_ids.split(';') })),
  directions: R.DIRECTIONS.map((d) => ({ ...d, odpt_direction_title: d.odpt_direction ? railDirTitle.get(d.odpt_direction) ?? null : null })),
  platforms: R.PLATFORMS, calendars: R.CALENDARS, calendar_dates: calendarDates, sources: R.SOURCES, vehicle_catalog: R.VEHICLE_CATALOG,
};
const jsonEvent = (e, extra = []) => strip(e, [...EVENT_COLUMNS, ...extra]);
const pkg = (layers, events, trips, extraCols = []) => ({
  schema: 'senkiro-timetable', schema_version: SCHEMA_VERSION, generated_at: GENERATED_AT, as_of_date: R.AS_OF_DATE, timezone: 'Asia/Tokyo',
  business_day: { rollover_hour: 4, note: 'Times are business-day clock times; 24:05 = 00:05 of the next calendar day. *_seconds count from 00:00 of the business day.' },
  layers, attribution: ['出典：東京都交通局・公共交通オープンデータ協議会 (CC BY 4.0) を加工して作成', '出典：内閣府「国民の祝日について」'],
  ...reference, trips, events: events.map((e) => jsonEvent(e, extraCols)), trip_links: tripLinks, trip_vehicle_assignments: assignments,
});
writeFileSync(join(OUT, 'senkiro_timetable.json'), JSON.stringify(pkg(['official-open'], officialEvents, officialTrips)));
writeFileSync(join(LOCAL, 'senkiro_timetable.full.json'), JSON.stringify(pkg(['official-open', 'legacy-unverified'], mergedEvents, [...officialTrips, ...legacyTrips.filter((t) => !supersededLines.has(t.line_id))], LEGACY_EXTRA)));

const covOfficial = coverage(officialEvents); const covMerged = coverage(mergedEvents);
writeFileSync(join(OUT, 'coverage_report.json'), JSON.stringify({ generated_at: GENERATED_AT, as_of_date: R.AS_OF_DATE,
  note: 'committed_layer = official open data only; with_local_legacy_layer = what a local build including the legacy file contains (counts only).',
  committed_layer: covOfficial, with_local_legacy_layer: covMerged }, null, 2));
writeFileSync(join(OUT, 'validation_report.json'), JSON.stringify({
  generated_at: GENERATED_AT, sources_manifest: { toei: { retrievedAt: toeiManifest.retrievedAt, files: Object.fromEntries(Object.entries(toeiManifest.files).map(([k, v]) => [k, { records: v.records, dcDate: v.dcDate, dctIssued: v.dctIssued }])) } },
  as_of_resolution: asOf, layers: [validate(officialEvents, 'official-open'), validate(mergedEvents, 'official-open + legacy-unverified (local)')],
  toei_station_vs_train_timetable: { ...stationTimetableCheck, only_in_station_timetable: stationTimetableCheck.only_in_station_timetable.slice(0, 50) },
  cross_station_links: { links: tripLinks.length, by_pair: tripLinks.reduce((o, l) => (bump(o, `${l.from_station_id} → ${l.to_station_id}`), o), {}) },
  legacy_vs_official: { ...legacyCheck, toei_unmatched_count: legacyCheck.toei_unmatched.length, toei_unmatched: legacyCheck.toei_unmatched.slice(0, 80), oedo_direction_mapping: oedoDirOfLabel },
  issues,
}, null, 2));
writeFileSync(join(OUT, 'legacy_audit_report.json'), JSON.stringify({ generated_at: GENERATED_AT, ...audit,
  verification_against_toei_open_data: { rows_checked: legacyCheck.toei_rows, rows_matched: legacyCheck.toei_matched, unmatched_groups: legacyCheck.toei_unmatched.length },
  keio_new_line_candidate_matches: { rows: legacyCheck.keio_new_rows, candidates: legacyCheck.keio_new_candidates } }, null, 2));

console.log(JSON.stringify({ officialEvents: officialEvents.length, officialTrips: officialTrips.length, tripLinks: tripLinks.length, legacyEvents: legacyEvents.length,
  mergedEvents: mergedEvents.length, stationTimetableCheck: { compared: stationTimetableCheck.compared, matched: stationTimetableCheck.matched, onlyStt: stationTimetableCheck.only_in_station_timetable.length, onlyTt: stationTimetableCheck.only_in_train_timetable, originMismatch: stationTimetableCheck.origin_flag_mismatch.length },
  legacyCheck: { ...legacyCheck, toei_unmatched: legacyCheck.toei_unmatched.length }, oedoDirOfLabel, issues: issues.length }, null, 1));
