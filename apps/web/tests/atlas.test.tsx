/**
 * SENKIRO Atlas (P1-S2 M2): search anti-merge, operator filter, offline MapLibre style and
 * the §3.2 layer schema, driven by the test-only Kansai fixture through the typed
 * `atlasDataSource` slot. jsdom has no WebGL, so the map engine honestly stays off.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import {
  buildAtlasGeoJson,
  corridorSlot,
  HUB_COMPLEX_IDS,
} from '../src/features/atlas/atlas-geojson.ts';
import {
  buildAtlasIndex,
  highlightRange,
  normalizeSearchText,
  searchAtlas,
} from '../src/features/atlas/atlas-index.ts';
import { pickFromFeature } from '../src/features/atlas/atlas-pick.ts';
import {
  ATLAS_PALETTES,
  buildAtlasStyle,
  labelExpression,
  onLineExpression,
} from '../src/features/atlas/atlas-style.ts';
import { MESSAGES } from '../src/i18n/messages.ts';
import { previewAtlasSource } from '../src/slots/registry.ts';
import type { ShellSlots } from '../src/slots/slots.tsx';
import {
  KANSAI_FIXTURE_PROVIDER as FIXTURE_PROVIDER,
  KANSAI_FIXTURE_BUNDLE,
} from './fixtures/atlas-bundle.ts';
import { renderApp } from './render-app.tsx';

const zh = MESSAGES['zh-CN'];
const en = MESSAGES.en;
const index = buildAtlasIndex(KANSAI_FIXTURE_BUNDLE);

const KYOTO = 'sk:complex:kansai:kyoto';
const SHIJO_KAWARAMACHI = 'sk:complex:kansai:shijo-kawaramachi';
const KAWARAMACHI = 'sk:station:kansai:hankyu-kyoto-kawaramachi';
const GION_SHIJO = 'sk:station:kansai:keihan-gion-shijo';
const HANKYU = 'sk:operator:jp:hankyu';

const SLOTS: ShellSlots = { atlasDataSource: FIXTURE_PROVIDER };

let consoleError: MockInstance<typeof console.error>;
beforeEach(() => {
  consoleError = vi.spyOn(console, 'error');
});
afterEach(() => {
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

describe('search normalisation', () => {
  it('folds width, case, katakana and separators', () => {
    expect(normalizeSearchText('ＨＫ－８６')).toBe('hk86');
    expect(normalizeSearchText('Kyoto-Kawaramachi')).toBe('kyotokawaramachi');
    expect(normalizeSearchText('カワラマチ')).toBe('かわらまち');
    expect(normalizeSearchText('大阪・梅田')).toBe('大阪梅田');
  });

  it('maps a highlight back onto the displayed text', () => {
    expect(highlightRange('京都河原町', '河原町')).toEqual([2, 5]);
    expect(highlightRange('Kyoto-kawaramachi', 'kyoto kawa')).toEqual([0, 10]);
    expect(highlightRange('京都河原町', 'かわらまち')).toBeNull();
  });
});

describe('anti-merge search (spec §2.3)', () => {
  it('"京都" keeps the Kyoto Station complex and Kyoto-kawaramachi apart', () => {
    const results = searchAtlas(index, '京都');
    expect(results.complexes.map((r) => r.id)).toEqual([KYOTO]);
    const stations = results.stations.map((r) => r.id);
    expect(stations).toContain(KAWARAMACHI);
    // Kawaramachi is a station result of its own complex, never a Kyoto member.
    expect(index.stations.get(KAWARAMACHI)?.stationComplexId).toBe(SHIJO_KAWARAMACHI);
    expect(index.complexes.get(KYOTO)?.stationIds).not.toContain(KAWARAMACHI);
    expect(index.complexes.get(KYOTO)?.stationIds).toHaveLength(4);
  });

  it('"河原町" never matches the Kyoto complex through its exclusion list', () => {
    const kyoto = index.complexes.get(KYOTO);
    expect(kyoto?.explicitlyExcluded.some((e) => e.name.includes('河原町'))).toBe(true);
    const results = searchAtlas(index, '河原町');
    expect(results.complexes.map((r) => r.id)).toEqual([SHIJO_KAWARAMACHI]);
    expect(results.stations.map((r) => r.id)).toEqual([KAWARAMACHI]);
  });

  it('"祇園四条" finds Keihan Gion-Shijo, not the Kyoto complex', () => {
    const results = searchAtlas(index, '祇園四条');
    expect(results.complexes).toEqual([]);
    expect(results.stations.map((r) => r.id)).toEqual([GION_SHIJO]);
  });

  it.each([
    ['kana', 'かわらまち'],
    ['katakana', 'カワラマチ'],
    ['English', 'kawaramachi'],
    ['station number', 'HK-86'],
    ['loose station number', 'ｈｋ86'],
  ])('finds Kyoto-kawaramachi by %s', (_kind, query) => {
    expect(searchAtlas(index, query).stations.map((r) => r.id)).toContain(KAWARAMACHI);
  });

  it('finds Simplified Chinese names and lines', () => {
    const results = searchAtlas(index, '乌丸');
    expect(results.stations.map((r) => r.id)).toContain('sk:station:kansai:hankyu-karasuma');
    expect(results.lines.map((r) => r.id)).toContain('sk:line:kansai:kyoto-subway-karasuma');
    expect(results.complexes.map((r) => r.id)).toContain('sk:complex:kansai:shijo-karasuma');
  });

  it('ranks exact before prefix before contained matches', () => {
    const [first] = searchAtlas(index, '京都駅').complexes;
    expect(first).toMatchObject({ id: KYOTO, rank: 0 });
  });

  it('drops results whose operators are all hidden and counts them', () => {
    const results = searchAtlas(index, '河原町', { hiddenOperatorIds: new Set([HANKYU]) });
    expect(results.stations).toEqual([]);
    // The complex still has a visible operator (Keihan).
    expect(results.complexes.map((r) => r.id)).toEqual([SHIJO_KAWARAMACHI]);
    expect(results.hiddenByFilter).toBe(1);
  });
});

describe('§3.2 layers from trackGraph', () => {
  const geo = buildAtlasGeoJson(index);

  it('uses exactly the spec property names', () => {
    expect(Object.keys(geo.rail_segments.features[0]?.properties ?? {}).sort()).toEqual(
      [
        'color',
        'corridor_count',
        'corridor_slot',
        'id',
        'is_shinkansen',
        'label_en',
        'label_ja',
        'label_zh_cn',
        'line_class',
        'line_ids_json',
        'operator_id',
        'primary_line_id',
      ].sort(),
    );
    expect(Object.keys(geo.rail_stations.features[0]?.properties ?? {}).sort()).toEqual(
      [
        'complex_id',
        'id',
        'importance_rank',
        'label_en',
        'label_ja',
        'label_zh_cn',
        'operator_id',
        'station_code',
      ].sort(),
    );
    expect(Object.keys(geo.station_complexes.features[0]?.properties ?? {}).sort()).toEqual(
      ['hub_key', 'id', 'label_en', 'label_ja', 'label_zh_cn', 'station_count'].sort(),
    );
    expect(Object.keys(geo.through_boundaries.features[0]?.properties ?? {}).sort()).toEqual(
      ['boundary_station_id', 'id', 'label_en', 'label_ja', 'label_zh_cn'].sort(),
    );
  });

  it('marks Kyoto as a 3D hub badge and ranks its stations first', () => {
    const kyoto = geo.station_complexes.features.find((f) => f.properties.id === KYOTO);
    expect(kyoto?.properties).toMatchObject({ hub_key: 'kyoto', station_count: 4 });
    const shijo = geo.station_complexes.features.find((f) => f.properties.id === SHIJO_KAWARAMACHI);
    expect(shijo?.properties.hub_key).toBe('');
    const jr = geo.rail_stations.features.find(
      (f) => f.properties.id === 'sk:station:kansai:jr-west-kyoto',
    );
    expect(jr?.properties.importance_rank).toBe(1);
    expect(HUB_COMPLEX_IDS.kyoto).toBe(KYOTO);
  });

  it('flags shinkansen and keeps unknown station codes empty, not guessed', () => {
    const shinkansen = geo.rail_segments.features.filter((f) => f.properties.is_shinkansen);
    expect(shinkansen).toHaveLength(1);
    const jr = geo.rail_stations.features.find(
      (f) => f.properties.id === 'sk:station:kansai:jr-west-kyoto',
    );
    expect(jr?.properties.station_code).toBe('');
  });

  it('assigns corridor slots 0, 1, -1, 2, -2 …', () => {
    expect([0, 1, 2, 3, 4].map(corridorSlot)).toEqual([0, 1, -1, 2, -2]);
  });

  it('puts the through-service boundary on the boundary station', () => {
    const [boundary] = geo.through_boundaries.features;
    expect(boundary?.properties.boundary_station_id).toBe('sk:station:kansai:kyoto-subway-takeda');
  });
});

describe('offline MapLibre style', () => {
  // jsdom replaces the global URL, so resolve the path without it.
  const tokens = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../packages/ui-kit/src/styles/tokens.css',
    ),
    'utf8',
  );
  const [darkCss, lightCss] = tokens.split('[data-theme="light"] {');

  it.each([
    ['dark', darkCss],
    ['light', lightCss],
  ] as const)('mirrors the %s ui-kit palette', (theme, css) => {
    const palette = ATLAS_PALETTES[theme];
    for (const [token, value] of [
      ['canvas', palette.canvas],
      ['surface', palette.surface],
      ['text', palette.text],
      ['accent', palette.accent],
      ['verified', palette.verified],
    ]) {
      expect(css).toContain(`--sk-color-${token}: ${value};`);
    }
  });

  it('needs no glyph server, sprite or basemap tiles', () => {
    const style = buildAtlasStyle({
      theme: 'dark',
      lang: 'zh-CN',
      source: { kind: 'pmtiles', url: 'http://127.0.0.1/tiles/kansai-rail.pmtiles' },
      hiddenOperatorIds: [],
      selection: {},
      attribution: 'x',
    });
    expect(style.glyphs).toBeUndefined();
    expect(style.sprite).toBeUndefined();
    expect(Object.values(style.sources)).toEqual([
      {
        type: 'vector',
        url: 'pmtiles://http://127.0.0.1/tiles/kansai-rail.pmtiles',
        attribution: 'x',
      },
    ]);
    const sourceLayers = new Set(
      style.layers.flatMap((layer) => ('source-layer' in layer ? [layer['source-layer']] : [])),
    );
    expect([...sourceLayers].sort()).toEqual(
      ['rail_segments', 'rail_stations', 'station_complexes', 'through_boundaries'].sort(),
    );
  });

  it('offsets parallel lines by corridor_slot and draws shinkansen as a dashed double line', () => {
    const style = buildAtlasStyle({
      theme: 'light',
      lang: 'en',
      source: { kind: 'geojson', data: buildAtlasGeoJson(index) },
      hiddenOperatorIds: [HANKYU],
      selection: { lineId: 'sk:line:kansai:hankyu-kyoto' },
      attribution: '',
    });
    const byId = new Map(style.layers.map((layer) => [layer.id, layer]));
    expect(JSON.stringify(byId.get('sk-rail'))).toContain('corridor_slot');
    expect(byId.get('sk-shinkansen-core')).toMatchObject({
      paint: { 'line-dasharray': [2.4, 1.2] },
    });
    // Hidden operators are filtered out of lines and stations.
    const filterOf = (id: string) => (byId.get(id) as { filter?: unknown } | undefined)?.filter;
    expect(JSON.stringify(filterOf('sk-rail'))).toContain(HANKYU);
    expect(JSON.stringify(filterOf('sk-station-r1'))).toContain(HANKYU);
    // Station labels appear by importance rank.
    expect(byId.get('sk-station-label-r1')?.minzoom).toBeLessThan(
      byId.get('sk-station-label-r3')?.minzoom ?? 0,
    );
    expect(byId.get('sk-hub-badge')).toBeDefined();
    expect(style.sources['sk-rail_segments']).toMatchObject({ type: 'geojson' });
  });

  it('resolves labels with the contract fallback order', () => {
    expect(JSON.stringify(labelExpression('zh-CN'))).toMatch(/label_zh_cn.*label_ja.*label_en/);
    expect(JSON.stringify(labelExpression('ja'))).toMatch(/label_ja.*label_en.*label_zh_cn/);
    expect(JSON.stringify(labelExpression('en'))).toMatch(/label_en.*label_ja.*label_zh_cn/);
    expect(JSON.stringify(onLineExpression('sk:line:kansai:a'))).toContain(
      '\\"sk:line:kansai:a\\"',
    );
  });

  it('turns clicked features into typed picks and ignores malformed IDs', () => {
    expect(pickFromFeature('sk-hub-badge', { id: KYOTO, hub_key: 'kyoto' })).toEqual({
      kind: 'complex',
      id: KYOTO,
      hub: 'kyoto',
    });
    expect(pickFromFeature('sk-complex-ring', { id: SHIJO_KAWARAMACHI, hub_key: '' })).toEqual({
      kind: 'complex',
      id: SHIJO_KAWARAMACHI,
      hub: null,
    });
    expect(pickFromFeature('sk-station-r2', { id: KAWARAMACHI })).toEqual({
      kind: 'station',
      id: KAWARAMACHI,
    });
    expect(
      pickFromFeature('sk-through', {
        boundary_station_id: 'sk:station:kansai:kyoto-subway-takeda',
      }),
    ).toEqual({ kind: 'station', id: 'sk:station:kansai:kyoto-subway-takeda' });
    expect(pickFromFeature('sk-rail', { primary_line_id: 'sk:line:kansai:hankyu-kyoto' })).toEqual({
      kind: 'line',
      id: 'sk:line:kansai:hankyu-kyoto',
    });
    expect(pickFromFeature('sk-station-r1', { id: 'not-an-id' })).toBeNull();
  });
});

describe('preview seam', () => {
  it('ignores a missing or malformed global and labels injected bundles as preview', async () => {
    expect(previewAtlasSource({})).toBeUndefined();
    expect(
      previewAtlasSource({ __SENKIRO_ATLAS_PREVIEW__: { kansai: { region: 'kanto' } } }),
    ).toBeUndefined();
    const provider = previewAtlasSource({
      __SENKIRO_ATLAS_PREVIEW__: { kansai: KANSAI_FIXTURE_BUNDLE },
    });
    expect(provider).toMatchObject({ regions: ['kansai'], preview: true });
    await expect(provider?.load('kansai')).resolves.toBe(KANSAI_FIXTURE_BUNDLE);
    await expect(provider?.load('kanto')).rejects.toThrow(/kanto/);
  });
});

async function atlasPanel(): Promise<HTMLElement> {
  return waitFor(() => {
    const panel = document.querySelector<HTMLElement>('[data-atlas-panel="ready"]');
    if (panel === null) {
      throw new Error('atlas panel not ready');
    }
    return panel;
  });
}

async function openAtlasPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('link', { name: /SENKIRO Atlas/ }));
  return atlasPanel();
}

describe('Atlas panel', () => {
  it('stays an honest placeholder without a data source', async () => {
    await renderApp('/?module=atlas&lang=en');
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: /SENKIRO Atlas/ }));
    const dialog = await screen.findByRole('dialog', { name: 'SENKIRO Atlas' });
    expect(dialog).toHaveTextContent(en.atlas.notConnected);
    expect(within(dialog).queryByRole('searchbox')).toBeNull();
    expect(document.querySelector('[data-map-status]')).toHaveAttribute(
      'data-map-status',
      'unconnected',
    );
    expect(document.querySelector('[data-map-status]')).toHaveTextContent(
      en.map.states.unconnected,
    );
  });

  it('reports no WebGL honestly while the data still drives the panel', async () => {
    const user = userEvent.setup();
    await renderApp('/', SLOTS);
    await waitFor(() =>
      expect(document.querySelector('[data-map-status]')).toHaveAttribute(
        'data-map-status',
        'no-webgl',
      ),
    );
    expect(document.querySelector('[data-atlas-map]')).toBeNull();
    const panel = await openAtlasPanel(user);
    expect(
      within(panel).getByText(String(KANSAI_FIXTURE_BUNDLE.trackGraph.stations.length)),
    ).toHaveAttribute('data-count');
  });

  it('groups "京都" results and opens a station entry from them', async () => {
    const user = userEvent.setup();
    const { searchStr } = await renderApp('/', SLOTS);
    const panel = await openAtlasPanel(user);
    await user.type(within(panel).getByRole('searchbox', { name: zh.atlas.search.label }), '京都');
    const complexes = panel.querySelector<HTMLElement>('[data-result-group="complex"]');
    const stations = panel.querySelector<HTMLElement>('[data-result-group="station"]');
    expect(complexes?.querySelectorAll('[data-result-kind="complex"]')).toHaveLength(1);
    expect(complexes).toHaveTextContent('京都站');
    expect(complexes).toHaveTextContent('4 站 · 4 社');
    const kawaramachi = stations?.querySelector<HTMLElement>(`[data-result-id="${KAWARAMACHI}"]`);
    expect(kawaramachi).toHaveTextContent('属于 四条河原町');
    expect(kawaramachi?.querySelector('mark')).toHaveTextContent('京都');
    if (kawaramachi === null || kawaramachi === undefined) {
      throw new Error('missing result');
    }
    await user.click(kawaramachi);
    await waitFor(() => expect(new URLSearchParams(searchStr()).get('station')).toBe(KAWARAMACHI));
  });

  it('filters operators and says how many results the filter hides', async () => {
    const user = userEvent.setup();
    await renderApp('/?lang=en', SLOTS);
    const panel = await openAtlasPanel(user);
    const hankyu = within(panel).getByRole('button', { name: 'Show or hide Hankyu Railway' });
    expect(hankyu).toHaveAttribute('aria-pressed', 'true');
    await user.click(hankyu);
    expect(hankyu).toHaveAttribute('aria-pressed', 'false');
    expect(within(panel).getByText('1 hidden')).toBeInTheDocument();
    await user.type(within(panel).getByRole('searchbox'), 'kawaramachi');
    expect(panel.querySelector('[data-result-group="station"]')).toBeNull();
    expect(panel.querySelector('[data-hidden-by-filter]')).toHaveAttribute(
      'data-hidden-by-filter',
      '1',
    );
    await user.click(within(panel).getByRole('button', { name: en.atlas.filter.showAll }));
    expect(hankyu).toHaveAttribute('aria-pressed', 'true');
    expect(panel.querySelector(`[data-result-id="${KAWARAMACHI}"]`)).not.toBeNull();
  });

  it('shows the unavailable state for a region the provider does not publish', async () => {
    await renderApp('/?region=kanto&lang=en', SLOTS);
    expect(document.querySelector('[data-map-status]')).toHaveAttribute(
      'data-map-status',
      'unavailable',
    );
    expect(document.querySelector('[data-map-status]')).toHaveTextContent('Kanto preview');
  });

  it('labels injected preview data', async () => {
    const user = userEvent.setup();
    await renderApp('/?lang=en', { atlasDataSource: { ...FIXTURE_PROVIDER, preview: true } });
    const panel = await openAtlasPanel(user);
    expect(panel.querySelector('[data-atlas-preview]')).toHaveTextContent(en.atlas.previewNotice);
  });
});
