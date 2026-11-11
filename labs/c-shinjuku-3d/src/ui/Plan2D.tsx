import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import type { StationGraph } from '../domain/graph';
import type { RunningStatus } from '../domain/overlay';
import type { Route } from '../domain/route';
import type { Area, Level, StationModel, VerticalFacility } from '../domain/types';
import type { T } from './i18n';
import { circled, type Namer } from './naming';
import { areasTouch, modelBounds, routeElementIds, routePoints } from './scene/build';
import type { SceneHandle } from './Scene3D';
import { mix, type Palette } from './theme';

interface Props {
  model: StationModel;
  graph: StationGraph;
  /** Levels to draw, top floor first. */
  levelIds: string[];
  palette: Palette;
  route: Route | null;
  selectedId: string | null;
  showLabels: boolean;
  showVerticals: boolean;
  showBlocks: boolean;
  platformStatus: Map<string, RunningStatus> | null;
  namer: Namer;
  t: T;
  handleRef: Ref<SceneHandle>;
  onSelect(id: string | null): void;
  onFocusLevel(levelId: string): void;
}

interface ViewBox {
  k: number;
  cx: number;
  cz: number;
}

const PAD = 2.5;

interface PlanLabel {
  key: string;
  /** Anchor position in model units (text baseline). */
  x: number;
  y: number;
  text: string;
  /** Font size in screen pixels. */
  size: number;
  cls: string;
  fill: string;
  anchor: 'middle' | 'start';
  priority: number;
}

/** Rough advance width in pixels: full-width for CJK, about half for Latin. */
function textWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of text) w += /[\u2E80-\uFFEF]/.test(ch) ? size : size * 0.56;
  return w;
}

/** Greedy label thinning: place by priority, drop whatever would overlap. */
function thinLabels(labels: PlanLabel[], pxPerUnit: number): PlanLabel[] {
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const kept: PlanLabel[] = [];
  for (const l of [...labels].sort((a, b) => b.priority - a.priority)) {
    const w = textWidth(l.text, l.size);
    const x = l.x * pxPerUnit;
    const y = l.y * pxPerUnit;
    const r = {
      x0: (l.anchor === 'middle' ? x - w / 2 : x) - 2,
      x1: (l.anchor === 'middle' ? x + w / 2 : x + w) + 2,
      y0: y - l.size * 0.9,
      y1: y + l.size * 0.3,
    };
    if (placed.some((q) => r.x0 < q.x1 && q.x0 < r.x1 && r.y0 < q.y1 && q.y0 < r.y1)) continue;
    placed.push(r);
    kept.push(l);
  }
  return kept;
}

