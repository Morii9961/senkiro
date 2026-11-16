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
  /**
   * Shown only while the scale's tier is at most this: station names belong to
   * the overview and step aside once gates and halls are named. Absent = no limit.
   */
  maxZoom?: 0 | 1 | 2 | 3;
  /** Part of the route on show (or its selected element): drawn with a ring in the route colour. */
  onRoute?: boolean;
  /** Higher wins when labels collide. */
  priority: number;
  variant: 'level' | 'station' | 'platform' | 'gate' | 'area' | 'entrance' | 'lift' | 'vertical' | 'block' | 'route-start' | 'route-end';
}

export interface LabelTexts {
  unverified: string;
  start: string;
  goal: string;
  /** Short name of a station for the overview; absent = no station names. */
  station?: (stationId: string) => string;
  /** Kind of an element ("階段", "エスカレーター"); absent = stairs and escalators are not labelled. */
  kind?: (id: string) => string;
}

/** Busta Shinjuku is no station of the model, but it is the landmark people look for; its areas share this id prefix. */
const BUSTA_PREFIX = 'sk:area:busta-';

/**
 * A named entrance that is one of the station's main exits: its printed name ends in 口
 * (東口, 西口（地下）, 正面口（地上）…), unlike numbered exits ("出口 A9") and bus bays ("C8 のりば").
 * A display rule only: it decides how early a name appears, not what the entrance is.
 */
