/**
 * Deterministic Pure-TypeScript Physical Track Graph Builder, Rolling Stock Catalog,
 * and 3D Rail-Head Pose Sampler for SENKIRO Tokyo Atlas 3D v2.0.
 *
 * Guarantees that atlas-underground, atlas-rollingstock, atlas-simulation,
 * and atlas-camera-ui ALL share the exact same physical_track splines,
 * Japanese left-hand running track offsets, rail-head heights, and vehicle specs.
 */

import type {
  SolvedPoint3D,
  SolvedRailwayNetwork3D,
} from '../domain/elevationSolver.js';
import type { AtlasDataset, SkId } from '../domain/types.js';
import {
  TRACK_CLEARANCE_STANDARDS,
  type ElectrificationKind,
  type PhysicalTrack,
  type PhysicalTrackGraph,
  type RollingStockSpec,
  type StationAnchor3D,
  type TrackConnection,
  type TrackDirection,
  type TrackGaugeMm,
  type TrackPoseSample,
  type TrainCarRole,
  type TrainConsistSpec,
  type TrainModelId,
} from './atlasV2.js';

// ============================================================================
// 1. CANONICAL TOKYO ROLLING STOCK SPECIFICATIONS (PROTOTYPE METRIC SCALE)
// ============================================================================

