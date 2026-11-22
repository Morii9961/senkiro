import { linesById, nodes, sites, station } from '../model'
import { linkTarget, placeTarget } from '../domain/index'

export type SelectionKind =
  | 'station'
  | 'platform'
  | 'gate'
  | 'entrance'
  | 'passage'
  | 'vertical'
  | 'concourse'
  | 'line'
  | 'train'

export type SelectionTarget = { kind: SelectionKind; id: string }

type SelectionState = {
  selection: SelectionTarget | null
  hovered: SelectionTarget | null
}

type Action =
  | { type: 'select'; target: SelectionTarget }
  | { type: 'clear' }
  | { type: 'hover'; target: SelectionTarget | null }

export const initialSelection: SelectionState = { selection: null, hovered: null }

export function selectionReducer(state: SelectionState, action: Action): SelectionState {
  switch (action.type) {
    case 'select':
      return state.selection?.id === action.target.id
        ? state
        : { ...state, selection: action.target }
    case 'clear':
      return state.selection ? { ...state, selection: null } : state
    case 'hover':
      return state.hovered?.id === action.target?.id
        ? state
        : { ...state, hovered: action.target }
  }
}

const links = new Map(station.links.map((link) => [link.id, link]))

export function targetFromOwner(id: string): SelectionTarget | null {
  const place = nodes.get(id)
  if (place) return placeTarget(place)
  const link = links.get(id)
  if (link) return linkTarget(link)
  if (linesById.has(id)) return { kind: 'line', id }
  return sites.some((site) => site.id === id) || station.stations.some((site) => site.id === id)
    ? { kind: 'station', id }
    : null
}
