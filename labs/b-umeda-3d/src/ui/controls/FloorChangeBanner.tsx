import { useEffect, useState } from 'react'
import type { Language } from '../../domain/types'

export function FloorChangeBanner({ down, label, lang }: { down: boolean; label: string; lang: Language }) {
  const [shown, setShown] = useState(true)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setTimeout(() => setShown(false), 2000)
    return () => window.clearTimeout(timer)
  }, [])
  if (!shown) return null
  return (
    <div className="floor-change-banner" role="status" data-testid="floor-change-banner">
      {down ? '▼' : '▲'} {label}{lang === 'ja' ? ' へ' : ''}
    </div>
  )
}
