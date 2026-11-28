import type { SourceRecord, TrackVerticalLayer } from '@senkiro/contracts';
import { describe, expect, it } from 'vitest';
import {
  classifyStructure,
  classifyTier,
  type ElevationSolverConfig,
  type SchematicTier,
  type SolvedRailwayNetwork3D,
  solveRailwayNetwork3D,
} from '../src/index.ts';
import { buildTestville, cx, line, SYNTHETIC_SOURCE_ID, segIdOf, st } from './fixtures.ts';

const graph = buildTestville();

const config: ElevationSolverConfig = {
  origin: { lon: 10.02, lat: 50.01, label: 'Testville centre (synthetic)' },
  lineProfiles: {
    [line('alpha-main')]: { baseY: 0, priority: 8 },
    [line('alpha-loop')]: { baseY: 0, priority: 6, lateralOffsetM: 6 },
    [line('beta-metro')]: { baseY: -3, priority: 4 },
  },
  stationOverrides: [
    { lineId: line('beta-metro'), stationId: st('b1'), y: 0, sourceIds: [SYNTHETIC_SOURCE_ID] },
    {
      lineId: line('alpha-shinkansen'),
      stationId: st('s1'),
      y: 10,
      sourceIds: [SYNTHETIC_SOURCE_ID],
    },
  ],
  majorHubStationIds: new Set([st('a3')]),
};

const solved = solveRailwayNetwork3D(graph, null, config);

const node = (result: SolvedRailwayNetwork3D, lineSlug: string, stationSlug: string) => {
  const found = result.stationNodes.find(
    (n) => n.lineId === line(lineSlug) && n.stationId === st(stationSlug),
  );
  if (found === undefined) {
    throw new Error(`no node ${lineSlug}/${stationSlug}`);
  }
  return found;
};

describe('solveRailwayNetwork3D — geometry & continuity', () => {
  it('solves every segment into finite 3D polylines', () => {
    expect(solved.segments).toHaveLength(graph.segments.length);
    expect(solved.skippedSegmentIds).toEqual([]);
    for (const segment of solved.segments) {
      expect(segment.points.length).toBeGreaterThanOrEqual(2);
      for (const p of segment.points) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
      }
    }
  });

  it('keeps C0 continuity: segments meeting at a (line, station) node share its height', () => {
    for (const segment of solved.segments) {
      const first = segment.points[0];
      const last = segment.points[segment.points.length - 1];
      const startNode = node(
        solved,
        segment.primaryLineId.split(':')[3] ?? '',
        segment.fromStationId.split(':')[3] ?? '',
      );
      const endNode = node(
        solved,
        segment.primaryLineId.split(':')[3] ?? '',
        segment.toStationId.split(':')[3] ?? '',
      );
      expect(first?.y).toBe(startNode.y);
      expect(last?.y).toBe(endNode.y);
    }
  });

  it('projection origin moves x/z but never heights (no city is baked in)', () => {
    const elsewhere = solveRailwayNetwork3D(graph, null, {
      ...config,
      origin: { lon: 9.9, lat: 50.2, label: 'elsewhere' },
    });
    expect(elsewhere.segments.map((s) => s.maxY)).toEqual(solved.segments.map((s) => s.maxY));
    expect(elsewhere.segments[0]?.points[0]?.x).not.toBe(solved.segments[0]?.points[0]?.x);
  });

  it('coarse sampling applies outside detail bounds only', () => {
    const coarse = solveRailwayNetwork3D(graph, null, {
      ...config,
      sampling: { detailBounds: [0, 0, 1, 1] },
    });
    const fine = solved.segments.find((s) => s.segmentId === segIdOf('b2', 'b3'));
    const rough = coarse.segments.find((s) => s.segmentId === segIdOf('b2', 'b3'));
    expect((rough?.points.length ?? 0) < (fine?.points.length ?? 0)).toBe(true);
  });
});

describe('solveRailwayNetwork3D — verified overrides, stacking and connectors', () => {
  it('applies cited per-station overrides as manual-verified-relative', () => {
    const s1 = node(solved, 'alpha-shinkansen', 's1');
    expect(s1.y).toBe(10);
    expect(s1.heightBasis).toBe('manual-verified-relative');
    expect(s1.heightSourceIds).toEqual([SYNTHETIC_SOURCE_ID]);
    const s4 = node(solved, 'alpha-shinkansen', 's4');
    expect(s4.y).toBe(18);
    expect(s4.heightBasis).toBe('inferred-schematic');
  });

  it('stacks the levels of a complex and links them with vertical connectors', () => {
    expect(node(solved, 'alpha-shinkansen', 's1').y).toBeGreaterThan(
      node(solved, 'alpha-main', 'a1').y,
    );
    const connector = solved.transferConnectors.find((c) => c.complexId === cx('one'));
    expect(connector?.fromStationId).toBe(st('s1'));
    expect(connector?.toStationId).toBe(st('a1'));
    expect(connector?.gateType).toBe('in_gate');
  });

  it('flags hubs from config or from multiple serving lines', () => {
    expect(node(solved, 'alpha-main', 'a3').isMajorHub).toBe(true);
    expect(node(solved, 'alpha-main', 'a2').isMajorHub).toBe(true);
    expect(node(solved, 'alpha-main', 'a1').isMajorHub).toBe(false);
  });

  it('creates tunnel portals where a line leaves the surface', () => {
    const b1b2 = solved.segments.find((s) => s.segmentId === segIdOf('b1', 'b2'));
    expect(b1b2?.portals.length).toBeGreaterThanOrEqual(1);
    expect(b1b2?.portals[0]?.tunnelKind).toBe('tunnel_box');
    expect(b1b2?.portals[0]?.y).toBe(-1.5);
  });
});

