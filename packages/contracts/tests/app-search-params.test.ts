import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import {
  type AppSearchParams,
  type appSearchParamsSchema,
  DEFAULT_APP_SEARCH_PARAMS,
  MAX_SEARCH_PARAM_LENGTH,
  parseAppSearchParams,
  serializeAppSearchParams,
} from '../src/index.ts';

describe('appSearchParamsSchema / parseAppSearchParams', () => {
  it('infers exactly AppSearchParams', () => {
    expectTypeOf<z.output<typeof appSearchParamsSchema>>().toEqualTypeOf<AppSearchParams>();
  });

  it('fills safe defaults for an empty or non-object input', () => {
    const expected = { region: 'kansai', module: 'atlas', lang: 'zh-CN', theme: 'dark' };
    expect(parseAppSearchParams({})).toEqual(expected);
    for (const input of [undefined, null, 'region=kanto', 42, ['kanto']]) {
      expect(parseAppSearchParams(input), String(input)).toEqual(expected);
    }
    expect(DEFAULT_APP_SEARCH_PARAMS).toEqual(expected);
  });

  it('keeps valid deep-link fields', () => {
    expect(
      parseAppSearchParams({
        region: 'kansai',
        module: 'route',
        station: 'sk:station:kansai:jr-west-osaka',
        complex: 'sk:complex:kansai:osaka-umeda',
        line: 'sk:line:kansai:jr-west-kyoto',
        hub: 'umeda',
        level: 'B1F',
        selection: 'sk:place:umeda:jr-osaka-1f-midosuji-gate',
        from: 'sk:place:umeda:a',
        to: 'sk:place:umeda:b',
        stepFree: 'true',
        lang: 'ja',
        theme: 'light',
      }),
    ).toEqual({
      region: 'kansai',
      module: 'route',
      station: 'sk:station:kansai:jr-west-osaka',
      complex: 'sk:complex:kansai:osaka-umeda',
      line: 'sk:line:kansai:jr-west-kyoto',
      hub: 'umeda',
      level: 'B1F',
      selection: 'sk:place:umeda:jr-osaka-1f-midosuji-gate',
      from: 'sk:place:umeda:a',
      to: 'sk:place:umeda:b',
      stepFree: true,
      lang: 'ja',
      theme: 'light',
    });
  });

  it('drops one bad field without resetting the rest', () => {
    const parsed = parseAppSearchParams({
      module: 'tickets',
      lang: 'fr',
      theme: 'sepia',
      station: 'sk:line:kansai:jr-west-kyoto', // wrong entity kind
      complex: 'sk:complex:osaka-umeda', // legacy three-segment
      stepFree: 'maybe',
    });
    expect(parsed).toEqual({ region: 'kansai', module: 'tickets', lang: 'zh-CN', theme: 'dark' });
    expect('station' in parsed).toBe(false);
  });

  it('strips unknown keys and never keeps undefined-valued optional keys', () => {
    const parsed = parseAppSearchParams({ debug: 'true', __proto__: { polluted: true } });
    expect(Object.keys(parsed).sort()).toEqual(['lang', 'module', 'region', 'theme']);
  });

  it('bounds free-text params and ignores blanks', () => {
    const long = 'x'.repeat(MAX_SEARCH_PARAM_LENGTH + 1);
    expect(parseAppSearchParams({ level: long, selection: '   ', from: 'B2F ' })).toEqual({
      ...DEFAULT_APP_SEARCH_PARAMS,
      from: 'B2F',
    });
  });

  it('parses boolean-ish stepFree values', () => {
    expect(parseAppSearchParams({ stepFree: true }).stepFree).toBe(true);
    expect(parseAppSearchParams({ stepFree: '1' }).stepFree).toBe(true);
    expect(parseAppSearchParams({ stepFree: 'false' }).stepFree).toBe(false);
    expect(parseAppSearchParams({ stepFree: '0' }).stepFree).toBe(false);
  });

  it('derives the region from a hub and drops a hub that contradicts the region', () => {
    expect(parseAppSearchParams({ hub: 'shinjuku' })).toMatchObject({
      region: 'kanto',
      hub: 'shinjuku',
    });
    const mismatch = parseAppSearchParams({ region: 'kansai', hub: 'shinjuku' });
    expect(mismatch.region).toBe('kansai');
    expect(mismatch.hub).toBeUndefined();
  });

  it('honours caller defaults such as a system light theme', () => {
    expect(parseAppSearchParams({}, { theme: 'light', lang: 'en' })).toMatchObject({
      theme: 'light',
      lang: 'en',
    });
    expect(parseAppSearchParams({ theme: 'dark' }, { theme: 'light' }).theme).toBe('dark');
  });
});

describe('serializeAppSearchParams', () => {
  it('omits defaults and round-trips through the parser', () => {
    const params: AppSearchParams = {
      region: 'kanto',
      module: 'atlas',
      hub: 'shinjuku',
      level: '1F',
      stepFree: false,
      lang: 'en',
      theme: 'dark',
    };
    const flat = serializeAppSearchParams(params);
    expect(flat).toEqual({
      region: 'kanto',
      hub: 'shinjuku',
      level: '1F',
      stepFree: 'false',
      lang: 'en',
    });
    expect(parseAppSearchParams(flat)).toEqual(params);
    expect(serializeAppSearchParams(parseAppSearchParams({}))).toEqual({});
  });
});