export function isMainExitName(ja: string | null): boolean {
  return ja !== null && /口(（[^）]*）)?$/.test(ja);
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
  // With a single floor in view far fewer names compete for room, so each kind of label appears one step earlier.
  const single = opts.focusOrdinals !== null && opts.focusOrdinals.size === 1 && !opts.route;
  const tierOf = (id: string, tier: SceneLabel['tier']): SceneLabel['tier'] =>
    onRoute.has(id) || id === opts.selectedId ? 0 : single ? (Math.max(1, tier - 1) as SceneLabel['tier']) : tier;
  const marked = (id: string) => (onRoute.has(id) || id === opts.selectedId ? { onRoute: true } : {});
  const floorOfLevel = new Map<string, { label: string; ordinal: number }>();
  for (const f of floorsOf(model)) for (const id of f.levelIds) floorOfLevel.set(id, { label: f.label, ordinal: f.ordinal });

  // Overview: one name per station (and Busta), over the middle of what it has on the floors in view.
  // Far away these, the floors and the platform numbers are all there is; closer in they step aside.
  if (texts.station) {
    const groups = new Map<string, { text: string; areas: typeof model.areas }>();
    for (const st of model.stations) groups.set(st.id, { text: texts.station(st.id), areas: [] });
    groups.set('busta', { text: texts.station('busta'), areas: [] });
    for (const area of model.areas) {
      if (!visible(area.levelId)) continue;
      const g = area.stationId ? groups.get(area.stationId) : area.id.startsWith(BUSTA_PREFIX) ? groups.get('busta') : undefined;
      g?.areas.push(area);
    }
    for (const [id, g] of groups) {
      if (g.areas.length === 0 || !g.text) continue;
      const rects = g.areas.flatMap((a) => a.footprint);
      const x = (Math.min(...rects.map((r) => r.x0)) + Math.max(...rects.map((r) => r.x1))) / 2;
      const z = (Math.min(...rects.map((r) => r.z0)) + Math.max(...rects.map((r) => r.z1))) / 2;
      const y = Math.max(...g.areas.map((a) => yOf(a.levelId)));
      labels.push({ key: `station:${id}`, elementId: null, text: g.text, position: [x, y + 2.4, z], tier: 1, maxZoom: 1, priority: 70, variant: 'station' });
    }
  }

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
        ...marked(area.id),
      });
    } else if (area.names.ja !== null) {
      labels.push({
        key: `area:${area.id}`,
        elementId: null,
        text: name(area.id),
        position: [area.anchor.x, y + SLAB_TOP + 0.5, area.anchor.z],
        tier: tierOf(area.id, area.kind === 'passage' ? 2 : 3),
        priority: (area.kind === 'passage' ? 25 : 20) + boost(area.id),
        variant: 'area',
        ...marked(area.id),
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
      tier: tierOf(gate.id, gate.gateKind === 'transfer' ? 2 : 3),
      priority: (gate.gateKind === 'transfer' ? 55 : 50) + boost(gate.id),
      variant: 'gate',
      ...marked(gate.id),
    });
  }

  for (const ent of model.entrances) {
    if (!visible(ent.levelId)) continue;
    labels.push({
      key: `ent:${ent.id}`,
      elementId: ent.id,
      text: name(ent.id),
      position: [ent.position.x, yOf(ent.levelId) + SLAB_TOP + 1.5, ent.position.z],
      tier: tierOf(ent.id, isMainExitName(ent.names.ja) ? 2 : 3),
      priority: (isMainExitName(ent.names.ja) ? 45 : ent.names.ja ? 35 : 15) + boost(ent.id),
      variant: 'entrance',
      ...marked(ent.id),
    });
  }

  for (const sv of model.services) {
    if (!visible(sv.levelId)) continue;
    const cx = (sv.box.x0 + sv.box.x1) / 2;
    const cz = (sv.box.z0 + sv.box.z1) / 2;
    labels.push({
      key: `service:${sv.id}`,
      // drawn from the floor map, but no card: like a hall, it is named and nothing more
      elementId: null,
      text: name(sv.id),
      position: [cx, yOf(sv.levelId) + SLAB_TOP + (sv.iconOnly ? 1.35 : 0.7), cz],
      tier: tierOf(sv.id, 3),
      priority: 20 + boost(sv.id),
      variant: 'area',
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
      ...marked(v.id),
    });
  }

  // Close in: stairs and escalators, named by kind and the floors they join, over the middle of the run.
  if (texts.kind) {
    for (const v of model.verticals) {
      if (v.verticalKind === 'elevator' || v.stops.length < 2) continue;
      if (!v.stops.every((s) => visible(s.levelId))) continue;
      const byHeight = [...v.stops].sort((a, b) => yOf(a.levelId) - yOf(b.levelId));
      const lo = byHeight[0]!;
      const hi = byHeight.at(-1)!;
      const fLo = floorOfLevel.get(lo.levelId);
      const fHi = floorOfLevel.get(hi.levelId);
      const span = fLo && fHi && fLo.label !== fHi.label ? ` ${fLo.label}–${fHi.label}` : '';
      labels.push({
        key: `vertical:${v.id}`,
        elementId: v.id,
        text: `${texts.kind(v.id)}${span}`,
        position: [(lo.position.x + hi.position.x) / 2, (yOf(lo.levelId) + yOf(hi.levelId)) / 2 + SLAB_TOP + 0.8, (lo.position.z + hi.position.z) / 2],
        tier: tierOf(v.id, 3),
        priority: 12 + boost(v.id),
        variant: 'vertical',
        ...marked(v.id),
      });
    }
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

/** Scale (screen pixels per model unit) at which tiers 1, 2 and 3 come in. */
const TIER_SCALES = [2.6, 7.5, 15] as const;
/** A tier change needs the scale this far past its threshold, so that a zoom resting near one does not make labels blink. */
const TIER_HYSTERESIS = 0.07;

/**
 * Highest label tier shown at a given drawing scale (screen pixels per model
 * unit at the orbit target): far away only floors, station names, platform
 * numbers and whatever the route touches; at medium range transfer gates,
 * main exits and the connecting corridors; close in, every gate, hall, exit,
 * stair and escalator. Given the tier shown so far, a threshold must be
 * passed by a margin before the tier changes.
 */
export function maxTierForScale(pxPerUnit: number, previous?: 0 | 1 | 2 | 3): 0 | 1 | 2 | 3 {
  let tier = 0;
  TIER_SCALES.forEach((at, i) => {
    const k = previous === undefined ? 1 : previous > i ? 1 - TIER_HYSTERESIS : 1 + TIER_HYSTERESIS;
    if (pxPerUnit >= at * k) tier = i + 1;
  });
  return tier as 0 | 1 | 2 | 3;
}
