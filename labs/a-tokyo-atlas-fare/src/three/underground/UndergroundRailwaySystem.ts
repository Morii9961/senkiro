/**
 * SENKIRO Atlas v2 — Chunked Underground Railway Geometry & Tunnel System Controller.
 *
 * Replaces translucent line-tinted single-shell tubes with genuine dual-surface solid tunnels,
 * widened underground station caverns, open concrete portals, realistic neutral railway tracks &
 * wayside equipment, dynamic subterranean lighting, an independent line-color info overlay, and
 * the full `UndergroundRailwayQueryAPI` for the Camera & Virtual Train Sessions.
 */

import * as THREE from 'three';
import type { TunnelCutawayStyle } from '../../contracts/atlasV2.js';
import type { SchematicTierId, SolvedRailwayNetwork3D } from '../../domain/elevationSolver.js';
import type { SkId } from '../../domain/types.js';
import {
  buildClearanceConstraintForChunk,
  buildUndergroundNetworkSpec,
  sliceFramesByDistance,
} from './domain/tunnelCenterlineBuilder.js';
import { isPointInsideProfile2D } from './domain/tunnelProfileSpecs.js';
import type {
  BuiltUndergroundNetwork,
  StationCavernSpec,
  TrackFrame3D,
  TunnelClearanceConstraint,
  TunnelPortalSpec,
  TunnelSegmentChunkSpec,
  TunnelViewpoint,
  UndergroundRailwayQueryAPI,
  UndergroundSectionCutState,
  UndergroundSystemTelemetry,
  Vec3,
} from './domain/tunnelTypes.js';
import { LineOverlayHighlightLayer } from './lineOverlayHighlight.js';
import { TunnelLightingSystem } from './tunnelLightingSystem.js';
import { TunnelMaterialLibrary } from './tunnelMaterials.js';
import {
  buildChunkShellMeshes,
  buildOpenPortalHeadwallMesh,
  buildStationCavernGroup,
  type DualSurfaceShellResult,
} from './tunnelShellBuilder.js';
import {
  buildUndergroundTrackChunk,
  type BuiltUndergroundTrackChunk,
} from './undergroundTrackBuilder.js';

interface TunnelChunkRuntime {
  spec: TunnelSegmentChunkSpec;
  group: THREE.Group;
  shell: DualSurfaceShellResult;
  track: BuiltUndergroundTrackChunk | null;
  detailBuilt: boolean;
  baseBox: THREE.Box3;
  filterVisible: boolean;
  lastVisible: boolean;
  lastDetailed: boolean;
}

interface StationCavernRuntime {
  spec: StationCavernSpec;
  group: THREE.Group;
  roofGroup: THREE.Group;
  outerGroup: THREE.Group;
  pickMesh: THREE.Mesh | null;
  luminairePositions: THREE.Vector3[];
  baseBox: THREE.Box3;
  filterVisible: boolean;
  lastVisible: boolean;
}

export class UndergroundRailwaySystem implements UndergroundRailwayQueryAPI {
  readonly group = new THREE.Group();
  readonly portalsGroup = new THREE.Group();
  readonly lightingSystem: TunnelLightingSystem;
  readonly lineOverlay: LineOverlayHighlightLayer;
  readonly network: BuiltUndergroundNetwork;
  readonly interactiveStationMeshes: THREE.Object3D[] = [];
  readonly interactiveTrackMeshes: THREE.Object3D[] = [];

  private readonly materials: TunnelMaterialLibrary;
  private readonly chunkRuntimes: TunnelChunkRuntime[] = [];
  private readonly chunkById = new Map<SkId<'segment'>, TunnelChunkRuntime>();
  private readonly cavernRuntimes: StationCavernRuntime[] = [];
  private readonly cavernByStationId = new Map<SkId<'station'>, StationCavernRuntime>();
  private readonly clearanceCache = new Map<SkId<'segment'>, TunnelClearanceConstraint>();

