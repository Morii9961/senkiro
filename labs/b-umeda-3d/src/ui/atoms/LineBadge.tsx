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
    ? station.operators.find((entry) => entry.id === line.operatorId)?.names[lang]
    : null
  const name = style?.shortName?.[lang] ?? line.names[lang]
  const label = [showName ? name : null, operator].filter(Boolean).join(' · ')
  return (
    <span
      className="line-badge"
      data-size={size}
      data-line-color={hex ? 'known' : 'unknown'}
      title={hex ? line.names[lang] : unverifiedLineColor(lang)}
      aria-label={label ? undefined : line.names[lang]}
      style={hex ? { backgroundColor: hex, color: lineBadgeTextColor(hex) } : undefined}
    >
      {label}
    </span>
  )
}
