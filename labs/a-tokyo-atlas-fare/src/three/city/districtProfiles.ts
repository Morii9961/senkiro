/**
 * Tokyo District Profile & Urban Typology System (Pure TypeScript, Zero DOM/WebGL).
 *
 * Smoothly blends real Tokyo urban morphology zones using Gaussian-weighted anchors
 * (Marunouchi/Otemachi, Nishi-Shinjuku, Shibuya, Ikebukuro, Ginza/Nihonbashi, Roppongi,
 * Shinagawa/Konan, Setagaya/Suginami residential west, Edogawa/Katsushika residential east,
 * Oi/Toyosu/Kawasaki industrial bayfront) + station catchment proximity + OSM landuse kind.
 *
 * Produces correlated parcel, setback, height, roof-form, facade-mix, and night-activity
 * parameters so neighboring chunks transition organically without hard borders.
 */

export type DistrictTypology =
  | 'cbd_highrise'
  | 'commercial_hub'
  | 'station_catchment'
  | 'residential_lowrise'
  | 'industrial_bayfront'
  | 'park_edge';

export interface FacadeMixWeights {
  officeGlassCool: number;
  officeGlassWarm: number;
  commercialStone: number;
  commercialMetal: number;
  commercialTile: number;
  concreteModern: number;
  residentialBalcony: number;
  residentialPlaster: number;
}

export interface DistrictProfile {
  typology: DistrictTypology;
  urbanDensityFactor: number; // 0..1 smooth urban density falloff
  parcelWidthMin: number;
  parcelWidthMax: number;
  parcelDepthMin: number;
  parcelDepthMax: number;
  roadSetbackM: number;
  buildingGapM: number;
  lotCoverage: number; // 0..1
  courtyardVoidProb: number; // 0..1 probability of leaving yard/parking/pocket space
  irregularFootprintProb: number; // 0..1 probability of L-shape / notched footprint
  heightMin: number;
  heightMax: number;
  heightExponent: number; // >1 concentrates toward lower heights with rare tall towers
  pitchedRoofProb: number; // 0..1 for low-rise structures
  commercialRatio: number; // 0..1 share of commercial/office vs residential
  officeShare: number; // 0..1 share of office within non-residential
  facadeWeights: FacadeMixWeights;
  nightActivityPeak: number; // 0.3..1.4 relative evening lighting intensity
}

export interface DistrictAnchor {
  id: string;
  typology: DistrictTypology;
  x: number;
  z: number;
  radiusM: number;
  weight: number;
  heightMax: number;
  commercialRatio: number;
  officeShare: number;
  pitchedRoofProb: number;
  lotCoverage: number;
  parcelScale: number;
  nightActivityPeak: number;
}

