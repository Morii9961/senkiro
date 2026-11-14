/**
 * Draws the trains of the timetable simulation inside the 3D scene.
 *
 * Every train is a set of boxes (src/trains/parts.ts) drawn by ONE instanced
 * mesh, so any number of trains costs a single draw call. Positions are
 * written straight into the instance buffers each frame; React does not
 * re-render while trains move.
 *
 * The scene renders on demand. This layer asks for frames only while a train
 * is moving or its doors are, and otherwise looks at the clock four times a
 * second to see whether anything changed.
 */
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { Color, InstancedBufferAttribute, Sphere, Vector3, type InstancedMesh } from 'three';
import type { StationModel } from '../../domain/types';
import { simSeconds, type SimClock } from '../../trains/clock';
import { LAMP_HEAD, LAMP_OFF, LAMP_TAIL, NEUTRAL_ACCENT, buildTrainParts, type TrainPart } from '../../trains/parts';
import { trainStatesAt, type TrainPlan, type TrainState } from '../../trains/simulate';
import { levelVisibility } from '../scene/arch/context';
import { levelY, type ViewOptions } from '../scene/prims';

/** Height of the rail top above a level's datum (see arch/platforms.ts). */
const RAIL_TOP = 0.075;
const CAPACITY = 20000;

declare global {
  interface Window {
    /** Read by the end-to-end tests. */
    __SENKIRO_TRAINS__?: { shown: number; instances: number; moving: number; seconds: number; ids: string[] };
  }
}

interface Compiled {
  parts: TrainPart[];
  /** Linear RGB per part. */
  rgb: Float32Array;
}

interface Props {
  model: StationModel;
  view: ViewOptions;
  plans: TrainPlan[];
  clock: RefObject<SimClock>;
  /** RailLine id → display colour. */
  lineColor: Map<string, string>;
  /** Plans to draw (filters and hidden trains are applied by the caller). */
  shown(plan: TrainPlan): boolean;
  selectedId: string | null;
  onSelect(planId: string): void;
}

const tmp = new Color();
const rgbOf = (hex: string): [number, number, number] => {
  tmp.set(hex);
  return [tmp.r, tmp.g, tmp.b];
};

