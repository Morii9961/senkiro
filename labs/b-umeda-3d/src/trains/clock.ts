import { DEMO_START } from './constants'

export type TrainSpeed = 1 | 10 | 60
export interface TrainClock {
  seconds: number
  startedAt: number
  speed: TrainSpeed
}

export function startTrainClock(now = performance.now()): TrainClock {
  return { seconds: DEMO_START, startedAt: now, speed: 1 }
}

export function trainClockSeconds(clock: TrainClock, now = performance.now()): number {
  return clock.seconds + Math.max(0, now - clock.startedAt) * clock.speed / 1000
}
