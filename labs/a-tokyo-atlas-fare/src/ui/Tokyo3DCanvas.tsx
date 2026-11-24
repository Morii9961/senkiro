import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type {
  SimulatedTrainState,
  SimulationControlState,
  SimTimeScale,
  SimTrainDensity,
  TrainSimulationEngineAdapter,
} from '../contracts/atlasV2.js';
import type {
  AtlasDataset,
  FareQuote,
  OsmVerticalDataset,
  SkId,
} from '../domain/types.js';
import { createTrainSimulationEngine } from '../simulation/index.js';
import {
  CAMERA_MODE_METADATA,
  createInitialCameraModeState,
  toSession0FollowView,
  transitionCameraMode,
  type CameraModeAction,
  type CameraModeState,
  type TrainFollowRig,
} from '../three/camera/cameraModeStateMachine.js';
import {
  StreetCollisionGuard,
  type CameraOrientationInfo,
} from '../three/camera/collisionGuard.js';
import {
  findCameraControllerInsideContainer,
  type SpatialCameraBridge,
  type UndergroundExplorerLocation,
} from '../three/camera/controllerBridge.js';
import type { PlacedMapLabel } from '../three/camera/labelLayout.js';
import { SpatialLabelRegistry } from '../three/camera/labelSystem.js';
import type { RollingStockRendererAdapter } from '../three/contracts/adapters.js';
import { TOKYO_HUB_PRESETS } from '../three/geoProjection.js';
import { Metropolitan3DScene, type SceneCallbacks } from '../three/Metropolitan3DScene.js';
import { createRollingStockRenderer } from '../three/rollingstock/index.js';
import type {
  LineTraceStatus,
  SceneTelemetry,
  UndergroundViewSettings,
} from '../three/types.js';
import { CameraHud, MapLabelsOverlay } from './CameraHud.js';
import type { Locale } from './i18n.js';
import { SimulationPanel } from './SimulationPanel.js';
import { TrainInspector } from './TrainInspector.js';

interface Tokyo3DCanvasProps {
  dataset: AtlasDataset;
  osmVertical: OsmVerticalDataset | null;
  theme: 'light' | 'dark';
  locale: Locale;
  visibleOperatorIds: Set<SkId<'operator'>>;
  selectedLineId: SkId<'line'> | null;
  selectedStationId: SkId<'station'> | null;
  fareSliceOnly: boolean;
  fareQuote: FareQuote | null;
  initialViewport: { lon: number; lat: number; zoom: number } | null;
  onViewportChange: (lon: number, lat: number, zoom: number) => void;
  onSelectStation: (stationId: SkId<'station'>) => void;
  onSelectLine: (lineId: SkId<'line'>) => void;
  onClearSelection?: () => void;
  onClearStation?: () => void;
  onClearLine?: () => void;
}

type SceneWithTimeOfDay = Metropolitan3DScene & {
  setTimeOfDay?: (hour: number) => void;
};

type SceneCallbacksWithClear = SceneCallbacks & {
  onClearSelection?: () => void;
};

function isNightHour(hour: number): boolean {
  const h = ((hour % 24) + 24) % 24;
  return h < 6.0 || h >= 18.2;
}

const DEFAULT_CONTROL_STATE: SimulationControlState = {
  running: true,
  timeScale: 1,
  simClockSec: 0,
  density: 'normal',
  activeLineFilter: null,
  totalActiveTrains: 0,
  undergroundTrainCount: 0,
  isVirtualSimulation: true,
  dataNature: 'synthetic',
};

function modeReducer(state: CameraModeState, action: CameraModeAction): CameraModeState {
  return transitionCameraMode(state, action);
}