export function TrainLayer({ model, view, plans, clock, lineColor, shown, selectedId, onSelect }: Props) {
  const ref = useRef<InstancedMesh>(null);
  const invalidate = useThree((s) => s.invalidate);
  const ranges = useRef<{ end: number; id: string }[]>([]);
  const lastKey = useRef('');
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  const compiled = useMemo(() => new Map<string, Compiled>(), [plans, lineColor]);
  const compile = (plan: TrainPlan): Compiled => {
    const key = `${plan.vehicle.spec.id}|${plan.vehicle.cars ?? '?'}|${plan.length.toFixed(3)}|${plan.modelLineId ?? ''}`;
    let c = compiled.get(key);
    if (!c) {
      const accent = (plan.modelLineId && lineColor.get(plan.modelLineId)) || NEUTRAL_ACCENT;
      const parts = buildTrainParts({ spec: plan.vehicle.spec, cars: plan.vehicle.cars, length: plan.length, accent });
      const rgb = new Float32Array(parts.length * 3);
      parts.forEach((p, i) => rgb.set(rgbOf(p.color), i * 3));
      compiled.set(key, (c = { parts, rgb }));
    }
    return c;
  };

  const levels = useMemo(() => {
    const m = new Map<string, { y: number; visible: boolean }>();
    for (const l of model.levels) m.set(l.id, { y: levelY(l, view.explode), visible: levelVisibility(l, view) === 'full' });
    return m;
  }, [model, view]);

  const lamps = useMemo(() => ({ head: rgbOf(LAMP_HEAD), tail: rgbOf(LAMP_TAIL), off: rgbOf(LAMP_OFF), selected: rgbOf(view.palette.selected) }), [view.palette.selected]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3);
    mesh.count = 0;
    // Instances move every frame; a fixed, generous sphere keeps culling and picking correct without recomputing it.
    mesh.boundingSphere = new Sphere(new Vector3(0, 0, 0), 1e5);
  }, []);

  const statesNow = (): { states: TrainState[]; seconds: number } => {
    const seconds = simSeconds(clock.current);
    return { states: trainStatesAt(plans, seconds).filter((s) => shownRef.current(s.plan) && levels.get(s.plan.line.levelId)?.visible), seconds };
  };
  const keyOf = (states: TrainState[]) => `${states.map((s) => `${s.plan.id}:${s.phase}`).join(',')}|${selectedRef.current ?? ''}`;
  const inMotion = (s: TrainState) => s.moving || (s.doors > 0 && s.doors < 1);

  // Wake the on-demand renderer when the set of trains (or a phase) changes while nothing else is drawing.
  useEffect(() => {
    invalidate();
    const id = window.setInterval(() => {
      const { states } = statesNow();
      if (states.some(inMotion) || keyOf(states) !== lastKey.current) invalidate();
    }, 250);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, levels, shown, selectedId, invalidate]);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh || !mesh.instanceColor) return;
    const { states, seconds } = statesNow();
    const m = mesh.instanceMatrix.array as Float32Array;
    const col = mesh.instanceColor.array as Float32Array;
    let n = 0;
    let moving = 0;
    ranges.current = [];

    for (const s of states) {
      const { plan } = s;
      const { line } = plan;
      const c = compile(plan);
      const y = levels.get(line.levelId)!.y + RAIL_TOP;
      const selected = plan.id === selectedRef.current;
      if (inMotion(s)) moving++;

      for (let i = 0; i < c.parts.length && n < CAPACITY; i++) {
        const p = c.parts[i]!;
        const shift = p.leaf ? p.leaf * p.travel! * s.doors : 0;
        const a0 = Math.max(line.clipLo, s.along + p.a0 + shift);
        const a1 = Math.min(line.clipHi, s.along + p.a1 + shift);
        if (a1 - a0 < 1e-3) continue; // past the end of the drawn track
        const ca = line.centre + line.platformSide * p.c0;
        const cb = line.centre + line.platformSide * p.c1;
        const along = (a0 + a1) / 2;
        const across = (ca + cb) / 2;
        const o = n * 16;
        m.fill(0, o, o + 16);
        m[o] = line.axis === 'x' ? a1 - a0 : Math.abs(cb - ca);
        m[o + 5] = p.u1 - p.u0;
        m[o + 10] = line.axis === 'x' ? Math.abs(cb - ca) : a1 - a0;
        m[o + 12] = line.axis === 'x' ? along : across;
        m[o + 13] = y + (p.u0 + p.u1) / 2;
        m[o + 14] = line.axis === 'x' ? across : along;
        m[o + 15] = 1;

        let r = c.rgb[i * 3]!;
        let g = c.rgb[i * 3 + 1]!;
        let b = c.rgb[i * 3 + 2]!;
        if (p.lamp) {
          const lamp = s.heading === 0 ? lamps.off : p.lamp === s.heading ? lamps.head : lamps.tail;
          [r, g, b] = lamp;
        } else if (selected) {
          r += (lamps.selected[0] - r) * 0.4;
          g += (lamps.selected[1] - g) * 0.4;
          b += (lamps.selected[2] - b) * 0.4;
        }
        col[n * 3] = r;
        col[n * 3 + 1] = g;
        col[n * 3 + 2] = b;
        n++;
      }
      ranges.current.push({ end: n, id: plan.id });
    }

    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    lastKey.current = keyOf(states);
    window.__SENKIRO_TRAINS__ = { shown: states.length, instances: n, moving, seconds, ids: states.map((s) => s.plan.id) };
    if (moving > 0) invalidate();
  });

  const pick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6 || e.instanceId == null) return; // a drag, not a click
    const hit = ranges.current.find((r) => e.instanceId! < r.end);
    if (!hit) return;
    e.stopPropagation();
    onSelect(hit.id);
  };

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, CAPACITY]} frustumCulled={false} onClick={pick}>
      <boxGeometry args={[1, 1, 1]} />
      <meshLambertMaterial />
    </instancedMesh>
  );
}
