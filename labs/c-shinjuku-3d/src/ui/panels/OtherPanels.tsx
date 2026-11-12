import type { SourceRecord, StationModel } from '../../domain/types';
import type { StrKey, T } from '../i18n';
import type { RenderStats } from '../Scene3D';
import { zoneColor, type Palette } from '../theme';

// ---------------------------------------------------------------------------
// Display settings
// ---------------------------------------------------------------------------

export function DisplayPanel(props: {
  t: T;
  palette: Palette;
  is3d: boolean;
  explode: number;
  shell: number;
  ghostOthers: boolean;
  showLabels: boolean;
  showVerticals: boolean;
  showBlocks: boolean;
  hasBlocks: boolean;
  animate: boolean;
  fareZones: { zone: string; label: string }[];
  onExplode(v: number): void;
  onShell(v: number): void;
  onGhost(v: boolean): void;
  onLabels(v: boolean): void;
  onVerticals(v: boolean): void;
  onBlocks(v: boolean): void;
  onAnimate(v: boolean): void;
}) {
  const { t, palette: p } = props;
  const legend: [string, string, string?][] = [
    ...props.fareZones.map((z): [string, string] => [zoneColor(p, z.zone), z.label]),
    [p.platform, t('legendPlatform')],
    [p.gate, t('legendGate')],
    [p.gateTransfer, t('kindTransferGate')],
    [p.entrance, t('legendEntrance')],
    [p.elevator, t('legendElevator')],
    [p.stairs, t('legendStairs')],
    [p.escalator, t('legendEscalator')],
    [p.route, t('legendRoute')],
    [p.link, t('legendInferred'), 'dash'],
    ...(props.hasBlocks ? ([[p.block, t('legendUnverified'), 'hatch']] as [string, string, string][]) : []),
  ];
  return (
    <div className="panel-body">
      <section className="sliders">
        <h3>{t('displayModel')}</h3>
        <label>
          <span>
            {t('explode')} <output>{Math.round(props.explode * 100)}%</output>
          </span>
          <input type="range" min={0} max={1} step={0.01} value={props.explode} disabled={!props.is3d} onChange={(e) => props.onExplode(Number(e.target.value))} data-testid="explode" />
        </label>
        <label>
          <span>
            {t('shell')} <output>{Math.round(props.shell * 100)}%</output>
          </span>
          <input type="range" min={0} max={1} step={0.01} value={props.shell} disabled={!props.is3d} onChange={(e) => props.onShell(Number(e.target.value))} data-testid="shell" />
        </label>
      </section>
      <section className="checks">
        <Check label={t('ghostOthers')} checked={props.ghostOthers} onChange={props.onGhost} disabled={!props.is3d} />
        <Check label={t('showLabels')} checked={props.showLabels} onChange={props.onLabels} />
        <Check label={t('showVerticals')} checked={props.showVerticals} onChange={props.onVerticals} />
        {props.hasBlocks && <Check label={t('showBlocks')} checked={props.showBlocks} onChange={props.onBlocks} />}
        <Check label={t('animateCamera')} checked={props.animate} onChange={props.onAnimate} disabled={!props.is3d} testId="animate" />
      </section>
      <section>
        <h3>{t('legend')}</h3>
        <ul className="legend">
          {legend.map(([color, label, style]) => (
            <li key={label}>
              <span className={`swatch ${style ?? ''}`} style={{ ['--c' as string]: color }} />
              {label}
            </li>
          ))}
        </ul>
        <p className="fine">{t('orientationNote')}</p>
        <p className="fine">{t('archNote')}</p>
      </section>
    </div>
  );
}

function Check(props: { label: string; checked: boolean; disabled?: boolean; testId?: string; onChange(v: boolean): void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={props.checked} disabled={props.disabled} onChange={(e) => props.onChange(e.target.checked)} data-testid={props.testId} />
      {props.label}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Sources / about the data
// ---------------------------------------------------------------------------

const REDIST: Record<string, StrKey> = { yes: 'yes', no: 'no', conditional: 'conditional', unknown: 'unknown' };

export function InfoPanel(props: { t: T; model: StationModel; sources: SourceRecord[]; stats: RenderStats | null }) {
  const { t, model } = props;
  const used = props.sources.filter((s) => s.usedInData);
  const unused = props.sources.filter((s) => !s.usedInData);
  const item = (s: SourceRecord) => (
    <li key={s.id}>
      {s.url.startsWith('http') ? (
        <a href={s.url} target="_blank" rel="noreferrer noopener">
          {s.title}
        </a>
      ) : (
        <span>{s.title}</span>
      )}
      <div className="muted">{s.publisher}</div>
      <div className="fine">
        {t('sourceDate')}: {s.sourceDate ?? t('unknown')} · {t('retrieved')}: {s.retrievedAt} · {t('redistribution')}: {t(REDIST[s.redistribution] ?? 'unknown')}
      </div>
    </li>
  );
  return (
    <div className="panel-body">
      <section>
        <h3>{t('scope')}</h3>
        <p>{t('scopeBody')}</p>
        <h3>{t('precision')}</h3>
        <p>{t('precisionBody')}</p>
        <p className="notice">{t('enteredBy')}</p>
        <p className="fine">{t('translationNote')}</p>
      </section>
      <section>
        <h3>{t('sourcesList')}</h3>
        <ul className="sources" data-testid="sources">
          {used.map(item)}
        </ul>
        {unused.length > 0 && (
          <details>
            <summary>{t('sourcesUnused', { n: unused.length })}</summary>
            <ul className="sources">{unused.map(item)}</ul>
          </details>
        )}
      </section>
      <section>
        <details>
          <summary>{t('unconfirmed')}</summary>
          <ul className="plain" data-testid="unconfirmed">
            {model.unconfirmedConnections.map((u) => (
              <li key={u.id}>
                <strong>{u.description}</strong>
                <br />
                <span className="muted">{u.reason}</span>
              </li>
            ))}
          </ul>
        </details>
        <details>
          <summary>{t('excluded')}</summary>
          <ul className="plain">
            {model.complex.explicitlyExcluded.map((x) => (
              <li key={x.name}>
                <strong>{x.name}</strong> — {x.reason}
              </li>
            ))}
          </ul>
        </details>
        <details>
          <summary>{t('stats')}</summary>
          {props.stats ? (
            <p className="mono" data-testid="stats">
              {t('statsTriangles')} {props.stats.triangles.toLocaleString()} · {t('statsCalls')} {props.stats.calls} <span className="muted">({t('statsNote')})</span>
            </p>
          ) : (
            <p className="muted">—</p>
          )}
        </details>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

export function HelpDialog({ t, onClose }: { t: T; onClose(): void }) {
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(e) => e.stopPropagation()} data-testid="help-dialog">
        <header className="row-between">
          <h2 id="help-title">{t('helpTitle')}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('close')} autoFocus>
            ×
          </button>
        </header>
        <dl className="help">
          <dt>{t('helpMouse')}</dt>
          <dd>{t('helpMouseBody')}</dd>
          <dt>{t('helpKeys')}</dt>
          <dd>{t('helpKeysBody')}</dd>
          <dt>{t('helpRoute')}</dt>
          <dd>{t('helpRouteBody')}</dd>
        </dl>
        <p className="notice">{t('helpLost')}</p>
        <p className="fine">{t('honestyShort')}</p>
        <p className="fine">{t('orientationNote')}</p>
      </div>
    </div>
  );
}
