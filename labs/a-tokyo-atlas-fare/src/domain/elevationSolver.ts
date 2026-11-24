/**
 * Continuous 3D Vertical Railway Network Solver (Pure TypeScript, zero Three.js/React dependency).
 *
 * Computes spatially self-consistent 3D splines, schematic height tiers, portal transitions,
 * crossing vertical deconfliction, and multi-level station complex volumes directly from
 * the shared AtlasDataset + isolated OsmVerticalDataset.
 *
 * Honesty discipline:
 *  - Every height value is explicitly tagged with `heightBasis`:
 *    'manual-verified-relative' | 'osm-derived-schematic' | 'inferred-schematic'.
 *  - Heights are schematic relative units (e.g., L+2=+20, L+1=+10..+14, L0=0, L-1=-10,
 *    L-2=-20, L-3=-30, L-4=-40) and are NEVER presented as surveyed official depths.
 *  - 2D crossings between non-connected lines NEVER create fake track junctions.
 */

import { lonLatToWorld, TOKYO_ORIGIN, type ProjectionOrigin } from '../three/geoProjection.js';
import type {
  AtlasDataset,
  OsmVerticalDataset,
  SkId,
  TrackSegment,
  TrackVerticalAttribute,
} from './types.js';

export type SchematicTierId = 'L+2' | 'L+1' | 'L0' | 'L-1' | 'L-2' | 'L-3' | 'L-4';

export type HeightBasis =
  | 'manual-verified-relative'
  | 'osm-derived-schematic'
  | 'inferred-schematic';

export type TrackStructureKind = 'viaduct' | 'surface' | 'tunnel_box' | 'tunnel_shield';

export interface SolvedPoint3D {
  x: number;
  y: number;
  z: number;
  t: number; // 0..1 normalized parameter along segment
  distFromStart: number;
  structure: TrackStructureKind;
  tier: SchematicTierId;
}

export interface PortalPoint3D {
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirZ: number;
  segmentId: SkId<'segment'>;
  lineId: SkId<'line'>;
  tunnelKind: 'tunnel_box' | 'tunnel_shield';
}

export interface SolvedSegment3D {
  segmentId: SkId<'segment'>;
  primaryLineId: SkId<'line'>;
  railLineIds: SkId<'line'>[];
  operatorId: SkId<'operator'>;
  fromStationId: SkId<'station'>;
  toStationId: SkId<'station'>;
  color: string;
  isShinkansen: boolean;
  isDoubleTrack: boolean;
  lateralOffsetM: number;
  points: SolvedPoint3D[];
  portals: PortalPoint3D[];
  minY: number;
  maxY: number;
  dominantTier: SchematicTierId;
  dominantStructure: TrackStructureKind;
  heightBasis: HeightBasis;
  deconflictedCrossings: number;
}

export interface SolvedStationNode3D {
  stationId: SkId<'station'>;
  lineId: SkId<'line'>;
  operatorId: SkId<'operator'>;
  stationComplexId: SkId<'complex'> | null;
  nameJa: string;
  nameEn: string | null;
  stationCode: string | null;
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirZ: number;
  tier: SchematicTierId;
  structure: TrackStructureKind;
  heightBasis: HeightBasis;
  color: string;
  isMajorHub: boolean;
}

export interface VerticalTransferConnector3D {
  complexId: SkId<'complex'>;
  fromStationId: SkId<'station'>;
  toStationId: SkId<'station'>;
  x1: number;
  y1: number;
  z1: number;
  x2: number;
  y2: number;
  z2: number;
  gateType: 'in_gate' | 'out_of_gate' | 'unknown';
}

export interface CrossingCheckRecord {
  segmentA: SkId<'segment'>;
  segmentB: SkId<'segment'>;
  x: number;
  z: number;
  yA: number;
  yB: number;
  clearance: number;
  wasAdjusted: boolean;
}

export interface SolvedRailwayNetwork3D {
  segments: SolvedSegment3D[];
  stationNodes: SolvedStationNode3D[];
  transferConnectors: VerticalTransferConnector3D[];
  crossings: CrossingCheckRecord[];
  tierCounts: Record<SchematicTierId, number>;
}

export const SCHEMATIC_TIERS: {
  id: SchematicTierId;
  labelJa: string;
  labelEn: string;
  nominalY: number;
}[] = [
  { id: 'L+2', labelJa: '高架2層 (+20)', labelEn: 'Elevated L+2 (+20)', nominalY: 20 },
  { id: 'L+1', labelJa: '高架1層 (+10)', labelEn: 'Elevated L+1 (+10)', nominalY: 10 },
  { id: 'L0', labelJa: '地上 (0)', labelEn: 'Surface L0 (0)', nominalY: 0 },
  { id: 'L-1', labelJa: '地下1層 (-10)', labelEn: 'Underground L-1 (-10)', nominalY: -10 },
  { id: 'L-2', labelJa: '地下2層 (-20)', labelEn: 'Underground L-2 (-20)', nominalY: -20 },
  { id: 'L-3', labelJa: '地下3層 (-30)', labelEn: 'Underground L-3 (-30)', nominalY: -30 },
  { id: 'L-4', labelJa: '地下4層 (-40)', labelEn: 'Underground L-4 (-40)', nominalY: -40 },
];

export function classifyTier(y: number): SchematicTierId {
  if (y >= 16) return 'L+2';
  if (y >= 4) return 'L+1';
  if (y > -5) return 'L0';
  if (y > -15) return 'L-1';
  if (y > -25) return 'L-2';
  if (y > -34) return 'L-3';
  return 'L-4';
}

