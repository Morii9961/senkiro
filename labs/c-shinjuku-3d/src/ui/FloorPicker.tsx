/**
 * The floor selector laid over the drawing.
 *
 * In the 2D plan it is the main way to move between floors, so the whole list
 * stays on screen. In the 3D view it would cover a tall strip of the model, so
 * it folds down to one button that names the current choice; the list opens
 * while the pointer is over it or while it holds keyboard focus.
 */
import { useEffect, useRef, useState } from 'react';
import type { T } from './i18n';

export interface FloorChoice {
  ordinal: number;
  label: string;
  /** The current route passes this floor. */
  onRoute: boolean;
  active: boolean;
}

interface Props {
  t: T;
  floors: FloorChoice[];
  /** Fold the list away until it is hovered or focused (3D view). */
  collapsible: boolean;
  /** "All floors" and "floors of the route" exist only where floors are stacked (3D view). */
  showAll: boolean;
  showRoute: boolean;
  allActive: boolean;
  routeActive: boolean;
  /** What the folded button says: the current choice. */
  current: string;
  /** all | route | floor | step — for styling and for tests. */
  currentMode: string;
  onAll(): void;
  onRoute(): void;
  onFloor(ordinal: number): void;
}

const CLOSE_DELAY_MS = 260;

export function FloorPicker(props: Props) {
  const { t, collapsible } = props;
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const cancelClose = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancelClose, []);

  const show = !collapsible || open;
  return (
    <nav
      className={`hud floor-picker ${collapsible ? 'collapsible' : ''} ${show ? 'open' : ''}`}
      aria-label={t('levels')}
      onPointerEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onPointerLeave={() => {
        cancelClose();
        // a short grace period: the pointer may only be cutting a corner
        timer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
      }}
      onFocus={() => {
        cancelClose();
        setOpen(true);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && collapsible && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      {collapsible && (
        <button type="button" className="floor-toggle" aria-expanded={open} aria-haspopup="true" title={t('levels')} data-mode={props.currentMode} onClick={() => setOpen(true)} data-testid="floor-toggle">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l9 4.5-9 4.5-9-4.5z" />
            <path d="M3 12l9 4.5 9-4.5M3 16.5L12 21l9-4.5" />
          </svg>
          <span className="sr-only">{t('levels')}: </span>
          <span className="floor-current">{props.current}</span>
          <span className="floor-caret" aria-hidden="true">
            ▾
          </span>
        </button>
      )}
      {show && (
        <div className="floor-rail" data-testid="floor-list">
          {props.showAll && (
            <button type="button" className="wide" aria-pressed={props.allActive} onClick={props.onAll} data-testid="floor-all">
              {t('allLevels')}
            </button>
          )}
          {props.showRoute && (
            <button type="button" className="wide" aria-pressed={props.routeActive} onClick={props.onRoute} data-testid="floor-route">
              {t('routeLevels')}
            </button>
          )}
          {props.floors.map((f) => (
            <button key={f.ordinal} type="button" aria-pressed={f.active} className={f.onRoute ? 'has-route' : ''} onClick={() => props.onFloor(f.ordinal)} data-floor data-testid={`floor-${f.label}`}>
              {f.label}
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}
