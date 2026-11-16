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
 * bogies, windows, the bands of its livery and doors; the two end cars carry a
 * cab, flat, rounded or sloped after the type (`VehicleSpec.front`). Where the
 * number of cars is not known the train is still divided into cars of about
 * the nominal length, as a drawing only.
 */
import type { Band, VehicleSpec } from './vehicles';

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
/** Drawn length of a 20 m car with the floors close; also the car length used to divide a train of unknown length. */
export const DRAW_CAR_LENGTH = 3.4;
const HALF = CAR_WIDTH / 2;
/** Applied to the finished boxes: the widths and heights above are written for a 0.5-wide car. */
const ACROSS_SCALE = 1.14;
const UP_SCALE = 1.18;
const FLOOR = 0.1;
const TOP = 0.6;
const TOP_BILEVEL = 0.72;
/** Length each end car gives up to its cab nose. */
const NOSE = { flat: 0, rounded: 0.16, slant: 0.5 } as const;

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
  /** Number of cars, or null when unknown: then the train is divided into cars of about the nominal length. */
  cars: number | null;
  /** Length of the whole train. */
  length: number;
  /** Display colour of the line, used where a vehicle without a livery carries an accent. */
  accent: string;
}

interface CarSpan {
  /** Ends of the car, and of its body (an end car's body stops where its cab nose begins). */
  a0: number;
  a1: number;
  b0: number;
  b1: number;
  bilevel: boolean;
}

/** The cars of a train, from the −a end. */
export function carSpans(shape: Pick<TrainShape, 'spec' | 'cars' | 'length'>): CarSpan[] {
  const { spec, cars, length } = shape;
  const n = cars ?? Math.max(1, Math.round(length / DRAW_CAR_LENGTH));
  const carLength = length / n;
  const nose = Math.min(NOSE[spec.front], carLength * 0.25);
  const out: CarSpan[] = [];
  for (let i = 0; i < n; i++) {
    const a0 = -length / 2 + i * carLength + CAR_GAP / 2;
    const a1 = a0 + carLength - CAR_GAP;
    out.push({ a0, a1, b0: i === 0 ? a0 + nose : a0, b1: i === n - 1 ? a1 - nose : a1, bilevel: n >= 10 && (spec.bilevelCars ?? []).includes(i) });
  }
  return out;
}

/** Centres (along the train) and width of the doors on one side of one car. */
function carDoors(spec: VehicleSpec, car: CarSpan): { centres: number[]; width: number } {
  const len = car.b1 - car.b0;
  const doors = car.bilevel ? 2 : spec.doorsPerSide;
  const width = Math.min(0.42, (len / doors) * 0.42);
  return { centres: Array.from({ length: doors }, (_, k) => car.b0 + (len * (k + 0.5)) / doors), width };
}

/** The doors of a whole train on the platform side: centre and width, train-local. Platform doors line up with these. */
export function doorCentres(shape: Pick<TrainShape, 'spec' | 'cars' | 'length'>): { a: number; width: number }[] {
  return carSpans(shape).flatMap((car) => {
    const d = carDoors(shape.spec, car);
    return d.centres.map((a) => ({ a, width: d.width }));
  });
}