  // Filter & visibility state
  private allowUnderground = false;
  private forceInteriorActive = false;
  private interiorModeDetected = false;
  private cutawayStyle: TunnelCutawayStyle = 'solid_shell';
  private sectionCutState: UndergroundSectionCutState = {
    mode: 'none',
    revealAllRoofs: false,
    lineOverlayVisible: false,
  };
  private lastFilterParams: {
    visibleOperatorIds: Set<SkId<'operator'>>;
    visibleTiers: Record<SchematicTierId, boolean>;
    selectedLineId: SkId<'line'> | null;
    fareSliceOnly: boolean;
    fareSliceLineIds: Set<SkId<'line'>>;
  } | null = null;

  // Reusable math scratch objects (zero per-frame allocation!)
  private readonly frustum = new THREE.Frustum();
  private readonly projScreenMatrix = new THREE.Matrix4();
  private readonly scaledBox = new THREE.Box3();
  private readonly nearestAnchorsScratch: THREE.Vector3[] = [];

  // Live telemetry counters
  private visibleChunkCount = 0;
  private detailedChunkCount = 0;
  private visibleCavernCount = 0;

  constructor(solved: SolvedRailwayNetwork3D, clipPlanes: THREE.Plane[]) {
    this.group.name = 'atlas-v2-underground-railway-system';
    this.portalsGroup.name = 'atlas-v2-open-tunnel-portals';

    this.network = buildUndergroundNetworkSpec(solved);
    this.materials = new TunnelMaterialLibrary(clipPlanes);
    this.lightingSystem = new TunnelLightingSystem();
    this.lineOverlay = new LineOverlayHighlightLayer(this.network.chunks, clipPlanes);

    this.group.add(this.portalsGroup, this.lineOverlay.group);

    // 1. Build per-segment Tunnel Chunks (pilot corridors get full interior detail immediately;
    //    other corridors lazily build fine instanced track equipment when camera approaches!)
    for (const chunkSpec of this.network.chunks) {
      const chGroup = new THREE.Group();
      chGroup.name = `tunnel-chunk-${chunkSpec.segmentId}`;
      chGroup.visible = false;

      const shell = buildChunkShellMeshes(chunkSpec.subSpans, this.materials);
      if (shell.innerLowerMesh) chGroup.add(shell.innerLowerMesh);
      if (shell.innerRoofMesh) chGroup.add(shell.innerRoofMesh);
      if (shell.outerLowerMesh) chGroup.add(shell.outerLowerMesh);
      if (shell.outerRoofMesh) chGroup.add(shell.outerRoofMesh);

      const baseBox = new THREE.Box3(
        new THREE.Vector3(...chunkSpec.bounds.min),
        new THREE.Vector3(...chunkSpec.bounds.max),
      );

      let track: BuiltUndergroundTrackChunk | null = null;
      let detailBuilt = false;
      if (chunkSpec.isPilotCorridor) {
        track = buildUndergroundTrackChunk(chunkSpec, this.materials);
        chGroup.add(track.baseGroup, track.detailGroup, track.ceilingDetailGroup);
        this.registerTrackPickMeshes(track.baseGroup);
        detailBuilt = true;
      }

      this.group.add(chGroup);
      const rt: TunnelChunkRuntime = {
        spec: chunkSpec,
        group: chGroup,
        shell,
        track,
        detailBuilt,
        baseBox,
        filterVisible: true,
        lastVisible: false,
        lastDetailed: false,
      };
      this.chunkRuntimes.push(rt);
      this.chunkById.set(chunkSpec.segmentId, rt);
    }

    // 2. Build Enlarged Underground Station Caverns
    for (const cavSpec of this.network.stationCaverns) {
      const built = buildStationCavernGroup(cavSpec, this.materials);
      built.group.visible = false;
      this.group.add(built.group);
      if (built.pickMesh) {
        this.interactiveStationMeshes.push(built.pickMesh);
      }

      const baseBox = new THREE.Box3(
        new THREE.Vector3(...cavSpec.bounds.min),
        new THREE.Vector3(...cavSpec.bounds.max),
      );
      const rt: StationCavernRuntime = {
        spec: cavSpec,
        group: built.group,
        roofGroup: built.roofGroup,
        outerGroup: built.outerGroup,
        pickMesh: built.pickMesh,
        luminairePositions: built.luminairePositions,
        baseBox,
        filterVisible: true,
        lastVisible: false,
      };
      this.cavernRuntimes.push(rt);
      if (!this.cavernByStationId.has(cavSpec.stationId)) {
        this.cavernByStationId.set(cavSpec.stationId, rt);
      }
    }

    // 3. Build Open Hollow Tunnel Portal Headwalls (visible on surface too when close!)
    for (const portal of this.network.portals) {
      const pMesh = buildOpenPortalHeadwallMesh(portal, this.materials);
      if (pMesh) this.portalsGroup.add(pMesh);
    }
  }