export const TOKYO_DISTRICT_ANCHORS: readonly DistrictAnchor[] = [
  {
    id: 'marunouchi-otemachi',
    typology: 'cbd_highrise',
    x: -180,
    z: -120,
    radiusM: 1250,
    weight: 1.4,
    heightMax: 145,
    commercialRatio: 0.94,
    officeShare: 0.78,
    pitchedRoofProb: 0.0,
    lotCoverage: 0.72,
    parcelScale: 1.45,
    nightActivityPeak: 1.25,
  },
  {
    id: 'nishi-shinjuku',
    typology: 'cbd_highrise',
    x: -6400,
    z: -950,
    radiusM: 1150,
    weight: 1.35,
    heightMax: 150,
    commercialRatio: 0.92,
    officeShare: 0.76,
    pitchedRoofProb: 0.02,
    lotCoverage: 0.68,
    parcelScale: 1.42,
    nightActivityPeak: 1.28,
  },
  {
    id: 'ginza-nihonbashi',
    typology: 'commercial_hub',
    x: 420,
    z: 880,
    radiusM: 1200,
    weight: 1.15,
    heightMax: 72,
    commercialRatio: 0.9,
    officeShare: 0.45,
    pitchedRoofProb: 0.02,
    lotCoverage: 0.78,
    parcelScale: 1.12,
    nightActivityPeak: 1.3,
  },
  {
    id: 'shibuya-hub',
    typology: 'commercial_hub',
    x: -5920,
    z: 2540,
    radiusM: 1150,
    weight: 1.25,
    heightMax: 95,
    commercialRatio: 0.88,
    officeShare: 0.42,
    pitchedRoofProb: 0.03,
    lotCoverage: 0.76,
    parcelScale: 1.15,
    nightActivityPeak: 1.35,
  },
  {
    id: 'ikebukuro-hub',
    typology: 'commercial_hub',
    x: -5080,
    z: -5350,
    radiusM: 1100,
    weight: 1.2,
    heightMax: 88,
    commercialRatio: 0.85,
    officeShare: 0.4,
    pitchedRoofProb: 0.04,
    lotCoverage: 0.74,
    parcelScale: 1.12,
    nightActivityPeak: 1.28,
  },
  {
    id: 'roppongi-toranomon',
    typology: 'cbd_highrise',
    x: -3250,
    z: 2050,
    radiusM: 1200,
    weight: 1.15,
    heightMax: 120,
    commercialRatio: 0.84,
    officeShare: 0.66,
    pitchedRoofProb: 0.02,
    lotCoverage: 0.66,
    parcelScale: 1.3,
    nightActivityPeak: 1.22,
  },
  {
    id: 'shinagawa-konan',
    typology: 'cbd_highrise',
    x: -2380,
    z: 5820,
    radiusM: 1100,
    weight: 1.1,
    heightMax: 110,
    commercialRatio: 0.82,
    officeShare: 0.68,
    pitchedRoofProb: 0.02,
    lotCoverage: 0.62,
    parcelScale: 1.34,
    nightActivityPeak: 1.1,
  },
  {
    id: 'ueno-akihabara',
    typology: 'commercial_hub',
    x: 820,
    z: -2450,
    radiusM: 1350,
    weight: 1.0,
    heightMax: 52,
    commercialRatio: 0.78,
    officeShare: 0.38,
    pitchedRoofProb: 0.08,
    lotCoverage: 0.74,
    parcelScale: 1.05,
    nightActivityPeak: 1.16,
  },
  {
    id: 'oi-bayfront-industrial',
    typology: 'industrial_bayfront',
    x: -400,
    z: 8200,
    radiusM: 2800,
    weight: 1.15,
    heightMax: 24,
    commercialRatio: 0.7,
    officeShare: 0.2,
    pitchedRoofProb: 0.05,
    lotCoverage: 0.42,
    parcelScale: 1.65,
    nightActivityPeak: 0.62,
  },
  {
    id: 'shinkiba-industrial',
    typology: 'industrial_bayfront',
    x: 5000,
    z: 4000,
    radiusM: 1900,
    weight: 1.05,
    heightMax: 22,
    commercialRatio: 0.72,
    officeShare: 0.22,
    pitchedRoofProb: 0.05,
    lotCoverage: 0.44,
    parcelScale: 1.6,
    nightActivityPeak: 0.6,
  },
  {
    id: 'setagaya-suginami-west',
    typology: 'residential_lowrise',
    x: -10200,
    z: 1800,
    radiusM: 4800,
    weight: 1.1,
    heightMax: 14,
    commercialRatio: 0.14,
    officeShare: 0.06,
    pitchedRoofProb: 0.74,
    lotCoverage: 0.48,
    parcelScale: 0.78,
    nightActivityPeak: 0.72,
  },
  {
    id: 'nerima-itabash-nw',
    typology: 'residential_lowrise',
    x: -9400,
    z: -6200,
    radiusM: 4600,
    weight: 1.0,
    heightMax: 15,
    commercialRatio: 0.16,
    officeShare: 0.06,
    pitchedRoofProb: 0.7,
    lotCoverage: 0.5,
    parcelScale: 0.8,
    nightActivityPeak: 0.7,
  },
  {
    id: 'edogawa-katsushika-east',
    typology: 'residential_lowrise',
    x: 8200,
    z: -2800,
    radiusM: 4800,
    weight: 1.0,
    heightMax: 16,
    commercialRatio: 0.18,
    officeShare: 0.08,
    pitchedRoofProb: 0.66,
    lotCoverage: 0.52,
    parcelScale: 0.82,
    nightActivityPeak: 0.72,
  },
];

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Samples a smoothly blended Tokyo District Profile at world `(x, z)` in meters.
 * Correlates real district anchors, railway station proximity, and OSM landuse blocks
 * without hard chunk-boundary jumps.
 */
