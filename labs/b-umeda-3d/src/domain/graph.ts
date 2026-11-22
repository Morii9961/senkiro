import type { Entity, Link, Model, Place } from './types.ts'
export const vertical = (link: Link) =>
  ['Elevator', 'Stairs', 'Escalator'].includes(link.kind)
export function entities(m: Model): Entity[] {
  return [
    ...m.operators,
    ...m.stations,
    ...m.lines,
    m.complex,
    ...(m.interchange ? [m.interchange] : []),
    ...m.levels,
    ...m.places,
    ...m.links,
    ...m.context,
  ]
}
export function validate(m: Model, sources: Set<string>) {
  const ids = new Set<string>()
  for (const e of entities(m)) {
    if (!/^sk:[a-z]+:[a-z0-9-]+$/.test(e.id) || ids.has(e.id))
      throw Error('Invalid or duplicate ID ' + e.id)
    ids.add(e.id)
    if (
      !e.provenance.sourceIds.length ||
      e.provenance.sourceIds.some((id) => !sources.has(id))
    )
      throw Error('Missing source ' + e.id)
  }
  const levels = new Map(m.levels.map((l) => [l.id, l]))
  const stations = new Map(m.stations.map((s) => [s.id, s]))
  const nodes = new Map(m.places.map((p) => [p.id, p]))
  const lines = new Map(m.lines.map((l) => [l.id, l]))
  for (const station of m.stations) {
    if (
      !m.operators.some((o) => o.id === station.operatorId) ||
      station.lineIds.some(
        (id) => lines.get(id)?.operatorId !== station.operatorId,
      )
    )
      throw Error('Invalid station operator or line ' + station.id)
  }
  if (m.complex.stationIds.some((id) => !stations.has(id)))
    throw Error('Unknown complex member')
  if (
    m.interchange &&
    m.interchange.stationIds.some((id) => !m.complex.stationIds.includes(id))
  )
    throw Error('Unknown interchange member')
  for (const p of m.places) {
    if (
      p.serviceLineIds?.some(
        (id) => !stations.get(p.stationId ?? '')?.lineIds.includes(id),
      )
    )
      throw Error('Unknown platform service ' + p.id)
    if (!p.point.every(Number.isFinite) || !p.size.every((v) => v > 0))
      throw Error('Invalid schematic footprint ' + p.id)
    if (
      !levels.has(p.levelId) ||
      levels.get(p.levelId)?.stationId !== p.stationId
    )
      throw Error('Invalid level ' + p.id)
    if (
      p.zone === 'paid'
        ? !stations.has(p.stationId ?? '') || p.manager !== null
        : !p.manager
    )
      throw Error('Invalid area ' + p.id)
  }
  for (const area of m.context) {
    const anchor = nodes.get(area.anchorId)
    if (
      !anchor ||
      anchor.stationId !== area.stationId ||
      (area.kind === 'Station') !== !!area.stationId
    )
      throw Error('Invalid district anchor ' + area.id)
    if (
      area.kind === 'ShoppingArcade' &&
      (anchor.zone !== 'unpaid' || anchor.manager !== 'commercial')
    )
      throw Error('Invalid shopping arcade ' + area.id)
  }
  for (const e of m.links) {
    const a = nodes.get(e.from),
      b = nodes.get(e.to)
    if (!a || !b) throw Error('Missing endpoint ' + e.id)
    const delta = Math.abs(
      levels.get(a.levelId)!.ordinal - levels.get(b.levelId)!.ordinal,
    )
    if (delta > 0 !== vertical(e)) throw Error('Invalid level change ' + e.id)
    const low = Math.min(
      levels.get(a.levelId)!.ordinal,
      levels.get(b.levelId)!.ordinal,
    )
    const skipsLevel = m.levels.some(
      (l) =>
        l.stationId === a.stationId &&
        l.ordinal > low &&
        l.ordinal < low + delta,
    )
    if (
      (delta > 1 || skipsLevel) &&
      !(
        e.declaredSpan?.includes(a.levelId) &&
        e.declaredSpan.includes(b.levelId)
      )
    )
      throw Error('Undeclared span ' + e.id)
    if (a.zone !== b.zone && e.kind !== 'Gate')
      throw Error('Fare boundary ' + e.id)
    const operatorsDiffer =
      stations.get(a.stationId ?? '')?.operatorId !==
      stations.get(b.stationId ?? '')?.operatorId
    if (a.zone === 'paid' && b.zone === 'paid' && operatorsDiffer)
      throw Error('No verified transfer gate ' + e.id)
    if (e.kind === 'Gate' && (a.zone === b.zone || e.connection !== 'verified'))
      throw Error('Invalid gate ' + e.id)
  }
}
export interface Step {
  link: Link
  from: Place
  to: Place
}
export function cost(steps: Step[]) {
  return {
    gates: steps.filter((s) => s.link.kind === 'Gate').length,
    changes: steps.filter((s) => vertical(s.link)).length,
    segments: steps.length,
  }
}
function compare(a: Step[], b: Step[]) {
  const x = cost(a),
    y = cost(b)
  return x.gates - y.gates || x.changes - y.changes || x.segments - y.segments
}

export function nextPlaceId(link: Link, at: string, liftsOnly = false) {
  if (link.connection !== 'verified' || link.direction === 'unknown' ||
    (liftsOnly && link.stepFree !== true)) return null
  if (link.from === at) return link.to
  return link.to === at && link.direction === 'both' ? link.from : null
}

export function route(
  m: Model,
  start: string,
  end: string,
  liftsOnly = false,
): Step[] | null {
  const nodes = new Map(m.places.map((p) => [p.id, p]))
  if (!nodes.has(start) || !nodes.has(end)) return null
  const queue: { at: string; steps: Step[] }[] = [{ at: start, steps: [] }]
  const seen = new Set<string>()
  while (queue.length) {
    queue.sort((a, b) => compare(a.steps, b.steps))
    const { at, steps } = queue.shift()!
    if (at === end) return steps
    if (seen.has(at)) continue
    seen.add(at)
    for (const link of m.links) {
      const next = nextPlaceId(link, at, liftsOnly)
      if (next && !seen.has(next))
        queue.push({
          at: next,
          steps: [
            ...steps,
            { link, from: nodes.get(at)!, to: nodes.get(next)! },
          ],
        })
    }
  }
  return null
}
