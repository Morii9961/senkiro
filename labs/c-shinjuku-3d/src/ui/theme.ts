/**
 * Colours for the drawing. The look is a drafting sheet: paper, ink lines,
 * flat tints. These are this prototype's own colours — they do not reproduce
 * any operator's map palette, signage or line symbols.
 */
export type ThemeName = 'light' | 'dark';

export interface Palette {
  background: string;
  grid: string;
  ink: string;
  shell: string;
  paidJr: string;
  paidKeio: string;
  unpaid: string;
  platform: string;
  platformEdge: string;
  gate: string;
  gateTransfer: string;
  entrance: string;
  elevator: string;
  stairs: string;
  escalator: string;
  block: string;
  link: string;
  route: string;
  routeHalo: string;
  selected: string;
  statusNormal: string;
  statusDelayed: string;
  statusSuspended: string;
  statusUnknown: string;
}

export const PALETTES: Record<ThemeName, Palette> = {
  light: {
    background: '#efece4',
    grid: '#d9d4c7',
    ink: '#1d2733',
    shell: '#8b97a6',
    paidJr: '#bcd6d2',
    paidKeio: '#d9c3dc',
    unpaid: '#ead9b0',
    platform: '#c9d3df',
    platformEdge: '#5f7186',
    gate: '#1f6f78',
    gateTransfer: '#7a4b8f',
    entrance: '#b3661d',
    elevator: '#2c63b8',
    stairs: '#59636f',
    escalator: '#8a7a3c',
    block: '#9a9a9a',
    link: '#6c7a89',
    route: '#e23d1b',
    routeHalo: '#ffffff',
    selected: '#0a58ff',
    statusNormal: '#2f8f5b',
    statusDelayed: '#d98a00',
    statusSuspended: '#c62f3b',
    statusUnknown: '#8a8f98',
  },
  dark: {
    background: '#12161c',
    grid: '#232a34',
    ink: '#e6ebf2',
    shell: '#5d6b7c',
    paidJr: '#2f5a5c',
    paidKeio: '#5a3f63',
    unpaid: '#5c5033',
    platform: '#3a4656',
    platformEdge: '#9fb1c6',
    gate: '#58c7cf',
    gateTransfer: '#c49ad6',
    entrance: '#f0a45a',
    elevator: '#6fa4f5',
    stairs: '#a2adba',
    escalator: '#cdb968',
    block: '#6f7680',
    link: '#8795a6',
    route: '#ff6a3d',
    routeHalo: '#12161c',
    selected: '#7fb0ff',
    statusNormal: '#55c98a',
    statusDelayed: '#f2b33d',
    statusSuspended: '#ff6b76',
    statusUnknown: '#8e96a3',
  },
};

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

export function mix(a: string, b: string, k: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const c = (x: number, y: number) =>
    Math.round((x + (y - x) * k) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`;
}