export const ROLLING_STOCK_CATALOG: Record<TrainModelId, RollingStockSpec> = {
  'jr-e235-0': {
    modelId: 'jr-e235-0',
    nameJa: 'JR東日本 E235系0番台（山手線）',
    nameEn: 'JR East E235-0 (Yamanote Line)',
    operatorId: 'sk:operator:jr-east',
    compatibleLineIds: ['sk:line:jr-east-yamanote'],
    gaugeMm: 1067,
    electrification: 'overhead_dc_1500v',
    carLengthM: 20.0,
    endCarLengthM: 20.0,
    carWidthM: 2.95,
    carHeightM: 3.62,
    couplerGapM: 0.45,
    bogiePitchM: 13.8,
    defaultCarCount: 11,
    maxSpeedKmh: 90,
    liveryPrimaryHex: '#80c241',
    liveryAccentHex: '#1f2937',
    bodyBaseHex: '#d5dbe2',
    geometryFidelity: 'procedural_prototype_scale',
    dataNature: 'manual-verified',
    referenceNotes: 'JR East E235-0 nominal 20m commuter carbody dimensions (2.95m W × 3.62m H).',
  },
  'jr-e233-0': {
    modelId: 'jr-e233-0',
    nameJa: 'JR東日本 E233系0番台（中央快速線）',
    nameEn: 'JR East E233-0 (Chuo Rapid)',
    operatorId: 'sk:operator:jr-east',
    compatibleLineIds: ['sk:line:jr-east-chuo', 'sk:line:jr-east-sobu'],
    gaugeMm: 1067,
    electrification: 'overhead_dc_1500v',
    carLengthM: 20.0,
    endCarLengthM: 20.0,
    carWidthM: 2.95,
    carHeightM: 3.62,
    couplerGapM: 0.45,
    bogiePitchM: 13.8,
    defaultCarCount: 10,
    maxSpeedKmh: 100,
    liveryPrimaryHex: '#f15a22',
    liveryAccentHex: '#27272a',
    bodyBaseHex: '#d4dae1',
    geometryFidelity: 'procedural_prototype_scale',
    dataNature: 'manual-verified',
    referenceNotes: 'JR East E233-0 wide commuter body (2.95m W × 20m L).',
  },
  'jr-e233-3000': {
    modelId: 'jr-e233-3000',
    nameJa: 'JR東日本 E233系3000番台（東海道・東北本線）',
    nameEn: 'JR East E233-3000 (Tokaido / Tohoku)',
    operatorId: 'sk:operator:jr-east',
    compatibleLineIds: [
      'sk:line:jr-east-tokaido',
      'sk:line:jr-east-tohoku',
      'sk:line:jr-east-tohoku-oku',
      'sk:line:jr-east-tohoku-saikyo',
      'sk:line:jr-east-akabane',
      'sk:line:jr-east-tokaido-hinkaku',
      'sk:line:jr-east-joban',
      'sk:line:jr-east-hachiko',
      'sk:line:jr-central-tokaido',
    ],
    gaugeMm: 1067,
    electrification: 'overhead_dc_1500v',
    carLengthM: 20.0,
    endCarLengthM: 20.0,
    carWidthM: 2.95,
    carHeightM: 3.62,
    couplerGapM: 0.45,
    bogiePitchM: 13.8,
    defaultCarCount: 10,
    maxSpeedKmh: 120,
    liveryPrimaryHex: '#f68b1e',
    liveryAccentHex: '#007a3d',
    bodyBaseHex: '#d4dae1',
    geometryFidelity: 'procedural_prototype_scale',
    dataNature: 'manual-verified',
    referenceNotes: 'Shonan orange/green suburban commuter specification.',
  },
  'shinkansen-n700s': {
    modelId: 'shinkansen-n700s',
    nameJa: 'JR東海 N700S系（東海道新幹線）',
    nameEn: 'JR Central N700S Shinkansen',
    operatorId: 'sk:operator:jr-central',
    compatibleLineIds: ['sk:line:jr-central-tokaido-shinkansen'],
    gaugeMm: 1435,
    electrification: 'overhead_ac_25kv',
    carLengthM: 25.0,
    endCarLengthM: 27.35,
    carWidthM: 3.36,
    carHeightM: 3.6,
    couplerGapM: 0.5,
    bogiePitchM: 17.5,
    defaultCarCount: 8,
    maxSpeedKmh: 285,
    liveryPrimaryHex: '#005bac',
    liveryAccentHex: '#0c4a6e',
    bodyBaseHex: '#f5f7fa',
    geometryFidelity: 'procedural_prototype_scale',
    dataNature: 'manual-verified',
    referenceNotes: 'N700S Supreme Dual-Wing aerodynamic profile (3.36m W × 25m/27.35m L); 8-car scaled display consist option.',
  },
  'shinkansen-e5': {
    modelId: 'shinkansen-e5',
    nameJa: 'JR東日本 E5系（東北新幹線）',
    nameEn: 'JR East E5 Series Shinkansen',
    operatorId: 'sk:operator:jr-east',
    compatibleLineIds: ['sk:line:jr-east-tohoku-shinkansen'],
    gaugeMm: 1435,
    electrification: 'overhead_ac_25kv',
    carLengthM: 25.0,
    endCarLengthM: 26.5,
    carWidthM: 3.35,
    carHeightM: 3.65,
    couplerGapM: 0.5,
    bogiePitchM: 17.5,
    defaultCarCount: 10,
    maxSpeedKmh: 260,
    liveryPrimaryHex: '#008c7a',
    liveryAccentHex: '#ec4899',
    bodyBaseHex: '#eef2f6',
    geometryFidelity: 'procedural_prototype_scale',
    dataNature: 'manual-verified',
    referenceNotes: 'E5 Hayabusa Tokiwa green + Hayate pink stripe + 15m aerodynamic nose.',
  },
  'metro-1000': {
    modelId: 'metro-1000',
    nameJa: '東京メトロ 1000系（銀座線）',
    nameEn: 'Tokyo Metro 1000 Series (Ginza Line)',
    operatorId: 'sk:operator:tokyo-metro',
    compatibleLineIds: ['sk:line:metro-ginza'],
    gaugeMm: 1435,
    electrification: 'third_rail_600v',
    carLengthM: 16.0,
    endCarLengthM: 16.0,
    carWidthM: 2.55,
    carHeightM: 3.47,
    couplerGapM: 0.4,
    bogiePitchM: 10.5,
    defaultCarCount: 6,
    maxSpeedKmh: 65,
    liveryPrimaryHex: '#f39700',
    liveryAccentHex: '#78350f',
    bodyBaseHex: '#f5b027',
    geometryFidelity: 'procedural_prototype_scale',
    dataNature: 'manual-verified',
    referenceNotes: 'Ginza Line retro-lemon yellow 16m third-rail subway cars (6-car consist).',
  },
  'metro-2000': {
    modelId: 'metro-2000',
    nameJa: '東京メトロ 2000系（丸ノ内線）',
    nameEn: 'Tokyo Metro 2000 Series (Marunouchi Line)',
    operatorId: 'sk:operator:tokyo-metro',
    compatibleLineIds: ['sk:line:metro-marunouchi'],
    gaugeMm: 1435,
    electrification: 'third_rail_600v',
    carLengthM: 18.0,
    endCarLengthM: 18.0,
    carWidthM: 2.78,
    carHeightM: 3.5,
    couplerGapM: 0.4,
    bogiePitchM: 12.0,
    defaultCarCount: 6,
    maxSpeedKmh: 75,
    liveryPrimaryHex: '#e60012',
    liveryAccentHex: '#f8fafc',
    bodyBaseHex: '#d61c24',
    geometryFidelity: 'procedural_prototype_scale',
    dataNature: 'manual-verified',
    referenceNotes: 'Marunouchi Glowing Red 18m third-rail carbody with white sine-wave accent.',
  },
  'metro-16000': {
    modelId: 'metro-16000',
    nameJa: '東京メトロ 16000系（千代田線）',
    nameEn: 'Tokyo Metro 16000 Series (Chiyoda Line)',
    operatorId: 'sk:operator:tokyo-metro',
    compatibleLineIds: [
      'sk:line:metro-chiyoda',
      'sk:line:metro-hibiya',
      'sk:line:metro-tozai',
      'sk:line:metro-namboku',
    ],
    gaugeMm: 1067,
    electrification: 'overhead_dc_1500v',
    carLengthM: 20.0,
    endCarLengthM: 20.0,
    carWidthM: 2.8,
    carHeightM: 3.64,
    couplerGapM: 0.45,
    bogiePitchM: 13.8,
    defaultCarCount: 10,
    maxSpeedKmh: 80,
    liveryPrimaryHex: '#00a650',
    liveryAccentHex: '#eab308',
    bodyBaseHex: '#cfd7df',
    geometryFidelity: 'procedural_prototype_scale',
    dataNature: 'manual-verified',
    referenceNotes: 'Tokyo Metro 20m aluminum commuter subway body (2.80m W).',
  },
  'metro-17000': {
    modelId: 'metro-17000',
    nameJa: '東京メトロ 17000系（有楽町・副都心線）',
    nameEn: 'Tokyo Metro 17000 Series (Yurakucho / Fukutoshin)',
    operatorId: 'sk:operator:tokyo-metro',
    compatibleLineIds: ['sk:line:metro-yurakucho', 'sk:line:metro-fukutoshin'],
    gaugeMm: 1067,
    electrification: 'overhead_dc_1500v',
    carLengthM: 20.0,
    endCarLengthM: 20.0,
    carWidthM: 2.8,
    carHeightM: 3.64,
    couplerGapM: 0.45,
    bogiePitchM: 13.8,
    defaultCarCount: 8,
    maxSpeedKmh: 80,
    liveryPrimaryHex: '#9c5e31',
    liveryAccentHex: '#d7c447',
    bodyBaseHex: '#d2d9e0',
    geometryFidelity: 'procedural_prototype_scale',
    dataNature: 'manual-verified',
    referenceNotes: '17000 series brown/gold dual-line livery with round headlights.',
  },
  'metro-18000': {
    modelId: 'metro-18000',
    nameJa: '東京メトロ 18000系（半蔵門線）',
    nameEn: 'Tokyo Metro 18000 Series (Hanzomon Line)',
    operatorId: 'sk:operator:tokyo-metro',
    compatibleLineIds: ['sk:line:metro-hanzomon'],
    gaugeMm: 1067,
    electrification: 'overhead_dc_1500v',
    carLengthM: 20.0,
    endCarLengthM: 20.0,
    carWidthM: 2.8,
    carHeightM: 3.64,
    couplerGapM: 0.45,
    bogiePitchM: 13.8,
    defaultCarCount: 10,
    maxSpeedKmh: 80,
    liveryPrimaryHex: '#8f76d6',
    liveryAccentHex: '#4c1d95',
    bodyBaseHex: '#d2d9e0',
    geometryFidelity: 'procedural_prototype_scale',
    dataNature: 'manual-verified',
    referenceNotes: '18000 series angular purple-stripe commuter body.',
  },
  'toei-12-600': {
    modelId: 'toei-12-600',
    nameJa: '都営地下鉄 12-600形（大江戸線リニアメトロ）',
    nameEn: 'Toei 12-600 Series (Oedo Linear Metro)',
    operatorId: 'sk:operator:toei',
    compatibleLineIds: ['sk:line:toei-oedo'],
    gaugeMm: 1435,
    electrification: 'linear_motor_dc_1500v',
    carLengthM: 16.5,
    endCarLengthM: 16.5,
    carWidthM: 2.5,
    carHeightM: 3.14,
    couplerGapM: 0.38,
    bogiePitchM: 11.0,
    defaultCarCount: 8,
    maxSpeedKmh: 70,
    liveryPrimaryHex: '#b6007a',
    liveryAccentHex: '#1e293b',
    bodyBaseHex: '#d5dbe2',
    geometryFidelity: 'procedural_prototype_scale',
    dataNature: 'manual-verified',
    referenceNotes: 'Compact small-profile linear-motor subway car (2.50m W × 3.14m H × 16.5m L).',
  },
  'private-commuter-generic': {
    modelId: 'private-commuter-generic',
    nameJa: '首都圏私鉄・都営標準通勤車両（ラインカラー適用）',
    nameEn: 'Tokyo Suburban Commuter EMU (Line-Colored)',
    operatorId: 'sk:operator:toei',
    compatibleLineIds: [],
    gaugeMm: 1067,
    electrification: 'overhead_dc_1500v',
    carLengthM: 20.0,
    endCarLengthM: 20.0,
    carWidthM: 2.85,
    carHeightM: 3.62,
    couplerGapM: 0.45,
    bogiePitchM: 13.8,
    defaultCarCount: 8,
    maxSpeedKmh: 95,
    liveryPrimaryHex: '#3b82f6',
    liveryAccentHex: '#1e293b',
    bodyBaseHex: '#d7dde4',
    geometryFidelity: 'procedural_prototype_scale',
    dataNature: 'derived',
    referenceNotes: 'Standard Japanese stainless commuter EMU adapted with host line color.',
  },
};

