import type { Language } from '../../domain/types'

interface Props {
  lang: Language
  plan: boolean
  floor: number | null
  siteFloors: [number, string][]
  selectionFloors: ReadonlySet<number>
  routeFloors: ReadonlySet<number>
  eye: string | null
  shell: boolean
  spread: boolean
  interior: () => void
  onFloor: (floor: number | null) => void
  onShell: () => void
  onSpread: () => void
}

export function FloorControls({
  lang, plan, floor, siteFloors, selectionFloors, routeFloors, eye, shell, spread, interior, onFloor, onShell, onSpread,
}: Props) {
  const t = (ja: string, en: string) => (lang === 'ja' ? ja : en)
  return (
    <div className="floors" role="group" aria-label={t('階層', 'Floor')}>
      <span className="floor-label" aria-hidden="true">{t('階層', 'Floor')}</span>
      {!plan && (
        <button
          aria-pressed={floor === null}
          onClick={() => onFloor(null)}
        >
          {t('全階', 'All')}
        </button>
      )}
      {siteFloors.map(([n, label]) => {
        const selected = selectionFloors.has(n)
        const routed = routeFloors.has(n)
        const status = [
          selected ? t('選択対象がある階', 'Selected place on this floor') : null,
          routed ? t('経路が通る階', 'On the route') : null,
        ].filter(Boolean).join(' · ')
        return (
          <button
            aria-pressed={floor === n}
            title={status || undefined}
            aria-label={label}
            key={n}
            onClick={() => onFloor(!plan && floor === n ? null : n)}
          >
            {label}
            {selected && <i aria-hidden="true" data-floor-marker="selection" />}
            {routed && <i aria-hidden="true" data-floor-marker="route" />}
          </button>
        )
      })}
      {!plan && (
        <button onClick={interior} aria-pressed={!!eye}>
          {t('乗客目線', 'Passenger view')}
        </button>
      )}
      {!plan && (
        <button aria-pressed={shell} onClick={onShell}>
          {t('建築断面', 'Architecture')}
        </button>
      )}
      {!plan && (
        <button
          className="spread"
          aria-pressed={spread}
          onClick={onSpread}
        >
          {t('階層分解', 'Explode')}
        </button>
      )}
    </div>
  )
}
