import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CAMERA_MODE_METADATA,
  createInitialCameraModeState,
  type CameraModeState,
  type TrainFollowAngle,
} from '../domain/cameraModeStateMachine.js';
import type { PlacedMapLabel } from '../domain/labelLayout.js';
import type {
  AtlasDataset,
  FareQuote,
  OsmVerticalDataset,
  SkId,
} from '../domain/types.js';
import { TOKYO_HUB_PRESETS } from '../three/geoProjection.js';
import { Metropolitan3DScene } from '../three/Metropolitan3DScene.js';
import type {
  CameraOrientationInfo,
  SceneTelemetry,
  UndergroundExplorerLocation,
} from '../three/types.js';
import type {
  TrainSimulationSnapshot,
  TrainSimulationState,
} from '../three/uxContracts.js';
import { CameraModeHud } from './CameraModeHud.js';
import type { Locale } from './i18n.js';
import { MapLabelsOverlay } from './MapLabelsOverlay.js';
import { SimulationControlBar } from './SimulationControlBar.js';

interface Tokyo3DCanvasProps {
  dataset: AtlasDataset;
  osmVertical: OsmVerticalDataset | null;
  theme: 'light' | 'dark';
  locale: Locale;
  visibleOperatorIds: Set<SkId<'operator'>>;
  selectedLineId: SkId<'line'> | null;
  selectedStationId: SkId<'station'> | null;
  selectedTrainId: string | null;
  fareSliceOnly: boolean;
  fareQuote: FareQuote | null;
  initialViewport: { lon: number; lat: number; zoom: number } | null;
  followTrainSignal?: { trainId: string; angle?: TrainFollowAngle; nonce: number } | null;
  focusLineSignal?: { lineId: SkId<'line'>; nonce: number } | null;
  onViewportChange: (lon: number, lat: number, zoom: number) => void;
  onSelectStation: (stationId: SkId<'station'>) => void;
  onSelectLine: (lineId: SkId<'line'>) => void;
  onSelectTrain: (trainId: string) => void;
  onSimulationSnapshot?: (snapshot: TrainSimulationSnapshot) => void;
}