describe('solveRailwayNetwork3D — vertical deconfliction at non-junction crossings', () => {
  it('separates the shallow metro from the trunk line by at least minClearance', () => {
    const crossing = solved.crossings.find(
      (c) => c.segmentA === segIdOf('a2', 'a3') && c.segmentB === segIdOf('b2', 'b3'),
    );
    expect(crossing).toBeDefined();
    expect(crossing?.wasAdjusted).toBe(true);
    expect(crossing?.clearance).toBeGreaterThanOrEqual(6.5);
    // The higher-priority trunk keeps its height; the metro ducks under it.
    expect(crossing?.yA).toBe(0);
    expect(crossing?.yB ?? 0).toBeLessThan(-6);
    for (const c of solved.crossings) {
      expect(c.clearance).toBeGreaterThanOrEqual(6.5);
    }
  });

  it('deconfliction never moves segment endpoints (C0 preserved)', () => {
    const b2b3 = solved.segments.find((s) => s.segmentId === segIdOf('b2', 'b3'));
    expect(b2b3?.deconflictedCrossings).toBeGreaterThanOrEqual(1);
    expect(b2b3?.points[0]?.y).toBe(-3);
    expect(b2b3?.points[(b2b3?.points.length ?? 1) - 1]?.y).toBe(-3);
    expect(b2b3?.minY ?? 0).toBeLessThan(-6);
  });
});

describe('solveRailwayNetwork3D — ODbL vertical layer stays traceable', () => {
  const osmSource: SourceRecord = {
    id: 'sk:source:jp:testville-osm',
    title: 'synthetic share-alike layer',
    publisher: 'tests',
    url: null,
    retrievedAt: '2026-11-28',
    sourceDate: null,
    license: 'ODbL-1.0',
    licenseUrl: null,
    commercialUse: 'yes',
    redistribution: 'yes',
    shareAlike: true,
    attributionText: 'synthetic',
    notes: '',
  };
  const layer: TrackVerticalLayer = {
    sources: [osmSource],
    attributes: [
      {
        trackSegmentId: segIdOf('a3', 'a4'),
        verticalClass: 'elevated',
        verticalOrder: null,
        elevationM: null,
        provenance: { sourceIds: [osmSource.id], dataNature: 'derived', lastVerifiedAt: null },
      },
    ],
  };

  it('derives schematic heights from evidence and reports the share-alike sources used', () => {
    const withLayer = solveRailwayNetwork3D(graph, layer, config);
    const a4 = node(withLayer, 'alpha-main', 'a4');
    expect(a4.y).toBe(9);
    expect(a4.heightBasis).toBe('osm-derived-schematic');
    expect(withLayer.shareAlikeSourceIds).toEqual([osmSource.id]);
    expect(solved.shareAlikeSourceIds).toEqual([]);
  });
});

describe('tier & structure classification are configurable', () => {
  it('classifies with the default seven-tier ladder', () => {
    expect(classifyTier(18)).toBe('L+2');
    expect(classifyTier(4)).toBe('L+1');
    expect(classifyTier(-5)).toBe('L-1');
    expect(classifyTier(-50)).toBe('L-4');
  });

  it('accepts a custom ladder for another city', () => {
    const ladder: SchematicTier[] = [
      { id: 'UP', labelJa: '上', labelEn: 'up', nominalY: 8, floorY: 4, floorInclusive: true },
      {
        id: 'GROUND',
        labelJa: '地上',
        labelEn: 'ground',
        nominalY: 0,
        floorY: -4,
        floorInclusive: false,
      },
      {
        id: 'DEEP',
        labelJa: '地下',
        labelEn: 'deep',
        nominalY: -20,
        floorY: Number.NEGATIVE_INFINITY,
        floorInclusive: true,
      },
    ];
    expect(classifyTier(5, ladder)).toBe('UP');
    expect(classifyTier(-4, ladder)).toBe('DEEP');
    const custom = solveRailwayNetwork3D(graph, null, { ...config, tiers: ladder });
    expect(Object.keys(custom.tierCounts).sort()).toEqual(['DEEP', 'GROUND', 'UP']);
  });

  it('honours per-line tunnel methods instead of hard-coded line lists', () => {
    expect(classifyStructure(-10)).toBe('tunnel_box');
    expect(classifyStructure(-10, 'shield')).toBe('tunnel_shield');
    expect(classifyStructure(-30)).toBe('tunnel_shield');
    const shield = solveRailwayNetwork3D(graph, null, {
      ...config,
      lineProfiles: {
        ...config.lineProfiles,
        [line('beta-metro')]: { baseY: -3, priority: 4, tunnelMethod: 'shield' },
      },
    });
    expect(node(shield, 'beta-metro', 'b2').structure).toBe('tunnel_shield');
  });
});