export function buildTrainParts(shape: TrainShape): TrainPart[] {
  const { spec, length, accent } = shape;
  const L = spec.livery;
  const parts: TrainPart[] = [];
  const bodyColor = L ? L.body : spec.accent === 'body' ? accent : spec.body;
  const roofColor = L?.roof ?? spec.roof;
  const doorColor = L ? (L.doors ?? shade(L.body, 0.94)) : spec.accent === 'doors-and-front' ? accent : spec.accent === 'body' ? shade(accent, 0.86) : shade(spec.body, 0.9);
  const bands: Band[] = L
    ? L.bands
    : spec.accent === 'belt' || spec.accent === 'doors-and-front'
      ? [
          { u0: 0.27, u1: 0.335, color: accent },
          { u0: 0.545, u1: 0.6, color: accent },
        ]
      : [];
  const frontColor = L ? L.front : spec.accent === 'doors-and-front' || spec.accent === 'body' ? accent : shade(spec.body, 0.93);
  const side = (s: 1 | -1, inner: number, outer: number): [number, number] => (s === 1 ? [HALF + inner, HALF + outer] : [-HALF - outer, -HALF - inner]);
  const spans = carSpans(shape);

  for (const car of spans) {
    const { a0, a1, b0, b1 } = car;
    const len = a1 - a0;
    const top = car.bilevel ? TOP_BILEVEL : TOP;

    parts.push({ a0: a0 + 0.08, a1: a1 - 0.08, u0: 0.03, u1: FLOOR, c0: -0.2, c1: 0.2, color: UNDERFRAME });
    const bogie = Math.min(0.5, len * 0.2);
    for (const at of [0.17, 0.83]) {
      const m = a0 + len * at;
      parts.push({ a0: m - bogie / 2, a1: m + bogie / 2, u0: 0, u1: 0.085, c0: -0.23, c1: 0.23, color: BOGIE });
    }
    parts.push({ a0: b0, a1: b1, u0: FLOOR, u1: top, c0: -HALF, c1: HALF, color: bodyColor });
    parts.push({ a0: b0 + 0.05, a1: b1 - 0.05, u0: top, u1: top + 0.035, c0: -0.185, c1: 0.185, color: roofColor });
    if (!car.bilevel) {
      const ac = Math.min(1, (b1 - b0) * 0.3);
      parts.push({ a0: (b0 + b1) / 2 - ac / 2, a1: (b0 + b1) / 2 + ac / 2, u0: top + 0.035, u1: top + 0.09, c0: -0.13, c1: 0.13, color: shade(roofColor, 1.25) });
    }

    const doors = carDoors(spec, car);
    for (const s of [1, -1] as const) {
      // a dark band over the window row, then the windows (two rows on a bilevel car), then the bands
      if (L?.windowBand) {
        const [w0, w1] = side(s, 0, 0.003);
        parts.push({ a0: b0, a1: b1, u0: 0.335, u1: top - 0.005, c0: w0, c1: w1, color: L.windowBand });
      }
      const [g0, g1] = side(s, 0, 0.004);
      const rows: [number, number][] = car.bilevel ? [[0.18, 0.3], [0.44, 0.6]] : [[0.36, 0.5]];
      for (const [r0, r1] of rows) parts.push({ a0: b0 + 0.1, a1: b1 - 0.1, u0: r0, u1: r1, c0: g0, c1: g1, color: GLASS });
      for (const band of bands) {
        const [k0, k1] = side(s, 0, 0.005);
        const lift = car.bilevel && band.u0 > 0.5 ? TOP_BILEVEL - TOP : 0;
        parts.push({ a0: b0, a1: b1, u0: band.u0 + lift, u1: band.u1 + lift, c0: k0, c1: k1, color: band.color });
      }

      for (const m of doors.centres) {
        const width = doors.width;
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

  // a cab at each end of the train
  const first = spans[0]!;
  const last = spans[spans.length - 1]!;
  for (const end of [1, -1] as const) {
    const face = end === 1 ? last.a1 : first.a0;
    const bodyEnd = end === 1 ? last.b1 : first.b0;
    const nose = Math.abs(face - bodyEnd);
    /** A box measured inwards from the face: d0..d1 from the face towards the middle of the train. */
    const inward = (d0: number, d1: number): [number, number] => (end === 1 ? [face - d1, face - d0] : [face + d0, face + d1]);
    const lamp = (d: number, u: number) => {
      const [p0, p1] = inward(-0.008, d);
      for (const c of [-0.17, 0.17]) parts.push({ a0: p0, a1: p1, u0: u, u1: u + 0.05, c0: c - 0.04, c1: c + 0.04, color: LAMP_OFF, lamp: end });
    };

    if (spec.front === 'slant' && nose > 0.05) {
      // a sloped nose drawn as three steps: the lower face, the windscreen, the roof end
      const [n0, n1] = inward(0, nose);
      parts.push({ a0: n0, a1: n1, u0: FLOOR, u1: 0.3, c0: -HALF * 0.96, c1: HALF * 0.96, color: frontColor });
      if (L?.frontBand) {
        const [f0, f1] = inward(-0.004, 0.02);
        parts.push({ a0: f0, a1: f1, u0: 0.22, u1: 0.27, c0: -HALF * 0.9, c1: HALF * 0.9, color: L.frontBand });
      }
      const [s0, s1] = inward(nose * 0.3, nose);
      parts.push({ a0: s0, a1: s1, u0: 0.3, u1: 0.46, c0: -HALF * 0.9, c1: HALF * 0.9, color: CAB_GLASS });
      const [r0, r1] = inward(nose * 0.65, nose);
      parts.push({ a0: r0, a1: r1, u0: 0.46, u1: TOP, c0: -HALF * 0.86, c1: HALF * 0.86, color: L?.windowBand ?? bodyColor });
      lamp(0.02, 0.16);
      continue;
    }
    if (spec.front === 'rounded' && nose > 0.05) {
      // a narrower last section reads as a rounded face
      const [n0, n1] = inward(0, nose);
      parts.push({ a0: n0, a1: n1, u0: FLOOR, u1: TOP - 0.02, c0: -HALF * 0.84, c1: HALF * 0.84, color: frontColor });
      const [w0, w1] = inward(-0.012, 0.01);
      parts.push({ a0: w0, a1: w1, u0: 0.3, u1: 0.55, c0: -0.19, c1: 0.19, color: CAB_GLASS });
      if (L?.frontBand) parts.push({ a0: w0, a1: w1, u0: 0.17, u1: 0.22, c0: -0.2, c1: 0.2, color: L.frontBand });
      lamp(0.01, 0.23);
      continue;
    }
    // flat face
    const [w0, w1] = inward(-0.012, 0);
    parts.push({ a0: w0, a1: w1, u0: 0.32, u1: 0.56, c0: -0.215, c1: 0.215, color: CAB_GLASS });
    parts.push({ a0: w0, a1: w1, u0: 0.12, u1: 0.32, c0: -0.235, c1: 0.235, color: frontColor });
    if (L?.frontBand) parts.push({ a0: w0 - (end === 1 ? 0 : 0.002), a1: w1 + (end === 1 ? 0.002 : 0), u0: 0.27, u1: 0.31, c0: -0.235, c1: 0.235, color: L.frontBand });
    if (!L && spec.accent === 'doors-and-front') parts.push({ a0: w0, a1: w1, u0: 0.56, u1: 0.6, c0: -0.235, c1: 0.235, color: accent });
    lamp(0.008, 0.15);
  }

  // The drawn track is narrow; the train takes nearly all of it and is a little taller than wide, as a real car is.
  const across = ACROSS_SCALE * (spec.size?.width ?? 1);
  const up = UP_SCALE * (spec.size?.height ?? 1);
  for (const q of parts) {
    q.c0 *= across;
    q.c1 *= across;
    q.u0 *= up;
    q.u1 *= up;
  }
  return parts;
}
