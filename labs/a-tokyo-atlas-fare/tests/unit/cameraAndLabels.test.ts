import { describe, expect, it } from 'vitest';
import {
  createInitialCameraModeState,
  getCameraModeCapabilities,
  transitionCameraMode,
} from '../../src/domain/cameraModeStateMachine.js';
import {
  classifyZoomTier,
  resolveLabelLayout,
  type LabelCandidateInput,
} from '../../src/domain/labelLayout.js';
import { solveRailwayNetwork3D } from '../../src/domain/elevationSolver.js';
import { StaticAtlasProvider } from '../../src/providers/atlasProvider.js';
import { SyntheticTrainSimulationProvider } from '../../src/three/uxContracts.js';

describe('Unified 5-Mode Camera State Machine', () => {
  it('transitions cleanly across all 5 modes and preserves surface return mode', () => {
    let s = createInitialCameraModeState();
    expect(s.mode).toBe('city_overview');

    s = transitionCameraMode(s, { type: 'SELECT_MODE', mode: 'street_level' });
    expect(s.mode).toBe('street_level');
    expect(s.lastSurfaceMode).toBe('street_level');

    s = transitionCameraMode(s, { type: 'SELECT_MODE', mode: 'underground_cutaway' });
    expect(s.mode).toBe('underground_cutaway');
    expect(s.lastSurfaceMode).toBe('street_level');

    s = transitionCameraMode(s, { type: 'SELECT_MODE', mode: 'underground_explorer' });
    expect(s.mode).toBe('underground_explorer');
    expect(s.freeLookEnabled).toBe(true);

    // One-click Return to Surface restores street_level and disables cutaway/freeLook
    s = transitionCameraMode(s, { type: 'RETURN_TO_SURFACE' });
    expect(s.mode).toBe('street_level');
    expect(s.freeLookEnabled).toBe(false);
    expect(s.cutaway.groundOpacity).toBe(1.0);
    expect(s.cutaway.clipEnabled).toBe(false);
  });

  it('refuses train_follow without a trainId and safely exits train_follow to prior mode', () => {
    let s = createInitialCameraModeState();
    const blocked = transitionCameraMode(s, { type: 'SELECT_MODE', mode: 'train_follow' });
    expect(blocked.mode).toBe('city_overview');

    s = transitionCameraMode(s, { type: 'SELECT_MODE', mode: 'underground_cutaway' });
    s = transitionCameraMode(s, {
      type: 'FOLLOW_TRAIN',
      trainId: 'sim:train:ginza-1',
      angle: 'front',
    });
    expect(s.mode).toBe('train_follow');
    expect(s.followedTrainId).toBe('sim:train:ginza-1');
    expect(s.followAngle).toBe('front');

    s = transitionCameraMode(s, { type: 'SET_FOLLOW_ANGLE', angle: 'cab' });
    expect(s.followAngle).toBe('cab');

    s = transitionCameraMode(s, { type: 'EXIT_TRAIN_FOLLOW' });
    expect(s.mode).toBe('underground_cutaway');

    // Reset Overview from any mode returns cleanly to city_overview
    s = transitionCameraMode(s, { type: 'RESET_OVERVIEW' });
    expect(s.mode).toBe('city_overview');
    expect(s.followedTrainId).toBeNull();
    expect(s.freeLookEnabled).toBe(false);
  });

  it('computes safe near planes, tunnel occlusion & cutaway capabilities per mode', () => {
    let s = createInitialCameraModeState();
    expect(getCameraModeCapabilities(s).allowUndergroundGeometry).toBe(false);
    expect(getCameraModeCapabilities(s).nearPlaneMin).toBeGreaterThanOrEqual(3);

    s = transitionCameraMode(s, { type: 'SELECT_MODE', mode: 'street_level' });
    expect(getCameraModeCapabilities(s).nearPlaneMin).toBeLessThanOrEqual(0.5);
    expect(getCameraModeCapabilities(s).minCameraY).toBeGreaterThan(0);

    s = transitionCameraMode(s, { type: 'SELECT_MODE', mode: 'underground_explorer' });
    const expCaps = getCameraModeCapabilities(s);
    expect(expCaps.useExplorerSolidTunnels).toBe(true);
    expect(expCaps.enableSurfaceCeilingOcclusion).toBe(true);
    expect(expCaps.useRadialCutaway).toBe(false);
    expect(expCaps.nearPlaneMin).toBeLessThanOrEqual(0.5);

    s = transitionCameraMode(s, {
      type: 'FOLLOW_TRAIN',
      trainId: 'sim:train:oedo-1',
      angle: 'side',
    });
    const sideUgCaps = getCameraModeCapabilities(s, true);
    expect(sideUgCaps.useRadialCutaway).toBe(true);
    expect(sideUgCaps.allowUndergroundGeometry).toBe(true);
  });
});

