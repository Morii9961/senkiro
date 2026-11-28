/**
 * P0-W2 review follow-ups owned by P1-S2 (docs/dispatch/phase-0/README.md §4):
 * #3 OPFS fallback reasons, #4 probe robustness, #5 local-db slot copy, #7 hub boundary key,
 * plus the in-station → atlas external-line deep link (spec §5.2.3).
 */
import { parseAppSearchParams } from '@senkiro/contracts';
import type { LocalDbDriver, LocalDbPersistenceMode } from '@senkiro/local-db';
import { openNodeLocalDb } from '@senkiro/local-db/node';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { MESSAGES } from '../src/i18n/messages.ts';
import {
  LocalDbStatusProbe,
  type OpenLocalDb,
  readFallbackReason,
  settleLocalDbProbes,
} from '../src/slots/adapters/local-db-probe.tsx';
import type {
  LocalDbStatusProbeSlotProps,
  ShellSlots,
  StationExplorerSlotProps,
} from '../src/slots/slots.tsx';
import { renderApp } from './render-app.tsx';

const en = MESSAGES.en;
const ja = MESSAGES.ja;

let consoleError: MockInstance<typeof console.error>;
const opened: OpenLocalDb[] = [];

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error');
});

afterEach(async () => {
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
  await Promise.all(opened.splice(0).map((open) => settleLocalDbProbes(open)));
});

/** A Node WASM driver dressed up as a browser driver, optionally with extra fields. */
function fakeOpen(
  overrides: Partial<Record<keyof LocalDbDriver, unknown>> & {
    persistenceMode?: LocalDbPersistenceMode;
    persistenceFallbackReason?: unknown;
  },
): OpenLocalDb {
  const open: OpenLocalDb = async () => {
    const driver = await openNodeLocalDb();
    return { ...driver, ...overrides } as LocalDbDriver;
  };
  opened.push(open);
  return open;
}

/** Driver factory used by {@link Probe}; each test sets its own before rendering. */
let probeOpen: OpenLocalDb = openNodeLocalDb;

function Probe({ lang }: LocalDbStatusProbeSlotProps) {
  return <LocalDbStatusProbe open={probeOpen} lang={lang} />;
}

function probeSlot(open: OpenLocalDb): typeof Probe {
  probeOpen = open;
  return Probe;
}

async function readyProbe(): Promise<HTMLElement> {
  return waitFor(
    () => {
      const found = document.querySelector<HTMLElement>('[data-local-db-probe="ready"]');
      if (found === null) {
        throw new Error('probe not ready');
      }
      return found;
    },
    { timeout: 15000 },
  );
}

describe('#3 OPFS fallback reason (spec §5.3)', () => {
  it('reads only the three documented reasons and ignores anything else', () => {
    const base = { persistenceMode: 'memory-fallback' } as unknown as LocalDbDriver;
    expect(readFallbackReason(base)).toBeNull();
    for (const reason of ['unsupported', 'pool-busy', 'unknown'] as const) {
      expect(
        readFallbackReason({ ...base, persistenceFallbackReason: reason } as LocalDbDriver),
      ).toBe(reason);
    }
    expect(
      readFallbackReason({ ...base, persistenceFallbackReason: 'busy' } as LocalDbDriver),
    ).toBeNull();
    expect(
      readFallbackReason({ ...base, persistenceFallbackReason: 3 } as LocalDbDriver),
    ).toBeNull();
  });

  it('says another tab holds the OPFS pool when the driver reports pool-busy', async () => {
    const open = fakeOpen({
      persistenceMode: 'memory-fallback',
      persistenceFallbackReason: 'pool-busy',
    });
    await renderApp('/?module=profile&lang=en', { localDbStatusProbe: probeSlot(open) });
    const probe = await readyProbe();
    expect(probe).toHaveAttribute('data-persistence-mode', 'memory-fallback');
    expect(probe).toHaveAttribute('data-fallback-reason', 'pool-busy');
    expect(probe).toHaveTextContent(en.probe.fallbackNotes['pool-busy']);
    expect(probe).not.toHaveTextContent(en.probe.fallbackNotes.unsupported);
  });

  it('says the browser lacks sync access handles only when the driver reports unsupported', async () => {
    const open = fakeOpen({
      persistenceMode: 'memory-fallback',
      persistenceFallbackReason: 'unsupported',
    });
    await renderApp('/?module=profile&lang=ja', { localDbStatusProbe: probeSlot(open) });
    const probe = await readyProbe();
    expect(probe).toHaveAttribute('data-fallback-reason', 'unsupported');
    expect(probe).toHaveTextContent(ja.probe.fallbackNotes.unsupported);
  });

  it('claims no cause for drivers that predate the field', async () => {
    const open = fakeOpen({ persistenceMode: 'memory-fallback' });
    await renderApp('/?module=profile&lang=en', { localDbStatusProbe: probeSlot(open) });
    const probe = await readyProbe();
    expect(probe).toHaveAttribute('data-fallback-reason', 'unreported');
    expect(probe).toHaveTextContent(en.probe.fallbackNotes.unreported);
    expect(probe).not.toHaveTextContent(en.probe.fallbackNotes.unsupported);
    expect(probe).not.toHaveTextContent(en.probe.fallbackNotes['pool-busy']);
  });

  it('shows the persistent note and no reason in OPFS mode', async () => {
    const open = fakeOpen({ persistenceMode: 'opfs-sahpool' });
    await renderApp('/?module=profile&lang=en', { localDbStatusProbe: probeSlot(open) });
    const probe = await readyProbe();
    expect(probe).not.toHaveAttribute('data-fallback-reason');
    expect(probe).toHaveTextContent(en.probe.persistentNote);
  });
});

