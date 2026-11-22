/**
 * Unified 5-Mode Spatial Camera State Machine (Pure TypeScript, zero React/Three.js dependency).
 *
 * Manages all 5 SENKIRO Atlas v2 viewing modes & safe transitions:
 *  1. city_overview        — 3D metropolitan aerial overview (pan, orbit, zoom, focus, reset)
 *  2. street_level         — Low-altitude street & viaduct canyon observation with collision & compass
 *  3. underground_cutaway  — GPU radial pit cutaway, tier filtering, line highlight & depth clarity
 *  4. underground_explorer — True subterranean tunnel interior navigation with wall occlusion & bounds
 *  5. train_follow         — Curve-smoothed simulated train tracking (front / side / rear / cab rigs)
 */

import type { SchematicTierId } from './elevationSolver.js';

export type CameraModeId =
  | 'city_overview'
  | 'street_level'
  | 'underground_cutaway'
  | 'underground_explorer'
  | 'train_follow';

export type TrainFollowAngle = 'front' | 'side' | 'rear' | 'cab';
export type CameraMoveSpeed = 'slow' | 'normal' | 'fast';

export interface CutawaySettingsState {
  groundOpacity: number; // 0.12 .. 1.0
  cutawayRadius: number; // 350 .. 2400 m
  verticalExaggeration: number; // 1.0 .. 2.5
  pinCutaway: boolean;
  hideBuildings: boolean;
  clipEnabled: boolean;
  clipY: number; // -45 .. +35
  visibleTiers: Record<SchematicTierId, boolean>;
}

export interface CameraModeState {
  mode: CameraModeId;
  previousMode: CameraModeId | null;
  lastSurfaceMode: 'city_overview' | 'street_level';
  lastNonFollowMode: Exclude<CameraModeId, 'train_follow'>;
  freeLookEnabled: boolean;
  moveSpeed: CameraMoveSpeed;
  followAngle: TrainFollowAngle;
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
      groundOpacity: 0.94,
      cutawayRadius: 850,
      verticalExaggeration: 1.4,
      pinCutaway: false,
      hideBuildings: false,
      clipEnabled: false,
      clipY: 20,
      visibleTiers: { ...DEFAULT_VISIBLE_TIERS },
    },
  };
}

export type CameraModeAction =
  | { type: 'SELECT_MODE'; mode: CameraModeId; trainId?: string | null }
  | { type: 'TOGGLE_FREE_LOOK'; enabled?: boolean }
  | { type: 'SET_MOVE_SPEED'; speed: CameraMoveSpeed }
  | { type: 'SET_FOLLOW_ANGLE'; angle: TrainFollowAngle }
  | { type: 'FOLLOW_TRAIN'; trainId: string; angle?: TrainFollowAngle }
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
          // Refuse entering train_follow without a target train ID
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

      // Leaving underground resets accidental clip/building hide unless staying in cutaway
      const cutaway =
        target === 'city_overview' || target === 'street_level'
          ? {
              ...state.cutaway,
              groundOpacity: 1.0,
              hideBuildings: false,
              clipEnabled: false,
            }
          : target === 'underground_cutaway'
            ? {
                ...state.cutaway,
                groundOpacity:
                  state.cutaway.groundOpacity >= 0.99 ? 0.94 : state.cutaway.groundOpacity,
                verticalExaggeration: Math.max(1.3, state.cutaway.verticalExaggeration),
              }
            : state.cutaway;

      // Auto-enable free look controls inside underground_explorer for tunnel cruising;
      // keep user-chosen freeLook off by default when jumping to city_overview.
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
        minCameraY: 16,
        maxCameraY: 16_000,
        minDistance: 220,
        maxDistance: 18_500,
        minPolarRad: 0.12,
        maxPolarRad: Math.PI * 0.46,
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
        minDistance: 28,
        maxDistance: 620,
        minPolarRad: 0.25,
        maxPolarRad: Math.PI * 0.56, // Allow gentle upward look at towers & elevated viaducts
        nearPlaneMin: 0.45,
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
        minDistance: 65,
        maxDistance: 9_000,
        minPolarRad: 0.1,
        maxPolarRad: Math.PI * 0.78,
        nearPlaneMin: 1.2,
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
        verticalExaggeration: 1.0, // Real 1:1 tunnel proportion inside bore!
        minCameraY: -60,
        maxCameraY: -1.5,
        minDistance: 6,
        maxDistance: 420,
        minPolarRad: 0.2,
        maxPolarRad: Math.PI * 0.88,
        nearPlaneMin: 0.45,
        canReturnToSurface: true,
        canExitToOverview: true,
      };

    case 'train_follow': {
      const useSideCutaway = followedTrainUnderground && followAngle === 'side';
      const useTunnelInside = followedTrainUnderground && followAngle !== 'side';
      return {
        mode,
        isSurface: !followedTrainUnderground,
        isUnderground: followedTrainUnderground,
        allowUndergroundGeometry: followedTrainUnderground,
        useRadialCutaway: useSideCutaway,
        useExplorerSolidTunnels: useTunnelInside,
        enableSurfaceCeilingOcclusion: useTunnelInside,
        verticalExaggeration: 1.0,
        minCameraY: followedTrainUnderground ? -55 : 4.0,
        maxCameraY: 4_000,
        minDistance: 12,
        maxDistance: 420,
        minPolarRad: 0.15,
        maxPolarRad: Math.PI * 0.85,
        nearPlaneMin: 0.45,
        canReturnToSurface: followedTrainUnderground,
        canExitToOverview: true,
      };
    }
  }
}

