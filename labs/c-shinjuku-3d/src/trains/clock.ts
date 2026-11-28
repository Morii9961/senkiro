/**
 * The simulation clock.
 *
 * - 'now'  : follows the current time in Japan. Trains are where the timetable
 *            says they should be at this moment — still a simulation, not a
 *            position feed.
 * - 'demo' : a clock the reader controls: pause, play at a chosen rate, scrub.
 */
import { serviceClockAt } from '../timetable/time';

export interface SimClock {
  mode: 'now' | 'demo';
  playing: boolean;
  /** Simulated seconds per real second (demo mode). */
  rate: number;
  /** Demo mode: the simulated time `anchorSeconds` was current at wall time `anchorWallMs`. */
  anchorWallMs: number;
  anchorSeconds: number;
}

/** The scrubber's range: one service day, 04:00 to 26:00. */
export const DAY_START = 4 * 3600;
export const DAY_END = 26 * 3600;
export const RATES = [1, 10, 60] as const;

export function nowClock(): SimClock {
  return { mode: 'now', playing: true, rate: 1, anchorWallMs: 0, anchorSeconds: 0 };
}

export function demoClock(seconds: number, playing: boolean, rate = 1, wallMs = Date.now()): SimClock {
  return { mode: 'demo', playing, rate, anchorWallMs: wallMs, anchorSeconds: seconds };
}

/** Seconds of the service day the clock shows at wall time `wallMs`. */
export function simSeconds(clock: SimClock, wallMs = Date.now()): number {
  if (clock.mode === 'now') return serviceClockAt(new Date(wallMs)).seconds;
  if (!clock.playing) return clock.anchorSeconds;
  const t = clock.anchorSeconds + ((wallMs - clock.anchorWallMs) / 1000) * clock.rate;
  // a demo that runs off the end of the day starts again in the morning
  return t >= DAY_END ? DAY_START + ((t - DAY_END) % (DAY_END - DAY_START)) : t;
}

/** The same clock, re-anchored at the time it shows now — used before changing rate or pausing. */
export function rebase(clock: SimClock, wallMs = Date.now()): SimClock {
  return { ...clock, mode: 'demo', anchorWallMs: wallMs, anchorSeconds: simSeconds(clock, wallMs) };
}
