/**
 * Canonical ids used by timetable records, and their mapping to the ids of
 * the station model (`sk:station:*`, `sk:line:*`, `sk:platform:*`).
 *
 * The station model keeps its own ids; this table is the stable bridge. A
 * timetable producer uses the ids on the left. Stations that share a name are
 * separate entries — 新宿 of each operator, 新宿三丁目 and 新宿西口 — and are
 * only grouped through `station_complex_id`.
 */
import type { Platform, StationModel } from '../domain/types';

export interface StationRegistryEntry {
  station_id: string;
  operator_id: string;
  /** Groups stations that are one interchange for a passenger. */
  station_complex_id: string;
  /** Station number as printed by the operator, when it has one. */
  station_number: string | null;
  name_ja: string;
  /** The station entity of the model that holds this station's platforms. */
  modelStationId: string;
  /** Canonical line ids that stop here. */
  line_ids: string[];
}

export const STATION_REGISTRY: readonly StationRegistryEntry[] = [
  { station_id: 'jr-east:shinjuku', operator_id: 'jr-east', station_complex_id: 'shinjuku', station_number: null, name_ja: 'JR 新宿駅', modelStationId: 'sk:station:jr-east-shinjuku',
    line_ids: ['jr-east:yamanote', 'jr-east:chuo-rapid', 'jr-east:chuo-sobu-local', 'jr-east:saikyo', 'jr-east:shonan-shinjuku', 'jr-east:chuo-limited-express', 'jr-east:narita-express', 'jr-east:tobu-through-limited-express'] },
  { station_id: 'odakyu:shinjuku', operator_id: 'odakyu', station_complex_id: 'shinjuku', station_number: 'OH01', name_ja: '小田急線 新宿駅', modelStationId: 'sk:station:odakyu-shinjuku', line_ids: ['odakyu:odawara'] },
  { station_id: 'keio:shinjuku', operator_id: 'keio', station_complex_id: 'shinjuku', station_number: 'KO01', name_ja: '京王線 新宿駅', modelStationId: 'sk:station:keio-shinjuku', line_ids: ['keio:keio'] },
  { station_id: 'keio:shinjuku-newline', operator_id: 'keio', station_complex_id: 'shinjuku', station_number: 'KO01', name_ja: '京王新線 新宿駅（新線新宿）', modelStationId: 'sk:station:keio-new-line-shinjuku', line_ids: ['keio:keio-new'] },
  { station_id: 'tokyo-metro:shinjuku:M08', operator_id: 'tokyo-metro', station_complex_id: 'shinjuku', station_number: 'M08', name_ja: '東京メトロ丸ノ内線 新宿駅', modelStationId: 'sk:station:tokyo-metro-shinjuku', line_ids: ['tokyo-metro:marunouchi'] },
  { station_id: 'toei:shinjuku:S01', operator_id: 'toei', station_complex_id: 'shinjuku', station_number: 'S01', name_ja: '都営新宿線 新宿駅', modelStationId: 'sk:station:keio-new-line-shinjuku', line_ids: ['toei:shinjuku'] },
  { station_id: 'toei:shinjuku:E27', operator_id: 'toei', station_complex_id: 'shinjuku', station_number: 'E27', name_ja: '都営大江戸線 新宿駅', modelStationId: 'sk:station:toei-oedo-shinjuku', line_ids: ['toei:oedo'] },
  { station_id: 'seibu:seibu-shinjuku', operator_id: 'seibu', station_complex_id: 'seibu-shinjuku', station_number: 'SS01', name_ja: '西武新宿駅', modelStationId: 'sk:station:seibu-shinjuku', line_ids: ['seibu:shinjuku'] },
  { station_id: 'tokyo-metro:shinjuku-sanchome:M09', operator_id: 'tokyo-metro', station_complex_id: 'shinjuku-sanchome', station_number: 'M09', name_ja: '東京メトロ丸ノ内線 新宿三丁目駅', modelStationId: 'sk:station:tokyo-metro-shinjuku-sanchome', line_ids: ['tokyo-metro:marunouchi'] },
  { station_id: 'tokyo-metro:shinjuku-sanchome:F13', operator_id: 'tokyo-metro', station_complex_id: 'shinjuku-sanchome', station_number: 'F13', name_ja: '東京メトロ副都心線 新宿三丁目駅', modelStationId: 'sk:station:tokyo-metro-shinjuku-sanchome', line_ids: ['tokyo-metro:fukutoshin'] },
  { station_id: 'toei:shinjuku-sanchome:S02', operator_id: 'toei', station_complex_id: 'shinjuku-sanchome', station_number: 'S02', name_ja: '都営新宿線 新宿三丁目駅', modelStationId: 'sk:station:toei-shinjuku-sanchome', line_ids: ['toei:shinjuku'] },
  { station_id: 'toei:shinjuku-nishiguchi:E01', operator_id: 'toei', station_complex_id: 'shinjuku-nishiguchi', station_number: 'E01', name_ja: '都営大江戸線 新宿西口駅', modelStationId: 'sk:station:toei-shinjuku-nishiguchi', line_ids: ['toei:oedo'] },
];

