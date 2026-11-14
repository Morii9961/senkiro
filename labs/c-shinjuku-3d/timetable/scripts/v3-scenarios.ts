// Phase 6 — V3 integration scenarios run against the real data through the adapter.
// Writes data/shinjuku/v3_scenarios.json (official layer only, committable) and,
// when the local legacy layer exists, data/shinjuku/local/v3_scenarios.local.json.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  getEventsAroundTime, getPlatformEvents, getStationDepartures, getTrainByTripId, getVehicleAssignment,
  indexTimetable, mergeLayers, resolveServiceDateType, vehicleLabel,
} from '../adapter/senkiroTimetable.ts';
import type { ResolvedEvent, SenkiroTimetable, TimetableIndex } from '../adapter/senkiroTimetable.ts';

const D = new URL('../../data/shinjuku/', import.meta.url);
const base: SenkiroTimetable = JSON.parse(readFileSync(new URL('senkiro_timetable.json', D), 'utf8'));
const fullPath = new URL('local/senkiro_timetable.full.json', D);
const brief = (e: ResolvedEvent) => ({
  station_id: e.station_id, line_id: e.line_id, platform_id: e.platform_id, direction_id: e.direction_id, train_number: e.train_number,
  arr: e.arrival_time_local, dep: e.departure_time_local, instant: e.departure_instant ?? e.arrival_instant, dest: e.destination_text,
  class: e.service_class, vehicle: vehicleLabel(e), status: e.data_status, platform_status: e.platform_verification_status, trip_id: e.trip_id,
});
const win = (idx: TimetableIndex, sid: string, date: string, h1: string, h2: string, opts = {}) => {
  const s = (t: string) => Number(t.slice(0, 2)) * 3600 + Number(t.slice(3, 5)) * 60;
  return getStationDepartures(idx, sid, date, opts).concat(
    (idx.byStation.get(sid) ?? []).filter((e) => e.departure_seconds === null && e.service_date_type === resolveServiceDateType(idx, date).service_date_type)
      .map((e) => ({ ...e, service_date: date, arrival_instant: null, departure_instant: null })) as ResolvedEvent[],
  ).filter((e) => { const t = (e.departure_seconds ?? e.arrival_seconds)!; return t >= s(h1) && t <= s(h2); })
    .sort((a, b) => (a.departure_seconds ?? a.arrival_seconds)! - (b.departure_seconds ?? b.arrival_seconds)!);
};

