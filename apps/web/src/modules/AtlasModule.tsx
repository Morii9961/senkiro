import { formatTemplate, UnknownValue } from '@senkiro/ui-kit';
import { Fragment } from 'react';
import { useAppSearch, useMessages } from '../app/hooks.ts';
import { AtlasEncyclopedia } from '../features/atlas/AtlasEncyclopedia.tsx';
import { AtlasSearch } from '../features/atlas/AtlasSearch.tsx';
import { OperatorFilter } from '../features/atlas/OperatorFilter.tsx';
import { useAtlasBundle } from '../features/atlas/use-atlas-bundle.ts';
import styles from './modules.module.css';

/**
 * SENKIRO Atlas panel: region overview, trilingual search, operator filter and data
 * status; when the URL names a station, complex or line, its encyclopedia entry takes the
 * place of search and filter. Without an `atlasDataSource` slot (Wave 1 default) it stays an honest
 * placeholder; every count is shown as "not yet available" rather than guessed.
 */
export function AtlasModule() {
  const { lang, region, station, complex, line } = useAppSearch();
  const entity = station ?? complex ?? line;
  const m = useMessages();
  const state = useAtlasBundle(region);
  const ready = state.status === 'ready' ? state : null;
  const graph = ready?.bundle.trackGraph;

  const counts = [
    { label: m.atlas.lines, value: graph?.lines.length },
    { label: m.atlas.stations, value: graph?.stations.length },
    { label: m.atlas.complexes, value: graph?.complexes.length },
    { label: m.atlas.throughServices, value: ready?.bundle.throughServices.length },
  ];

  return (
    <div className={styles.stack} data-atlas-panel={state.status}>
      <section className={styles.section}>
        <h3 className={styles.heading}>{m.regions[region].name}</h3>
        <p className={styles.lead}>{m.regions[region].description}</p>
      </section>
      {ready === null ? null : (
        <>
          {ready.preview ? (
            <p className={styles.notice} data-atlas-preview="">
              {m.atlas.previewNotice}
            </p>
          ) : null}
          {entity === undefined ? (
            <>
              <AtlasSearch index={ready.index} region={region} />
              <OperatorFilter index={ready.index} region={region} />
            </>
          ) : (
            <AtlasEncyclopedia index={ready.index} />
          )}
        </>
      )}
      <section className={styles.section}>
        <h3 className={styles.heading}>{m.atlas.dataStatus}</h3>
        <dl className={styles.facts}>
          {counts.map(({ label, value }) => (
            <Fragment key={label}>
              <dt>{label}</dt>
              <dd>
                {value === undefined ? (
                  <UnknownValue lang={lang} kind="pending" label={label} />
                ) : (
                  <span data-count={value}>{value}</span>
                )}
              </dd>
            </Fragment>
          ))}
        </dl>
        {state.status === 'unconnected' ? (
          <p className={styles.notice}>{m.atlas.notConnected}</p>
        ) : state.status === 'unavailable' ? (
          <p className={styles.notice}>{m.atlas.unavailable}</p>
        ) : state.status === 'loading' ? (
          <p className={styles.notice} role="status">
            {m.atlas.loading}
          </p>
        ) : state.status === 'error' ? (
          <p className={styles.notice} role="alert">
            {formatTemplate(m.atlas.loadError, { error: state.error })}
          </p>
        ) : null}
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
