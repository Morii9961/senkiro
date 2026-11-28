import type { Language } from '../../domain/types'

interface Props {
  lang: Language
  dark: boolean
  drawer: boolean
  plan: boolean
  onDrawer: () => void
  onHelp: () => void
  onTheme: () => void
  onLanguage: (lang: Language) => void
  onPlan: (plan: boolean) => void
}

export function AppHeader({ lang, dark, drawer, plan, onDrawer, onHelp, onTheme, onLanguage, onPlan }: Props) {
  const t = (ja: string, en: string, zh: string) => lang === 'zh' ? zh : lang === 'ja' ? ja : en
  return (
    <header>
      <div className="signature">
        SENKIRO <span>Lab</span>
      </div>
      <span className="head-divider" />{' '}
      <h1 className="header-title">{t('Umeda Station 3D', 'Umeda Station 3D', '梅田站 3D')}</h1>
      <div className="header-actions">
        <div className="seg view-mode" role="group" aria-label={t('表示形式', 'Map view', '地图视图')}>
          <button aria-pressed={!plan} onClick={() => onPlan(false)}>3D</button>
          <button aria-pressed={plan} onClick={() => onPlan(true)}>2D</button>
        </div>
        <button
          className="map-menu"
          aria-expanded={drawer}
          onClick={onDrawer}
        >
          {t('経路・施設', 'Routes & places', '路线与设施')}
        </button>
        <button
          onClick={onHelp}
          aria-label={t('操作説明', 'Controls', '操作说明')}
        >
          ?
        </button>
        <button
          aria-label={t('配色を切り替える', 'Toggle theme', '切换主题')}
          onClick={onTheme}
        >
          {dark ? '☀' : '◐'}
        </button>
        <select className="language-select" aria-label={t('言語', 'Language', '语言')} value={lang}
          onChange={(event) => onLanguage(event.target.value as Language)}>
          <option value="ja" lang="ja">日本語</option>
          <option value="en" lang="en">EN</option>
          <option value="zh" lang="zh">中文</option>
        </select>
      </div>
    </header>
  )
}