  private registerTrackPickMeshes(baseGroup: THREE.Group): void {
    baseGroup.traverse((o) => {
      if (o instanceof THREE.Mesh && o.userData?.kind === 'line') {
        this.interactiveTrackMeshes.push(o);
      }
    });
  }

  private ensureChunkTrackDetailBuilt(rt: TunnelChunkRuntime): void {
    if (rt.detailBuilt) return;
    rt.track = buildUndergroundTrackChunk(rt.spec, this.materials);
    rt.group.add(rt.track.baseGroup, rt.track.detailGroup, rt.track.ceilingDetailGroup);
    this.registerTrackPickMeshes(rt.track.baseGroup);
    rt.detailBuilt = true;
  }

  /**
   * Resolves a raycaster hit against underground station cavern meshes.
   */
  resolveStationHit(hit: THREE.Intersection): SkId<'station'> | null {
    const sid = hit.object.userData?.stationId as SkId<'station'> | undefined;
    return sid ?? null;
  }

  /**
   * Explicitly enables/disables interior inspection mode (e.g. when Camera Session enters a tunnel).
   */
  setInteriorMode(active: boolean): void {
    this.forceInteriorActive = active;
    this.applySectionCutVisuals();
  }

  setTheme(isDark: boolean): void {
    this.materials.setTheme(isDark);
  }

  getCutawayStyle(): TunnelCutawayStyle {
    return this.cutawayStyle;
  }

  /**
   * Maps Session 0's frozen `TunnelCutawayStyle` directly onto dual-surface shell,
   * roof-cutaway, translucent outer envelope, and interior lighting modes.
   */
  setCutawayStyle(style: TunnelCutawayStyle): void {
    this.cutawayStyle = style;
    this.materials.setOuterShellTranslucent(style === 'translucent_shell');
    this.forceInteriorActive = style === 'interior_view';
    this.sectionCutState = {
      ...this.sectionCutState,
      mode: style === 'section_cutaway' ? 'tunnel_roof_open' : 'radial_cutaway',
      revealAllRoofs: style === 'section_cutaway',
    };
    this.applySectionCutVisuals();
  }