export function sampleDistrictProfile(
  x: number,
  z: number,
  landuseKind?: 'commercial' | 'residential' | 'industrial' | 'railway' | null,
  nearestStationDistM = 9999,
): DistrictProfile {
  let wSum = 0.28; // baseline inner-suburban residential/mixed Tokyo weight
  let heightMaxAcc = 20 * 0.28;
  let commAcc = 0.26 * 0.28;
  let offAcc = 0.14 * 0.28;
  let pitchAcc = 0.56 * 0.28;
  let covAcc = 0.52 * 0.28;
  let scaleAcc = 0.9 * 0.28;
  let nightAcc = 0.78 * 0.28;

  let bestTypology: DistrictTypology = 'residential_lowrise';
  let bestScore = 0.28;

  for (let i = 0; i < TOKYO_DISTRICT_ANCHORS.length; i++) {
    const a = TOKYO_DISTRICT_ANCHORS[i]!;
    const d = Math.hypot(x - a.x, z - a.z);
    const normD = d / a.radiusM;
    if (normD > 2.6) continue;
    const w = a.weight * Math.exp(-normD * normD * 1.15);
    if (w < 0.01) continue;

    wSum += w;
    heightMaxAcc += a.heightMax * w;
    commAcc += a.commercialRatio * w;
    offAcc += a.officeShare * w;
    pitchAcc += a.pitchedRoofProb * w;
    covAcc += a.lotCoverage * w;
    scaleAcc += a.parcelScale * w;
    nightAcc += a.nightActivityPeak * w;

    if (w > bestScore) {
      bestScore = w;
      bestTypology = a.typology;
    }
  }

  let heightMax = heightMaxAcc / wSum;
  let commercialRatio = commAcc / wSum;
  let officeShare = offAcc / wSum;
  let pitchedRoofProb = pitchAcc / wSum;
  let lotCoverage = covAcc / wSum;
  let parcelScale = scaleAcc / wSum;
  let nightActivityPeak = nightAcc / wSum;

  // Station catchment commercial peak: smoothly ramps commercial density within 480m of any station
  const stationPeak = Math.exp(-Math.pow(nearestStationDistM / 310, 2));
  if (stationPeak > 0.08) {
    commercialRatio = clamp01(lerp(commercialRatio, Math.max(commercialRatio, 0.78), stationPeak * 0.75));
    heightMax = Math.max(heightMax, lerp(14, 42, stationPeak));
    pitchedRoofProb *= 1 - stationPeak * 0.8;
    lotCoverage = clamp01(lerp(lotCoverage, 0.72, stationPeak * 0.55));
    nightActivityPeak = lerp(nightActivityPeak, Math.max(nightActivityPeak, 1.12), stationPeak * 0.65);
    if (bestTypology === 'residential_lowrise' && stationPeak > 0.52) {
      bestTypology = 'station_catchment';
    }
  }

  // OSM Landuse override (blended, never harsh)
  if (landuseKind === 'commercial') {
    commercialRatio = clamp01(Math.max(commercialRatio, 0.82));
    pitchedRoofProb *= 0.2;
    parcelScale = Math.max(parcelScale, 1.08);
    heightMax = Math.max(heightMax, 34);
    if (bestTypology === 'residential_lowrise') bestTypology = 'commercial_hub';
  } else if (landuseKind === 'industrial') {
    bestTypology = 'industrial_bayfront';
    commercialRatio = 0.65;
    officeShare = 0.18;
    pitchedRoofProb = 0.05;
    lotCoverage = 0.42;
    parcelScale = Math.max(parcelScale, 1.55);
    heightMax = Math.min(heightMax, 24);
    nightActivityPeak = Math.min(nightActivityPeak, 0.62);
  } else if (landuseKind === 'residential') {
    commercialRatio = Math.min(commercialRatio, 0.24);
    officeShare = Math.min(officeShare, 0.12);
    pitchedRoofProb = Math.max(pitchedRoofProb, 0.52);
    heightMax = Math.min(heightMax, 24);
    if (bestTypology !== 'cbd_highrise') bestTypology = 'residential_lowrise';
  }

  // Radial density falloff from Greater Tokyo core (prevents sudden rectangular cutoff)
  const coreDist = Math.hypot(x + 2200, z - 400);
  const urbanDensityFactor = clamp01(1.0 - Math.max(0, coreDist - 8500) / 8500);

  const isResidential = bestTypology === 'residential_lowrise';
  const isIndustrial = bestTypology === 'industrial_bayfront';
  const isCbd = bestTypology === 'cbd_highrise';

  const parcelWidthMin = isIndustrial ? 18 : isCbd ? 16 : isResidential ? 8.0 : 11.5;
  const parcelWidthMax = (isIndustrial ? 34 : isCbd ? 34 : isResidential ? 15.5 : 23) * parcelScale;
  const parcelDepthMin = isIndustrial ? 14 : isCbd ? 15 : isResidential ? 7.5 : 10.5;
  const parcelDepthMax = (isIndustrial ? 26 : isCbd ? 28 : isResidential ? 13.5 : 19) * parcelScale;

  const heightMin = isCbd ? 14 : isIndustrial ? 7.5 : isResidential ? 6.2 : 9.5;
  const heightExponent = isCbd ? 1.55 : isResidential ? 1.75 : 1.45;

  const facadeWeights: FacadeMixWeights = isCbd
    ? {
        officeGlassCool: 0.34,
        officeGlassWarm: 0.28,
        commercialStone: 0.16,
        commercialMetal: 0.12,
        commercialTile: 0.04,
        concreteModern: 0.06,
        residentialBalcony: 0.0,
        residentialPlaster: 0.0,
      }
    : isIndustrial
      ? {
          officeGlassCool: 0.04,
          officeGlassWarm: 0.04,
          commercialStone: 0.08,
          commercialMetal: 0.44,
          commercialTile: 0.06,
          concreteModern: 0.34,
          residentialBalcony: 0.0,
          residentialPlaster: 0.0,
        }
      : isResidential
        ? {
            officeGlassCool: 0.0,
            officeGlassWarm: 0.02,
            commercialStone: 0.04,
            commercialMetal: 0.04,
            commercialTile: 0.14,
            concreteModern: 0.16,
            residentialBalcony: 0.24,
            residentialPlaster: 0.36,
          }
        : {
            officeGlassCool: 0.14,
            officeGlassWarm: 0.16,
            commercialStone: 0.18,
            commercialMetal: 0.18,
            commercialTile: 0.16,
            concreteModern: 0.12,
            residentialBalcony: 0.06,
            residentialPlaster: 0.0,
          };

  return {
    typology: bestTypology,
    urbanDensityFactor,
    parcelWidthMin,
    parcelWidthMax,
    parcelDepthMin,
    parcelDepthMax,
    roadSetbackM: isCbd ? 4.2 : isIndustrial ? 5.5 : isResidential ? 2.4 : 3.2,
    buildingGapM: isCbd ? 4.8 : isIndustrial ? 6.5 : isResidential ? 2.2 : 3.0,
    lotCoverage,
    courtyardVoidProb: isIndustrial ? 0.36 : isResidential ? 0.18 : isCbd ? 0.16 : 0.11,
    irregularFootprintProb: isCbd ? 0.34 : isResidential ? 0.38 : isIndustrial ? 0.18 : 0.32,
    heightMin,
    heightMax: Math.max(heightMin + 4, heightMax),
    heightExponent,
    pitchedRoofProb: clamp01(pitchedRoofProb),
    commercialRatio: clamp01(commercialRatio),
    officeShare: clamp01(officeShare),
    facadeWeights,
    nightActivityPeak,
  };
}

