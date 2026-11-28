import type { Locale } from '@senkiro/contracts';
import { formatTemplate, UI_KIT_STRINGS, type UnknownKind } from '../strings.ts';
import styles from './UnknownValue.module.css';

export interface UnknownValueProps {
  lang: Locale;
  /** `unknown` (null value), `unverified` (exists but not checked) or `pending` (no data yet). */
  kind?: UnknownKind;
  /** What is unknown, already localised (e.g. "票价"). Improves the accessible name. */
  label?: string;
  className?: string;
}

/**
 * Honest placeholder for a `null` / unverified fact (contract §1.1). Never renders a guess:
 * it shows a localised "unknown" marker with a dashed outline so it cannot be mistaken
 * for real data.
 */
export function UnknownValue({ lang, kind = 'unknown', label, className }: UnknownValueProps) {
  const strings = UI_KIT_STRINGS[lang];
  const classes = className === undefined ? styles.root : `${styles.root} ${className}`;
  const content = (
    <>
      <span className={styles.mark} aria-hidden="true">
        ?
      </span>
      {strings.unknown[kind]}
    </>
  );
  if (label === undefined) {
    return (
      <span className={classes} data-honesty={kind}>
        {content}
      </span>
    );
  }
  return (
    <span
      className={classes}
      data-honesty={kind}
      role="note"
      aria-label={formatTemplate(strings.unknownAria[kind], { label })}
    >
      {content}
    </span>
  );
}
