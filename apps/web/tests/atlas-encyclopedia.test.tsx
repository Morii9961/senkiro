/**
 * SENKIRO Atlas encyclopedia (P1-S2 M3): line / station / complex / through-service entries
 * driven by `useAppSearch()`, honest unknowns, the anti-merge exclusion list, and the two
 * deep links between the atlas and the in-station explorer (spec §5.2).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { MESSAGES } from '../src/i18n/messages.ts';
import type { ShellSlots, StationExplorerSlotProps } from '../src/slots/slots.tsx';
import { KANSAI_FIXTURE_PROVIDER } from './fixtures/atlas-bundle.ts';
import { renderApp } from './render-app.tsx';

const zh = MESSAGES['zh-CN'];
const en = MESSAGES.en;
const ja = MESSAGES.ja;
const SLOTS: ShellSlots = { atlasDataSource: KANSAI_FIXTURE_PROVIDER };

const SHINKANSEN = 'sk:line:kansai:jr-central-tokaido-shinkansen';
const KARASUMA = 'sk:line:kansai:kyoto-subway-karasuma';
const HANKYU_KYOTO = 'sk:line:kansai:hankyu-kyoto';
const KAWARAMACHI = 'sk:station:kansai:hankyu-kyoto-kawaramachi';
const TAKEDA = 'sk:station:kansai:kyoto-subway-takeda';
const KYOTO = 'sk:complex:kansai:kyoto';

let consoleError: MockInstance<typeof console.error>;
beforeEach(() => {
  consoleError = vi.spyOn(console, 'error');
});
afterEach(() => {
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

async function entry(kind: 'line' | 'station' | 'complex'): Promise<HTMLElement> {
  return waitFor(() => {
    const found = document.querySelector<HTMLElement>(`[data-atlas-entry="${kind}"]`);
    if (found === null) {
      throw new Error(`no ${kind} entry yet`);
    }
    return found;
  });
}

const param = (searchStr: string, key: string) => new URLSearchParams(searchStr).get(key);

describe('line entry', () => {
  it('opens from a shared link with operator, class, distance, honest status and stops', async () => {
    const user = userEvent.setup();
    const { searchStr } = await renderApp(`/?lang=en&line=${SHINKANSEN}`, SLOTS);
    const view = await entry('line');
    // The panel opened by itself because the URL names an entity.
    expect(screen.getByRole('dialog', { name: 'SENKIRO Atlas' })).toContainElement(view);
    expect(
      within(view).getByRole('img', { name: /Tokaido Shinkansen, station number unverified/ }),
    ).toBeInTheDocument();
    expect(view).toHaveTextContent('JR Central');
    expect(view).toHaveTextContent(en.atlas.entry.lineClasses.shinkansen);
    expect(view.querySelector('[data-operating-km]')).toHaveAttribute('data-operating-km', '39');
    expect(view).toHaveTextContent('39 km (sum of 1 sections)');
    expect(view.querySelector('[data-operational-status]')).toHaveAttribute(
      'data-operational-status',
      'unavailable',
    );
    expect(view).toHaveTextContent(en.atlas.entry.operationalUnavailable);
    expect(
      within(view).getByRole('button', { name: /Data nature: Synthetic/ }),
    ).toBeInTheDocument();

    const stops = view.querySelectorAll('[data-entry-section="sequence"] [data-station-link]');
    expect([...stops].map((stop) => stop.textContent)).toEqual([
      'Kyoto Station (Tokaido Shinkansen)',
      'Shin-Osaka (Tokaido Shinkansen)',
    ]);
    await user.click(
      within(view).getByRole('button', { name: 'Show station: Shin-Osaka (Tokaido Shinkansen)' }),
    );
    await waitFor(() =>
      expect(param(searchStr(), 'station')).toBe('sk:station:kansai:jr-central-shinosaka'),
    );
    expect(param(searchStr(), 'line')).toBeNull();
  });

  it('shows an unknown distance when any section lacks one, and the through service', async () => {
    const user = userEvent.setup();
    const { searchStr } = await renderApp(`/?lang=ja&line=${KARASUMA}`, SLOTS);
    const view = await entry('line');
    expect(view.querySelector('[data-operating-km]')).toHaveAttribute(
      'data-operating-km',
      'unknown',
    );
    expect(
      within(view).getByRole('note', { name: `${ja.atlas.entry.operatingKm}：不明` }),
    ).toBeInTheDocument();
    const through = view.querySelector<HTMLElement>('[data-entry-section="through"]');
    expect(through).toHaveTextContent('近鉄京都線・烏丸線 直通');
    expect(through).toHaveTextContent('近畿日本鉄道 / 京都市営地下鉄');
    if (through === null) {
      throw new Error('no through section');
    }
    await user.click(within(through).getByRole('button', { name: '竹田' }));
    await waitFor(() => expect(param(searchStr(), 'station')).toBe(TAKEDA));
  });
});

describe('station entry', () => {
  it('shows the code badge, lines, real complex and the transfer gate type', async () => {
    const user = userEvent.setup();
    const { searchStr } = await renderApp(`/?station=${KAWARAMACHI}`, SLOTS);
    const view = await entry('station');
    expect(view).toHaveTextContent('京都河原町');
    expect(view.querySelector('[data-station-code]')).toHaveAttribute('data-station-code', 'HK-86');
    expect(within(view).getByRole('img', { name: '阪急京都本线，站号 HK86' })).toBeInTheDocument();
    expect(view.querySelector(`[data-complex-link]`)).toHaveTextContent('四条河原町');
    expect(view.querySelector('[data-gate-type="out_of_gate"]')).toHaveTextContent(
      zh.atlas.entry.gate.out_of_gate,
    );
    // Not a Kyoto complex member, so no hub entry here.
    expect(view.querySelector('[data-enter-hub]')).toBeNull();
    await user.click(view.querySelector('[data-line-link]') as HTMLElement);
    await waitFor(() => expect(param(searchStr(), 'line')).toBe(HANKYU_KYOTO));
    expect(param(searchStr(), 'station')).toBeNull();
  });

  it('says a standalone station belongs to no complex and lists its through service', async () => {
    await renderApp(`/?lang=en&station=${TAKEDA}`, SLOTS);
    const view = await entry('station');
    expect(view.querySelector('[data-station-standalone]')).toHaveTextContent(
      en.atlas.entry.standalone,
    );
    expect(view.querySelector('[data-through-id]')).toHaveAttribute(
      'data-through-id',
      'sk:through:kansai:kintetsu-kyoto-kyoto-subway-karasuma',
    );
  });

  it('shows an unverified station number instead of guessing one', async () => {
    await renderApp('/?lang=en&station=sk:station:kansai:jr-west-kyoto', SLOTS);
    const view = await entry('station');
    expect(view.querySelector('[data-station-code]')).toHaveAttribute(
      'data-station-code',
      'unknown',
    );
    expect(
      within(view).getByRole('note', { name: 'Station number: unverified' }),
    ).toBeInTheDocument();
    expect(view.querySelector('[data-enter-hub="kyoto"]')).not.toBeNull();
  });
});

describe('complex entry', () => {
  it('lists the four members and prominently what Kyoto Station does not include', async () => {
    await renderApp(`/?complex=${KYOTO}`, SLOTS);
    const view = await entry('complex');
    expect(view).toHaveTextContent('京都站');
    expect(view).toHaveTextContent('4 站 · 4 社');
    expect(
      view.querySelectorAll('[data-entry-section="members"] [data-station-link]'),
    ).toHaveLength(4);
    const excluded = within(view).getByRole('note', { name: zh.atlas.entry.excluded });
    expect(excluded).toHaveTextContent('以下车站不属于京都站，请勿混同');
    expect(excluded).toHaveTextContent('阪急 京都河原町駅');
    expect(excluded).toHaveTextContent('京阪 祇園四条駅');
    expect(excluded.querySelector(`[data-excluded-station="${KAWARAMACHI}"]`)).not.toBeNull();
    const gates = [...view.querySelectorAll('[data-gate-type]')].map((node) =>
      node.getAttribute('data-gate-type'),
    );
    expect(gates).toEqual(['in_gate', 'out_of_gate', 'unknown']);
  });

  it('enters the in-station guide: hub + complex in the URL, hub panel open', async () => {
    const user = userEvent.setup();
    const { searchStr } = await renderApp(`/?lang=en&complex=${KYOTO}`, SLOTS);
    const view = await entry('complex');
    expect(view).toHaveTextContent(en.atlas.entry.hubPending);
    await user.click(
      within(view).getByRole('button', { name: /Open the in-station 3D\/2D guide/ }),
    );
    await waitFor(() => expect(param(searchStr(), 'hub')).toBe('kyoto'));
    expect(param(searchStr(), 'complex')).toBe(KYOTO);
    const hub = await screen.findByRole('dialog', { name: 'Kyoto' });
    expect(hub).toHaveTextContent(en.hubs.phase1Body);
  });

  it('jumps from an excluded station to its own entry', async () => {
    const user = userEvent.setup();
    const { searchStr } = await renderApp(`/?complex=${KYOTO}`, SLOTS);
    const view = await entry('complex');
    await user.click(within(view).getByRole('button', { name: '阪急 京都河原町駅' }));
    await waitFor(() => expect(param(searchStr(), 'station')).toBe(KAWARAMACHI));
    expect(param(searchStr(), 'complex')).toBeNull();
    expect((await entry('station')).querySelector('[data-complex-link]')).toHaveTextContent(
      '四条河原町',
    );
  });
});

describe('entry navigation', () => {
  it('reports an ID missing from the bundle without guessing', async () => {
    await renderApp('/?lang=en&station=sk:station:kansai:jr-west-shinosaka', SLOTS);
    const view = await entry('station');
    expect(view.querySelector('[data-entry-missing]')).toHaveTextContent(
      'sk:station:kansai:jr-west-shinosaka is not in the current data bundle',
    );
  });

  it('goes back to search and clears the selection from the URL', async () => {
    const user = userEvent.setup();
    const { searchStr } = await renderApp(`/?lang=en&line=${HANKYU_KYOTO}`, SLOTS);
    const view = await entry('line');
    await user.click(within(view).getByRole('button', { name: /Back to search/ }));
    await waitFor(() => expect(searchStr()).toBe('?lang=en'));
    expect(await screen.findByRole('searchbox')).toBeInTheDocument();
  });
});

function ExternalLineExplorer({ onNavigateExternalLine }: StationExplorerSlotProps) {
  return (
    <button type="button" onClick={() => onNavigateExternalLine?.(HANKYU_KYOTO)}>
      Hankyu Kyoto Line
    </button>
  );
}

describe('in-station → atlas (spec §5.2.3)', () => {
  it('opens the line entry next to the still-open hub preview', async () => {
    const user = userEvent.setup();
    const { searchStr } = await renderApp('/?module=journey&hub=umeda&lang=en', {
      ...SLOTS,
      stationExplorer: ExternalLineExplorer,
    });
    const hub = await screen.findByRole('dialog', { name: 'Umeda' });
    await user.click(within(hub).getByRole('button', { name: 'Hankyu Kyoto Line' }));
    const view = await entry('line');
    expect(view).toHaveTextContent('Hankyu Kyoto Main Line');
    expect(param(searchStr(), 'line')).toBe(HANKYU_KYOTO);
    expect(param(searchStr(), 'hub')).toBe('umeda');
    expect(screen.getByRole('dialog', { name: 'Umeda' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'SENKIRO Atlas' })).toContainElement(view);
  });
});