export const Tokyo3DCanvas: React.FC<Tokyo3DCanvasProps> = ({
  dataset,
  osmVertical,
  theme,
  locale,
  visibleOperatorIds,
  selectedLineId,
  selectedStationId,
  selectedTrainId,
  fareSliceOnly,
  fareQuote,
  initialViewport,
  followTrainSignal,
  focusLineSignal,
  onViewportChange,
  onSelectStation,
  onSelectLine,
  onSelectTrain,
  onSimulationSnapshot,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<Metropolitan3DScene | null>(null);

  const cbRef = useRef({
    onSelectStation,
    onSelectLine,
    onSelectTrain,
    onViewportChange,
    onSimulationSnapshot,
  });
  cbRef.current = {
    onSelectStation,
    onSelectLine,
    onSelectTrain,
    onViewportChange,
    onSimulationSnapshot,
  };

  const [modeState, setModeState] = useState<CameraModeState>(createInitialCameraModeState);
  const [sceneNight, setSceneNight] = useState(theme === 'dark');
  const [telemetry, setTelemetry] = useState<SceneTelemetry | null>(null);
  const [labels, setLabels] = useState<PlacedMapLabel[]>([]);
  const [orientation, setOrientation] = useState<CameraOrientationInfo | null>(null);
  const [explorerLoc, setExplorerLoc] = useState<UndergroundExplorerLocation | null>(null);
  const [simSnapshot, setSimSnapshot] = useState<TrainSimulationSnapshot>({
    playing: true,
    speedMultiplier: 1,
    visibleCount: 12,
    trainsVisible: true,
    totalAvailable: 0,
    trains: [],
  });

  useEffect(() => {
    setSceneNight(theme === 'dark');
  }, [theme]);

  useEffect(() => {
    if (!mountRef.current) return;
    const ctrl = new Metropolitan3DScene(
      mountRef.current,
      dataset,
      osmVertical,
      sceneNight,
      {
        onSelectStation: (sid) => cbRef.current.onSelectStation(sid),
        onSelectLine: (lid) => cbRef.current.onSelectLine(lid),
        onSelectTrain: (tid) => cbRef.current.onSelectTrain(tid),
        onCameraModeChange: (st) => setModeState(st),
        onOrientationChange: (ori, exp) => {
          setOrientation(ori);
          setExplorerLoc(exp);
        },
        onLabelsUpdated: (lbls) => setLabels(lbls),
        onSimulationUpdated: (snap) => {
          setSimSnapshot(snap);
          cbRef.current.onSimulationSnapshot?.(snap);
        },
        onTelemetry: (stats) => setTelemetry(stats),
        onCameraMoved: (lon, lat, zoom) => cbRef.current.onViewportChange(lon, lat, zoom),
      },
      initialViewport ?? undefined,
    );
    sceneRef.current = ctrl;

    return () => {
      ctrl.dispose();
      sceneRef.current = null;
    };
  }, [dataset, osmVertical]);

  useEffect(() => {
    sceneRef.current?.setTheme(sceneNight);
  }, [sceneNight]);

  useEffect(() => {
    sceneRef.current?.setLocale(locale);
  }, [locale]);

  useEffect(() => {
    sceneRef.current?.applySelectionAndFilters({
      visibleOperatorIds,
      selectedLineId,
      selectedStationId,
      selectedTrainId,
      fareSliceOnly,
    });
  }, [visibleOperatorIds, selectedLineId, selectedStationId, selectedTrainId, fareSliceOnly]);

  useEffect(() => {
    sceneRef.current?.setFareQuote(fareQuote);
  }, [fareQuote]);

  const prevStationRef = useRef<SkId<'station'> | null>(null);
  useEffect(() => {
    if (selectedStationId && selectedStationId !== prevStationRef.current) {
      sceneRef.current?.flyToStation(selectedStationId);
    }
    prevStationRef.current = selectedStationId;
  }, [selectedStationId]);

  useEffect(() => {
    if (!followTrainSignal || !sceneRef.current) return;
    sceneRef.current.dispatchCameraAction({
      type: 'FOLLOW_TRAIN',
      trainId: followTrainSignal.trainId,
      angle: followTrainSignal.angle,
    });
  }, [followTrainSignal]);

  useEffect(() => {
    if (!focusLineSignal || !sceneRef.current) return;
    sceneRef.current.flyToLine(focusLineSignal.lineId);
  }, [focusLineSignal]);

  // Global keyboard ergonomics: F (Free Look), R (Reset Overview), 1-4 (Train Follow rigs), Esc (Safe exit)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
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
      const ctrl = sceneRef.current;
      if (!ctrl) return;

      if (e.code === 'KeyF') {
        ctrl.dispatchCameraAction({ type: 'TOGGLE_FREE_LOOK' });
      } else if (e.code === 'KeyR') {
        ctrl.dispatchCameraAction({ type: 'RESET_OVERVIEW' });
      } else if (e.code === 'Escape') {
        const cur = ctrl.getCameraModeState().mode;
        if (cur === 'train_follow') {
          ctrl.dispatchCameraAction({ type: 'EXIT_TRAIN_FOLLOW' });
        } else if (cur === 'underground_explorer' || cur === 'underground_cutaway') {
          ctrl.dispatchCameraAction({ type: 'RETURN_TO_SURFACE' });
        } else if (cur === 'street_level') {
          ctrl.dispatchCameraAction({ type: 'SELECT_MODE', mode: 'city_overview' });
        }
      } else if (ctrl.getCameraModeState().mode === 'train_follow') {
        const map: Record<string, TrainFollowAngle> = {
          Digit1: 'front',
          Digit2: 'side',
          Digit3: 'rear',
          Digit4: 'cab',
        };
        const rig = map[e.code];
        if (rig) {
          ctrl.dispatchCameraAction({ type: 'SET_FOLLOW_ANGLE', angle: rig });
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const followedTrain: TrainSimulationState | null = useMemo(() => {
    if (!modeState.followedTrainId) return null;
    return simSnapshot.trains.find((t) => t.id === modeState.followedTrainId) ?? null;
  }, [modeState.followedTrainId, simSnapshot.trains]);

  const fallbackTrainId =
    selectedTrainId && simSnapshot.trains.some((t) => t.id === selectedTrainId)
      ? selectedTrainId
      : simSnapshot.trains[0]?.id ?? null;

  const handleLabelClick = (lbl: PlacedMapLabel) => {
    if (lbl.entityKind === 'station' && lbl.entityId) {
      onSelectStation(lbl.entityId as SkId<'station'>);
    } else if (lbl.entityKind === 'line' && lbl.entityId) {
      onSelectLine(lbl.entityId as SkId<'line'>);
    } else if (lbl.entityKind === 'train' && lbl.entityId) {
      onSelectTrain(lbl.entityId);
    }
  };

  const handleHubClick = (hubId: string) => {
    const preset = TOKYO_HUB_PRESETS.find((p) => p.id === hubId);
    if (!preset) return;
    sceneRef.current?.flyToHubPreset(preset);
  };

  const modeHint = CAMERA_MODE_METADATA[modeState.mode];

  return (
    <div className="canvas-pane" data-testid="tokyo-3d-pane">
      <div
        ref={mountRef}
        className="map-container"
        aria-label={
          locale === 'ja'
            ? '東京大都市3D鉄道・地下トンネルインタラクティブ空間'
            : 'Tokyo Metropolitan 3D Railway & Underground Tunnel Scene'
        }
      />

      {/* Hierarchical Deconflicted Screen-Space Labels */}
      <MapLabelsOverlay labels={labels} onLabelClick={handleLabelClick} />

      {/* Unified 5-Mode Switcher + Contextual Mode Panel */}
      <CameraModeHud
        dataset={dataset}
        locale={locale}
        modeState={modeState}
        sceneNight={sceneNight}
        fareQuote={fareQuote}
        orientation={orientation}
        explorerLoc={explorerLoc}
        followedTrain={followedTrain}
        fallbackTrainId={fallbackTrainId}
        onDispatch={(action) => sceneRef.current?.dispatchCameraAction(action)}
        onSelectHub={handleHubClick}
        onJumpExplorerLine={(lid) => sceneRef.current?.jumpToExplorerLine(lid)}
        onToggleNight={() => setSceneNight((n) => !n)}
      />

      {/* Non-obstructive Bottom-Center Virtual Train Simulation Control Dock */}
      <SimulationControlBar
        locale={locale}
        snapshot={simSnapshot}
        selectedTrainId={selectedTrainId}
        isFollowing={modeState.mode === 'train_follow'}
        onTogglePlaying={() => sceneRef.current?.setSimulationPlaying(!simSnapshot.playing)}
        onChangeSpeed={(spd) => sceneRef.current?.setSimulationSpeed(spd)}
        onChangeVisibleCount={(cnt) => sceneRef.current?.setSimulationVisibleCount(cnt)}
        onToggleTrainsVisible={() =>
          sceneRef.current?.setSimulationTrainsVisible(!simSnapshot.trainsVisible)
        }
        onSelectTrain={(tid) => onSelectTrain(tid)}
        onFollowTrain={(tid) => {
          onSelectTrain(tid);
          sceneRef.current?.dispatchCameraAction({ type: 'FOLLOW_TRAIN', trainId: tid });
        }}
        onResetSimulation={() => sceneRef.current?.resetSimulation()}
        onExitFollow={() => sceneRef.current?.dispatchCameraAction({ type: 'EXIT_TRAIN_FOLLOW' })}
      />

      {/* Bottom-Right Compact Control Hint & Telemetry */}
      <div className="ux-telemetry-stack">
        <div
          className="telemetry-chip"
          style={{ position: 'static', fontSize: 10.5, opacity: 0.92 }}
          data-testid="camera-control-hint"
        >
          {modeState.freeLookEnabled
            ? locale === 'ja'
              ? '自由観察 ON: ドラッグ視点 · WASD/QE移動 · F解除'
              : 'Free Look ON: Drag Look · WASD/QE Move · F Exit'
            : locale === 'ja'
              ? modeHint.descriptionJa
              : modeHint.descriptionEn}
        </div>
        {telemetry && (
          <div
            className="telemetry-chip mono"
            style={{ position: 'static' }}
            data-testid="three-telemetry"
          >
            {telemetry.fps > 0 ? `${telemetry.fps} FPS · ` : ''}
            DC:{telemetry.drawCalls} · Tris:{Math.round(telemetry.triangles / 1000)}k
            {telemetry.railwayLod ? ` · Rail:${telemetry.railwayLod}` : ''} · Chunks{' '}
            {telemetry.loadedChunks}/{telemetry.totalChunks} · Buildings{' '}
            {telemetry.renderedBuildings.toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
};
