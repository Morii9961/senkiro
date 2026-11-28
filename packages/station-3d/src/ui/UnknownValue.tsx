import type { Locale } from '@senkiro/contracts';
import { t } from '../i18n.ts';

export interface UnknownValueProps {
  locale: Locale;
  /** `'unknown'` = no source states it; `'unverified'` = stated but not checked. */
  kind?: 'unknown' | 'unverified';
}

/**
 * Honest placeholder for a `null` fact (contract invariant 1). Local to this package so the
 * engine has no dependency on the app UI kit; it renders the same trilingual wording.
 */
export function UnknownValue({ locale, kind = 'unknown' }: UnknownValueProps) {
  return (
    <span
      data-unknown={kind}
      style={{
        fontStyle: 'italic',
        opacity: 0.72,
        borderBottom: '1px dotted currentColor',
      }}
    >
      {t(locale, kind)}
    </span>
  );
}