export function getDefaultTrainModelForLine(lineId: SkId<'line'>): TrainModelId {
  for (const spec of Object.values(ROLLING_STOCK_CATALOG)) {
    if (spec.compatibleLineIds.includes(lineId)) {
      return spec.modelId;
    }
  }
  return 'private-commuter-generic';
}

export function buildTrainConsistSpec(
  modelId: TrainModelId,
  carCountOverride?: number,
): TrainConsistSpec {
  const spec = ROLLING_STOCK_CATALOG[modelId] ?? ROLLING_STOCK_CATALOG['private-commuter-generic'];
  const count = Math.max(2, Math.min(16, carCountOverride ?? spec.defaultCarCount));
  const hasPantograph =
    spec.electrification === 'overhead_dc_1500v' ||
    spec.electrification === 'overhead_ac_25kv' ||
    spec.electrification === 'linear_motor_dc_1500v';

  const cars: { index: number; role: TrainCarRole; lengthM: number }[] = [];
  let totalLengthM = 0;

  for (let i = 0; i < count; i++) {
    let role: TrainCarRole;
    let lengthM = spec.carLengthM;
    if (i === 0) {
      role = 'lead_cab';
      lengthM = spec.endCarLengthM;
    } else if (i === count - 1) {
      role = 'tail_cab';
      lengthM = spec.endCarLengthM;
    } else if (hasPantograph && (i === 1 || i === count - 2 || (count >= 8 && i === Math.floor(count / 2)))) {
      role = 'pantograph';
    } else if (i % 2 === 1) {
      role = 'motor';
    } else {
      role = 'trailer';
    }
    cars.push({ index: i, role, lengthM });
    totalLengthM += lengthM;
    if (i > 0) totalLengthM += spec.couplerGapM;
  }

  return {
    consistId: `${modelId}:${count}car`,
    modelId,
    carCount: count,
    cars,
    totalLengthM: Math.round(totalLengthM * 100) / 100,
  };
}

