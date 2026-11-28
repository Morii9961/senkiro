import { UnknownValue } from '@senkiro/ui-kit';
import { useAppSearch, useMessages } from '../app/hooks.ts';
import styles from './modules.module.css';

export function AtlasModule() {
  const { lang, region } = useAppSearch();
  const m = useMessages();
  return (
    <div className={styles.stack}>
      <section className={styles.section}>
        <h3 className={styles.heading}>{m.regions[region].name}</h3>
        <p className={styles.lead}>{m.regions[region].description}</p>
      </section>
      <section className={styles.section}>
        <h3 className={styles.heading}>{m.atlas.dataStatus}</h3>
        <dl className={styles.facts}>
          <dt>{m.atlas.lines}</dt>
          <dd>
            <UnknownValue lang={lang} kind="pending" label={m.atlas.lines} />
          </dd>
          <dt>{m.atlas.stations}</dt>
          <dd>
            <UnknownValue lang={lang} kind="pending" label={m.atlas.stations} />
          </dd>
        </dl>
        <p className={styles.notice}>{m.shell.phaseNotice}</p>
      </section>
      <section className={styles.section}>
        <h3 className={styles.heading}>{m.honesty.title}</h3>
        <ul className={styles.rules}>
          {m.honesty.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
