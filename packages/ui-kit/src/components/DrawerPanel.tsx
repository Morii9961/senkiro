import * as Dialog from '@radix-ui/react-dialog';
import type { Locale } from '@senkiro/contracts';
import type { CSSProperties, ReactNode } from 'react';
import { UI_KIT_STRINGS } from '../strings.ts';
import styles from './DrawerPanel.module.css';

export interface DrawerPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** Always rendered (visually hidden when `hideDescription`) so the dialog is described. */
  description: ReactNode;
  hideDescription?: boolean;
  /** Desktop edge. On narrow screens (< 768px) the panel always becomes a bottom sheet. */
  side?: 'left' | 'right';
  /**
   * Non-modal by default: the map stays interactive and clicks outside do not close the
   * panel. Escape and the close button always close it.
   */
  modal?: boolean;
  lang: Locale;
  /** Leading header content (e.g. a module code badge). */
  eyebrow?: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Layout overrides such as `--sk-drawer-top` / `--sk-drawer-width`. */
  style?: CSSProperties;
  /** Portal target; defaults to `document.body`. */
  container?: HTMLElement | null;
  children: ReactNode;
}

/**
 * Responsive side panel / bottom sheet on Radix Dialog: `role="dialog"`, labelled by its
 * title, described by its description, Escape to close, focus moved in on open and
 * returned on close.
 */
export function DrawerPanel({
  open,
  onOpenChange,
  title,
  description,
  hideDescription = false,
  side = 'left',
  modal = false,
  lang,
  eyebrow,
  footer,
  className,
  style,
  container,
  children,
}: DrawerPanelProps) {
  const closeLabel = UI_KIT_STRINGS[lang].drawer.close;
  const classes = [styles.content, className].filter(Boolean).join(' ');

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal={modal}>
      <Dialog.Portal container={container ?? undefined}>
        {modal && <Dialog.Overlay className={styles.overlay} />}
        <Dialog.Content
          className={classes}
          data-side={side}
          style={style}
          onInteractOutside={(event) => {
            if (!modal) {
              event.preventDefault();
            }
          }}
        >
          <div className={styles.grabber} aria-hidden="true" />
          <header className={styles.header}>
            <div className={styles.titles}>
              {eyebrow !== undefined && <div className={styles.eyebrow}>{eyebrow}</div>}
              <Dialog.Title className={styles.title}>{title}</Dialog.Title>
              <Dialog.Description className={hideDescription ? styles.srOnly : styles.description}>
                {description}
              </Dialog.Description>
            </div>
            <Dialog.Close className={styles.close} aria-label={closeLabel}>
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
                <path
                  d="M3.5 3.5l9 9m0-9l-9 9"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </Dialog.Close>
          </header>
          <div className={styles.body}>{children}</div>
          {footer !== undefined && <footer className={styles.footer}>{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
