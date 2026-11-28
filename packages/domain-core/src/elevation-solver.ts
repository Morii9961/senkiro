/**
 * Schematic 3D vertical railway-network solver (pure TypeScript, no Three.js / React).
 *
 * Computes C0-continuous elevation splines for every track segment, schematic height tiers,
 * tunnel portals, vertical deconfliction at non-junction 2D crossings and stacked station
 * nodes for multi-level complexes. Every city-specific input (projection origin, per-line
 * elevation profiles, verified per-station overrides, tier ladder, hub list) arrives through
 * {@link ElevationSolverConfig}; the solver itself knows no city.
 *
 * Honesty discipline:
 *  - Heights are schematic relative units, never surveyed depths; every value carries a
 *    `heightBasis` (`manual-verified-relative` | `osm-derived-schematic` | `inferred-schematic`).
 *  - A 2D crossing of two unconnected lines never creates a junction; it is separated
 *    vertically instead.
 *  - Results influenced by the ODbL vertical layer list its share-alike sources so the view
 *    layer can keep them physically isolated (invariant 7).
 */
import type {
  Interchange,
  InterchangeGateType,
  LineClass,
  LocalizedNames,
  LonLat,
  SkId,
  TrackGraph,
  TrackSegment,
  TrackVerticalAttribute,
  TrackVerticalLayer,
} from '@senkiro/contracts';
import { lonLatToWorld, type ProjectionOrigin } from './geo/projection.ts';

export type HeightBasis =
  | 'manual-verified-relative'
  | 'osm-derived-schematic'
  | 'inferred-schematic';

export type TrackStructureKind = 'viaduct' | 'surface' | 'tunnel_box' | 'tunnel_shield';

export interface SchematicTier {
  id: string;
  labelJa: string;
  labelEn: string;
  nominalY: number;
  /** Lower bound of the tier; the lowest tier should use `-Infinity`. */
  floorY: number;
  /** Whether `y === floorY` belongs to this tier. */
  floorInclusive: boolean;
}

/** Generic seven-level ladder (two elevated, surface, four underground), schematic units. */
export const DEFAULT_SCHEMATIC_TIERS: readonly SchematicTier[] = [
  {
    id: 'L+2',
    labelJa: '高架2層 (+20)',
    labelEn: 'Elevated L+2 (+20)',
    nominalY: 20,
    floorY: 16,
    floorInclusive: true,
  },
  {
    id: 'L+1',
    labelJa: '高架1層 (+10)',
    labelEn: 'Elevated L+1 (+10)',
    nominalY: 10,
    floorY: 4,
    floorInclusive: true,
  },
  {
    id: 'L0',
    labelJa: '地上 (0)',
    labelEn: 'Surface L0 (0)',
    nominalY: 0,
    floorY: -5,
    floorInclusive: false,
  },
  {
    id: 'L-1',
    labelJa: '地下1層 (-10)',
    labelEn: 'Underground L-1 (-10)',
    nominalY: -10,
    floorY: -15,
    floorInclusive: false,
  },
  {
    id: 'L-2',
    labelJa: '地下2層 (-20)',
    labelEn: 'Underground L-2 (-20)',
    nominalY: -20,
    floorY: -25,
    floorInclusive: false,
  },
  {
    id: 'L-3',
    labelJa: '地下3層 (-30)',
    labelEn: 'Underground L-3 (-30)',
    nominalY: -30,
    floorY: -34,
    floorInclusive: false,
  },
  {
    id: 'L-4',
    labelJa: '地下4層 (-40)',
    labelEn: 'Underground L-4 (-40)',
    nominalY: -40,
    floorY: Number.NEGATIVE_INFINITY,
    floorInclusive: true,
  },
];

export interface LineElevationProfile {
  /** Schematic elevation of the line between verified overrides. */
  baseY: number;
  /** Lateral offset (metres, right-hand normal) so parallel lines do not overlap. Default 0. */
  lateralOffsetM?: number;
  /** Higher priority keeps its height when a crossing must be separated. Default 5. */
  priority?: number;
  /** `'shield'` forces bored-tunnel rendering underground; `'auto'` decides by depth. */
  tunnelMethod?: 'shield' | 'box' | 'auto';
}

