import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, type Ref, type RefObject } from 'react';
import { DoubleSide, MOUSE, NeutralToneMapping, NoToneMapping, PMREMGenerator, Spherical, TOUCH, Vector3, type Object3D, type PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { StationGraph } from '../domain/graph';
import type { StationModel } from '../domain/types';
import { buildRoutePrims, buildScene, maxTierForScale, routeBox, routePoints, type RoutePoint, type SceneLabel, type ViewOptions } from './scene/build';
import {
  FOV,
  MAX_POLAR,
  MIN_DISTANCE,
  MIN_POLAR,
  easeInOut,
  focusPose,
  homePose,
  maxDistanceFor,
  mixPose,
  targetLimits,
  type Pose,
} from './scene/camera';
import { OPAQUE_MATERIALS, buildOutlines, elementAtFace, mergeDecals, mergePrims, partition, type MergedMesh } from './scene/geometry';
import type { MaterialKind } from './scene/prims';
import type { SceneTheme } from './sceneTheme';
import { TrainLayer } from './trains/TrainLayer';
import type { SimClock } from '../trains/clock';
import type { TrainPlan } from '../trains/simulate';
import { inkOn } from './theme';

export interface SceneHandle {
  reset(): void;
  zoom(factor: number): void;
  rotate(deltaAzimuth: number): void;
  tilt(deltaPolar: number): void;
  /** Fly to a box of the scene (world coordinates). */
  focusBox(box: { min: [number, number, number]; max: [number, number, number] }): void;
}

/** The trains of the timetable simulation; null = not shown. */
export interface SceneTrains {
  plans: TrainPlan[];
  clock: RefObject<SimClock>;
  lineColor: Map<string, string>;
  shown(plan: TrainPlan): boolean;
  selectedId: string | null;
  onSelect(planId: string): void;
}

export interface RenderStats {
  triangles: number;
  calls: number;
  lines: number;
  geometries: number;
}

declare global {
  interface Window {
    __SENKIRO_STATS__?: RenderStats & {
      frames: number;
      cameraDistance: number;
      cameraPolar: number;
      cameraTarget: [number, number, number];
      labelsShown: number;
      animating: boolean;
    };
  }
}

interface Props {
  model: StationModel;
  graph: StationGraph;
  view: ViewOptions;
  /** Lighting and tone mapping of the model; its palette is the one in `view`. */
  sceneTheme: SceneTheme;
  /** The drawn route, shared with the labels and the 2D plan. */
  routePts: RoutePoint[];
  labels: SceneLabel[];
  trains: SceneTrains | null;
  showLabels: boolean;
  ariaLabel: string;
  handleRef: Ref<SceneHandle>;
  onSelect(id: string | null): void;
  onStats(stats: RenderStats): void;
  /** Render continuously (for frame-rate measurement) instead of on demand. */
  continuous: boolean;
  /** Animate camera moves; off = jump. */
  animate: boolean;
}

/** Screen rectangle of a label that is currently shown, for click picking. */
interface LabelRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  elementId: string | null;
}

/**
 * Surface finish of the two reflective material kinds (PBR). Floors, walls,
 * concrete and painted parts are matt and use a plain diffuse material.
 * Colour always comes from the vertices.
 */
const FINISH: Partial<Record<MaterialKind, { roughness: number; metalness: number }>> = {
  metal: { roughness: 0.36, metalness: 0.78 },
  glass: { roughness: 0.12, metalness: 0.1 },
};

const FLY_MS = 650;

