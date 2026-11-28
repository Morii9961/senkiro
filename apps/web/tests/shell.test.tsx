import { APP_MODULES, type AppModule } from '@senkiro/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { MESSAGES } from '../src/i18n/messages.ts';
import type { LocalDbStatusProbeSlotProps, StationExplorerSlotProps } from '../src/slots/slots.tsx';
import { renderApp } from './render-app.tsx';

const zh = MESSAGES['zh-CN'];
const ja = MESSAGES.ja;
const en = MESSAGES.en;

// Test-only slot components (module level so React keeps their identity stable).
const seenExplorerProps: StationExplorerSlotProps[] = [];

function FakeExplorer(props: StationExplorerSlotProps) {
  seenExplorerProps.push(props);
  return (
    <button type="button" onClick={() => props.onLevelChange('2F')}>
      fake explorer {props.hub} {props.level ?? 'none'}
    </button>
  );
}

function Probe({ lang }: LocalDbStatusProbeSlotProps) {
  return <p>probe {lang}</p>;
}

function Broken(): never {
  throw new Error('boom');
}

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error');
});

afterEach(() => {
  // React, Radix and the router report problems through console.error; none are allowed.
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

describe('default shell', () => {
  it('renders the zh-CN dark Atlas home with a full-screen map and no open panel', async () => {
    const { searchStr } = await renderApp('/');
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByRole('region', { name: zh.shell.dockLabel })).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: `${zh.shell.mapLabel} · 京阪神核心圈` }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /SENKIRO Atlas/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('complementary', { name: zh.hubs.sectionTitle })).toBeInTheDocument();
    expect(searchStr()).toBe('');
    expect(document.querySelector('[data-map-mount="maplibre"]')).not.toBeNull();
    expect(document.querySelector('[data-map-mount] path, [data-map-mount] line')).toBeNull();
  });
});

describe('trilingual switching (zh-CN / ja / en)', () => {
  it('switches language from the dock and mirrors it to <html lang> and the URL', async () => {
    const user = userEvent.setup();
    const { searchStr } = await renderApp('/');
    await user.click(screen.getByRole('button', { name: zh.shell.preferences }));
    await user.click(screen.getByRole('radio', { name: '日本語' }));
    await waitFor(() => expect(document.documentElement.lang).toBe('ja'));
    expect(searchStr()).toBe('?lang=ja');
    expect(screen.getByRole('region', { name: ja.shell.dockLabel })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: ja.regions.kansai.name })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'ハブのプレビューを開く：梅田' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'English' }));
    await waitFor(() => expect(document.documentElement.lang).toBe('en'));
    expect(searchStr()).toBe('?lang=en');
    expect(screen.getByRole('button', { name: 'Open hub preview: Umeda' })).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: '简体中文' }));
    await waitFor(() => expect(document.documentElement.lang).toBe('zh-CN'));
    expect(searchStr()).toBe('');
  });

  it('shows localised honesty copy in each language', async () => {
    for (const [lang, messages] of [
      ['zh-CN', zh],
      ['ja', ja],
      ['en', en],
    ] as const) {
      const { unmount } = await renderApp(lang === 'zh-CN' ? '/?module=atlas' : `/?lang=${lang}`);
      await userEvent.setup().click(screen.getByRole('link', { name: /SENKIRO Atlas/ }));
      const dialog = await screen.findByRole('dialog', { name: 'SENKIRO Atlas' });
      expect(dialog).toHaveTextContent(messages.honesty.title);
      expect(
        within(dialog).getByRole('note', { name: new RegExp(messages.atlas.lines) }),
      ).toBeInTheDocument();
      unmount();
    }
  });
});

