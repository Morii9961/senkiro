import type { Language } from '../../domain/types'

interface Props {
  lang: Language
  dark: boolean
  drawer: boolean
  onDrawer: () => void
  onHelp: () => void
  onTheme: () => void
  onLanguage: () => void
}

export function AppHeader({ lang, dark, drawer, onDrawer, onHelp, onTheme, onLanguage }: Props) {
  const t = (ja: string, en: string) => (lang === 'ja' ? ja : en)
  return (
    <header>
      <div className="signature">
        SENKIRO <span>Lab</span>
      </div>
      <span className="head-divider" />{' '}
      <h1 className="header-title">Umeda Station 3D</h1>
      <div className="header-actions">
        <button
          className="map-menu"
          aria-expanded={drawer}
          onClick={onDrawer}
        >
          {t('経路・施設', 'Routes & places')}
        </button>
        <button
          onClick={onHelp}
          aria-label={t('操作説明', 'Controls')}
        >
          ?
        </button>
        <button
          aria-label={t('配色を切り替える', 'Toggle theme')}
          onClick={onTheme}
        >
          {dark ? '☀' : '◐'}
        </button>
        <button
          onClick={onLanguage}
        >
          {lang === 'ja' ? 'EN' : '日本語'}
        </button>
      </div>
    </header>
  )
}
