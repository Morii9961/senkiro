/**
 * Civil-Engineering Underground Tunnel Cross-Section Profiles & Train Clearance Validator.
 *
 * Pure TypeScript (zero Three.js / React dependency).
 * Generates structurally honest inner lining + outer shell 2D cross-section polygons
 * for shield circular bores, cut-and-cover rectangular boxes, single/double track configurations,
 * island/side underground station caverns, and smooth transition collars.
 */

import type { TrackStructureKind } from '../elevationSolver.js';
import type { SkId } from '../types.js';
import type {
  ClearanceValidationResult,
  LineEngineeringSpec,
  ProfilePoint2D,
  TrainClearanceEnvelope,
  TunnelCrossSectionSpec,
  TunnelStructureType,
} from './tunnelTypes.js';

const STANDARD_GAUGE_LINES = new Set<string>([
  'sk:line:metro-ginza',
  'sk:line:metro-marunouchi',
  'sk:line:toei-asakusa',
  'sk:line:toei-oedo',
  'sk:line:keikyu-main',
  'sk:line:keikyu-airport',
  'sk:line:keisei-main',
  'sk:line:keisei-oshiage',
  'sk:line:jr-central-tokaido-shinkansen',
  'sk:line:jr-east-tohoku-shinkansen',
]);

const THIRD_RAIL_LINES = new Set<string>([
  'sk:line:metro-ginza',
  'sk:line:metro-marunouchi',
]);

const SHIELD_PREFERRED_LINES = new Set<string>([
  'sk:line:toei-oedo',
  'sk:line:metro-fukutoshin',
  'sk:line:metro-namboku',
  'sk:line:metro-yurakucho',
  'sk:line:metro-hanzomon',
  'sk:line:tokyu-toyoko',
]);

/** Matches railTrackGenerator.ts slab top (0.12) + rail height (0.36) = 0.48m */
export const UNDERGROUND_SLAB_TOP_OFFSET_M = 0.12;
export const UNDERGROUND_RAIL_TOP_OFFSET_M = 0.48;
/** Matches railTrackGenerator.ts double-track centerlines (-1.85m, +1.85m) */
export const DOUBLE_TRACK_HALF_SPACING_M = 1.85;

/**
 * Returns realistic civil & electrical engineering parameters per rail line.
 */
export function getLineEngineeringSpec(
  lineId: SkId<'line'>,
  dominantStructure: TrackStructureKind,
): LineEngineeringSpec {
  const gaugeM: 1.435 | 1.067 = STANDARD_GAUGE_LINES.has(lineId) ? 1.435 : 1.067;
  const powerSupply = THIRD_RAIL_LINES.has(lineId) ? 'third_rail' : 'rigid_catenary';
  const preferShieldTunnel =
    dominantStructure === 'tunnel_shield' || SHIELD_PREFERRED_LINES.has(lineId);
  const defaultStationLayout =
    lineId === 'sk:line:metro-ginza' || lineId === 'sk:line:metro-marunouchi'
      ? 'station_side'
      : 'station_island';

  return {
    lineId,
    gaugeM,
    powerSupply,
    preferShieldTunnel,
    shieldDoubleTrackSingleBore: true,
    defaultStationLayout,
    doubleTrackHalfSpacingM: DOUBLE_TRACK_HALF_SPACING_M,
    railTopOffsetM: UNDERGROUND_RAIL_TOP_OFFSET_M,
    slabTopOffsetM: UNDERGROUND_SLAB_TOP_OFFSET_M,
  };
}

export function getTrainClearanceEnvelope(
  gaugeM: number,
  powerSupply: 'third_rail' | 'rigid_catenary',
): TrainClearanceEnvelope {
  return {
    gaugeM,
    // Japanese urban metro vehicle body width: 2.80m (Ginza/Oedo) to 2.95m (Metro/JR)
    carWidthM: 2.95,
    // Carbody roof height above top-of-rail
    carHeightAboveTorM: 3.95,
    // Rigid overhead conductor rail pantograph clearance height above TOR
    collectorHeightAboveTorM: powerSupply === 'rigid_catenary' ? 4.42 : 4.05,
    safetyMarginM: 0.18,
  };
}

