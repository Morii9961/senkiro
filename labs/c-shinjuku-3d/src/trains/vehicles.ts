/**
 * The vehicle library and the rules that pick a vehicle for a trip.
 *
 * A vehicle is never chosen from the colour of a line. It comes from, in
 * this order:
 *   1. the trip's own `vehicle_series`, with the status its producer gave;
 *   2. a rule for the line, where a source says which type runs on it;
 *   3. otherwise the neutral generic train, marked `unknown`.
 * The number of cars comes from the trip's `formation_length`, or from a
 * sourced fact about the line at this station — otherwise it is unknown and
 * the train is drawn as one undivided body.
 *
 * The 3D models are simplified shapes made for this prototype: proportions,
 * the number of doors and where the accent colour sits are schematic, and
 * every colour is an approximation, not an operator's colour value.
 */
import { lineEntry } from '../timetable/registry';
import type { TimetableRecord, VehicleAssignmentStatus } from '../timetable/types';

export type FrontShape = 'flat' | 'slant';

export interface VehicleSpec {
  id: string;
  /** Series as the operator writes it, e.g. "E235系". Null for the generic train. */
  series: string | null;
  operatorId: string | null;
  names: { ja: string; en: string; zh: string };
  /** Spellings matched against `vehicle_series` (lower-cased, without 系 / "series"). */
  aliases: string[];
  body: string;
  roof: string;
  /** Where the accent colour — the display colour of the trip's line — is applied. */
  accent: 'doors-and-front' | 'belt' | 'body' | 'none';
  front: FrontShape;
  doorsPerSide: number;
  sourceIds: string[];
  /** What was and was not checked about this model. */
  note: string;
}

const SCHEMATIC = 'Shape, door count and the placement of the accent colour are simplified for this prototype.';

export const GENERIC_VEHICLE: VehicleSpec = {
  id: 'generic',
  series: null,
  operatorId: null,
  names: { ja: '汎用の列車（車種不明）', en: 'Generic train (type unknown)', zh: '通用占位列车（车型未知）' },
  aliases: [],
  body: '#d3d7dc',
  roof: '#7c838c',
  accent: 'belt',
  front: 'flat',
  doorsPerSide: 4,
  sourceIds: ['src:senkiro-lab-schematic'],
  note: 'A placeholder: it stands for a train whose type is not known and does not depict any real vehicle.',
};

export const VEHICLES: readonly VehicleSpec[] = [
  {
    id: 'jr-east:E235',
    series: 'E235系',
    operatorId: 'jr-east',
    names: { ja: 'E235系', en: 'E235 series', zh: 'E235 系' },
    aliases: ['e235', 'e235-0', 'e235-1000'],
    body: '#e3e6ea',
    roof: '#6f767f',
    accent: 'doors-and-front',
    front: 'flat',
    doorsPerSide: 4,
    sourceIds: ['src:jreast-train-e235'],
    note: `JR East lists 山手線 among the lines of the E235系 (debut March 2016, 120 km/h). ${SCHEMATIC} The number of cars is not stated on that page.`,
  },
  {
    id: 'jr-east:E233',
    series: 'E233系',
    operatorId: 'jr-east',
    names: { ja: 'E233系', en: 'E233 series', zh: 'E233 系' },
    aliases: ['e233', 'e233-0', 'e233-7000', 'e233-3000'],
    body: '#e1e4e8',
    roof: '#6f767f',
    accent: 'belt',
    front: 'flat',
    doorsPerSide: 4,
    sourceIds: ['src:jreast-train-e233'],
    note: `JR East lists 中央線快速, 埼京線 and 湘南新宿ライン among the lines of the E233系. ${SCHEMATIC}`,
  },
  {
    id: 'jr-east:E231',
    series: 'E231系',
    operatorId: 'jr-east',
    names: { ja: 'E231系', en: 'E231 series', zh: 'E231 系' },
    aliases: ['e231', 'e231-0', 'e231-500', 'e231-1000'],
    body: '#dfe2e6',
    roof: '#6f767f',
    accent: 'belt',
    front: 'flat',
    doorsPerSide: 4,
    sourceIds: ['src:jreast-train-e231'],
    note: `JR East lists 中央線・総武線各駅停車 and 湘南新宿ライン among the lines of the E231系. ${SCHEMATIC}`,
  },
  {
    id: 'tokyo-metro:2000',
    series: '2000系',
    operatorId: 'tokyo-metro',
    names: { ja: '2000系', en: '2000 series', zh: '2000 系' },
    aliases: ['2000', 'metro2000', 'tokyometro2000'],
    body: '#d8dbdf',
    roof: '#8d9299',
    accent: 'body',
    front: 'flat',
    doorsPerSide: 3,
    sourceIds: ['src:tokyometro-marunouchi-2000'],
    note: `Tokyo Metro's train for the Marunouchi Line since 2019, reported as red; the body takes the line's display colour here. ${SCHEMATIC}`,
  },
  {
    id: 'toei:10-300',
    series: '10-300形',
    operatorId: 'toei',
    names: { ja: '10-300形', en: 'Type 10-300', zh: '10-300 形' },
    aliases: ['10-300', 'toei10-300'],
    body: '#dde0e4',
    roof: '#7a8189',
    accent: 'belt',
    front: 'flat',
    doorsPerSide: 4,
    sourceIds: ['src:tetsudoch-toei-shinjuku-10cars'],
    note: `The Toei trainsets of the Shinjuku Line, all 10 cars long since 2022. ${SCHEMATIC}`,
  },
];

