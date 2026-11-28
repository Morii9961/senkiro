import type { Language, LocalName } from './types'

export function nameIn(names: LocalName & { en: string }, lang: Language): string
export function nameIn(names: LocalName | null | undefined, lang: Language): string | undefined
export function nameIn(names: LocalName | null | undefined, lang: Language) {
  if (!names) return
  return lang === 'zh' ? names.zh ?? names.ja : names[lang] ?? undefined
}

export function textIn(lang: Language, ja: string, en: string, zh: string) {
  return lang === 'zh' ? zh : lang === 'ja' ? ja : en
}
