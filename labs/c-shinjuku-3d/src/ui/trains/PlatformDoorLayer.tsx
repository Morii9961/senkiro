/**
 * Draws the platform doors (src/trains/platformDoors.ts) with one instanced
 * mesh. The doors are part of the station, so they are drawn whether or not
 * the train simulation is on; while it is on, the leaves of an opening slide
 * open together with the doors of the train standing in front of it.
 */
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { Color, InstancedBufferAttribute, Sphere, Vector3, type InstancedMesh } from 'three';
import type { StationModel } from '../../domain/types';
import { simSeconds, type SimClock } from '../../trains/clock';
import { doorCentres } from '../../trains/parts';
import { buildPlatformDoors, openingStates } from '../../trains/platformDoors';
import { trainStatesAt, type TrainPlan } from '../../trains/simulate';
import { levelVisibility } from '../scene/arch/context';
import { PLATFORM_TOP, levelY, type ViewOptions } from '../scene/prims';

interface Props {
  model: StationModel;
  view: ViewOptions;
  /** The train simulation, when it is on. */
  trains: { plans: TrainPlan[]; clock: RefObject<SimClock>; shown(plan: TrainPlan): boolean } | null;
}

const tmp = new Color();
const colorCache = new Map<string, [number, number, number]>();
function rgb(hex: string): [number, number, number] {
  let c = colorCache.get(hex);
  if (!c) {
    tmp.set(hex);
    colorCache.set(hex, (c = [tmp.r, tmp.g, tmp.b]));
  }
  return c;
}

export function PlatformDoorLayer({ model, view, trains }: Props) {
  const ref = useRef<InstancedMesh>(null);
  const sets = useMemo(() => buildPlatformDoors(model), [model]);
  const capacity = useMemo(() => Math.max(1, sets.reduce((n, s) => n + s.parts.length, 0)), [sets]);
  const levels = useMemo(() => {
    const m = new Map<string, { y: number; visible: boolean }>();
    for (const l of model.levels) m.set(l.id, { y: levelY(l, view.explode) + PLATFORM_TOP, visible: levelVisibility(l, view) === 'full' });
    return m;
  }, [model, view]);
  // door positions of each train, train-local; computed once per plan
  const doorsOf = useMemo(() => new Map<string, number[]>(), [trains?.plans]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    mesh.count = 0;
    mesh.boundingSphere = new Sphere(new Vector3(0, 0, 0), 1e5);
  }, [capacity]);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh || !mesh.instanceColor) return;
    const states = trains ? trainStatesAt(trains.plans, simSeconds(trains.clock.current)).filter((s) => !s.moving && s.doors > 0 && trains.shown(s.plan)) : [];
    const m = mesh.instanceMatrix.array as Float32Array;
    const col = mesh.instanceColor.array as Float32Array;
    let n = 0;
    for (const set of sets) {
      const lv = levels.get(set.line.levelId);
      if (!lv?.visible) continue;
      const here = states
        .filter((s) => s.plan.platformAreaId === set.platformId && s.plan.trackNumber === set.trackNumber)
        .map((s) => {
          let as = doorsOf.get(s.plan.id);
          if (!as) doorsOf.set(s.plan.id, (as = doorCentres({ spec: s.plan.vehicle.spec, cars: s.plan.vehicle.cars, length: s.plan.length }).map((d) => d.a)));
          return { doors: s.doors, doorAs: as.map((a) => a + s.along) };
        });
      const open = openingStates(set, here);
      const { line } = set;
      for (const p of set.parts) {
        const shift = p.leaf ? p.leaf * p.travel! * (open[p.opening!] ?? 0) : 0;
        const a0 = p.a0 + shift;
        const a1 = p.a1 + shift;
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
        m[o + 13] = lv.y + (p.u0 + p.u1) / 2;
        m[o + 14] = line.axis === 'x' ? across : along;
        m[o + 15] = 1;
        const [r, g, b] = rgb(p.color);
        col[n * 3] = r;
        col[n * 3 + 1] = g;
        col[n * 3 + 2] = b;
        n++;
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, capacity]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshLambertMaterial />
    </instancedMesh>
  );
}
