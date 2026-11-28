/**
 * Trilingual Atlas search (zh-CN / ja / kana / en / station numbers). Results are grouped
 * by kind so a station complex and an individual station can never be read as one hit:
 * "京都" lists the Kyoto Station complex under complexes and Hankyu Kyoto-kawaramachi
 * under individual stations, each saying which complex (if any) it belongs to.
 */
import type { AppRegion, Locale } from '@senkiro/contracts';
import { formatTemplate, safeLineColor } from '@senkiro/ui-kit';
import { type CSSProperties, type ReactNode, useId, useMemo, useState } from 'react';
import { useAppSearch, useMessages, useUpdateSearch } from '../../app/hooks.ts';
import type { Messages } from '../../i18n/messages.ts';
import styles from './atlas.module.css';
import {
  type AtlasIndex,
  type AtlasResultKind,
  type AtlasSearchResult,
  complexOperators,
  highlightRange,
  nameOf,
  searchAtlas,
} from './atlas-index.ts';
import { hiddenSet, useAtlasUi } from './atlas-store.ts';

function Highlighted({ text, query }: { text: string; query: string }) {
  const range = highlightRange(text, query);
  if (range === null) {
    return <>{text}</>;
  }
  const [start, end] = range;
  return (
    <>
      {text.slice(0, start)}
      <mark className={styles.mark}>{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}

interface ResultView {
  title: string;
  meta: ReactNode;
  color: string | null;
}

function describeResult(
  index: AtlasIndex,
  result: AtlasSearchResult,
  lang: Locale,
  m: Messages,
): ResultView {
  const unknown = formatTemplate(m.atlas.entry.unknownEntity, { id: result.id });
  if (result.kind === 'complex') {
    const complex = index.complexes.get(result.id);
    if (complex === undefined) {
      return { title: unknown, meta: null, color: null };
    }
    const operators = complexOperators(index, complex);
    return {
      title: nameOf(complex.names, lang) ?? unknown,
      meta: (
        <>
          {formatTemplate(m.atlas.search.complexMeta, {
            stations: String(complex.stationIds.length),
            operators: String(operators.length),
          })}
          {operators.length > 0
            ? ` · ${operators.map((op) => nameOf(op.names, lang) ?? op.id).join(' / ')}`
            : null}
        </>
      ),
      color: null,
    };
  }
  if (result.kind === 'station') {
    const station = index.stations.get(result.id);
    if (station === undefined) {
      return { title: unknown, meta: null, color: null };
    }
    const operator = index.operators.get(station.operatorId);
    const complex =
      station.stationComplexId === null ? undefined : index.complexes.get(station.stationComplexId);
    const membership =
      complex === undefined
        ? m.atlas.search.standalone
        : formatTemplate(m.atlas.search.memberOf, {
            complex: nameOf(complex.names, lang) ?? complex.id,
          });
    return {
      title: nameOf(station.names, lang) ?? unknown,
      meta: (
        <>
          {operator === undefined
            ? station.operatorId
            : (nameOf(operator.names, lang) ?? operator.id)}
          {station.stationCode === null ? null : (
            <>
              {' · '}
              <code className={styles.code}>{station.stationCode}</code>
            </>
          )}
          {' · '}
          <span data-membership={complex === undefined ? 'standalone' : complex.id}>
            {membership}
          </span>
        </>
      ),
      color: operator === undefined ? null : safeLineColor(operator.brandColor),
    };
  }
  const line = index.lines.get(result.id);
  if (line === undefined) {
    return { title: unknown, meta: null, color: null };
  }
  const operator = index.operators.get(line.operatorId);
  return {
    title: nameOf(line.names, lang) ?? unknown,
    meta: operator === undefined ? line.operatorId : (nameOf(operator.names, lang) ?? operator.id),
    color: safeLineColor(line.color),
  };
}

const GROUPS: readonly AtlasResultKind[] = ['complex', 'station', 'line'];

export interface AtlasSearchProps {
  index: AtlasIndex;
  region: AppRegion;
}

export function AtlasSearch({ index, region }: AtlasSearchProps) {
  const { lang } = useAppSearch();
  const m = useMessages();
  const update = useUpdateSearch();
  const [query, setQuery] = useState('');
  const hidden = useAtlasUi((ui) => ui.hiddenOperators[region]);
  const inputId = useId();
  const hintId = useId();
  const results = useMemo(
    () => searchAtlas(index, query, { hiddenOperatorIds: hiddenSet(hidden) }),
    [index, query, hidden],
  );
  const groups: Record<AtlasResultKind, AtlasSearchResult[]> = {
    complex: results.complexes,
    station: results.stations,
    line: results.lines,
  };
  const total = results.complexes.length + results.stations.length + results.lines.length;
  const trimmed = query.trim();

  const select = (result: AtlasSearchResult) => {
    if (result.kind === 'complex') {
      update({ complex: result.id, station: undefined, line: undefined });
    } else if (result.kind === 'station') {
      update({ station: result.id, complex: undefined, line: undefined });
    } else {
      update({ line: result.id, station: undefined, complex: undefined });
    }
  };

  return (
    <section className={styles.search} data-atlas-search="">
      <label className={styles.searchLabel} htmlFor={inputId}>
        {m.atlas.search.label}
      </label>
      <input
        id={inputId}
        className={styles.searchInput}
        type="search"
        value={query}
        placeholder={m.atlas.search.placeholder}
        aria-describedby={hintId}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      <p id={hintId} className={styles.hint}>
        {m.atlas.search.hint}
      </p>
      {trimmed === '' ? null : (
        <div className={styles.results} aria-live="polite" data-result-count={total}>
          {total === 0 ? (
            <p className={styles.empty}>
              {formatTemplate(m.atlas.search.empty, { query: trimmed })}
            </p>
          ) : (
            GROUPS.filter((kind) => groups[kind].length > 0).map((kind) => (
              <section key={kind} className={styles.group} data-result-group={kind}>
                <h4 className={styles.groupTitle}>
                  {m.atlas.search.groups[kind]}
                  <span className={styles.count}>{groups[kind].length}</span>
                </h4>
                <ul className={styles.resultList}>
                  {groups[kind].map((result) => {
                    const view = describeResult(index, result, lang, m);
                    const viaOther = highlightRange(view.title, query) === null;
                    return (
                      <li key={result.id}>
                        <button
                          type="button"
                          className={styles.result}
                          data-result-kind={result.kind}
                          data-result-id={result.id}
                          style={
                            view.color === null
                              ? undefined
                              : ({ '--sk-line-color': view.color } as CSSProperties)
                          }
                          onClick={() => select(result)}
                        >
                          <span className={styles.kind} data-kind={result.kind}>
                            {m.atlas.search.kinds[result.kind]}
                          </span>
                          <span className={styles.resultBody}>
                            <span className={styles.resultTitle}>
                              <Highlighted text={view.title} query={query} />
                            </span>
                            <span className={styles.meta}>
                              {view.meta}
                              {viaOther ? (
                                <>
                                  {' · '}
                                  {formatTemplate(m.atlas.search.matchedBy, {
                                    text: result.matched,
                                  })}
                                </>
                              ) : null}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
          {results.hiddenByFilter > 0 ? (
            <p className={styles.hint} data-hidden-by-filter={results.hiddenByFilter}>
              {formatTemplate(m.atlas.search.hiddenByFilter, {
                count: String(results.hiddenByFilter),
              })}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
