/**
 * SENKIRO Atlas v2 — Unified 5-Mode Spatial Camera State Machine
 * (Pure TypeScript, zero Three.js / React dependency).
 *
 * Manages all 5 SENKIRO Atlas v2 viewing modes & safe transitions:
 *  1. city_overview        — 3D metropolitan aerial overview (orbit, pan, zoom, focus, reset)
 *  2. street_level         — Low-altitude street & viaduct canyon observation with collision & compass
 *  3. underground_cutaway  — GPU radial pit cutaway, tier filtering, line highlight & depth clarity
 *  4. underground_explorer — True subterranean tunnel interior navigation with wall occlusion & bounds
 *  5. train_follow         — Curve-smoothed simulated train tracking (cab / front / side / chase / overhead)
 */

import type {
  CameraModeV2,
  TrainFollowView,
  TunnelCutawayStyle,
} from '../../contracts/atlasV2.js';
import type { SchematicTierId } from '../../domain/elevationSolver.js';

export type CameraModeId =
  | 'city_overview'
  | 'street_level'
  | 'underground_cutaway'
  | 'underground_explorer'
  | 'train_follow';

export type TrainFollowRig = TrainFollowView | 'front';
export type CameraMoveSpeed = 'slow' | 'normal' | 'fast';

export interface CutawaySettingsState {
  groundOpacity: number; // 0.12 .. 1.0
  cutawayRadius: number; // 350 .. 2400 m
  verticalExaggeration: number; // 1.0 .. 2.5
  pinCutaway: boolean;
  hideBuildings: boolean;
  clipEnabled: boolean;
  clipY: number; // -45 .. +35
  tunnelCutawayStyle: TunnelCutawayStyle;
  visibleTiers: Record<SchematicTierId, boolean>;
}

export interface CameraModeState {
  mode: CameraModeId;
  previousMode: CameraModeId | null;
  lastSurfaceMode: 'city_overview' | 'street_level';
  lastNonFollowMode: Exclude<CameraModeId, 'train_follow'>;
  freeLookEnabled: boolean;
  moveSpeed: CameraMoveSpeed;
  followAngle: TrainFollowRig;
  followedTrainId: string | null;
  cutaway: CutawaySettingsState;
}

export const DEFAULT_VISIBLE_TIERS: Record<SchematicTierId, boolean> = {
  'L+2': true,
  'L+1': true,
  L0: true,
  'L-1': true,
  'L-2': true,
  'L-3': true,
  'L-4': true,
};

export function createInitialCameraModeState(): CameraModeState {
  return {
    mode: 'city_overview',
    previousMode: null,
    lastSurfaceMode: 'city_overview',
    lastNonFollowMode: 'city_overview',
    freeLookEnabled: false,
    moveSpeed: 'normal',
    followAngle: 'side',
    followedTrainId: null,
    cutaway: {
      groundOpacity: 0.16,
      cutawayRadius: 850,
      verticalExaggeration: 1.4,
      pinCutaway: false,
      hideBuildings: false,
      clipEnabled: false,
      clipY: 20,
      tunnelCutawayStyle: 'translucent_shell',
      visibleTiers: { ...DEFAULT_VISIBLE_TIERS },
    },
  };
}

export type CameraModeAction =
  | { type: 'SELECT_MODE'; mode: CameraModeId; trainId?: string | null }
  | { type: 'TOGGLE_FREE_LOOK'; enabled?: boolean }
  | { type: 'SET_MOVE_SPEED'; speed: CameraMoveSpeed }
  | { type: 'SET_FOLLOW_ANGLE'; angle: TrainFollowRig }
  | { type: 'FOLLOW_TRAIN'; trainId: string; angle?: TrainFollowRig }
  | { type: 'EXIT_TRAIN_FOLLOW' }
  | { type: 'RETURN_TO_SURFACE' }
  | { type: 'RESET_OVERVIEW' }
  | { type: 'UPDATE_CUTAWAY'; patch: Partial<Omit<CutawaySettingsState, 'visibleTiers'>> }
  | { type: 'TOGGLE_TIER'; tierId: SchematicTierId }
  | { type: 'SET_ALL_TIERS'; visible: boolean };

