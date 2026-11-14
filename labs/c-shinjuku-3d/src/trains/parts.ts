/**
 * The boxes a train is drawn from. Pure geometry in train-local coordinates —
 * no three.js here — so that one vehicle description serves every train of
 * that type and length (the renderer instances the boxes).
 *
 * Local frame: `a` runs along the track with 0 at the middle of the train,
 * `u` is height above the rail top, `c` is across the track with + on the
 * platform side.
 *
 * Everything here is schematic: a car is a body, a roof, an underframe, two
 * bogies, window bands, doors, and a cab face at each end of the train.
 */
import type { VehicleSpec } from './vehicles';

export interface TrainPart {
  a0: number;
  a1: number;
  u0: number;
  u1: number;
  c0: number;
  c1: number;
  color: string;
  /** A door leaf on the platform side: slides towards +a (1) or −a (−1) by `travel` when the doors open. */
  leaf?: 1 | -1;
  travel?: number;
  /** A lamp at the +a end (1) or −a end (−1): white when that end leads, red when it trails. */
  lamp?: 1 | -1;
}

export const CAR_WIDTH = 0.5;
export const CAR_GAP = 0.07;
const HALF = CAR_WIDTH / 2;
/** Applied to the finished boxes: the widths and heights above are written for a 0.5-wide car. */
const ACROSS_SCALE = 1.14;
const UP_SCALE = 1.18;
const FLOOR = 0.1;
const TOP = 0.6;

const UNDERFRAME = '#3b4047';
const BOGIE = '#2a2e34';
const GLASS = '#26303b';
const DOORWAY = '#1c2128';
const CAB_GLASS = '#1b2129';
export const LAMP_OFF = '#d9dde2';
export const LAMP_HEAD = '#fff6d8';
export const LAMP_TAIL = '#e0362c';
/** Accent of a train whose line has no colour in the model. */
export const NEUTRAL_ACCENT = '#8a929c';

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `#${((ch(n >> 16) << 16) | (ch((n >> 8) & 255) << 8) | ch(n & 255)).toString(16).padStart(6, '0')}`;
}

export interface TrainShape {
  spec: VehicleSpec;
  /** Number of cars, or null when unknown: then one undivided body without doors is drawn. */
  cars: number | null;
  /** Length of the whole train. */
  length: number;
  /** Display colour of the line, used where the vehicle carries an accent. */
  accent: string;
}