/**
 * Generates an organic L-shaped or notched building footprint polygon relative to `(0, 0)`
 * rotated by `angleRad`, eliminating repetitive rectangular-box appearance in urban blocks.
 */
export function buildIrregularFootprintPoly(
  w: number,
  d: number,
  angleRad: number,
  variantHash: number,
): [number, number][] {
  const hw = w * 0.5;
  const hd = d * 0.5;
  const cutW = w * (0.28 + (variantHash % 0.22));
  const cutD = d * (0.28 + ((variantHash * 7.3) % 0.24));
  const corner = Math.floor(variantHash * 4) % 4;

  let localPts: [number, number][];
  if (corner === 0) {
    // L-shape notch on NE corner
    localPts = [
      [-hw, -hd],
      [hw - cutW, -hd],
      [hw - cutW, -hd + cutD],
      [hw, -hd + cutD],
      [hw, hd],
      [-hw, hd],
    ];
  } else if (corner === 1) {
    // L-shape notch on SW corner
    localPts = [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw + cutW, hd],
      [-hw + cutW, hd - cutD],
      [-hw, hd - cutD],
    ];
  } else if (corner === 2) {
    // Stepped front setback on SE corner
    localPts = [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd - cutD],
      [hw - cutW, hd - cutD],
      [hw - cutW, hd],
      [-hw, hd],
    ];
  } else {
    // U/courtyard notch on north side
    const nw = w * 0.22;
    const nd = d * 0.24;
    localPts = [
      [-hw, -hd],
      [-nw, -hd],
      [-nw, -hd + nd],
      [nw, -hd + nd],
      [nw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ];
  }

  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  return localPts.map(([lx, lz]) => [
    Math.round((lx * cosA - lz * sinA) * 10) / 10,
    Math.round((lx * sinA + lz * cosA) * 10) / 10,
  ]);
}