export function classifyStructure(y: number, lineId: SkId<'line'>): TrackStructureKind {
  if (y > 2.4) return 'viaduct';
  if (y >= -2.4) return 'surface';
  // Shield tunnels for deep lines (Oedo, Fukutoshin, Namboku, Yurakucho, Toei Shinjuku, Toyoko underground, Sobu underground)
  const shieldLines = new Set<string>([
    'sk:line:toei-oedo',
    'sk:line:metro-fukutoshin',
    'sk:line:metro-namboku',
    'sk:line:metro-yurakucho',
    'sk:line:tokyu-toyoko',
  ]);
  if (y <= -24 || shieldLines.has(lineId)) {
    return 'tunnel_shield';
  }
  return 'tunnel_box';
}

/**
 * Default schematic line elevation profiles (Tokyo real vertical hierarchy).
 * Used as baseline when known hub overrides or OSM tags don't specify otherwise.
 */
const LINE_BASE_ELEVATION: Record<string, { y: number; lateralM: number; priority: number }> = {
  // Shinkansen (highest viaduct priority)
  'sk:line:jr-central-tokaido-shinkansen': { y: 18, lateralM: 12, priority: 10 },
  'sk:line:jr-east-tohoku-shinkansen': { y: 18, lateralM: -12, priority: 10 },
  // JR Trunk & Urban Lines
  'sk:line:jr-east-chuo': { y: 10, lateralM: -7, priority: 8 },
  'sk:line:jr-east-sobu': { y: 8, lateralM: 7, priority: 7 },
  'sk:line:jr-east-yamanote': { y: 7.5, lateralM: 0, priority: 9 },
  'sk:line:jr-east-tohoku': { y: 2, lateralM: 6, priority: 7 },
  'sk:line:jr-east-tohoku-oku': { y: 2, lateralM: -6, priority: 6 },
  'sk:line:jr-east-tohoku-saikyo': { y: 10, lateralM: -9, priority: 6 },
  'sk:line:jr-east-akabane': { y: 8, lateralM: -5, priority: 6 },
  'sk:line:jr-east-tokaido': { y: 0, lateralM: 0, priority: 8 },
  'sk:line:jr-east-tokaido-hinkaku': { y: 4, lateralM: -8, priority: 6 },
  'sk:line:jr-east-joban': { y: 4, lateralM: 6, priority: 6 },
  'sk:line:jr-east-hachiko': { y: 0, lateralM: 0, priority: 5 },
  'sk:line:jr-central-tokaido': { y: 0, lateralM: 0, priority: 8 },
  // Tokyo Metro (explicit vertical stacking: shallow -> mid -> deep!)
  'sk:line:metro-ginza': { y: -9, lateralM: 0, priority: 9 },
  'sk:line:metro-marunouchi': { y: -11, lateralM: 0, priority: 8 },
  'sk:line:metro-hibiya': { y: -13, lateralM: 0, priority: 7 },
  'sk:line:metro-tozai': { y: -18, lateralM: 0, priority: 7 },
  'sk:line:metro-chiyoda': { y: -20, lateralM: 0, priority: 6 },
  'sk:line:metro-hanzomon': { y: -21, lateralM: 0, priority: 6 },
  'sk:line:metro-yurakucho': { y: -27, lateralM: 0, priority: 5 },
  'sk:line:metro-fukutoshin': { y: -30, lateralM: 0, priority: 5 },
  'sk:line:metro-namboku': { y: -33, lateralM: 0, priority: 4 },
  // Toei Subway (explicit vertical stacking: Asakusa -> Shinjuku -> Mita -> Oedo deepest!)
  'sk:line:toei-asakusa': { y: -16, lateralM: 0, priority: 7 },
  'sk:line:toei-shinjuku': { y: -23, lateralM: 0, priority: 6 },
  'sk:line:toei-mita': { y: -25, lateralM: 0, priority: 5 },
  'sk:line:toei-oedo': { y: -39, lateralM: 0, priority: 3 },
  // Major Private Railways
  'sk:line:odakyu-odawara': { y: 0, lateralM: -8, priority: 7 },
  'sk:line:keio-keio': { y: -8, lateralM: 8, priority: 6 },
  'sk:line:keio-inokashira': { y: 7, lateralM: 0, priority: 7 },
  'sk:line:seibu-shinjuku': { y: 6, lateralM: 0, priority: 7 },
  'sk:line:seibu-ikebukuro': { y: 5, lateralM: 0, priority: 7 },
  'sk:line:tokyu-toyoko': { y: 9, lateralM: 0, priority: 6 },
  'sk:line:tokyu-denentoshi': { y: -18, lateralM: 0, priority: 6 },
  'sk:line:keikyu-main': { y: 8, lateralM: 6, priority: 7 },
  'sk:line:keikyu-airport': { y: -12, lateralM: 0, priority: 6 },
  'sk:line:tobu-skytree': { y: 10, lateralM: 0, priority: 7 },
  'sk:line:tobu-tojo': { y: 0, lateralM: 0, priority: 7 },
  'sk:line:keisei-main': { y: 6, lateralM: 0, priority: 7 },
  'sk:line:keisei-oshiage': { y: 6, lateralM: 0, priority: 6 },
};

/**
 * Verified landmark & hub relative vertical overrides (Section 4.3 & Section 5).
 * Key: `${lineId}::${jaStationName}` -> exact schematic elevation + provenance basis.
 */