export function Plan2D(props: Props) {
  const { model, palette: p, t, namer } = props;
  const bounds = useMemo(() => {
    const b = modelBounds(model);
    return { x0: b.x0 - PAD, x1: b.x1 + PAD, z0: b.z0 - PAD, z1: b.z1 + PAD };
  }, [model]);
  const home: ViewBox = { k: 1, cx: (bounds.x0 + bounds.x1) / 2, cz: (bounds.z0 + bounds.z1) / 2 };
  const [vb, setVb] = useState<ViewBox>(home);
  const W = bounds.x1 - bounds.x0;
  const H = bounds.z1 - bounds.z0;

  const clamp = (v: ViewBox): ViewBox => ({
    k: Math.min(8, Math.max(1, v.k)),
    cx: Math.min(bounds.x1, Math.max(bounds.x0, v.cx)),
    cz: Math.min(bounds.z1, Math.max(bounds.z0, v.cz)),
  });

  useImperativeHandle(
    props.handleRef,
    (): SceneHandle => ({
      reset: () => setVb(home),
      zoom: (factor) => setVb((v) => clamp({ ...v, k: v.k / factor })),
      rotate: (d) => setVb((v) => clamp({ ...v, cx: v.cx + (d * 40) / v.k })),
      tilt: (d) => setVb((v) => clamp({ ...v, cz: v.cz + (d * 40) / v.k })),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bounds],
  );

  const viewBox = `${vb.cx - W / 2 / vb.k} ${vb.cz - H / 2 / vb.k} ${W / vb.k} ${H / vb.k}`;

  // Screen pixels per model unit at zoom 1, measured from the first drawing. Text
  // and markers are sized in pixels, and label tiers follow the same scale as in 3D.
  const container = useRef<HTMLDivElement>(null);
  const [baseScale, setBaseScale] = useState(6);
  const levelCount = props.levelIds.length;
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const measure = () => {
      const svg = el.querySelector('svg');
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setBaseScale(Math.min(r.width / W, r.height / H));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H, levelCount]);
  const pxPerUnit = baseScale * vb.k;
  /** Model units for a length given in screen pixels. */
  const px = (n: number) => n / pxPerUnit;

  // --- pointer pan / pinch, wheel zoom ----------------------------------------------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(0);
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = 0;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const unitsPerPx = W / vb.k / rect.width;
    const others = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId);
    if (others.length === 0) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      moved.current += Math.abs(dx) + Math.abs(dy);
      setVb((v) => clamp({ ...v, cx: v.cx - dx * unitsPerPx, cz: v.cz - dy * unitsPerPx }));
    } else {
      const o = others[0]![1];
      const before = Math.hypot(prev.x - o.x, prev.y - o.y);
      const after = Math.hypot(e.clientX - o.x, e.clientY - o.y);
      moved.current += 10;
      if (before > 0) setVb((v) => clamp({ ...v, k: v.k * (after / before) }));
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
  };
  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width - 0.5;
    const fy = (e.clientY - rect.top) / rect.height - 0.5;
    const factor = Math.exp(-e.deltaY * 0.0015);
    setVb((v) => {
      const k = Math.min(8, Math.max(1, v.k * factor));
      // keep the point under the cursor fixed
      const cx = v.cx + fx * W * (1 / v.k - 1 / k);
      const cz = v.cz + fy * H * (1 / v.k - 1 / k);
      return clamp({ k, cx, cz });
    });
  };
  const click = (id: string | null) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (moved.current < 6) props.onSelect(id);
  };

  // --- shared lookups ----------------------------------------------------------------
  const levelById = useMemo(() => new Map(model.levels.map((l) => [l.id, l])), [model]);
  const areaById = useMemo(() => new Map(model.areas.map((a) => [a.id, a])), [model]);
  const onRoute = useMemo(() => routeElementIds(props.route), [props.route]);
  const points = useMemo(() => {
    const nodes = new Map(props.graph.nodes.map((n) => [n.id, n]));
    return props.route ? routePoints(props.route, nodes, model) : [];
  }, [props.graph, props.route]);
  const routeActive = props.route !== null;

  const dim = (id: string, color: string) => (routeActive && !onRoute.has(id) ? mix(color, p.background, 0.55) : color);
  const sel = (id: string) => (id === props.selectedId ? { stroke: p.selected, strokeWidth: 0.32 } : {});

  const fill = (a: Area): string => {
    if (a.kind === 'platform') {
      const s = props.platformStatus?.get(a.id);
      if (s === 'delayed') return mix(p.platform, p.statusDelayed, 0.55);
      if (s === 'suspended' || s === 'partial-suspension') return mix(p.platform, p.statusSuspended, 0.55);
      if (s === 'normal') return mix(p.platform, p.statusNormal, 0.4);
      return p.platform;
    }
    return a.fareZone === 'unpaid' ? p.unpaid : a.fareZone === 'paid:keio' ? p.paidKeio : p.paidJr;
  };

  const showTier = (tier: number, id?: string) =>
    props.showLabels && ((id !== undefined && (onRoute.has(id) || id === props.selectedId)) || pxPerUnit >= [0, 0, 8.5, 14][tier]!);
  const halo = { ['--halo' as string]: `${px(2.6)}px` };

  const levelPlan = (level: Level) => {
    const areas = model.areas.filter((a) => a.levelId === level.id);
    const gates = model.gates.filter((g) => g.levelId === level.id);
    const entrances = model.entrances.filter((e) => e.levelId === level.id);
    const stops = model.verticals.flatMap((v) =>
      v.stops
        .filter((s) => s.levelId === level.id)
        .map((s) => ({ v, s, other: v.stops.filter((o) => o.levelId !== level.id).map((o) => levelById.get(o.levelId)!) })),
    );
    const links = model.passages.filter((l) => {
      const a = areaById.get(l.fromAreaId);
      const b = areaById.get(l.toAreaId);
      if (!a || !b) return false;
      if (a.levelId !== level.id && b.levelId !== level.id) return false;
      return l.connection === 'inferred' || !areasTouch(a, b);
    });
    const hatchId = `hatch-${level.id.replace(/[^a-z0-9]/gi, '-')}`;

    // Labels are collected first and thinned afterwards: higher priority wins a collision.
    const wanted: PlanLabel[] = [];
    const boost = (id: string) => (onRoute.has(id) || id === props.selectedId ? 100 : 0);
    if (props.showBlocks) {
      for (const b of model.unverifiedBlocks) {
        if (!showTier(1, b.id)) continue;
        wanted.push({
          key: b.id,
          x: (b.box.x0 + b.box.x1) / 2,
          y: (b.box.z0 + b.box.z1) / 2 + px(3.5),
          text: showTier(2, b.id) ? `${t('unverified')} · ${namer.name(b.id)}` : t('unverified'),
          size: 10,
          cls: 'plan-text plan-text-block',
          fill: p.ink,
          anchor: 'middle',
          priority: 40 + boost(b.id),
        });
      }
    }
    for (const a of areas) {
      if (a.kind === 'platform') {
        if (!showTier(1, a.id)) continue;
        const nums = a.tracks.map((x) => x.number);
        wanted.push({
          key: a.id,
          x: a.anchor.x,
          y: a.anchor.z + px(4.2),
          text: nums.length > 2 ? `${nums[0]}–${nums.at(-1)}` : nums.join('·'),
          size: 12,
          cls: 'plan-text plan-text-platform',
          fill: p.ink,
          anchor: 'middle',
          priority: 60 + boost(a.id),
        });
      } else if (a.names.ja !== null && showTier(3, a.id)) {
        wanted.push({ key: a.id, x: a.anchor.x, y: a.anchor.z + px(3.6), text: namer.name(a.id), size: 10.5, cls: 'plan-text', fill: p.ink, anchor: 'middle', priority: 20 + boost(a.id) });
      }
    }
    for (const g of gates) {
      if (!showTier(2, g.id)) continue;
      wanted.push({ key: g.id, x: g.position.x, y: g.position.z - 0.75 - px(3), text: namer.name(g.id), size: 11, cls: 'plan-text plan-text-gate', fill: p.ink, anchor: 'middle', priority: 50 + boost(g.id) });
    }
    for (const e of entrances) {
      if (!showTier(e.names.ja ? 2 : 3, e.id)) continue;
      wanted.push({ key: e.id, x: e.position.x, y: e.position.z + 0.7 + px(11), text: namer.name(e.id), size: 10.5, cls: 'plan-text', fill: p.ink, anchor: 'middle', priority: (e.names.ja ? 45 : 15) + boost(e.id) });
    }
    for (const { v, s, other } of stops) {
      if (!showTier(3, v.id)) continue;
      if (v.verticalKind !== 'elevator' && !props.showVerticals && !onRoute.has(v.id) && v.id !== props.selectedId) continue;
      wanted.push({
        key: `${v.id}@${level.id}`,
        x: s.position.x + 0.62 + px(3),
        y: s.position.z + px(3.4),
        text: `→ ${other.map((o) => o.label).join(' / ')}`,
        size: 9.5,
        cls: 'plan-text',
        fill: p.ink,
        anchor: 'start',
        priority: (v.verticalKind === 'elevator' ? 30 : 10) + boost(v.id),
      });
    }

    // route pieces on this level
    const segs: { a: (typeof points)[number]; b: (typeof points)[number] }[] = [];
    const changes: { at: (typeof points)[number]; to: Level; up: boolean }[] = [];
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i]!;
      const b = points[i + 1]!;
      if (a.levelId === level.id && b.levelId === level.id) segs.push({ a, b });
      else if (a.levelId === level.id && b.levelId !== level.id) {
        const to = levelById.get(b.levelId)!;
        changes.push({ at: a, to, up: to.elevation > level.elevation });
      }
    }
    const ends = points.filter((pt, i) => (i === 0 || i === points.length - 1) && pt.levelId === level.id);
    for (const c of changes) {
      wanted.push({
        key: `change-${c.at.plan.x}-${c.at.plan.z}-${c.to.id}`,
        x: c.at.plan.x + px(11),
        y: c.at.plan.z + px(4),
        text: namer.level(c.to.id),
        size: 11.5,
        cls: 'plan-text plan-text-route',
        fill: p.route,
        anchor: 'start',
        priority: 200,
      });
    }
    const labels = thinLabels(wanted, pxPerUnit);

    return (
      <figure className="plan-card" key={level.id} data-testid={`plan-${level.label}-${level.operatorId.split(':').pop()}`}>
        <figcaption>
          <button type="button" className="plan-title" onClick={() => props.onFocusLevel(level.id)}>
            {namer.level(level.id)}
          </button>
          <span className="plan-note">{t('schematic')}</span>
        </figcaption>
        <svg
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={t('planLabel', { level: namer.level(level.id) })}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
          onClick={() => moved.current < 6 && props.onSelect(null)}
          style={halo}
        >
          <defs>
            <pattern id={hatchId} width="1.2" height="1.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="1.2" stroke={p.block} strokeWidth="0.28" />
            </pattern>
          </defs>
          <rect x={bounds.x0} y={bounds.z0} width={W} height={H} fill={p.background} />

          {props.showBlocks &&
            model.unverifiedBlocks.map((b) => (
              <g key={b.id} onClick={click(b.id)} className="pick">
                <rect
                  x={b.box.x0}
                  y={b.box.z0}
                  width={b.box.x1 - b.box.x0}
                  height={b.box.z1 - b.box.z0}
                  fill={`url(#${hatchId})`}
                  stroke={b.id === props.selectedId ? p.selected : p.block}
                  strokeWidth={0.14}
                  strokeDasharray="0.6 0.4"
                  opacity={0.75}
                />
                <title>{`${t('unverified')} · ${namer.name(b.id)}`}</title>
              </g>
            ))}

          {areas.map((a) => (
            <g key={a.id} onClick={click(a.id)} className="pick">
              {a.footprint.map((r, i) => (
                <rect
                  key={i}
                  x={r.x0}
                  y={r.z0}
                  width={r.x1 - r.x0}
                  height={r.z1 - r.z0}
                  fill={dim(a.id, fill(a))}
                  stroke={mix(dim(a.id, fill(a)), p.ink, 0.55)}
                  strokeWidth={0.1}
                  {...sel(a.id)}
                />
              ))}
              {a.kind === 'platform' &&
                a.footprint.map((r, i) => (
                  <g key={`e${i}`} stroke={dim(a.id, p.platformEdge)} strokeWidth={0.2}>
                    <line x1={r.x0} y1={r.z0 + 0.1} x2={r.x1} y2={r.z0 + 0.1} />
                    <line x1={r.x0} y1={r.z1 - 0.1} x2={r.x1} y2={r.z1 - 0.1} />
                  </g>
                ))}
            </g>
          ))}

          {links.map((l) => {
            const a = areaById.get(l.fromAreaId)!;
            const b = areaById.get(l.toAreaId)!;
            return (
              <line
                key={l.id}
                className="pick"
                onClick={click(l.id)}
                x1={a.anchor.x}
                y1={a.anchor.z}
                x2={b.anchor.x}
                y2={b.anchor.z}
                stroke={l.id === props.selectedId ? p.selected : dim(l.id, p.link)}
                strokeWidth={0.26}
                strokeDasharray={l.connection === 'inferred' ? '0.9 0.7' : undefined}
              />
            );
          })}

          {stops.map(({ v, s }) =>
            v.verticalKind !== 'elevator' && !props.showVerticals && !onRoute.has(v.id) && v.id !== props.selectedId ? null : (
              <VerticalGlyph
                key={`${v.id}@${level.id}`}
                v={v}
                x={s.position.x}
                z={s.position.z}
                color={dim(v.id, v.verticalKind === 'elevator' ? p.elevator : v.verticalKind === 'stairs' ? p.stairs : p.escalator)}
                paper={p.background}
                selected={v.id === props.selectedId ? p.selected : null}
                onClick={click(v.id)}
              />
            ),
          )}

          {gates.map((g) => (
            <g key={g.id} onClick={click(g.id)} className="pick">
              <rect
                x={g.position.x - 0.5}
                y={g.position.z - 0.5}
                width={1}
                height={1}
                fill={dim(g.id, g.gateKind === 'transfer' ? p.gateTransfer : p.gate)}
                stroke={p.background}
                strokeWidth={0.12}
                transform={`rotate(45 ${g.position.x} ${g.position.z})`}
                {...sel(g.id)}
              />
            </g>
          ))}

          {entrances.map((e) => (
            <g key={e.id} onClick={click(e.id)} className="pick">
              <path
                d={`M ${e.position.x} ${e.position.z - 0.75} l 0.7 1.2 h -1.4 z`}
                fill={dim(e.id, p.entrance)}
                stroke={p.background}
                strokeWidth={0.1}
                {...sel(e.id)}
              />
            </g>
          ))}


          {/* route */}
          <g pointerEvents="none">
            {segs.map(({ a, b }, i) => (
              <line key={i} x1={a.plan.x} y1={a.plan.z} x2={b.plan.x} y2={b.plan.z} stroke={p.route} strokeWidth={Math.max(0.42, px(3.5))} strokeLinecap="round" />
            ))}
            {changes.map((c, i) => (
              <g key={`c${i}`}>
                <circle cx={c.at.plan.x} cy={c.at.plan.z} r={px(8)} fill={p.route} stroke={p.background} strokeWidth={px(1.5)} />
                <text x={c.at.plan.x} y={c.at.plan.z + px(3.6)} fontSize={px(10)} textAnchor="middle" fill="#fff" className="plan-text-plain">
                  {c.up ? '▲' : '▼'}
                </text>
              </g>
            ))}
            {ends.map((e, i) => (
              <circle key={`e${i}`} cx={e.plan.x} cy={e.plan.z} r={px(6)} fill={p.background} stroke={p.route} strokeWidth={px(3)} />
            ))}
          </g>

          <g pointerEvents="none">
            {labels.map((l) => (
              <text key={l.key} x={l.x} y={l.y} fontSize={px(l.size)} textAnchor={l.anchor} className={l.cls} fill={l.fill} stroke={p.background}>
                {l.text}
              </text>
            ))}
          </g>

          {/* north arrow: north is to the left in this drawing */}
          <g transform={`translate(${vb.cx - W / 2 / vb.k + px(14)} ${vb.cz + H / 2 / vb.k - px(16)}) scale(${px(1)})`} pointerEvents="none">
            <path d="M 26 0 L 0 0 M 0 0 l 7 -4.5 M 0 0 l 7 4.5" stroke={p.ink} strokeWidth={1.6} fill="none" strokeLinecap="round" />
            <text x={32} y={4} fontSize={11} className="plan-text-plain" fill={p.ink}>
              {t('north')}
            </text>
          </g>
        </svg>
      </figure>
    );
  };

  const levels = props.levelIds.map((id) => levelById.get(id)).filter((l): l is Level => l !== undefined);
  return (
    <div ref={container} className={`plans plans-${levels.length > 1 ? 'multi' : 'single'}`} data-testid="plan-2d">
      {levels.map(levelPlan)}
    </div>
  );
}