export function transitionCameraMode(
  state: CameraModeState,
  action: CameraModeAction,
): CameraModeState {
  switch (action.type) {
    case 'SELECT_MODE': {
      const target = action.mode;
      if (target === 'train_follow') {
        const nextTrainId = action.trainId ?? state.followedTrainId;
        if (!nextTrainId) {
          return state;
        }
        const prevNonFollow =
          state.mode === 'train_follow' ? state.lastNonFollowMode : state.mode;
        return {
          ...state,
          mode: 'train_follow',
          previousMode: state.mode,
          lastNonFollowMode: prevNonFollow,
          followedTrainId: nextTrainId,
          freeLookEnabled: false,
        };
      }

      const nextLastSurface =
        target === 'city_overview' || target === 'street_level'
          ? target
          : state.lastSurfaceMode;

      const cutaway: CutawaySettingsState =
        target === 'city_overview' || target === 'street_level'
          ? {
              ...state.cutaway,
              groundOpacity: 1.0,
              hideBuildings: false,
              clipEnabled: false,
            }
          : target === 'underground_explorer'
            ? {
                ...state.cutaway,
                groundOpacity: 1.0,
                hideBuildings: true,
                clipEnabled: false,
              }
            : target === 'underground_cutaway'
              ? {
                  ...state.cutaway,
                  hideBuildings: false,
                  groundOpacity:
                    state.cutaway.groundOpacity >= 0.65 ? 0.16 : state.cutaway.groundOpacity,
                  verticalExaggeration: Math.max(1.4, state.cutaway.verticalExaggeration),
                }
              : state.cutaway;

      const nextFreeLook =
        target === 'underground_explorer'
          ? true
          : target === 'city_overview'
            ? false
            : state.freeLookEnabled;

      return {
        ...state,
        mode: target,
        previousMode: state.mode,
        lastSurfaceMode: nextLastSurface,
        lastNonFollowMode: target,
        freeLookEnabled: nextFreeLook,
        cutaway,
      };
    }

    case 'TOGGLE_FREE_LOOK': {
      if (state.mode === 'train_follow') {
        return state;
      }
      const enabled = action.enabled ?? !state.freeLookEnabled;
      return { ...state, freeLookEnabled: enabled };
    }

    case 'SET_MOVE_SPEED': {
      return { ...state, moveSpeed: action.speed };
    }

    case 'SET_FOLLOW_ANGLE': {
      return { ...state, followAngle: action.angle };
    }

    case 'FOLLOW_TRAIN': {
      if (!action.trainId) return state;
      const prevNonFollow =
        state.mode === 'train_follow' ? state.lastNonFollowMode : state.mode;
      return {
        ...state,
        mode: 'train_follow',
        previousMode: state.mode,
        lastNonFollowMode: prevNonFollow,
        followedTrainId: action.trainId,
        followAngle: action.angle ?? state.followAngle,
        freeLookEnabled: false,
      };
    }

    case 'EXIT_TRAIN_FOLLOW': {
      if (state.mode !== 'train_follow') return state;
      const restoreMode = state.lastNonFollowMode ?? state.lastSurfaceMode;
      return {
        ...state,
        mode: restoreMode,
        previousMode: 'train_follow',
        freeLookEnabled: restoreMode === 'underground_explorer',
      };
    }

    case 'RETURN_TO_SURFACE': {
      const targetSurface = state.lastSurfaceMode;
      return {
        ...state,
        mode: targetSurface,
        previousMode: state.mode,
        lastNonFollowMode: targetSurface,
        freeLookEnabled: false,
        cutaway: {
          ...state.cutaway,
          groundOpacity: 1.0,
          hideBuildings: false,
          clipEnabled: false,
          pinCutaway: false,
          visibleTiers: { ...DEFAULT_VISIBLE_TIERS },
        },
      };
    }

    case 'RESET_OVERVIEW': {
      return {
        ...state,
        mode: 'city_overview',
        previousMode: state.mode,
        lastSurfaceMode: 'city_overview',
        lastNonFollowMode: 'city_overview',
        freeLookEnabled: false,
        followedTrainId: null,
        cutaway: {
          ...state.cutaway,
          groundOpacity: 1.0,
          hideBuildings: false,
          clipEnabled: false,
          pinCutaway: false,
          verticalExaggeration: 1.4,
          visibleTiers: { ...DEFAULT_VISIBLE_TIERS },
        },
      };
    }

    case 'UPDATE_CUTAWAY': {
      return {
        ...state,
        cutaway: {
          ...state.cutaway,
          ...action.patch,
        },
      };
    }

    case 'TOGGLE_TIER': {
      return {
        ...state,
        cutaway: {
          ...state.cutaway,
          visibleTiers: {
            ...state.cutaway.visibleTiers,
            [action.tierId]: !state.cutaway.visibleTiers[action.tierId],
          },
        },
      };
    }

    case 'SET_ALL_TIERS': {
      const nextTiers = { ...state.cutaway.visibleTiers };
      for (const k of Object.keys(nextTiers) as SchematicTierId[]) {
        nextTiers[k] = action.visible;
      }
      return {
        ...state,
        cutaway: {
          ...state.cutaway,
          visibleTiers: nextTiers,
        },
      };
    }
  }
}