/** A per-(line, station) elevation backed by a cited source. */
export interface StationLineElevationOverride {
  lineId: SkId<'line'>;
  stationId: SkId<'station'>;
  y: number;
  sourceIds: string[];
  note?: string;
}

export interface StructureThresholds {
  /** `y > viaductAboveY` renders as viaduct. Default 2.4. */
  viaductAboveY: number;
  /** `y >= surfaceFloorY` (and not viaduct) renders at surface. Default -2.4. */
  surfaceFloorY: number;
  /** Underground deeper than or equal to this is a shield tunnel. Default -24. */
  shieldAtOrBelowY: number;
  /** Elevation at which tunnel portals are placed. Default -1.5. */
  portalY: number;
}

/** Schematic rules applied when only the ODbL vertical layer gives evidence. */
export interface VerticalEvidenceHeuristics {
  metroElevatedY: number;
  shinkansenUndergroundY: number;
  conventionalUndergroundY: number;
  conventionalElevatedMinY: number;
  /** Viaduct lines tagged at-grade drop by `drop`, but not below `minY`. */
  elevatedLineAtGrade: { thresholdY: number; drop: number; minY: number };
  /** Mid-span bump when both endpoints sit within `maxEndpointDelta` of each other. */
  midSpan: { maxEndpointDelta: number; elevatedTargetY: number; undergroundTargetY: number };
}

export interface SamplingOptions {
  /** Max resampling step inside `detailBounds` (or everywhere without bounds). Default 55 m. */
  maxStepM: number;
  /** Step outside `detailBounds`. Default 220 m. */
  coarseMaxStepM: number;
  /** `[minLon, minLat, maxLon, maxLat]` area sampled finely. */
  detailBounds?: readonly [number, number, number, number];
}

export interface ElevationSolverConfig {
  /** Local projection origin of the city / region being solved. Required. */
  origin: ProjectionOrigin;
  lineProfiles?: Readonly<Record<string, LineElevationProfile>>;
  defaultProfileByLineClass?: Partial<Readonly<Record<LineClass, LineElevationProfile>>>;
  stationOverrides?: readonly StationLineElevationOverride[];
  tiers?: readonly SchematicTier[];
  structure?: Partial<StructureThresholds>;
  heuristics?: Partial<VerticalEvidenceHeuristics>;
  /** Minimum vertical separation at non-junction crossings. Default 6.5. */
  minClearance?: number;
  sampling?: Partial<SamplingOptions>;
  /** Stations flagged as hubs regardless of how many lines serve them. */
  majorHubStationIds?: ReadonlySet<SkId<'station'>>;
}

export interface SolvedPoint3D {
  x: number;
  y: number;
  z: number;
  /** 0..1 along the segment. */
  t: number;
  distFromStart: number;
  structure: TrackStructureKind;
  tier: string;
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
  color: string | null;
  isShinkansen: boolean;
  lateralOffsetM: number;
  points: SolvedPoint3D[];
  portals: PortalPoint3D[];
  minY: number;
  maxY: number;
  dominantTier: string;
  dominantStructure: TrackStructureKind;
  heightBasis: HeightBasis;
  deconflictedCrossings: number;
}

export interface SolvedStationNode3D {
  stationId: SkId<'station'>;
  lineId: SkId<'line'>;
  operatorId: SkId<'operator'>;
  stationComplexId: SkId<'complex'> | null;
  names: LocalizedNames;
  stationCode: string | null;
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirZ: number;
  tier: string;
  structure: TrackStructureKind;
  heightBasis: HeightBasis;
  /** Sources of a verified override; empty for schematic heights. */
  heightSourceIds: string[];
  color: string | null;
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
  gateType: InterchangeGateType;
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
  origin: ProjectionOrigin;
  segments: SolvedSegment3D[];
  stationNodes: SolvedStationNode3D[];
  transferConnectors: VerticalTransferConnector3D[];
  crossings: CrossingCheckRecord[];
  tierCounts: Record<string, number>;
  /** Segments left out (no rail line or < 2 usable geometry points). */
  skippedSegmentIds: SkId<'segment'>[];
  /** Share-alike sources whose evidence shaped this result (empty when none was used). */
  shareAlikeSourceIds: string[];
}

const DEFAULT_STRUCTURE: StructureThresholds = {
  viaductAboveY: 2.4,
  surfaceFloorY: -2.4,
  shieldAtOrBelowY: -24,
  portalY: -1.5,
};