function VerticalGlyph(props: {
  v: VerticalFacility;
  x: number;
  z: number;
  color: string;
  paper: string;
  selected: string | null;
  onClick(e: React.MouseEvent): void;
}) {
  const { v, x, z, color } = props;
  const stroke = props.selected ?? props.paper;
  const sw = props.selected ? 0.24 : 0.08;
  return (
    <g onClick={props.onClick} className="pick">
      {v.verticalKind === 'elevator' ? (
        <>
          <rect x={x - 0.52} y={z - 0.52} width={1.04} height={1.04} rx={0.12} fill={color} stroke={stroke} strokeWidth={sw} />
          <text x={x} y={z + 0.3} fontSize={0.82} textAnchor="middle" fill="#fff" className="plan-text-plain">
            {v.operatorLabel ? circled(v.operatorLabel) : 'EV'}
          </text>
        </>
      ) : v.verticalKind === 'stairs' ? (
        <>
          <rect x={x - 0.42} y={z - 0.3} width={0.84} height={0.6} fill={props.paper} stroke={props.selected ?? color} strokeWidth={props.selected ? 0.2 : 0.1} />
          <path d={`M ${x - 0.21} ${z - 0.3} v 0.6 M ${x} ${z - 0.3} v 0.6 M ${x + 0.21} ${z - 0.3} v 0.6`} stroke={color} strokeWidth={0.08} />
        </>
      ) : (
        <>
          <rect x={x - 0.42} y={z - 0.24} width={0.84} height={0.48} rx={0.24} fill={color} stroke={stroke} strokeWidth={sw} />
          <path d={`M ${x - 0.2} ${z + 0.1} l 0.4 -0.2`} stroke="#fff" strokeWidth={0.1} strokeLinecap="round" />
        </>
      )}
    </g>
  );
}