describe('Hierarchical Screen-Space Label Layout & Deconfliction', () => {
  it('classifies zoom tiers accurately across camera modes and distances', () => {
    expect(classifyZoomTier('city_overview', 5000)).toBe('overview');
    expect(classifyZoomTier('city_overview', 1400)).toBe('mid');
    expect(classifyZoomTier('city_overview', 450)).toBe('close');
    expect(classifyZoomTier('street_level', 1200)).toBe('close');
    expect(classifyZoomTier('underground_cutaway', 1000)).toBe('underground');
    expect(classifyZoomTier('underground_explorer', 300)).toBe('underground');
  });

  it('prevents dense overlapping text at the same screen location while prioritizing selected items', () => {
    const candidates: LabelCandidateInput[] = [
      {
        id: 'st-low',
        kind: 'station',
        textPrimary: '駅A',
        isUnderground: false,
        isMajorHub: false,
        priority: 40,
        screenX: 500,
        screenY: 400,
        distanceM: 400,
      },
      {
        id: 'st-selected',
        kind: 'station',
        textPrimary: '渋谷駅 (選択中)',
        isUnderground: false,
        isMajorHub: true,
        isSelected: true,
        priority: 50,
        screenX: 502,
        screenY: 402,
        distanceM: 420,
      },
      {
        id: 'st-overlap-1',
        kind: 'station',
        textPrimary: '駅B',
        isUnderground: false,
        isMajorHub: false,
        priority: 30,
        screenX: 504,
        screenY: 401,
        distanceM: 410,
      },
      {
        id: 'st-overlap-2',
        kind: 'station',
        textPrimary: '駅C',
        isUnderground: false,
        isMajorHub: false,
        priority: 25,
        screenX: 506,
        screenY: 404,
        distanceM: 415,
      },
      {
        id: 'st-overlap-3',
        kind: 'facility',
        textPrimary: '出口1',
        isUnderground: false,
        priority: 15,
        screenX: 505,
        screenY: 403,
        distanceM: 405,
      },
    ];

    const placed = resolveLabelLayout(candidates, {
      mode: 'street_level',
      cameraDistanceM: 320,
      viewportWidth: 1280,
      viewportHeight: 800,
      minGapPx: 8,
    });

    // Selected label must always win placement
    expect(placed.some((p) => p.id === 'st-selected' && p.highlighted)).toBe(true);
    // Cell density limiter (max 2 per 220x120 cell) prevents piling all 5 labels in one spot
    expect(placed.length).toBeLessThanOrEqual(3);

    // Assert zero bounding-box overlaps among ALL placed labels!
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!;
        const b = placed[j]!;
        const separated =
          a.boxX + a.width + 8 <= b.boxX ||
          b.boxX + b.width + 8 <= a.boxX ||
          a.boxY + a.height + 8 <= b.boxY ||
          b.boxY + b.height + 8 <= a.boxY;
        expect(separated).toBe(true);
      }
    }
  });

  it('hides underground labels in surface overview and shows them in underground cutaway/explorer', () => {
    const candidates: LabelCandidateInput[] = [
      {
        id: 'hub-shibuya',
        kind: 'hub',
        textPrimary: '渋谷',
        isUnderground: false,
        isMajorHub: true,
        priority: 200,
        screenX: 600,
        screenY: 360,
        distanceM: 3000,
        cutawayDistM: 120,
      },
      {
        id: 'ug-fukutoshin',
        kind: 'tunnel',
        textPrimary: '副都心線',
        badge: 'L-3',
        isUnderground: true,
        lineId: 'sk:line:metro-fukutoshin',
        priority: 120,
        screenX: 600,
        screenY: 440,
        distanceM: 900,
        cutawayDistM: 180,
      },
    ];

    const surfacePlaced = resolveLabelLayout(candidates, {
      mode: 'city_overview',
      cameraDistanceM: 3500,
      viewportWidth: 1280,
      viewportHeight: 800,
    });
    expect(surfacePlaced.map((p) => p.id)).toEqual(['hub-shibuya']);

    const ugPlaced = resolveLabelLayout(candidates, {
      mode: 'underground_cutaway',
      cameraDistanceM: 900,
      viewportWidth: 1280,
      viewportHeight: 800,
      cutawayRadiusM: 850,
    });
    expect(ugPlaced.map((p) => p.id)).toContain('ug-fukutoshin');
  });
});

describe('SyntheticTrainSimulationProvider (UX Contracts & Honesty)', () => {
  it('marks all trains synthetic, computes unit curve tangents, and obeys controls', async () => {
    const provider = new StaticAtlasProvider();
    const dataset = provider.getAtlasDataset();
    const osm = await provider.loadOsmVerticalOverlay();
    const solved = solveRailwayNetwork3D(dataset, osm);

    const sim = new SyntheticTrainSimulationProvider(dataset, solved);
    expect(sim.isSynthetic).toBe(true);

    const snap0 = sim.getSnapshot();
    expect(snap0.trains.length).toBeGreaterThanOrEqual(8);
    for (const tr of snap0.trains) {
      expect(tr.isSimulated).toBe(true);
      expect(tr.dataNature).toBe('synthetic');
      const tanLen = Math.hypot(tr.tangent.x, tr.tangent.y, tr.tangent.z);
      expect(tanLen).toBeCloseTo(1, 2);
    }

    const firstId = snap0.trains[0]!.id;
    const p0 = { ...snap0.trains[0]!.position };
    sim.setSpeedMultiplier(2.0);
    sim.step(0.5);
    const p1 = sim.getTrainById(firstId)!.position;
    expect(Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z)).toBeGreaterThan(1);

    sim.setVisibleCount(4);
    expect(sim.getSnapshot().trains.length).toBe(4);

    sim.setPlaying(false);
    expect(sim.getSnapshot().trains[0]!.status).toBe('paused');

    sim.reset();
    expect(sim.getSnapshot().playing).toBe(true);
    expect(sim.getSnapshot().speedMultiplier).toBe(1.0);
  });
});