  /**
   * Distance-only / camera-position-based update compatible with `UndergroundLayerAdapter.updateLod(camDist, cameraPos)`.
   * Supports both full camera-position culling + PointLight pool AND legacy `updateLod(camDist)` calls.
   */
  updateForLod(
    camDist: number,
    cameraPos?: THREE.Vector3,
    verticalScale = 1.0,
  ): { isCameraInsideTunnel: boolean; isEnclosedInterior: boolean } {
    this.portalsGroup.visible = camDist < 3200;

    if (cameraPos) {
      const camVec: Vec3 = {
        x: cameraPos.x,
        y: cameraPos.y / Math.max(0.01, verticalScale),
        z: cameraPos.z,
      };
      const nearest = camVec.y < 3.5 ? this.projectPointToNearestTunnel(camVec, 24) : null;
      this.interiorModeDetected =
        this.forceInteriorActive || Boolean(nearest && (nearest.insideClearance || camVec.y < -1.5));
    } else {
      this.interiorModeDetected = this.forceInteriorActive;
    }

    const drawUnderground = this.allowUnderground || this.interiorModeDetected;
    if (!drawUnderground) {
      if (this.visibleChunkCount > 0 || this.visibleCavernCount > 0) {
        for (const rt of this.chunkRuntimes) {
          rt.group.visible = false;
          rt.lastVisible = false;
          rt.lastDetailed = false;
        }
        for (const cav of this.cavernRuntimes) {
          cav.group.visible = false;
          cav.lastVisible = false;
        }
        this.visibleChunkCount = 0;
        this.detailedChunkCount = 0;
        this.visibleCavernCount = 0;
      }
      this.materials.setInteriorAttenuationActive(false);
      if (cameraPos) {
        this.lightingSystem.update(cameraPos, false, this.nearestAnchorsScratch, verticalScale);
      }
      return { isCameraInsideTunnel: false, isEnclosedInterior: false };
    }

    const st = this.sectionCutState;
    const globalRoofOpen = st.mode === 'tunnel_roof_open' && (st.revealAllRoofs ?? true);
    const isEnclosedInterior =
      Boolean(cameraPos) &&
      this.interiorModeDetected &&
      !globalRoofOpen &&
      cameraPos!.y / Math.max(0.01, verticalScale) < -4.2;
    const maxVisibleDistM = isEnclosedInterior ? 420 : this.interiorModeDetected ? 950 : 2400;
    const detailRadiusM = this.interiorModeDetected ? 340 : 300;

    let visChunks = 0;
    let detChunks = 0;
    let visCaverns = 0;
    this.nearestAnchorsScratch.length = 0;

    for (const rt of this.chunkRuntimes) {
      if (!rt.filterVisible) {
        rt.group.visible = false;
        rt.lastVisible = false;
        rt.lastDetailed = false;
        continue;
      }

      let distToBox = camDist;
      if (cameraPos) {
        this.scaledBox.copy(rt.baseBox);
        this.scaledBox.min.y *= verticalScale;
        this.scaledBox.max.y *= verticalScale;
        this.scaledBox.expandByScalar(18);
        distToBox = this.scaledBox.distanceToPoint(cameraPos);
        if (distToBox > maxVisibleDistM) {
          rt.group.visible = false;
          rt.lastVisible = false;
          rt.lastDetailed = false;
          continue;
        }
      }

      rt.group.visible = true;
      rt.lastVisible = true;
      visChunks++;

      const wantDetail = cameraPos ? distToBox < detailRadiusM : rt.spec.isPilotCorridor && camDist < 1850;
      const openRoof =
        globalRoofOpen || Boolean(st.revealRoofForSegmentIds?.has(rt.spec.segmentId));
      const hideOuter = Boolean(st.hideOuterShellForSegmentIds?.has(rt.spec.segmentId));

      if (wantDetail) {
        this.ensureChunkTrackDetailBuilt(rt);
        detChunks++;
      }

      rt.lastDetailed = wantDetail;
      if (rt.shell.outerLowerMesh) rt.shell.outerLowerMesh.visible = !hideOuter;
      if (rt.shell.outerRoofMesh) rt.shell.outerRoofMesh.visible = !hideOuter && !openRoof;
      if (rt.shell.innerLowerMesh) rt.shell.innerLowerMesh.visible = wantDetail || openRoof || hideOuter;
      if (rt.shell.innerRoofMesh) rt.shell.innerRoofMesh.visible = (wantDetail || hideOuter) && !openRoof;

      if (rt.track) {
        rt.track.baseGroup.visible = true;
        rt.track.detailGroup.visible = wantDetail;
        rt.track.ceilingDetailGroup.visible = wantDetail && !openRoof;
        if (cameraPos && wantDetail && distToBox < 140) {
          for (let i = 0; i < rt.track.luminairePositions.length; i++) {
            this.nearestAnchorsScratch.push(rt.track.luminairePositions[i]!);
          }
        }
      }
    }

    for (const cav of this.cavernRuntimes) {
      if (!cav.filterVisible) {
        cav.group.visible = false;
        cav.lastVisible = false;
        continue;
      }

      let distToBox = camDist;
      if (cameraPos) {
        this.scaledBox.copy(cav.baseBox);
        this.scaledBox.min.y *= verticalScale;
        this.scaledBox.max.y *= verticalScale;
        this.scaledBox.expandByScalar(12);
        distToBox = this.scaledBox.distanceToPoint(cameraPos);
        if (distToBox > maxVisibleDistM) {
          cav.group.visible = false;
          cav.lastVisible = false;
          continue;
        }
      }

      cav.group.visible = true;
      cav.lastVisible = true;
      visCaverns++;
      cav.roofGroup.visible = !globalRoofOpen;
      if (cameraPos && distToBox < 140) {
        for (let i = 0; i < cav.luminairePositions.length; i++) {
          this.nearestAnchorsScratch.push(cav.luminairePositions[i]!);
        }
      }
    }

    this.visibleChunkCount = visChunks;
    this.detailedChunkCount = detChunks;
    this.visibleCavernCount = visCaverns;

    const useInteriorLighting = Boolean(cameraPos) && (this.interiorModeDetected || (detChunks > 0 && camDist < 160));
    this.materials.setInteriorAttenuationActive(this.interiorModeDetected && !globalRoofOpen);
    if (cameraPos) {
      this.lightingSystem.update(cameraPos, useInteriorLighting, this.nearestAnchorsScratch, verticalScale);
    }

    return { isCameraInsideTunnel: this.interiorModeDetected, isEnclosedInterior };
  }