describe('#4 probe robustness', () => {
  it('leaves "opening" with an honest error when the first status read fails', async () => {
    const open = fakeOpen({});
    const failingRead: OpenLocalDb = async () => {
      const driver = await open();
      return {
        ...driver,
        execute: (sql: string, parameters?: Parameters<LocalDbDriver['execute']>[1]) =>
          sql.includes('sqlite_schema')
            ? Promise.reject(new Error('status read failed'))
            : driver.execute(sql, parameters),
      };
    };
    opened.push(failingRead);
    await renderApp('/?module=profile&lang=en', { localDbStatusProbe: probeSlot(failingRead) });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('status read failed');
    expect(document.querySelector('[data-local-db-probe="opening"]')).toBeNull();
  });

  it('reports a failed write as an operation error and keeps every action button', async () => {
    const user = userEvent.setup();
    // Transactions fail only once the probe is open (opening itself runs the schema DDL).
    let armed = false;
    const open: OpenLocalDb = async () => {
      const driver = await openNodeLocalDb();
      return {
        ...driver,
        transaction: <T,>(work: Parameters<LocalDbDriver['transaction']>[0]) =>
          armed ? Promise.reject(new Error('disk full')) : (driver.transaction(work) as Promise<T>),
      };
    };
    opened.push(open);
    await renderApp('/?module=profile&lang=en', { localDbStatusProbe: probeSlot(open) });
    const probe = await readyProbe();
    armed = true;
    await user.click(within(probe).getByRole('button', { name: en.probe.write }));
    const alert = await within(probe).findByRole('alert');
    expect(alert).toHaveTextContent('disk full');
    expect(alert).toHaveTextContent(en.probe.actionFailed.split('{error}')[1]?.trim() ?? '');
    // Still the ready probe, with all three self-checks available.
    expect(probe).toHaveAttribute('data-local-db-probe', 'ready');
    expect(probe).toHaveAttribute('data-probe-rows', '0');
    expect(within(probe).getByRole('button', { name: en.probe.write })).toBeEnabled();
    expect(within(probe).getByRole('button', { name: en.probe.exportJson })).toBeEnabled();
    expect(within(probe).getByRole('button', { name: en.probe.clear })).toBeInTheDocument();
  });
});

function Crash(): never {
  throw new Error('chunk failed');
}

describe('#5 local-db slot boundaries use their own copy', () => {
  it.each([
    ['profile', 'en'],
    ['journey', 'ja'],
  ] as const)('%s shows the local-db error copy, not the hub copy', async (module, lang) => {
    consoleError.mockImplementation(() => undefined);
    await renderApp(`/?module=${module}&lang=${lang}`, { localDbStatusProbe: Crash });
    const slot = document.querySelector<HTMLElement>('[data-slot="local-db-status-probe"]');
    expect(slot).toHaveTextContent(MESSAGES[lang].slots.localDbError);
    expect(slot).not.toHaveTextContent(MESSAGES[lang].hubs.slotError);
    consoleError.mockClear();
  });
});

function FakeExplorer({ hub, onNavigateExternalLine }: StationExplorerSlotProps) {
  if (hub === 'umeda') {
    throw new Error('umeda model failed');
  }
  return (
    <div data-fake-explorer={hub}>
      <button
        type="button"
        onClick={() => onNavigateExternalLine?.('sk:line:kanto:jr-east-yamanote')}
      >
        external line
      </button>
    </div>
  );
}

const EXPLORER_SLOTS: ShellSlots = { stationExplorer: FakeExplorer };

describe('#7 hub slot boundary is keyed by hub', () => {
  it('does not carry an Umeda error over to Shinjuku', async () => {
    consoleError.mockImplementation(() => undefined);
    const { router } = await renderApp('/?hub=umeda&lang=en', EXPLORER_SLOTS);
    const dialog = await screen.findByRole('dialog', { name: 'Umeda' });
    expect(dialog).toHaveTextContent(en.hubs.slotError);
    consoleError.mockClear();
    await act(() =>
      router.navigate({ to: '/', search: parseAppSearchParams({ hub: 'shinjuku', lang: 'en' }) }),
    );
    const shinjuku = await screen.findByRole('dialog', { name: 'Shinjuku' });
    expect(shinjuku).not.toHaveTextContent(en.hubs.slotError);
    expect(shinjuku.querySelector('[data-fake-explorer="shinjuku"]')).not.toBeNull();
  });
});

describe('in-station → atlas external line (spec §5.2.3)', () => {
  it('switches to Atlas with the line and keeps the hub preview', async () => {
    const user = userEvent.setup();
    const { router } = await renderApp(
      '/?module=journey&hub=shinjuku&lang=en&station=sk:station:kanto:jr-east-shinjuku',
      EXPLORER_SLOTS,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Shinjuku' });
    await user.click(within(dialog).getByRole('button', { name: 'external line' }));
    await waitFor(() => expect(router.state.location.searchStr).toContain('line='));
    const params = new URLSearchParams(router.state.location.searchStr);
    expect(params.get('line')).toBe('sk:line:kanto:jr-east-yamanote');
    expect(params.get('hub')).toBe('shinjuku');
    expect(params.has('station')).toBe(false);
    expect(params.has('complex')).toBe(false);
    expect(params.has('module')).toBe(false); // 'atlas' is the default and is omitted
  });
});
