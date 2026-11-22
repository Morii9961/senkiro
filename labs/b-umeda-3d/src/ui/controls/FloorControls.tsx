import type { Language } from '../../domain/types'

interface Props {
  lang: Language
  plan: boolean
  floor: number | null
  siteFloors: [number, string][]
  eye: string | null
  shell: boolean
  spread: boolean
  interior: () => void
  onFloor: (floor: number | null) => void
  onShell: () => void
  onSpread: () => void
}

export function FloorControls({
  lang, plan, floor, siteFloors, eye, shell, spread, interior, onFloor, onShell, onSpread,
}: Props) {
  const t = (ja: string, en: string) => (lang === 'ja' ? ja : en)
  return (
    <div className="floors">
      <span>{t('階層', 'Floor')}</span>
      {!plan && (
        <button
          aria-pressed={floor === null}
          onClick={() => onFloor(null)}
        >
          {t('全階', 'All')}
        </button>
      )}
      {siteFloors.map(([n, label]) => (
        <button
          aria-pressed={floor === n}
          key={n}
          onClick={() => onFloor(n)}
        >
          {label}
        </button>
      ))}
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