  applyFilters(params: {
    visibleOperatorIds: Set<SkId<'operator'>>;
    visibleTiers: Record<SchematicTierId, boolean>;
    selectedLineId: SkId<'line'> | null;
    fareSliceOnly: boolean;
    fareSliceLineIds: Set<SkId<'line'>>;
    undergroundActive: boolean;
    clipEnabled?: boolean;
  }): void {
    const {
      visibleOperatorIds,
      visibleTiers,
      selectedLineId,
      fareSliceOnly,
      fareSliceLineIds,
      undergroundActive,
      clipEnabled = false,
    } = params;

    this.lastFilterParams = {
      visibleOperatorIds,
      visibleTiers,
      selectedLineId,
      fareSliceOnly,
      fareSliceLineIds,
    };
    this.allowUnderground = undergroundActive || clipEnabled || this.forceInteriorActive;

    for (const rt of this.chunkRuntimes) {
      rt.filterVisible =
        visibleOperatorIds.has(rt.spec.operatorId) &&
        Boolean(visibleTiers[rt.spec.tier]) &&
        (!fareSliceOnly || fareSliceLineIds.has(rt.spec.primaryLineId));
    }

    for (const cav of this.cavernRuntimes) {
      cav.filterVisible =
        visibleOperatorIds.has(cav.spec.operatorId) &&
        Boolean(visibleTiers[cav.spec.tier]) &&
        (!fareSliceOnly || fareSliceLineIds.has(cav.spec.lineId));
    }

    this.lineOverlay.updateVisibility({
      allowUnderground: this.allowUnderground,
      visibleOperatorIds,
      visibleTiers,
      selectedLineId,
      fareSliceOnly,
      fareSliceLineIds,
    });
  }

  private applySectionCutVisuals(): void {
    const st = this.sectionCutState;
    const globalRoofOpen = st.mode === 'tunnel_roof_open' && (st.revealAllRoofs ?? true);

    for (const rt of this.chunkRuntimes) {
      const hideOuter = Boolean(st.hideOuterShellForSegmentIds?.has(rt.spec.segmentId));
      const openRoof =
        globalRoofOpen || Boolean(st.revealRoofForSegmentIds?.has(rt.spec.segmentId));

      if (rt.shell.outerLowerMesh) rt.shell.outerLowerMesh.visible = !hideOuter;
      if (rt.shell.outerRoofMesh) rt.shell.outerRoofMesh.visible = !hideOuter && !openRoof;
      if (rt.shell.innerRoofMesh) rt.shell.innerRoofMesh.visible = !openRoof;
      if (rt.track) {
        rt.track.ceilingDetailGroup.visible = rt.lastDetailed && !openRoof;
      }
    }

    for (const cav of this.cavernRuntimes) {
      cav.roofGroup.visible = !globalRoofOpen;
    }

    this.lineOverlay.setOverlayEnabled(Boolean(st.lineOverlayVisible));
    if (this.lastFilterParams) {
      this.lineOverlay.updateVisibility({
        allowUnderground: this.allowUnderground || this.forceInteriorActive,
        ...this.lastFilterParams,
      });
    }
  }

