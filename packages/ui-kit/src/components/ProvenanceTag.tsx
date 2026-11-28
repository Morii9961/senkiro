import * as Popover from '@radix-ui/react-popover';
import {
  type DataNature,
  type Locale,
  type Provenance,
  requiresSyntheticDisclosure,
  type SchedulePrecision,
  type SourceRecord,
} from '@senkiro/contracts';
import { formatTemplate, UI_KIT_STRINGS } from '../strings.ts';
import styles from './ProvenanceTag.module.css';
import { UnknownValue } from './UnknownValue.tsx';

export interface ProvenanceTagProps {
  provenance: Provenance;
  lang: Locale;
  /** Source registry used to resolve `provenance.sourceIds`. Unresolved IDs are shown as such. */
  sources?: readonly SourceRecord[];
  /** Pass the trip precision so frequency/demo schedules also get the synthetic disclosure. */
  schedulePrecision?: SchedulePrecision;
  /** Called when a source entry is activated (e.g. to open a source drawer). */
  onSourceSelect?: (sourceId: string) => void;
  className?: string | undefined;
}

const TONE: Readonly<Record<DataNature, 'verified' | 'neutral' | 'synthetic' | 'unknown'>> = {
  official: 'verified',
  'manual-verified': 'verified',
  'licensed-third-party': 'neutral',
  derived: 'neutral',
  synthetic: 'synthetic',
  unknown: 'unknown',
};

/** Only http(s) URLs become links; anything else is rendered as plain text. */
function safeHttpUrl(url: string | null): string | null {
  if (url === null) {
    return null;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

/**
 * Compact `DataNature` chip that opens a provenance popover listing every source record,
 * its licence and retrieval date (contract §1.2). Synthetic data and frequency/demo
 * schedules always carry an explicit warning (contract §1.4).
 */
export function ProvenanceTag({
  provenance,
  lang,
  sources = [],
  schedulePrecision,
  onSourceSelect,
  className,
}: ProvenanceTagProps) {
  const strings = UI_KIT_STRINGS[lang];
  const natureLabel = strings.dataNature[provenance.dataNature];
  const synthetic = requiresSyntheticDisclosure(provenance, schedulePrecision);
  const tone = synthetic ? 'synthetic' : TONE[provenance.dataNature];
  const registry = new Map(sources.map((source) => [String(source.id), source]));

  return (
    <Popover.Root>
      <Popover.Trigger
        className={className === undefined ? styles.trigger : `${styles.trigger} ${className}`}
        data-tone={tone}
        aria-label={formatTemplate(strings.provenance.trigger, { nature: natureLabel })}
      >
        <span className={styles.dot} aria-hidden="true" />
        <span aria-hidden="true">{natureLabel}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={styles.content}
          sideOffset={6}
          align="start"
          collisionPadding={16}
          aria-label={strings.provenance.title}
        >
          <p className={styles.title}>{strings.provenance.title}</p>
          {synthetic && (
            <p className={styles.warning} role="alert">
              {strings.provenance.syntheticWarning}
            </p>
          )}
          <dl className={styles.facts}>
            <dt>{strings.provenance.dataNature}</dt>
            <dd data-tone={tone}>{natureLabel}</dd>
            <dt>{strings.provenance.lastVerified}</dt>
            <dd>
              {provenance.lastVerifiedAt === null ? (
                <UnknownValue lang={lang} kind="unverified" />
              ) : (
                <time dateTime={provenance.lastVerifiedAt}>{provenance.lastVerifiedAt}</time>
              )}
            </dd>
          </dl>
          {provenance.note !== undefined && <p className={styles.note}>{provenance.note}</p>}
          <p className={styles.subtitle}>{strings.provenance.sources}</p>
          {provenance.sourceIds.length === 0 ? (
            <p className={styles.empty}>{strings.provenance.noSources}</p>
          ) : (
            <ul className={styles.sources}>
              {provenance.sourceIds.map((sourceId) => {
                const source = registry.get(sourceId);
                const href = safeHttpUrl(source?.url ?? null);
                return (
                  <li key={sourceId} className={styles.source}>
                    {source === undefined ? (
                      <>
                        <code className={styles.sourceId}>{sourceId}</code>
                        <span className={styles.unresolved}>
                          {strings.provenance.unresolvedSource}
                        </span>
                      </>
                    ) : (
                      <>
                        {onSourceSelect === undefined ? (
                          <span className={styles.sourceTitle}>{source.title}</span>
                        ) : (
                          <button
                            type="button"
                            className={styles.sourceButton}
                            onClick={() => onSourceSelect(sourceId)}
                          >
                            {source.title}
                          </button>
                        )}
                        <span className={styles.meta}>
                          {strings.provenance.publisher}: {source.publisher} ·{' '}
                          {strings.provenance.license}: {source.license} ·{' '}
                          {strings.provenance.retrieved}:{' '}
                          <time dateTime={source.retrievedAt}>{source.retrievedAt}</time>
                        </span>
                        {href !== null && (
                          <a
                            className={styles.link}
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {strings.provenance.openSource}
                          </a>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <Popover.Arrow className={styles.arrow} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