/**
 * Builds a counter-clockwise 2D polygon for a circular shield tunnel with a flat concrete invert deck.
 * All profiles have identical vertex count (`NUM_PROFILE_VERTS = 24`) so ANY two tunnel profiles
 * can be smoothly morphed in `transition_collar` sections without topology mismatches!
 */
export const PROFILE_VERTEX_COUNT = 24;

function buildCircularShieldPolygon(
  radiusM: number,
  centerUpM: number,
  invertY: number,
): ProfilePoint2D[] {
  // Clamp invert chord below circle center
  const clampedInvert = Math.max(centerUpM - radiusM + 0.08, Math.min(centerUpM - 0.5, invertY));
  const dy = clampedInvert - centerUpM;
  const halfChord = Math.sqrt(Math.max(0.01, radiusM * radiusM - dy * dy));

  // Angles on circle from right invert corner counter-clockwise around the top arch to left invert corner
  const startAngle = Math.atan2(dy, halfChord); // negative angle in Q4 (e.g. -0.5 rad)
  const endAngle = Math.PI - startAngle; // angle in Q3 (e.g. PI + 0.5 rad)

  const archSteps = PROFILE_VERTEX_COUNT - 5; // 19 segments -> 20 arch vertices + 4 bottom invert vertices = 24
  const pts: ProfilePoint2D[] = [];
  for (let i = 0; i <= archSteps; i++) {
    const a = startAngle + (endAngle - startAngle) * (i / archSteps);
    pts.push([Math.cos(a) * radiusM, centerUpM + Math.sin(a) * radiusM]);
  }
  // 4 evenly spaced flat invert points from left corner back toward right corner
  for (let k = 1; k <= 4; k++) {
    const frac = k / 5;
    const x = -halfChord + halfChord * 2 * frac;
    pts.push([x, clampedInvert]);
  }
  return pts;
}

/**
 * Builds a counter-clockwise 24-vertex rectangular cut-and-cover concrete box polygon
 * with structural 45-degree corner haunches (chamfers) matching Japanese subway civil designs.
 * Vertex distribution mirrors the shield polygon (right wall -> top haunch -> roof -> left haunch -> left wall -> invert)
 * so box <-> shield and box <-> station transitions morph cleanly without twisting!
 */
function buildBoxPolygon(
  halfWidthM: number,
  bottomY: number,
  topY: number,
  haunchM: number,
): ProfilePoint2D[] {
  const h = Math.min(haunchM, halfWidthM * 0.25, (topY - bottomY) * 0.2);
  // Key corners CCW starting at bottom-right:
  // right wall (5 steps), top-right haunch (1), roof (7 steps), top-left haunch (1), left wall (5 steps), floor (5 steps)
  const pts: ProfilePoint2D[] = [];

  // Bottom-right -> right wall up to haunch (5 vertices: 0..4)
  for (let i = 0; i < 5; i++) {
    const f = i / 4;
    pts.push([halfWidthM, bottomY + (topY - h - bottomY) * f]);
  }
  // Top-right haunch -> roof right-to-left (10 vertices: 5..14)
  for (let i = 0; i < 10; i++) {
    const f = i / 9;
    pts.push([halfWidthM - h - (halfWidthM - h) * 2 * f, topY]);
  }
  // Top-left haunch -> left wall down to bottom-left (5 vertices: 15..19)
  for (let i = 0; i < 5; i++) {
    const f = i / 4;
    pts.push([-halfWidthM, topY - h - (topY - h - bottomY) * f]);
  }
  // Bottom invert left-to-right (4 interior vertices: 20..23)
  for (let k = 1; k <= 4; k++) {
    const f = k / 5;
    pts.push([-halfWidthM + halfWidthM * 2 * f, bottomY]);
  }
  return pts;
}

/**
 * Builds an open-top U-trough retaining wall profile for portal approach ramps.
 * Keeps 24 vertices by folding the upper wall tops cleanly, used for ramp transitions.
 */