export const Tokyo3DCanvas: React.FC<Tokyo3DCanvasProps> = ({
  dataset,
  osmVertical,
  theme,
  locale,
  visibleOperatorIds,
  selectedLineId,
  selectedStationId,
  fareSliceOnly,
  fareQuote,
  initialViewport,
  onViewportChange,
  onSelectStation,
  onSelectLine,
  onClearSelection,
  onClearStation,
  onClearLine,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<Metropolitan3DScene | null>(null);
  const simEngineRef = useRef<TrainSimulationEngineAdapter | null>(null);
  const rollingStockRef = useRef<RollingStockRendererAdapter | null>(null);
  const camBridgeRef = useRef<SpatialCameraBridge | null>(null);
  const labelRegistryRef = useRef<SpatialLabelRegistry | null>(null);
  const collisionGuardRef = useRef<StreetCollisionGuard>(new StreetCollisionGuard());

  const [modeState, dispatchRaw] = useReducer(
    modeReducer,
    undefined,
    createInitialCameraModeState,
  );
  const [timeOfDayHour, setTimeOfDayHour] = useState<number>(() =>
    theme === 'dark' ? 21.0 : 13.5,
  );
  const [autoTimePlay, setAutoTimePlay] = useState(false);
  const timeOfDayRef = useRef(timeOfDayHour);
  timeOfDayRef.current = timeOfDayHour;
  const sceneNight = isNightHour(timeOfDayHour);
  const [telemetry, setTelemetry] = useState<SceneTelemetry | null>(null);
  const [traceStatus, setTraceStatus] = useState<LineTraceStatus>({
    active: false,
    playing: false,
    lineId: null,
    progress: 0,
    currentStationName: null,
    currentTier: null,
    currentY: null,
  });

  const [simControl, setSimControl] = useState<SimulationControlState>(DEFAULT_CONTROL_STATE);
  const [trains, setTrains] = useState<readonly SimulatedTrainState[]>([]);
  const [trainsVisible, setTrainsVisible] = useState(true);
  const [visibleLimit, setVisibleLimit] = useState<number | 'all'>('all');
  const [selectedTrainId, setSelectedTrainId] = useState<string | null>(null);

  const [labels, setLabels] = useState<PlacedMapLabel[]>([]);
  const [orientation, setOrientation] = useState<CameraOrientationInfo | null>(null);
  const [explorerLoc, setExplorerLoc] = useState<UndergroundExplorerLocation | null>(null);

  const cbRef = useRef({
    onSelectStation,
    onSelectLine,
    onViewportChange,
    onClearSelection,
    onClearStation,
    onClearLine,
  });
  cbRef.current = {
    onSelectStation,
    onSelectLine,
    onViewportChange,
    onClearSelection,
    onClearStation,
    onClearLine,
  };

  const selectedLine = useMemo(
    () => dataset.railLines.find((l) => l.id === selectedLineId) ?? null,
    [dataset.railLines, selectedLineId],
  );

  const selectedTrain = useMemo(
    () => (selectedTrainId ? trains.find((tr) => tr.trainId === selectedTrainId) ?? null : null),
    [trains, selectedTrainId],
  );

  const followedTrain = useMemo(
    () =>
      modeState.mode === 'train_follow' && modeState.followedTrainId
        ? trains.find((tr) => tr.trainId === modeState.followedTrainId) ?? null
        : null,
    [modeState.mode, modeState.followedTrainId, trains],
  );

  const fallbackTrainId = useMemo(() => {
    if (selectedTrainId) return selectedTrainId;
    const isUgMode =
      modeState.mode === 'underground_cutaway' || modeState.mode === 'underground_explorer';
    const match = trains.find((tr) => (isUgMode ? tr.isUnderground : !tr.isUnderground));
    return match?.trainId ?? trains[0]?.trainId ?? null;
  }, [selectedTrainId, modeState.mode, trains]);

  const dispatchMode = useCallback(
    (action: CameraModeAction) => {
      if (action.type === 'RESET_OVERVIEW') {
        const overview = TOKYO_HUB_PRESETS.find((h) => h.id === 'tokyo23') ?? TOKYO_HUB_PRESETS[0]!;
        sceneRef.current?.selectTrain(null);
        sceneRef.current?.stopLineTrace();
        setSelectedTrainId(null);
        cbRef.current.onClearSelection?.();
        sceneRef.current?.flyToHubPreset(overview);
      }
      dispatchRaw(action);
    },
    [],
  );

  // Sync top-level app light/dark theme toggle to sensible default solar hour
  const prevThemeRef = useRef(theme);
  useEffect(() => {
    if (prevThemeRef.current !== theme) {
      prevThemeRef.current = theme;
      const targetHour = theme === 'dark' ? 21.0 : 13.5;
      timeOfDayRef.current = targetHour;
      setTimeOfDayHour(targetHour);
      setAutoTimePlay(false);
    }
  }, [theme]);

  // Mount Three.js scene WITH real v2 Train Simulation Engine & Rolling Stock Renderer plugins
  useEffect(() => {
    if (!mountRef.current) return;

    const simEngine = createTrainSimulationEngine();
    const rollingStock = createRollingStockRenderer();
    simEngineRef.current = simEngine;
    rollingStockRef.current = rollingStock;

    const callbacks: SceneCallbacksWithClear = {
      onSelectStation: (sid) => cbRef.current.onSelectStation(sid),
      onSelectLine: (lid) => cbRef.current.onSelectLine(lid),
      onSelectTrain: (tid) => setSelectedTrainId(tid),
      onClearSelection: () => {
        setSelectedTrainId(null);
        cbRef.current.onClearSelection?.();
      },
      onTelemetry: (stats) => setTelemetry(stats),
      onTraceUpdate: (st) => setTraceStatus(st),
      onSimulationUpdate: (controlState, trainList) => {
        setSimControl(controlState);
        setTrains(trainList);
      },
      onCameraMoved: (lon, lat, zoom) => cbRef.current.onViewportChange(lon, lat, zoom),
    };

    const ctrl = new Metropolitan3DScene(
      mountRef.current,
      dataset,
      osmVertical,
      isNightHour(timeOfDayRef.current),
      callbacks,
      initialViewport ?? undefined,
      {
        simulationEngine: simEngine,
        rollingStockRenderer: rollingStock,
      },
    );
    sceneRef.current = ctrl;
    (ctrl as SceneWithTimeOfDay).setTimeOfDay?.(timeOfDayRef.current);

    // Initialize simulation snapshots immediately so SimulationPanel renders frame 1
    setSimControl(ctrl.getSimulationControlState());
    const initTrains = ctrl.getSimulatedTrains();
    setTrains(initTrains);

    // Connect weakmap bridge to upgraded SpatialCameraController & spatial labels
    const bridge = findCameraControllerInsideContainer(mountRef.current);
    camBridgeRef.current = bridge;
    bridge?.attachUxContext(
      dataset,
      ctrl.solved,
      collisionGuardRef.current,
      (tid) => simEngineRef.current?.getTrainById(tid) ?? null,
    );

    const registry = new SpatialLabelRegistry(dataset, ctrl.solved);
    labelRegistryRef.current = registry;
    void collisionGuardRef.current.ensureLoadedFromCache().then((landmarks) => {
      if (landmarks.length > 0) {
        registry.setLandmarks(landmarks);
      }
    });

    return () => {
      ctrl.dispose();
      sceneRef.current = null;
      simEngineRef.current = null;
      rollingStockRef.current = null;
      camBridgeRef.current = null;
      labelRegistryRef.current = null;
    };
  }, [dataset, osmVertical]);

  // Continuous solar lighting & day/night sync (setTimeOfDay handles light/dark theme switching smoothly)
  useEffect(() => {
    (sceneRef.current as SceneWithTimeOfDay | null)?.setTimeOfDay?.(timeOfDayHour);
  }, [timeOfDayHour]);

  // Smooth continuous time-lapse playback (~0.8 simulated hours/sec)
  useEffect(() => {
    if (!autoTimePlay) return;
    let rafId = 0;
    let lastTs = performance.now();
    let lastUiSync = lastTs;
    const step = (now: number) => {
      const dtSec = Math.min(0.1, (now - lastTs) / 1000);
      lastTs = now;
      const nextHour = (timeOfDayRef.current + dtSec * 0.8) % 24;
      timeOfDayRef.current = nextHour;
      (sceneRef.current as SceneWithTimeOfDay | null)?.setTimeOfDay?.(nextHour);
      if (now - lastUiSync >= 66) {
        lastUiSync = now;
        setTimeOfDayHour(nextHour);
      }
      rafId = window.requestAnimationFrame(step);
    };
    rafId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(rafId);
  }, [autoTimePlay]);

  // Show/hide 3D train meshes and enforce visible train limit via plugin group
  useEffect(() => {
    const grp = rollingStockRef.current?.group;
    if (!grp) return;
    grp.visible = trainsVisible;
    const allowedIds =
      visibleLimit === 'all'
        ? null
        : new Set(trains.slice(0, visibleLimit).map((tr) => tr.trainId));
    for (const child of grp.children) {
      const tid = (child.userData as { trainId?: string } | undefined)?.trainId;
      child.visible =
        !allowedIds || !tid || allowedIds.has(tid) || tid === selectedTrainId || tid === modeState.followedTrainId;
    }
  }, [trainsVisible, visibleLimit, trains, selectedTrainId, modeState.followedTrainId]);

  // Sync 5-mode FSM -> SpatialCameraController & Metropolitan3DScene
  useEffect(() => {
    const scene = sceneRef.current;
    const bridge = camBridgeRef.current;
    if (!scene || !bridge) return;

    bridge.applyModeState(modeState, followedTrain, selectedLineId, selectedStationId);
    scene.setUndergroundCutawayStyle(modeState.cutaway.tunnelCutawayStyle);

    if (modeState.mode === 'train_follow' && modeState.followedTrainId) {
      if (modeState.followAngle === 'front') {
        // Custom external front nose-3/4 curve rig driven at 60fps by SpatialCameraController
        scene.followTrain(null);
        scene.selectTrain(modeState.followedTrainId);
      } else {
        scene.followTrain(
          modeState.followedTrainId,
          toSession0FollowView(modeState.followAngle),
        );
      }
    } else {
      scene.followTrain(null);
    }

    const followCutawayNeeded =
      modeState.mode === 'train_follow' &&
      Boolean(followedTrain?.isUnderground) &&
      modeState.followAngle !== 'cab';

    const undergroundSettings: UndergroundViewSettings = {
      enabled: modeState.mode === 'underground_cutaway' || followCutawayNeeded,
      groundOpacity: modeState.cutaway.groundOpacity,
      cutawayRadius: modeState.cutaway.cutawayRadius,
      verticalExaggeration:
        modeState.mode === 'underground_cutaway' ? modeState.cutaway.verticalExaggeration : 1.0,
      pinCutaway: modeState.cutaway.pinCutaway,
      hideBuildings: modeState.cutaway.hideBuildings,
      clipEnabled: modeState.cutaway.clipEnabled,
      clipY: modeState.cutaway.clipY,
      tunnelCutawayStyle: modeState.cutaway.tunnelCutawayStyle,
      visibleTiers: modeState.cutaway.visibleTiers,
    };

    scene.applyFilters({
      visibleOperatorIds,
      selectedLineId,
      selectedStationId,
      fareSliceOnly,
      underground: undergroundSettings,
    });
  }, [
    modeState,
    followedTrain?.trainId,
    followedTrain?.isUnderground,
    visibleOperatorIds,
    selectedLineId,
    selectedStationId,
    fareSliceOnly,
  ]);

  // JR Fare highlight sync
  useEffect(() => {
    sceneRef.current?.setFareQuote(fareQuote);
  }, [fareQuote]);

  // Auto-focus station when selected from search/sidebar
  const prevStationRef = useRef<SkId<'station'> | null>(null);
  useEffect(() => {
    if (selectedStationId && selectedStationId !== prevStationRef.current) {
      sceneRef.current?.flyToStation(selectedStationId);
    }
    prevStationRef.current = selectedStationId;
  }, [selectedStationId]);

  // Live 15Hz 3D-to-screen hierarchical label solver & orientation / tunnel locator updates
  useEffect(() => {
    const timer = window.setInterval(() => {
      const container = mountRef.current;
      const bridge = camBridgeRef.current;
      const reg = labelRegistryRef.current;
      if (!container || !bridge || !reg) return;

      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const focus = bridge.getFocusTarget();
      const visibleTrains =
        visibleLimit === 'all' ? trains : trains.slice(0, visibleLimit);

      const nextLabels = reg.computeVisibleLabels({
        camera: bridge.getCamera(),
        mode: modeState.mode,
        locale,
        viewportWidth: rect.width,
        viewportHeight: rect.height,
        cameraDistanceM: bridge.getDistanceToFocus(),
        verticalExaggeration:
          modeState.mode === 'underground_cutaway'
            ? modeState.cutaway.verticalExaggeration
            : 1.0,
        cutawayCenterX: focus.x,
        cutawayCenterZ: focus.z,
        cutawayRadiusM: modeState.cutaway.cutawayRadius,
        visibleOperatorIds,
        selectedStationId,
        selectedLineId,
        selectedTrainId,
        trains: visibleTrains,
        trainsVisible,
        hasRightInspector: Boolean(selectedTrain || selectedStationId || selectedLineId),
      });
      setLabels(nextLabels);

      if (modeState.mode === 'street_level' || modeState.freeLookEnabled) {
        setOrientation(bridge.getOrientationInfo());
      } else {
        setOrientation(null);
      }

      if (modeState.mode === 'underground_explorer') {
        setExplorerLoc(bridge.getExplorerLocation());
      } else {
        setExplorerLoc(null);
      }

      (
        window as unknown as {
          __SENKIRO_UX_V2__?: Record<string, unknown>;
        }
      ).__SENKIRO_UX_V2__ = {
        mode: modeState.mode,
        modeLabel: CAMERA_MODE_METADATA[modeState.mode].labelEn,
        freeLookEnabled: modeState.freeLookEnabled,
        labelCount: nextLabels.length,
        followedTrainId: modeState.followedTrainId,
        followAngle: modeState.followAngle,
        activeTrains: simControl.totalActiveTrains,
        undergroundTrains: simControl.undergroundTrainCount,
      };
    }, 66);

    return () => window.clearInterval(timer);
  }, [
    modeState,
    locale,
    visibleOperatorIds,
    selectedStationId,
    selectedLineId,
    selectedTrainId,
    trains,
    trainsVisible,
    visibleLimit,
    simControl.totalActiveTrains,
    simControl.undergroundTrainCount,
  ]);

  // Global desktop shortcuts (R: Reset Overview, Esc: Exit Follow / Return to Surface / Clear Selection)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        dispatchMode({ type: 'RESET_OVERVIEW' });
      } else if (e.key === 'Escape') {
        if (modeState.mode === 'train_follow') {
          dispatchMode({ type: 'EXIT_TRAIN_FOLLOW' });
        } else if (
          modeState.mode === 'underground_cutaway' ||
          modeState.mode === 'underground_explorer'
        ) {
          dispatchMode({ type: 'RETURN_TO_SURFACE' });
        } else {
          sceneRef.current?.selectTrain(null);
          sceneRef.current?.stopLineTrace();
          setSelectedTrainId(null);
          cbRef.current.onClearSelection?.();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [modeState.mode, dispatchMode]);

  const handleHubClick = useCallback((hubId: string) => {
    const preset = TOKYO_HUB_PRESETS.find((p) => p.id === hubId);
    if (!preset) return;
    sceneRef.current?.selectTrain(null);
    sceneRef.current?.stopLineTrace();
    setSelectedTrainId(null);
    cbRef.current.onClearSelection?.();
    sceneRef.current?.flyToHubPreset(preset);
    if (preset.recommendUnderground) {
      dispatchMode({ type: 'SELECT_MODE', mode: 'underground_cutaway' });
    }
  }, [dispatchMode]);

  const handleChangeTimeOfDay = useCallback((hour: number) => {
    const normalized = ((hour % 24) + 24) % 24;
    timeOfDayRef.current = normalized;
    setTimeOfDayHour(normalized);
  }, []);

  const handleToggleDayNight = useCallback(() => {
    setAutoTimePlay(false);
    const nextHour = isNightHour(timeOfDayRef.current) ? 13.5 : 21.0;
    timeOfDayRef.current = nextHour;
    setTimeOfDayHour(nextHour);
  }, []);

  const handleCloseLine = useCallback(() => {
    sceneRef.current?.stopLineTrace();
    cbRef.current.onClearLine?.();
  }, []);

  const handleStartOrToggleTrace = useCallback(() => {
    if (!selectedLineId || !sceneRef.current) return;
    if (traceStatus.active && traceStatus.lineId === selectedLineId) {
      sceneRef.current.setLineTracePlaying(!traceStatus.playing);
    } else {
      if (
        selectedLine?.lineClass === 'metro' &&
        modeState.mode !== 'underground_cutaway' &&
        modeState.mode !== 'underground_explorer'
      ) {
        dispatchMode({ type: 'SELECT_MODE', mode: 'underground_cutaway' });
      }
      sceneRef.current.startLineTrace(selectedLineId, true);
    }
  }, [selectedLineId, traceStatus, selectedLine, modeState.mode, dispatchMode]);

  const handleFollowTrain = useCallback(
    (trainId: string, angle?: TrainFollowRig) => {
      sceneRef.current?.selectTrain(trainId);
      setSelectedTrainId(trainId);
      dispatchMode({ type: 'FOLLOW_TRAIN', trainId, angle });
    },
    [dispatchMode],
  );

  const handleLabelClick = useCallback(
    (lbl: PlacedMapLabel) => {
      if (!lbl.entityId) return;
      if (lbl.entityKind === 'station') {
        onSelectStation(lbl.entityId as SkId<'station'>);
      } else if (lbl.entityKind === 'line') {
        onSelectLine(lbl.entityId as SkId<'line'>);
        sceneRef.current?.flyToLine(lbl.entityId as SkId<'line'>);
      } else if (lbl.entityKind === 'train') {
        sceneRef.current?.selectTrain(lbl.entityId);
        setSelectedTrainId(lbl.entityId);
      }
    },
    [onSelectStation, onSelectLine],
  );

  return (
    <div className="canvas-pane" data-testid="tokyo-3d-pane">
      <div
        ref={mountRef}
        className="map-container"
        aria-label={
          locale === 'ja'
            ? '東京大都市3D鉄道・地下トンネルインタラクティブ空間'
            : locale === 'zh'
              ? '东京大都市 3D 铁路与地下隧道交互空间'
              : 'Tokyo Metropolitan 3D Railway & Underground Tunnel Scene'
        }
      />

      {/* Hierarchical Screen-Space Deconflicted Map Labels */}
      <MapLabelsOverlay
        labels={labels}
        onLabelClick={handleLabelClick}
        onLineBadgeClick={(lid) => {
          onSelectLine(lid as SkId<'line'>);
        }}
      />

      {/* Top Mode Bar, Mode Context Drawer, Line Trace, Time-of-Day, Telemetry */}
      <CameraHud
        dataset={dataset}
        locale={locale}
        modeState={modeState}
        sceneNight={sceneNight}
        timeOfDayHour={timeOfDayHour}
        autoTimePlay={autoTimePlay}
        fareQuote={fareQuote}
        selectedLineId={selectedLineId}
        orientation={orientation}
        explorerLoc={explorerLoc}
        followedTrain={followedTrain}
        fallbackTrainId={fallbackTrainId}
        telemetry={telemetry}
        traceStatus={traceStatus}
        onDispatch={dispatchMode}
        onSelectHub={handleHubClick}
        onJumpExplorerLine={(lid) => camBridgeRef.current?.jumpToTunnelLine(lid)}
        onToggleNight={handleToggleDayNight}
        onChangeTimeOfDay={handleChangeTimeOfDay}
        onToggleAutoTimePlay={() => setAutoTimePlay((p) => !p)}
        onStartOrToggleTrace={handleStartOrToggleTrace}
        onStopTrace={() => sceneRef.current?.stopLineTrace()}
        onTraceProgress={(p) => sceneRef.current?.setLineTraceProgress(p)}
        onFitLine={(lid) => sceneRef.current?.flyToLine(lid)}
        onCloseLine={handleCloseLine}
      />

      {/* Contextual 3D Train / Station / Line Inspector */}
      <TrainInspector
        dataset={dataset}
        locale={locale}
        selectedTrain={selectedTrain}
        selectedStationId={selectedStationId}
        selectedLineId={selectedLineId}
        trains={trains}
        followedTrainId={modeState.mode === 'train_follow' ? modeState.followedTrainId : null}
        followAngle={modeState.followAngle}
        onFollowTrain={handleFollowTrain}
        onExitFollow={() => dispatchMode({ type: 'EXIT_TRAIN_FOLLOW' })}
        onCloseTrain={() => {
          sceneRef.current?.selectTrain(null);
          setSelectedTrainId(null);
        }}
        onCloseStation={onClearStation}
        onCloseLine={handleCloseLine}
        onFocusLine={(lid) => sceneRef.current?.flyToLine(lid)}
        onEnterUndergroundExplorer={() =>
          dispatchMode({ type: 'SELECT_MODE', mode: 'underground_explorer' })
        }
      />

      {/* Non-Obstructive Virtual Train Simulation Control Bar */}
      <SimulationPanel
        dataset={dataset}
        locale={locale}
        control={simControl}
        trains={trains}
        trainsVisible={trainsVisible}
        selectedTrainId={selectedTrainId}
        isFollowing={modeState.mode === 'train_follow'}
        visibleLimit={visibleLimit}
        onTogglePlaying={() => sceneRef.current?.setSimulationRunning(!simControl.running)}
        onChangeTimeScale={(s: SimTimeScale) => sceneRef.current?.setSimulationTimeScale(s)}
        onChangeDensity={(d: SimTrainDensity) => sceneRef.current?.setSimulationDensity(d)}
        onChangeVisibleLimit={(lim) => setVisibleLimit(lim)}
        onToggleTrainsVisible={() => setTrainsVisible((v) => !v)}
        onSelectTrain={(tid) => {
          sceneRef.current?.selectTrain(tid);
          setSelectedTrainId(tid);
        }}
        onFollowTrain={(tid) => handleFollowTrain(tid)}
        onResetSimulation={() => {
          sceneRef.current?.resetSimulation();
          if (modeState.mode === 'train_follow') {
            dispatchMode({ type: 'EXIT_TRAIN_FOLLOW' });
          }
        }}
        onExitFollow={() => dispatchMode({ type: 'EXIT_TRAIN_FOLLOW' })}
      />
    </div>
  );
};