function run(idx: TimetableIndex, withLegacy: boolean) {
  const S: Record<string, unknown> = {};
  const DAY = '2026-11-14';
  S.day_type_resolution = ['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-23', '2026-12-31', '2027-01-04'].map((d) => resolveServiceDateType(idx, d));

  // Shinjuku-sanchome S02 + Shinjuku S01 (Toei Shinjuku Line incl. Keio through trains)
  S.toei_shinjuku_line_0800_0815 = {
    S02: win(idx, 'toei:shinjuku-sanchome:S02', DAY, '08:00', '08:15').map(brief),
    S01: win(idx, 'toei:shinjuku:S01', DAY, '08:00', '08:15').map(brief),
  };
  const through = idx.data.trips.find((t) => t.line_id === 'toei:shinjuku' && t.through_to_text && t.service_date_type === 'saturday_holiday' && t.train_number?.endsWith('K'))!;
  S.toei_through_train_example = { trip: getTrainByTripId(idx, through.trip_id), vehicle: getVehicleAssignment(idx, through.trip_id) };
  // Oedo E27 / E01
  S.oedo_e27_e01_1200_1210 = { E27: win(idx, 'toei:shinjuku:E27', DAY, '12:00', '12:10').map(brief), E01: win(idx, 'toei:shinjuku-nishiguchi:E01', DAY, '12:00', '12:10').map(brief) };
  const loopTrip = idx.data.trip_links.find((l) => l.from_station_id === 'toei:shinjuku-nishiguchi:E01' && l.to_station_id === 'toei:shinjuku:E27')!;
  S.oedo_loop_trip_e01_to_e27 = { link: loopTrip, vehicle: getVehicleAssignment(idx, loopTrip.trip_id) };
  // Shinjuku-sanchome Tokyo Metro (gap)
  S.shinjuku_sanchome_metro = { M09: getStationDepartures(idx, 'tokyo-metro:shinjuku-sanchome:M09', DAY).length, F13: getStationDepartures(idx, 'tokyo-metro:shinjuku-sanchome:F13', DAY).length, note: 'Empty: no timetable obtainable under a usable licence (see coverage_report.json).' };
  // Cross-midnight
  S.cross_midnight_2026_11_15_0020 = getEventsAroundTime(idx, '2026-11-15T00:20:00+09:00', idx.data.stations.map((s) => s.station_id), { beforeMinutes: 10, afterMinutes: 10 }).map(brief);
  // Weekday vs Sat/Hol counts on the same station
  S.weekday_vs_holiday_counts = Object.fromEntries(idx.data.stations.map((s) => [s.station_id, {
    '2026-11-13 (Fri)': getStationDepartures(idx, s.station_id, '2026-11-13').length,
    '2026-11-14 (Sat)': getStationDepartures(idx, s.station_id, '2026-11-14').length,
    '2026-11-23 (Mon, holiday)': getStationDepartures(idx, s.station_id, '2026-11-23').length,
  }]));

  if (withLegacy) {
    S.jr_yamanote_track14_15_0800_0815 = {
      track14: getPlatformEvents(idx, 'jr-east:shinjuku', 'jr-east:shinjuku:track-14', { serviceDate: DAY, fromSeconds: 8 * 3600, toSeconds: 8 * 3600 + 900 }).map(brief),
      track15: getPlatformEvents(idx, 'jr-east:shinjuku', 'jr-east:shinjuku:track-15', { serviceDate: DAY, fromSeconds: 8 * 3600, toSeconds: 8 * 3600 + 900 }).map(brief),
      note: 'Legacy layer: departures only, no arrival times, no train numbers; platform from the legacy file.',
    };
    const chuo = win(idx, 'jr-east:shinjuku', DAY, '09:00', '09:15', { lineId: 'jr-east:chuo-rapid' });
    S.jr_chuo_rapid_formation_0900_0915 = {
      events: chuo.map(brief),
      vehicle_catalog_configs: idx.data.vehicle_catalog.filter((v) => v.vehicle_series === 'E233-0'),
      result: 'Per-trip formation (12 cars with Green cars vs. remaining 10-car sets) cannot be assigned from any available source → vehicle_assignment_status unknown; the catalog lists both configurations.',
    };
    S.keio_new_line_vs_toei_1000_1015 = { keio_new: win(idx, 'keio:shinjuku-newline', DAY, '10:00', '10:15').map(brief), toei_S01: win(idx, 'toei:shinjuku:S01', DAY, '10:00', '10:15').map(brief) };
    S.odakyu_local_and_romancecar_1200_1230 = win(idx, 'odakyu:shinjuku', DAY, '12:00', '12:30').map(brief);
    S.seibu_shinjuku_1730_1745 = win(idx, 'seibu:seibu-shinjuku', DAY, '17:30', '17:45').map(brief);
    S.marunouchi_M08_vs_M09_1200_1205 = { M08: win(idx, 'tokyo-metro:shinjuku:M08', DAY, '12:00', '12:05').map(brief), M09: 'no data (gap)' };
  }
  return S;
}

const out = { generated_at: new Date().toISOString(), layer: 'official-open', scenarios: run(indexTimetable(base), false) };
writeFileSync(new URL('v3_scenarios.json', D), JSON.stringify(out, null, 2));
if (existsSync(fullPath)) {
  const full: SenkiroTimetable = JSON.parse(readFileSync(fullPath, 'utf8'));
  writeFileSync(new URL('local/v3_scenarios.local.json', D), JSON.stringify({ generated_at: out.generated_at, layer: 'official-open + legacy-unverified', scenarios: run(indexTimetable(mergeLayers(base, full)), true) }, null, 2));
}
console.log('scenarios written');