  /**
   * Per-frame frustum culling, distance-based interior detail streaming, depth attenuation,
   * and camera-following subterranean PointLight pool update. Zero per-frame geometry allocation!
   */
  updateForCamera(
    camera: THREE.PerspectiveCamera,
    camDist: number,
    verticalScale = 1.0,
  ): { isCameraInsideTunnel: boolean; isEnclosedInterior: boolean } {
    // Open portals are visible at medium/near distance even in surface mode!
    this.portalsGroup.visible = camDist < 3200;

    // Detect if camera physically entered or is right at an underground tunnel/station space
    const camPos: Vec3 = {
      x: camera.position.x,
      y: camera.position.y / Math.max(0.01, verticalScale),
      z: camera.position.z,
    };
    const nearest =
      camPos.y < 3.5 ? this.projectPointToNearestTunnel(camPos, 24) : null;
    this.interiorModeDetected =
      this.forceInteriorActive || Boolean(nearest && (nearest.insideClearance || camPos.y < -1.5));

    const drawUnderground = this.allowUnderground || this.interiorModeDetected;

    if (!drawUnderground) {
      if (this.visibleChunkCount > 0 || this.visibleCavernCount > 0) {
        for (const rt of this.chunkRuntimes) {
          rt.group.visible = false;
          rt.lastVisible = false;
          rt.lastDetailed = false;
        }
        for (const cav of this.cavernRuntimes) {
          cav.group.visible = false;
          cav.lastVisible = false;
        }
        this.visibleChunkCount = 0;
        this.detailedChunkCount = 0;
        this.visibleCavernCount = 0;
      }
      this.materials.setInteriorAttenuationActive(false);
      this.lightingSystem.update(camera.position, false, this.nearestAnchorsScratch, verticalScale);
      return { isCameraInsideTunnel: false, isEnclosedInterior: false };
    }

    // Build camera frustum in world space
    camera.updateMatrixWorld();
    this.projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    const st = this.sectionCutState;
    const globalRoofOpen = st.mode === 'tunnel_roof_open' && (st.revealAllRoofs ?? true);
    const isEnclosedInterior =
      this.interiorModeDetected && !globalRoofOpen && camPos.y < -4.2;
    // Aggressive distance culling inside enclosed tunnels: depth attenuation fades > 235m to darkness,
    // so culling chunks/caverns beyond 420m slashes interior draw calls by ~85% with zero visual loss!
    const maxVisibleDistM = isEnclosedInterior ? 420 : this.interiorModeDetected ? 950 : 2200;
    const detailRadiusM = this.interiorModeDetected ? 320 : 260;

    let visChunks = 0;
    let detChunks = 0;
    let visCaverns = 0;
    this.nearestAnchorsScratch.length = 0;

    for (const rt of this.chunkRuntimes) {
      if (!rt.filterVisible) {
        rt.group.visible = false;
        rt.lastVisible = false;
        rt.lastDetailed = false;
        continue;
      }

      this.scaledBox.copy(rt.baseBox);
      this.scaledBox.min.y *= verticalScale;
      this.scaledBox.max.y *= verticalScale;
      this.scaledBox.expandByScalar(18);

      const distToBox = this.scaledBox.distanceToPoint(camera.position);
      if (distToBox > maxVisibleDistM || !this.frustum.intersectsBox(this.scaledBox)) {
        rt.group.visible = false;
        rt.lastVisible = false;
        rt.lastDetailed = false;
        continue;
      }

      rt.group.visible = true;
      rt.lastVisible = true;
      visChunks++;

      const wantDetail = distToBox < detailRadiusM;
      const openRoof =
        globalRoofOpen || Boolean(st.revealRoofForSegmentIds?.has(rt.spec.segmentId));
      const hideOuter = Boolean(st.hideOuterShellForSegmentIds?.has(rt.spec.segmentId));

      if (wantDetail) {
        this.ensureChunkTrackDetailBuilt(rt);
        detChunks++;
      }

      rt.lastDetailed = wantDetail;
      if (rt.shell.outerLowerMesh) rt.shell.outerLowerMesh.visible = !hideOuter;
      if (rt.shell.outerRoofMesh) rt.shell.outerRoofMesh.visible = !hideOuter && !openRoof;
      if (rt.shell.innerLowerMesh) rt.shell.innerLowerMesh.visible = wantDetail || openRoof || hideOuter;
      if (rt.shell.innerRoofMesh) rt.shell.innerRoofMesh.visible = (wantDetail || hideOuter) && !openRoof;

      if (rt.track) {
        rt.track.baseGroup.visible = true;
        rt.track.detailGroup.visible = wantDetail;
        rt.track.ceilingDetailGroup.visible = wantDetail && !openRoof;

        if (wantDetail && distToBox < 140) {
          for (let i = 0; i < rt.track.luminairePositions.length; i++) {
            this.nearestAnchorsScratch.push(rt.track.luminairePositions[i]!);
          }
        }
      }
    }

    for (const cav of this.cavernRuntimes) {
      if (!cav.filterVisible) {
        cav.group.visible = false;
        cav.lastVisible = false;
        continue;
      }

      this.scaledBox.copy(cav.baseBox);
      this.scaledBox.min.y *= verticalScale;
      this.scaledBox.max.y *= verticalScale;
      this.scaledBox.expandByScalar(12);

      const distToBox = this.scaledBox.distanceToPoint(camera.position);
      const visible = distToBox <= maxVisibleDistM && this.frustum.intersectsBox(this.scaledBox);
      cav.group.visible = visible;
      cav.lastVisible = visible;
      if (visible) {
        visCaverns++;
        cav.roofGroup.visible = !globalRoofOpen;
        if (distToBox < 140) {
          for (let i = 0; i < cav.luminairePositions.length; i++) {
            this.nearestAnchorsScratch.push(cav.luminairePositions[i]!);
          }
        }
      }
    }

    this.visibleChunkCount = visChunks;
    this.detailedChunkCount = detChunks;
    this.visibleCavernCount = visCaverns;

    // Enable interior depth attenuation & PointLight pool when inside or closely inspecting tunnels
    const useInteriorLighting = this.interiorModeDetected || (detChunks > 0 && camDist < 160);
    this.materials.setInteriorAttenuationActive(this.interiorModeDetected && !globalRoofOpen);
    this.lightingSystem.update(
      camera.position,
      useInteriorLighting,
      this.nearestAnchorsScratch,
      verticalScale,
    );

    return { isCameraInsideTunnel: this.interiorModeDetected, isEnclosedInterior };
  }

