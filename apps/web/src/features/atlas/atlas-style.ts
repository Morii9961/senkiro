/**
 * Offline MapLibre style for SENKIRO Atlas (spec §3.2 layers).
 *
 * - Pure vector, no basemap tiles, no glyph server and no sprite: with no `glyphs` URL
 *   MapLibre v5 draws every label locally (TinySDF) from system fonts, so the map renders
 *   completely offline in zh-CN / ja / en.
 * - Colours mirror `@senkiro/ui-kit` tokens for the washi-light and graphite-dark themes
 *   (kept in sync by a unit test). Line identity colours colour the line strokes only.
 * - Parallel lines are offset by `corridor_slot`; shinkansen draws as a double line with a
 *   dashed core; station labels appear by `importance_rank` (z8 / z10 / z12); complexes
 *   with an in-station model get a 3D hub badge.
 *
 * Only `import type` from `maplibre-gl` here, so this module never pulls the engine into
 * the shell chunk.
 */
import type { AppTheme, Locale } from '@senkiro/contracts';
import type {
  DataDrivenPropertyValueSpecification,
  ExpressionSpecification,
  FilterSpecification,
  GeoJSONSourceSpecification,
  LayerSpecification,
  SourceSpecification,
  StyleSpecification,
} from 'maplibre-gl';
import type { AtlasGeoJson } from './atlas-geojson.ts';

export interface AtlasPalette {
  canvas: string;
  surface: string;
  surfaceRaised: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  hairlineStrong: string;
  accent: string;
  accentInk: string;
  verified: string;
}

/** Same values as `packages/ui-kit/src/styles/tokens.css` (asserted in tests). */
export const ATLAS_PALETTES: Readonly<Record<AppTheme, AtlasPalette>> = {
  dark: {
    canvas: '#181c22',
    surface: '#262b33',
    surfaceRaised: '#2e343d',
    text: '#eef1f5',
    textMuted: '#b4bcc8',
    textSubtle: '#8c95a3',
    hairlineStrong: 'rgb(238 241 245 / 0.3)',
    accent: '#ff8a65',
    accentInk: '#15181d',
    verified: '#7fd6a8',
  },
  light: {
    canvas: '#f4f1ea',
    surface: '#fbfaf6',
    surfaceRaised: '#ffffff',
    text: '#23272e',
    textMuted: '#4f5662',
    textSubtle: '#6b7280',
    hairlineStrong: 'rgb(35 39 46 / 0.32)',
    accent: '#b8432a',
    accentInk: '#ffffff',
    verified: '#1f7a4d',
  },
};

/**
 * System font stacks for TinySDF (mirrors `--sk-font-sans`). MapLibre reads the weight
 * from the first family name, so the bold stack starts with a "… Bold" alias that no
 * system has and falls through to the same real families.
 */
export const ATLAS_FONT_STACK = [
  'Segoe UI',
  'Hiragino Sans',
  'Noto Sans JP',
  'Noto Sans SC',
  'Microsoft YaHei',
  'Yu Gothic UI',
  'sans-serif',
];
export const ATLAS_BOLD_FONT_STACK = ['SENKIRO Sans Bold', ...ATLAS_FONT_STACK];
/**
 * `localIdeographFontFamily` for CJK glyphs, by UI language: Japanese glyph forms for ja
 * and en (station names are Japanese), Simplified Chinese forms for zh-CN.
 */
export const ATLAS_CJK_FONT_FAMILIES: Readonly<Record<Locale, string>> = {
  ja: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", Meiryo, "Noto Sans JP", sans-serif',
  en: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", Meiryo, "Noto Sans JP", sans-serif',
  'zh-CN': '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", "Hiragino Sans GB", sans-serif',
};

export const ATLAS_LAYERS = [
  'rail_segments',
  'rail_stations',
  'station_complexes',
  'through_boundaries',
] as const;
export type AtlasLayerName = (typeof ATLAS_LAYERS)[number];

export type AtlasSource =
  | { kind: 'pmtiles'; url: string }
  | { kind: 'geojson'; data: AtlasGeoJson };

export interface AtlasSelection {
  lineId?: string;
  stationId?: string;
  complexId?: string;
}

