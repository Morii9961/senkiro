import styles from './SignCode.module.css';

export interface SignCodeProps {
  /** One to three characters, e.g. a module letter. Decorative: hidden from assistive tech. */
  code: string;
  active?: boolean;
  className?: string;
}

/**
 * Square wayfinding code mark (an original SENKIRO glyph frame, inspired by station-number
 * signage but not copying any operator's design). Always decorative; pair it with text.
 */
export function SignCode({ code, active = false, className }: SignCodeProps) {
  return (
    <span
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
      data-active={active}
      aria-hidden="true"
    >
      {code}
    </span>
  );
}