function normaliseSeries(s: string): string {
  return s.toLowerCase().replace(/系|series|形/g, '').replace(/\s+/g, '').trim();
}

const BY_ALIAS = new Map<string, VehicleSpec>();
for (const v of VEHICLES) for (const a of v.aliases) BY_ALIAS.set(a, v);

export function vehicleBySeries(series: string): VehicleSpec | null {
  const key = normaliseSeries(series);
  return BY_ALIAS.get(key) ?? BY_ALIAS.get(key.replace(/-\d+$/, '')) ?? null;
}

export interface LineVehicleRule {
  line_id: string;
  vehicleId: string;
  /** verified: the source ties this line to this one type. representative: one of the types the source lists for it. */
  status: Exclude<VehicleAssignmentStatus, 'unknown'>;
  sourceIds: string[];
  note: string;
}

/**
 * Rules per line. Only lines whose type was read from a source are listed;
 * the others fall through to the generic train. Lines with several types in
 * service (Odakyu, Keio, the subway lines with through-running, limited
 * expresses…) are deliberately absent until each type has a source.
 */
export const LINE_VEHICLE_RULES: readonly LineVehicleRule[] = [
  {
    line_id: 'jr-east:yamanote', vehicleId: 'jr-east:E235', status: 'verified', sourceIds: ['src:jreast-train-e235', 'src:trafficnews-yamanote-e235'],
    note: 'JR East lists 山手線 under the E235系, and announced in January 2020 that the whole Yamanote Line fleet had been replaced by it (50 sets, 550 cars).',
  },
  {
    line_id: 'jr-east:chuo-rapid', vehicleId: 'jr-east:E233', status: 'representative', sourceIds: ['src:jreast-train-e233', 'src:tetsudoch-chuo-green-car'],
    note: 'JR East lists 中央線快速 under the E233系, which carries the green cars introduced in March 2025. Whether every trip uses it was not checked.',
  },
  {
    line_id: 'jr-east:saikyo', vehicleId: 'jr-east:E233', status: 'representative', sourceIds: ['src:jreast-train-e233'],
    note: 'JR East lists 埼京線 under the E233系. Trains of other companies run through on this line; the type of a given trip was not checked.',
  },
  {
    line_id: 'jr-east:chuo-sobu-local', vehicleId: 'jr-east:E231', status: 'representative', sourceIds: ['src:jreast-train-e231'],
    note: 'JR East lists 中央線・総武線各駅停車 under the E231系. Other types run on the line as well.',
  },
  {
    line_id: 'tokyo-metro:marunouchi', vehicleId: 'tokyo-metro:2000', status: 'representative', sourceIds: ['src:tokyometro-marunouchi-2000'],
    note: 'Tokyo Metro planned for every Marunouchi Line trainset to be a 2000系 in fiscal 2023; that the last 02系 has gone was not confirmed.',
  },
  {
    line_id: 'toei:shinjuku', vehicleId: 'toei:10-300', status: 'representative', sourceIds: ['src:tetsudoch-toei-shinjuku-10cars'],
    note: 'The Toei-owned trains of the line. Keio trains run through as well; the type of a given trip was not checked.',
  },
];