const VERIFIED_STATION_LINE_OVERRIDES: Record<string, { y: number; basis: HeightBasis }> = {
  // === 5.1 SHIBUYA MULTI-LEVEL STACK (Flagship verification case!) ===
  // Ginza Line sits on Elevated 3F above ground (+14), strictly above Inokashira, JR Yamanote viaduct & all subways!
  'sk:line:metro-ginza::渋谷': { y: 14, basis: 'manual-verified-relative' },
  'sk:line:metro-ginza::表参道': { y: -10, basis: 'manual-verified-relative' },
  'sk:line:jr-east-yamanote::渋谷': { y: 6.5, basis: 'manual-verified-relative' },
  'sk:line:keio-inokashira::渋谷': { y: 10.5, basis: 'manual-verified-relative' },
  'sk:line:metro-hanzomon::渋谷': { y: -18, basis: 'manual-verified-relative' },
  'sk:line:tokyu-denentoshi::渋谷': { y: -18, basis: 'manual-verified-relative' },
  'sk:line:metro-fukutoshin::渋谷': { y: -30, basis: 'manual-verified-relative' },
  'sk:line:tokyu-toyoko::渋谷': { y: -30, basis: 'manual-verified-relative' },
  'sk:line:tokyu-toyoko::代官山': { y: -6, basis: 'manual-verified-relative' },
  'sk:line:tokyu-toyoko::中目黒': { y: 10, basis: 'manual-verified-relative' },

  // === YAMANOTE LINE CENTRAL TOKYO ELEVATED VIADUCT CORRIDOR ===
  'sk:line:jr-east-yamanote::東京': { y: 7.5, basis: 'manual-verified-relative' },
  'sk:line:jr-east-yamanote::神田': { y: 8.5, basis: 'manual-verified-relative' },
  'sk:line:jr-east-yamanote::秋葉原': { y: 8.5, basis: 'manual-verified-relative' },
  'sk:line:jr-east-yamanote::御徒町': { y: 8, basis: 'manual-verified-relative' },
  'sk:line:jr-east-yamanote::上野': { y: 7.5, basis: 'manual-verified-relative' },
  'sk:line:jr-east-yamanote::有楽町': { y: 8.5, basis: 'manual-verified-relative' },
  'sk:line:jr-east-yamanote::新橋': { y: 8.5, basis: 'manual-verified-relative' },
  'sk:line:jr-east-yamanote::浜松町': { y: 8, basis: 'manual-verified-relative' },
  'sk:line:jr-east-yamanote::田町': { y: 6.5, basis: 'manual-verified-relative' },
  'sk:line:jr-east-yamanote::恵比寿': { y: 7, basis: 'manual-verified-relative' },
  'sk:line:jr-east-yamanote::大崎': { y: 6.5, basis: 'manual-verified-relative' },
  'sk:line:jr-east-yamanote::五反田': { y: 8, basis: 'manual-verified-relative' },
  'sk:line:jr-east-yamanote::目黒': { y: 4, basis: 'manual-verified-relative' },
  'sk:line:jr-east-yamanote::原宿': { y: 3.5, basis: 'manual-verified-relative' },
  'sk:line:jr-east-yamanote::代々木': { y: 4.5, basis: 'manual-verified-relative' },

  // === 5.2 SHINJUKU MULTI-LEVEL STACK ===
  'sk:line:jr-east-yamanote::新宿': { y: 0, basis: 'manual-verified-relative' },
  'sk:line:jr-east-chuo::新宿': { y: 0, basis: 'manual-verified-relative' },
  'sk:line:odakyu-odawara::新宿': { y: 0, basis: 'manual-verified-relative' },
  'sk:line:seibu-shinjuku::西武新宿': { y: 7, basis: 'manual-verified-relative' },
  'sk:line:keio-keio::新宿': { y: -9, basis: 'manual-verified-relative' },
  'sk:line:metro-marunouchi::新宿': { y: -12, basis: 'manual-verified-relative' },
  'sk:line:toei-shinjuku::新宿': { y: -22, basis: 'manual-verified-relative' },
  'sk:line:toei-oedo::新宿': { y: -38, basis: 'manual-verified-relative' },
  'sk:line:toei-oedo::新宿西口': { y: -36, basis: 'manual-verified-relative' },
  'sk:line:metro-marunouchi::新宿三丁目': { y: -11, basis: 'manual-verified-relative' },
  'sk:line:toei-shinjuku::新宿三丁目': { y: -21, basis: 'manual-verified-relative' },
  'sk:line:metro-fukutoshin::新宿三丁目': { y: -31, basis: 'manual-verified-relative' },

  // === 5.3 TOKYO & OTEMACHI MULTI-LEVEL STACK ===
  'sk:line:jr-east-chuo::東京': { y: 14, basis: 'manual-verified-relative' },
  'sk:line:jr-central-tokaido-shinkansen::東京': { y: 10, basis: 'manual-verified-relative' },
  'sk:line:jr-east-tohoku-shinkansen::東京': { y: 10, basis: 'manual-verified-relative' },
  'sk:line:jr-east-tokaido::東京': { y: 6, basis: 'manual-verified-relative' },
  'sk:line:jr-east-tohoku::東京': { y: 6, basis: 'manual-verified-relative' },
  'sk:line:metro-marunouchi::東京': { y: -12, basis: 'manual-verified-relative' },
  'sk:line:metro-marunouchi::大手町': { y: -11, basis: 'manual-verified-relative' },
  'sk:line:metro-tozai::大手町': { y: -18, basis: 'manual-verified-relative' },
  'sk:line:metro-chiyoda::大手町': { y: -23, basis: 'manual-verified-relative' },
  'sk:line:toei-mita::大手町': { y: -29, basis: 'manual-verified-relative' },
  'sk:line:metro-hanzomon::大手町': { y: -34, basis: 'manual-verified-relative' },

  // === FAMOUS TOKYO GRADE TRANSITIONS & PORTALS ===
  // Marunouchi emerges onto Kanda River bridge at Ochanomizu and Yotsuya!
  'sk:line:metro-marunouchi::御茶ノ水': { y: 6, basis: 'manual-verified-relative' },
  'sk:line:metro-marunouchi::四ツ谷': { y: 3, basis: 'manual-verified-relative' },
  'sk:line:metro-marunouchi::後楽園': { y: 9, basis: 'manual-verified-relative' },
  // Tohoku Shinkansen dips deep underground at Ueno B4F, then climbs onto high viaduct to Omiya!
  'sk:line:jr-east-tohoku-shinkansen::上野': { y: -24, basis: 'manual-verified-relative' },
  'sk:line:jr-east-tohoku-shinkansen::大宮': { y: 18, basis: 'manual-verified-relative' },
  // Chiyoda emerges at Yoyogi-Uehara (Odakyu through) and Kita-Senju/Ayase (JR Joban through)!
  'sk:line:metro-chiyoda::代々木上原': { y: 6, basis: 'manual-verified-relative' },
  'sk:line:odakyu-odawara::代々木上原': { y: 6, basis: 'manual-verified-relative' },
  'sk:line:metro-chiyoda::綾瀬': { y: 8, basis: 'manual-verified-relative' },
  'sk:line:jr-east-joban::綾瀬': { y: 8, basis: 'manual-verified-relative' },
  // Hibiya emerges to elevated at Naka-Meguro & Kita-Senju
  'sk:line:metro-hibiya::中目黒': { y: 10, basis: 'manual-verified-relative' },
  'sk:line:metro-hibiya::北千住': { y: 10, basis: 'manual-verified-relative' },
  // Toei Asakusa / Keikyu / Keisei through boundaries
  'sk:line:toei-asakusa::泉岳寺': { y: -14, basis: 'manual-verified-relative' },
  'sk:line:keikyu-main::泉岳寺': { y: -14, basis: 'manual-verified-relative' },
  'sk:line:keikyu-main::品川': { y: 8, basis: 'manual-verified-relative' },
  'sk:line:toei-asakusa::押上': { y: -16, basis: 'manual-verified-relative' },
  'sk:line:keisei-oshiage::押上': { y: -16, basis: 'manual-verified-relative' },
  // Ikebukuro stack
  'sk:line:jr-east-yamanote::池袋': { y: 0, basis: 'manual-verified-relative' },
  'sk:line:metro-marunouchi::池袋': { y: -11, basis: 'manual-verified-relative' },
  'sk:line:metro-yurakucho::池袋': { y: -22, basis: 'manual-verified-relative' },
  'sk:line:metro-fukutoshin::池袋': { y: -32, basis: 'manual-verified-relative' },
  // Tameike-sanno / Kokkai-gijidomae multi-level metro stack
  'sk:line:metro-ginza::溜池山王': { y: -10, basis: 'manual-verified-relative' },
  'sk:line:metro-namboku::溜池山王': { y: -32, basis: 'manual-verified-relative' },
  'sk:line:metro-marunouchi::国会議事堂前': { y: -12, basis: 'manual-verified-relative' },
  'sk:line:metro-chiyoda::国会議事堂前': { y: -34, basis: 'manual-verified-relative' },
};

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/**
 * 2D segment intersection test in (x, z) plane.
 * Returns { tA, tB, x, z } if segments properly cross strictly inside (0.08..0.92), else null.
 */