export function buildTrainParts(shape: TrainShape): TrainPart[] {
  const { spec, cars, length, accent } = shape;
  const parts: TrainPart[] = [];
  const n = cars ?? 1;
  const carLength = length / n;
  const doorColor = spec.accent === 'doors-and-front' ? accent : shade(spec.body, 0.9);
  const side = (s: 1 | -1, inner: number, outer: number): [number, number] => (s === 1 ? [HALF + inner, HALF + outer] : [-HALF - outer, -HALF - inner]);

  for (let i = 0; i < n; i++) {
    const a0 = -length / 2 + i * carLength + CAR_GAP / 2;
    const a1 = a0 + carLength - CAR_GAP;
    const len = a1 - a0;

    parts.push({ a0: a0 + 0.08, a1: a1 - 0.08, u0: 0.03, u1: FLOOR, c0: -0.2, c1: 0.2, color: UNDERFRAME });
    const bogie = Math.min(0.5, len * 0.2);
    for (const at of [0.17, 0.83]) {
      const m = a0 + len * at;
      parts.push({ a0: m - bogie / 2, a1: m + bogie / 2, u0: 0, u1: 0.085, c0: -0.23, c1: 0.23, color: BOGIE });
    }
    parts.push({ a0, a1, u0: FLOOR, u1: TOP, c0: -HALF, c1: HALF, color: spec.body });
    parts.push({ a0: a0 + 0.05, a1: a1 - 0.05, u0: TOP, u1: TOP + 0.035, c0: -0.185, c1: 0.185, color: spec.roof });
    const ac = Math.min(1, len * 0.3);
    parts.push({ a0: (a0 + a1) / 2 - ac / 2, a1: (a0 + a1) / 2 + ac / 2, u0: TOP + 0.035, u1: TOP + 0.09, c0: -0.13, c1: 0.13, color: shade(spec.roof, 1.25) });

    for (const s of [1, -1] as const) {
      const [g0, g1] = side(s, 0, 0.004);
      parts.push({ a0: a0 + 0.1, a1: a1 - 0.1, u0: 0.36, u1: 0.5, c0: g0, c1: g1, color: GLASS });
      // the accent rides on the doors where the vehicle has it there — or as a belt when no doors are drawn
      if (spec.accent === 'belt' || (spec.accent === 'doors-and-front' && cars == null)) {
        const [b0, b1] = side(s, 0, 0.005);
        parts.push({ a0, a1, u0: 0.27, u1: 0.335, c0: b0, c1: b1, color: accent });
        parts.push({ a0, a1, u0: 0.545, u1: 0.6, c0: b0, c1: b1, color: accent });
      }
      if (cars == null) continue; // unknown formation: no doors are claimed

      const doors = spec.doorsPerSide;
      const width = Math.min(0.42, (len / doors) * 0.42);
      for (let k = 0; k < doors; k++) {
        const m = a0 + (len * (k + 0.5)) / doors;
        const [l0, l1] = side(s, 0.006, 0.012);
        if (s === 1) {
          // platform side: a dark doorway and two leaves that slide apart
          const [d0, d1] = side(s, 0, 0.006);
          parts.push({ a0: m - width / 2, a1: m + width / 2, u0: 0.12, u1: 0.54, c0: d0, c1: d1, color: DOORWAY });
          parts.push({ a0: m - width / 2, a1: m, u0: 0.12, u1: 0.54, c0: l0, c1: l1, color: doorColor, leaf: -1, travel: (width / 2) * 0.92 });
          parts.push({ a0: m, a1: m + width / 2, u0: 0.12, u1: 0.54, c0: l0, c1: l1, color: doorColor, leaf: 1, travel: (width / 2) * 0.92 });
        } else {
          parts.push({ a0: m - width / 2, a1: m + width / 2, u0: 0.12, u1: 0.54, c0: l0, c1: l1, color: doorColor });
        }
      }
    }
  }

  // a cab face at each end of the train
  for (const end of [1, -1] as const) {
    const face = (end * length) / 2 - (end * CAR_GAP) / 2;
    const out = (d0: number, d1: number): [number, number] => (end === 1 ? [face + d0, face + d1] : [face - d1, face - d0]);
    const [w0, w1] = out(0, 0.012);
    parts.push({ a0: w0, a1: w1, u0: 0.32, u1: 0.56, c0: -0.215, c1: 0.215, color: CAB_GLASS });
    parts.push({ a0: w0, a1: w1, u0: 0.12, u1: 0.32, c0: -0.235, c1: 0.235, color: spec.accent === 'doors-and-front' ? accent : shade(spec.body, 0.93) });
    if (spec.accent === 'doors-and-front') parts.push({ a0: w0, a1: w1, u0: 0.56, u1: 0.6, c0: -0.235, c1: 0.235, color: accent });
    const [p0, p1] = out(0.012, 0.02);
    for (const c of [-0.17, 0.17]) parts.push({ a0: p0, a1: p1, u0: 0.15, u1: 0.2, c0: c - 0.04, c1: c + 0.04, color: LAMP_OFF, lamp: end });
  }

  // The drawn track is narrow; the train takes nearly all of it and is a little taller than wide, as a real car is.
  for (const q of parts) {
    q.c0 *= ACROSS_SCALE;
    q.c1 *= ACROSS_SCALE;
    q.u0 *= UP_SCALE;
    q.u1 *= UP_SCALE;
  }
  return parts;
}
