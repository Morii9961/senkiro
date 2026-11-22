import type { SelectionTarget } from '../../state/selection'
import type { DataNature, GeometryConfidence, PlatformUpdate, RailLine } from '../types'

export interface DetailFact {
  key: string
  label: string
  value: string | null
}

export interface DetailRelation {
  target: SelectionTarget
  label: string
  badge?: string
}

export type DetailAction = 'start' | 'end' | 'floor' | 'passenger'

export interface DetailSpec {
  target: SelectionTarget
  title: string
  subtitle: string
  chips: { lines: RailLine[]; floor: string | null; area: string | null }
  facts: DetailFact[]
  service?: { kind: 'unavailable' } | { kind: 'example'; update: PlatformUpdate }
  relations: { key: string; title: string; items: DetailRelation[]; derived?: boolean }[]
  actions: { kind: DetailAction; label: string }[]
  provenance: {
    sourceIds: string[]
    nature: DataNature
    confidence: GeometryConfidence
    missing: string[]
  }
}