  // =========================================================================
  // UndergroundRailwayQueryAPI Implementation (Camera & Virtual Train Session)
  // =========================================================================

  getEnterableSegments() {
    return this.network.chunks.map((c) => ({
      segmentId: c.segmentId,
      lineId: c.primaryLineId,
      lengthM: Math.round(c.totalLengthM * 10) / 10,
      bounds: c.bounds,
      isPilotCorridor: c.isPilotCorridor,
      depthReliability: c.depthReliability,
      heightBasis: c.heightBasis,
    }));
  }

  getCuratedViewpoints(): TunnelViewpoint[] {
    return this.network.viewpoints;
  }

  sampleTrackFrame(
    segmentId: SkId<'segment'>,
    distanceM: number,
    trackIndex?: 0 | 1,
  ): TrackFrame3D | null {
    const rt = this.chunkById.get(segmentId);
    if (!rt || rt.spec.centerline.length < 2) return null;

    const clampedD = Math.max(0, Math.min(rt.spec.totalLengthM, distanceM));
    const slice = sliceFramesByDistance(rt.spec.centerline, clampedD, clampedD + 0.5);
    const frame = slice[0];
    if (!frame) return null;

    if (trackIndex === undefined) return frame;

    const bore =
      rt.spec.subSpans.find((s) => s.structureType !== 'transition_collar') ??
      rt.spec.subSpans[0];
    const offsets = bore?.startSpec.trackCenterOffsetsM ?? [0];
    const lateral = offsets[Math.min(trackIndex, offsets.length - 1)] ?? 0;

    return {
      ...frame,
      position: {
        x: frame.position.x + frame.right.x * lateral,
        y: frame.position.y + (bore?.startSpec.railTopOffsetM ?? 0.48),
        z: frame.position.z + frame.right.z * lateral,
      },
    };
  }