export interface AtlasStyleOptions {
  theme: AppTheme;
  lang: Locale;
  source: AtlasSource;
  hiddenOperatorIds: readonly string[];
  selection: AtlasSelection;
  /** Attribution text from the bundle's source records. */
  attribution: string;
}

/** Vector source ID (PMTiles); GeoJSON mode uses one source per layer name. */
export const ATLAS_VECTOR_SOURCE = 'sk-rail';

export function absoluteTileUrl(url: string, base: string): string {
  return new URL(url, base).href;
}

function sources(source: AtlasSource, attribution: string): Record<string, SourceSpecification> {
  if (source.kind === 'pmtiles') {
    return {
      [ATLAS_VECTOR_SOURCE]: { type: 'vector', url: `pmtiles://${source.url}`, attribution },
    };
  }
  const out: Record<string, SourceSpecification> = {};
  for (const [i, layer] of ATLAS_LAYERS.entries()) {
    out[`sk-${layer}`] = {
      type: 'geojson',
      data: source.data[layer] as unknown as GeoJSONSourceSpecification['data'],
      ...(i === 0 ? { attribution } : {}),
    };
  }
  return out;
}

function sourceRef(source: AtlasSource, layer: AtlasLayerName) {
  return source.kind === 'pmtiles'
    ? { source: ATLAS_VECTOR_SOURCE, 'source-layer': layer }
    : { source: `sk-${layer}` };
}

const LABEL_KEYS: Readonly<Record<Locale, readonly string[]>> = {
  'zh-CN': ['label_zh_cn', 'label_ja', 'label_en'],
  ja: ['label_ja', 'label_en', 'label_zh_cn'],
  en: ['label_en', 'label_ja', 'label_zh_cn'],
};

/** Contract §2 fallback order on the tile label fields; empty strings are skipped. */
export function labelExpression(lang: Locale): ExpressionSpecification {
  const [first, second, third] = LABEL_KEYS[lang] as [string, string, string];
  return [
    'case',
    ['!=', ['get', first], ''],
    ['get', first],
    ['!=', ['get', second], ''],
    ['get', second],
    ['get', third],
  ];
}

function operatorVisible(hidden: readonly string[]): ExpressionSpecification {
  return hidden.length === 0
    ? ['literal', true]
    : ['!', ['in', ['get', 'operator_id'], ['literal', [...hidden]]]];
}

/** Matches segments of a line by primary line or the shared-track list. */
export function onLineExpression(lineId: string): ExpressionSpecification {
  return [
    'any',
    ['==', ['get', 'primary_line_id'], lineId],
    ['in', JSON.stringify(lineId), ['get', 'line_ids_json']],
  ];
}

/** `corridor_slot` centred on the corridor (even counts sit half a slot either side). */
const CORRIDOR_OFFSET: ExpressionSpecification = [
  '-',
  ['to-number', ['get', 'corridor_slot'], 0],
  ['case', ['==', ['%', ['to-number', ['get', 'corridor_count'], 1], 2], 0], 0.5, 0],
];

function byZoom(stops: readonly (readonly [number, number])[]): ExpressionSpecification {
  return ['interpolate', ['linear'], ['zoom'], ...stops.flat()] as ExpressionSpecification;
}

/** Line width by zoom, also used as the offset step so parallel lines touch, not overlap. */
const RAIL_WIDTH: readonly (readonly [number, number])[] = [
  [6, 1],
  [9, 1.8],
  [12, 3],
  [15, 5],
];

function scaled(
  stops: readonly (readonly [number, number])[],
  scale: (width: number) => number,
): (readonly [number, number])[] {
  return stops.map(([zoom, width]) => [zoom, scale(width)] as const);
}

function offsetByZoom(): DataDrivenPropertyValueSpecification<number> {
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    ...RAIL_WIDTH.flatMap(([zoom, width]) => [zoom, ['*', CORRIDOR_OFFSET, width + 0.6]]),
  ] as DataDrivenPropertyValueSpecification<number>;
}

const IS_SHINKANSEN: ExpressionSpecification = ['to-boolean', ['get', 'is_shinkansen']];

