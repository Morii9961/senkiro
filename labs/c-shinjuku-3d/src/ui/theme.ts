/**
 * Colours of the model. It reads as an architectural cutaway model: neutral
 * floors and walls, a few semantic accents, and one loud colour kept for the
 * route. These are this prototype's own colours — they do not reproduce any
 * operator's map palette or signage.
 *
 * The dark palette is NOT the light one turned down. A dark interface puts the
 * same model on a graphite table under neutral light: the materials keep their
 * own colours (a little lower in value so that they do not glare), and only
 * the surroundings change. See ./sceneTheme.ts for the lighting that goes with
 * each palette.
 */
export type ThemeName = 'light' | 'dark';

export interface Palette {
  background: string;
  ink: string;
  /** What edges are darkened towards — a soft shadow line, never a highlight. */
  outline: string;
  /** Strength of the baked contact shadows, 1 = as authored. */
  contactShadow: number;
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
    outline: '#1d2733',
    contactShadow: 1,
    shell: '#8f99a5',
    floorUnpaid: '#e2d5b7',
    floorPaid: {
      'jr-east': '#bfd8cf',
      keio: '#d8c6de',
      odakyu: '#c2d0ea',
      'tokyo-metro': '#eac6c1',
      toei: '#cde1bd',
      seibu: '#bfe0e2',
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
    background: '#262b33',
    ink: '#e6ebf2',
    outline: '#10141a',
    contactShadow: 1.45,
    shell: '#77818e',
    floorUnpaid: '#d8cbac',
    floorPaid: {
      'jr-east': '#b2cfc4',
      keio: '#cfbad6',
      odakyu: '#b5c5e4',
      'tokyo-metro': '#e2b9b3',
      toei: '#c0d8ae',
      seibu: '#b0d6d9',
    },
    floorPaidDefault: '#bfc8d2',
    wall: '#edece7',
    platform: '#bcc2ca',
    platformEdge: '#f3f3ef',
    tactile: '#e2bd44',
    trackBed: '#7b7771',
    rail: '#40464e',
    column: '#e3e1db',
    stairs: '#bbc0c7',
    stairsSide: '#858d97',
    escalator: '#3d434b',
    escalatorSide: '#98b0c1',
    handrail: '#1b1f24',
    elevatorGlass: '#a4cde5',
    elevatorFrame: '#646e79',
    elevator: '#3a73cc',
    gateBody: '#606a76',
    gate: '#1f929c',
    gateTransfer: '#8d5aac',
    entrance: '#d37a22',
    block: '#9aa0a8',
    link: '#8492a1',
    route: '#ff5a30',
    routeDim: '#d99684',
    routeHalo: '#ffffff',
    selected: '#2f7bff',
    shadow: '#0b0e12',
    statusNormal: '#3fae73',
    statusDelayed: '#e79a12',
    statusSuspended: '#e2424f',
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