export interface CameraModeLabelInfo {
  id: CameraModeId;
  labelJa: string;
  labelEn: string;
  shortJa: string;
  shortEn: string;
  descriptionJa: string;
  descriptionEn: string;
}

export const CAMERA_MODE_METADATA: Record<CameraModeId, CameraModeLabelInfo> = {
  city_overview: {
    id: 'city_overview',
    labelJa: '都市俯瞰',
    labelEn: 'City Overview',
    shortJa: '都市俯瞰',
    shortEn: 'Overview',
    descriptionJa: '3D都市鳥瞰：左ドラッグ移動・中/右ドラッグ回転・ダブルクリック焦点',
    descriptionEn: '3D metropolitan overview: Left-drag pan, Mid/Right orbit, Dbl-click focus',
  },
  street_level: {
    id: 'street_level',
    labelJa: '街路レベル',
    labelEn: 'Street-Level',
    shortJa: '街路',
    shortEn: 'Street',
    descriptionJa: '近景都市観察：建物衝突回避・方位コンパス付で街路と高架を観察',
    descriptionEn: 'Street & viaduct view with building collision guard & orientation compass',
  },
  underground_cutaway: {
    id: 'underground_cutaway',
    labelJa: '地下剖切',
    labelEn: 'Underground Cutaway',
    shortJa: '地下剖切',
    shortEn: 'Cutaway',
    descriptionJa: '局所開削分析：階層フィルタ・単路線強調・深度関係可視化',
    descriptionEn: 'Local radial cutaway: tier filters, single-line focus & depth visualization',
  },
  underground_explorer: {
    id: 'underground_explorer',
    labelJa: '地下トンネル漫遊',
    labelEn: 'Underground Explorer',
    shortJa: '地下漫遊',
    shortEn: 'Explorer',
    descriptionJa: 'トンネル内部視点：W/S・ホイールで軌道沿い移動・中ドラッグ周囲観察',
    descriptionEn: 'Inside tunnels: W/S or wheel moves along bore, Mid-drag looks around',
  },
  train_follow: {
    id: 'train_follow',
    labelJa: '仮想列車追従',
    labelEn: 'Train Follow',
    shortJa: '列車追従',
    shortEn: 'Follow',
    descriptionJa: '仮想シミュレーション列車を追従（先頭/側面/後方/運転台切替・非実時）',
    descriptionEn: 'Follow simulated train (Front/Side/Rear/Cab rigs · Non-realtime synthetic)',
  },
};
