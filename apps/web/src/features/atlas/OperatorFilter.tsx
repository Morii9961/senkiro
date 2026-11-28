/**
 * Multi-select operator filter (8 Kansai operators, or the Kanto preview operators). It
 * hides an operator's lines and stations on the map and drops results whose operators are
 * all hidden from the search. View state only: it lives in the atlas store, not the URL.
 */
import type { AppRegion } from '@senkiro/contracts';
import { formatTemplate, safeLineColor } from '@senkiro/ui-kit';
import type { CSSProperties } from 'react';
import { useAppSearch, useMessages } from '../../app/hooks.ts';
import styles from './atlas.module.css';
import { type AtlasIndex, nameOf } from './atlas-index.ts';
import { useAtlasUi } from './atlas-store.ts';

export function OperatorFilter({ index, region }: { index: AtlasIndex; region: AppRegion }) {
  const { lang } = useAppSearch();
  const m = useMessages();
  const hidden = useAtlasUi((ui) => ui.hiddenOperators[region]);
  const toggle = useAtlasUi((ui) => ui.toggleOperator);
  const showAll = useAtlasUi((ui) => ui.showAll);
  const operators = index.operatorList;
  const hiddenCount = operators.filter((operator) => hidden.includes(operator.id)).length;

  return (
    <section className={styles.filter} data-operator-filter="" aria-label={m.atlas.filter.title}>
      <div className={styles.filterHead}>
        <h3 className={styles.sectionTitle}>{m.atlas.filter.title}</h3>
        {hiddenCount > 0 ? (
          <>
            <span className={styles.count} data-hidden-operators={hiddenCount}>
              {formatTemplate(m.atlas.filter.hiddenCount, { count: String(hiddenCount) })}
            </span>
            <button type="button" className={styles.linkButton} onClick={() => showAll(region)}>
              {m.atlas.filter.showAll}
            </button>
          </>
        ) : null}
      </div>
      <ul className={styles.chips}>
        {operators.map((operator) => {
          const name = nameOf(operator.names, lang) ?? operator.id;
          const shown = !hidden.includes(operator.id);
          const color = safeLineColor(operator.brandColor);
          return (
            <li key={operator.id}>
              <button
                type="button"
                className={styles.chip}
                aria-pressed={shown}
                aria-label={formatTemplate(m.atlas.filter.toggle, { operator: name })}
                data-operator-id={operator.id}
                style={color === null ? undefined : ({ '--sk-line-color': color } as CSSProperties)}
                onClick={() => toggle(region, operator.id)}
              >
                <span className={styles.swatch} aria-hidden="true" />
                <span aria-hidden="true">{name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
