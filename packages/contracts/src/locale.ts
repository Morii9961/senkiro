/** First-class UI locales (decision D-05). */
export const LOCALES = ['zh-CN', 'ja', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export interface LocalizedNames {
  ja: string | null;
  ja_kana: string | null;
  en: string | null;
  /** Simplified Chinese. Unverified translations stay `null`; never machine-translated. */
  zh: string | null;
}

export interface ResolvedLocalizedName {
  text: string;
  resolvedLocale: Locale | 'unknown';
  isFallback: boolean;
}

/** Name field used for each locale. `ja_kana` is a reading aid, never a display fallback. */
export type LocalizedNameKey = 'zh' | 'ja' | 'en';

/** Fallback chains of contract §2, in priority order. */
export const LOCALE_FALLBACK_ORDER: Readonly<Record<Locale, readonly LocalizedNameKey[]>> = {
  'zh-CN': ['zh', 'ja', 'en'],
  ja: ['ja', 'en', 'zh'],
  en: ['en', 'ja', 'zh'],
};

const KEY_TO_LOCALE: Readonly<Record<LocalizedNameKey, Locale>> = {
  zh: 'zh-CN',
  ja: 'ja',
  en: 'en',
};

/** Placeholder returned when no name is known; the UI swaps in a localised "unknown". */
export const UNKNOWN_NAME_TEXT = '—';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Build a `LocalizedNames` with every unspecified field explicitly `null`. */
export function makeLocalizedNames(partial: Partial<LocalizedNames> = {}): LocalizedNames {
  return {
    ja: partial.ja ?? null,
    ja_kana: partial.ja_kana ?? null,
    en: partial.en ?? null,
    zh: partial.zh ?? null,
  };
}

function usable(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Pure, honest name resolution (contract §2). Walks the locale's fallback chain and
 * returns the first non-blank name exactly as stored. It never translates or derives text;
 * when every name is null or blank it returns `{ text: '—', resolvedLocale: 'unknown' }`.
 */
export function resolveLocalizedName(
  names: LocalizedNames,
  preferred: Locale,
): ResolvedLocalizedName {
  const chain = LOCALE_FALLBACK_ORDER[preferred];
  for (const [index, key] of chain.entries()) {
    const value = names[key];
    if (usable(value)) {
      return { text: value, resolvedLocale: KEY_TO_LOCALE[key], isFallback: index > 0 };
    }
  }
  return { text: UNKNOWN_NAME_TEXT, resolvedLocale: 'unknown', isFallback: true };
}