function buildPortalUTroughPolygon(
  halfWidthM: number,
  bottomY: number,
  wallTopY: number,
): ProfilePoint2D[] {
  return buildBoxPolygon(halfWidthM, bottomY, wallTopY, 0.25);
}

/**
 * Smoothly interpolates two 24-vertex cross-section profiles (e.g. running tunnel -> station cavern).
 */
export function interpolateProfile(
  a: readonly ProfilePoint2D[],
  b: readonly ProfilePoint2D[],
  t: number,
): ProfilePoint2D[] {
  const c = Math.max(0, Math.min(1, t));
  const len = Math.min(a.length, b.length);
  const out: ProfilePoint2D[] = new Array(len);
  for (let i = 0; i < len; i++) {
    const pa = a[i]!;
    const pb = b[i]!;
    out[i] = [pa[0] + (pb[0] - pa[0]) * c, pa[1] + (pb[1] - pa[1]) * c];
  }
  return out;
}

/**
 * Builds a complete TunnelCrossSectionSpec for any supported underground structure type.
 */
export function createTunnelCrossSectionSpec(
  structureType: TunnelStructureType,
  engineering: LineEngineeringSpec,
  isDoubleTrack: boolean,
): TunnelCrossSectionSpec {
  const slabTop = engineering.slabTopOffsetM; // +0.12
  const railTop = engineering.railTopOffsetM; // +0.48
  const clearanceEnvelope = getTrainClearanceEnvelope(
    engineering.gaugeM,
    engineering.powerSupply,
  );
  const trackCenterOffsetsM = isDoubleTrack
    ? [-engineering.doubleTrackHalfSpacingM, engineering.doubleTrackHalfSpacingM]
    : [0];

  switch (structureType) {
    case 'shield_single': {
      const innerR = 3.25;
      const wall = 0.38;
      const centerUp = 2.45; // crown at +5.70m (> railTop + 4.42 + margin = 5.08m)
      const invertY = -0.32;
      return {
        structureType,
        isDoubleTrack: false,
        gaugeM: engineering.gaugeM,
        powerSupply: engineering.powerSupply,
        trackCenterOffsetsM: [0],
        slabTopOffsetM: slabTop,
        railTopOffsetM: railTop,
        wallThicknessM: wall,
        innerWidthM: innerR * 2,
        innerHeightM: centerUp + innerR - slabTop,
        innerProfile: buildCircularShieldPolygon(innerR, centerUp, invertY),
        outerProfile: buildCircularShieldPolygon(innerR + wall, centerUp, invertY - wall),
        roofProfileSplitY: 3.6,
        walkways: [
          {
            side: 'left',
            innerRightM: -2.42,
            outerRightM: -1.78,
            topUpM: 1.02,
            bottomUpM: invertY,
          },
        ],
        cableTroughs: [
          { side: 'right', rightM: 2.38, upM: 1.35, widthM: 0.34, heightM: 0.42 },
          { side: 'right', rightM: 2.52, upM: 2.15, widthM: 0.28, heightM: 0.32 },
        ],
        luminaireAnchors: [
          [-1.55, 5.12],
          [1.55, 5.12],
        ],
        hasCenterColumns: false,
        platforms: [],
        clearanceEnvelope,
      };
    }

    case 'shield_double': {
      const innerR = 5.15;
      const wall = 0.48;
      const centerUp = 2.25; // crown at +7.40m; at |x|=3.35m (outer train edge), arch height = 2.25 + sqrt(5.15^2 - 3.35^2) = 6.16m > 5.08m!
      const invertY = -0.36;
      return {
        structureType,
        isDoubleTrack: true,
        gaugeM: engineering.gaugeM,
        powerSupply: engineering.powerSupply,
        trackCenterOffsetsM,
        slabTopOffsetM: slabTop,
        railTopOffsetM: railTop,
        wallThicknessM: wall,
        innerWidthM: innerR * 2,
        innerHeightM: centerUp + innerR - slabTop,
        innerProfile: buildCircularShieldPolygon(innerR, centerUp, invertY),
        outerProfile: buildCircularShieldPolygon(innerR + wall, centerUp, invertY - wall),
        roofProfileSplitY: 4.3,
        walkways: [
          {
            side: 'left',
            innerRightM: -4.45,
            outerRightM: -3.62,
            topUpM: 0.98,
            bottomUpM: invertY,
          },
          {
            side: 'right',
            innerRightM: 3.62,
            outerRightM: 4.45,
            topUpM: 0.98,
            bottomUpM: invertY,
          },
        ],
        cableTroughs: [
          { side: 'left', rightM: -4.55, upM: 1.85, widthM: 0.34, heightM: 0.48 },
          { side: 'right', rightM: 4.55, upM: 1.85, widthM: 0.34, heightM: 0.48 },
        ],
        luminaireAnchors: [
          [-2.35, 6.45],
          [2.35, 6.45],
        ],
        hasCenterColumns: false,
        platforms: [],
        clearanceEnvelope,
      };
    }

    case 'box_single': {
      const halfW = 2.65;
      const bottomY = -0.32;
      const topY = 5.45;
      const wall = 0.44;
      return {
        structureType,
        isDoubleTrack: false,
        gaugeM: engineering.gaugeM,
        powerSupply: engineering.powerSupply,
        trackCenterOffsetsM: [0],
        slabTopOffsetM: slabTop,
        railTopOffsetM: railTop,
        wallThicknessM: wall,
        innerWidthM: halfW * 2,
        innerHeightM: topY - slabTop,
        innerProfile: buildBoxPolygon(halfW, bottomY, topY, 0.45),
        outerProfile: buildBoxPolygon(halfW + wall, bottomY - wall, topY + wall, 0.25),
        roofProfileSplitY: topY - 0.65,
        walkways: [
          {
            side: 'left',
            innerRightM: -halfW,
            outerRightM: -1.78,
            topUpM: 0.96,
            bottomUpM: bottomY,
          },
        ],
        cableTroughs: [
          { side: 'right', rightM: halfW - 0.22, upM: 1.45, widthM: 0.34, heightM: 0.46 },
          { side: 'right', rightM: halfW - 0.22, upM: 2.35, widthM: 0.3, heightM: 0.34 },
        ],
        luminaireAnchors: [[0, topY - 0.14]],
        hasCenterColumns: false,
        platforms: [],
        clearanceEnvelope,
      };
    }

    case 'box_double':
    case 'transition_collar': {
      const halfW = 4.75; // 9.5m inner clear width: tracks at ±1.85m (outer edge ±3.33m), walkways 3.65..4.75m
      const bottomY = -0.35;
      const topY = 5.65;
      const wall = 0.5;
      return {
        structureType,
        isDoubleTrack: true,
        gaugeM: engineering.gaugeM,
        powerSupply: engineering.powerSupply,
        trackCenterOffsetsM,
        slabTopOffsetM: slabTop,
        railTopOffsetM: railTop,
        wallThicknessM: wall,
        innerWidthM: halfW * 2,
        innerHeightM: topY - slabTop,
        innerProfile: buildBoxPolygon(halfW, bottomY, topY, 0.55),
        outerProfile: buildBoxPolygon(halfW + wall, bottomY - wall, topY + wall, 0.3),
        roofProfileSplitY: topY - 0.75,
        walkways: [
          {
            side: 'left',
            innerRightM: -halfW,
            outerRightM: -3.72,
            topUpM: 0.98,
            bottomUpM: bottomY,
          },
          {
            side: 'right',
            innerRightM: 3.72,
            outerRightM: halfW,
            topUpM: 0.98,
            bottomUpM: bottomY,
          },
        ],
        cableTroughs: [
          { side: 'left', rightM: -halfW + 0.22, upM: 1.75, widthM: 0.34, heightM: 0.46 },
          { side: 'left', rightM: -halfW + 0.22, upM: 2.65, widthM: 0.28, heightM: 0.34 },
          { side: 'right', rightM: halfW - 0.22, upM: 1.75, widthM: 0.34, heightM: 0.46 },
          { side: 'right', rightM: halfW - 0.22, upM: 2.65, widthM: 0.28, heightM: 0.34 },
        ],
        luminaireAnchors: [
          [-2.05, topY - 0.14],
          [2.05, topY - 0.14],
        ],
        // Slim steel/concrete center H-columns strictly between ±0.16m (train inner edges are at ±0.375m -> >0.21m clear!)
        hasCenterColumns: true,
        platforms: [],
        clearanceEnvelope,
      };
    }

    case 'station_side': {
      // Side platforms flanking the double tracks (zero interpenetration with rail clearance!)
      // Tracks stay at ±1.85m -> outer carbody edge ±3.325m -> platform edge starts at ±3.52m (0.195m gap!)
      const halfW = 8.4; // 16.8m wide station box cavern
      const bottomY = -0.4;
      const topY = 6.2;
      const wall = 0.6;
      const platTopY = railTop + 1.08; // Japanese platform height 1,080mm above rail top!
      return {
        structureType,
        isDoubleTrack,
        gaugeM: engineering.gaugeM,
        powerSupply: engineering.powerSupply,
        trackCenterOffsetsM,
        slabTopOffsetM: slabTop,
        railTopOffsetM: railTop,
        wallThicknessM: wall,
        innerWidthM: halfW * 2,
        innerHeightM: topY - slabTop,
        innerProfile: buildBoxPolygon(halfW, bottomY, topY, 0.55),
        outerProfile: buildBoxPolygon(halfW + wall, bottomY - wall, topY + wall, 0.3),
        roofProfileSplitY: topY - 0.85,
        walkways: [],
        cableTroughs: [
          { side: 'left', rightM: -halfW + 0.22, upM: 4.5, widthM: 0.34, heightM: 0.4 },
          { side: 'right', rightM: halfW - 0.22, upM: 4.5, widthM: 0.34, heightM: 0.4 },
        ],
        luminaireAnchors: [
          [-5.8, topY - 0.16],
          [0.0, topY - 0.16],
          [5.8, topY - 0.16],
        ],
        hasCenterColumns: true,
        platforms: [
          {
            innerRightM: -halfW,
            outerRightM: isDoubleTrack ? -3.54 : -1.72,
            topUpM: platTopY,
            bottomUpM: bottomY,
          },
          {
            innerRightM: isDoubleTrack ? 3.54 : 1.72,
            outerRightM: halfW,
            topUpM: platTopY,
            bottomUpM: bottomY,
          },
        ],
        clearanceEnvelope,
      };
    }

    case 'station_island': {
      // Island platform between separated tracks OR side+island wide cavern.
      // To preserve exact track centerline continuity with running tunnels (±1.85m) without sharp kinks,
      // we model a wide 18.4m cavern where platforms flank tracks seamlessly, OR for island stations
      // tracks smoothly splay via station cavern width to ±5.1m while central island sits in [-3.4m, +3.4m].
      const halfW = 9.2;
      const bottomY = -0.4;
      const topY = 6.4;
      const wall = 0.62;
      const platTopY = railTop + 1.08;
      // Splayed track offsets inside island station cavern so island platform [-3.35, +3.35] never collides with trains!
      const islandTrackOffsets = isDoubleTrack ? [-5.05, 5.05] : [0];
      return {
        structureType,
        isDoubleTrack,
        gaugeM: engineering.gaugeM,
        powerSupply: engineering.powerSupply,
        trackCenterOffsetsM: islandTrackOffsets,
        slabTopOffsetM: slabTop,
        railTopOffsetM: railTop,
        wallThicknessM: wall,
        innerWidthM: halfW * 2,
        innerHeightM: topY - slabTop,
        innerProfile: buildBoxPolygon(halfW, bottomY, topY, 0.55),
        outerProfile: buildBoxPolygon(halfW + wall, bottomY - wall, topY + wall, 0.3),
        roofProfileSplitY: topY - 0.85,
        walkways: [
          {
            side: 'left',
            innerRightM: -halfW,
            outerRightM: -7.1,
            topUpM: 0.98,
            bottomUpM: bottomY,
          },
          {
            side: 'right',
            innerRightM: 7.1,
            outerRightM: halfW,
            topUpM: 0.98,
            bottomUpM: bottomY,
          },
        ],
        cableTroughs: [
          { side: 'left', rightM: -halfW + 0.22, upM: 2.1, widthM: 0.34, heightM: 0.45 },
          { side: 'right', rightM: halfW - 0.22, upM: 2.1, widthM: 0.34, heightM: 0.45 },
        ],
        luminaireAnchors: [
          [-5.05, topY - 0.16],
          [0.0, topY - 0.16],
          [5.05, topY - 0.16],
        ],
        hasCenterColumns: false,
        platforms: isDoubleTrack
          ? [
              {
                innerRightM: -3.35,
                outerRightM: 3.35,
                topUpM: platTopY,
                bottomUpM: bottomY,
              },
            ]
          : [
              {
                innerRightM: 1.72,
                outerRightM: halfW,
                topUpM: platTopY,
                bottomUpM: bottomY,
              },
            ],
        clearanceEnvelope,
      };
    }

    case 'portal_ramp': {
      const halfW = isDoubleTrack ? 4.85 : 2.75;
      const bottomY = -0.35;
      const topY = 5.65;
      const wall = 0.5;
      return {
        structureType,
        isDoubleTrack,
        gaugeM: engineering.gaugeM,
        powerSupply: engineering.powerSupply,
        trackCenterOffsetsM,
        slabTopOffsetM: slabTop,
        railTopOffsetM: railTop,
        wallThicknessM: wall,
        innerWidthM: halfW * 2,
        innerHeightM: topY - slabTop,
        innerProfile: buildPortalUTroughPolygon(halfW, bottomY, topY),
        outerProfile: buildPortalUTroughPolygon(halfW + wall, bottomY - wall, topY + wall),
        roofProfileSplitY: 2.4,
        walkways: [
          {
            side: 'left',
            innerRightM: -halfW,
            outerRightM: isDoubleTrack ? -3.72 : -1.78,
            topUpM: 0.96,
            bottomUpM: bottomY,
          },
          {
            side: 'right',
            innerRightM: isDoubleTrack ? 3.72 : 1.78,
            outerRightM: halfW,
            topUpM: 0.96,
            bottomUpM: bottomY,
          },
        ],
        cableTroughs: [],
        luminaireAnchors: isDoubleTrack
          ? [
              [-2.05, topY - 0.14],
              [2.05, topY - 0.14],
            ]
          : [[0, topY - 0.14]],
        hasCenterColumns: false,
        platforms: [],
        clearanceEnvelope,
      };
    }
  }
}