export interface FormationFact {
  station_id: string;
  line_id: string;
  cars: number;
  sourceIds: string[];
  note: string;
}

/** Car counts that a source states for a line at a station. */
export const FORMATION_FACTS: readonly FormationFact[] = [
  {
    station_id: 'jr-east:shinjuku', line_id: 'jr-east:yamanote', cars: 11, sourceIds: ['src:trafficnews-yamanote-e235'],
    note: '50 trainsets and 550 cars in all: 11 cars per train.',
  },
  {
    station_id: 'jr-east:shinjuku', line_id: 'jr-east:chuo-rapid', cars: 12, sourceIds: ['src:tetsudoch-chuo-green-car'],
    note: '10-car E233系 sets plus two green cars since March 2025. 10-car trains were still reported in the mix around the start of the service; a trip that says otherwise in the timetable wins.',
  },
  {
    station_id: 'tokyo-metro:shinjuku:M08', line_id: 'tokyo-metro:marunouchi', cars: 6, sourceIds: ['src:tokyometro-marunouchi-2000'],
    note: 'Tokyo Metro speaks of 53 six-car trainsets for the line.',
  },
  {
    station_id: 'toei:shinjuku:S01', line_id: 'toei:shinjuku', cars: 10, sourceIds: ['src:tetsudoch-toei-shinjuku-10cars'],
    note: 'The Toei Shinjuku Line has been all 10-car since August 2022.',
  },
  {
    station_id: 'toei:shinjuku:E27', line_id: 'toei:oedo', cars: 8, sourceIds: ['src:toei-shinjuku-map'],
    note: 'The のりかえ・出口案内 table under the Toei 立体図 numbers the cars of the Oedo Line from 1 to 8.',
  },
];

export interface ResolvedVehicle {
  spec: VehicleSpec;
  status: VehicleAssignmentStatus;
  /** How the vehicle was chosen. */
  basis: 'trip' | 'trip-series-not-in-library' | 'line-rule' | 'none';
  /** Series text to show: the trip's own, else the library's, else null. */
  seriesLabel: string | null;
  cars: number | null;
  carsBasis: 'trip' | 'line-fact' | null;
  sourceIds: string[];
  note: string;
}

export function resolveVehicle(r: Pick<TimetableRecord, 'station_id' | 'line_id' | 'vehicle_series' | 'formation_length' | 'vehicle_assignment_status' | 'source_id'>): ResolvedVehicle {
  const lineId = lineEntry(r.line_id)?.line_id ?? r.line_id;
  const fact = FORMATION_FACTS.find((f) => f.station_id === r.station_id && f.line_id === lineId) ?? null;
  const cars = r.formation_length ?? fact?.cars ?? null;
  const carsBasis = r.formation_length != null ? 'trip' : fact ? 'line-fact' : null;
  const carSources = r.formation_length != null ? [] : (fact?.sourceIds ?? []);

  if (r.vehicle_series && r.vehicle_assignment_status !== 'unknown') {
    const spec = vehicleBySeries(r.vehicle_series);
    if (spec) {
      return { spec, status: r.vehicle_assignment_status, basis: 'trip', seriesLabel: r.vehicle_series, cars, carsBasis, sourceIds: [r.source_id, ...spec.sourceIds, ...carSources], note: spec.note };
    }
    return {
      spec: GENERIC_VEHICLE, status: r.vehicle_assignment_status, basis: 'trip-series-not-in-library', seriesLabel: r.vehicle_series, cars, carsBasis,
      sourceIds: [r.source_id, ...carSources], note: 'The timetable names this type, but the library has no model of it yet; the generic train is drawn.',
    };
  }

  const rule = LINE_VEHICLE_RULES.find((x) => x.line_id === lineId);
  const spec = rule ? VEHICLES.find((v) => v.id === rule.vehicleId) : null;
  if (rule && spec) {
    return { spec, status: rule.status, basis: 'line-rule', seriesLabel: spec.series, cars, carsBasis, sourceIds: [...rule.sourceIds, ...carSources], note: rule.note };
  }
  return { spec: GENERIC_VEHICLE, status: 'unknown', basis: 'none', seriesLabel: null, cars, carsBasis, sourceIds: [...GENERIC_VEHICLE.sourceIds, ...carSources], note: GENERIC_VEHICLE.note };
}