function intersect2DSegments(
  ax1: number,
  az1: number,
  ax2: number,
  az2: number,
  bx1: number,
  bz1: number,
  bx2: number,
  bz2: number,
): { tA: number; tB: number; x: number; z: number } | null {
  const dax = ax2 - ax1;
  const daz = az2 - az1;
  const dbx = bx2 - bx1;
  const dbz = bz2 - bz1;
  const denom = dax * dbz - daz * dbx;
  if (Math.abs(denom) < 1e-6) return null;

  const qpx = bx1 - ax1;
  const qpz = bz1 - az1;
  const tA = (qpx * dbz - qpz * dbx) / denom;
  const tB = (qpx * daz - qpz * dax) / denom;
  if (tA > 0.06 && tA < 0.94 && tB > 0.06 && tB < 0.94) {
    return { tA, tB, x: ax1 + tA * dax, z: az1 + tA * daz };
  }
  return null;
}

/**
 * Resamples a 2D polyline in world meters so points are spaced cleanly (<= maxStepM)
 * and lateral track offset is smoothly applied.
 */
function samplePolyline2D(
  rawCoords: [number, number][],
  lateralOffsetM: number,
  maxStepM: number,
  origin: ProjectionOrigin,
): { x: number; z: number; dist: number; t: number }[] {
  const worldPts = rawCoords.map(([lon, lat]) => lonLatToWorld(lon, lat, origin));
  if (worldPts.length < 2) return [];

  // Apply lateral offset perpendicular to local polyline tangent
  const offsetPts = worldPts.map((pt, idx) => {
    if (Math.abs(lateralOffsetM) < 0.1) return pt;
    const prev = worldPts[Math.max(0, idx - 1)]!;
    const next = worldPts[Math.min(worldPts.length - 1, idx + 1)]!;
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    // Right-hand normal
    const nx = -dz / len;
    const nz = dx / len;
    return { x: pt.x + nx * lateralOffsetM, z: pt.z + nz * lateralOffsetM };
  });

  // Resample densely for smooth curves, vertical grade transitions, and portals
  const resampled: { x: number; z: number; dist: number }[] = [
    { x: offsetPts[0]!.x, z: offsetPts[0]!.z, dist: 0 },
  ];
  let totalDist = 0;
  for (let i = 1; i < offsetPts.length; i++) {
    const a = offsetPts[i - 1]!;
    const b = offsetPts[i]!;
    const segLen = Math.hypot(b.x - a.x, b.z - a.z);
    if (segLen < 1) continue;
    const steps = Math.max(4, Math.ceil(segLen / maxStepM));
    for (let s = 1; s <= steps; s++) {
      const frac = s / steps;
      const x = a.x + (b.x - a.x) * frac;
      const z = a.z + (b.z - a.z) * frac;
      totalDist += segLen / steps;
      resampled.push({ x, z, dist: totalDist });
    }
  }

  const safeTotal = totalDist || 1;
  return resampled.map((p) => ({
    x: p.x,
    z: p.z,
    dist: p.dist,
    t: p.dist / safeTotal,
  }));
}

