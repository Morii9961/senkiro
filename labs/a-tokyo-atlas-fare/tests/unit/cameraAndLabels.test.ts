import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildPhysicalTrackGraph } from '../../src/contracts/physicalTrackBuilder.js';
import { solveRailwayNetwork3D } from '../../src/domain/elevationSolver.js';
import { StaticAtlasProvider } from '../../src/providers/atlasProvider.js';
import { createTrainSimulationEngine } from '../../src/simulation/index.js';
import {
  createInitialCameraModeState,
  getCameraModeCapabilities,
  toCameraModeV2,
  toSession0FollowView,
  transitionCameraMode,
} from '../../src/three/camera/cameraModeStateMachine.js';
import { StreetCollisionGuard } from '../../src/three/camera/collisionGuard.js';
import {
  classifyZoomTier,
  resolveLabelLayout,
  type LabelCandidateInput,
} from '../../src/three/camera/labelLayout.js';
import { SpatialLabelRegistry } from '../../src/three/camera/labelSystem.js';

describe('Unified 5-Mode Camera State Machine & Session 0 Contract Mapping', () => {
  it('transitions cleanly across all 5 modes and preserves safe surface return state', () => {
    let s = createInitialCameraModeState();
    expect(s.mode).toBe('city_overview');
    expect(toCameraModeV2(s)).toBe('map');

    s = transitionCameraMode(s, { type: 'SELECT_MODE', mode: 'street_level' });
    expect(s.mode).toBe('street_level');
    expect(s.lastSurfaceMode).toBe('street_level');
    expect(toCameraModeV2(s)).toBe('station_focus');

    s = transitionCameraMode(s, { type: 'SELECT_MODE', mode: 'underground_cutaway' });
    expect(s.mode).toBe('underground_cutaway');
    expect(toCameraModeV2(s)).toBe('underground_inspect');

    s = transitionCameraMode(s, { type: 'SELECT_MODE', mode: 'underground_explorer' });
    expect(s.mode).toBe('underground_explorer');
    expect(s.freeLookEnabled).toBe(true);
    expect(toCameraModeV2(s)).toBe('underground_inspect');

    // One-click Return to Surface restores prior surface mode cleanly
    s = transitionCameraMode(s, { type: 'RETURN_TO_SURFACE' });
    expect(s.mode).toBe('street_level');
    expect(s.freeLookEnabled).toBe(false);
    expect(s.cutaway.groundOpacity).toBe(1.0);
    expect(s.cutaway.clipEnabled).toBe(false);
  });

  it('refuses train_follow without a trainId and maps rigs cleanly to CameraModeV2 / TrainFollowView', () => {
    let s = createInitialCameraModeState();
    const blocked = transitionCameraMode(s, { type: 'SELECT_MODE', mode: 'train_follow' });
    expect(blocked.mode).toBe('city_overview');

    s = transitionCameraMode(s, { type: 'SELECT_MODE', mode: 'underground_cutaway' });
    s = transitionCameraMode(s, {
      type: 'FOLLOW_TRAIN',
      trainId: 'sim-ginza-1',
      angle: 'front',
    });
    expect(s.mode).toBe('train_follow');
    expect(s.followedTrainId).toBe('sim-ginza-1');
    expect(toCameraModeV2(s)).toBe('follow_train');
    expect(toSession0FollowView(s.followAngle)).toBe('chase');

    s = transitionCameraMode(s, { type: 'SET_FOLLOW_ANGLE', angle: 'cab' });
    expect(toCameraModeV2(s)).toBe('cab_ride');
    expect(toSession0FollowView(s.followAngle)).toBe('cab');

    s = transitionCameraMode(s, { type: 'EXIT_TRAIN_FOLLOW' });
    expect(s.mode).toBe('underground_cutaway');

    s = transitionCameraMode(s, { type: 'RESET_OVERVIEW' });
    expect(s.mode).toBe('city_overview');
    expect(s.followedTrainId).toBeNull();
    expect(s.freeLookEnabled).toBe(false);
  });

  it('computes safe near planes, cutaway activation & tunnel bounds per mode', () => {
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
    expect(expCaps.nearPlaneMin).toBeLessThanOrEqual(0.25);

    s = transitionCameraMode(s, {
      type: 'FOLLOW_TRAIN',
      trainId: 'sim-oedo-1',
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

  it('prevents dense overlapping text while prioritizing selected entities and respecting safe margins', () => {
    const candidates: LabelCandidateInput[] = [
      {
        id: 'st-low',
        kind: 'station',
        textPrimary: '駅A',
        isUnderground: false,
        isMajorHub: false,
        priority: 40,
        screenX: 600,
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
        screenX: 602,
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
        screenX: 604,
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
        screenX: 606,
        screenY: 404,
        distanceM: 415,
      },
      {
        id: 'st-overlap-3',
        kind: 'facility',
        textPrimary: '出口1',
        isUnderground: false,
        priority: 15,
        screenX: 605,
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

    expect(placed.some((p) => p.id === 'st-selected' && p.highlighted)).toBe(true);
    expect(placed.length).toBeLessThanOrEqual(3);

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

  it('projects real VirtualTrainSimulationEngine SimulatedTrainState labels with synthetic honesty', async () => {
    const provider = new StaticAtlasProvider();
    const dataset = provider.getAtlasDataset();
    const osm = await provider.loadOsmVerticalOverlay();
    const solved = solveRailwayNetwork3D(dataset, osm);
    const graph = buildPhysicalTrackGraph(dataset, solved);

    const engine = createTrainSimulationEngine();
    engine.initialize(graph, dataset, { autoStart: true, density: 'normal' });
    const trains = engine.step(0.25, 1.0);
    expect(trains.length).toBeGreaterThan(0);

    const reg = new SpatialLabelRegistry(dataset, solved);
    const camera = new THREE.PerspectiveCamera(46, 1280 / 800, 4, 40_000);
    const first = trains[0]!;
    camera.position.set(first.headPose.x + 250, first.headPose.y + 320, first.headPose.z + 250);
    camera.lookAt(first.headPose.x, first.headPose.y, first.headPose.z);
    camera.updateMatrixWorld();

    const visibleOps = new Set(dataset.operators.map((o) => o.id));
    const labels = reg.computeVisibleLabels({
      camera,
      mode: first.isUnderground ? 'underground_cutaway' : 'city_overview',
      locale: 'en',
      viewportWidth: 1280,
      viewportHeight: 800,
      cameraDistanceM: 420,
      verticalExaggeration: 1.0,
      cutawayCenterX: first.headPose.x,
      cutawayCenterZ: first.headPose.z,
      cutawayRadiusM: 1200,
      visibleOperatorIds: visibleOps,
      selectedStationId: null,
      selectedLineId: null,
      selectedTrainId: first.trainId,
      trains,
      trainsVisible: true,
    });

    const selectedTrainLabel = labels.find((l) => l.entityId === first.trainId);
    expect(selectedTrainLabel).toBeTruthy();
    expect(selectedTrainLabel!.badge).toContain('SIM');
  });

  it('merges multi-line stations like Shinjuku into a single pill with surface and subway line badges', async () => {
    const provider = new StaticAtlasProvider();
    const dataset = provider.getAtlasDataset();
    const osm = await provider.loadOsmVerticalOverlay();
    const solved = solveRailwayNetwork3D(dataset, osm);
    const reg = new SpatialLabelRegistry(dataset, solved);

    const shinjukuNode = solved.stationNodes.find((n) => n.nameJa === '新宿')!;
    const camera = new THREE.PerspectiveCamera(46, 1440 / 860, 4, 40_000);
    camera.position.set(shinjukuNode.x + 260, 420, shinjukuNode.z + 320);
    camera.lookAt(shinjukuNode.x, 0, shinjukuNode.z);
    camera.updateMatrixWorld();

    const visibleOps = new Set(dataset.operators.map((o) => o.id));
    const labels = reg.computeVisibleLabels({
      camera,
      mode: 'city_overview',
      locale: 'zh',
      viewportWidth: 1440,
      viewportHeight: 860,
      cameraDistanceM: 520,
      verticalExaggeration: 1.0,
      cutawayCenterX: shinjukuNode.x,
      cutawayCenterZ: shinjukuNode.z,
      cutawayRadiusM: 850,
      visibleOperatorIds: visibleOps,
      selectedStationId: null,
      selectedLineId: null,
      selectedTrainId: null,
      trains: [],
      trainsVisible: false,
    });

    const shinjukuLabels = labels.filter((l) => l.kind === 'station' && l.textPrimary === '新宿');
    expect(shinjukuLabels.length).toBe(1);
    const badges = shinjukuLabels[0]!.lineBadges ?? [];
    expect(badges.length).toBeGreaterThanOrEqual(5);
    expect(badges.some((b) => !b.isSubway)).toBe(true);
    expect(badges.some((b) => b.isSubway)).toBe(true);
  });
});

describe('StreetCollisionGuard Surface & Building Clearance', () => {
  it('pushes camera out of OBB building footprints and clamps floor altitude', () => {
    const guard = new StreetCollisionGuard();
    guard.addBuildingBoxes([{ cx: 100, cz: 200, w: 40, d: 30, a: 0, h: 90 }]);

    const inside = guard.resolveCameraPosition({ x: 102, y: 20, z: 201 }, 4.5, false, 4.5);
    expect(inside.collided).toBe(true);
    expect(Math.abs(inside.x - 100) >= 24.4 || Math.abs(inside.z - 200) >= 19.4).toBe(true);

    const belowGround = guard.resolveCameraPosition({ x: 0, y: -3, z: 0 }, 4.5, false, 4.5);
    expect(belowGround.collided).toBe(true);
    expect(belowGround.y).toBe(4.5);
  });
});
