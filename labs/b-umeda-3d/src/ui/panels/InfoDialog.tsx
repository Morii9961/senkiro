import type { Language } from '../../domain/types'
import records from '../../../data/sources.json'

interface Props {
  lang: Language
  dialog: 'help' | 'sources'
  close: () => void
}

export function InfoDialog({ lang, dialog, close }: Props) {
  const t = (ja: string, en: string, zh: string) => lang === 'zh' ? zh : lang === 'ja' ? ja : en
  return (
    <dialog
      ref={(el) => {
        if (el && !el.open) el.showModal()
      }}
      onCancel={close}
    >
      <div className="dialog-head">
        <h2>
          {dialog === 'sources'
            ? t('参照資料', 'Sources', '参考资料')
            : t('操作説明', 'Controls', '操作说明')}
        </h2>
        <button
          autoFocus
          onClick={close}
          aria-label={t('閉じる', 'Close', '关闭')}
        >
          ×
        </button>
      </div>
      {dialog === 'sources' ? (
        <>
          <p>
            {t('構内図・乗換経路', 'Station plans and transfer guides', '站内图与换乘指南')}
          </p>
          {records
            .filter((r) =>
              [
                'sk:source:jr-map',
                'sk:source:metro-access',
                'sk:source:city-b',
                'sk:source:district-def',
                'sk:source:district-ghi',
                'sk:source:hankyu-current',
                'sk:source:hanshin-map',
                'sk:source:higashi-map',
                'sk:source:nishi',
                'sk:source:kitashinchi',
                'sk:source:whity-district',
              ].includes(r.id),
            )
            .map((r) => (
              <p key={r.id}>
                <a href={r.url!} target="_blank" rel="noreferrer">
                  {r.publisher} · {r.title} ↗
                </a>
                <br />
                {r.sourceDate ??
                  t('資料日不明', 'Publication date unknown', '发布日期未知')}{' '}
                · {t('確認', 'Checked', '核对日期')} {r.retrievedAt}
              </p>
            ))}
        </>
      ) : (
        <p>
          {t(
            'ホームや設備をクリックして詳細を表示。左ドラッグで回転、右または中ドラッグで平行移動、ホイールで拡大・縮小。タッチは１本で回転、２本で移動・拡縮。図をフォーカスして矢印で移動、＋／−で拡縮、Rで視点を戻せます。',
            'Click a platform or facility for details. Drag to orbit. Right or middle drag to pan. Scroll to zoom. On touch, use one finger to rotate or two to pan and pinch. Focus the canvas for arrow-key pan, + / − zoom and R to reset.', '点击站台或设施查看详情。左键拖动旋转，右键或中键拖动平移，滚轮缩放。触屏可单指旋转、双指平移和缩放。聚焦画布后可用方向键移动、＋／− 缩放、R 重置。',
          )}
        </p>
      )}
    </dialog>
  )
}