export interface CameraModeCapabilities {
  mode: CameraModeId;
  isSurface: boolean;
  isUnderground: boolean;
  allowUndergroundGeometry: boolean;
  useRadialCutaway: boolean;
  useExplorerSolidTunnels: boolean;
  enableSurfaceCeilingOcclusion: boolean;
  verticalExaggeration: number;
  minCameraY: number;
  maxCameraY: number;
  minDistance: number;
  maxDistance: number;
  minPolarRad: number;
  maxPolarRad: number;
  nearPlaneMin: number;
  canReturnToSurface: boolean;
  canExitToOverview: boolean;
}

export function getCameraModeCapabilities(
  state: CameraModeState,
  followedTrainUnderground = false,
): CameraModeCapabilities {
  const { mode, followAngle, cutaway } = state;
  const vExag = Math.max(1.0, Math.min(2.5, cutaway.verticalExaggeration));

  switch (mode) {
    case 'city_overview':
      return {
        mode,
        isSurface: true,
        isUnderground: false,
        allowUndergroundGeometry: cutaway.clipEnabled,
        useRadialCutaway: false,
        useExplorerSolidTunnels: false,
        enableSurfaceCeilingOcclusion: false,
        verticalExaggeration: 1.0,
        minCameraY: 14,
        maxCameraY: 16_000,
        minDistance: 85,
        maxDistance: 18_500,
        minPolarRad: 0.12,
        maxPolarRad: Math.PI * 0.47,
        nearPlaneMin: 3.5,
        canReturnToSurface: false,
        canExitToOverview: false,
      };

    case 'street_level':
      return {
        mode,
        isSurface: true,
        isUnderground: false,
        allowUndergroundGeometry: false,
        useRadialCutaway: false,
        useExplorerSolidTunnels: false,
        enableSurfaceCeilingOcclusion: false,
        verticalExaggeration: 1.0,
        minCameraY: 4.5,
        maxCameraY: 650,
        minDistance: 24,
        maxDistance: 620,
        minPolarRad: 0.25,
        maxPolarRad: Math.PI * 0.56,
        nearPlaneMin: 0.4,
        canReturnToSurface: false,
        canExitToOverview: true,
      };

    case 'underground_cutaway':
      return {
        mode,
        isSurface: false,
        isUnderground: true,
        allowUndergroundGeometry: true,
        useRadialCutaway: true,
        useExplorerSolidTunnels: false,
        enableSurfaceCeilingOcclusion: false,
        verticalExaggeration: vExag,
        minCameraY: -62 * vExag,
        maxCameraY: 12_000,
        minDistance: 45,
        maxDistance: 9_000,
        minPolarRad: 0.1,
        maxPolarRad: Math.PI * 0.78,
        nearPlaneMin: 1.0,
        canReturnToSurface: true,
        canExitToOverview: true,
      };

    case 'underground_explorer':
      return {
        mode,
        isSurface: false,
        isUnderground: true,
        allowUndergroundGeometry: true,
        useRadialCutaway: false,
        useExplorerSolidTunnels: true,
        enableSurfaceCeilingOcclusion: true,
        verticalExaggeration: 1.0,
        minCameraY: -60,
        maxCameraY: -1.5,
        minDistance: 6,
        maxDistance: 420,
        minPolarRad: 0.15,
        maxPolarRad: Math.PI * 0.88,
        nearPlaneMin: 0.25,
        canReturnToSurface: true,
        canExitToOverview: true,
      };

    case 'train_follow': {
      const useCutaway =
        followedTrainUnderground &&
        (followAngle === 'side' || followAngle === 'overhead_cutaway' || followAngle === 'chase');
      const useTunnelInside =
        followedTrainUnderground && (followAngle === 'cab' || followAngle === 'front');
      return {
        mode,
        isSurface: !followedTrainUnderground,
        isUnderground: followedTrainUnderground,
        allowUndergroundGeometry: followedTrainUnderground,
        useRadialCutaway: useCutaway,
        useExplorerSolidTunnels: useTunnelInside,
        enableSurfaceCeilingOcclusion: useTunnelInside,
        verticalExaggeration: 1.0,
        minCameraY: followedTrainUnderground ? -58 : 3.5,
        maxCameraY: 4_000,
        minDistance: 6,
        maxDistance: 450,
        minPolarRad: 0.1,
        maxPolarRad: Math.PI * 0.88,
        nearPlaneMin: 0.25,
        canReturnToSurface: followedTrainUnderground,
        canExitToOverview: true,
      };
    }
  }
}

