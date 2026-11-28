import type { Language } from '../domain/types'

const demoChinese = new Map([
  ['特急', '特急'],
  ['普通', '普通'],
  ['京都方面', '往京都'],
  ['宝塚方面', '往宝塚'],
  ['神戸方面', '往神户'],
])

export function timetableText(value: string | null, lang: Language) {
  return value && lang === 'zh' ? demoChinese.get(value) ?? value : value
}