// ============================================================================
// 2. LINE GAUGE, ELECTRIFICATION & TYPICAL MAX SPEED TABLE
// ============================================================================

const STANDARD_GAUGE_LINES = new Set<string>([
  'sk:line:jr-central-tokaido-shinkansen',
  'sk:line:jr-east-tohoku-shinkansen',
  'sk:line:metro-ginza',
  'sk:line:metro-marunouchi',
  'sk:line:toei-asakusa',
  'sk:line:toei-oedo',
  'sk:line:keikyu-main',
  'sk:line:keikyu-airport',
  'sk:line:keisei-main',
  'sk:line:keisei-oshiage',
]);

const SCOTCH_GAUGE_1372_LINES = new Set<string>([
  'sk:line:keio-keio',
  'sk:line:toei-shinjuku',
]);

const THIRD_RAIL_LINES = new Set<string>([
  'sk:line:metro-ginza',
  'sk:line:metro-marunouchi',
]);

function inferGaugeMm(lineId: SkId<'line'>, isShinkansen: boolean): TrackGaugeMm {
  if (isShinkansen || STANDARD_GAUGE_LINES.has(lineId)) return 1435;
  if (SCOTCH_GAUGE_1372_LINES.has(lineId)) return 1372;
  return 1067;
}

function inferElectrification(lineId: SkId<'line'>, isShinkansen: boolean): ElectrificationKind {
  if (isShinkansen) return 'overhead_ac_25kv';
  if (THIRD_RAIL_LINES.has(lineId)) return 'third_rail_600v';
  if (lineId === 'sk:line:toei-oedo') return 'linear_motor_dc_1500v';
  return 'overhead_dc_1500v';
}