const STATIONS = new Map(STATION_REGISTRY.map((s) => [s.station_id, s]));

export function stationEntry(stationId: string): StationRegistryEntry | null {
  return STATIONS.get(stationId) ?? null;
}

export interface LineRegistryEntry {
  line_id: string;
  operator_id: string;
  name_ja: string;
  /** RailLine id(s) of the model. Several where the model splits what a timetable calls one line. */
  modelLineIds: string[];
  /** Other spellings a producer might use; matched case-insensitively. */
  aliases: string[];
}

export const LINE_REGISTRY: readonly LineRegistryEntry[] = [
  { line_id: 'jr-east:yamanote', operator_id: 'jr-east', name_ja: '山手線', modelLineIds: ['sk:line:jr-east-yamanote'], aliases: ['odpt.Railway:JR-East.Yamanote'] },
  { line_id: 'jr-east:chuo-rapid', operator_id: 'jr-east', name_ja: '中央線（快速）', modelLineIds: ['sk:line:jr-east-chuo-rapid'], aliases: ['odpt.Railway:JR-East.ChuoRapid'] },
  { line_id: 'jr-east:chuo-sobu-local', operator_id: 'jr-east', name_ja: '中央・総武線（各駅停車）', modelLineIds: ['sk:line:jr-east-chuo-sobu-local'], aliases: ['odpt.Railway:JR-East.ChuoSobuLocal'] },
  { line_id: 'jr-east:saikyo', operator_id: 'jr-east', name_ja: '埼京線', modelLineIds: ['sk:line:jr-east-saikyo'], aliases: ['odpt.Railway:JR-East.SaikyoKawagoe'] },
  { line_id: 'jr-east:shonan-shinjuku', operator_id: 'jr-east', name_ja: '湘南新宿ライン', modelLineIds: ['sk:line:jr-east-shonan-shinjuku'], aliases: ['odpt.Railway:JR-East.ShonanShinjuku'] },
  { line_id: 'jr-east:chuo-limited-express', operator_id: 'jr-east', name_ja: '中央線特急', modelLineIds: ['sk:line:jr-east-chuo-limited-express'], aliases: [] },
  { line_id: 'jr-east:narita-express', operator_id: 'jr-east', name_ja: '成田エクスプレス', modelLineIds: ['sk:line:jr-east-narita-express'], aliases: [] },
  { line_id: 'jr-east:tobu-through-limited-express', operator_id: 'jr-east', name_ja: '東武線直通特急', modelLineIds: ['sk:line:jr-east-tobu-through-limited-express'], aliases: [] },
  { line_id: 'odakyu:odawara', operator_id: 'odakyu', name_ja: '小田急線', modelLineIds: ['sk:line:odakyu-odakyu'], aliases: ['odakyu:odakyu', 'odpt.Railway:Odakyu.Odawara'] },
  { line_id: 'keio:keio', operator_id: 'keio', name_ja: '京王線', modelLineIds: ['sk:line:keio-keio'], aliases: ['odpt.Railway:Keio.Keio'] },
  { line_id: 'keio:keio-new', operator_id: 'keio', name_ja: '京王新線', modelLineIds: ['sk:line:keio-new'], aliases: ['keio:new', 'odpt.Railway:Keio.KeioNew'] },
  { line_id: 'tokyo-metro:marunouchi', operator_id: 'tokyo-metro', name_ja: '丸ノ内線', modelLineIds: ['sk:line:tokyo-metro-marunouchi'], aliases: ['odpt.Railway:TokyoMetro.Marunouchi'] },
  { line_id: 'tokyo-metro:fukutoshin', operator_id: 'tokyo-metro', name_ja: '副都心線', modelLineIds: ['sk:line:tokyo-metro-fukutoshin'], aliases: ['odpt.Railway:TokyoMetro.Fukutoshin'] },
  { line_id: 'toei:shinjuku', operator_id: 'toei', name_ja: '都営新宿線', modelLineIds: ['sk:line:toei-shinjuku'], aliases: ['odpt.Railway:Toei.Shinjuku'] },
  { line_id: 'toei:oedo', operator_id: 'toei', name_ja: '都営大江戸線', modelLineIds: ['sk:line:toei-oedo'], aliases: ['odpt.Railway:Toei.Oedo'] },
  { line_id: 'seibu:shinjuku', operator_id: 'seibu', name_ja: '西武新宿線', modelLineIds: ['sk:line:seibu-shinjuku'], aliases: ['odpt.Railway:Seibu.Shinjuku'] },
];

