export interface Point {
  x: number
  y: number
}

export interface Rect extends Point {
  width: number
  height: number
}

export interface LabelCandidate extends Rect {
  key: string
  level: 0 | 1 | 2 | 3 | 4
  priority: number
  rank?: number
  previous?: boolean
  preferred?: Rect
  occluded?: boolean
  meaning?: string
  clusterKey?: string
  clusterOnly?: boolean
  number?: number
  members?: string[]
  text?: string
}

export interface PlacedLabel {
  key: string
  anchor: Point
  rect: Rect
  distance: number
  leader: boolean
  edge: boolean
  occluded: boolean
  members?: string[]
  text?: string
}

const MARGIN = 8
const LABEL_GAP = 4
const MAX_CLAMP = 24
const LEADER_THRESHOLD = 12
const SAME_MEANING_PX = 32
export const MAX_LEADER = 48

export function overlaps(a: Rect, b: Rect, gap = 0) {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap && a.y + a.height + gap > b.y
}

const bound = (value: number, low: number, high: number) => Math.max(low, Math.min(value, high))

export function labelAttachment(rect: Rect, anchor: Point): Point {
  return {
    x: bound(anchor.x, rect.x, rect.x + rect.width),
    y: bound(anchor.y, rect.y, rect.y + rect.height),
  }
}

function positions({ x, y, width, height }: LabelCandidate): Rect[] {
  return [
    { x: x - width / 2, y: y - height },
    ...[16, 24, 32, 40].flatMap((gap) => [
      { x: x + gap, y: y - height / 2 },
      { x: x - width - gap, y: y - height / 2 },
      { x: x - width / 2, y: y + gap },
      { x: x + gap, y: y - height - gap },
      { x: x - width - gap, y: y - height - gap },
      { x: x + gap, y: y + gap },
      { x: x - width - gap, y: y + gap },
    ]),
  ].map((point) => ({ ...point, width, height }))
}

function cluster(candidates: LabelCandidate[]): LabelCandidate[] {
  const pending = new Set(candidates)
  const result: LabelCandidate[] = []
  for (const first of candidates) {
    if (!pending.delete(first)) continue
    if (!first.clusterKey || first.level === 0) {
      result.push(first)
      continue
    }
    const group = [first]
    for (let i = 0; i < group.length; i++) {
      const { x, y, width, height } = group[i]
      const preferred = { x: x - width / 2, y: y - height, width, height }
      for (const next of pending) {
        const nearby = { x: next.x - next.width / 2, y: next.y - next.height, width: next.width, height: next.height }
        if (next.level !== 0 && next.clusterKey === first.clusterKey &&
          overlaps(preferred, nearby, LABEL_GAP)) {
          pending.delete(next)
          group.push(next)
        }
      }
    }
    if (group.length < 4) {
      result.push(...group)
      continue
    }
    const numbers = group.flatMap((label) => label.number ?? [])
    const text = numbers.length === group.length
      ? Math.min(...numbers) + '–' + Math.max(...numbers)
      : '+' + group.length
    const members = group.map((label) => label.key).sort()
    result.push({
      ...first,
      key: 'cluster:' + members.join(','),
      members,
      text,
      x: group.reduce((sum, label) => sum + label.x, 0) / group.length,
      y: group.reduce((sum, label) => sum + label.y, 0) / group.length,
      width: Math.max(34, text.length * 8 + 10),
      meaning: undefined,
    })
  }
  return result
}

export function layoutLabels(
  candidates: LabelCandidate[],
  viewport: { width: number; height: number },
  reserved: Rect[] = [],
): PlacedLabel[] {
  const { width, height } = viewport
  const budget = Math.min(40, Math.floor(width * height / 10_000))
  const visible: PlacedLabel[] = []
  const meanings = new Map<string, Point[]>()
  let ordinaryCount = 0
  const eligible = candidates.filter((label) => label.level === 0 || !label.occluded)
  const priority = (label: LabelCandidate) => label.priority - (label.previous ? 0.25 : 0)
  const ranked = cluster(eligible).filter((label) => !label.clusterOnly || label.members)
    .sort((a, b) => (a.rank ?? a.level) - (b.rank ?? b.level) || priority(a) - priority(b))
  for (const label of ranked) {
    const mandatory = label.level === 0
    if (!mandatory && ordinaryCount >= budget) continue
    const anchor = { x: label.x, y: label.y }
    const equivalents = label.meaning ? meanings.get(label.meaning) ?? [] : []
    if (!mandatory && equivalents.some((other) =>
      Math.hypot(other.x - anchor.x, other.y - anchor.y) < SAME_MEANING_PX,
    )) continue
    let fallback: PlacedLabel | undefined
    let chosen: PlacedLabel | undefined
    const preferred = label.preferred
    const candidates = positions(label)
    if (preferred) candidates.unshift({ ...preferred, width: label.width, height: label.height })
    for (const position of candidates) {
      const rect = {
        ...position,
        x: bound(position.x, MARGIN, width - MARGIN - position.width),
        y: bound(position.y, MARGIN, height - MARGIN - position.height),
      }
      const clamped = Math.hypot(position.x - rect.x, position.y - rect.y)
      const at = labelAttachment(rect, anchor)
      const distance = Math.hypot(at.x - anchor.x, at.y - anchor.y)
      const result: PlacedLabel = {
        key: label.key, anchor, rect, distance,
        leader: distance > LEADER_THRESHOLD && distance <= MAX_LEADER,
        edge: mandatory && clamped > MAX_CLAMP,
        occluded: !!label.occluded,
        members: label.members,
        text: label.text,
      }
      if (mandatory && (!fallback || distance < fallback.distance)) fallback = result
      if ((!mandatory && (clamped > MAX_CLAMP || distance > MAX_LEADER)) ||
        reserved.some((rectToAvoid) => overlaps(rect, rectToAvoid, LABEL_GAP)) ||
        visible.some((other) => overlaps(rect, other.rect, LABEL_GAP))) continue
      chosen = result
      break
    }
    const placed = chosen ?? fallback
    if (!placed) continue
    visible.push(placed)
    if (!mandatory) ordinaryCount++
    if (label.meaning) meanings.set(label.meaning, [...equivalents, anchor])
  }
  return visible
}
