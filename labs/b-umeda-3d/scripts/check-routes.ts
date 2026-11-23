import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { model } from '../data/manual/model.ts'
import { sources } from '../data/manual/sources.ts'
import { nextPlaceId, planRoute, validate, vertical, type RouteFailure, type RoutePlan } from '../src/domain/graph.ts'
import type { Model, Place } from '../src/domain/types.ts'
import { routeBands } from '../src/scene/route3d.ts'

export function inspectRouteCoverage(graph: Model, sourceIds: Set<string>) {
  const count = () => ({ checked: 0, planned: 0, noPath: 0, blocked: 0 })
  const report = {
    endpointCount: graph.places.length,
    verticalCount: graph.links.filter(vertical).length,
    ordinary: count(),
    stepFree: count(),
    failures: [] as string[],
  }
  try {
    validate(graph, sourceIds)
  } catch (error) {
    report.failures.push(error instanceof Error ? error.message : String(error))
    return report
  }

  const endpoints = graph.places.map(({ id }) => id)
  const knownLinks = new Map(graph.links.map((link) => [link.id, link]))
  const ordinals = new Map(graph.levels.map((level) => [level.id, level.ordinal]))
  const ordinal = (place: Place) => ordinals.get(place.levelId)!

  const reachableFrom = (liftsOnly: boolean) => {
    const adjacency = new Map(endpoints.map((id) => [id, [] as string[]]))
    for (const link of graph.links) {
      for (const from of [link.from, link.to]) {
        const to = nextPlaceId(link, from, liftsOnly)
        if (to) adjacency.get(from)!.push(to)
      }
    }
    return (start: string) => {
      const visited = new Set([start])
      for (const point of visited) for (const next of adjacency.get(point)!) visited.add(next)
      return visited
    }
  }
  const ordinaryReachable = reachableFrom(false)
  const stepFreeReachable = reachableFrom(true)

  function check(start: string, end: string, plan: RoutePlan | RouteFailure, liftsOnly: boolean, reachable: boolean) {
    const totals = liftsOnly ? report.stepFree : report.ordinary
    totals.checked++
    const key = (liftsOnly ? 'step-free' : 'ordinary') + ' ' + start + ' → ' + end + ': '
    if ('reason' in plan) {
      if (reachable) report.failures.push(key + 'a reachable endpoint was reported unavailable')
      if (plan.reason === 'no-path') totals.noPath++
      else totals.blocked++
      return
    }
    totals.planned++
    if (!reachable) report.failures.push(key + 'a route was returned for a disconnected endpoint')
    let current = start
    for (const { link, from, to } of plan.steps) {
      const registered = knownLinks.get(link.id)
      if (registered !== link || link.connection !== 'verified' || current !== from.id ||
          nextPlaceId(link, from.id, liftsOnly) !== to.id) {
        report.failures.push(key + 'invalid or disconnected step ' + link.id)
      }
      current = to.id
    }
    if (current !== end) report.failures.push(key + 'the route ends at ' + current)
    if (plan.distanceMeters !== null || plan.durationSeconds !== null) {
      report.failures.push(key + 'an unmeasured quantity was returned')
    }
    const rendered = routeBands(plan.steps, { ordinal, visible: () => true, gap: 5, active: -1 })
    if (rendered.length !== plan.steps.length ||
        rendered.some(({ linkId }, index) => linkId !== plan.steps[index]?.link.id)) {
      report.failures.push(key + 'the 3D draw list differs from the planned link sequence')
    }
  }

  for (const start of endpoints) {
    const ordinaryDestinations = ordinaryReachable(start)
    const stepFreeDestinations = stepFreeReachable(start)
    for (const end of endpoints) {
      const ordinary = planRoute(graph, start, end)
      const stepFree = planRoute(graph, start, end, { stepFreeOnly: true })
      check(start, end, ordinary, false, ordinaryDestinations.has(end))
      check(start, end, stepFree, true, stepFreeDestinations.has(end))
      if ('reason' in stepFree && 'steps' in ordinary) {
        const firstBlocking = ordinary.steps.find(({ link }) => link.stepFree !== true)?.link.id
        if (stepFree.reason !== 'step-free-blocked' || stepFree.firstBlockingLinkId !== firstBlocking) {
          report.failures.push('step-free ' + start + ' → ' + end + ': missing or incorrect first blocking link')
        }
      }
    }
  }
  return report
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = inspectRouteCoverage(model, new Set(sources.map(({ id }) => id)))
  console.log('Route coverage for ' + report.endpointCount + ' endpoints and ' + report.verticalCount + ' vertical links')
  for (const [mode, totals] of [['Ordinary', report.ordinary], ['Step-free', report.stepFree]] as const) {
    console.log(mode + ': ' + totals.checked + ' ordered pairs, ' + totals.planned + ' planned, ' +
      totals.noPath + ' disconnected, ' + totals.blocked + ' blocked')
  }
  for (const failure of report.failures) console.error(failure)
  console.log('Invariant failures: ' + report.failures.length)
  if (report.failures.length) process.exitCode = 1
}
