/**
 * Small shared pieces of the interface: line badges, floor chips and the
 * pictograms for facilities.
 *
 * The line badge is this prototype's own design — a block in the line's
 * display colour, carrying the line's letter code when one has been verified.
 * It deliberately does not reproduce any operator's line symbol.
 */
import type { RailLine } from '../domain/types';
import type { Lang } from './i18n';
import { pickName } from './naming';
import { inkOn } from './theme';

export function LineBadge({ line, lang, compact = false }: { line: RailLine; lang: Lang; compact?: boolean }) {
  const name = pickName(line.names, lang) ?? line.id;
  const code = line.stationNumberPrefix;
  return (
    <span className={`line-badge ${compact ? 'compact' : ''}`} title={name}>
      <span className="line-mark" style={{ background: line.displayColor, color: inkOn(line.displayColor) }} aria-hidden="true">
        {code ?? ''}
      </span>
      {!compact && <span className="line-name">{name}</span>}
      {compact && <span className="sr-only">{name}</span>}
    </span>
  );
}

export function FloorChip({ label, active = false }: { label: string; active?: boolean }) {
  return <span className={`chip floor-chip ${active ? 'on' : ''}`}>{label}</span>;
}

export type Glyph = 'walk' | 'gate' | 'transfer' | 'stairs' | 'escalator' | 'elevator' | 'entrance' | 'platform' | 'start' | 'goal' | 'block';

/** Plain geometric pictograms, drawn for this prototype. */
export function Icon({ glyph, size = 18 }: { glyph: Glyph; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (glyph) {
    case 'walk':
      return (
        <svg {...common}>
          <circle cx="13" cy="4.5" r="1.8" fill="currentColor" stroke="none" />
          <path d="M9 21l2.5-6.5L9 12l1.5-4.5 3 1.5 2.5 3M13.5 13.5L15 21M7 11l3.5-3.5" />
        </svg>
      );
    case 'gate':
    case 'transfer':
      return (
        <svg {...common}>
          <path d="M5 21V8M19 21V8M5 12h4M15 12h4" />
          <path d="M9 4l3 3 3-3" />
          {glyph === 'transfer' && <path d="M9 19l3-3 3 3" />}
        </svg>
      );
    case 'stairs':
      return (
        <svg {...common}>
          <path d="M3 20h5v-5h5v-5h5V5h3" />
        </svg>
      );
    case 'escalator':
      return (
        <svg {...common}>
          <path d="M3 19h5l9-11h4" />
          <path d="M3 15h3.5l9-11H21" opacity="0.55" />
        </svg>
      );
    case 'elevator':
      return (
        <svg {...common}>
          <rect x="5" y="3" width="14" height="18" rx="1.5" />
          <path d="M9.5 10.5L12 7.5l2.5 3M9.5 13.5L12 16.5l2.5-3" />
        </svg>
      );
    case 'entrance':
      return (
        <svg {...common}>
          <path d="M4 21V5a1 1 0 011-1h9a1 1 0 011 1v3M4 21h11v-3" />
          <path d="M11 13h10M18 10l3 3-3 3" />
        </svg>
      );
    case 'platform':
      return (
        <svg {...common}>
          <rect x="6" y="3" width="12" height="13" rx="3" />
          <path d="M6 10h12M9 20l-2 2M15 20l2 2M8 19h8" />
          <circle cx="9.5" cy="13" r="0.6" fill="currentColor" />
          <circle cx="14.5" cy="13" r="0.6" fill="currentColor" />
        </svg>
      );
    case 'start':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'goal':
      return (
        <svg {...common}>
          <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0113 0c0 5-6.5 11-6.5 11z" />
          <circle cx="12" cy="10" r="2.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'block':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="1" strokeDasharray="3 3" />
          <path d="M8 16l8-8" />
        </svg>
      );
  }
}
