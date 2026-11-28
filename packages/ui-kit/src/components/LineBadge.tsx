import type { Locale } from '@senkiro/contracts';
import type { CSSProperties } from 'react';
import { formatTemplate, UI_KIT_STRINGS } from '../strings.ts';
import styles from './LineBadge.module.css';

export interface LineBadgeProps {
  /** Resolved, localised line name (use `resolveLocalizedName`). */
  lineName: string;
  /** Line identity colour as `#rgb` or `#rrggbb`. Applied only to the strip and badge ring. */
  color: string;
  /** Station number prefix (`RailLine.stationCodePrefix`). `null` = unverified, never guessed. */
  prefix: string | null;
  /** Station number after the prefix (`Station.stationCode` digits), if known. */
  number?: string | null;
  lang: Locale;
  size?: 'sm' | 'md';
  className?: string | undefined;
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Only plain hex colours reach CSS; anything else falls back to a neutral hairline. */
export function safeLineColor(color: string): string | null {
  return HEX_COLOR.test(color) ? color : null;
}

/**
 * Station-number badge with a thin line-identity strip. The colour never floods a surface:
 * it is a 4px strip plus a ring around the code, following railway numbering signage
 * without copying any operator's artwork.
 */
export function LineBadge({
  lineName,
  color,
  prefix,
  number = null,
  lang,
  size = 'md',
  className,
}: LineBadgeProps) {
  const strings = UI_KIT_STRINGS[lang].lineBadge;
  const code = prefix === null ? null : `${prefix}${number ?? ''}`;
  const ariaLabel =
    code === null
      ? formatTemplate(strings.withoutCode, { line: lineName })
      : formatTemplate(strings.withCode, { line: lineName, code });
  const lineColor = safeLineColor(color);
  const style =
    lineColor === null ? undefined : ({ '--sk-line-color': lineColor } as CSSProperties);
  const classes = [styles.root, size === 'sm' ? styles.sm : styles.md, className]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} style={style} role="img" aria-label={ariaLabel}>
      <span className={styles.strip} aria-hidden="true" />
      <span className={styles.code} aria-hidden="true" data-unverified={code === null}>
        {prefix === null ? (
          '?'
        ) : (
          <>
            <span className={styles.prefix}>{prefix}</span>
            {number !== null && <span className={styles.number}>{number}</span>}
          </>
        )}
      </span>
      <span className={styles.name} aria-hidden="true">
        {lineName}
      </span>
    </span>
  );
}
