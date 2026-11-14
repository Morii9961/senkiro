/**
 * What every architecture builder needs: the model, lookups, where each level
 * is drawn, how visible it is, and one place that turns a base colour into the
 * colour actually drawn (route dimming, selection, ghosting).
 */
import type { Route } from '../../../domain/route';
import type { Area, Level, PlanRect, StationModel } from '../../../domain/types';
import { mix, type Palette } from '../../theme';
import {
  PLATFORM_TOP,
  SLAB_TOP,
  levelY,
  type Decal,
  type MaterialKind,
  type Prim,
  type PrimRole,
  type ViewOptions,
  type Visibility,
} from '../prims';

export interface Styled {
  color: string;
  alpha: number;
  outlineColor: string;
  pickable: boolean;
}

export interface Ctx {
  model: StationModel;
  opts: ViewOptions;
  p: Palette;
  prims: Prim[];
  decals: Decal[];
  levelById: Map<string, Level>;
  areaById: Map<string, Area>;
  onRoute: Set<string>;
  /** Openings cut into an area's slab by stairs, escalators and lift shafts. */
  holes: Map<string, PlanRect[]>;
  yOf(levelId: string): number;
  /** Walking surface of an area. */
  topOf(areaId: string): number;
  vis(levelId: string): Visibility;
  /**
   * True for a floor that lies above the lowest floor of the route leg in
   * focus: it is drawn see-through so that the leg below stays readable.
   */
  veiled(levelId: string): boolean;
  style(elementId: string | null, color: string, vis: Visibility, baseAlpha?: number): Styled | null;
  add(
    elementId: string | null,
    role: PrimRole,
    material: MaterialKind,
    geom: Pick<Prim, 'a' | 'b' | 'width' | 'thickness'>,
    s: Styled,
    extra?: Partial<Pick<Prim, 'outline' | 'shade' | 'pickable' | 'alpha'>>,
  ): void;
}

export function routeElementIds(route: Route | null): Set<string> {
  const ids = new Set<string>();
  if (!route) return ids;
  for (const leg of route.legs) {
    ids.add(leg.elementId);
    if (leg.fromAreaId) ids.add(leg.fromAreaId);
    if (leg.toAreaId) ids.add(leg.toAreaId);
  }
  return ids;
}

export function levelVisibility(level: Level | undefined, opts: Pick<ViewOptions, 'focusOrdinals' | 'ghostOthers'>): Visibility {
  if (!level) return 'hidden';
  if (opts.focusOrdinals === null || opts.focusOrdinals.has(level.ordinal)) return 'full';
  return opts.ghostOthers ? 'ghost' : 'hidden';
}

export function createContext(model: StationModel, opts: ViewOptions): Ctx {
  const p = opts.palette;
  const levelById = new Map(model.levels.map((l) => [l.id, l]));
  const areaById = new Map(model.areas.map((a) => [a.id, a]));
  const onRoute = routeElementIds(opts.route);
  const routeActive = opts.route !== null;
  const prims: Prim[] = [];
  const yOf = (levelId: string) => levelY(levelById.get(levelId)!, opts.explode);
  const lowestFocus = opts.focusLeg !== null && opts.focusOrdinals && opts.focusOrdinals.size > 1 ? Math.min(...opts.focusOrdinals) : null;
  const veiled = (levelId: string) => lowestFocus !== null && (levelById.get(levelId)?.ordinal ?? -Infinity) > lowestFocus;

  const style: Ctx['style'] = (elementId, color, vis, baseAlpha = 1) => {
    if (vis === 'hidden') return null;
    let c = color;
    let alpha = baseAlpha;
    if (routeActive && elementId && !onRoute.has(elementId)) c = mix(c, p.background, 0.3);
    let outlineColor = mix(c, p.outline, 0.3);
    if (elementId && elementId === opts.selectedId) {
      c = mix(c, p.selected, 0.55);
      outlineColor = p.selected;
    }
    if (vis === 'ghost') {
      alpha = Math.min(alpha, 0.08);
      outlineColor = mix(outlineColor, p.background, 0.7);
    }
    return { color: c, alpha, outlineColor, pickable: vis === 'full' };
  };

  return {
    model,
    opts,
    p,
    prims,
    decals: [],
    levelById,
    areaById,
    onRoute,
    holes: new Map(),
    yOf,
    topOf: (areaId) => {
      const a = areaById.get(areaId);
      return a ? yOf(a.levelId) + (a.kind === 'platform' ? PLATFORM_TOP : SLAB_TOP) : 0;
    },
    vis: (levelId) => levelVisibility(levelById.get(levelId), opts),
    veiled,
    style,
    add: (elementId, role, material, geom, s, extra = {}) => {
      prims.push({
        elementId,
        role,
        material,
        ...geom,
        color: s.color,
        alpha: extra.alpha ?? s.alpha,
        outline: extra.outline ?? false,
        outlineColor: s.outlineColor,
        pickable: extra.pickable ?? s.pickable,
        ...(extra.shade ? { shade: extra.shade } : {}),
      });
    },
  };
}
