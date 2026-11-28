import { MAX_SEARCH_PARAM_LENGTH } from '@senkiro/contracts';
import { UnknownValue } from '@senkiro/ui-kit';
import { type FormEvent, useEffect, useRef } from 'react';
import { useAppSearch, useMessages, useUpdateSearch } from '../app/hooks.ts';
import { useShellUi } from '../state/ui-store.ts';
import styles from './modules.module.css';

/** Blank input clears the parameter instead of storing an empty string. */
function toParam(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function RouteModule() {
  const search = useAppSearch();
  const m = useMessages();
  const update = useUpdateSearch();
  const fromRef = useRef<HTMLInputElement>(null);
  const draft = useShellUi((state) => state.routeDraft);
  const setDraft = useShellUi((state) => state.setRouteDraft);
  const focusRequested = useShellUi((state) => state.routeFocusRequested);
  const requestRouteFocus = useShellUi((state) => state.requestRouteFocus);
  const values = draft ?? { from: search.from ?? '', to: search.to ?? '' };

  useEffect(() => {
    if (focusRequested) {
      fromRef.current?.focus();
      requestRouteFocus(false);
    }
  }, [focusRequested, requestRouteFocus]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    update({ from: toParam(values.from), to: toParam(values.to) });
    setDraft(null);
  };

  return (
    <div className={styles.stack}>
      <form className={styles.form} onSubmit={submit} aria-label={m.route.heading}>
        <label className={styles.field}>
          {m.search.from}
          <input
            ref={fromRef}
            className={styles.input}
            name="from"
            value={values.from}
            maxLength={MAX_SEARCH_PARAM_LENGTH}
            placeholder={m.search.fromPlaceholder}
            autoComplete="off"
            onChange={(event) => setDraft({ ...values, from: event.target.value })}
          />
        </label>
        <label className={styles.field}>
          {m.search.to}
          <input
            className={styles.input}
            name="to"
            value={values.to}
            maxLength={MAX_SEARCH_PARAM_LENGTH}
            placeholder={m.search.toPlaceholder}
            autoComplete="off"
            onChange={(event) => setDraft({ ...values, to: event.target.value })}
          />
        </label>
        <div className={styles.row}>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={search.stepFree === true}
              onChange={(event) => update({ stepFree: event.target.checked ? true : undefined })}
            />
            {m.search.stepFree}
          </label>
          <div className={styles.row}>
            <button
              type="button"
              className={styles.button}
              onClick={() => setDraft({ from: values.to, to: values.from })}
            >
              {m.search.swap}
            </button>
            <button type="submit" className={`${styles.button} ${styles.primary}`}>
              {m.search.submit}
            </button>
          </div>
        </div>
      </form>
      <section className={styles.section}>
        <h3 className={styles.heading}>{m.search.results}</h3>
        <div>
          <UnknownValue lang={search.lang} kind="pending" label={m.search.results} />
        </div>
        <p className={styles.notice}>{m.search.engineNotice}</p>
      </section>
    </div>
  );
}