/**
 * Ray-casting point-in-polygon test in 2D local tunnel coordinates.
 */
export function isPointInsideProfile2D(
  rightM: number,
  upM: number,
  polygon: readonly ProfilePoint2D[],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]![0];
    const yi = polygon[i]![1];
    const xj = polygon[j]![0];
    const yj = polygon[j]![1];
    const intersect =
      yi > upM !== yj > upM && rightM < ((xj - xi) * (upM - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Computes minimum signed distance from a 2D point to the polygon boundary (positive inside).
 */
function signedDistanceToProfile2D(
  px: number,
  py: number,
  polygon: readonly ProfilePoint2D[],
): number {
  let minDist = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const [ax, ay] = polygon[i]!;
    const [bx, by] = polygon[(i + 1) % polygon.length]!;
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq > 1e-9 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq)) : 0;
    const projX = ax + dx * t;
    const projY = ay + dy * t;
    const d = Math.hypot(px - projX, py - projY);
    if (d < minDist) minDist = d;
  }
  return isPointInsideProfile2D(px, py, polygon) ? minDist : -minDist;
}

/**
 * Mathematically verifies that every track lane's dynamic train gauge fits inside the tunnel
 * inner lining polygon AND does not collide with walkways, center columns, or station platforms!
 */
export function validateTrainClearance(spec: TunnelCrossSectionSpec): ClearanceValidationResult {
  const env = spec.clearanceEnvelope;
  const halfCarW = env.carWidthM * 0.5;
  const tor = spec.railTopOffsetM;
  const carBottom = tor + 0.12;
  const carRoof = tor + env.carHeightAboveTorM;
  const collectorTop = tor + env.collectorHeightAboveTorM;

  const violations: string[] = [];
  let minHorizontalMarginM = Infinity;
  let minVerticalMarginM = Infinity;

  for (const laneX of spec.trackCenterOffsetsM) {
    // 1. Check all critical corners of carbody & collector envelope against inner lining polygon
    const testCorners: [number, number, string][] = [
      [laneX - halfCarW, carBottom, 'lower-left carbody'],
      [laneX + halfCarW, carBottom, 'lower-right carbody'],
      [laneX - halfCarW, carRoof, 'upper-left carbody'],
      [laneX + halfCarW, carRoof, 'upper-right carbody'],
      [laneX - halfCarW * 0.55, collectorTop, 'collector-left'],
      [laneX + halfCarW * 0.55, collectorTop, 'collector-right'],
      [laneX, collectorTop, 'collector-crown'],
    ];

    for (const [cx, cy, label] of testCorners) {
      const sd = signedDistanceToProfile2D(cx, cy, spec.innerProfile);
      if (sd < env.safetyMarginM) {
        violations.push(
          `${spec.structureType} lane@${laneX.toFixed(2)}m ${label} margin ${sd.toFixed(3)}m < ${env.safetyMarginM}m`,
        );
      }
      if (label.includes('carbody')) {
        minHorizontalMarginM = Math.min(minHorizontalMarginM, sd);
      } else {
        minVerticalMarginM = Math.min(minVerticalMarginM, sd);
      }
    }

    // 2. Check no collision with walkways
    for (const w of spec.walkways) {
      const wMin = Math.min(w.innerRightM, w.outerRightM);
      const wMax = Math.max(w.innerRightM, w.outerRightM);
      const carMin = laneX - halfCarW;
      const carMax = laneX + halfCarW;
      const overlapX = Math.min(carMax, wMax) - Math.max(carMin, wMin);
      const overlapY = Math.min(carRoof, w.topUpM) - Math.max(carBottom, w.bottomUpM);
      if (overlapX > 0 && overlapY > 0) {
        violations.push(
          `${spec.structureType} lane@${laneX.toFixed(2)}m collides with ${w.side} walkway`,
        );
      }
    }

    // 3. Check no collision with platforms (allow realistic 0.14m platform-carbody gap!)
    for (const p of spec.platforms) {
      const pMin = Math.min(p.innerRightM, p.outerRightM);
      const pMax = Math.max(p.innerRightM, p.outerRightM);
      const carMin = laneX - halfCarW;
      const carMax = laneX + halfCarW;
      const gap = Math.max(pMin - carMax, carMin - pMax);
      if (gap < 0.12) {
        violations.push(
          `${spec.structureType} lane@${laneX.toFixed(2)}m platform gap ${gap.toFixed(3)}m < 0.12m`,
        );
      }
    }

    // 4. Check no collision with center columns (half-width 0.16m centered at x = 0)
    if (spec.hasCenterColumns) {
      const gapToCol = Math.abs(laneX) - halfCarW - 0.16;
      if (gapToCol < env.safetyMarginM) {
        violations.push(
          `${spec.structureType} lane@${laneX.toFixed(2)}m center-column gap ${gapToCol.toFixed(3)}m < ${env.safetyMarginM}m`,
        );
      }
    }
  }

  return {
    valid: violations.length === 0,
    minHorizontalMarginM: Number.isFinite(minHorizontalMarginM) ? minHorizontalMarginM : 0,
    minVerticalMarginM: Number.isFinite(minVerticalMarginM) ? minVerticalMarginM : 0,
    violations,
  };
}
