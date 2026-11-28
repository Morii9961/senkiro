import { type HTMLAttributes, type ReactNode, useId } from 'react';
import styles from './FloatingCard.module.css';

export interface FloatingCardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Card heading; when present the card is labelled by it. */
  title?: ReactNode;
  /** Small uppercase kicker above the title (e.g. a module code). */
  eyebrow?: ReactNode;
  /** Trailing header content such as a ProvenanceTag or a close button. */
  actions?: ReactNode;
  /** Heading level for `title` so cards fit the page outline. */
  headingLevel?: 2 | 3 | 4;
  as?: 'section' | 'aside' | 'div';
  density?: 'compact' | 'regular';
  children?: ReactNode;
}

/** Elevated surface that floats above the map canvas, with hairline border and soft shadow. */
export function FloatingCard({
  title,
  eyebrow,
  actions,
  headingLevel = 2,
  as: Element = 'section',
  density = 'regular',
  className,
  children,
  ...rest
}: FloatingCardProps) {
  const headingId = useId();
  const Heading = `h${headingLevel}` as const;
  const hasHeader = title !== undefined || eyebrow !== undefined || actions !== undefined;
  const classes = [styles.root, density === 'compact' ? styles.compact : styles.regular, className]
    .filter(Boolean)
    .join(' ');

  return (
    <Element
      className={classes}
      aria-labelledby={title === undefined ? undefined : headingId}
      {...rest}
    >
      {hasHeader && (
        <header className={styles.header}>
          <div className={styles.titles}>
            {eyebrow !== undefined && <p className={styles.eyebrow}>{eyebrow}</p>}
            {title !== undefined && (
              <Heading id={headingId} className={styles.title}>
                {title}
              </Heading>
            )}
          </div>
          {actions !== undefined && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      {children}
    </Element>
  );
}
