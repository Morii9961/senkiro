// @vitest-environment jsdom
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  buildIndoorGraph,
  findStationRoute,
  floorLayout,
  floorsTopDown,
  northVector,
  panelGrid,
  StationPlan2D,
  type StationPlan2DProps,
} from '../src/index.ts';
import { COMPLEX, fixtureHub, pl, place } from './fixtures.ts';
import { render } from './render.tsx';

describe('plan layout', () => {
  it('lists floors top-down and splits unlinked parts of a floor into panels', () => {
    const hub = fixtureHub();
    expect(floorsTopDown(hub.levels)).toEqual([0, -1, -2]);
    hub.places.push(
      place('island', 'a-1f', 'concourse', 'unpaid', { x0: 200, z0: 0, x1: 210, z1: 4 }),
    );
    const layout = floorLayout(hub, 0);
    expect(layout.blocks).toHaveLength(2);
    const grid = panelGrid(layout, 960, 520);
    expect(grid.panels).toHaveLength(2);
    // Panels never overlap.
    const [a, b] = grid.panels;
    if (a !== undefined && b !== undefined) {
      const apart =
        a.x + a.width <= b.x ||
        b.x + b.width <= a.x ||
        a.y + a.height <= b.y ||
        b.y + b.height <= a.y;
      expect(apart).toBe(true);
    }
  });

  it('turns a floor whose main block is taller than wide', () => {
    const hub = fixtureHub();
    hub.places = hub.places.map((p) =>
      p.id === pl('hall') ? { ...p, footprint: [{ x0: 0, z0: -40, x1: 10, z1: 40 }] } : p,
    );
    expect(floorLayout(hub, 0).rotated).toBe(true);
    expect(floorLayout(fixtureHub(), 0).rotated).toBe(false);
  });

  it('turns the compass with the floor and keeps it unknown without a source', () => {
    expect(northVector(false, 'z-')).toEqual({ x: 0, y: -1 });
    expect(northVector(true, 'x-')).toEqual({ x: -0, y: -1 });
    expect(northVector(false, null)).toBeNull();
  });
});

describe('<StationPlan2D />', () => {
  const base = (): StationPlan2DProps => ({
    dataset: fixtureHub(),
    locale: 'en',
    theme: 'light',
    activeFloor: 0,
    selectedId: null,
  });

  it('draws the places of the active floor only', () => {
    const view = render(<StationPlan2D {...base()} />);
    const ids = [...view.container.querySelectorAll('[data-place-id]')].map((n) =>
      n.getAttribute('data-place-id'),
    );
    expect(ids).toContain(pl('hall'));
    expect(ids).not.toContain(pl('a-plat'));
    view.unmount();
  });

  it('reports floor changes and selections through callbacks', () => {
    const onFloorChange = vi.fn();
    const onSelect = vi.fn();
    const view = render(
      <StationPlan2D {...base()} onFloorChange={onFloorChange} onSelect={onSelect} />,
    );
    const button = view.container.querySelector('[data-floor-button="-1"]');
    act(() => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onFloorChange).toHaveBeenCalledWith(-1);
    const hall = view.container.querySelector(`[data-place-id="${pl('hall')}"] rect`);
    act(() => hall?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onSelect).toHaveBeenCalledWith(pl('hall'));
    view.unmount();
  });

  it('highlights a route and the selection', () => {
    const hub = fixtureHub();
    const route = findStationRoute(buildIndoorGraph(hub), {
      complexId: COMPLEX,
      fromPlaceId: pl('entrance'),
      toPlaceId: pl('a-hall'),
      mode: 'standard',
    });
    if (!route.reachable) {
      throw new Error('fixture route expected');
    }
    const view = render(
      <StationPlan2D
        {...base()}
        dataset={hub}
        route={route}
        selectedId={pl('a-hall')}
        theme="dark"
      />,
    );
    const hall = view.container.querySelector(`[data-place-id="${pl('a-hall')}"] rect`);
    expect(hall?.getAttribute('stroke')).toBe('#ffb84d');
    const gate = view.container.querySelector('[data-link-id="sk:link:test:a-gate"] line');
    expect(gate?.getAttribute('stroke')).toBe('#ff6fa3');
    view.unmount();
  });

  it('presents unknown names and orientation honestly in three locales', () => {
    for (const locale of ['zh-CN', 'ja', 'en'] as const) {
      const view = render(
        <StationPlan2D {...base()} locale={locale} selectedId={pl('a-land-1f')} />,
      );
      expect(
        view.container.querySelector('[data-compass="unknown"] [data-unknown]'),
      ).not.toBeNull();
      expect(
        view.container.querySelector('[data-selected-name] [data-unknown="unknown"]'),
      ).not.toBeNull();
      view.unmount();
    }
    const known = render(<StationPlan2D {...base()} planNorth="z-" />);
    expect(known.container.querySelector('[data-compass="known"]')).not.toBeNull();
    known.unmount();
  });
});
