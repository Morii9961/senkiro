import type { SelectionTarget } from '../state/selection'
import type { Model } from './types'

export function ownersOf(model: Model, target: SelectionTarget): Set<string> {
  if (target.kind === 'line') {
    return new Set(
      model.places
        .filter((place) => place.kind === 'Platform' && place.serviceLineIds?.includes(target.id))
        .map((place) => place.id),
    )
  }
  if (target.kind !== 'station') return new Set([target.id])

  const context = model.context.find((site) => site.id === target.id)
  const stationId = context ? context.stationId : target.id
  // Arcades use their site slug in the concourse IDs, as in the district model.
  const arcadePrefix = 'sk:concourse:' + target.id.split(':').at(-1) + '-'
  const places = new Set(
    model.places
      .filter((place) => stationId
        ? place.stationId === stationId
        : place.id === context?.anchorId || place.id.startsWith(arcadePrefix))
      .map((place) => place.id),
  )
  const owners = new Set(places)
  for (const link of model.links) {
    if (places.has(link.from) || places.has(link.to)) owners.add(link.id)
  }
  return owners
}
