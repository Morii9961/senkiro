import type { Language } from '../../domain/types'
import type { LabelDepth } from '../../scene/labels/config'

const options = [
  ['guide', '案内', 'Guide'],
  ['facility', '設備', 'Facilities'],
  ['structure', '構造', 'Structure'],
] as const

export function DetailControl({ lang, value, onChange }: {
  lang: Language
  value: LabelDepth
  onChange: (detail: LabelDepth) => void
}) {
  return (
    <div className="seg detail-control" role="group" aria-label={lang === 'ja' ? '表示の深さ' : 'Detail level'}>
      {options.map(([mode, ja, en]) => (
        <button key={mode} aria-pressed={value === mode} onClick={() => onChange(mode)}>
          {lang === 'ja' ? ja : en}
        </button>
      ))}
    </div>
  )
}
