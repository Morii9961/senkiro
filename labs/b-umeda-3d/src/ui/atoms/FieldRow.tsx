import type { DetailFact } from '../../domain/describe/types'
import type { Language } from '../../domain/types'
import { UnknownValue } from './UnknownValue'

export function FieldRow({ fact, lang }: { fact: DetailFact; lang: Language }) {
  return (
    <div className="field-row" data-field={fact.key}>
      <dt>{fact.label}</dt>
      <dd>{fact.value ?? <UnknownValue lang={lang} />}</dd>
    </div>
  )
}
