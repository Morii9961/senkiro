import { nameIn } from '../../domain/language'
import { lineBadgeTextColor, unverifiedLineColor } from '../../domain/lines'
import type { Language, RailLine } from '../../domain/types'
import { lineStyleById, station } from '../../model'

interface Props {
  line: RailLine
  lang: Language
  size?: 'xs' | 'sm' | 'md'
  showName?: boolean
  showOperator?: boolean
}

export function LineBadge({ line, lang, size = 'sm', showName = true, showOperator = false }: Props) {
  const style = lineStyleById.get(line.id)
  const hex = style?.color?.hex
  const operator = showOperator
    ? nameIn(station.operators.find((entry) => entry.id === line.operatorId)?.names, lang)
    : null
  const name = nameIn(line.names, lang)
  const label = [showName ? name : null, operator].filter(Boolean).join(' · ')
  return (
    <span
      className="line-badge"
      data-size={size}
      data-line-color={hex ? 'known' : 'unknown'}
      title={hex || style?.shortName ? name : unverifiedLineColor(lang)}
      aria-label={label ? undefined : name}
    >
      {hex && style.stationNumberPrefix && (
        <span className="line-mark" aria-hidden="true" data-kind={style.kind}
          style={{ backgroundColor: hex, color: lineBadgeTextColor(hex) }}>
          {style.stationNumberPrefix}
        </span>
      )}
      {!showName && !style?.stationNumberPrefix && <span className="line-mark">{style?.shortName?.[lang] ?? name}</span>}
      {label}
    </span>
  )
}
