import { nodes, sites, station } from '../model'

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

const linkKinds = new Map(
  station.links.map(({ id, kind }) => [
    id,
    kind === 'Gate' ? 'gate' : kind === 'Passage' ? 'passage' : 'vertical',
  ] as const),
)

export function targetFromOwner(id: string): SelectionTarget | null {
  const place = nodes.get(id)
  switch (place?.kind) {
    case 'Platform':
      return { kind: 'platform', id }
    case 'Entrance':
      return { kind: 'entrance', id }
    case 'Concourse':
      return { kind: 'concourse', id }
    case 'Landing':
      return null
  }
  const kind = linkKinds.get(id)
  if (kind) return { kind, id }
  return sites.some((site) => site.id === id) || station.stations.some((site) => site.id === id)
    ? { kind: 'station', id }
    : null
}
