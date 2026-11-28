// @vitest-environment node
import { DEFAULT_APP_SEARCH_PARAMS, parseAppSearchParams } from '@senkiro/contracts';
import { describe, expect, it } from 'vitest';
import { applySearchPatch, parseSearchString, stringifySearchRecord } from '../src/app/search.ts';

describe('URL search codec', () => {
  it('reads query values as plain strings without JSON coercion', () => {
    expect(parseSearchString('?stepFree=1&lang=ja&from=123')).toEqual({
      stepFree: '1',
      lang: 'ja',
      from: '123',
    });
    expect(parseSearchString('')).toEqual({});
  });

  it('omits defaults so the canonical home URL has no query', () => {
    expect(stringifySearchRecord({ ...DEFAULT_APP_SEARCH_PARAMS })).toBe('');
    expect(
      stringifySearchRecord({ ...DEFAULT_APP_SEARCH_PARAMS, lang: 'en', theme: 'light' }),
    ).toBe('?lang=en&theme=light');
  });

  it('round-trips every field through the URL', () => {
    const params = parseAppSearchParams({
      region: 'kansai',
      module: 'route',
      hub: 'umeda',
      level: 'B1F',
      from: '梅田',
      to: '京都',
      stepFree: true,
      lang: 'ja',
      theme: 'light',
    });
    const url = stringifySearchRecord(params);
    expect(parseAppSearchParams(parseSearchString(url))).toEqual(params);
  });

  it('falls back field by field on hostile input', () => {
    const parsed = parseAppSearchParams(
      parseSearchString('?lang=xx&theme=neon&module=nope&region=mars&station=bad&from=ok'),
    );
    expect(parsed).toEqual({ ...DEFAULT_APP_SEARCH_PARAMS, from: 'ok' });
  });

  it('drops a hub that contradicts the region and lets a hub imply its region', () => {
    expect(parseAppSearchParams(parseSearchString('?region=kanto&hub=umeda')).hub).toBeUndefined();
    expect(parseAppSearchParams(parseSearchString('?hub=shinjuku')).region).toBe('kanto');
  });

  it('clears optional params when a patch sets them to undefined', () => {
    const prev = parseAppSearchParams({ hub: 'kyoto', level: '2F', from: 'A' });
    const next = applySearchPatch(prev, { hub: undefined, level: undefined });
    expect(next.hub).toBeUndefined();
    expect(next.level).toBeUndefined();
    expect(next.from).toBe('A');
    expect(applySearchPatch(prev, { region: 'kanto' }).hub).toBeUndefined();
  });
});
