import { nameIn, textIn } from '../../domain/language'
import { useEffect, useId, useState, type RefObject } from 'react'
import type { SearchEntry, SearchGroup } from '../../domain/searchIndex'
import type { Language } from '../../domain/types'
import { LineBadge } from '../atoms/LineBadge'

const groups: { id: SearchGroup; ja: string; en: string; zh: string }[] = [
  { id: 'station', ja: '駅・地下街', en: 'Stations & arcades', zh: '车站与地下街' },
  { id: 'platform', ja: 'のりば', en: 'Platforms', zh: '站台' },
  { id: 'line', ja: '路線', en: 'Lines', zh: '线路' },
  { id: 'access', ja: '改札・出口', en: 'Gates & exits', zh: '闸机和出口' },
  { id: 'facility', ja: '設備', en: 'Facilities', zh: '设施' },
]
const icons: Record<SearchGroup, string> = { station: '▤', platform: '▰', line: '━', access: '◇', facility: '□' }
const visiblePerGroup = 5

type Props = {
  lang: Language
  search: (query: string) => SearchEntry[]
  input: RefObject<HTMLInputElement | null>
  recent: SearchEntry[]
  presets: { ja: string; en: string; zh: string }[]
  onSelect: (id: string) => void
  onEndpoint: (which: 'start' | 'end', id: string) => void
  onPreset: (index: number) => void
}

type RowProps = Pick<Props, 'lang' | 'onSelect' | 'onEndpoint'> & {
  entry: SearchEntry
  optionId?: string
  active?: boolean
}

function SearchResultRow({ lang, entry, optionId, active, onSelect, onEndpoint }: RowProps) {
  const name = nameIn(entry.names, lang)
  const context = [nameIn(entry.station, lang), entry.floor?.label, entry.zone === 'paid'
    ? (textIn(lang, '改札内', 'Inside gates', '闸机内'))
    : entry.zone === 'unpaid' ? (textIn(lang, '改札外', 'Outside gates', '闸机外')) : null].filter(Boolean)
  const endpoints = entry.endpoints
  return (
    <div className="search-row" data-search-row={entry.target.id} role={optionId ? 'presentation' : undefined}>
      <button className="search-result" type="button"
        id={optionId} role={optionId ? 'option' : undefined} aria-selected={optionId ? active : undefined}
        data-target={entry.target.kind + ':' + entry.target.id}
        onClick={() => onSelect(entry.target.id)}>
        {entry.line ? <LineBadge lang={lang} line={entry.line} showName={false} /> : (
          <span className="search-icon" aria-hidden="true">{icons[entry.group]}</span>
        )}
        <span><strong>{name}</strong>{context.length > 0 && <small>{context.join(' · ')}</small>}</span>
      </button>
      {endpoints && (
        <div className="search-endpoints">
          <button type="button" aria-label={(textIn(lang, '出発に設定 ', 'Set departure: ', '设为出发地：')) + name}
            onClick={() => onEndpoint('start', endpoints.start)}>↳{textIn(lang, '出発', 'From', '出发')}</button>
          <button type="button" aria-label={(textIn(lang, '到着に設定 ', 'Set destination: ', '设为目的地：')) + name}
            onClick={() => onEndpoint('end', endpoints.end)}>↳{textIn(lang, '到着', 'To', '到达')}</button>
        </div>
      )}
    </div>
  )
}

export function SearchPanel({ lang, search, input, recent, presets, onSelect, onEndpoint, onPreset }: Props) {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<SearchGroup[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const id = 'search-' + useId().replace(/[^a-z0-9_-]/gi, '')
  const listId = id + '-results'
  const inputId = id + '-query'
  const searching = query.trim() !== ''
  const results = searching ? search(query) : []
  const sections = groups.flatMap((group) => {
    const entries = results.filter((entry) => entry.group === group.id)
    return entries.length ? [{
      ...group, entries: expanded.includes(group.id) ? entries : entries.slice(0, visiblePerGroup),
      hasMore: entries.length > visiblePerGroup && !expanded.includes(group.id),
    }] : []
  })
  const visible = new Set(sections.flatMap(({ entries }) => entries.map((entry) => entry.target.id)))
  const navigable = results.filter((entry) => visible.has(entry.target.id))
  const active = navigable[Math.min(activeIndex, navigable.length - 1)]
  const optionId = (entry: SearchEntry) => id + '-option-' + navigable.indexOf(entry)
  const activeId = active ? optionId(active) : undefined
  const t = (ja: string, en: string, zh: string) => lang === 'zh' ? zh : lang === 'ja' ? ja : en

  useEffect(() => { input.current?.focus() }, [input])

  function update(value: string) {
    setQuery(value)
    setActiveIndex(0)
    setExpanded([])
  }

  return (
    <section className="search-panel" aria-label={t('施設検索', 'Facility search', '设施搜索')}>
      <div className="search-box">
        <label htmlFor={inputId}>{t('地点を探す', 'Find a place', '查找地点')}</label>
        <input id={inputId} ref={input} value={query} autoComplete="off" role="combobox"
          aria-expanded={navigable.length > 0} aria-controls={listId}
          aria-activedescendant={activeId} autoCorrect="off" spellCheck={false}
          placeholder={t('駅・のりば・路線・設備', 'Stations, platforms, lines, facilities', '车站、站台、线路、设施')}
          onChange={(event) => update(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === 'Escape' && query) {
              event.preventDefault()
              event.stopPropagation()
              update('')
            } else if (event.key === 'Enter' && active) {
              event.preventDefault()
              onSelect(active.target.id)
            } else if (navigable.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
              event.preventDefault()
              const i = (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + navigable.length) % navigable.length
              setActiveIndex(i)
              document.getElementById(optionId(navigable[i]))?.scrollIntoView({ block: 'nearest' })
            }
          }} />
      </div>
      <div id={listId} role="listbox" aria-label={t('検索結果', 'Search results', '搜索结果')} hidden={!navigable.length}>
        {sections.map((group) => (
          <div key={group.id} className="search-group" role="group" aria-label={group[lang]}>
            <h3>{group[lang]}</h3>
            {group.entries.map((entry) => (
              <SearchResultRow key={entry.target.id} {...{ lang, entry, onSelect, onEndpoint }}
                optionId={optionId(entry)} active={entry.target.id === active?.target.id} />
            ))}
            {group.hasMore && <button type="button" className="search-more"
              onClick={() => setExpanded([...expanded, group.id])}>{t('もっと見る', 'Show more', '查看更多')}</button>}
          </div>
        ))}
      </div>
      {!searching ? (
        <>
          {recent.length > 0 && <div className="search-group">
            <h3>{t('最近見た場所', 'Recently viewed', '最近查看')}</h3>
            {recent.map((entry) => <SearchResultRow key={entry.target.id} {...{ lang, entry, onSelect, onEndpoint }} />)}
          </div>}
          <div className="search-group search-presets" data-testid="search-presets">
            <h3>{t('よく使う経路', 'Suggested routes', '推荐路线')}</h3>
            <p>{t('編集部のプリセット', 'Editorial presets', '预设路线')}</p>
            {presets.map((preset, index) => <button type="button" key={preset.en}
              onClick={() => onPreset(index)}>{preset[lang]}</button>)}
          </div>
        </>
      ) : !results.length && (
        <p role="status" className="search-empty" data-testid="search-empty">
          {t('この名前は未収録です。', 'This name is not in the model.', '模型尚未收录此名称。')}
        </p>
      )}
    </section>
  )
}
