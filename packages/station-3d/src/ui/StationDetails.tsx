import {
  isPaidFareZone,
  type Locale,
  type LocalizedNames,
  type SkId,
  type SourceRecord,
  type StationHubDataset,
  type StationLink,
  type StationPlace,
} from '@senkiro/contracts';
import { useEffect, useRef, useState } from 'react';
import { linkKindLabel, nameText, placeKindLabel, t } from '../i18n.ts';
import { UnknownValue } from './UnknownValue.tsx';

interface DetailsProps {
  dataset: StationHubDataset;
  locale: Locale;
  facility: StationPlace | StationLink | undefined;
  onFocus?: (() => void) | undefined;
  onNavigateExternalLine?: ((id: SkId<'line'>) => void) | undefined;
}

function Label({ names, locale }: { names: LocalizedNames; locale: Locale }) {
  return nameText(names, locale) ?? <UnknownValue locale={locale} />;
}

function SourcesDialog({
  sources,
  locale,
  onClose,
}: {
  sources: SourceRecord[];
  locale: Locale;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog?.setAttribute('open', '');
    }
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={t(locale, 'sources')}
      onCancel={onClose}
      style={{
        color: 'inherit',
        background: 'inherit',
        width: 'min(38rem, 90vw)',
        maxHeight: '80vh',
      }}
    >
      <h2>{t(locale, 'sources')}</h2>
      <button type="button" onClick={onClose}>
        {t(locale, 'close')}
      </button>
      <ul>
        {sources.map((source) => (
          <li key={source.id}>
            <strong>
              {source.url ? (
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
              ) : (
                source.title
              )}
            </strong>
            <div>
              {source.publisher} · {t(locale, 'retrieved')} {source.retrievedAt}
            </div>
            <div>
              {t(locale, 'sourceDate')} {source.sourceDate ?? <UnknownValue locale={locale} />}
            </div>
            <div>
              {t(locale, 'licence')}{' '}
              {source.licenseUrl ? (
                <a href={source.licenseUrl} target="_blank" rel="noreferrer">
                  {source.license}
                </a>
              ) : (
                source.license
              )}
            </div>
            {source.attributionText ? <p>{source.attributionText}</p> : null}
            {source.notes ? <p>{source.notes}</p> : null}
          </li>
        ))}
      </ul>
    </dialog>
  );
}

export function StationDetails({
  dataset,
  locale,
  facility,
  onFocus,
  onNavigateExternalLine,
}: DetailsProps) {
  const [showSources, setShowSources] = useState(false);
  const place = facility && 'fareZone' in facility ? facility : undefined;
  const link = facility && 'fromPlaceId' in facility ? facility : undefined;
  const station = dataset.stations.find((item) => item.id === place?.stationId);
  const level = dataset.levels.find((item) => item.id === place?.levelId);
  const sourceIds = new Set(facility?.provenance.sourceIds);
  if (place) {
    for (const id of place.terminus?.sourceIds ?? []) {
      sourceIds.add(id);
    }
    for (const track of place.tracks ?? []) {
      for (const id of track.platformDoors?.sourceIds ?? []) {
        sourceIds.add(id);
      }
    }
  }
  const sources = facility
    ? dataset.sources.filter((source) => sourceIds.has(source.id))
    : dataset.sources;
  const lines = new Map(dataset.lines.map((line) => [line.id, line]));
  const officialLinks = dataset.externalLinks ?? [];
  const zone = place && (isPaidFareZone(place.fareZone) ? 'paid' : place.fareZone);
  const kind = place
    ? placeKindLabel(locale, place.kind)
    : link && linkKindLabel(locale, link.kind);

  return (
    <section aria-label={t(locale, 'details')} data-station-details="">
      <h2 style={{ fontSize: '1rem' }}>{t(locale, 'details')}</h2>
      {facility ? (
        <>
          <h3>{nameText(facility.names, locale) ?? kind}</h3>
          <dl>
            {station ? (
              <>
                <dt>{t(locale, 'station')}</dt>
                <dd>
                  <Label names={station.names} locale={locale} />
                </dd>
              </>
            ) : null}
            {level ? (
              <>
                <dt>{t(locale, 'floor')}</dt>
                <dd>{level.label}</dd>
              </>
            ) : null}
            {place && zone ? (
              <>
                <dt>{t(locale, 'fareZone')}</dt>
                <dd>{t(locale, zone)}</dd>
                <dt>{t(locale, 'geometry')}</dt>
                <dd>{t(locale, `geometry.${place.geometryConfidence}`)}</dd>
                {place.existence === 'unverified' ? <dd>{t(locale, 'unverified')}</dd> : null}
                {place.leadsTo ? (
                  <>
                    <dt>{t(locale, 'leadsTo')}</dt>
                    <dd>
                      <Label names={place.leadsTo} locale={locale} />
                    </dd>
                  </>
                ) : null}
              </>
            ) : null}
            {link ? (
              <>
                <dt>{t(locale, 'connection')}</dt>
                <dd>{t(locale, `connection.${link.connection}`)}</dd>
                <dt>{t(locale, 'stepFree')}</dt>
                <dd>
                  {link.stepFree === null ? (
                    <UnknownValue locale={locale} kind="unverified" />
                  ) : (
                    t(locale, link.stepFree ? 'yes' : 'no')
                  )}
                </dd>
                {link.hoursNote ? (
                  <>
                    <dt>{t(locale, 'hours')}</dt>
                    <dd>{link.hoursNote}</dd>
                  </>
                ) : null}
              </>
            ) : null}
          </dl>
          {place?.tracks?.length ? (
            <ul aria-label={t(locale, 'tracks')}>
              {place.tracks.map((track) => (
                <li key={`${track.number}-${track.side ?? ''}`}>
                  {t(locale, 'tracks')} {track.number}
                  {track.platformDoors ? (
                    <div>
                      {t(locale, 'platformDoors')} ·{' '}
                      {t(locale, `doors.${track.platformDoors.status}`)}
                    </div>
                  ) : null}
                  {track.services.map(({ railLineId, towards }) => {
                    const names = lines.get(railLineId)?.names;
                    const lineName = names ? nameText(names, locale) : null;
                    return (
                      <div key={`${railLineId}-${towards.ja}-${towards.en}`}>
                        {lineName && onNavigateExternalLine ? (
                          <button type="button" onClick={() => onNavigateExternalLine(railLineId)}>
                            {lineName}
                          </button>
                        ) : (
                          (lineName ?? <UnknownValue locale={locale} />)
                        )}
                        {' · '}
                        {t(locale, 'towards')} <Label names={towards} locale={locale} />
                      </div>
                    );
                  })}
                </li>
              ))}
            </ul>
          ) : null}
          {onFocus ? (
            <button type="button" onClick={onFocus}>
              {t(locale, 'focus')}
            </button>
          ) : null}
        </>
      ) : (
        <p>{t(locale, 'selectHint')}</p>
      )}
      {sources.length ? (
        <button type="button" onClick={() => setShowSources(true)}>
          {t(locale, 'showSources')}
        </button>
      ) : null}
      {showSources ? (
        <SourcesDialog sources={sources} locale={locale} onClose={() => setShowSources(false)} />
      ) : null}
      {officialLinks.length ? (
        <>
          <h3>{t(locale, 'officialLinks')}</h3>
          <ul>
            {officialLinks.map((link) => (
              <li key={`${link.kind}-${link.url}-${link.stationId}`}>
                <a href={link.url} target="_blank" rel="noreferrer">
                  <Label names={link.label} locale={locale} />
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
