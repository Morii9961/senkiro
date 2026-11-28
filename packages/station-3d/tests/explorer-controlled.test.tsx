// @vitest-environment jsdom
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { floorForLevelParam, levelParamForFloor, StationExplorer } from '../src/index.ts';
import { fixtureHub, lv, pl } from './fixtures.ts';
import { render } from './render.tsx';

function button(root: HTMLElement, text: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find((item) => item.textContent === text);
  if (!found) {
    throw new Error(`Missing button ${text}`);
  }
  return found;
}

function choose(root: HTMLElement, position: number, id: string) {
  const select = root.querySelectorAll('select')[position];
  if (!select) {
    throw new Error(`Missing select ${position}`);
  }
  select.value = id;
  act(() => select.dispatchEvent(new Event('change', { bubbles: true })));
}

const plan = (root: HTMLElement) => root.querySelector('[data-station-plan-2d]');

describe('level deep-link helpers', () => {
  const { levels } = fixtureHub();

  it('resolves level IDs and unambiguous floor labels to an ordinal', () => {
    expect(floorForLevelParam(levels, lv('b-b2'))).toBe(-2);
    expect(floorForLevelParam(levels, 'B1F')).toBe(-1);
    expect(floorForLevelParam(levels, '1F')).toBe(0);
  });

  it('gives all floors for unknown, empty or missing values', () => {
    expect(floorForLevelParam(levels, 'B9F')).toBeNull();
    expect(floorForLevelParam(levels, '')).toBeNull();
    expect(floorForLevelParam(levels, null)).toBeNull();
    expect(floorForLevelParam(levels, undefined)).toBeNull();
  });

  it('writes the floor label when it round-trips, and a level ID when it does not', () => {
    expect(levelParamForFloor(levels, -1)).toBe('B1F');
    expect(levelParamForFloor(levels, null)).toBeNull();
    const ambiguous = levels.map((level) =>
      level.ordinal === -2 ? { ...level, label: 'B1F' } : level,
    );
    // "B1F" now names two floors, so it is refused rather than guessed…
    expect(floorForLevelParam(ambiguous, 'B1F')).toBeNull();
    // …and both floors are written by level ID instead.
    expect(levelParamForFloor(ambiguous, -1)).toBe(lv('a-b1'));
    expect(levelParamForFloor(ambiguous, -2)).toBe(lv('b-b2'));
    for (const ordinal of [0, -1, -2]) {
      expect(floorForLevelParam(ambiguous, levelParamForFloor(ambiguous, ordinal))).toBe(ordinal);
    }
  });
});

describe('StationExplorer controlled view state', () => {
  it('shows the floor named by `level` and reports floor clicks without moving on its own', () => {
    const onLevelChange = vi.fn();
    const { container, rerender, unmount } = render(
      <StationExplorer
        dataset={fixtureHub()}
        locale="en"
        level="B1F"
        onLevelChange={onLevelChange}
      />,
    );
    expect(plan(container)?.getAttribute('data-floor')).toBe('-1');
    expect(button(container, 'B1F').getAttribute('aria-pressed')).toBe('true');
    expect(
      container.querySelector('[data-station-explorer]')?.getAttribute('data-active-level'),
    ).toBe('B1F');

    act(() => button(container, 'B2F').click());
    expect(onLevelChange).toHaveBeenLastCalledWith('B2F');
    // Controlled: the view waits for the parent (the URL) to confirm.
    expect(plan(container)?.getAttribute('data-floor')).toBe('-1');

    rerender(
      <StationExplorer
        dataset={fixtureHub()}
        locale="en"
        level={lv('b-b2')}
        onLevelChange={onLevelChange}
      />,
    );
    expect(plan(container)?.getAttribute('data-floor')).toBe('-2');
    expect(onLevelChange).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('falls back to all floors for an unknown level instead of guessing', () => {
    const { container, unmount } = render(
      <StationExplorer dataset={fixtureHub()} locale="en" level="B9F" />,
    );
    expect(
      container.querySelector('[data-station-explorer]')?.getAttribute('data-active-level'),
    ).toBe('');
    // The 2D fallback (no WebGL in jsdom) draws its first floor when "all floors" is active.
    expect(plan(container)?.getAttribute('data-floor')).toBe('0');
    unmount();
  });

  it('keeps reporting floor changes while uncontrolled', () => {
    const onLevelChange = vi.fn();
    const { container, unmount } = render(
      <StationExplorer dataset={fixtureHub()} locale="en" onLevelChange={onLevelChange} />,
    );
    act(() => button(container, 'B1F').click());
    expect(plan(container)?.getAttribute('data-floor')).toBe('-1');
    expect(onLevelChange).toHaveBeenLastCalledWith('B1F');
    unmount();
  });

  it('routes step-free when `stepFree` is set and reports toggles', () => {
    const onStepFreeChange = vi.fn();
    const dataset = fixtureHub();
    const view = (stepFree: boolean) => (
      <StationExplorer
        dataset={dataset}
        locale="en"
        stepFree={stepFree}
        onStepFreeChange={onStepFreeChange}
      />
    );
    const { container, rerender, unmount } = render(view(true));
    const checkbox = () => container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(checkbox()?.checked).toBe(true);
    choose(container, 0, pl('a-hall'));
    choose(container, 1, pl('a-plat'));
    const result = () => container.querySelector('[data-station-route-mode]');
    expect(result()?.getAttribute('data-station-route-mode')).toBe('step_free');

    act(() => checkbox()?.click());
    expect(onStepFreeChange).toHaveBeenLastCalledWith(false);
    expect(result()?.getAttribute('data-station-route-mode')).toBe('step_free');

    rerender(view(false));
    expect(checkbox()?.checked).toBe(false);
    expect(result()?.getAttribute('data-station-route-mode')).toBe('standard');
    unmount();
  });

  it('reads the plan orientation from `dataset.planNorth` unless overridden', () => {
    const withNorth = { ...fixtureHub(), planNorth: 'z-' as const };
    const known = render(<StationExplorer dataset={withNorth} locale="en" />);
    expect(known.container.querySelector('[data-compass="known"]')).not.toBeNull();
    known.unmount();

    const unknown = render(<StationExplorer dataset={fixtureHub()} locale="en" />);
    expect(unknown.container.querySelector('[data-compass="known"]')).toBeNull();
    unknown.unmount();

    const override = render(<StationExplorer dataset={fixtureHub()} locale="en" planNorth="x+" />);
    expect(override.container.querySelector('[data-compass="known"]')).not.toBeNull();
    override.unmount();
  });
});
