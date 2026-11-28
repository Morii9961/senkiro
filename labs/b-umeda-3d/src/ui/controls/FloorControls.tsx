import type { Language } from '../../domain/types'

interface Props {
  lang: Language
  plan: boolean
  floor: number | null
  siteFloors: [number, string][]
  selectionFloors: ReadonlySet<number>
  routeFloors: ReadonlySet<number>
  onFloor: (floor: number | null) => void
}

export function FloorControls({
  lang, plan, floor, siteFloors, selectionFloors, routeFloors, onFloor,
}: Props) {
  const t = (ja: string, en: string, zh: string) => lang === 'zh' ? zh : lang === 'ja' ? ja : en
  return (
    <div className="floors" role="group" aria-label={t('階層', 'Floor', '楼层')}>
      <span className="floor-label" aria-hidden="true">{t('階層', 'Floor', '楼层')}</span>
      {!plan && (
        <button
          aria-pressed={floor === null}
          onClick={() => onFloor(null)}
        >
          {t('全階', 'All', '全部')}
        </button>
      )}
      {siteFloors.map(([n, label]) => {
        const selected = selectionFloors.has(n)
        const routed = routeFloors.has(n)
        const status = [
          selected ? t('選択対象がある階', 'Selected place on this floor', '选中设施所在楼层') : null,
          routed ? t('経路が通る階', 'On the route', '路线经过此层') : null,
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
    </div>
  )
}
