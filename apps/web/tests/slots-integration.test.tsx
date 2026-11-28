/**
 * P0-W2 integration: the real `@senkiro/station-3d` explorer and `@senkiro/local-db` probe
 * mounted through the shell slots, driven by the URL. jsdom has no WebGL, so the explorer
 * runs its honest 2D-plan fallback; the probe uses the Node SQLite WASM driver (the browser
 * Worker + OPFS path is covered by the Playwright Exit Gate 0 spec).
 */

import { parseAppSearchParams } from '@senkiro/contracts';
import { openNodeLocalDb } from '@senkiro/local-db/node';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';
import { MESSAGES } from '../src/i18n/messages.ts';
import {
  JOURNEY_TABLES,
  LocalDbStatusProbe,
  settleLocalDbProbes,
} from '../src/slots/adapters/local-db-probe.tsx';
import {
  HUB_DATASET_LOADERS,
  loadHubDataset,
  StationExplorerSlot,
} from '../src/slots/adapters/station-explorer.tsx';
import { DEFAULT_SHELL_SLOTS } from '../src/slots/registry.ts';
import type { LocalDbStatusProbeSlotProps, ShellSlots } from '../src/slots/slots.tsx';
import { renderApp } from './render-app.tsx';

const zh = MESSAGES['zh-CN'];
const en = MESSAGES.en;

function NodeProbe({ lang }: LocalDbStatusProbeSlotProps) {
  return <LocalDbStatusProbe open={openNodeLocalDb} lang={lang} />;
}

const SLOTS: ShellSlots = { stationExplorer: StationExplorerSlot, localDbStatusProbe: NodeProbe };

function failingOpen(): Promise<never> {
  return Promise.reject(new Error('no worker here'));
}

function FailingProbe({ lang }: LocalDbStatusProbeSlotProps) {
  return <LocalDbStatusProbe open={failingOpen} lang={lang} />;
}

let consoleError: MockInstance<typeof console.error>;

// The browser suspends on the first visit to a hub; preloading keeps jsdom's synchronous
// `act()` render free of that suspension (the adapter then renders the cached dataset).
beforeAll(async () => {
  await Promise.all([loadHubDataset('umeda'), loadHubDataset('shinjuku')]);
});

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error');
});

afterEach(async () => {
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
  await settleLocalDbProbes(openNodeLocalDb);
});

async function explorer(): Promise<HTMLElement> {
  return waitFor(
    () => {
      const found = document.querySelector<HTMLElement>('[data-station-explorer]');
      if (found === null) {
        throw new Error('explorer not mounted yet');
      }
      return found;
    },
    { timeout: 15000 },
  );
}

const floorButton = (root: HTMLElement, label: string) =>
  within(root).getByRole('button', { name: label, pressed: false });

describe('registry', () => {
  it('fills both slots with lazy adapters', () => {
    expect(DEFAULT_SHELL_SLOTS.stationExplorer).toBeDefined();
    expect(DEFAULT_SHELL_SLOTS.localDbStatusProbe).toBeDefined();
  });

  it('publishes dataset loaders for Umeda and Shinjuku only', async () => {
    expect(Object.keys(HUB_DATASET_LOADERS).sort()).toEqual(['shinjuku', 'umeda']);
    expect(loadHubDataset('kyoto')).toBeNull();
    const umeda = await loadHubDataset('umeda');
    expect(umeda?.complex.id).toBe('sk:complex:kansai:osaka-umeda');
    expect(umeda?.planNorth).toBe('z-');
    expect(loadHubDataset('umeda')).toBe(loadHubDataset('umeda'));
  });
});

describe('Umeda through the station-explorer slot', () => {
  it('renders the real hub with the level from the URL and writes floor changes back', async () => {
    const user = userEvent.setup();
    const { searchStr } = await renderApp('/?hub=umeda&level=B1F', SLOTS);
    const dialog = await screen.findByRole('dialog', { name: '梅田' });
    expect(dialog).toHaveTextContent(zh.hubs.status.connected);
    const view = await explorer();
    expect(view).toHaveAttribute('aria-label', '大阪·梅田');
    expect(view).toHaveAttribute('data-active-level', 'B1F');
    expect(view.querySelector('[data-station-plan-2d]')).toHaveAttribute('data-floor', '-1');
    // Plan north comes from the contract dataset (`planNorth: 'z-'`).
    expect(view.querySelector('[data-compass="known"]')).not.toBeNull();

    await user.click(floorButton(view, 'B2F'));
    await waitFor(() => expect(searchStr()).toContain('level=B2F'));
    await waitFor(() =>
      expect(view.querySelector('[data-station-plan-2d]')).toHaveAttribute('data-floor', '-2'),
    );
  }, 30000);

  it('restores a selected facility from the URL and writes a new selection back', async () => {
    const user = userEvent.setup();
    const selected = 'sk:place:umeda:jr-west-inside';
    const { searchStr } = await renderApp(
      `/?hub=umeda&lang=en&selection=${encodeURIComponent(selected)}`,
      SLOTS,
    );
    const view = await explorer();
    expect(view.querySelector('[data-selected-name]')?.textContent).not.toBe('');
    const other = [...view.querySelectorAll<SVGElement>('[data-place-id]')].find(
      (node) => node.dataset.placeId !== selected,
    );
    if (other === undefined) {
      throw new Error('no other place on the plan');
    }
    await user.click(other);
    await waitFor(() =>
      expect(new URLSearchParams(searchStr()).get('selection')).toBe(other.dataset.placeId),
    );
  }, 30000);

  it('runs step-free routing from `stepFree=true` and clears it from the URL when unticked', async () => {
    const user = userEvent.setup();
    const { searchStr } = await renderApp('/?hub=umeda&lang=en&stepFree=true', SLOTS);
    const view = await explorer();
    const checkbox = within(view).getByRole('checkbox');
    expect(checkbox).toBeChecked();
    const [from, to] = within(view).getAllByRole('combobox') as HTMLSelectElement[];
    const values = [...(from?.options ?? [])].map((option) => option.value).filter(Boolean);
    await user.selectOptions(from as HTMLSelectElement, values[0] as string);
    await user.selectOptions(to as HTMLSelectElement, values[1] as string);
    expect(view.querySelector('[data-station-route-mode]')).toHaveAttribute(
      'data-station-route-mode',
      'step_free',
    );
    await user.click(checkbox);
    await waitFor(() => expect(searchStr()).not.toContain('stepFree'));
    await waitFor(() =>
      expect(view.querySelector('[data-station-route-mode]')).toHaveAttribute(
        'data-station-route-mode',
        'standard',
      ),
    );
  }, 30000);
});

