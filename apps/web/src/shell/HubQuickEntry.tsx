import { resolveLocalizedName } from '@senkiro/contracts';
import { FloatingCard } from '@senkiro/ui-kit';
import { useAppSearch, useMessages, useUpdateSearch } from '../app/hooks.ts';
import { HUBS } from '../data/hubs.ts';
import styles from './HubQuickEntry.module.css';

/**
 * Quick-entry cards for the 3D hubs (Umeda, Kyoto, Shinjuku). Hubs of the current region
 * come first; choosing a hub in the other region also switches the region, because a hub
 * implies its region in the URL contract.
 */
export function HubQuickEntry() {
  const search = useAppSearch();
  const m = useMessages();
  const update = useUpdateSearch();
  const ordered = [...HUBS].sort(
    (a, b) => Number(b.region === search.region) - Number(a.region === search.region),
  );

  return (
    <FloatingCard
      as="aside"
      className={styles.card}
      density="compact"
      eyebrow="HUB"
      title={m.hubs.sectionTitle}
      headingLevel={2}
    >
      <ul className={styles.list}>
        {ordered.map((hub) => {
          const name = resolveLocalizedName(hub.names, search.lang);
          const active = search.hub === hub.id;
          const statusText =
            hub.status === 'phase-1-placeholder' ? m.hubs.status.phase1 : m.hubs.status.slotPending;
          return (
            <li key={hub.id}>
              <button
                type="button"
                className={styles.hub}
                data-active={active}
                data-status={hub.status}
                aria-pressed={active}
                aria-label={m.hubs.open.replace('{hub}', name.text)}
                onClick={() =>
                  update({
                    hub: hub.id,
                    region: hub.region,
                    level: undefined,
                    selection: undefined,
                  })
                }
              >
                <span className={styles.name} lang={name.isFallback ? 'ja' : undefined}>
                  {name.text}
                </span>
                <span className={styles.region}>{m.regions[hub.region].name}</span>
                <span className={styles.status}>{statusText}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </FloatingCard>
  );
}
