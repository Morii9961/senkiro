import { nameIn, textIn } from './domain/language'
import { lineBadgeTextColor } from './domain/lines'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type RefObject } from 'react'
import { floors, lineStyleById, linesById, nodes, station, inSite } from './model'
import { vertical, type Step } from './domain/graph'
import { ownersOf } from './domain/index'
import type { Language, Place } from './domain/types'
import { sample } from './providers/service'
import { labelAttachment, layoutLabels, type LabelCandidate } from './scene/labels/layout'
import type { SelectionTarget } from './state/selection'
import { deriveTrackPaths } from './trains/trackPaths'
import { LineBadge } from './ui/atoms/LineBadge'
import { fitPlanBlocks, floorPlanBlocks, type PlanPanel } from './ui/planLayout'

interface Props {
  siteId: string | null
  floor: number
  lang: Language
  steps: Step[]
  active: number
  zoom: number
  reset: number
  example: boolean
  selection: SelectionTarget | null
  onInspect: (id: string) => void
  onClear: () => void
}

const tracks = deriveTrackPaths(station)
const initialView = { x: 0, y: 0, zoom: 1 }

function useSize(element: RefObject<Element | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const node = element.current!
    const resize = () => {
      const { clientWidth: width, clientHeight: height } = node
      setSize((old) => old.width === width && old.height === height ? old : { width, height })
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(node)
    return () => observer.disconnect()
  }, [element])
  return size
}

