import type { DataNature } from '../../src/domain/types.ts'

export interface LineStyle {
  lineId: string
  color: { hex: string; sourceIds: string[]; dataNature: DataNature } | null
  stationNumberPrefix: string | null
  shortName: { ja: string; en: string } | null
  kind: 'jr' | 'subway' | 'private' | 'other'
}

const neutral = (id: string, kind: LineStyle['kind']): LineStyle => ({
  lineId: 'sk:line:' + id,
  kind,
  color: null,
  stationNumberPrefix: null,
  shortName: null,
})

export const lineStyles: LineStyle[] = [
  neutral('midosuji', 'subway'),
  neutral('hk-kyoto', 'private'),
  neutral('hk-takarazuka', 'private'),
  neutral('hk-kobe', 'private'),
  neutral('hs-main', 'private'),
  neutral('tanimachi', 'subway'),
  neutral('jr-tozai', 'jr'),
  neutral('yotsubashi', 'subway'),
  neutral('loop', 'jr'),
  neutral('kobe', 'jr'),
  neutral('kyoto', 'jr'),
  neutral('east', 'jr'),
]
