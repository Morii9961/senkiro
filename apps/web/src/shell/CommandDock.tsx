import {
  APP_MODULES,
  APP_REGIONS,
  APP_THEMES,
  type AppModule,
  LOCALES,
  parseAppSearchParams,
} from '@senkiro/contracts';
import { SegmentedControl, SignCode } from '@senkiro/ui-kit';
import { Link } from '@tanstack/react-router';
import { type KeyboardEvent, type Ref, useId } from 'react';
import { useAppSearch, useMessages, useUpdateSearch } from '../app/hooks.ts';
import { LANGUAGE_NAMES, LANGUAGE_SHORT } from '../i18n/messages.ts';
import { useShellUi } from '../state/ui-store.ts';
import styles from './CommandDock.module.css';

export const MODULE_CODES: Readonly<Record<AppModule, string>> = {
  atlas: 'A',
  route: 'R',
  tickets: 'T',
  journey: 'J',
  profile: 'P',
};

/** Arrow keys / Home / End move focus between the module links (Tab still works). */
function onNavKeyDown(event: KeyboardEvent<HTMLElement>) {
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
  if (!keys.includes(event.key)) {
    return;
  }
  const links = [...event.currentTarget.querySelectorAll<HTMLAnchorElement>('a[data-module]')];
  const index = links.indexOf(document.activeElement as HTMLAnchorElement);
  if (index === -1) {
    return;
  }
  event.preventDefault();
  const last = links.length - 1;
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? last
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? (index - 1 + links.length) % links.length
          : (index + 1) % links.length;
  links[next]?.focus();
}

/**
 * Floating Command Dock (top-left): brand sign band, origin/destination entry, the five
 * first-level modules, region switch and display preferences.
 */
export function CommandDock({ ref }: { ref?: Ref<HTMLElement> }) {
  const search = useAppSearch();
  const m = useMessages();
  const update = useUpdateSearch();
  const prefsOpen = useShellUi((state) => state.prefsOpen);
  const togglePrefs = useShellUi((state) => state.togglePrefs);
  const setPanelOpen = useShellUi((state) => state.setPanelOpen);
  const requestRouteFocus = useShellUi((state) => state.requestRouteFocus);
  const prefsId = useId();
  const { lang } = search;

  return (
    <section ref={ref} className={styles.dock} aria-label={m.shell.dockLabel}>
      <div className={styles.sign}>
        <p className={styles.brand}>
          <span className={styles.wordmark}>SENKIRO</span>
          <span className={styles.kana} lang="ja">
            {m.brand.kana}
          </span>
        </p>
        <button
          type="button"
          className={styles.prefsButton}
          aria-expanded={prefsOpen}
          aria-controls={prefsId}
          onClick={togglePrefs}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
            <path
              d="M2 4.5h7m3 0h2M2 11.5h2m3 0h7M9 3v3m-2 4v3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <span className={styles.prefsLabel}>{m.shell.preferences}</span>
        </button>
      </div>
      <span className={styles.signStrip} aria-hidden="true" />

      <div className={styles.body}>
        <button
          type="button"
          className={styles.searchEntry}
          aria-label={m.search.entryLabel}
          onClick={() => {
            requestRouteFocus(true);
            setPanelOpen(true);
            update({ module: 'route' });
          }}
        >
          <span className={styles.searchRow}>
            <span className={styles.searchDot} data-end="from" aria-hidden="true" />
            <span className={styles.searchKey}>{m.search.from}</span>
            <span className={search.from === undefined ? styles.placeholder : styles.searchValue}>
              {search.from ?? m.search.fromPlaceholder}
            </span>
          </span>
          <span className={styles.searchRow}>
            <span className={styles.searchDot} data-end="to" aria-hidden="true" />
            <span className={styles.searchKey}>{m.search.to}</span>
            <span className={search.to === undefined ? styles.placeholder : styles.searchValue}>
              {search.to ?? m.search.toPlaceholder}
            </span>
          </span>
        </button>

        <nav aria-label={m.shell.moduleNavLabel} onKeyDown={onNavKeyDown}>
          <ul className={styles.nav}>
            {APP_MODULES.map((module) => {
              const active = search.module === module;
              return (
                <li key={module}>
                  <Link
                    to="/"
                    search={(prev) => parseAppSearchParams({ ...prev, module })}
                    className={styles.navLink}
                    data-module={module}
                    data-active={active}
                    aria-current={active ? 'page' : undefined}
                    aria-label={m.modules[module].title}
                    title={`${m.modules[module].title} · ${m.modules[module].subtitle}`}
                    onClick={() => setPanelOpen(true)}
                  >
                    <SignCode code={MODULE_CODES[module]} active={active} />
                    <span className={styles.navText}>{m.modules[module].short}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <SegmentedControl
          label={m.shell.regionLabel}
          value={search.region}
          block
          size="sm"
          options={APP_REGIONS.map((region) => ({ value: region, label: m.regions[region].name }))}
          onValueChange={(region) => update({ region })}
        />

        <div id={prefsId} className={styles.prefs} hidden={!prefsOpen}>
          <SegmentedControl
            label={m.shell.languageLabel}
            value={lang}
            block
            size="sm"
            options={LOCALES.map((locale) => ({
              value: locale,
              label: LANGUAGE_SHORT[locale],
              ariaLabel: LANGUAGE_NAMES[locale],
            }))}
            onValueChange={(next) => update({ lang: next }, { replace: true })}
          />
          <SegmentedControl
            label={m.shell.themeLabel}
            value={search.theme}
            block
            size="sm"
            options={APP_THEMES.map((theme) => ({ value: theme, label: m.themes[theme] }))}
            onValueChange={(theme) => update({ theme }, { replace: true })}
          />
        </div>
      </div>
    </section>
  );
}