const LINES = new Map<string, LineRegistryEntry>();
for (const l of LINE_REGISTRY) {
  LINES.set(l.line_id.toLowerCase(), l);
  for (const alias of l.aliases) LINES.set(alias.toLowerCase(), l);
}

/** The registry entry for a line id or one of its aliases. */
export function lineEntry(lineId: string): LineRegistryEntry | null {
  return LINES.get(lineId.trim().toLowerCase()) ?? null;
}

/** `tokyo-metro` → `sk:operator:tokyo-metro`. */
export function modelOperatorId(operatorId: string): string {
  return `sk:operator:${operatorId}`;
}

/**
 * The track number of a platform id: what follows `<station_id>:`. A bare
 * number, or anything after the last ":" or "#", is accepted too, so that
 * "jr-east:shinjuku:14", "jr-east:shinjuku#14" and "14" all read as "14".
 */
export function trackNumberOf(platformId: string, stationId: string): string {
  const id = platformId.trim();
  if (id.startsWith(`${stationId}:`) || id.startsWith(`${stationId}#`)) return id.slice(stationId.length + 1);
  const cut = Math.max(id.lastIndexOf(':'), id.lastIndexOf('#'));
  return cut >= 0 ? id.slice(cut + 1) : id;
}

export function platformIdOf(stationId: string, trackNumber: string): string {
  return `${stationId}:${trackNumber}`;
}

export interface ResolvedTrack {
  platform: Platform;
  trackNumber: string;
  /** `${platform.id}#${trackNumber}` — the key used by the track tables of this prototype. */
  key: string;
}

export function trackKey(platformAreaId: string, trackNumber: string): string {
  return `${platformAreaId}#${trackNumber}`;
}

/**
 * The platform of the model that a record's `platform_id` names, or null when
 * the station is not in the model, or has no track with that number.
 */
export function resolveTrack(model: StationModel, stationId: string, platformId: string | null): ResolvedTrack | null {
  if (!platformId) return null;
  const station = stationEntry(stationId);
  if (!station) return null;
  const number = trackNumberOf(platformId, stationId);
  for (const area of model.areas) {
    if (area.kind !== 'platform' || area.stationId !== station.modelStationId) continue;
    if (area.tracks.some((t) => t.number === number)) return { platform: area, trackNumber: number, key: trackKey(area.id, number) };
  }
  return null;
}
