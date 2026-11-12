/**
 * The 2D plan of one floor. It is drawn from the same StationModel, the same
 * walls (scene/arch/slabs) and the same route line (scene/routeLine) as the 3D
 * view — only projected straight down. North is to the left, as in 3D.
 *
 * Geometry is an SVG; names are DOM labels laid over it so that they keep a
 * constant size on screen and share their look with the 3D labels.
 */
import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react';
import { floorLabel } from '../domain/floors';
import type { RunningStatus } from '../domain/overlay';
import type { Route } from '../domain/route';
import type { Area, PlanPoint, PlanRect, StationModel, VerticalFacility } from '../domain/types';
import type { Lang, T } from './i18n';
import type { Namer } from './naming';
import type { SceneHandle } from './Scene3D';
import { gateDirection } from './scene/arch/gates';
import { wallEdges } from './scene/arch/slabs';
import { trackRange } from './scene/labels';
import { LEVEL_SCALE, boundsOf, unit } from './scene/prims';
import type { RoutePoint } from './scene/routeLine';
import { inkOn, mix, zoneColor, type Palette } from './theme';

interface Props {
  model: StationModel;
  /** Floor shown (level ordinal). */
  ordinal: number;
  palette: Palette;
  route: Route | null;
  routePts: RoutePoint[];
  focusLeg: number | null;
  selectedId: string | null;
  showLabels: boolean;
  showVerticals: boolean;
  showBlocks: boolean;
  platformStatus: Map<string, RunningStatus> | null;
  namer: Namer;
  lang: Lang;
  t: T;
  handleRef: Ref<SceneHandle>;
  onSelect(id: string | null): void;
}

interface PlanLabel {
  key: string;
  elementId: string | null;
  x: number;
  z: number;
  text: string;
  chips?: { text: string; color: string }[];
  variant: 'platform' | 'gate' | 'area' | 'entrance' | 'lift' | 'block' | 'route-start' | 'route-end';
  priority: number;
  /** Shown from this drawing scale (px per model unit) upwards. */
  minScale: number;
  anchor: 'centre' | 'above';
}

const PAD = 3.5;
const TRACK_W = 0.62;

function textWidth(text: string, px: number): number {
  let w = 0;
  for (const ch of text) w += ch.charCodeAt(0) > 0x2e80 ? px : px * 0.58;
  return w;
}