function inferTypicalMaxSpeedKmh(lineId: SkId<'line'>, isShinkansen: boolean): number {
  if (lineId === 'sk:line:jr-central-tokaido-shinkansen') return 220; // urban Tokyo-Shinagawa-Odawara approach
  if (isShinkansen) return 200;
  if (lineId === 'sk:line:metro-ginza') return 65;
  if (lineId === 'sk:line:toei-oedo') return 70;
  if (lineId.startsWith('sk:line:metro-') || lineId.startsWith('sk:line:toei-')) return 80;
  if (lineId === 'sk:line:jr-east-yamanote') return 90;
  return 100;
}

function computePolylineLength3D(points: SolvedPoint3D[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  return total;
}

// ============================================================================
// 3. DETERMINISTIC PHYSICAL TRACK GRAPH BUILDER
// ============================================================================

export function buildPhysicalTrackGraph(
  dataset: AtlasDataset,
  solved: SolvedRailwayNetwork3D,
): PhysicalTrackGraph {
  const segById = new Map(dataset.trackSegments.map((s) => [s.id, s]));

  const tracks: PhysicalTrack[] = [];
  const tracksById = new Map<string, PhysicalTrack>();
  const tracksBySegmentId = new Map<SkId<'segment'>, PhysicalTrack>();
  const tracksByLineId = new Map<SkId<'line'>, PhysicalTrack[]>();

  for (const sSeg of solved.segments) {
    const rawSeg = segById.get(sSeg.segmentId);
    const id = `sk:physical_track:${sSeg.segmentId.replace(/^sk:segment:/, '')}`;
    const gaugeMm = inferGaugeMm(sSeg.primaryLineId, sSeg.isShinkansen);
    const electrification = inferElectrification(sSeg.primaryLineId, sSeg.isShinkansen);

    const trackHalfSpacingM = !sSeg.isDoubleTrack
      ? 0
      : sSeg.isShinkansen
        ? TRACK_CLEARANCE_STANDARDS.shinkansenHalfSpacingM
        : sSeg.primaryLineId === 'sk:line:toei-oedo'
          ? TRACK_CLEARANCE_STANDARDS.linearMetroHalfSpacingM
          : TRACK_CLEARANCE_STANDARDS.conventionalHalfSpacingM;

    const railHeadOffsetM =
      sSeg.dominantStructure === 'surface'
        ? TRACK_CLEARANCE_STANDARDS.surfaceRailHeadOffsetM
        : TRACK_CLEARANCE_STANDARDS.slabRailHeadOffsetM;

    // Recompute exact 3D cumulative distance along solved points
    let accum = 0;
    const normalizedPoints: SolvedPoint3D[] = sSeg.points.map((pt, idx) => {
      if (idx > 0) {
        const prev = sSeg.points[idx - 1]!;
        accum += Math.hypot(pt.x - prev.x, pt.y - prev.y, pt.z - prev.z);
      }
      return { ...pt, distFromStart: accum };
    });

    const geometryLengthM = Math.max(1, computePolylineLength3D(normalizedPoints));
    const geometryFidelity =
      sSeg.heightBasis === 'manual-verified-relative'
        ? 'manual_verified_relative'
        : sSeg.heightBasis === 'osm-derived-schematic'
          ? 'osm_derived_3d'
          : 'schematic_inferred';

    const track: PhysicalTrack = {
      id,
      segmentId: sSeg.segmentId,
      primaryLineId: sSeg.primaryLineId,
      railLineIds: [...sSeg.railLineIds],
      operatorId: sSeg.operatorId,
      fromStationId: sSeg.fromStationId,
      toStationId: sSeg.toStationId,
      isDoubleTrack: sSeg.isDoubleTrack,
      isShinkansen: sSeg.isShinkansen,
      gaugeMm,
      electrification,
      trackHalfSpacingM,
      railHeadOffsetM,
      operatingKm: rawSeg?.operatingKm ?? null,
      geometryLengthM: Math.round(geometryLengthM * 100) / 100,
      maxSpeedKmh: inferTypicalMaxSpeedKmh(sSeg.primaryLineId, sSeg.isShinkansen),
      speedBasis: 'typical_schematic',
      dominantTier: sSeg.dominantTier,
      dominantStructure: sSeg.dominantStructure,
      heightBasis: sSeg.heightBasis,
      geometryFidelity,
      points: normalizedPoints,
      portals: sSeg.portals,
      minY: sSeg.minY,
      maxY: sSeg.maxY,
      color: sSeg.color,
      provenance: rawSeg?.provenance ?? {
        sourceIds: [],
        dataNature: 'derived',
        lastVerifiedAt: dataset.generatedAt.slice(0, 10),
      },
    };

    tracks.push(track);
    tracksById.set(track.id, track);
    tracksBySegmentId.set(track.segmentId, track);

    for (const lid of track.railLineIds) {
      if (!tracksByLineId.has(lid)) tracksByLineId.set(lid, []);
      tracksByLineId.get(lid)!.push(track);
    }
  }

  // Build physical track connections at shared station endpoints
  const connections: TrackConnection[] = [];
  const connectionsByTrackEnd = new Map<string, TrackConnection[]>();
  const addConnection = (conn: TrackConnection) => {
    connections.push(conn);
    const k = `${conn.fromTrackId}::${conn.fromEnd}`;
    if (!connectionsByTrackEnd.has(k)) connectionsByTrackEnd.set(k, []);
    connectionsByTrackEnd.get(k)!.push(conn);
  };

  // Group track endpoints by (lineId, stationId) for intra-line continuity & branches
  interface EndpointRef {
    track: PhysicalTrack;
    end: 'start' | 'end';
    stationId: SkId<'station'>;
  }

  const endpointsByStation = new Map<SkId<'station'>, EndpointRef[]>();
  for (const tr of tracks) {
    const startRef: EndpointRef = { track: tr, end: 'start', stationId: tr.fromStationId };
    const endRef: EndpointRef = { track: tr, end: 'end', stationId: tr.toStationId };
    if (!endpointsByStation.has(tr.fromStationId)) endpointsByStation.set(tr.fromStationId, []);
    if (!endpointsByStation.has(tr.toStationId)) endpointsByStation.set(tr.toStationId, []);
    endpointsByStation.get(tr.fromStationId)!.push(startRef);
    endpointsByStation.get(tr.toStationId)!.push(endRef);
  }

  const throughPairs = new Set<string>();
  for (const ts of dataset.throughServices) {
    throughPairs.add(`${ts.fromRailLineId}::${ts.toRailLineId}`);
    throughPairs.add(`${ts.toRailLineId}::${ts.fromRailLineId}`);
  }

  let connSeq = 0;
  for (const [stationId, refs] of endpointsByStation.entries()) {
    for (let i = 0; i < refs.length; i++) {
      const a = refs[i]!;
      for (let j = i + 1; j < refs.length; j++) {
        const b = refs[j]!;
        if (a.track.id === b.track.id) continue;

        const sharedLines = a.track.railLineIds.filter((lid) => b.track.railLineIds.includes(lid));
        const isThrough =
          sharedLines.length === 0 &&
          throughPairs.has(`${a.track.primaryLineId}::${b.track.primaryLineId}`);

        if (sharedLines.length === 0 && !isThrough) continue;
        // Gauge compatibility guard
        if (a.track.gaugeMm !== b.track.gaugeMm) continue;

        const kind = isThrough
          ? 'through_service'
          : refs.filter((r) => r.track.railLineIds.some((l) => sharedLines.includes(l))).length > 2
            ? 'branch'
            : 'continuation';

        const railLineIds = sharedLines.length > 0 ? sharedLines : [a.track.primaryLineId, b.track.primaryLineId];
        addConnection({
          id: `conn-${++connSeq}`,
          atStationId: stationId,
          fromTrackId: a.track.id,
          fromEnd: a.end,
          toTrackId: b.track.id,
          toEnd: b.end,
          kind,
          railLineIds,
          isThroughService: isThrough,
        });
        addConnection({
          id: `conn-${++connSeq}`,
          atStationId: stationId,
          fromTrackId: b.track.id,
          fromEnd: b.end,
          toTrackId: a.track.id,
          toEnd: a.end,
          kind,
          railLineIds,
          isThroughService: isThrough,
        });
      }
    }
  }

  // Station anchors derived 1:1 from solved.stationNodes
  const stationAnchors: StationAnchor3D[] = [];
  const stationAnchorsByKey = new Map<string, StationAnchor3D>();
  for (const node of solved.stationNodes) {
    const isUnderground = node.y < TRACK_CLEARANCE_STANDARDS.tunnelPortalThresholdY;
    const isShinkansen =
      node.lineId === 'sk:line:jr-central-tokaido-shinkansen' ||
      node.lineId === 'sk:line:jr-east-tohoku-shinkansen';
    const platformLengthM = isShinkansen ? 260 : node.isMajorHub ? 200 : 140;
    const anchor: StationAnchor3D = {
      stationId: node.stationId,
      lineId: node.lineId,
      operatorId: node.operatorId,
      stationComplexId: node.stationComplexId,
      nameJa: node.nameJa,
      nameEn: node.nameEn,
      stationCode: node.stationCode,
      x: node.x,
      y: node.y,
      z: node.z,
      dirX: node.dirX,
      dirZ: node.dirZ,
      tier: node.tier,
      structure: node.structure,
      isUnderground,
      isMajorHub: node.isMajorHub,
      platformLengthM,
      platformLayout: isUnderground ? 'island' : 'side_dual',
      heightBasis: node.heightBasis,
      color: node.color,
    };
    stationAnchors.push(anchor);
    stationAnchorsByKey.set(`${anchor.lineId}::${anchor.stationId}`, anchor);
  }

  return {
    tracks,
    tracksById,
    tracksBySegmentId,
    tracksByLineId,
    connections,
    connectionsByTrackEnd,
    stationAnchors,
    stationAnchorsByKey,
  };
}

// ============================================================================
// 4. DETERMINISTIC 3D RAIL-HEAD POSE SAMPLER (LEFT-HAND RUNNING + Y-EXAGGERATION)
// ============================================================================

/**
 * Samples an exact 3D pose on `track` at `distanceFromTrackStartM` (always measured
 * from `points[0]` i.e. `fromStationId` -> `toStationId`).
 *
 * - Applies Japanese Left-Hand Running (左側通行) perpendicular offset:
 *     direction = +1 -> -trackHalfSpacingM along segment right-hand normal
 *     direction = -1 -> +trackHalfSpacingM along segment right-hand normal
 * - Applies `verticalExaggeration` strictly to the track spline elevation `centerY`,
 *   then adds unscaled `railHeadOffsetM` so rolling stock stays flush on rail heads
 *   without ever distorting carbody height!
 * - Outputs `yawRad` & `pitchRad` for Three.js `'YXZ'` Euler where local `+Z` = Forward.
 */
export function samplePhysicalTrackPose(
  track: PhysicalTrack,
  distanceFromTrackStartM: number,
  direction: TrackDirection,
  verticalExaggeration = 1.0,
): TrackPoseSample {
  const pts = track.points;
  const clampedVExag = Math.max(1.0, Math.min(2.5, verticalExaggeration));
  const totalLen = pts[pts.length - 1]?.distFromStart ?? track.geometryLengthM;
  const dist = Math.max(0, Math.min(totalLen, distanceFromTrackStartM));

  // Binary search for enclosing segment [idx, idx+1]
  let lo = 0;
  let hi = Math.max(0, pts.length - 2);
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pts[mid]!.distFromStart <= dist) lo = mid;
    else hi = mid - 1;
  }

  const p0 = pts[lo]!;
  const p1 = pts[Math.min(pts.length - 1, lo + 1)]!;
  const span = Math.max(1e-4, p1.distFromStart - p0.distFromStart);
  const f = Math.max(0, Math.min(1, (dist - p0.distFromStart) / span));

  const centerX = p0.x + (p1.x - p0.x) * f;
  const rawY = p0.y + (p1.y - p0.y) * f;
  const centerZ = p0.z + (p1.z - p0.z) * f;

  // Segment forward tangent in (+1) orientation
  const segDx = p1.x - p0.x;
  const segDy = (p1.y - p0.y) * clampedVExag;
  const segDz = p1.z - p0.z;
  const segHLen = Math.hypot(segDx, segDz) || 1;

  // Right-hand horizontal normal in (+1) orientation: (-dz/len, dx/len)
  const segRightX = -segDz / segHLen;
  const segRightZ = segDx / segHLen;

  // Japanese Left-Hand Running:
  // +1 direction rides LEFT of +1 centerline (-trackHalfSpacingM)
  // -1 direction rides RIGHT of +1 centerline (+trackHalfSpacingM), which is LEFT when facing -1!
  const lateralSign = direction === 1 ? -1 : 1;
  const lateralOffset = track.trackHalfSpacingM * lateralSign;

  const x = centerX + segRightX * lateralOffset;
  const z = centerZ + segRightZ * lateralOffset;

  const isSurface = p0.structure === 'surface' && p1.structure === 'surface';
  const railHeadOffset = isSurface
    ? TRACK_CLEARANCE_STANDARDS.surfaceRailHeadOffsetM
    : TRACK_CLEARANCE_STANDARDS.slabRailHeadOffsetM;
  const centerY = rawY * clampedVExag;
  const y = centerY + railHeadOffset;

  // Forward travel tangent
  const rawDirX = segDx * direction;
  const rawDirY = segDy * direction;
  const rawDirZ = segDz * direction;
  const dirLen = Math.hypot(rawDirX, rawDirY, rawDirZ) || 1;
  const dirX = rawDirX / dirLen;
  const dirY = rawDirY / dirLen;
  const dirZ = rawDirZ / dirLen;

  // Right-hand normal in travel direction
  const rightX = segRightX * direction;
  const rightZ = segRightZ * direction;

  // Three.js 'YXZ' Euler so local +Z aligns with (dirX, dirY, dirZ)
  const yawRad = Math.atan2(dirX, dirZ);
  const clampedDirY = Math.max(-0.98, Math.min(0.98, dirY));
  const pitchRad = -Math.asin(clampedDirY);

  const samplePt = f < 0.5 ? p0 : p1;
  const isUnderground = rawY < TRACK_CLEARANCE_STANDARDS.tunnelPortalThresholdY;
  const inTunnel =
    samplePt.structure === 'tunnel_box' || samplePt.structure === 'tunnel_shield';

  return {
    x,
    y,
    z,
    centerX,
    centerY,
    centerZ,
    dirX,
    dirY,
    dirZ,
    rightX,
    rightZ,
    yawRad,
    pitchRad,
    distanceFromTrackStartM: dist,
    tier: samplePt.tier,
    structure: samplePt.structure,
    isUnderground,
    inTunnel,
  };
}