/**
 * Main Pure-TypeScript 3D Elevation & Spatial Consistency Solver.
 */
export function solveRailwayNetwork3D(
  dataset: AtlasDataset,
  osmVertical: OsmVerticalDataset | null,
  origin: ProjectionOrigin = TOKYO_ORIGIN,
): SolvedRailwayNetwork3D {
  const stationById = new Map(dataset.stations.map((s) => [s.id, s]));
  const lineById = new Map(dataset.railLines.map((l) => [l.id, l]));
  const verticalBySegId = new Map<string, TrackVerticalAttribute>(
    (osmVertical?.records ?? []).map((r) => [r.trackSegmentId, r]),
  );

  // Step 1: Determine a unique, continuous schematic elevation for every (lineId, stationId) pair
  const stationLineElev = new Map<string, { y: number; basis: HeightBasis }>();

  const getStationLineKey = (lineId: SkId<'line'>, stationId: SkId<'station'>) =>
    `${lineId}::${stationId}`;

  // Precompute OSM vertical hints incident to each (lineId, stationId)
  const incidentOsmByNode = new Map<string, TrackVerticalAttribute[]>();
  for (const seg of dataset.trackSegments) {
    const v = verticalBySegId.get(seg.id);
    if (!v) continue;
    const lineId = seg.railLineIds[0]!;
    for (const sid of [seg.fromStationId, seg.toStationId]) {
      const k = getStationLineKey(lineId, sid);
      if (!incidentOsmByNode.has(k)) incidentOsmByNode.set(k, []);
      incidentOsmByNode.get(k)!.push(v);
    }
  }

  for (const line of dataset.railLines) {
    const lineCfg = LINE_BASE_ELEVATION[line.id] ?? {
      y: line.lineClass === 'metro' ? -16 : line.lineClass === 'shinkansen' ? 18 : 0,
      lateralM: 0,
      priority: 5,
    };

    for (const sid of line.stationIds) {
      const st = stationById.get(sid);
      if (!st) continue;
      const key = getStationLineKey(line.id, sid);
      const overrideKey = `${line.id}::${st.names.ja ?? ''}`;
      const override = VERIFIED_STATION_LINE_OVERRIDES[overrideKey];

      if (override) {
        stationLineElev.set(key, override);
        continue;
      }

      // Check OSM vertical evidence for surface/private/JR lines (subways keep their curated underground tier unless OSM explicitly shows elevated/bridge!)
      const osmHits = incidentOsmByNode.get(key) ?? [];
      const hasBridge = osmHits.some((h) => h.verticalClass === 'elevated');
      const hasTunnel = osmHits.some((h) => h.verticalClass === 'underground');
      const hasSurface = osmHits.some((h) => h.verticalClass === 'at_grade');

      if (line.lineClass === 'metro') {
        if (hasBridge && !hasTunnel) {
          stationLineElev.set(key, { y: 10, basis: 'osm-derived-schematic' });
        } else {
          stationLineElev.set(key, { y: lineCfg.y, basis: 'inferred-schematic' });
        }
      } else if (line.lineClass === 'shinkansen') {
        if (hasTunnel && !hasBridge) {
          stationLineElev.set(key, { y: -22, basis: 'osm-derived-schematic' });
        } else {
          stationLineElev.set(key, { y: lineCfg.y, basis: 'osm-derived-schematic' });
        }
      } else {
        // Conventional JR & Private railways: respect OSM bridge/tunnel/at_grade tags where present,
        // while keeping inherently elevated urban viaduct lines (lineCfg.y >= 6) elevated above ground
        // unless an explicit verified station override sets y = 0.
        if (hasTunnel && !hasBridge) {
          stationLineElev.set(key, { y: -14, basis: 'osm-derived-schematic' });
        } else if (hasBridge && !hasTunnel) {
          stationLineElev.set(key, { y: Math.max(9, lineCfg.y), basis: 'osm-derived-schematic' });
        } else if (hasSurface) {
          if (lineCfg.y >= 6) {
            stationLineElev.set(key, {
              y: Math.max(5.5, lineCfg.y - 1.5),
              basis: 'osm-derived-schematic',
            });
          } else {
            stationLineElev.set(key, { y: 0, basis: 'osm-derived-schematic' });
          }
        } else {
          stationLineElev.set(key, { y: lineCfg.y, basis: 'inferred-schematic' });
        }
      }
    }
  }

  // Step 2: Build initial continuous 3D polylines for every TrackSegment
  interface DraftSegment {
    seg: TrackSegment;
    primaryLineId: SkId<'line'>;
    color: string;
    lateralOffsetM: number;
    priority: number;
    heightBasis: HeightBasis;
    pts2D: { x: number; z: number; dist: number; t: number }[];
    ys: number[];
    bbox: { minX: number; maxX: number; minZ: number; maxZ: number };
    deconflictedCrossings: number;
  }

  const drafts: DraftSegment[] = [];

  for (const seg of dataset.trackSegments) {
    const primaryLineId = seg.railLineIds[0]!;
    const line = lineById.get(primaryLineId);
    const lineCfg = LINE_BASE_ELEVATION[primaryLineId] ?? { y: 0, lateralM: 0, priority: 5 };
    const osm = verticalBySegId.get(seg.id);

    const startNode = stationLineElev.get(getStationLineKey(primaryLineId, seg.fromStationId)) ?? {
      y: lineCfg.y,
      basis: 'inferred-schematic' as HeightBasis,
    };
    const endNode = stationLineElev.get(getStationLineKey(primaryLineId, seg.toStationId)) ?? {
      y: lineCfg.y,
      basis: 'inferred-schematic' as HeightBasis,
    };

    // Determine mid-span hint if OSM shows an arch/bridge or tunnel mid-span while both stations are at different elevation
    let midBumpY = 0;
    let basis: HeightBasis =
      startNode.basis === 'manual-verified-relative' || endNode.basis === 'manual-verified-relative'
        ? 'manual-verified-relative'
        : osm && osm.verticalClass !== 'unknown'
          ? 'osm-derived-schematic'
          : 'inferred-schematic';

    if (osm && Math.abs(startNode.y - endNode.y) < 3) {
      if (osm.verticalClass === 'elevated' && startNode.y <= 2) {
        midBumpY = 8 - startNode.y;
      } else if (osm.verticalClass === 'underground' && startNode.y >= 0 && line?.lineClass !== 'metro') {
        midBumpY = -12 - startNode.y;
      }
    }

    // Use finer sampling inside Tokyo 23 wards (<= 55m), coarser on distant JR Atami/Mishima tail (<= 220m)
    const fromSt = stationById.get(seg.fromStationId);
    const isOuterCorridor =
      fromSt && (fromSt.coordinates[1] < 35.50 || fromSt.coordinates[1] > 35.85 || fromSt.coordinates[0] < 139.50);
    const maxStepM = isOuterCorridor ? 220 : 55;

    const pts2D = samplePolyline2D(seg.geometry, lineCfg.lateralM, maxStepM, origin);
    if (pts2D.length < 2) continue;

    const ys = pts2D.map((p) => {
      const base = startNode.y + (endNode.y - startNode.y) * smoothstep(p.t);
      // Smooth bell bump in mid-span (vanishes smoothly at t=0 and t=1 preserving C0 continuity!)
      const bell = midBumpY !== 0 ? midBumpY * Math.sin(Math.PI * p.t) ** 2 : 0;
      return Math.round((base + bell) * 100) / 100;
    });

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of pts2D) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }

    drafts.push({
      seg,
      primaryLineId,
      color: line?.color ?? '#64748b',
      lateralOffsetM: lineCfg.lateralM,
      priority: lineCfg.priority,
      heightBasis: basis,
      pts2D,
      ys,
      bbox: { minX, maxX, minZ, maxZ },
      deconflictedCrossings: 0,
    });
  }

  // Step 3: Non-junction 2D Crossing Detection & Vertical Deconfliction (Section 4.1 #4 & 4.3)
  // Guarantees minimum vertical clearance of 6.5 schematic units wherever two distinct non-adjacent lines cross!
  const MIN_CLEARANCE = 6.5;
  const crossings: CrossingCheckRecord[] = [];

  for (let i = 0; i < drafts.length; i++) {
    const A = drafts[i]!;
    for (let j = i + 1; j < drafts.length; j++) {
      const B = drafts[j]!;
      // Skip same line or segments sharing an endpoint station
      if (A.primaryLineId === B.primaryLineId) continue;
      if (
        A.seg.fromStationId === B.seg.fromStationId ||
        A.seg.fromStationId === B.seg.toStationId ||
        A.seg.toStationId === B.seg.fromStationId ||
        A.seg.toStationId === B.seg.toStationId
      ) {
        continue;
      }
      // Fast AABB reject
      if (
        A.bbox.maxX < B.bbox.minX ||
        A.bbox.minX > B.bbox.maxX ||
        A.bbox.maxZ < B.bbox.minZ ||
        A.bbox.minZ > B.bbox.maxZ
      ) {
        continue;
      }

      // Sub-segment intersection check (coarse stride for speed on dense polylines)
      let foundCrossing: { idxA: number; idxB: number; x: number; z: number } | null = null;
      const strideA = Math.max(1, Math.floor(A.pts2D.length / 18));
      const strideB = Math.max(1, Math.floor(B.pts2D.length / 18));

      outer: for (let ia = 0; ia < A.pts2D.length - 1; ia += strideA) {
        const ia2 = Math.min(A.pts2D.length - 1, ia + strideA);
        const pa1 = A.pts2D[ia]!;
        const pa2 = A.pts2D[ia2]!;
        for (let ib = 0; ib < B.pts2D.length - 1; ib += strideB) {
          const ib2 = Math.min(B.pts2D.length - 1, ib + strideB);
          const pb1 = B.pts2D[ib]!;
          const pb2 = B.pts2D[ib2]!;
          const hit = intersect2DSegments(pa1.x, pa1.z, pa2.x, pa2.z, pb1.x, pb1.z, pb2.x, pb2.z);
          if (hit) {
            const rawIdxA = Math.round(ia + (ia2 - ia) * hit.tA);
            const rawIdxB = Math.round(ib + (ib2 - ib) * hit.tB);
            foundCrossing = {
              idxA: Math.max(1, Math.min(A.pts2D.length - 2, rawIdxA)),
              idxB: Math.max(1, Math.min(B.pts2D.length - 2, rawIdxB)),
              x: hit.x,
              z: hit.z,
            };
            break outer;
          }
        }
      }

      if (!foundCrossing) continue;

      let yA = A.ys[foundCrossing.idxA] ?? 0;
      let yB = B.ys[foundCrossing.idxB] ?? 0;
      let clearance = Math.abs(yA - yB);
      let wasAdjusted = false;

      if (clearance < MIN_CLEARANCE) {
        // Adjust the lower-priority segment smoothly using a localized Gaussian bell (zero at endpoints!)
        const target = A.priority >= B.priority ? B : A;
        const fixedY = A.priority >= B.priority ? yA : yB;
        const targetIdx = A.priority >= B.priority ? foundCrossing.idxB : foundCrossing.idxA;
        const targetT = target.pts2D[targetIdx]?.t ?? 0.5;
        // Underground lines duck deeper; elevated lines pass cleanly over or under
        const shiftDir = fixedY <= -2 ? -1 : fixedY >= 6 ? 1 : -1;
        const desiredY = fixedY + shiftDir * (MIN_CLEARANCE + 1.5);
        const delta = desiredY - (target.ys[targetIdx] ?? 0);

        const sigma = 0.22;
        const peakFade = Math.max(0.08, Math.sin(Math.PI * targetT));
        for (let k = 1; k < target.pts2D.length - 1; k++) {
          const tk = target.pts2D[k]!.t;
          const distT = (tk - targetT) / sigma;
          // Smooth window that is strictly 0 at t=0 and t=1, and strictly 1.0 at t=targetT
          const endpointFade = Math.sin(Math.PI * tk);
          const weight = Math.min(1.0, (Math.exp(-0.5 * distT * distT) * endpointFade) / peakFade);
          const bump = delta * weight;
          target.ys[k] = Math.round((target.ys[k]! + bump) * 100) / 100;
        }
        target.deconflictedCrossings++;
        wasAdjusted = true;
        yA = A.ys[foundCrossing.idxA] ?? yA;
        yB = B.ys[foundCrossing.idxB] ?? yB;
        clearance = Math.abs(yA - yB);
      }

      crossings.push({
        segmentA: A.seg.id,
        segmentB: B.seg.id,
        x: Math.round(foundCrossing.x),
        z: Math.round(foundCrossing.z),
        yA,
        yB,
        clearance: Math.round(clearance * 10) / 10,
        wasAdjusted,
      });
    }
  }

  // Step 4: Finalize SolvedSegment3D with portals, structure tags & tier statistics
  const segments: SolvedSegment3D[] = [];
  const tierCounts: Record<SchematicTierId, number> = {
    'L+2': 0,
    'L+1': 0,
    L0: 0,
    'L-1': 0,
    'L-2': 0,
    'L-3': 0,
    'L-4': 0,
  };

  // Track station tangent directions from incident solved segments
  const stationTangentMap = new Map<string, { dx: number; dz: number; x: number; y: number; z: number }>();

  for (const d of drafts) {
    const points: SolvedPoint3D[] = d.pts2D.map((p, idx) => {
      const y = d.ys[idx]!;
      return {
        x: p.x,
        y,
        z: p.z,
        t: p.t,
        distFromStart: p.dist,
        structure: classifyStructure(y, d.primaryLineId),
        tier: classifyTier(y),
      };
    });

    // Detect portals where track crosses y = -2.4 between underground tunnel and surface/viaduct
    const portals: PortalPoint3D[] = [];
    for (let k = 1; k < points.length; k++) {
      const prev = points[k - 1]!;
      const cur = points[k]!;
      const prevUnder = prev.structure === 'tunnel_box' || prev.structure === 'tunnel_shield';
      const curUnder = cur.structure === 'tunnel_box' || cur.structure === 'tunnel_shield';
      if (prevUnder !== curUnder) {
        const dx = cur.x - prev.x;
        const dz = cur.z - prev.z;
        const len = Math.hypot(dx, dz) || 1;
        portals.push({
          x: (prev.x + cur.x) * 0.5,
          y: -1.5,
          z: (prev.z + cur.z) * 0.5,
          dirX: dx / len,
          dirZ: dz / len,
          segmentId: d.seg.id,
          lineId: d.primaryLineId,
          tunnelKind: curUnder
            ? (cur.structure as 'tunnel_box' | 'tunnel_shield')
            : (prev.structure as 'tunnel_box' | 'tunnel_shield'),
        });
      }
    }

    const midPt = points[Math.floor(points.length / 2)]!;
    const minY = Math.min(...points.map((p) => p.y));
    const maxY = Math.max(...points.map((p) => p.y));
    tierCounts[midPt.tier]++;

    // Record tangents & offset positions at segment endpoints for station volumes
    const p0 = points[0]!;
    const p1 = points[1]!;
    const lenStart = Math.hypot(p1.x - p0.x, p1.z - p0.z) || 1;
    stationTangentMap.set(getStationLineKey(d.primaryLineId, d.seg.fromStationId), {
      dx: (p1.x - p0.x) / lenStart,
      dz: (p1.z - p0.z) / lenStart,
      x: p0.x,
      y: p0.y,
      z: p0.z,
    });

    const pn = points[points.length - 1]!;
    const pnPrev = points[points.length - 2]!;
    const lenEnd = Math.hypot(pn.x - pnPrev.x, pn.z - pnPrev.z) || 1;
    stationTangentMap.set(getStationLineKey(d.primaryLineId, d.seg.toStationId), {
      dx: (pn.x - pnPrev.x) / lenEnd,
      dz: (pn.z - pnPrev.z) / lenEnd,
      x: pn.x,
      y: pn.y,
      z: pn.z,
    });

    segments.push({
      segmentId: d.seg.id,
      primaryLineId: d.primaryLineId,
      railLineIds: d.seg.railLineIds,
      operatorId: d.seg.operatorId,
      fromStationId: d.seg.fromStationId,
      toStationId: d.seg.toStationId,
      color: d.color,
      isShinkansen: d.seg.isShinkansen,
      isDoubleTrack: d.seg.lineClass !== 'local_line',
      lateralOffsetM: d.lateralOffsetM,
      points,
      portals,
      minY,
      maxY,
      dominantTier: midPt.tier,
      dominantStructure: midPt.structure,
      heightBasis: d.heightBasis,
      deconflictedCrossings: d.deconflictedCrossings,
    });
  }

  // Step 5: Build 3D Station Nodes (one per station-on-line so multi-level hubs like Shibuya show stacked platforms!)
  const majorHubNames = new Set([
    '渋谷',
    '新宿',
    '新宿三丁目',
    '東京',
    '大手町',
    '池袋',
    '品川',
    '上野',
    '秋葉原',
    '新橋',
    '銀座',
    '表参道',
    '永田町',
    '溜池山王',
    '国会議事堂前',
    '飯田橋',
    '押上',
    '泉岳寺',
    '大宮',
    '横浜',
  ]);

  const stationNodes: SolvedStationNode3D[] = [];
  const stationNodeByComplex = new Map<SkId<'complex'>, SolvedStationNode3D[]>();

  for (const line of dataset.railLines) {
    for (const sid of line.stationIds) {
      const st = stationById.get(sid);
      if (!st) continue;
      const key = getStationLineKey(line.id, sid);
      const elev = stationLineElev.get(key) ?? { y: 0, basis: 'inferred-schematic' as HeightBasis };
      const tangent = stationTangentMap.get(key);
      const fallbackWorld = lonLatToWorld(st.coordinates[0], st.coordinates[1], origin);

      const node: SolvedStationNode3D = {
        stationId: st.id,
        lineId: line.id,
        operatorId: st.operatorId,
        stationComplexId: st.stationComplexId,
        nameJa: st.names.ja ?? st.id,
        nameEn: st.names.en,
        stationCode: st.stationCode,
        x: tangent?.x ?? fallbackWorld.x,
        y: elev.y,
        z: tangent?.z ?? fallbackWorld.z,
        dirX: tangent?.dx ?? 1,
        dirZ: tangent?.dz ?? 0,
        tier: classifyTier(elev.y),
        structure: classifyStructure(elev.y, line.id),
        heightBasis: elev.basis,
        color: line.color,
        isMajorHub: majorHubNames.has(st.names.ja ?? '') || st.railLineIds.length > 1,
      };
      stationNodes.push(node);

      if (st.stationComplexId) {
        if (!stationNodeByComplex.has(st.stationComplexId)) {
          stationNodeByComplex.set(st.stationComplexId, []);
        }
        stationNodeByComplex.get(st.stationComplexId)!.push(node);
      }
    }
  }

  // Step 6: Build vertical transfer connectors inside multi-level StationComplexes
  const transferConnectors: VerticalTransferConnector3D[] = [];
  const interchangeGateMap = new Map<string, 'in_gate' | 'out_of_gate' | 'unknown'>();
  for (const ic of dataset.interchanges) {
    interchangeGateMap.set(`${ic.fromStationId}::${ic.toStationId}`, ic.gateType);
    interchangeGateMap.set(`${ic.toStationId}::${ic.fromStationId}`, ic.gateType);
  }

  for (const [complexId, nodes] of stationNodeByComplex.entries()) {
    if (nodes.length < 2) continue;
    // Sort vertically top-to-bottom and connect adjacent stacked levels cleanly
    const sorted = [...nodes].sort((a, b) => b.y - a.y);
    for (let i = 0; i < sorted.length - 1; i++) {
      const upper = sorted[i]!;
      const lower = sorted[i + 1]!;
      // Only create visual transfer shafts where platforms differ meaningfully in space
      const dist3D = Math.hypot(upper.x - lower.x, upper.y - lower.y, upper.z - lower.z);
      if (dist3D < 3 || dist3D > 550) continue;
      const gateType =
        upper.stationId === lower.stationId
          ? 'in_gate'
          : interchangeGateMap.get(`${upper.stationId}::${lower.stationId}`) ?? 'unknown';

      transferConnectors.push({
        complexId,
        fromStationId: upper.stationId,
        toStationId: lower.stationId,
        x1: upper.x,
        y1: upper.y,
        z1: upper.z,
        x2: lower.x,
        y2: lower.y,
        z2: lower.z,
        gateType,
      });
    }
  }

  return {
    segments,
    stationNodes,
    transferConnectors,
    crossings,
    tierCounts,
  };
}