describe('Shinjuku and Kyoto', () => {
  it('switches to Kanto and renders the Shinjuku hub and its plan', async () => {
    const { router } = await renderApp('/?hub=shinjuku&lang=en', SLOTS);
    expect(parseAppSearchParams(router.state.location.search)).toMatchObject({
      region: 'kanto',
      hub: 'shinjuku',
    });
    await screen.findByRole('dialog', { name: 'Shinjuku' });
    const view = await explorer();
    expect(view.getAttribute('aria-label')).toMatch(/Shinjuku/);
    expect(view.querySelector('[data-station-plan-2d]')).not.toBeNull();
    expect(view.querySelector('[data-compass="known"]')).not.toBeNull();
  }, 30000);

  it('keeps Kyoto on the Phase 1 placeholder and never loads a model', async () => {
    const explorerSpy = vi.fn(StationExplorerSlot);
    await renderApp('/?hub=kyoto', { ...SLOTS, stationExplorer: explorerSpy });
    const dialog = await screen.findByRole('dialog', { name: '京都' });
    expect(dialog).toHaveTextContent(zh.hubs.phase1Body);
    expect(explorerSpy).not.toHaveBeenCalled();
    expect(document.querySelector('[data-station-explorer]')).toBeNull();
  });

  it('refuses Kyoto even if the adapter is called directly', () => {
    consoleError.mockImplementation(() => undefined);
    expect(() =>
      StationExplorerSlot({
        hub: 'kyoto',
        lang: 'en',
        theme: 'dark',
        level: null,
        selection: null,
        stepFree: false,
        onLevelChange: () => undefined,
        onSelectionChange: () => undefined,
        onStepFreeChange: () => undefined,
      }),
    ).toThrow(/kyoto/);
    consoleError.mockClear();
  });
});

describe('local-db status probe slot', () => {
  it('opens the journey schema, writes, exports and clears self-check rows (Profile)', async () => {
    const user = userEvent.setup();
    await renderApp('/?module=profile&lang=en', SLOTS);
    const probe = await waitFor(
      () => {
        const found = document.querySelector<HTMLElement>('[data-local-db-probe="ready"]');
        if (found === null) {
          throw new Error('probe not ready');
        }
        return found;
      },
      { timeout: 15000 },
    );
    expect(probe).toHaveAttribute('data-persistence-mode', 'memory');
    expect(probe).toHaveAttribute('data-tables-ready', String(JOURNEY_TABLES.length));
    expect(JOURNEY_TABLES).toHaveLength(6);
    expect(probe).toHaveAttribute('data-probe-rows', '0');

    await user.click(within(probe).getByRole('button', { name: en.probe.write }));
    await waitFor(() => expect(probe).toHaveAttribute('data-probe-rows', '1'));

    await user.click(within(probe).getByRole('button', { name: en.probe.exportJson }));
    const exported = await within(probe).findByText(/Exported \d+ bytes of JSON/);
    expect(Number(exported.getAttribute('data-probe-export-bytes'))).toBeGreaterThan(100);

    await user.click(within(probe).getByRole('button', { name: en.probe.clear }));
    await waitFor(() => expect(probe).toHaveAttribute('data-probe-rows', '0'));
  }, 30000);

  it('also mounts in the Journey module', async () => {
    await renderApp('/?module=journey&lang=ja', SLOTS);
    await waitFor(
      () => expect(document.querySelector('[data-local-db-probe="ready"]')).not.toBeNull(),
      { timeout: 15000 },
    );
    expect(screen.getByText(MESSAGES.ja.probe.write)).toBeInTheDocument();
  }, 30000);

  it('shows an honest error when the database cannot be opened', async () => {
    await renderApp('/?module=profile&lang=en', { localDbStatusProbe: FailingProbe });
    expect(await screen.findByRole('alert')).toHaveTextContent('no worker here');
  });
});