const DEFAULT_HEURISTICS: VerticalEvidenceHeuristics = {
  metroElevatedY: 10,
  shinkansenUndergroundY: -22,
  conventionalUndergroundY: -14,
  conventionalElevatedMinY: 9,
  elevatedLineAtGrade: { thresholdY: 6, drop: 1.5, minY: 5.5 },
  midSpan: { maxEndpointDelta: 3, elevatedTargetY: 8, undergroundTargetY: -12 },
};

const DEFAULT_CLASS_PROFILES: Readonly<Record<LineClass, LineElevationProfile>> = {
  shinkansen: { baseY: 18 },
  metro: { baseY: -16 },
  trunk: { baseY: 0 },
  local_line: { baseY: 0 },
  private: { baseY: 0 },
  unknown: { baseY: 0 },
};

interface ResolvedProfile {
  baseY: number;
  lateralOffsetM: number;
  priority: number;
  tunnelMethod: 'shield' | 'box' | 'auto';
}

interface NodeElevation {
  y: number;
  basis: HeightBasis;
  sourceIds: string[];
}

interface DraftSegment {
  segment: TrackSegment;
  primaryLineId: SkId<'line'>;
  profile: ResolvedProfile;
  color: string | null;
  heightBasis: HeightBasis;
  pts: { x: number; z: number; dist: number; t: number }[];
  ys: number[];
  bbox: { minX: number; maxX: number; minZ: number; maxZ: number };
  deconflictedCrossings: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

export function classifyTier(
  y: number,
  tiers: readonly SchematicTier[] = DEFAULT_SCHEMATIC_TIERS,
): string {
  for (const tier of tiers) {
    if (tier.floorInclusive ? y >= tier.floorY : y > tier.floorY) {
      return tier.id;
    }
  }
  return tiers[tiers.length - 1]?.id ?? 'unknown';
}

export function classifyStructure(
  y: number,
  tunnelMethod: 'shield' | 'box' | 'auto' = 'auto',
  thresholds: StructureThresholds = DEFAULT_STRUCTURE,
): TrackStructureKind {
  if (y > thresholds.viaductAboveY) {
    return 'viaduct';
  }
  if (y >= thresholds.surfaceFloorY) {
    return 'surface';
  }
  if (tunnelMethod === 'shield') {
    return 'tunnel_shield';
  }
  if (tunnelMethod === 'box') {
    return 'tunnel_box';
  }
  return y <= thresholds.shieldAtOrBelowY ? 'tunnel_shield' : 'tunnel_box';
}

function intersect2D(
  a1: { x: number; z: number },
  a2: { x: number; z: number },
  b1: { x: number; z: number },
  b2: { x: number; z: number },
): { tA: number; tB: number; x: number; z: number } | null {
  const dax = a2.x - a1.x;
  const daz = a2.z - a1.z;
  const dbx = b2.x - b1.x;
  const dbz = b2.z - b1.z;
  const denom = dax * dbz - daz * dbx;
  if (Math.abs(denom) < 1e-6) {
    return null;
  }
  const qpx = b1.x - a1.x;
  const qpz = b1.z - a1.z;
  const tA = (qpx * dbz - qpz * dbx) / denom;
  const tB = (qpx * daz - qpz * dax) / denom;
  if (tA > 0.06 && tA < 0.94 && tB > 0.06 && tB < 0.94) {
    return { tA, tB, x: a1.x + tA * dax, z: a1.z + tA * daz };
  }
  return null;
}

/** Densely resample a `[lon, lat]` polyline in local metres, applying a lateral offset. */
function samplePolyline(
  coords: readonly LonLat[],
  lateralOffsetM: number,
  maxStepM: number,
  origin: ProjectionOrigin,
): { x: number; z: number; dist: number; t: number }[] {
  const world = coords.map(([lon, lat]) => lonLatToWorld(lon, lat, origin));
  if (world.length < 2) {
    return [];
  }
  const offset = world.map((pt, idx) => {
    if (Math.abs(lateralOffsetM) < 0.1) {
      return pt;
    }
    const prev = world[Math.max(0, idx - 1)] ?? pt;
    const next = world[Math.min(world.length - 1, idx + 1)] ?? pt;
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    return { x: pt.x + (-dz / len) * lateralOffsetM, z: pt.z + (dx / len) * lateralOffsetM };
  });
  const first = offset[0];
  if (first === undefined) {
    return [];
  }
  const resampled: { x: number; z: number; dist: number }[] = [{ x: first.x, z: first.z, dist: 0 }];
  let total = 0;
  for (let i = 1; i < offset.length; i++) {
    const a = offset[i - 1];
    const b = offset[i];
    if (a === undefined || b === undefined) {
      continue;
    }
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1) {
      continue;
    }
    const steps = Math.max(4, Math.ceil(len / maxStepM));
    for (let s = 1; s <= steps; s++) {
      const frac = s / steps;
      total += len / steps;
      resampled.push({ x: a.x + (b.x - a.x) * frac, z: a.z + (b.z - a.z) * frac, dist: total });
    }
  }
  if (resampled.length < 2) {
    return [];
  }
  const safeTotal = total || 1;
  return resampled.map((p) => ({ ...p, t: p.dist / safeTotal }));
}