export function Scene3D(props: Props) {
  const labelLayer = useRef<HTMLDivElement>(null);
  const labelRects = useRef<LabelRect[]>([]);
  const down = useRef<{ x: number; y: number } | null>(null);
  const onKeyDown = useKeyboard(props.handleRef);

  // Labels never take pointer events — dragging or scrolling over one must still
  // move the camera. A click that lands on a label selects its element instead.
  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    const start = down.current;
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) return; // a drag
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    const hit = labelRects.current.find((r) => r.elementId !== null && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
    if (hit?.elementId) {
      e.stopPropagation();
      props.onSelect(hit.elementId);
    }
  };

  return (
    <div
      className="scene"
      data-testid="scene-3d"
      onPointerDownCapture={(e) => {
        down.current = { x: e.clientX, y: e.clientY };
      }}
      onClickCapture={onClickCapture}
      onContextMenu={(e) => e.preventDefault()}
      onAuxClick={(e) => e.preventDefault()}
    >
      <Canvas
        flat
        dpr={[1, 2]}
        frameloop={props.continuous ? 'always' : 'demand'}
        camera={{ fov: FOV, near: 1.5, far: 1400, position: [60, 80, 90] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        tabIndex={0}
        role="application"
        aria-label={props.ariaLabel}
        onKeyDown={onKeyDown}
        onPointerMissed={() => props.onSelect(null)}
      >
        <SceneContent {...props} labelLayer={labelLayer} labelRects={labelRects} />
      </Canvas>
      <div className="labels" ref={labelLayer} aria-hidden={!props.showLabels} hidden={!props.showLabels}>
        {props.labels.map((l) => (
          <span key={l.key} className={`label label-${l.variant}`} data-key={l.key} data-tier={l.tier} style={HIDDEN}>
            <span className="label-text">{l.text}</span>
            {l.chips?.map((c, i) => (
              <span key={i} className="label-chip" style={{ ['--c' as string]: c.color, color: inkOn(c.color) }}>
                <span className="label-chip-text">{c.text}</span>
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Labels stay hidden until the first frame has placed them. React sets this once; the frame loop owns it afterwards. */
const HIDDEN = { display: 'none' } as const;

function useKeyboard(handleRef: Ref<SceneHandle>) {
  return (e: React.KeyboardEvent) => {
    const h = (handleRef as RefObject<SceneHandle | null>).current;
    if (!h) return;
    const map: Record<string, () => void> = {
      ArrowLeft: () => h.rotate(-0.12),
      ArrowRight: () => h.rotate(0.12),
      ArrowUp: () => h.tilt(-0.08),
      ArrowDown: () => h.tilt(0.08),
      '+': () => h.zoom(0.85),
      '=': () => h.zoom(0.85),
      '-': () => h.zoom(1 / 0.85),
      '0': () => h.reset(),
    };
    const fn = map[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  };
}

function SceneContent({
  model,
  view,
  sceneTheme,
  routePts,
  labels,
  trains,
  showLabels,
  handleRef,
  onSelect,
  onStats,
  labelLayer,
  labelRects,
  animate,
}: Props & { labelLayer: RefObject<HTMLDivElement | null>; labelRects: RefObject<LabelRect[]> }) {
  const { camera, gl, scene, invalidate, size } = useThree();
  const controlsRef = useRef<OrbitControls | null>(null);
  const pickables = useRef(new Map<Object3D, MergedMesh>());
  const frames = useRef(0);
  const lastStats = useRef('');
  const viewRef = useRef(view);
  viewRef.current = view;
  const animateRef = useRef(animate);
  animateRef.current = animate;
  const flight = useRef<{ from: Pose; to: Pose; start: number } | null>(null);

  // --- environment: a procedural studio, so metal and glass have something to reflect ---
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.22;
    invalidate();
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, invalidate]);

  // --- tone mapping: part of the scene theme, never of the interface theme ---
  useEffect(() => {
    gl.toneMapping = sceneTheme.toneMapping === 'neutral' ? NeutralToneMapping : NoToneMapping;
    gl.toneMappingExposure = sceneTheme.exposure;
    invalidate();
  }, [gl, sceneTheme, invalidate]);

  // --- geometry -------------------------------------------------------------------
  const parts = useMemo(() => buildScene(model, view), [model, view]);
  const meshes = useMemo(() => {
    const { opaque, translucent } = partition(parts.prims);
    return {
      opaque: OPAQUE_MATERIALS.map((kind) => ({ kind, mesh: mergePrims(opaque.get(kind) ?? []) })).filter((m) => m.mesh.triangleCount > 0),
      translucent: mergePrims(translucent),
      outlines: buildOutlines(parts.prims),
      decals: mergeDecals(parts.decals),
    };
  }, [parts]);
  const routeMesh = useMemo(() => mergePrims(buildRoutePrims(model, view.route, routePts, view)), [model, view, routePts]);

  useEffect(
    () => () => {
      for (const m of meshes.opaque) m.mesh.geometry.dispose();
      meshes.translucent.geometry.dispose();
      meshes.outlines.dispose();
      meshes.decals.dispose();
    },
    [meshes],
  );
  useEffect(() => () => routeMesh.geometry.dispose(), [routeMesh]);
  useEffect(() => invalidate(), [meshes, routeMesh, labels, showLabels, invalidate]);

  // --- camera ---------------------------------------------------------------------
  const aspect = () => size.width / Math.max(1, size.height);

  const currentPose = (): Pose => {
    const controls = controlsRef.current;
    const target = controls ? controls.target.clone() : new Vector3();
    const s = new Spherical().setFromVector3(camera.position.clone().sub(target));
    return { target, radius: s.radius, polar: s.phi, azimuth: s.theta };
  };

  const applyPose = (pose: Pose) => {
    const controls = controlsRef.current;
    camera.position.setFromSpherical(new Spherical(pose.radius, pose.polar, pose.azimuth)).add(pose.target);
    camera.lookAt(pose.target);
    if (controls) {
      controls.target.copy(pose.target);
      controls.update();
    }
    invalidate();
  };

  const flyTo = (to: Pose, instant = false) => {
    const controls = controlsRef.current;
    if (controls) {
      controls.maxDistance = Math.max(controls.maxDistance, to.radius * 1.2);
      // spend whatever inertia is left from the last drag now, so it cannot nudge the view after the move
      controls.enableDamping = false;
      controls.update();
      controls.enableDamping = true;
    }
    if (instant || !animateRef.current) {
      flight.current = null;
      applyPose(to);
      return;
    }
    flight.current = { from: currentPose(), to, start: performance.now() };
    invalidate();
  };

  const home = () => homePose(model, viewRef.current, aspect());

  useLayoutEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.screenSpacePanning = false;
    controls.minDistance = MIN_DISTANCE;
    controls.minPolarAngle = MIN_POLAR;
    controls.maxPolarAngle = MAX_POLAR;
    controls.zoomToCursor = true;
    // left: orbit · middle and right: drag the model · wheel: zoom (Shift/Ctrl + left also drags)
    controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.PAN };
    controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };
    controls.addEventListener('change', () => invalidate());
    // any direct manipulation takes over from a camera move in progress
    controls.addEventListener('start', () => {
      flight.current = null;
    });
    const stop = () => {
      flight.current = null;
    };
    gl.domElement.addEventListener('wheel', stop, { passive: true });
    controlsRef.current = controls;
    const pose = home();
    controls.maxDistance = maxDistanceFor(pose.radius);
    applyPose(pose);
    return () => {
      gl.domElement.removeEventListener('wheel', stop);
      controls.dispose();
      controlsRef.current = null;
    };
    // The controls are created once; later resizes must not reset the user's view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl]);

  // Choosing floors re-frames the view on them.
  const floorsKey = view.focusLeg === null ? (view.focusOrdinals ? [...view.focusOrdinals].sort().join(',') : 'all') : null;
  const firstFloors = useRef(true);
  useEffect(() => {
    if (firstFloors.current) {
      firstFloors.current = false;
      return;
    }
    if (floorsKey !== null) flyTo(home());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorsKey]);

  // Focusing a route leg flies to it.
  const legKey = view.route && view.focusLeg !== null ? `${view.route.nodeIds[0]}>${view.route.nodeIds.at(-1)}#${view.focusLeg}` : null;
  useEffect(() => {
    if (legKey === null || view.focusLeg === null) return;
    const box = routeBox(model, routePts, view.focusLeg, view.explode);
    if (box) flyTo(focusPose(box, aspect(), currentPose()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legKey]);

  const limits = useMemo(() => targetLimits(model), [model]);
  const clampTarget = (controls: OrbitControls) => {
    const tgt = controls.target;
    const x = Math.min(limits.max[0], Math.max(limits.min[0], tgt.x));
    const y = Math.min(limits.max[1], Math.max(limits.min[1], tgt.y));
    const z = Math.min(limits.max[2], Math.max(limits.min[2], tgt.z));
    if (x !== tgt.x || y !== tgt.y || z !== tgt.z) {
      camera.position.x += x - tgt.x;
      camera.position.y += y - tgt.y;
      camera.position.z += z - tgt.z;
      tgt.set(x, y, z);
    }
  };

  useImperativeHandle(
    handleRef,
    (): SceneHandle => {
      const orbit = (fn: (s: Spherical) => void) => {
        const controls = controlsRef.current;
        if (!controls) return;
        flight.current = null;
        const offset = camera.position.clone().sub(controls.target);
        const s = new Spherical().setFromVector3(offset);
        fn(s);
        s.phi = Math.min(controls.maxPolarAngle, Math.max(controls.minPolarAngle, s.phi));
        s.radius = Math.min(controls.maxDistance, Math.max(controls.minDistance, s.radius));
        camera.position.setFromSpherical(s).add(controls.target);
        camera.lookAt(controls.target);
        controls.update();
        invalidate();
      };
      return {
        reset: () => flyTo(home()),
        zoom: (factor) => orbit((s) => (s.radius *= factor)),
        rotate: (d) => orbit((s) => (s.theta += d)),
        tilt: (d) => orbit((s) => (s.phi += d)),
        focusBox: (box) => flyTo(focusPose(box, aspect(), currentPose())),
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [camera, invalidate, model, size.width, size.height],
  );

  // --- labels: level of detail by scale, then greedy collision culling ----------------
  const labelIndex = useMemo(() => new Map(labels.map((l) => [l.key, l])), [labels]);
  const labelSizes = useRef(new Map<string, { w: number; h: number }>());
  const lastTier = useRef(-1);
  useEffect(() => {
    labelSizes.current.clear();
  }, [labels]);

  const v = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const controls = controlsRef.current;
    const fl = flight.current;
    if (fl) {
      const k = Math.min(1, (performance.now() - fl.start) / FLY_MS);
      applyPose(mixPose(fl.from, fl.to, easeInOut(k)));
      if (k >= 1) flight.current = null;
      else invalidate();
    } else if (controls) {
      clampTarget(controls);
      controls.update();
    }
    frames.current += 1;

    const distance = controls ? camera.position.distanceTo(controls.target) : 0;
    let shown = 0;
    const layer = labelLayer.current;
    if (layer && showLabels) {
      const pxPerUnit = size.height / (2 * Math.tan((FOV * Math.PI) / 360) * Math.max(1, distance));
      const maxTier = maxTierForScale(pxPerUnit);
      if (maxTier !== lastTier.current) {
        // far away the platform labels shrink to numbers and dots (CSS), so sizes change
        lastTier.current = maxTier;
        layer.dataset.zoom = String(maxTier);
        labelSizes.current.clear();
      }
      const items: { el: HTMLElement; label: SceneLabel; x: number; y: number; w: number; h: number }[] = [];
      for (const el of Array.from(layer.children) as HTMLElement[]) {
        const label = labelIndex.get(el.dataset.key ?? '');
        if (!label || label.tier > maxTier) {
          el.style.display = 'none';
          continue;
        }
        v.set(label.position[0], label.position[1], label.position[2]).project(camera);
        if (v.z < -1 || v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) {
          el.style.display = 'none';
          continue;
        }
        let sz = labelSizes.current.get(label.key);
        if (!sz) {
          el.style.display = '';
          sz = { w: el.offsetWidth, h: el.offsetHeight };
          labelSizes.current.set(label.key, sz);
        }
        items.push({ el, label, x: (v.x * 0.5 + 0.5) * size.width, y: (-v.y * 0.5 + 0.5) * size.height, w: sz.w, h: sz.h });
      }
      items.sort((a, b) => b.label.priority - a.label.priority);
      const placed: LabelRect[] = [];
      for (const it of items) {
        const r: LabelRect = { x0: it.x - it.w / 2 - 3, x1: it.x + it.w / 2 + 3, y0: it.y - it.h - 2, y1: it.y + 2, elementId: it.label.elementId };
        const clash = placed.some((q) => r.x0 < q.x1 && q.x0 < r.x1 && r.y0 < q.y1 && q.y0 < r.y1);
        if (clash) {
          it.el.style.display = 'none';
          continue;
        }
        placed.push(r);
        shown += 1;
        it.el.style.display = '';
        it.el.style.transform = `translate(${Math.round(it.x - it.w / 2)}px, ${Math.round(it.y - it.h)}px)`;
      }
      labelRects.current = placed;
    } else {
      labelRects.current = [];
    }

    // The renderer draws right after these callbacks, inside the same animation
    // frame; a microtask therefore reads the counters of the frame just drawn.
    const frame = frames.current;
    const polar = controls ? controls.getPolarAngle() : 0;
    const tgt: [number, number, number] = controls ? [controls.target.x, controls.target.y, controls.target.z] : [0, 0, 0];
    const animating = flight.current !== null;
    queueMicrotask(() => {
      const info = gl.info;
      const stats: RenderStats = {
        triangles: info.render.triangles,
        calls: info.render.calls,
        lines: info.render.lines,
        geometries: info.memory.geometries,
      };
      window.__SENKIRO_STATS__ = { ...stats, frames: frame, cameraDistance: distance, cameraPolar: polar, cameraTarget: tgt, labelsShown: shown, animating };
      const key = `${stats.triangles}/${stats.calls}/${stats.lines}`;
      if (key !== lastStats.current && stats.calls > 0) {
        lastStats.current = key;
        onStats(stats);
      }
    });
  });

  // --- picking --------------------------------------------------------------------
  const register = (mesh: MergedMesh) => (obj: Object3D | null) => {
    if (obj) pickables.current.set(obj, mesh);
  };
  useEffect(() => {
    const map = pickables.current;
    return () => map.clear();
  }, [meshes]);

  const pick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return; // it was a drag, not a click
    e.stopPropagation();
    for (const hit of e.intersections) {
      const mesh = pickables.current.get(hit.object);
      if (!mesh) continue;
      const id = elementAtFace(mesh, hit.faceIndex);
      if (id) {
        onSelect(id);
        return;
      }
    }
    onSelect(null);
  };

  return (
    <>
      <color attach="background" args={[view.palette.background]} />
      <hemisphereLight args={[sceneTheme.ambient.sky, sceneTheme.ambient.ground, sceneTheme.ambient.intensity]} />
      <directionalLight position={sceneTheme.key.position} color={sceneTheme.key.color} intensity={sceneTheme.key.intensity} />
      <directionalLight position={sceneTheme.fill.position} color={sceneTheme.fill.color} intensity={sceneTheme.fill.intensity} />
      {meshes.opaque.map(({ kind, mesh }) => (
        <mesh key={kind} ref={register(mesh)} geometry={mesh.geometry} onClick={pick}>
          {kind === 'metal' ? (
            <meshStandardMaterial vertexColors {...FINISH[kind]} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
          ) : (
            // matt surfaces need no reflections: the cheaper diffuse model looks the same and costs far less per pixel
            <meshLambertMaterial vertexColors polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
          )}
        </mesh>
      ))}
      <mesh geometry={meshes.decals} renderOrder={1} raycast={() => null}>
        <meshBasicMaterial vertexColors transparent depthWrite={false} side={DoubleSide} toneMapped={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
      </mesh>
      <lineSegments geometry={meshes.outlines} renderOrder={2}>
        <lineBasicMaterial vertexColors toneMapped={false} />
      </lineSegments>
      <mesh ref={register(meshes.translucent)} geometry={meshes.translucent.geometry} onClick={pick} renderOrder={3}>
        <meshStandardMaterial vertexColors transparent depthWrite={false} {...FINISH.glass} />
      </mesh>
      {trains && <TrainLayer model={model} view={view} {...trains} />}
      {/* the route twice: solid where it is in view, faint where something stands in front of it */}
      <mesh geometry={routeMesh.geometry} renderOrder={4} raycast={() => null}>
        <meshBasicMaterial vertexColors toneMapped={false} />
      </mesh>
      <mesh geometry={routeMesh.geometry} renderOrder={5} raycast={() => null}>
        <meshBasicMaterial vertexColors transparent opacity={0.42} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
    </>
  );
}
