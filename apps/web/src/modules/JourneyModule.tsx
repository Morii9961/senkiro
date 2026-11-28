import { UnknownValue } from '@senkiro/ui-kit';
import { Fragment } from 'react';
import { useAppSearch, useMessages } from '../app/hooks.ts';
import styles from './modules.module.css';

export function JourneyModule() {
  const { lang } = useAppSearch();
  const m = useMessages();
  const stats = [m.journey.rides, m.journey.visited, m.journey.coverage];
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
    </div>
  );
}