function Sheet({
  panel,
  title,
  rotate,
  baseScale,
  lang,
  zoom,
  steps,
  active,
  example,
  selection,
  selected,
  onInspect,
}: {
  panel: PlanPanel; title: string; rotate: boolean; baseScale: number; selected: Set<string>
} & Omit<Props, 'floor' | 'siteId' | 'onClear' | 'reset'>) {
  const places = panel.block.places
  const drawing = useRef<SVGSVGElement>(null)
  // The floor fit sets each panel's size. Derive the viewBox from that same fit
  // so a neighboring panel cannot recenter when its SVG is measured later.
  const viewport = { width: panel.width - 2, height: panel.height }
  const [view, setView] = useState(initialView)
  const drag = useRef({ x: 0, y: 0, originX: 0, originY: 0, active: false, moved: false })
  useEffect(() => {
    const svg = drawing.current!
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const bounds = svg.getBoundingClientRect()
      const x = event.clientX - bounds.left - bounds.width / 2
      const y = event.clientY - bounds.top - bounds.height / 2
      setView((old) => {
        const next = Math.max(0.5, Math.min(5, old.zoom * Math.exp(-event.deltaY * 0.002)))
        const ratio = next / old.zoom
        return { zoom: next, x: x + (old.x - x) * ratio, y: y + (old.y - y) * ratio }
      })
    }
    svg.addEventListener('wheel', wheel, { passive: false })
    return () => svg.removeEventListener('wheel', wheel)
  }, [])
  const turn = (x: number, z: number) => rotate ? [z, -x] : [x, z]
  const xy = (n: Place) => turn(...n.point)
  const { minX, minY, maxX, maxY } = panel.block.bounds
  const scale = baseScale * zoom * view.zoom
  const originX = viewport.width / 2 - (minX + maxX) * scale / 2 + view.x
  const originY = viewport.height / 2 - (minY + maxY) * scale / 2 + view.y
  const keys = places.filter((p) => p.kind !== 'Landing')
  const lines = [...new Set(keys.flatMap(({ serviceLineIds }) => serviceLineIds ?? []))]
    .flatMap((id) => linesById.get(id) ?? [])
  const ids = new Set(places.map((n) => n.id))
  const drawnLinks = station.links.filter(
    (e) => ids.has(e.from) || ids.has(e.to),
  )
  const routeIds = new Set(steps.map(({ link }) => link.id))
  const routePlaces = new Set(steps.flatMap(({ from, to }) => [from.id, to.id]))
  const paint = (id: string) => selected.has(id) || steps[active]?.link.id === id
    ? 'var(--route-strong, #c54815)'
    : routeIds.has(id) ? 'var(--route, #db8321)' : '#547a78'
  const select = (event: MouseEvent, id: string) => {
    event.stopPropagation()
    onInspect(id)
  }
  const markers = keys.map((place) => {
    const [x, y] = xy(place)
    return { x: x * scale + originX, y: y * scale + originY }
  })
  const labels = layoutLabels(keys.map<LabelCandidate>((place, index) => {
    const maximum = Math.min(196, viewport.width * 0.7)
    let text = ''
    let textWidth = 0
    for (const char of nameIn(place.names, lang)) {
      const glyphWidth = char.charCodeAt(0) < 128 ? 7 : 12
      if (textWidth + glyphWidth + 23 > maximum) {
        text += '…'
        textWidth += 12
        break
      }
      text += char
      textWidth += glyphWidth
    }
    return {
      ...markers[index], key: place.id, width: textWidth + 11, height: 17, text,
      level: selection?.id === place.id ? 0 : place.kind === 'Platform' ? 2 : 3,
      priority: selected.has(place.id) ? -2 : routePlaces.has(place.id) ? -1 : index / keys.length,
    }
  }).filter(({ x, y }) => x >= 0 && y >= 0 && x <= viewport.width && y <= viewport.height), viewport,
  markers.map(({ x, y }) => ({ x: x - 9, y: y - 8, width: 18, height: 16 })))
  return (
    <section className="sheet" data-plan-has-selection={keys.some(({ id }) => selected.has(id)) || undefined}>
      <div className="plan-panel-heading">
        <h3 title={title}>{title}</h3>
        <span aria-hidden="true">{rotate ? '←' : '↑'} {textIn(lang, '北', 'N', '北')}</span>
      </div>
      <svg
        ref={drawing}
        style={{ height: panel.height }}
        data-plan-scale={baseScale.toFixed(4)}
        role="img"
        aria-label={
          (textIn(lang, '模式平面図', 'Schematic floor plan', '示意平面图')) +
          ' · ' +
          title
        }
        viewBox={`0 0 ${viewport.width} ${viewport.height}`}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          drag.current = { active: true, moved: false, x: event.clientX, y: event.clientY, originX: view.x, originY: view.y }
        }}
        onPointerMove={(event) => {
          const start = drag.current
          if (!start.active || !event.buttons) return
          const dx = event.clientX - start.x
          const dy = event.clientY - start.y
          if (!start.moved && Math.hypot(dx, dy) < 4) return
          if (!start.moved) event.currentTarget.setPointerCapture(event.pointerId)
          start.moved = true
          setView((old) => ({ ...old, x: start.originX + dx, y: start.originY + dy }))
        }}
        onPointerUp={() => { drag.current.active = false }}
        onPointerCancel={() => { drag.current.active = false }}
        onClickCapture={(event) => {
          if (drag.current.moved) event.stopPropagation()
        }}
        onDoubleClick={() => setView(initialView)}
      >
        <title>{keys.map((n) => nameIn(n.names, lang)).join(' · ')}</title>
        <g data-plan-transform="" transform={`translate(${originX} ${originY}) scale(${scale})`}>
        {keys.map((n) => {
          const [x, y] = xy(n),
            [w, h] = rotate ? [n.size[1], n.size[0]] : n.size
          const colors = new Set((n.serviceLineIds ?? []).flatMap((id) => lineStyleById.get(id)?.color?.hex ?? []))
          const lineColor = colors.size === 1 ? [...colors][0] : undefined
          return (
            <g key={n.id} className="plan-object" data-plan-owner={n.id}
              data-plan-selected={selected.has(n.id)}
              data-plan-route-place={routePlaces.has(n.id) || undefined}
              onClick={(event) => select(event, n.id)}>
              <title>{nameIn(n.names, lang)}</title>
              <rect
                x={x - w / 2}
                y={y - h / 2}
                width={w}
                height={h}
                rx=".25"
                className={n.kind === 'Platform' ? 'platform' : n.zone}
              />
              {n.kind === 'Platform' && tracks.filter(({ platformId }) => platformId === n.id).map((track) => {
                const [[ax, , az], [bx, , bz]] = track.polyline
                const [x1, y1] = turn(ax, az)
                const [x2, y2] = turn(bx, bz)
                const horizontal = Math.abs(x2 - x1) > Math.abs(y2 - y1)
                return <g key={track.id} data-plan-rails="" data-line-color={lineColor ? 'known' : 'unknown'}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} className="plan-trackbed" strokeWidth=".58" stroke={lineColor} />
                  {[-0.13, 0.13].map((offset) => (
                    <line key={offset}
                      x1={x1 + (horizontal ? 0 : offset)} y1={y1 + (horizontal ? offset : 0)}
                      x2={x2 + (horizontal ? 0 : offset)} y2={y2 + (horizontal ? offset : 0)}
                      className="plan-rail" strokeWidth=".10" />
                  ))}
                </g>
              })}
            </g>
          )
        })}
        {drawnLinks.map((e) => {
          const a = nodes.get(e.from)!,
            b = nodes.get(e.to)!,
            here = ids.has(a.id),
            there = ids.has(b.id)
          const [x, y] = xy(here ? a : b),
            [ax, ay] = xy(a),
            [bx, by] = xy(b),
            col = paint(e.id)
          const linkProps = {
            'data-plan-owner': e.id,
            'data-plan-selected': selected.has(e.id),
            'data-plan-route': routeIds.has(e.id) ? e.id : undefined,
            onClick: (event: MouseEvent) => select(event, e.id),
          }
          if (vertical(e))
            return (
              <g key={e.id} {...linkProps}>
                <title>{nameIn(e.names, lang)}</title>
                <rect
                  x={x - 0.51}
                  y={y - 0.51}
                  width="1.02"
                  height="1.02"
                  fill={col}
                  stroke="#fff"
                  strokeWidth=".12"
                />
                <path d={e.kind === 'Elevator' ? `M${x - .25},${y} h.5 M${x},${y - .25} v.5`
                  : `M${x - .30},${y + .22} h.2 v-.2 h.2 v-.2 h.2`}
                  fill="none" stroke="white" strokeWidth=".09" />
              </g>
            )
          if (!here || !there) return routeIds.has(e.id) || selected.has(e.id) ? (
            <g key={e.id} {...linkProps}>
              <title>{nameIn(e.names, lang)}</title>
              <circle cx={x} cy={y} r="1.22" fill="none" stroke={col} strokeWidth=".26" />
            </g>
          ) : null
          return (
            <g key={e.id} {...linkProps}>
              <title>{nameIn(e.names, lang)}</title>
              <line
                x1={ax}
                y1={ay}
                x2={bx}
                y2={by}
                stroke={col}
                strokeWidth={
                  selected.has(e.id) || routeIds.has(e.id) ? 0.48 : 0.14
                }
              />
              <line x1={ax} y1={ay} x2={bx} y2={by} stroke="transparent" strokeWidth=".65" pointerEvents="stroke" />
              {e.kind === 'Gate' && (
                <circle
                  cx={(ax + bx) / 2}
                  cy={(ay + by) / 2}
                  r=".47"
                  fill={col}
                />
              )}
            </g>
          )
        })}
        {keys.filter(({ kind }) => kind === 'Platform' || kind === 'Entrance').map((n) => {
          const [x, y] = xy(n)
          const namedNumber = n.names.en.match(/\b\d+(?:\s*[·/]\s*\d+)?\b/)?.[0].replace(/\s*[·/]\s*/g, '·')
          const text = n.kind === 'Platform' ? n.boarding?.label ?? namedNumber ?? '•' : '↗'
          const wide = Math.max(19, 10 + text.length * 6)
          let markerWidth = wide
          const marks = (n.serviceLineIds ?? []).flatMap((id) => {
            const style = lineStyleById.get(id)
            const code = style?.stationNumberPrefix ?? style?.shortName?.[lang]
            if (!code) return []
            const width = Math.max(14, [...code].reduce((sum, char) => sum + (char.charCodeAt(0) > 127 ? 8 : 5), 4))
            const mark = { id, code, color: style?.color?.hex, width, offset: markerWidth }
            markerWidth += width + 2
            return [mark]
          })
          return (
            <g key={n.id} data-plan-marker={n.id} transform={`translate(${x} ${y}) scale(${1 / scale})`}
              onClick={(event) => select(event, n.id)}>
              <rect className="plan-track-badge" data-active={selected.has(n.id) || routePlaces.has(n.id)}
                x={-markerWidth / 2} y="-9" width={markerWidth} height="18" rx="3" />
              <text className="plan-track-number" x={-markerWidth / 2 + wide / 2} y="4">{text}</text>
              {marks.map(({ id, code, color, width, offset }) => {
                const left = -markerWidth / 2 + offset
                const line = linesById.get(id)
                return <g key={id} data-plan-line={id}>
                  {line && <title>{nameIn(line.names, lang)}</title>}
                  <rect x={left} y="-6" width={width} height="12" rx="2" fill={color ?? 'var(--line)'} />
                  <text x={left + width / 2} y="3" textAnchor="middle" fontSize="8" fontWeight="700"
                    fill={color ? lineBadgeTextColor(color) : 'var(--ink)'}>{code}</text>
                </g>
              })}
            </g>
          )
        })}
        </g>
        {labels.map(({ key, text, rect, anchor, leader }) => {
          const at = labelAttachment(rect, anchor)
          return (
            <g key={key} className="plan-caption" onClick={(event) => select(event, key)}>
              {leader && <line x1={at.x} y1={at.y} x2={anchor.x} y2={anchor.y} />}
              <rect data-plan-label={key} x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx="2.5" />
              <text x={rect.x + 5} y={rect.y + 12}>{text}</text>
            </g>
          )
        })}
      </svg>
      <details className="plan-places" onClick={(event) => event.stopPropagation()}>
      <summary>{textIn(lang, 'この図の施設', 'Places on this plan', '图中设施')}</summary>
      {lines.length > 0 && <div className="plan-lines">
        {lines.map((line) => <LineBadge key={line.id} line={line} lang={lang} size="xs" />)}
      </div>}
      <ul>
        {keys.map((n) => (
          <li key={n.id}>
            <button aria-pressed={selected.has(n.id)} onClick={(event) => select(event, n.id)}>
              {nameIn(n.names, lang)}
            </button>
            {example && n.id === sample.platformId
              ? ' · ' +
                (textIn(lang, 'サンプル', 'EXAMPLE', '示例')) +
                ' +' +
                sample.delayMinutes +
                ' min'
              : ''}
          </li>
        ))}
      </ul>
      </details>
    </section>
  )
}
export function FloorPlan(p: Props) {
  const stage = useRef<HTMLDivElement>(null)
  const viewport = useSize(stage)
  const { blocks, rotate } = useMemo(() => floorPlanBlocks(station.places.filter(
    (n) => inSite(n, p.siteId) && floors.get(n.levelId)!.ordinal === p.floor,
  ), station.links), [p.floor, p.siteId])
  const { columns, scale } = fitPlanBlocks(blocks, {
    width: Math.max(120, viewport.width - 20), height: Math.max(135, viewport.height - 34),
  })
  const selected = p.selection ? ownersOf(station, p.selection) : new Set<string>()
  const names = new Map(station.stations.map((entry) => [entry.id, nameIn(entry.names, p.lang)]))
  names.set('sk:station:jr-osaka', textIn(p.lang, 'JR 大阪駅', 'JR Osaka', 'JR 大阪站'))
  names.set('sk:station:metro-umeda', textIn(p.lang, '地下鉄 梅田駅', 'Metro Umeda', '地铁梅田站'))
  return (
    <div className="sheets" ref={stage} data-plan-north={rotate ? 'left' : 'up'} onClick={p.onClear}>
      <div className="plan-columns">
        {columns.map((column) => (
          <div className="plan-column" key={column[0].block.id} style={{ width: column[0].width }}>
            {column.map((panel) => {
              const stations = panel.block.places.flatMap(({ stationId }) => stationId ? names.get(stationId) ?? [] : [])
              const title = [...new Set(stations)].join(' · ') || (textIn(p.lang, '公共通路・地下街', 'Public passages and arcades', '公共通道与地下街'))
              return <Sheet key={panel.block.id + ':' + p.reset} {...p} {...{ panel, title, rotate, selected }} baseScale={scale} />
            })}
          </div>
        ))}
      </div>
      <div className="plan-orientation">
        <span className="plan-compass" role="img" aria-label={rotate
          ? textIn(p.lang, '模式方位、左が北', 'Schematic orientation, north to the left', '示意方向，左为北')
          : textIn(p.lang, '模式方位、上が北', 'Schematic orientation, north up', '示意方向，上为北')}>
          {rotate ? '←' : '↑'} {textIn(p.lang, '北', 'N', '北')}
        </span>
        {blocks.length > 1 && <span className="plan-block-note">{textIn(p.lang,
          '図の間の位置・距離は縮尺外', 'Spacing and positions between plans are not to scale',
          '分图之间的位置和距离为示意')}</span>}
      </div>
    </div>
  )
}
