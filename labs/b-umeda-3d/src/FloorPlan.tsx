import { floors, nodes, station, inSite } from './model'
import { vertical, type Step } from './domain/graph'
import type { Language, Place } from './domain/types'
import { sample } from './providers/service'

interface Props {
  siteId: string | null
  floor: number
  lang: Language
  steps: Step[]
  active: number
  zoom: number
  example: boolean
}
function section(n: Place, floor: number) {
  if (
    n.stationId &&
    !['sk:station:jr-osaka', 'sk:station:metro-umeda'].includes(n.stationId)
  )
    return n.stationId
  if (!n.stationId && n.zone === 'unpaid' && floor < 0) return 'public'
  if (floor === 0) return 'street'
  if (!n.stationId || n.stationId === 'sk:station:metro-umeda') return 'metro'
  if (floor === -2 && ['sk:concourse:ac-b2', 'sk:landing:ab-b2'].includes(n.id))
    return 'passage'
  return 'jr'
}
function Sheet({
  places,
  title,
  lang,
  zoom,
  steps,
  active,
  example,
}: { places: Place[]; title: string } & Omit<Props, 'floor' | 'siteId'>) {
  const xs = places.flatMap((n) => [
      n.point[0] - n.size[0] / 2,
      n.point[0] + n.size[0] / 2,
    ]),
    zs = places.flatMap((n) => [
      n.point[1] - n.size[1] / 2,
      n.point[1] + n.size[1] / 2,
    ])
  const width = Math.max(...xs) - Math.min(...xs),
    depth = Math.max(...zs) - Math.min(...zs)
  const rotate = depth > width
  const xy = (n: Place) => (rotate ? [n.point[1], -n.point[0]] : n.point)
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2,
    cz = (Math.max(...zs) + Math.min(...zs)) / 2
  const w = (Math.max(width, depth) + 6) / zoom,
    h = (Math.min(width, depth) + 5) / zoom
  const keys = places.filter((p) => p.kind !== 'Landing')
  const ids = new Set(places.map((n) => n.id))
  const drawnLinks = station.links.filter(
    (e) => ids.has(e.from) || ids.has(e.to),
  )
  const paint = (id: string) =>
    steps[active]?.link.id === id
      ? '#c54815'
      : steps.some((s) => s.link.id === id)
        ? '#db8321'
        : '#547a78'
  return (
    <section className="sheet">
      <h3>{title}</h3>
      <svg
        role="img"
        aria-label={
          (lang === 'ja' ? '模式平面図' : 'Schematic floor plan') +
          ' · ' +
          title
        }
        viewBox={[
          (rotate ? cz : cx) - w / 2,
          (rotate ? -cx : cz) - h / 2,
          w,
          h,
        ].join(' ')}
      >
        <title>{keys.map((n) => n.names[lang]).join(' · ')}</title>
        {keys.map((n) => {
          const [x, y] = xy(n),
            [w, h] = rotate ? [n.size[1], n.size[0]] : n.size
          return (
            <g key={n.id}>
              <rect
                x={x - w / 2}
                y={y - h / 2}
                width={w}
                height={h}
                rx=".25"
                className={n.kind === 'Platform' ? 'platform' : n.zone}
              />
              {n.kind === 'Platform' && (
                <path
                  d={`M${x - w / 2 + 0.2} ${y - h / 2 + 0.22}h${w - 0.4} M${x - w / 2 + 0.2} ${y + h / 2 - 0.22}h${w - 0.4}`}
                  stroke="#ffdf86"
                  strokeWidth=".15"
                />
              )}
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
          if (vertical(e))
            return (
              <g key={e.id}>
                <title>{e.names[lang]}</title>
                <rect
                  x={x - 0.51}
                  y={y - 0.51}
                  width="1.02"
                  height="1.02"
                  fill={col}
                  stroke="#fff"
                  strokeWidth=".12"
                />
              </g>
            )
          if (!here || !there) return null
          return (
            <g key={e.id}>
              <title>{e.names[lang]}</title>
              <line
                x1={ax}
                y1={ay}
                x2={bx}
                y2={by}
                stroke={col}
                strokeWidth={
                  steps.some((s) => s.link.id === e.id) ? 0.48 : 0.14
                }
              />
              {e.kind === 'Gate' && (
                <circle
                  cx={(ax + bx) / 2}
                  cy={(ay + by) / 2}
                  r=".65"
                  fill={col}
                />
              )}
            </g>
          )
        })}
        {keys.map((n, i) => {
          const [x, y] = xy(n)
          return (
            <g key={n.id} transform={`translate(${x} ${y})`}>
              <circle r=".98" fill="#233f40" />
              <text className="index-label" dy=".04em">
                {i + 1}
              </text>
            </g>
          )
        })}
      </svg>
      <ul>
        {keys.map((n, i) => (
          <li key={n.id}>
            <b>{i + 1}</b>
            {n.names[lang]}
            {example && n.id === sample.platformId
              ? ' · ' +
                (lang === 'ja' ? 'サンプル' : 'EXAMPLE') +
                ' +' +
                sample.delayMinutes +
                ' min'
              : ''}
          </li>
        ))}
      </ul>
    </section>
  )
}
export function FloorPlan(p: Props) {
  const groups = new Map<string, Place[]>()
  const title: Record<string, string> = {
    ...Object.fromEntries(station.stations.map((s) => [s.id, s.names[p.lang]])),
    public:
      p.lang === 'ja' ? '地下歩行通路・地下街' : 'Public passages & arcades',
    jr: p.lang === 'ja' ? 'JR 大阪駅' : 'JR Osaka',
    street:
      p.lang === 'ja' ? 'JR 大阪駅・地上経路' : 'JR Osaka & street crossing',
    metro: p.lang === 'ja' ? '地下鉄 梅田駅' : 'Metro Umeda',
    passage: p.lang === 'ja' ? '改札内連絡通路' : 'Paid connecting passage',
  }
  for (const n of station.places.filter(
    (n) => inSite(n, p.siteId) && floors.get(n.levelId)!.ordinal === p.floor,
  )) {
    const key = section(n, p.floor)
    groups.set(key, [...(groups.get(key) ?? []), n])
  }
  return (
    <div className="sheets">
      {[...groups.entries()].map(([id, places]) => (
        <Sheet key={id} {...p} places={places} title={title[id]} />
      ))}
    </div>
  )
}