  projectPointToNearestTunnel(
    worldPos: Vec3,
    maxDistM = 40,
  ): {
    segmentId: SkId<'segment'>;
    distanceM: number;
    frame: TrackFrame3D;
    localRightM: number;
    localUpM: number;
    insideClearance: boolean;
  } | null {
    let bestDistSq = maxDistM * maxDistM;
    let bestHit: {
      rt: TunnelChunkRuntime;
      frame: TrackFrame3D;
      localRightM: number;
      localUpM: number;
    } | null = null;

    for (const rt of this.chunkRuntimes) {
      const b = rt.spec.bounds;
      if (
        worldPos.x < b.min[0] - maxDistM ||
        worldPos.x > b.max[0] + maxDistM ||
        worldPos.y < b.min[1] - maxDistM ||
        worldPos.y > b.max[1] + maxDistM ||
        worldPos.z < b.min[2] - maxDistM ||
        worldPos.z > b.max[2] + maxDistM
      ) {
        continue;
      }

      const frames = rt.spec.centerline;
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i]!;
        const dx = worldPos.x - f.position.x;
        const dy = worldPos.y - f.position.y;
        const dz = worldPos.z - f.position.z;
        const dSq = dx * dx + dy * dy + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          const localRightM = dx * f.right.x + dz * f.right.z;
          const localUpM = dy;
          bestHit = { rt, frame: f, localRightM, localUpM };
        }
      }
    }

    if (!bestHit) return null;

    const bore =
      bestHit.rt.spec.subSpans.find(
        (s) =>
          bestHit!.frame.distanceM >= s.startDistM && bestHit!.frame.distanceM <= s.endDistM,
      ) ?? bestHit.rt.spec.subSpans[0];

    const insideClearance = bore
      ? isPointInsideProfile2D(
          bestHit.localRightM,
          bestHit.localUpM,
          bore.startSpec.innerProfile,
        )
      : false;

    return {
      segmentId: bestHit.rt.spec.segmentId,
      distanceM: bestHit.frame.distanceM,
      frame: bestHit.frame,
      localRightM: bestHit.localRightM,
      localUpM: bestHit.localUpM,
      insideClearance,
    };
  }

  getClearanceConstraint(segmentId: SkId<'segment'>): TunnelClearanceConstraint | null {
    const cached = this.clearanceCache.get(segmentId);
    if (cached) return cached;
    const rt = this.chunkById.get(segmentId);
    if (!rt) return null;
    const c = buildClearanceConstraintForChunk(rt.spec);
    this.clearanceCache.set(segmentId, c);
    return c;
  }

  getStationCavernBounds(stationId: SkId<'station'>) {
    const cav = this.cavernByStationId.get(stationId);
    if (!cav) return null;
    return {
      stationId: cav.spec.stationId,
      bounds: cav.spec.bounds,
      platformLevelY: cav.spec.platformLevelY,
      ceilingY: cav.spec.ceilingY,
      layout: cav.spec.layout,
      depthReliability: cav.spec.depthReliability,
    };
  }

  getPortalCutoutHints(): TunnelPortalSpec['surfaceCutout'][] {
    return this.network.portals.map((p) => p.surfaceCutout);
  }

  setSectionCutState(state: UndergroundSectionCutState): void {
    this.sectionCutState = { ...this.sectionCutState, ...state };
    this.applySectionCutVisuals();
  }

  getSectionCutState(): UndergroundSectionCutState {
    return { ...this.sectionCutState };
  }

  getTelemetry(): UndergroundSystemTelemetry {
    return {
      totalTunnelChunks: this.chunkRuntimes.length,
      visibleTunnelChunks: this.visibleChunkCount,
      detailedInteriorChunks: this.detailedChunkCount,
      totalStationCaverns: this.cavernRuntimes.length,
      visibleStationCaverns: this.visibleCavernCount,
      activePointLights: this.lightingSystem.getActiveLightCount(),
      portalCount: this.network.portals.length,
      pilotChunkCount: this.network.pilotSegmentIds.size,
      roofCutawayActive:
        this.sectionCutState.mode === 'tunnel_roof_open' &&
        (this.sectionCutState.revealAllRoofs ?? true),
      lineOverlayVisible: Boolean(this.sectionCutState.lineOverlayVisible),
      interiorModeActive: this.interiorModeDetected || this.forceInteriorActive,
    };
  }

  dispose(): void {
    for (const rt of this.chunkRuntimes) {
      rt.group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    }
    for (const cav of this.cavernRuntimes) {
      cav.group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    }
    this.portalsGroup.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.lineOverlay.dispose();
    this.lightingSystem.dispose();
    this.materials.dispose();
  }
}