function stationLineKey(lineId: string, stationId: string): string {
  return `${lineId}::${stationId}`;
}

/** Solve the schematic 3D network for one region's track graph. */
export function solveRailwayNetwork3D(
  graph: TrackGraph,
  verticalLayer: TrackVerticalLayer | null,
  config: ElevationSolverConfig,
): SolvedRailwayNetwork3D {
  const tiers = config.tiers ?? DEFAULT_SCHEMATIC_TIERS;
  const structure: StructureThresholds = { ...DEFAULT_STRUCTURE, ...config.structure };
  const heuristics: VerticalEvidenceHeuristics = { ...DEFAULT_HEURISTICS, ...config.heuristics };
  const minClearance = config.minClearance ?? 6.5;
  const sampling: SamplingOptions = { maxStepM: 55, coarseMaxStepM: 220, ...config.sampling };
  const origin = config.origin;

  const stationById = new Map(graph.stations.map((s) => [s.id, s]));
  const lineById = new Map(graph.lines.map((l) => [l.id, l]));
  const verticalBySegment = new Map<string, TrackVerticalAttribute>(
    (verticalLayer?.attributes ?? []).map((a) => [a.trackSegmentId, a]),
  );
  const overrides = new Map<string, StationLineElevationOverride>();
  for (const override of config.stationOverrides ?? []) {
    overrides.set(stationLineKey(override.lineId, override.stationId), override);
  }
  let usedVerticalEvidence = false;

  const profileFor = (lineId: SkId<'line'>): ResolvedProfile => {
    const explicit = config.lineProfiles?.[lineId];
    const lineClass = lineById.get(lineId)?.lineClass ?? 'unknown';
    const fallback =
      config.defaultProfileByLineClass?.[lineClass] ?? DEFAULT_CLASS_PROFILES[lineClass];
    const profile = explicit ?? fallback;
    return {
      baseY: profile.baseY,
      lateralOffsetM: profile.lateralOffsetM ?? 0,
      priority: profile.priority ?? 5,
      tunnelMethod: profile.tunnelMethod ?? 'auto',
    };
  };

  // Step 1 · one elevation per (line, station) node, so every segment meeting there is C0.
  const evidenceByNode = new Map<string, TrackVerticalAttribute[]>();
  for (const segment of graph.segments) {
    const evidence = verticalBySegment.get(segment.id);
    const [lineId] = segment.railLineIds;
    if (evidence === undefined || lineId === undefined) {
      continue;
    }
    for (const stationId of [segment.fromStationId, segment.toStationId]) {
      const key = stationLineKey(lineId, stationId);
      const list = evidenceByNode.get(key);
      if (list === undefined) {
        evidenceByNode.set(key, [evidence]);
      } else {
        list.push(evidence);
      }
    }
  }

  const nodeElevation = new Map<string, NodeElevation>();
  const inferNode = (lineId: SkId<'line'>, stationId: SkId<'station'>): NodeElevation => {
    const key = stationLineKey(lineId, stationId);
    const override = overrides.get(key);
    if (override !== undefined) {
      return {
        y: override.y,
        basis: 'manual-verified-relative',
        sourceIds: [...override.sourceIds],
      };
    }
    const profile = profileFor(lineId);
    const lineClass = lineById.get(lineId)?.lineClass ?? 'unknown';
    const hits = evidenceByNode.get(key) ?? [];
    const elevated = hits.some((h) => h.verticalClass === 'elevated');
    const underground = hits.some((h) => h.verticalClass === 'underground');
    const atGrade = hits.some((h) => h.verticalClass === 'at_grade');
    const osm = (y: number): NodeElevation => {
      usedVerticalEvidence = true;
      return { y, basis: 'osm-derived-schematic', sourceIds: [] };
    };
    const inferred: NodeElevation = {
      y: profile.baseY,
      basis: 'inferred-schematic',
      sourceIds: [],
    };
    if (lineClass === 'metro') {
      return elevated && !underground ? osm(heuristics.metroElevatedY) : inferred;
    }
    if (lineClass === 'shinkansen') {
      if (hits.length === 0) {
        return inferred;
      }
      return underground && !elevated ? osm(heuristics.shinkansenUndergroundY) : osm(profile.baseY);
    }
    if (underground && !elevated) {
      return osm(heuristics.conventionalUndergroundY);
    }
    if (elevated && !underground) {
      return osm(Math.max(heuristics.conventionalElevatedMinY, profile.baseY));
    }
    if (atGrade) {
      const rule = heuristics.elevatedLineAtGrade;
      return profile.baseY >= rule.thresholdY
        ? osm(Math.max(rule.minY, profile.baseY - rule.drop))
        : osm(0);
    }
    return inferred;
  };
  const nodeFor = (lineId: SkId<'line'>, stationId: SkId<'station'>): NodeElevation => {
    const key = stationLineKey(lineId, stationId);
    let node = nodeElevation.get(key);
    if (node === undefined) {
      node = inferNode(lineId, stationId);
      nodeElevation.set(key, node);
    }
    return node;
  };
  for (const line of graph.lines) {
    for (const stationId of line.stationIds) {
      if (stationById.has(stationId)) {
        nodeFor(line.id, stationId);
      }
    }
  }

  // Step 2 · draft polylines with smoothstep interpolation between node elevations.
  const drafts: DraftSegment[] = [];
  const skippedSegmentIds: SkId<'segment'>[] = [];
  const bounds = sampling.detailBounds;
  for (const segment of graph.segments) {
    const [primaryLineId] = segment.railLineIds;
    if (primaryLineId === undefined) {
      skippedSegmentIds.push(segment.id);
      continue;
    }
    const profile = profileFor(primaryLineId);
    const start = nodeFor(primaryLineId, segment.fromStationId);
    const end = nodeFor(primaryLineId, segment.toStationId);
    const evidence = verticalBySegment.get(segment.id);
    const lineClass = lineById.get(primaryLineId)?.lineClass ?? 'unknown';

    let midBump = 0;
    if (evidence !== undefined && Math.abs(start.y - end.y) < heuristics.midSpan.maxEndpointDelta) {
      if (evidence.verticalClass === 'elevated' && start.y <= 2) {
        midBump = heuristics.midSpan.elevatedTargetY - start.y;
      } else if (
        evidence.verticalClass === 'underground' &&
        start.y >= 0 &&
        lineClass !== 'metro'
      ) {
        midBump = heuristics.midSpan.undergroundTargetY - start.y;
      }
    }
    if (midBump !== 0) {
      usedVerticalEvidence = true;
    }
    const heightBasis: HeightBasis =
      start.basis === 'manual-verified-relative' || end.basis === 'manual-verified-relative'
        ? 'manual-verified-relative'
        : start.basis === 'osm-derived-schematic' ||
            end.basis === 'osm-derived-schematic' ||
            midBump !== 0
          ? 'osm-derived-schematic'
          : 'inferred-schematic';

    const fromCoords = stationById.get(segment.fromStationId)?.coordinates;
    const outside =
      bounds !== undefined &&
      fromCoords !== undefined &&
      (fromCoords[0] < bounds[0] ||
        fromCoords[1] < bounds[1] ||
        fromCoords[0] > bounds[2] ||
        fromCoords[1] > bounds[3]);
    const pts = samplePolyline(
      segment.geometry,
      profile.lateralOffsetM,
      outside ? sampling.coarseMaxStepM : sampling.maxStepM,
      origin,
    );
    if (pts.length < 2) {
      skippedSegmentIds.push(segment.id);
      continue;
    }
    const ys = pts.map((p) => {
      const base = start.y + (end.y - start.y) * smoothstep(p.t);
      // sin² bell vanishes at t = 0 and t = 1, so station nodes stay C0.
      const bell = midBump === 0 ? 0 : midBump * Math.sin(Math.PI * p.t) ** 2;
      return round2(base + bell);
    });
    // Pin exact endpoint heights (C0 at every node, immune to rounding drift).
    ys[0] = round2(start.y);
    ys[ys.length - 1] = round2(end.y);

    const bbox = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const p of pts) {
      bbox.minX = Math.min(bbox.minX, p.x);
      bbox.maxX = Math.max(bbox.maxX, p.x);
      bbox.minZ = Math.min(bbox.minZ, p.z);
      bbox.maxZ = Math.max(bbox.maxZ, p.z);
    }
    drafts.push({
      segment,
      primaryLineId,
      profile,
      color: lineById.get(primaryLineId)?.color ?? null,
      heightBasis,
      pts,
      ys,
      bbox,
      deconflictedCrossings: 0,
    });
  }

  // Step 3 · non-junction crossings get at least `minClearance` of vertical separation.
  const crossings: CrossingCheckRecord[] = [];
  for (let i = 0; i < drafts.length; i++) {
    const a = drafts[i];
    if (a === undefined) {
      continue;
    }
    for (let j = i + 1; j < drafts.length; j++) {
      const b = drafts[j];
      if (b === undefined || a.primaryLineId === b.primaryLineId) {
        continue;
      }
      const sa = a.segment;
      const sb = b.segment;
      if (
        sa.fromStationId === sb.fromStationId ||
        sa.fromStationId === sb.toStationId ||
        sa.toStationId === sb.fromStationId ||
        sa.toStationId === sb.toStationId
      ) {
        continue;
      }
      if (
        a.bbox.maxX < b.bbox.minX ||
        a.bbox.minX > b.bbox.maxX ||
        a.bbox.maxZ < b.bbox.minZ ||
        a.bbox.minZ > b.bbox.maxZ
      ) {
        continue;
      }
      const hit = findCrossing(a, b);
      if (hit === null) {
        continue;
      }
      let yA = a.ys[hit.idxA] ?? 0;
      let yB = b.ys[hit.idxB] ?? 0;
      let clearance = Math.abs(yA - yB);
      let wasAdjusted = false;
      if (clearance < minClearance) {
        const aWins = a.profile.priority >= b.profile.priority;
        const target = aWins ? b : a;
        const fixedY = aWins ? yA : yB;
        const targetIdx = aWins ? hit.idxB : hit.idxA;
        const targetT = target.pts[targetIdx]?.t ?? 0.5;
        // Underground lines duck deeper; elevated lines pass over; surface lines duck under.
        const direction = fixedY <= -2 ? -1 : fixedY >= 6 ? 1 : -1;
        const delta = fixedY + direction * (minClearance + 1.5) - (target.ys[targetIdx] ?? 0);
        const sigma = 0.22;
        const peakFade = Math.max(0.08, Math.sin(Math.PI * targetT));
        for (let k = 1; k < target.pts.length - 1; k++) {
          const tk = target.pts[k]?.t ?? 0;
          const current = target.ys[k] ?? 0;
          const distT = (tk - targetT) / sigma;
          // Window is exactly 0 at both ends (C0 preserved) and 1 at the crossing.
          const weight = Math.min(
            1,
            (Math.exp(-0.5 * distT * distT) * Math.sin(Math.PI * tk)) / peakFade,
          );
          target.ys[k] = round2(current + delta * weight);
        }
        target.deconflictedCrossings += 1;
        wasAdjusted = true;
        yA = a.ys[hit.idxA] ?? yA;
        yB = b.ys[hit.idxB] ?? yB;
        clearance = Math.abs(yA - yB);
      }
      crossings.push({
        segmentA: sa.id,
        segmentB: sb.id,
        x: Math.round(hit.x),
        z: Math.round(hit.z),
        yA,
        yB,
        clearance: Math.round(clearance * 10) / 10,
        wasAdjusted,
      });
    }
  }

  // Step 4 · finalise segments: structure tags, portals, tier statistics.
  const tierCounts: Record<string, number> = {};
  for (const tier of tiers) {
    tierCounts[tier.id] = 0;
  }
  const tangents = new Map<string, { dx: number; dz: number; x: number; z: number }>();
  const segments: SolvedSegment3D[] = [];
  for (const d of drafts) {
    const points: SolvedPoint3D[] = d.pts.map((p, idx) => {
      const y = d.ys[idx] ?? 0;
      return {
        x: p.x,
        y,
        z: p.z,
        t: p.t,
        distFromStart: p.dist,
        structure: classifyStructure(y, d.profile.tunnelMethod, structure),
        tier: classifyTier(y, tiers),
      };
    });
    const portals: PortalPoint3D[] = [];
    for (let k = 1; k < points.length; k++) {
      const prev = points[k - 1];
      const cur = points[k];
      if (prev === undefined || cur === undefined) {
        continue;
      }
      const prevUnder = prev.structure === 'tunnel_box' || prev.structure === 'tunnel_shield';
      const curUnder = cur.structure === 'tunnel_box' || cur.structure === 'tunnel_shield';
      if (prevUnder === curUnder) {
        continue;
      }
      const dx = cur.x - prev.x;
      const dz = cur.z - prev.z;
      const len = Math.hypot(dx, dz) || 1;
      const tunnel = curUnder ? cur.structure : prev.structure;
      portals.push({
        x: (prev.x + cur.x) * 0.5,
        y: structure.portalY,
        z: (prev.z + cur.z) * 0.5,
        dirX: dx / len,
        dirZ: dz / len,
        segmentId: d.segment.id,
        lineId: d.primaryLineId,
        tunnelKind: tunnel === 'tunnel_shield' ? 'tunnel_shield' : 'tunnel_box',
      });
    }
    const mid = points[Math.floor(points.length / 2)];
    const p0 = points[0];
    const p1 = points[1];
    const pn = points[points.length - 1];
    const pnPrev = points[points.length - 2];
    if (
      mid === undefined ||
      p0 === undefined ||
      p1 === undefined ||
      pn === undefined ||
      pnPrev === undefined
    ) {
      continue;
    }
    tierCounts[mid.tier] = (tierCounts[mid.tier] ?? 0) + 1;
    const lenStart = Math.hypot(p1.x - p0.x, p1.z - p0.z) || 1;
    tangents.set(stationLineKey(d.primaryLineId, d.segment.fromStationId), {
      dx: (p1.x - p0.x) / lenStart,
      dz: (p1.z - p0.z) / lenStart,
      x: p0.x,
      z: p0.z,
    });
    const lenEnd = Math.hypot(pn.x - pnPrev.x, pn.z - pnPrev.z) || 1;
    tangents.set(stationLineKey(d.primaryLineId, d.segment.toStationId), {
      dx: (pn.x - pnPrev.x) / lenEnd,
      dz: (pn.z - pnPrev.z) / lenEnd,
      x: pn.x,
      z: pn.z,
    });
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    segments.push({
      segmentId: d.segment.id,
      primaryLineId: d.primaryLineId,
      railLineIds: [...d.segment.railLineIds],
      operatorId: d.segment.operatorId,
      fromStationId: d.segment.fromStationId,
      toStationId: d.segment.toStationId,
      color: d.color,
      isShinkansen: d.segment.isShinkansen,
      lateralOffsetM: d.profile.lateralOffsetM,
      points,
      portals,
      minY,
      maxY,
      dominantTier: mid.tier,
      dominantStructure: mid.structure,
      heightBasis: d.heightBasis,
      deconflictedCrossings: d.deconflictedCrossings,
    });
  }

  // Step 5 · one node per station-on-line, so multi-level hubs stack their platforms.
  const stationNodes: SolvedStationNode3D[] = [];
  const nodesByComplex = new Map<SkId<'complex'>, SolvedStationNode3D[]>();
  for (const line of graph.lines) {
    for (const stationId of line.stationIds) {
      const station = stationById.get(stationId);
      if (station === undefined) {
        continue;
      }
      const key = stationLineKey(line.id, stationId);
      const elevation = nodeFor(line.id, stationId);
      const tangent = tangents.get(key);
      const fallback = lonLatToWorld(station.coordinates[0], station.coordinates[1], origin);
      const node: SolvedStationNode3D = {
        stationId,
        lineId: line.id,
        operatorId: station.operatorId,
        stationComplexId: station.stationComplexId,
        names: station.names,
        stationCode: station.stationCode,
        x: tangent?.x ?? fallback.x,
        y: elevation.y,
        z: tangent?.z ?? fallback.z,
        dirX: tangent?.dx ?? 1,
        dirZ: tangent?.dz ?? 0,
        tier: classifyTier(elevation.y, tiers),
        structure: classifyStructure(elevation.y, profileFor(line.id).tunnelMethod, structure),
        heightBasis: elevation.basis,
        heightSourceIds: elevation.sourceIds,
        color: line.color,
        isMajorHub:
          (config.majorHubStationIds?.has(stationId) ?? false) || station.railLineIds.length > 1,
      };
      stationNodes.push(node);
      if (station.stationComplexId !== null) {
        const list = nodesByComplex.get(station.stationComplexId);
        if (list === undefined) {
          nodesByComplex.set(station.stationComplexId, [node]);
        } else {
          list.push(node);
        }
      }
    }
  }

  // Step 6 · vertical transfer connectors between stacked levels of a complex.
  const gateTypeByPair = new Map<string, InterchangeGateType>();
  const rememberGate = (ic: Interchange): void => {
    gateTypeByPair.set(`${ic.fromStationId}::${ic.toStationId}`, ic.gateType);
    gateTypeByPair.set(`${ic.toStationId}::${ic.fromStationId}`, ic.gateType);
  };
  for (const ic of graph.interchanges) {
    rememberGate(ic);
  }
  const transferConnectors: VerticalTransferConnector3D[] = [];
  for (const [complexId, nodes] of nodesByComplex) {
    if (nodes.length < 2) {
      continue;
    }
    const sorted = [...nodes].sort((p, q) => q.y - p.y);
    for (let i = 0; i < sorted.length - 1; i++) {
      const upper = sorted[i];
      const lower = sorted[i + 1];
      if (upper === undefined || lower === undefined) {
        continue;
      }
      const dist = Math.hypot(upper.x - lower.x, upper.y - lower.y, upper.z - lower.z);
      if (dist < 3 || dist > 550) {
        continue;
      }
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
        gateType:
          upper.stationId === lower.stationId
            ? 'in_gate'
            : (gateTypeByPair.get(`${upper.stationId}::${lower.stationId}`) ?? 'unknown'),
      });
    }
  }

  const shareAlikeSourceIds = usedVerticalEvidence
    ? (verticalLayer?.sources ?? []).filter((s) => s.shareAlike !== false).map((s) => s.id)
    : [];

  return {
    origin,
    segments,
    stationNodes,
    transferConnectors,
    crossings,
    tierCounts,
    skippedSegmentIds,
    shareAlikeSourceIds,
  };
}