export function toCameraModeV2(state: CameraModeState): CameraModeV2 {
  if (state.mode === 'train_follow') {
    return state.followAngle === 'cab' ? 'cab_ride' : 'follow_train';
  }
  if (state.mode === 'underground_cutaway' || state.mode === 'underground_explorer') {
    return 'underground_inspect';
  }
  if (state.freeLookEnabled) {
    return 'free';
  }
  if (state.mode === 'street_level') {
    return 'station_focus';
  }
  return 'map';
}

export function toSession0FollowView(rig: TrainFollowRig): TrainFollowView {
  if (rig === 'front') return 'chase';
  return rig;
}

export interface CameraModeLabelInfo {
  id: CameraModeId;
  labelJa: string;
  labelZh: string;
  labelEn: string;
  shortJa: string;
  shortZh: string;
  shortEn: string;
  descriptionJa: string;
  descriptionZh: string;
  descriptionEn: string;
}

export const CAMERA_MODE_METADATA: Record<CameraModeId, CameraModeLabelInfo> = {
  city_overview: {
    id: 'city_overview',
    labelJa: '都市俯瞰',
    labelZh: '城市俯瞰',
    labelEn: 'City Overview',
    shortJa: '都市俯瞰',
    shortZh: '俯瞰',
    shortEn: 'Overview',
    descriptionJa: '3D都市鳥瞰：左ドラッグ回転・中/右ドラッグ平行移動・ダブルクリック焦点',
    descriptionZh: '3D 城市俯瞰：左键拖拽旋转・中/右键拖拽平移・双击聚焦',
    descriptionEn: '3D metropolitan overview: Left-drag orbit, Mid/Right pan, Dbl-click focus',
  },
  street_level: {
    id: 'street_level',
    labelJa: '街路レベル',
    labelZh: '街道视角',
    labelEn: 'Street-Level',
    shortJa: '街路',
    shortZh: '街道',
    shortEn: 'Street',
    descriptionJa: '近景都市観察：建物衝突回避・方位コンパス付で街路と高架を観察',
    descriptionZh: '近景城市观察：带建筑碰撞回避与方向罗盘，观察街道与高架桥',
    descriptionEn: 'Street & viaduct view with building collision guard & orientation compass',
  },
  underground_cutaway: {
    id: 'underground_cutaway',
    labelJa: '地下透過ビュー',
    labelZh: '地下透视',
    labelEn: 'Underground View',
    shortJa: '地下透過',
    shortZh: '地下透视',
    shortEn: 'Underground',
    descriptionJa: '全都市ゴースト透過：地表を淡く透過し地下鉄網・階層・乗換通路を明瞭表示',
    descriptionZh: '全城淡化透视：地表与建筑轻柔淡化，高清呈现全城地铁网、层级与换乘通道',
    descriptionEn: 'Global ghost-surface view: gently fades surface city to reveal full subway strata',
  },
  underground_explorer: {
    id: 'underground_explorer',
    labelJa: '地下トンネル漫遊',
    labelZh: '地下隧道漫游',
    labelEn: 'Underground Explorer',
    shortJa: '地下漫遊',
    shortZh: '隧道漫游',
    shortEn: 'Explorer',
    descriptionJa: 'トンネル内部視点：W/S・ホイールで軌道沿い移動・ドラッグ周囲観察',
    descriptionZh: '隧道内部视角：W/S 或滚轮沿轨道移动・拖拽环顾四周',
    descriptionEn: 'Inside tunnels: W/S or wheel moves along bore, Drag looks around',
  },
  train_follow: {
    id: 'train_follow',
    labelJa: '仮想列車追従',
    labelZh: '模拟列车跟随',
    labelEn: 'Train Follow',
    shortJa: '列車追従',
    shortZh: '列车跟随',
    shortEn: 'Follow',
    descriptionJa: '仮想シミュレーション列車を追従（運転台/側面/後方/先頭・非実時）',
    descriptionZh: '跟随虚拟仿真列车（驾驶室/侧面/后方/车头/俯视・非实时）',
    descriptionEn: 'Follow simulated train (Cab/Side/Rear/Front/Overhead · Non-realtime)',
  },
};
