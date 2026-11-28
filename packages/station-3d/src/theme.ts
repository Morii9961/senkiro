/**
 * Light and dark palettes shared by the 2D plan and the 3D scene (Lab C `sceneTheme.ts`:
 * graphite dark `#262b33`, paper light). Colours are display choices, not operator colours.
 */
import type { FareZone } from '@senkiro/contracts';

export type StationTheme = 'light' | 'dark';

export interface StationPalette {
  background: string;
  panel: string;
  panelBorder: string;
  text: string;
  mutedText: string;
  unpaid: string;
  paid: string;
  platform: string;
  roadway: string;
  outline: string;
  link: string;
  gate: string;
  vertical: string;
  entrance: string;
  selection: string;
  route: string;
  railing: string;
  track: string;
  platformDoor: string;
  bufferStop: string;
  ghost: string;
}

export const STATION_PALETTES: Readonly<Record<StationTheme, StationPalette>> = {
  light: {
    background: '#f4f1ea',
    panel: '#fbfaf6',
    panelBorder: '#cfc8ba',
    text: '#1f2328',
    mutedText: '#5d6470',
    unpaid: '#e4e0d6',
    paid: '#cfe0ef',
    platform: '#b9cbe0',
    roadway: '#bdbdbd',
    outline: '#7d8794',
    link: '#6b7380',
    gate: '#c0392b',
    vertical: '#2f6f9f',
    entrance: '#2e7d4f',
    selection: '#e08a00',
    route: '#d6336c',
    railing: '#8a94a3',
    track: '#6f6a62',
    platformDoor: '#3a8f7a',
    bufferStop: '#b5452f',
    ghost: '#d9d4c8',
  },
  dark: {
    background: '#262b33',
    panel: '#2d333c',
    panelBorder: '#46505d',
    text: '#e8ebef',
    mutedText: '#a7b0bc',
    unpaid: '#3b434e',
    paid: '#34506b',
    platform: '#3f6285',
    roadway: '#4a4a4a',
    outline: '#8b97a6',
    link: '#9aa5b3',
    gate: '#ff7b6b',
    vertical: '#79b8e6',
    entrance: '#6fd39a',
    selection: '#ffb84d',
    route: '#ff6fa3',
    railing: '#9aa5b3',
    track: '#8f887d',
    platformDoor: '#5cc7ab',
    bufferStop: '#ff8a65',
    ghost: '#353c46',
  },
};

export function zoneFill(palette: StationPalette, zone: FareZone, isPlatform: boolean): string {
  if (zone === 'roadway') {
    return palette.roadway;
  }
  if (zone === 'unpaid') {
    return palette.unpaid;
  }
  return isPlatform ? palette.platform : palette.paid;
}
