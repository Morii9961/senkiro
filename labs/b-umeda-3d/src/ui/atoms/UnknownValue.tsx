import type { Language } from '../../domain/types'

export function UnknownValue({ lang }: { lang: Language }) {
  return (
    <span
      className="unknown-value"
      title={lang === 'ja' ? '確認できる資料がありません' : 'No verified source for this field'}
    >
      {lang === 'ja' ? '未確認' : 'Unverified'}
    </span>
  )
}
