import { textIn } from '../../domain/language'
import type { Language } from '../../domain/types'

export function UnknownValue({ lang }: { lang: Language }) {
  return (
    <span
      className="unknown-value"
      title={textIn(lang, '確認できる資料がありません', 'No verified source for this field', '暂无可核实的资料')}
    >
      {textIn(lang, '未確認', 'Unverified', '未核实')}
    </span>
  )
}