function findCrossing(
  a: DraftSegment,
  b: DraftSegment,
): { idxA: number; idxB: number; x: number; z: number } | null {
  const strideA = Math.max(1, Math.floor(a.pts.length / 18));
  const strideB = Math.max(1, Math.floor(b.pts.length / 18));
  for (let ia = 0; ia < a.pts.length - 1; ia += strideA) {
    const ia2 = Math.min(a.pts.length - 1, ia + strideA);
    const pa1 = a.pts[ia];
    const pa2 = a.pts[ia2];
    if (pa1 === undefined || pa2 === undefined) {
      continue;
    }
    for (let ib = 0; ib < b.pts.length - 1; ib += strideB) {
      const ib2 = Math.min(b.pts.length - 1, ib + strideB);
      const pb1 = b.pts[ib];
      const pb2 = b.pts[ib2];
      if (pb1 === undefined || pb2 === undefined) {
        continue;
      }
      const hit = intersect2D(pa1, pa2, pb1, pb2);
      if (hit !== null) {
        return {
          idxA: Math.max(1, Math.min(a.pts.length - 2, Math.round(ia + (ia2 - ia) * hit.tA))),
          idxB: Math.max(1, Math.min(b.pts.length - 2, Math.round(ib + (ib2 - ib) * hit.tB))),
          x: hit.x,
          z: hit.z,
        };
      }
    }
  }
  return null;
}
