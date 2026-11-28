import { APP_THEMES, LOCALES } from '@senkiro/contracts';
import { SegmentedControl } from '@senkiro/ui-kit';
import { useAppSearch, useMessages, useUpdateSearch } from '../app/hooks.ts';
import { LANGUAGE_NAMES } from '../i18n/messages.ts';
import { SlotBoundary, useShellSlots } from '../slots/slots.tsx';
import styles from './modules.module.css';

export function ProfileModule() {
  const { lang, theme } = useAppSearch();
  const m = useMessages();
  const update = useUpdateSearch();
  const { localDbStatusProbe: LocalDbStatusProbe } = useShellSlots();
  return (
    <div className={styles.stack}>
      <section className={styles.section}>
        <h3 className={styles.heading}>{m.profile.appearance}</h3>
        <SegmentedControl
          label={m.shell.languageLabel}
          value={lang}
          block
          options={LOCALES.map((locale) => ({ value: locale, label: LANGUAGE_NAMES[locale] }))}
          onValueChange={(next) => update({ lang: next }, { replace: true })}
        />
        <SegmentedControl
          label={m.shell.themeLabel}
          value={theme}
          block
          options={APP_THEMES.map((value) => ({ value, label: m.themes[value] }))}
          onValueChange={(next) => update({ theme: next }, { replace: true })}
        />
      </section>
      <section className={styles.section}>
        <h3 className={styles.heading}>{m.profile.dataSovereignty}</h3>
        <p className={styles.lead}>{m.profile.dataSovereigntyBody}</p>
      </section>
      <section className={styles.section}>
        <h3 className={styles.heading}>{m.profile.localDb}</h3>
        <div className={styles.slot} data-slot="local-db-status-probe">
          {LocalDbStatusProbe === undefined ? (
            m.slots.localDbPending
          ) : (
            <SlotBoundary fallback={m.slots.localDbError} loading={m.slots.localDbLoading}>
              <LocalDbStatusProbe lang={lang} />
            </SlotBoundary>
          )}
        </div>
      </section>
      <p className={styles.notice}>{m.brand.notOfficial}</p>
    </div>
  );
}
