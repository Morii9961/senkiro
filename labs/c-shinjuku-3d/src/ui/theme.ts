/**
 * Colours of the model. V2 reads as an architectural cutaway model: neutral
 * floors and walls, a few semantic accents, and one loud colour kept for the
 * route. These are this prototype's own colours — they do not reproduce any
 * operator's map palette or signage.
 */
export type ThemeName = 'light' | 'dark';

export interface Palette {
  background: string;
  ink: string;
  /** Faint plate under each floor. */
  shell: string;
  floorUnpaid: string;
  /** Paid floors, tinted per operator so that fare zones can be told apart. */
  floorPaid: Record<string, string>;
  floorPaidDefault: string;
  wall: string;
  platform: string;
  platformEdge: string;
  tactile: string;
  trackBed: string;
  rail: string;
  column: string;
  stairs: string;
  stairsSide: string;
  escalator: string;
  escalatorSide: string;
  handrail: string;
  elevatorGlass: string;
  elevatorFrame: string;
  elevator: string;
  gateBody: string;
  gate: string;
  gateTransfer: string;
  entrance: string;
  block: string;
  link: string;
  route: string;
  routeDim: string;
  routeHalo: string;
  selected: string;
  shadow: string;
  statusNormal: string;
  statusDelayed: string;
  statusSuspended: string;
  statusUnknown: string;
}

export const PALETTES: Record<ThemeName, Palette> = {
  light: {
    background: '#eceae5',
    ink: '#1d2733',
    shell: '#8f99a5',
    floorUnpaid: '#e2d5b7',
    floorPaid: {
      'jr-east': '#bfd8cf',
      keio: '#d8c6de',
      odakyu: '#c2d0ea',
      'tokyo-metro': '#eac6c1',
      toei: '#cde1bd',
    },
    floorPaidDefault: '#ccd4dc',
    wall: '#f8f7f3',
    platform: '#c9ced5',
    platformEdge: '#f7f7f4',
    tactile: '#e3c04b',
    trackBed: '#8f8b84',
    rail: '#4d535b',
    column: '#eceae4',
    stairs: '#c4c8ce',
    stairsSide: '#8e96a0',
    escalator: '#474d55',
    escalatorSide: '#9fb6c6',
    handrail: '#22262b',
    elevatorGlass: '#a9cfe6',
    elevatorFrame: '#6c7681',
    elevator: '#2c63b8',
    gateBody: '#6a7480',
    gate: '#18808a',
    gateTransfer: '#8250a0',
    entrance: '#c06a18',
    block: '#9a9a9a',
    link: '#6c7a89',
    route: '#f0401c',
    routeDim: '#f3a08c',
    routeHalo: '#ffffff',
    selected: '#0a58ff',
    shadow: '#2a2f36',
    statusNormal: '#2f8f5b',
    statusDelayed: '#d98a00',
    statusSuspended: '#c62f3b',
    statusUnknown: '#8a8f98',
  },
  dark: {
    background: '#14181e',
    ink: '#e6ebf2',
    shell: '#4a5563',
    floorUnpaid: '#4b453a',
    floorPaid: {
      'jr-east': '#33494a',
      keio: '#473a4c',
      odakyu: '#34405a',
      'tokyo-metro': '#523b3b',
      toei: '#3b4a34',
    },
    floorPaidDefault: '#3a424d',
    wall: '#5c6672',
    platform: '#525b67',
    platformEdge: '#c9d0d8',
    tactile: '#c7a637',
    trackBed: '#24282e',
    rail: '#8e98a4',
    column: '#6a7480',
    stairs: '#7a8491',
    stairsSide: '#a4afbb',
    escalator: '#1d2126',
    escalatorSide: '#6f8fa3',
    handrail: '#0d0f12',
    elevatorGlass: '#5d93b4',
    elevatorFrame: '#aab4c0',
    elevator: '#6fa4f5',
    gateBody: '#9aa4b0',
    gate: '#58c7cf',
    gateTransfer: '#c49ad6',
    entrance: '#f0a45a',
    block: '#6f7680',
    link: '#8795a6',
    route: '#ff6a3d',
    routeDim: '#8a4a38',
    routeHalo: '#14181e',
    selected: '#7fb0ff',
    shadow: '#000000',
    statusNormal: '#55c98a',
    statusDelayed: '#f2b33d',
    statusSuspended: '#ff6b76',
    statusUnknown: '#8e96a3',
  },
};

/** Floor colour of a fare zone ("unpaid" or "paid:<operator>"). */
export function zoneColor(p: Palette, zone: string): string {
  if (zone === 'unpaid') return p.floorUnpaid;
  return p.floorPaid[zone.replace('paid:', '')] ?? p.floorPaidDefault;
}

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

/** Black or white, whichever reads better on `hex`. */
export function inkOn(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return lum > 0.42 ? '#12161c' : '#ffffff';
}