describe('theme switching', () => {
  it('toggles light / dark and keeps it in the URL', async () => {
    const user = userEvent.setup();
    const { searchStr } = await renderApp('/');
    await user.click(screen.getByRole('button', { name: zh.shell.preferences }));
    await user.click(screen.getByRole('radio', { name: zh.themes.light }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
    expect(searchStr()).toBe('?theme=light');
    expect(document.querySelector('[data-theme="light"][data-module]')).not.toBeNull();
    await user.click(screen.getByRole('radio', { name: zh.themes.dark }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    expect(searchStr()).toBe('');
  });
});

describe('region switching (kansai / kanto)', () => {
  it('switches region and re-centres the map preset', async () => {
    const user = userEvent.setup();
    const { searchStr } = await renderApp('/');
    await user.click(screen.getByRole('radio', { name: '关东预览区' }));
    await waitFor(() => expect(searchStr()).toBe('?region=kanto'));
    expect(
      screen.getByRole('img', { name: `${zh.shell.mapLabel} · 关东预览区` }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '京阪神核心圈' }));
    await waitFor(() => expect(searchStr()).toBe(''));
  });

  it('switching region drops a hub from the other region', async () => {
    const user = userEvent.setup();
    const { searchStr } = await renderApp('/?hub=umeda');
    expect(await screen.findByRole('dialog', { name: '梅田' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '关东预览区' }));
    await waitFor(() => expect(searchStr()).toBe('?region=kanto'));
    expect(screen.queryByRole('dialog', { name: '梅田' })).toBeNull();
  });

  it('choosing a hub in the other region switches the region', async () => {
    const user = userEvent.setup();
    const { searchStr } = await renderApp('/');
    await user.click(screen.getByRole('button', { name: '打开枢纽预览：新宿' }));
    await waitFor(() => expect(searchStr()).toBe('?region=kanto&hub=shinjuku'));
    expect(screen.getByRole('radio', { name: '关东预览区' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});

describe('AppSearchParams validation and safe fallback', () => {
  it('renders defaults when every parameter is invalid', async () => {
    const { searchStr } = await renderApp(
      '/?lang=xx&theme=neon&module=nope&region=mars&station=bad&stepFree=maybe',
    );
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByRole('link', { name: /SENKIRO Atlas/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('radio', { name: '京阪神核心圈' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    // The router's own location is canonical (here: empty); every later link builds on it.
    expect(searchStr()).toBe('');
  });

  it('keeps valid fields when others are broken', async () => {
    await renderApp('/?lang=en&theme=neon&module=tickets');
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(await screen.findByRole('dialog', { name: 'SENKIRO Tickets' })).toBeInTheDocument();
  });

  it('drops a hub that contradicts an explicit region', async () => {
    const { searchStr } = await renderApp('/?region=kanto&hub=umeda');
    expect(searchStr()).toBe('?region=kanto');
    expect(screen.queryByRole('dialog', { name: '梅田' })).toBeNull();
    expect(screen.getByRole('radio', { name: '关东预览区' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('restores the same view from the URL after a refresh', async () => {
    const user = userEvent.setup();
    const first = await renderApp('/');
    await user.click(screen.getByRole('button', { name: zh.shell.preferences }));
    await user.click(screen.getByRole('radio', { name: 'English' }));
    await user.click(screen.getByRole('radio', { name: en.themes.light }));
    await user.click(screen.getByRole('link', { name: /SENKIRO Journey/ }));
    await waitFor(() => expect(first.searchStr()).toContain('module=journey'));
    const href = first.href();
    first.unmount();

    await renderApp(href);
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(await screen.findByRole('dialog', { name: 'SENKIRO Journey' })).toBeInTheDocument();
  });
});

describe('five first-level modules', () => {
  it('switches between Atlas / Route / Tickets / Journey / Profile via the dock', async () => {
    const user = userEvent.setup();
    const { searchStr } = await renderApp('/');
    for (const module of [...APP_MODULES].reverse() as AppModule[]) {
      const title = zh.modules[module].title;
      await user.click(screen.getByRole('link', { name: new RegExp(title) }));
      expect(await screen.findByRole('dialog', { name: title })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: new RegExp(title) })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(searchStr()).toBe(module === 'atlas' ? '' : `?module=${module}`);
    }
  });

  it('closes the module panel and reopens it from the nav', async () => {
    const user = userEvent.setup();
    await renderApp('/?module=profile');
    const dialog = await screen.findByRole('dialog', { name: 'SENKIRO Profile' });
    await user.click(within(dialog).getByRole('button', { name: '关闭' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('link', { name: /SENKIRO Profile/ }));
    expect(await screen.findByRole('dialog', { name: 'SENKIRO Profile' })).toBeInTheDocument();
  });

  it('redirects path aliases such as /route to the module query', async () => {
    const { searchStr, router } = await renderApp('/route');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(searchStr()).toBe('?module=route');
    expect(await screen.findByRole('dialog', { name: 'SENKIRO Route' })).toBeInTheDocument();
  });

  it('supports arrow-key navigation between module links', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    screen.getByRole('link', { name: /SENKIRO Atlas/ }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('link', { name: /SENKIRO Route/ })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('link', { name: /SENKIRO Profile/ })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('link', { name: /SENKIRO Atlas/ })).toHaveFocus();
  });
});

describe('Route entry', () => {
  it('opens the Route panel from the dock search entry and writes from/to to the URL', async () => {
    const user = userEvent.setup();
    const { searchStr } = await renderApp('/');
    await user.click(screen.getByRole('button', { name: zh.search.entryLabel }));
    const dialog = await screen.findByRole('dialog', { name: 'SENKIRO Route' });
    const from = within(dialog).getByRole('textbox', { name: zh.search.from });
    await waitFor(() => expect(from).toHaveFocus());
    await user.type(from, '梅田');
    await user.type(within(dialog).getByRole('textbox', { name: zh.search.to }), '京都');
    await user.click(within(dialog).getByRole('checkbox', { name: zh.search.stepFree }));
    await user.click(within(dialog).getByRole('button', { name: zh.search.submit }));
    await waitFor(() => expect(searchStr()).toContain('from='));
    const params = new URLSearchParams(searchStr());
    expect(params.get('module')).toBe('route');
    expect(params.get('from')).toBe('梅田');
    expect(params.get('to')).toBe('京都');
    expect(params.get('stepFree')).toBe('true');
    expect(screen.getByRole('region', { name: zh.shell.dockLabel })).toHaveTextContent('梅田');
    expect(dialog).toHaveTextContent(zh.search.engineNotice);
  });
});

describe('hub preview and slots', () => {
  it('shows Kyoto as an honest Phase 1 placeholder', async () => {
    await renderApp('/?hub=kyoto');
    const dialog = await screen.findByRole('dialog', { name: '京都' });
    expect(dialog).toHaveTextContent(zh.hubs.phase1Body);
  });

  it('shows Umeda as waiting for the station-3d slot, and closing clears the hub', async () => {
    const user = userEvent.setup();
    const { searchStr } = await renderApp('/?hub=umeda&level=B1F');
    const dialog = await screen.findByRole('dialog', { name: '梅田' });
    expect(dialog).toHaveTextContent('@senkiro/station-3d');
    await user.click(within(dialog).getByRole('button', { name: '关闭' }));
    await waitFor(() => expect(searchStr()).toBe(''));
  });

  it('mounts a provided StationExplorer slot with URL-driven props', async () => {
    const user = userEvent.setup();
    seenExplorerProps.length = 0;
    const { searchStr } = await renderApp('/?hub=shinjuku&lang=en&stepFree=1', {
      stationExplorer: FakeExplorer,
    });
    const seen = seenExplorerProps;
    const button = await screen.findByRole('button', { name: 'fake explorer shinjuku none' });
    expect(seen.at(-1)).toMatchObject({ hub: 'shinjuku', lang: 'en', stepFree: true });
    await user.click(button);
    await waitFor(() => expect(searchStr()).toContain('level=2F'));
  });

  it('never mounts the slot for Kyoto, which has no data yet', async () => {
    const explorer = vi.fn(() => <p>should not render</p>);
    await renderApp('/?hub=kyoto', { stationExplorer: explorer });
    await screen.findByRole('dialog', { name: '京都' });
    expect(explorer).not.toHaveBeenCalled();
  });

  it('shows the local-db probe placeholder, then the provided probe', async () => {
    const first = await renderApp('/?module=profile');
    expect(await screen.findByRole('dialog')).toHaveTextContent('@senkiro/local-db');
    first.unmount();
    await renderApp('/?module=profile&lang=ja', { localDbStatusProbe: Probe });
    expect(await screen.findByText('probe ja')).toBeInTheDocument();
  });

  it('contains a failing slot without breaking the shell', async () => {
    consoleError.mockImplementation(() => undefined);
    await renderApp('/?hub=umeda', { stationExplorer: Broken });
    const dialog = await screen.findByRole('dialog', { name: '梅田' });
    expect(dialog).toHaveTextContent(zh.hubs.slotError);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    consoleError.mockClear();
  });
});

describe('desktop and narrow layouts', () => {
  it.each([
    ['desktop', 1440, 900],
    ['narrow', 375, 812],
  ])('renders every module at %s size without errors', async (_label, width, height) => {
    Object.assign(window, { innerWidth: width, innerHeight: height });
    window.dispatchEvent(new Event('resize'));
    const user = userEvent.setup();
    await renderApp('/?hub=umeda');
    for (const module of APP_MODULES) {
      await user.click(screen.getByRole('link', { name: new RegExp(zh.modules[module].title) }));
      expect(await screen.findByRole('dialog', { name: zh.modules[module].title })).toBeVisible();
    }
    expect(screen.getByRole('dialog', { name: '梅田' })).toBeInTheDocument();
  });
});
