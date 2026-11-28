import { describe, expect, it } from 'vitest';
import {
  isLocale,
  LOCALES,
  makeLocalizedNames,
  resolveLocalizedName,
  UNKNOWN_NAME_TEXT,
} from '../src/index.ts';

const full = makeLocalizedNames({ ja: '大阪', ja_kana: 'おおさか', en: 'Osaka', zh: '大阪' });

describe('resolveLocalizedName', () => {
  it('returns the preferred locale without fallback when present', () => {
    expect(resolveLocalizedName({ ...full, zh: '大阪站' }, 'zh-CN')).toEqual({
      text: '大阪站',
      resolvedLocale: 'zh-CN',
      isFallback: false,
    });
    expect(resolveLocalizedName(full, 'ja')).toMatchObject({ text: '大阪', isFallback: false });
    expect(resolveLocalizedName(full, 'en')).toMatchObject({ text: 'Osaka', isFallback: false });
  });

  it('zh-CN falls back to Japanese original, never a fabricated translation', () => {
    const names = makeLocalizedNames({ ja: '梅田', en: 'Umeda' });
    expect(resolveLocalizedName(names, 'zh-CN')).toEqual({
      text: '梅田',
      resolvedLocale: 'ja',
      isFallback: true,
    });
  });

  it('zh-CN falls back to English when only English is known', () => {
    expect(resolveLocalizedName(makeLocalizedNames({ en: 'Umeda' }), 'zh-CN')).toEqual({
      text: 'Umeda',
      resolvedLocale: 'en',
      isFallback: true,
    });
  });

  it('ja falls back to English before Chinese', () => {
    const names = makeLocalizedNames({ en: 'Umeda', zh: '梅田' });
    expect(resolveLocalizedName(names, 'ja')).toMatchObject({
      text: 'Umeda',
      resolvedLocale: 'en',
    });
    expect(resolveLocalizedName(makeLocalizedNames({ zh: '梅田' }), 'ja')).toEqual({
      text: '梅田',
      resolvedLocale: 'zh-CN',
      isFallback: true,
    });
  });

  it('en falls back to Japanese before Chinese', () => {
    const names = makeLocalizedNames({ ja: '梅田', zh: '梅田站' });
    expect(resolveLocalizedName(names, 'en')).toMatchObject({ text: '梅田', resolvedLocale: 'ja' });
  });

  it('never uses ja_kana as a display fallback', () => {
    const names = makeLocalizedNames({ ja_kana: 'うめだ' });
    expect(resolveLocalizedName(names, 'ja').resolvedLocale).toBe('unknown');
  });

  it('treats blank strings as missing', () => {
    const names = makeLocalizedNames({ zh: '   ', ja: '', en: 'Umeda' });
    expect(resolveLocalizedName(names, 'zh-CN')).toMatchObject({ text: 'Umeda', isFallback: true });
  });

  it('returns the honest unknown placeholder when everything is null', () => {
    for (const locale of LOCALES) {
      expect(resolveLocalizedName(makeLocalizedNames(), locale)).toEqual({
        text: UNKNOWN_NAME_TEXT,
        resolvedLocale: 'unknown',
        isFallback: true,
      });
    }
    expect(UNKNOWN_NAME_TEXT).toBe('—');
  });

  it('returns stored text unchanged (no trimming or rewriting)', () => {
    expect(resolveLocalizedName(makeLocalizedNames({ ja: ' 大阪 ' }), 'ja').text).toBe(' 大阪 ');
  });
});

describe('locale helpers', () => {
  it('recognises only the three first-class locales', () => {
    expect(LOCALES).toEqual(['zh-CN', 'ja', 'en']);
    expect(isLocale('zh-CN')).toBe(true);
    expect(isLocale('zh')).toBe(false);
    expect(isLocale('zh-TW')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it('makeLocalizedNames fills every unspecified field with null', () => {
    expect(makeLocalizedNames({ ja: '京都' })).toEqual({
      ja: '京都',
      ja_kana: null,
      en: null,
      zh: null,
    });
  });
});