export function Plan2D(props: Props) {
  const { model, ordinal, palette: p, t, namer } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [cam, setCam] = useState<{ cx: number; cz: number; zoom: number }>({ cx: 0, cz: 0, zoom: 1 });
  const drag = useRef<{ x: number; y: number; moved: number } | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: Math.max(200, el.clientWidth), h: Math.max(200, el.clientHeight) }));
    ro.observe(el);
    setSize({ w: Math.max(200, el.clientWidth), h: Math.max(200, el.clientHeight) });
    return () => ro.disconnect();
  }, []);

  // --- what is on this floor ------------------------------------------------------------
  const floor = useMemo(() => {
    const levelIds = new Set(model.levels.filter((l) => l.ordinal === ordinal).map((l) => l.id));
    const areaById = new Map(model.areas.map((a) => [a.id, a]));
    const areas = model.areas.filter((a) => levelIds.has(a.levelId));
    const elevations = model.levels.filter((l) => levelIds.has(l.id)).map((l) => l.elevation);
    const bounds = areas.length > 0 ? boundsOf(areas.flatMap((a) => a.footprint)) : { x0: -10, x1: 10, z0: -10, z1: 10 };
    return {
      levelIds,
      areaById,
      areas,
      bounds,
      gates: model.gates.filter((g) => levelIds.has(g.levelId)),
      entrances: model.entrances.filter((e) => levelIds.has(e.levelId)),
      verticals: model.verticals.filter((v) => v.stops.some((s) => levelIds.has(s.levelId))),
      links: model.passages.filter((l) => {
        const a = areaById.get(l.fromAreaId);
        const b = areaById.get(l.toAreaId);
        return a && b && levelIds.has(a.levelId) && levelIds.has(b.levelId);
      }),
      blocks: model.unverifiedBlocks.filter((b) => elevations.some((e) => e >= b.elevation - 1.5 && e <= b.elevation + b.height / LEVEL_SCALE + 1.5)),
    };
  }, [model, ordinal]);

  const fit = useMemo(() => {
    const b = floor.bounds;
    const w = b.x1 - b.x0 + PAD * 2;
    const h = b.z1 - b.z0 + PAD * 2;
    return { cx: (b.x0 + b.x1) / 2, cz: (b.z0 + b.z1) / 2, scale: Math.min(size.w / w, (size.h - 40) / h) };
  }, [floor.bounds, size.w, size.h]);

  // a new floor starts framed
  useEffect(() => setCam({ cx: fit.cx, cz: fit.cz, zoom: 1 }), [ordinal]); // eslint-disable-line react-hooks/exhaustive-deps

  const scale = fit.scale * cam.zoom; // px per model unit
  const vw = size.w / scale;
  const vh = size.h / scale;
  const vx = cam.cx - vw / 2;
  const vz = cam.cz - vh / 2;
  const px = (n: number) => n / scale;

  useImperativeHandle(
    props.handleRef,
    (): SceneHandle => ({
      reset: () => setCam({ cx: fit.cx, cz: fit.cz, zoom: 1 }),
      zoom: (factor) => setCam((c) => ({ ...c, zoom: Math.min(12, Math.max(0.6, c.zoom / factor)) })),
      rotate: () => undefined,
      tilt: () => undefined,
    }),
    [fit],
  );

  const onWheel = (e: React.WheelEvent) => {
    const box = e.currentTarget.getBoundingClientRect();
    const mx = vx + (e.clientX - box.left) / scale;
    const mz = vz + (e.clientY - box.top) / scale;
    const zoom = Math.min(12, Math.max(0.6, cam.zoom * Math.exp(-e.deltaY * 0.0015)));
    const k = cam.zoom / zoom;
    // keep the point under the cursor where it is
    setCam({ zoom, cx: mx + (cam.cx - mx) * k, cz: mz + (cam.cz - mz) * k });
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button > 1) return;
    drag.current = { x: e.clientX, y: e.clientY, moved: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.moved += Math.abs(dx) + Math.abs(dy);
    // Capture only once this is clearly a drag: a captured pointer would send
    // the click to the drawing instead of to the element under it.
    if (d.moved > 5 && !e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.setPointerCapture(e.pointerId);
    d.x = e.clientX;
    d.y = e.clientY;
    const b = floor.bounds;
    setCam((c) => ({
      ...c,
      cx: Math.min(b.x1 + 10, Math.max(b.x0 - 10, c.cx - dx / scale)),
      cz: Math.min(b.z1 + 10, Math.max(b.z0 - 10, c.cz - dy / scale)),
    }));
  };
  const onPointerUp = () => {
    window.setTimeout(() => (drag.current = null), 0);
  };
  const wasDrag = () => (drag.current?.moved ?? 0) > 5;
  const click = (id: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!wasDrag()) props.onSelect(id);
  };

  // --- colours ----------------------------------------------------------------------------
  const onRoute = useMemo(() => {
    const ids = new Set<string>();
    for (const leg of props.route?.legs ?? []) {
      ids.add(leg.elementId);
      if (leg.fromAreaId) ids.add(leg.fromAreaId);
      if (leg.toAreaId) ids.add(leg.toAreaId);
    }
    return ids;
  }, [props.route]);
  const dim = (c: string, id: string | null) => (props.route && id && !onRoute.has(id) ? mix(c, p.background, 0.3) : c);
  const areaFill = (a: Area) => {
    if (a.kind !== 'platform') return dim(zoneColor(p, a.fareZone), a.id);
    const st = props.platformStatus?.get(a.id);
    const base = st === 'delayed' ? mix(p.platform, p.statusDelayed, 0.5) : st === 'suspended' || st === 'partial-suspension' ? mix(p.platform, p.statusSuspended, 0.5) : st === 'normal' ? mix(p.platform, p.statusNormal, 0.3) : p.platform;
    return dim(base, a.id);
  };
  const lineColor = (id: string) => model.railLines.find((l) => l.id === id)?.displayColor ?? p.ink;
  const wallColor = mix(p.ink, p.background, 0.25);
  const sel = (id: string) => (props.selectedId === id ? { stroke: p.selected, strokeWidth: px(3) } : {});

  // --- route on this floor ------------------------------------------------------------------
  const segments = useMemo(() => {
    const out: { a: PlanPoint; b: PlanPoint; strong: boolean; inferred: boolean }[] = [];
    const inferred = new Set<number>((props.route?.legs ?? []).filter((l) => l.connection === 'inferred').map((l) => l.index));
    for (let i = 0; i + 1 < props.routePts.length; i++) {
      const a = props.routePts[i]!;
      const b = props.routePts[i + 1]!;
      if (!floor.levelIds.has(a.levelId) || !floor.levelIds.has(b.levelId)) continue;
      out.push({ a: a.plan, b: b.plan, strong: props.focusLeg === null || b.leg === props.focusLeg, inferred: inferred.has(b.leg) && a.nodeId !== null && b.nodeId !== null });
    }
    return out;
  }, [props.routePts, props.route, props.focusLeg, floor.levelIds]);

  const ordinalOf = (levelId: string) => model.levels.find((l) => l.id === levelId)?.ordinal ?? 0;
  const routeEnds = useMemo(() => {
    const pts = props.routePts;
    if (pts.length < 2) return { start: null as PlanPoint | null, end: null as PlanPoint | null, changes: [] as { at: PlanPoint; to: string; up: boolean }[] };
    const changes: { at: PlanPoint; to: string; up: boolean }[] = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const oa = ordinalOf(a.levelId);
      const ob = ordinalOf(b.levelId);
      if (oa === ob) continue;
      if (oa === ordinal) changes.push({ at: a.plan, to: floorLabel(ob), up: ob > oa });
    }
    return {
      start: floor.levelIds.has(pts[0]!.levelId) ? pts[0]!.plan : null,
      end: floor.levelIds.has(pts.at(-1)!.levelId) ? pts.at(-1)!.plan : null,
      changes,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.routePts, floor.levelIds, ordinal]);

  // --- labels ---------------------------------------------------------------------------------
  const labels = useMemo<PlanLabel[]>(() => {
    const out: PlanLabel[] = [];
    const boost = (id: string) => (onRoute.has(id) || id === props.selectedId ? 100 : 0);
    for (const a of floor.areas) {
      if (a.kind === 'platform') {
        out.push({
          key: a.id,
          elementId: a.id,
          x: a.anchor.x,
          z: a.anchor.z,
          text: trackRange(a.tracks.map((x) => x.number)),
          chips: namer.linesOf(a).map((l) => ({ text: namer.lineName(l.id), color: l.displayColor })),
          variant: 'platform',
          priority: 60 + boost(a.id),
          minScale: 0,
          anchor: 'centre',
        });
      } else if (a.names.ja !== null) {
        out.push({ key: a.id, elementId: null, x: a.anchor.x, z: a.anchor.z, text: namer.name(a.id), variant: 'area', priority: 20 + boost(a.id), minScale: onRoute.has(a.id) ? 0 : 9, anchor: 'centre' });
      }
    }
    for (const g of floor.gates) {
      out.push({ key: g.id, elementId: g.id, x: g.position.x, z: g.position.z, text: namer.name(g.id), variant: 'gate', priority: 50 + boost(g.id), minScale: 0, anchor: 'above' });
    }
    for (const e of floor.entrances) {
      out.push({ key: e.id, elementId: e.id, x: e.position.x, z: e.position.z, text: namer.name(e.id), variant: 'entrance', priority: (e.names.ja ? 45 : 15) + boost(e.id), minScale: e.names.ja || onRoute.has(e.id) ? 0 : 12, anchor: 'above' });
    }
    if (props.showBlocks) {
      for (const b of floor.blocks) {
        out.push({ key: b.id, elementId: b.id, x: (b.box.x0 + b.box.x1) / 2, z: (b.box.z0 + b.box.z1) / 2, text: `${t('unverified')} · ${namer.name(b.id)}`, variant: 'block', priority: 40, minScale: 0, anchor: 'centre' });
      }
    }
    if (routeEnds.start) out.push({ key: 'route:start', elementId: null, x: routeEnds.start.x, z: routeEnds.start.z, text: t('from'), variant: 'route-start', priority: 200, minScale: 0, anchor: 'above' });
    if (routeEnds.end) out.push({ key: 'route:end', elementId: null, x: routeEnds.end.x, z: routeEnds.end.z, text: t('to'), variant: 'route-end', priority: 200, minScale: 0, anchor: 'above' });
    return out;
  }, [floor, namer, onRoute, props.selectedId, props.showBlocks, routeEnds, t]);

  const placed = useMemo(() => {
    const compact = scale < 9;
    const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const out: (PlanLabel & { sx: number; sy: number; compact: boolean })[] = [];
    for (const l of [...labels].sort((a, b) => b.priority - a.priority)) {
      if (scale < l.minScale) continue;
      const sx = (l.x - vx) * scale;
      const sy = (l.z - vz) * scale;
      if (sx < -40 || sy < -20 || sx > size.w + 40 || sy > size.h + 20) continue;
      const chipW = (l.chips ?? []).reduce((w, c) => w + (compact ? 12 : textWidth(c.text, 11) + 14), 0);
      const w = textWidth(l.text, 12) + 14 + chipW;
      const h = 22;
      const y0 = l.anchor === 'above' ? sy - h - 12 : sy - h / 2;
      const r = { x0: sx - w / 2 - 2, x1: sx + w / 2 + 2, y0: y0 - 2, y1: y0 + h + 2 };
      if (boxes.some((q) => r.x0 < q.x1 && q.x0 < r.x1 && r.y0 < q.y1 && q.y0 < r.y1)) continue;
      boxes.push(r);
      out.push({ ...l, sx, sy: y0, compact });
    }
    return out;
  }, [labels, scale, vx, vz, size.w, size.h]);

  // --- drawing helpers ----------------------------------------------------------------------------
  const rectEl = (r: PlanRect, key: string, attrs: React.SVGProps<SVGRectElement>) => <rect key={key} x={r.x0} y={r.z0} width={r.x1 - r.x0} height={r.z1 - r.z0} {...attrs} />;
  const ctxLike = { model, areaById: floor.areaById };

  /** Plan symbol of a flight: a strip from the stop on this floor towards the other end, with treads or chevrons. */
  const flight = (v: VerticalFacility) => {
    const here = v.stops.find((s) => floor.levelIds.has(s.levelId));
    const other = v.stops.find((s) => s !== here);
    if (!here || !other) return null;
    const up = ordinalOf(other.levelId) > ordinal;
    const color = dim(v.verticalKind === 'stairs' ? p.stairs : p.escalator, v.id);
    const len = Math.hypot(other.position.x - here.position.x, other.position.z - here.position.z);
    const [dx, dz] = unit(other.position.x - here.position.x, other.position.z - here.position.z);
    const half = v.verticalKind === 'stairs' ? 0.4 : 0.27;
    const nx = -dz * half;
    const nz = dx * half;
    const a = here.position;
    const b = { x: a.x + dx * len, z: a.z + dz * len };
    const n = Math.max(3, Math.round(len / 0.32));
    const marks = [];
    for (let i = 1; i < n; i++) {
      const k = i / n;
      const mx = a.x + (b.x - a.x) * k;
      const mz = a.z + (b.z - a.z) * k;
      if (v.verticalKind === 'stairs') marks.push(<line key={i} x1={mx - nx} y1={mz - nz} x2={mx + nx} y2={mz + nz} />);
      else if (i % 2 === 1) {
        const s = up ? 1 : -1;
        marks.push(<polyline key={i} points={`${mx - nx * 0.7 - dx * 0.12 * s},${mz - nz * 0.7 - dz * 0.12 * s} ${mx + dx * 0.12 * s},${mz + dz * 0.12 * s} ${mx + nx * 0.7 - dx * 0.12 * s},${mz + nz * 0.7 - dz * 0.12 * s}`} fill="none" />);
      }
    }
    return (
      <g key={v.id} className="pick" onClick={click(v.id)}>
        <title>{`${namer.name(v.id)} ${up ? '↑' : '↓'} ${floorLabel(ordinalOf(other.levelId))}`}</title>
        <polygon
          points={`${a.x - nx},${a.z - nz} ${b.x - nx},${b.z - nz} ${b.x + nx},${b.z + nz} ${a.x + nx},${a.z + nz}`}
          fill={mix(color, p.background, v.verticalKind === 'stairs' ? 0.35 : 0.1)}
          stroke={mix(color, p.ink, 0.4)}
          strokeWidth={px(1)}
          {...sel(v.id)}
        />
        <g stroke={v.verticalKind === 'stairs' ? mix(color, p.ink, 0.5) : p.platformEdge} strokeWidth={px(1)} strokeLinecap="round">
          {marks}
        </g>
      </g>
    );
  };

  const lift = (v: VerticalFacility) => {
    const here = v.stops.find((s) => floor.levelIds.has(s.levelId));
    if (!here) return null;
    const color = dim(p.elevator, v.id);
    const r = 0.36;
    return (
      <g key={v.id} className="pick" onClick={click(v.id)}>
        <title>{namer.name(v.id)}</title>
        <rect x={here.position.x - r} y={here.position.z - r} width={r * 2} height={r * 2} rx={px(2)} fill={color} stroke={p.platformEdge} strokeWidth={px(1)} {...sel(v.id)} />
        {scale >= 9 && (
          <text x={here.position.x} y={here.position.z} fontSize={r * 1.15} textAnchor="middle" dominantBaseline="central" fill="#fff" fontWeight={700} style={{ pointerEvents: 'none' }}>
            {v.operatorLabel ?? 'EV'}
          </text>
        )}
      </g>
    );
  };

  const floorName = floorLabel(ordinal);

  return (
    <div className="plan" ref={wrap} data-testid="plan-2d" data-floor={floorName}>
      <svg
        viewBox={`${vx} ${vz} ${vw} ${vh}`}
        width={size.w}
        height={size.h}
        role="img"
        aria-label={t('planLabel', { level: floorName })}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => setCam({ cx: fit.cx, cz: fit.cz, zoom: 1 })}
        onClick={() => !wasDrag() && props.onSelect(null)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <pattern id="plan-hatch" width="1.2" height="1.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="1.2" stroke={p.block} strokeWidth="0.16" />
          </pattern>
        </defs>

        {/* unverified blocks */}
        {props.showBlocks &&
          floor.blocks.map((b) => (
            <g key={b.id} className="pick" onClick={click(b.id)}>
              <title>{`${t('unverified')} · ${namer.name(b.id)}`}</title>
              {rectEl(b.box, 'r', { fill: 'url(#plan-hatch)', stroke: p.block, strokeWidth: px(1.2), strokeDasharray: `${px(5)} ${px(4)}`, ...sel(b.id) })}
            </g>
          ))}

        {/* tracks beside platforms */}
        {floor.areas.map((a) => {
          if (a.kind !== 'platform') return null;
          return a.footprint.flatMap((r, ri) =>
            a.tracks.map((tr) => {
              if (!tr.side) return null;
              const alongX = tr.side[0] === 'z';
              const out = tr.side[1] === '-' ? -1 : 1;
              const at = alongX ? (out < 0 ? r.z0 : r.z1) : out < 0 ? r.x0 : r.x1;
              const c0 = at + out * 0.04;
              const c1 = at + out * (0.04 + TRACK_W);
              const [lo, hi] = alongX ? [r.x0 - 1.6, r.x1 + 1.6] : [r.z0 - 1.6, r.z1 + 1.6];
              const bed = alongX ? { x0: lo, x1: hi, z0: Math.min(c0, c1), z1: Math.max(c0, c1) } : { x0: Math.min(c0, c1), x1: Math.max(c0, c1), z0: lo, z1: hi };
              const rails = [0.17, 0.45].map((off) => at + out * (0.04 + off));
              const numAt = alongX ? { x: lo + 0.9, z: (c0 + c1) / 2 } : { x: (c0 + c1) / 2, z: lo + 0.9 };
              return (
                <g key={`${a.id}-${ri}-${tr.number}`}>
                  {rectEl(bed, 'bed', { fill: dim(mix(p.trackBed, p.background, 0.35), a.id) })}
                  {rails.map((c, i) =>
                    alongX ? <line key={i} x1={lo} x2={hi} y1={c} y2={c} stroke={p.rail} strokeWidth={px(1)} /> : <line key={i} y1={lo} y2={hi} x1={c} x2={c} stroke={p.rail} strokeWidth={px(1)} />,
                  )}
                  {scale >= 8 && (
                    <g style={{ pointerEvents: 'none' }}>
                      <rect x={numAt.x - px(9)} y={numAt.z - px(7)} width={px(18)} height={px(14)} rx={px(2)} fill={p.ink} />
                      <text x={numAt.x} y={numAt.z} fontSize={px(10)} textAnchor="middle" dominantBaseline="central" fill={p.background} fontWeight={700}>
                        {tr.number}
                      </text>
                    </g>
                  )}
                </g>
              );
            }),
          );
        })}

        {/* floors */}
        {floor.areas.map((a) => (
          <g key={a.id} className={a.kind === 'platform' ? 'pick' : undefined} onClick={a.kind === 'platform' ? click(a.id) : undefined}>
            {a.footprint.map((r, i) => rectEl(r, String(i), { fill: areaFill(a), ...(a.kind === 'platform' ? { stroke: mix(p.platform, p.ink, 0.35), strokeWidth: px(1), ...sel(a.id) } : {}) }))}
          </g>
        ))}

        {/* platform edges in the colour of the line that stops there */}
        {floor.areas.map((a) => {
          if (a.kind !== 'platform') return null;
          return a.footprint.flatMap((r, ri) =>
            a.tracks.map((tr) => {
              if (!tr.side) return null;
              const alongX = tr.side[0] === 'z';
              const out = tr.side[1] === '-' ? -1 : 1;
              const at = alongX ? (out < 0 ? r.z0 : r.z1) : out < 0 ? r.x0 : r.x1;
              const inset = at - out * px(2.5);
              const colors = [...new Set(tr.services.map((s) => lineColor(s.railLineId)))];
              const [lo, hi] = alongX ? [r.x0, r.x1] : [r.z0, r.z1];
              return colors.map((c, i) => {
                const a0 = lo + ((hi - lo) * i) / colors.length;
                const a1 = lo + ((hi - lo) * (i + 1)) / colors.length;
                return alongX ? (
                  <line key={`${a.id}-${ri}-${tr.number}-${i}`} x1={a0} x2={a1} y1={inset} y2={inset} stroke={c} strokeWidth={px(4)} style={{ pointerEvents: 'none' }} />
                ) : (
                  <line key={`${a.id}-${ri}-${tr.number}-${i}`} y1={a0} y2={a1} x1={inset} x2={inset} stroke={c} strokeWidth={px(4)} style={{ pointerEvents: 'none' }} />
                );
              });
            }),
          );
        })}

        {/* links that are not a shared wall opening (and inferred ones) */}
        {floor.links.map((l) => {
          const a = floor.areaById.get(l.fromAreaId)!;
          const b = floor.areaById.get(l.toAreaId)!;
          const touching = a.footprint.some((ra) => b.footprint.some((rb) => Math.min(ra.x1, rb.x1) - Math.max(ra.x0, rb.x0) >= -0.01 && Math.min(ra.z1, rb.z1) - Math.max(ra.z0, rb.z0) >= -0.01));
          if (l.connection === 'verified' && touching) return null;
          return <line key={l.id} x1={a.anchor.x} y1={a.anchor.z} x2={b.anchor.x} y2={b.anchor.z} stroke={p.link} strokeWidth={px(2)} strokeDasharray={`${px(6)} ${px(5)}`} />;
        })}

        {/* gate lines: floor under the gate, then the row of machines */}
        {floor.gates.map((g) => {
          const { d, ends } = gateDirection(g, floor.areaById);
          const [dx, dz] = unit(d[0], d[1]);
          const nx = -dz;
          const nz = dx;
          const reach = Math.max(0.45, ...ends.map((e) => Math.hypot(e.x - g.position.x, e.z - g.position.z) + 0.04));
          const color = dim(g.gateKind === 'transfer' ? p.gateTransfer : p.gate, g.id);
          const { x, z } = g.position;
          const half = 1.0;
          const corners = [
            [x - dx * reach - nx * half, z - dz * reach - nz * half],
            [x + dx * reach - nx * half, z + dz * reach - nz * half],
            [x + dx * reach + nx * half, z + dz * reach + nz * half],
            [x - dx * reach + nx * half, z - dz * reach + nz * half],
          ];
          return (
            <g key={g.id} className="pick" onClick={click(g.id)}>
              <title>{namer.name(g.id)}</title>
              <polygon points={corners.map((c) => c.join(',')).join(' ')} fill={mix(p.floorUnpaid, p.gateBody, 0.15)} {...sel(g.id)} />
              {[-0.8, -0.4, 0, 0.4, 0.8].map((off) => (
                <line key={off} x1={x + nx * off - dx * 0.24} y1={z + nz * off - dz * 0.24} x2={x + nx * off + dx * 0.24} y2={z + nz * off + dz * 0.24} stroke={color} strokeWidth={px(3)} strokeLinecap="round" />
              ))}
            </g>
          );
        })}

        {/* walls */}
        <g stroke={wallColor} strokeWidth={px(2.2)} strokeLinecap="square" style={{ pointerEvents: 'none' }}>
          {floor.areas.flatMap((a) =>
            a.kind === 'platform'
              ? []
              : wallEdges(ctxLike, a).map((e, i) =>
                  e.axis === 'x' ? <line key={`${a.id}-${i}`} x1={e.lo} x2={e.hi} y1={e.at} y2={e.at} /> : <line key={`${a.id}-${i}`} y1={e.lo} y2={e.hi} x1={e.at} x2={e.at} />,
                ),
          )}
        </g>

        {/* stairs, escalators, lifts */}
        {floor.verticals.map((v) => {
          if (v.verticalKind === 'elevator') return lift(v);
          if (!props.showVerticals && !onRoute.has(v.id) && v.id !== props.selectedId) return null;
          return flight(v);
        })}

        {/* entrances */}
        {floor.entrances.map((e) => (
          <g key={e.id} className="pick" onClick={click(e.id)}>
            <title>{namer.name(e.id)}</title>
            <circle cx={e.position.x} cy={e.position.z} r={px(7)} fill={dim(p.entrance, e.id)} stroke={p.background} strokeWidth={px(1.5)} {...sel(e.id)} />
            <path
              d={`M${e.position.x - px(3)} ${e.position.z}h${px(6)}m${-px(2.5)} ${-px(2.5)}l${px(2.5)} ${px(2.5)}l${-px(2.5)} ${px(2.5)}`}
              stroke="#fff"
              strokeWidth={px(1.4)}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pointerEvents: 'none' }}
            />
          </g>
        ))}

        {/* route */}
        <g style={{ pointerEvents: 'none' }} data-testid="plan-route">
          {segments.map((s, i) => (
            <line key={`h${i}`} x1={s.a.x} y1={s.a.z} x2={s.b.x} y2={s.b.z} stroke={p.routeHalo} strokeWidth={px(s.strong ? 9 : 6)} strokeLinecap="round" />
          ))}
          {segments.map((s, i) => {
            return (
              <line
                key={i}
                x1={s.a.x}
                y1={s.a.z}
                x2={s.b.x}
                y2={s.b.z}
                stroke={s.strong ? p.route : p.routeDim}
                strokeWidth={px(s.strong ? 5 : 3)}
                strokeLinecap="round"
                strokeDasharray={s.inferred ? `${px(8)} ${px(7)}` : undefined}
              />
            );
          })}
          {segments.map((s, i) => {
            // a chevron in the middle of the longer straights shows which way the route runs
            const len = Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z);
            if (!s.strong || len * scale < 70) return null;
            const ux = (s.b.x - s.a.x) / len;
            const uz = (s.b.z - s.a.z) / len;
            const mx = (s.a.x + s.b.x) / 2 + ux * px(3);
            const mz = (s.a.z + s.b.z) / 2 + uz * px(3);
            const k = px(5);
            return <polyline key={`a${i}`} points={`${mx - ux * k - uz * k},${mz - uz * k + ux * k} ${mx},${mz} ${mx - ux * k + uz * k},${mz - uz * k - ux * k}`} fill="none" stroke={p.routeHalo} strokeWidth={px(1.8)} strokeLinecap="round" strokeLinejoin="round" />;
          })}
          {routeEnds.changes.map((c, i) => (
            <g key={i}>
              <circle cx={c.at.x} cy={c.at.z} r={px(11)} fill={p.route} stroke={p.routeHalo} strokeWidth={px(2)} />
              <text x={c.at.x} y={c.at.z - px(16)} fontSize={px(11)} textAnchor="middle" fill={p.route} fontWeight={700} stroke={p.routeHalo} strokeWidth={px(3)} paintOrder="stroke">
                {c.up ? '↑' : '↓'} {c.to}
              </text>
              <text x={c.at.x} y={c.at.z} fontSize={px(12)} textAnchor="middle" dominantBaseline="central" fill="#fff" fontWeight={700}>
                {c.up ? '↑' : '↓'}
              </text>
            </g>
          ))}
          {routeEnds.start && <circle cx={routeEnds.start.x} cy={routeEnds.start.z} r={px(7)} fill={p.routeHalo} stroke={p.route} strokeWidth={px(4)} />}
          {routeEnds.end && <circle cx={routeEnds.end.x} cy={routeEnds.end.z} r={px(8)} fill={p.route} stroke={p.routeHalo} strokeWidth={px(3)} />}
        </g>
      </svg>

      {props.showLabels && (
        <div className="labels plan-labels" data-zoom={scale < 9 ? 1 : 3}>
          {placed.map((l) => (
            <span key={l.key} className={`label label-${l.variant}`} style={{ transform: `translate(${Math.round(l.sx)}px, ${Math.round(l.sy)}px) translateX(-50%)` }}>
              <span className="label-text">{l.text}</span>
              {l.chips?.map((c, i) => (
                <span key={i} className="label-chip" style={{ ['--c' as string]: c.color, color: inkOn(c.color) }}>
                  <span className="label-chip-text">{c.text}</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      )}

      <div className="plan-title" aria-hidden="true">
        <strong>{floorName}</strong>
        <span>{t('planHint')}</span>
      </div>
    </div>
  );
}
