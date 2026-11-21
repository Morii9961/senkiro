import { describe, expect, it } from 'vitest';
import { solveRailwayNetwork3D } from '../../src/domain/elevationSolver.js';
import { StaticAtlasProvider } from '../../src/providers/atlasProvider.js';

const provider = new StaticAtlasProvider();
const dataset = provider.getAtlasDataset();

describe('3D Vertical Railway Network Solver (Spatial Consistency & Hub Verification)', async () => {
  const osmVertical = await provider.loadOsmVerticalOverlay();
  const solved = solveRailwayNetwork3D(dataset, osmVertical);

  it('solves all TrackSegments into continuous 3D polylines without NaN or empty geometry', () => {
    expect(solved.segments.length).toBe(dataset.trackSegments.length);
    for (const seg of solved.segments) {
      expect(seg.points.length).toBeGreaterThanOrEqual(2);
      for (const pt of seg.points) {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
        expect(Number.isFinite(pt.z)).toBe(true);
      }
    }
  });

  it('verifies Section 5.1 Shibuya multi-level stack: Ginza 3F (+14) > JR Yamanote > Hanzomon > Fukutoshin', () => {
    const atShibuya = (lineId: string) =>
      solved.stationNodes.find((n) => n.lineId === lineId && n.nameJa === '渋谷');

    const ginza = atShibuya('sk:line:metro-ginza');
    const yamanote = atShibuya('sk:line:jr-east-yamanote');
    const inokashira = atShibuya('sk:line:keio-inokashira');
    const hanzomon = atShibuya('sk:line:metro-hanzomon');
    const fukutoshin = atShibuya('sk:line:metro-fukutoshin');
    const toyoko = atShibuya('sk:line:tokyu-toyoko');

    expect(ginza).toBeDefined();
    expect(yamanote).toBeDefined();
    expect(inokashira).toBeDefined();
    expect(hanzomon).toBeDefined();
    expect(fukutoshin).toBeDefined();
    expect(toyoko).toBeDefined();

    // Ginza Line Shibuya 3F sits clearly above ground & JR Yamanote
    expect(ginza!.y).toBeGreaterThanOrEqual(12);
    expect(ginza!.structure).toBe('viaduct');
    expect(ginza!.y).toBeGreaterThan(inokashira!.y);
    expect(inokashira!.y).toBeGreaterThan(yamanote!.y);
    expect(yamanote!.y).toBeGreaterThan(hanzomon!.y);
    expect(hanzomon!.y).toBeGreaterThan(fukutoshin!.y);
    // Through-running Fukutoshin & Toyoko match elevation at Shibuya
    expect(fukutoshin!.y).toBe(toyoko!.y);
  });

  it('verifies Section 5.2 Shinjuku multi-level stack: Seibu > JR Surface > Keio > Marunouchi > Toei Shinjuku > Toei Oedo', () => {
    const atShinjuku = (lineId: string, name = '新宿') =>
      solved.stationNodes.find((n) => n.lineId === lineId && n.nameJa === name);

    const seibu = atShinjuku('sk:line:seibu-shinjuku', '西武新宿');
    const jrYamanote = atShinjuku('sk:line:jr-east-yamanote');
    const marunouchi = atShinjuku('sk:line:metro-marunouchi');
    const toeiShinjuku = atShinjuku('sk:line:toei-shinjuku');
    const toeiOedo = atShinjuku('sk:line:toei-oedo');

    expect(seibu!.y).toBeGreaterThan(jrYamanote!.y);
    expect(jrYamanote!.y).toBe(0);
    expect(jrYamanote!.y).toBeGreaterThan(marunouchi!.y);
    expect(marunouchi!.y).toBeGreaterThan(toeiShinjuku!.y);
    expect(toeiShinjuku!.y).toBeGreaterThan(toeiOedo!.y);
    expect(toeiOedo!.structure).toBe('tunnel_shield');
  });

  it('verifies Section 5.3 Tokyo & Otemachi multi-level stack: Chuo Elevated > Shinkansen > Tokaido > Marunouchi > Otemachi deep lines', () => {
    const findNode = (lineId: string, name: string) =>
      solved.stationNodes.find((n) => n.lineId === lineId && n.nameJa === name);

    const chuo = findNode('sk:line:jr-east-chuo', '東京');
    const shink = findNode('sk:line:jr-central-tokaido-shinkansen', '東京');
    const tokaido = findNode('sk:line:jr-east-tokaido', '東京');
    const marunouchiTokyo = findNode('sk:line:metro-marunouchi', '東京');
    const tozaiOte = findNode('sk:line:metro-tozai', '大手町');
    const hanzomonOte = findNode('sk:line:metro-hanzomon', '大手町');

    expect(chuo!.y).toBeGreaterThan(shink!.y);
    expect(shink!.y).toBeGreaterThan(tokaido!.y);
    expect(tokaido!.y).toBeGreaterThan(marunouchiTokyo!.y);
    expect(marunouchiTokyo!.y).toBeGreaterThan(tozaiOte!.y);
    expect(tozaiOte!.y).toBeGreaterThan(hanzomonOte!.y);
  });

  it('maintains C0 elevation continuity along each RailLine across consecutive segments', () => {
    const segsByLine = new Map<string, typeof solved.segments>();
    for (const s of solved.segments) {
      if (!segsByLine.has(s.primaryLineId)) segsByLine.set(s.primaryLineId, []);
      segsByLine.get(s.primaryLineId)!.push(s);
    }

    for (const [lineId, segs] of segsByLine.entries()) {
      const stationYSeen = new Map<string, number>();
      for (const seg of segs) {
        const y0 = seg.points[0]!.y;
        const y1 = seg.points[seg.points.length - 1]!.y;
        if (stationYSeen.has(seg.fromStationId)) {
          expect(Math.abs(stationYSeen.get(seg.fromStationId)! - y0)).toBeLessThan(0.05);
        } else {
          stationYSeen.set(seg.fromStationId, y0);
        }
        if (stationYSeen.has(seg.toStationId)) {
          expect(Math.abs(stationYSeen.get(seg.toStationId)! - y1)).toBeLessThan(0.05);
        } else {
          stationYSeen.set(seg.toStationId, y1);
        }
      }
      expect(lineId.startsWith('sk:line:')).toBe(true);
    }
  });

  it('generates smooth tunnel-to-surface portals (e.g., Ginza Shibuya & Marunouchi Ochanomizu) and vertical complex connectors', () => {
    const allPortals = solved.segments.flatMap((s) => s.portals);
    expect(allPortals.length).toBeGreaterThan(5);
    expect(allPortals.some((p) => p.lineId === 'sk:line:metro-ginza')).toBe(true);
    expect(allPortals.some((p) => p.lineId === 'sk:line:metro-marunouchi')).toBe(true);
    expect(solved.transferConnectors.length).toBeGreaterThan(20);
  });

  it('enforces vertical clearance at non-junction 2D crossings without vertical collisions', () => {
    expect(solved.crossings.length).toBeGreaterThan(5);
    for (const c of solved.crossings) {
      expect(c.clearance).toBeGreaterThanOrEqual(5.5);
    }
  });
});
