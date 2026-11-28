import { UnknownValue } from '@senkiro/ui-kit';
import { Fragment } from 'react';
import { useAppSearch, useMessages } from '../app/hooks.ts';
import { SlotBoundary, useShellSlots } from '../slots/slots.tsx';
import styles from './modules.module.css';

export function JourneyModule() {
  const { lang } = useAppSearch();
  const m = useMessages();
  const stats = [m.journey.rides, m.journey.visited, m.journey.coverage];
  const { localDbStatusProbe: LocalDbStatusProbe } = useShellSlots();
  return (
    <div className={styles.stack}>
      <section className={styles.section}>
        <dl className={styles.facts}>
          {stats.map((label) => (
            <Fragment key={label}>
              <dt>{label}</dt>
              <dd>
                <UnknownValue lang={lang} kind="pending" label={label} />
              </dd>
            </Fragment>
          ))}
        </dl>
        <p className={styles.notice}>{m.journey.notice}</p>
      </section>
      <section className={styles.section}>
        <h3 className={styles.heading}>{m.profile.localDb}</h3>
        <div className={styles.slot} data-slot="local-db-status-probe">
          {LocalDbStatusProbe === undefined ? (
            m.slots.localDbPending
          ) : (
            <SlotBoundary fallback={m.hubs.slotError} loading={m.hubs.loading}>
              <LocalDbStatusProbe lang={lang} />
            </SlotBoundary>
          )}
        </div>
      </section>
    </div>
  );
}
