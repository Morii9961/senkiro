import { UnknownValue } from '@senkiro/ui-kit';
import { useAppSearch, useMessages } from '../app/hooks.ts';
import styles from './modules.module.css';

export function TicketsModule() {
  const { lang } = useAppSearch();
  const m = useMessages();
  return (
    <div className={styles.stack}>
      <section className={styles.section}>
        <h3 className={styles.heading}>{m.tickets.fare}</h3>
        <dl className={styles.facts}>
          <dt>{m.tickets.fare}</dt>
          <dd>
            <UnknownValue lang={lang} kind="pending" label={m.tickets.fare} />
          </dd>
        </dl>
        <p className={styles.notice}>{m.tickets.fareNotice}</p>
      </section>
      <section className={styles.section}>
        <h3 className={styles.heading}>{m.tickets.keepsake}</h3>
        <p className={styles.notice}>{m.tickets.keepsakeNotice}</p>
      </section>
    </div>
  );
}
