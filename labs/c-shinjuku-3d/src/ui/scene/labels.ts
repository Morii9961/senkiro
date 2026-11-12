/**
 * Labels of the 3D view. They are DOM elements laid over the canvas; this
 * module only decides what is labelled, where, and how important it is.
 */
import { floorsOf } from '../../domain/floors';
import type { StationModel } from '../../domain/types';
import { routeElementIds, levelVisibility } from './arch/context';
import { plateRects } from './arch/slabs';
import { PLATFORM_TOP, SLAB_TOP, elevationY, levelY, type Vec3, type ViewOptions } from './prims';
import { ROUTE_LIFT, type RoutePoint } from './routeLine';

export interface LabelChip {
  text: string;
  color: string;
}

export interface SceneLabel {
  key: string;
  elementId: string | null;
  text: string;
  /** Line badges shown after the text (platforms). */
  chips?: LabelChip[];
  position: Vec3;
  /** 0 always · 1 far · 2 medium · 3 close */
  tier: 0 | 1 | 2 | 3;
  /** Higher wins when labels collide. */
  priority: number;
  variant: 'level' | 'platform' | 'gate' | 'area' | 'entrance' | 'lift' | 'block' | 'route-start' | 'route-end';
}

export interface LabelTexts {
  unverified: string;
  start: string;
  goal: string;
}

export function trackRange(numbers: string[]): string {
  return numbers.length > 2 ? `${numbers[0]}–${numbers.at(-1)}` : numbers.join('·');
}

export function buildLabels(
  model: StationModel,
  opts: ViewOptions,
  name: (id: string) => string,
  lineChip: (railLineId: string) => LabelChip | null,
  texts: LabelTexts,
  routePts: RoutePoint[] = [],
): SceneLabel[] {
  const labels: SceneLabel[] = [];
  const levelById = new Map(model.levels.map((l) => [l.id, l]));
  const yOf = (levelId: string) => levelY(levelById.get(levelId)!, opts.explode);
  const onRoute = routeElementIds(opts.route);
  const visible = (levelId: string) => levelVisibility(levelById.get(levelId), opts) === 'full';
  const boost = (id: string) => (onRoute.has(id) || id === opts.selectedId ? 100 : 0);
  const tierOf = (id: string, tier: SceneLabel['tier']): SceneLabel['tier'] => (onRoute.has(id) || id === opts.selectedId ? 0 : tier);

  // one label per floor, not per operator level
  for (const floor of floorsOf(model)) {
    const levels = floor.levelIds.filter(visible);
    if (levels.length === 0) continue;
    // at the corner of the floor's plates that is nearest to the viewer's left in the home view (north-west)
    let best: { x: number; z: number; y: number } | null = null;
    for (const levelId of levels) {
      for (const r of plateRects(model, [levelId])) {
        if (!best || r.z1 - r.x0 > best.z - best.x) best = { x: r.x0, z: r.z1, y: yOf(levelId) };
      }
    }
    if (!best) continue;
    labels.push({ key: `floor:${floor.ordinal}`, elementId: null, text: floor.label, position: [best.x, best.y + 0.2, best.z], tier: 0, priority: 90, variant: 'level' });
  }

  for (const area of model.areas) {
    if (!visible(area.levelId)) continue;
    const y = yOf(area.levelId);
    if (area.kind === 'platform') {
      const lineIds = [...new Set(area.tracks.flatMap((t) => t.services.map((s) => s.railLineId)))];
      labels.push({
        key: `pf:${area.id}`,
        elementId: area.id,
        text: trackRange(area.tracks.map((x) => x.number)),
        chips: lineIds.map(lineChip).filter((c): c is LabelChip => c !== null),
        position: [area.anchor.x, y + PLATFORM_TOP + 0.9, area.anchor.z],
        tier: tierOf(area.id, 1),
        priority: 60 + boost(area.id),
        variant: 'platform',
      });
    } else if (area.names.ja !== null) {
      labels.push({
        key: `area:${area.id}`,
        elementId: null,
        text: name(area.id),
        position: [area.anchor.x, y + SLAB_TOP + 0.5, area.anchor.z],
        tier: tierOf(area.id, 3),
        priority: 20 + boost(area.id),
        variant: 'area',
      });
    }
  }

  for (const gate of model.gates) {
    if (!visible(gate.levelId)) continue;
    labels.push({
      key: `gate:${gate.id}`,
      elementId: gate.id,
      text: name(gate.id),
      position: [gate.position.x, yOf(gate.levelId) + SLAB_TOP + 1.3, gate.position.z],
      tier: tierOf(gate.id, 2),
      priority: 50 + boost(gate.id),
      variant: 'gate',
    });
  }

  for (const ent of model.entrances) {
    if (!visible(ent.levelId)) continue;
    labels.push({
      key: `ent:${ent.id}`,
      elementId: ent.id,
      text: name(ent.id),
      position: [ent.position.x, yOf(ent.levelId) + SLAB_TOP + 1.5, ent.position.z],
      tier: tierOf(ent.id, ent.names.ja ? 2 : 3),
      priority: (ent.names.ja ? 45 : 15) + boost(ent.id),
      variant: 'entrance',
    });
  }

  for (const v of model.verticals) {
    if (v.verticalKind !== 'elevator' || !v.operatorLabel) continue;
    if (!v.stops.some((s) => visible(s.levelId))) continue;
    const top = v.stops.reduce((best, s) => (yOf(s.levelId) > yOf(best.levelId) ? s : best), v.stops[0]!);
    labels.push({
      key: `lift:${v.id}`,
      elementId: v.id,
      text: v.operatorLabel,
      position: [top.position.x, yOf(top.levelId) + SLAB_TOP + 1.25, top.position.z],
      tier: tierOf(v.id, 3),
      priority: 30 + boost(v.id),
      variant: 'lift',
    });
  }

  if (opts.showBlocks) {
    for (const blk of model.unverifiedBlocks) {
      const y = elevationY(blk.elevation, opts.explode) + blk.height * 0.55;
      labels.push({
        key: `block:${blk.id}`,
        elementId: blk.id,
        text: `${texts.unverified} · ${name(blk.id)}`,
        position: [(blk.box.x0 + blk.box.x1) / 2, y + 0.5, (blk.box.z0 + blk.box.z1) / 2],
        tier: blk.id === opts.selectedId ? 0 : 1,
        priority: 40 + boost(blk.id),
        variant: 'block',
      });
    }
  }

  if (opts.route && routePts.length >= 2) {
    const first = routePts[0]!;
    const last = routePts.at(-1)!;
    labels.push({ key: 'route:start', elementId: null, text: texts.start, position: [first.plan.x, yOf(first.levelId) + ROUTE_LIFT + 0.5, first.plan.z], tier: 0, priority: 200, variant: 'route-start' });
    labels.push({ key: 'route:end', elementId: null, text: texts.goal, position: [last.plan.x, yOf(last.levelId) + ROUTE_LIFT + 1.7, last.plan.z], tier: 0, priority: 200, variant: 'route-end' });
  }
  return labels;
}

/**
 * Highest label tier shown at a given drawing scale (screen pixels per model
 * unit at the orbit target): far away only floors, platforms and whatever the
 * route touches; closer in, gates and named entrances; closest, everything.
 */
export function maxTierForScale(pxPerUnit: number): 0 | 1 | 2 | 3 {
  if (pxPerUnit < 2.6) return 0;
  if (pxPerUnit < 7.5) return 1;
  if (pxPerUnit < 15) return 2;
  return 3;
}