function lineColor(palette: AtlasPalette): ExpressionSpecification {
  return [
    'case',
    ['!=', ['to-string', ['get', 'color']], ''],
    ['to-color', ['get', 'color'], palette.textSubtle],
    palette.textSubtle,
  ];
}

function all(...filters: ExpressionSpecification[]): FilterSpecification {
  return ['all', ...filters] as FilterSpecification;
}

function stationLabel(lang: Locale, palette: AtlasPalette): ExpressionSpecification {
  const name = labelExpression(lang);
  return [
    'case',
    ['!=', ['get', 'station_code'], ''],
    [
      'format',
      name,
      {},
      '\n',
      {},
      ['get', 'station_code'],
      { 'font-scale': 0.78, 'text-color': palette.textSubtle },
    ],
    ['format', name, {}],
  ];
}

export function buildAtlasStyle(options: AtlasStyleOptions): StyleSpecification {
  const { theme, lang, source, hiddenOperatorIds, selection, attribution } = options;
  const palette = ATLAS_PALETTES[theme];
  const visible = operatorVisible(hiddenOperatorIds);
  const lineSelected = selection.lineId === undefined ? null : onLineExpression(selection.lineId);
  const dim = lineSelected === null ? 0.92 : ['case', lineSelected, 1, 0.22];
  const seg = sourceRef(source, 'rail_segments');
  const sta = sourceRef(source, 'rail_stations');
  const cpx = sourceRef(source, 'station_complexes');
  const thr = sourceRef(source, 'through_boundaries');
  const width = byZoom(RAIL_WIDTH);
  const offset = offsetByZoom();
  const selectedStation: ExpressionSpecification = [
    'any',
    ['==', ['get', 'id'], selection.stationId ?? '\u0000'],
    ['==', ['get', 'complex_id'], selection.complexId ?? '\u0000'],
  ];

  const layers: LayerSpecification[] = [
    { id: 'sk-background', type: 'background', paint: { 'background-color': palette.canvas } },
    {
      id: 'sk-rail-selected-halo',
      type: 'line',
      ...seg,
      filter: all(visible, lineSelected ?? ['literal', false]),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': palette.accent,
        'line-opacity': 0.35,
        'line-width': byZoom(scaled(RAIL_WIDTH, (w) => w * 3.2)),
        'line-offset': offset,
      },
    },
    {
      id: 'sk-rail-casing',
      type: 'line',
      ...seg,
      filter: all(visible),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': palette.canvas,
        'line-width': byZoom(scaled(RAIL_WIDTH, (w) => w + 1.6)),
        'line-offset': offset,
      },
    },
    {
      id: 'sk-rail',
      type: 'line',
      ...seg,
      filter: all(visible, ['!', IS_SHINKANSEN]),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': lineColor(palette),
        'line-width': width,
        'line-offset': offset,
        'line-opacity': dim as DataDrivenPropertyValueSpecification<number>,
      },
    },
    {
      id: 'sk-shinkansen',
      type: 'line',
      ...seg,
      filter: all(visible, IS_SHINKANSEN),
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: {
        'line-color': lineColor(palette),
        'line-width': byZoom(scaled(RAIL_WIDTH, (w) => w * 1.7)),
        'line-offset': offset,
        'line-opacity': dim as DataDrivenPropertyValueSpecification<number>,
      },
    },
    {
      // The core turns the wide stroke into a double line with dashed ties.
      id: 'sk-shinkansen-core',
      type: 'line',
      ...seg,
      filter: all(visible, IS_SHINKANSEN),
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: {
        'line-color': palette.canvas,
        'line-width': byZoom(scaled(RAIL_WIDTH, (w) => w * 0.7)),
        'line-offset': offset,
        'line-dasharray': [2.4, 1.2],
      },
    },
    {
      id: 'sk-complex-ring',
      type: 'circle',
      ...cpx,
      minzoom: 10,
      filter: ['==', ['get', 'hub_key'], ''],
      paint: {
        'circle-color': 'rgba(0,0,0,0)',
        'circle-radius': byZoom([
          [10, 7],
          [14, 14],
        ]),
        'circle-stroke-color': palette.hairlineStrong,
        'circle-stroke-width': 1.2,
      },
    },
    {
      id: 'sk-through',
      type: 'circle',
      ...thr,
      minzoom: 10,
      paint: {
        'circle-color': palette.canvas,
        'circle-radius': 6,
        'circle-stroke-color': palette.verified,
        'circle-stroke-width': 2,
      },
    },
    ...([1, 2, 3] as const).map(
      (rank): LayerSpecification => ({
        id: `sk-station-r${rank}`,
        type: 'circle',
        ...sta,
        minzoom: rank === 1 ? 8 : rank === 2 ? 10 : 12,
        filter: all(visible, ['==', ['to-number', ['get', 'importance_rank'], 3], rank]),
        paint: {
          'circle-color': palette.surfaceRaised,
          'circle-radius': byZoom([
            [8, rank === 1 ? 3.2 : 2.4],
            [14, rank === 1 ? 6 : 4.6],
          ]),
          'circle-stroke-color': palette.text,
          'circle-stroke-width': rank === 1 ? 1.6 : 1.2,
        },
      }),
    ),
    {
      id: 'sk-station-selected',
      type: 'circle',
      ...sta,
      filter: all(visible, selectedStation),
      paint: {
        'circle-color': palette.accent,
        'circle-radius': byZoom([
          [8, 5],
          [14, 8],
        ]),
        'circle-stroke-color': palette.canvas,
        'circle-stroke-width': 2,
      },
    },
    {
      id: 'sk-hub-badge',
      type: 'circle',
      ...cpx,
      filter: ['!=', ['get', 'hub_key'], ''],
      paint: {
        'circle-color': palette.accent,
        'circle-radius': byZoom([
          [6, 9],
          [14, 13],
        ]),
        'circle-stroke-color': palette.canvas,
        'circle-stroke-width': 2.5,
      },
    },
    {
      id: 'sk-hub-badge-text',
      type: 'symbol',
      ...cpx,
      filter: ['!=', ['get', 'hub_key'], ''],
      layout: {
        'text-field': '3D',
        'text-font': ATLAS_BOLD_FONT_STACK,
        'text-size': 10,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: { 'text-color': palette.accentInk },
    },
    {
      id: 'sk-hub-label',
      type: 'symbol',
      ...cpx,
      filter: ['!=', ['get', 'hub_key'], ''],
      layout: {
        'text-field': labelExpression(lang),
        'text-font': ATLAS_BOLD_FONT_STACK,
        'text-size': 13,
        'text-anchor': 'top',
        'text-offset': [0, 1.2],
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': palette.text,
        'text-halo-color': palette.canvas,
        'text-halo-width': 1.6,
      },
    },
    ...([1, 2, 3] as const).map(
      (rank): LayerSpecification => ({
        id: `sk-station-label-r${rank}`,
        type: 'symbol',
        ...sta,
        minzoom: rank === 1 ? 9 : rank === 2 ? 11 : 13,
        filter: all(visible, ['==', ['to-number', ['get', 'importance_rank'], 3], rank]),
        layout: {
          'text-field': stationLabel(lang, palette),
          'text-font': rank === 1 ? ATLAS_BOLD_FONT_STACK : ATLAS_FONT_STACK,
          'text-size': rank === 1 ? 12.5 : rank === 2 ? 11.5 : 10.5,
          'text-anchor': 'left',
          'text-offset': [0.8, 0],
          'text-justify': 'left',
          'text-line-height': 1.15,
          'text-optional': true,
        },
        paint: {
          'text-color': rank === 3 ? palette.textMuted : palette.text,
          'text-halo-color': palette.canvas,
          'text-halo-width': 1.4,
        },
      }),
    ),
  ];

  return {
    version: 8,
    name: 'SENKIRO Atlas',
    sources: sources(source, attribution),
    layers,
  };
}

/** Layers a click can hit, highest priority first. */
export const ATLAS_CLICK_LAYERS = [
  'sk-hub-badge',
  'sk-station-selected',
  'sk-station-r1',
  'sk-station-r2',
  'sk-station-r3',
  'sk-through',
  'sk-complex-ring',
  'sk-rail',
  'sk-shinkansen',
] as const;
