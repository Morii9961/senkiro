// @vitest-environment jsdom
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { StationExplorer } from '../src/index.ts';
import { fixtureHub, pl } from './fixtures.ts';
import { render } from './render.tsx';

function click(root: HTMLElement, selector: string) {
  const target = root.querySelector(selector);
  if (!target) {
    throw new Error(`Missing element ${selector}`);
  }
  act(() => target.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

function choose(root: HTMLElement, position: number, id: string) {
  const select = root.querySelectorAll('select')[position];
  if (!select) {
    throw new Error(`Missing select ${position}`);
  }
  select.value = id;
  act(() => select.dispatchEvent(new Event('change', { bubbles: true })));
}

describe('StationExplorer', () => {
  it('falls back to the plan and follows floor buttons and keyboard selection', () => {
    const onSelect = vi.fn();
    const { container, unmount } = render(
      <StationExplorer dataset={fixtureHub()} locale="en" onSelect={onSelect} />,
    );
    expect(container.textContent).toContain('WebGL is unavailable here');
    const plan = () => container.querySelector('[data-station-plan-2d]');
    expect(plan()?.getAttribute('data-floor')).toBe('0');
    const b1 = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'B1F',
    );
    act(() => b1?.click());
    expect(plan()?.getAttribute('data-floor')).toBe('-1');
    const platform = container.querySelector(`[data-place-id="${pl('a-plat')}"]`);
    act(() => platform?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
    expect(onSelect).toHaveBeenCalledWith(pl('a-plat'));
    expect(container.querySelector('[data-selected-name]')?.textContent).toBe('a-plat');
    unmount();
  });

  it('recalculates when step-free routing is toggled', () => {
    const { container, unmount } = render(<StationExplorer dataset={fixtureHub()} locale="en" />);
    choose(container, 0, pl('a-hall'));
    choose(container, 1, pl('a-plat'));
    const result = () => container.querySelector('[data-station-route-mode]');
    expect(result()?.getAttribute('data-station-route-mode')).toBe('standard');
    expect(result()?.getAttribute('data-reachable')).toBe('true');
    expect(result()?.querySelectorAll('li')).toHaveLength(1);
    click(container, 'input[type="checkbox"]');
    expect(result()?.getAttribute('data-station-route-mode')).toBe('step_free');
    expect(result()?.getAttribute('data-reachable')).toBe('true');
    expect(result()?.querySelectorAll('li')).toHaveLength(3);
    expect(result()?.textContent).toContain('Step-free not confirmed');
    unmount();
  });

  it('updates locale and palette without losing activity and resets state when switching hubs', () => {
    const first = fixtureHub();
    const second = fixtureHub();
    second.complex.id = 'sk:complex:test:second';
    second.complex.names = { ja: '別の駅', ja_kana: null, en: 'Second hub', zh: '另一座车站' };
    const { container, rerender, unmount } = render(
      <StationExplorer dataset={first} locale="en" theme="light" />,
    );
    choose(container, 0, pl('hall'));
    const panel = () => container.querySelector('[data-station-explorer]');
    expect(panel()?.getAttribute('data-theme')).toBe('light');
    rerender(<StationExplorer dataset={first} locale="zh-CN" theme="dark" />);
    expect(panel()?.getAttribute('data-theme')).toBe('dark');
    expect(panel()?.getAttribute('lang')).toBe('zh-Hans');
    expect(container.textContent).toContain('无台阶');
    expect(container.querySelector('select')?.value).toBe(pl('hall'));
    rerender(<StationExplorer dataset={second} locale="ja" theme="dark" />);
    expect(panel()?.getAttribute('lang')).toBe('ja');
    expect(container.textContent).toContain('別の駅');
    expect(container.textContent).toContain('段差なし');
    expect(container.querySelector('select')?.value).toBe('');
    unmount();
  });

  it('shows the selected facility and opens its source record and official link', () => {
    const dataset = fixtureHub();
    dataset.externalLinks = [
      {
        kind: 'official_floor_map',
        url: 'https://example.test/map',
        label: { en: 'Fixture map', ja: null, ja_kana: null, zh: null },
        operatorId: null,
        stationId: null,
        sourceId: null,
      },
    ];
    const { container, unmount } = render(
      <StationExplorer dataset={dataset} locale="en" selectedId={pl('hall')} />,
    );
    expect(container.querySelector('[data-selected-name]')?.textContent).toBe('hall');
    const sources = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'View sources',
    );
    act(() => sources?.click());
    expect(container.querySelector('dialog[open]')?.textContent).toContain(
      'Synthetic test fixture',
    );
    expect(container.querySelector('a[href="https://example.test/map"]')?.textContent).toBe(
      'Fixture map',
    );
    click(container, 'dialog button');
    expect(container.querySelector('dialog')).toBeNull();
    unmount();
  });
});
