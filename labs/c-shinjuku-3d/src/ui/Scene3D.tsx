import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, type Ref, type RefObject } from 'react';
import { MOUSE, Spherical, TOUCH, Vector3, type Mesh, type PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { StationGraph } from '../domain/graph';
import type { StationModel } from '../domain/types';
import {
  buildPrims,
  buildRoutePrims,
  maxTierForScale,
  modelBounds,
  routePoints,
  sceneBox,
  type SceneLabel,
  type ViewOptions,
} from './scene/build';
import { buildOutlines, elementAtFace, mergePrims, partition, type MergedMesh } from './scene/geometry';

export interface SceneHandle {
  reset(): void;
  zoom(factor: number): void;
  rotate(deltaAzimuth: number): void;
  tilt(deltaPolar: number): void;
}

export interface RenderStats {
  triangles: number;
  calls: number;
  lines: number;
  geometries: number;
}

declare global {
  interface Window {
    __SENKIRO_STATS__?: RenderStats & { frames: number; cameraDistance: number; labelsShown: number };
  }
}

interface Props {
  model: StationModel;
  graph: StationGraph;
  view: ViewOptions;
  labels: SceneLabel[];
  showLabels: boolean;
  ariaLabel: string;
  handleRef: Ref<SceneHandle>;
  onSelect(id: string | null): void;
  onStats(stats: RenderStats): void;
  /** Render continuously (for frame-rate measurement) instead of on demand. */
  continuous: boolean;
}

const FOV = 36;
const MIN_DISTANCE = 14;
const HOME_POLAR = 0.86; // from straight up
const HOME_AZIMUTH = 0.42; // from due west, turned towards the south
/**
 * Fraction of the half-viewport a framed box may fill. The verified station
 * gets a comfortable margin (the on-screen controls sit in it); the unverified
 * placeholder blocks only have to stay inside the picture.
 */
const FIT_STATION = { x: 0.8, y: 0.74 };
const FIT_EVERYTHING = { x: 0.97, y: 0.95 };

/**
 * Camera distance at which every corner of `box` is inside the view when
 * looking at its centre from the home direction.
 */
type Box = { min: [number, number, number]; max: [number, number, number] };

/** How far the middle of `box`, as seen from the home direction, sits from `target` (in the view plane). */
function screenOffset(target: Vector3, box: Box): Vector3 {
  const dir = new Vector3().setFromSpherical(new Spherical(1, HOME_POLAR, HOME_AZIMUTH));
  const right = new Vector3().crossVectors(new Vector3(0, 1, 0), dir).normalize();
  const up = new Vector3().crossVectors(dir, right).normalize();
  let u0 = Infinity;
  let u1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  const corner = new Vector3();
  for (const x of [box.min[0], box.max[0]]) {
    for (const y of [box.min[1], box.max[1]]) {
      for (const z of [box.min[2], box.max[2]]) {
        corner.set(x, y, z).sub(target);
        u0 = Math.min(u0, corner.dot(right));
        u1 = Math.max(u1, corner.dot(right));
        v0 = Math.min(v0, corner.dot(up));
        v1 = Math.max(v1, corner.dot(up));
      }
    }
  }
  return right.multiplyScalar((u0 + u1) / 2).add(up.multiplyScalar((v0 + v1) / 2));
}

function fitView(target: Vector3, box: Box, aspect: number, fit: { x: number; y: number }): number {
  const dir = new Vector3().setFromSpherical(new Spherical(1, HOME_POLAR, HOME_AZIMUTH));
  const right = new Vector3().crossVectors(new Vector3(0, 1, 0), dir).normalize();
  const up = new Vector3().crossVectors(dir, right).normalize();
  const tanY = Math.tan((FOV * Math.PI) / 360);
  const tanX = tanY * aspect;
  let radius = 0;
  const corner = new Vector3();
  for (const x of [box.min[0], box.max[0]]) {
    for (const y of [box.min[1], box.max[1]]) {
      for (const z of [box.min[2], box.max[2]]) {
        corner.set(x, y, z).sub(target);
        const depth = corner.dot(dir);
        radius = Math.max(radius, depth + Math.abs(corner.dot(right)) / (tanX * fit.x), depth + Math.abs(corner.dot(up)) / (tanY * fit.y));
      }
    }
  }
  return radius;
}

/** Screen rectangle of a label that is currently shown, for click picking. */
interface LabelRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  elementId: string | null;
}

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
    >
      <Canvas
        flat
        dpr={[1, 2]}
        frameloop={props.continuous ? 'always' : 'demand'}
        camera={{ fov: FOV, near: 2, far: 1400, position: [60, 80, 90] }}
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
            {l.text}
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
  graph,
  view,
  labels,
  showLabels,
  handleRef,
  onSelect,
  onStats,
  labelLayer,
  labelRects,
}: Props & { labelLayer: RefObject<HTMLDivElement | null>; labelRects: RefObject<LabelRect[]> }) {
  const { camera, gl, invalidate, size } = useThree();
  const controlsRef = useRef<OrbitControls | null>(null);
  const opaqueRef = useRef<Mesh>(null);
  const translucentRef = useRef<Mesh>(null);
  const frames = useRef(0);
  const lastStats = useRef('');
  const viewRef = useRef(view);
  viewRef.current = view;

  // --- geometry -------------------------------------------------------------------
  const prims = useMemo(() => buildPrims(model, view), [model, view]);
  const { opaque, translucent, outlines } = useMemo(() => {
    const parts = partition(prims);
    return { opaque: mergePrims(parts.opaque), translucent: mergePrims(parts.translucent), outlines: buildOutlines(prims) };
  }, [prims]);
  const routeMesh = useMemo(() => {
    const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
    const pts = view.route ? routePoints(view.route, nodes, model) : [];
    return mergePrims(buildRoutePrims(model, view.route, pts, view));
  }, [model, graph, view]);

  useEffect(() => () => opaque.geometry.dispose(), [opaque]);
  useEffect(() => () => translucent.geometry.dispose(), [translucent]);
  useEffect(() => () => outlines.dispose(), [outlines]);
  useEffect(() => () => routeMesh.geometry.dispose(), [routeMesh]);
  useEffect(() => invalidate(), [opaque, translucent, outlines, routeMesh, labels, showLabels, invalidate]);

  // --- camera ---------------------------------------------------------------------
  const goHome = (cam: PerspectiveCamera, controls: OrbitControls | null) => {
    const aspect = size.width / Math.max(1, size.height);
    const v = viewRef.current;
    const station = sceneBox(model, { ...v, showBlocks: false });
    const everything = sceneBox(model, v);
    const target = new Vector3((station.min[0] + station.max[0]) / 2, (station.min[1] + station.max[1]) / 2, (station.min[2] + station.max[2]) / 2);
    target.add(screenOffset(target, everything).multiplyScalar(0.8));
    const r = Math.max(MIN_DISTANCE, fitView(target, station, aspect, FIT_STATION), fitView(target, everything, aspect, FIT_EVERYTHING));
    cam.position.setFromSpherical(new Spherical(r, HOME_POLAR, HOME_AZIMUTH)).add(target);
    cam.lookAt(target);
    if (controls) {
      controls.maxDistance = Math.max(330, r * 1.7);
      controls.target.copy(target);
      controls.update();
    }
    invalidate();
  };

  useLayoutEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.screenSpacePanning = false;
    controls.minDistance = MIN_DISTANCE;
    controls.maxDistance = 330;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.zoomToCursor = true;
    controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
    controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };
    controls.addEventListener('change', () => invalidate());
    controlsRef.current = controls;
    goHome(camera as PerspectiveCamera, controls);
    return () => {
      controls.dispose();
      controlsRef.current = null;
    };
    // The controls are created once; later resizes must not reset the user's view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl]);

  // Keep the pannable region near the model so the camera cannot wander off.
  const bounds = useMemo(() => modelBounds(model), [model]);
  const clampTarget = (controls: OrbitControls) => {
    const tgt = controls.target;
    const pad = 12;
    const x = Math.min(bounds.x1 + pad, Math.max(bounds.x0 - pad, tgt.x));
    const z = Math.min(bounds.z1 + pad, Math.max(bounds.z0 - pad, tgt.z));
    const y = Math.min(45, Math.max(-70, tgt.y));
    if (x !== tgt.x || y !== tgt.y || z !== tgt.z) {
      const dx = x - tgt.x;
      const dy = y - tgt.y;
      const dz = z - tgt.z;
      tgt.set(x, y, z);
      camera.position.x += dx;
      camera.position.y += dy;
      camera.position.z += dz;
    }
  };

  useImperativeHandle(
    handleRef,
    (): SceneHandle => {
      const orbit = (fn: (s: Spherical) => void) => {
        const controls = controlsRef.current;
        if (!controls) return;
        const offset = camera.position.clone().sub(controls.target);
        const s = new Spherical().setFromVector3(offset);
        fn(s);
        s.phi = Math.min(controls.maxPolarAngle, Math.max(0.05, s.phi));
        s.radius = Math.min(controls.maxDistance, Math.max(controls.minDistance, s.radius));
        camera.position.setFromSpherical(s).add(controls.target);
        camera.lookAt(controls.target);
        controls.update();
        invalidate();
      };
      return {
        reset: () => goHome(camera as PerspectiveCamera, controlsRef.current),
        zoom: (factor) => orbit((s) => (s.radius *= factor)),
        rotate: (d) => orbit((s) => (s.theta += d)),
        tilt: (d) => orbit((s) => (s.phi += d)),
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [camera, invalidate, model, size.width, size.height],
  );

  // --- labels: level of detail by distance, then greedy collision culling -----------
  const labelIndex = useMemo(() => new Map(labels.map((l) => [l.key, l])), [labels]);
  const labelSizes = useRef(new Map<string, { w: number; h: number }>());
  useEffect(() => {
    labelSizes.current.clear();
  }, [labels]);

  const v = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const controls = controlsRef.current;
    if (controls) {
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
    queueMicrotask(() => {
      const info = gl.info;
      const stats: RenderStats = {
        triangles: info.render.triangles,
        calls: info.render.calls,
        lines: info.render.lines,
        geometries: info.memory.geometries,
      };
      window.__SENKIRO_STATS__ = { ...stats, frames: frame, cameraDistance: distance, labelsShown: shown };
      const key = `${stats.triangles}/${stats.calls}/${stats.lines}`;
      if (key !== lastStats.current && stats.calls > 0) {
        lastStats.current = key;
        onStats(stats);
      }
    });
  });

  // --- picking --------------------------------------------------------------------
  const pick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return; // it was a drag, not a click
    e.stopPropagation();
    for (const hit of e.intersections) {
      const mesh: MergedMesh | null = hit.object === opaqueRef.current ? opaque : hit.object === translucentRef.current ? translucent : null;
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
      <ambientLight intensity={2.25} />
      <directionalLight position={[-30, 100, 55]} intensity={1.15} />
      <mesh ref={opaqueRef} geometry={opaque.geometry} onClick={pick}>
        <meshLambertMaterial vertexColors polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
      </mesh>
      <lineSegments geometry={outlines} renderOrder={1}>
        <lineBasicMaterial vertexColors />
      </lineSegments>
      <mesh ref={translucentRef} geometry={translucent.geometry} onClick={pick} renderOrder={2}>
        <meshLambertMaterial vertexColors transparent depthWrite={false} />
      </mesh>
      <mesh geometry={routeMesh.geometry} renderOrder={5} raycast={() => null}>
        <meshBasicMaterial vertexColors transparent opacity={0.96} depthTest={false} depthWrite={false} />
      </mesh>
    </>
  );
}
