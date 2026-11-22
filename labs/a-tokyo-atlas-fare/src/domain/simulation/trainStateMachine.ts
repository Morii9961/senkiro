/**
 * SENKIRO Atlas v2 — Deterministic 12-State Train Operational State Machine & Kinematics Solver.
 *
 * Implements all 12 required states:
 *   1. INITIALIZING        (初始化)
 *   2. READY_TO_DEPART     (出发准备)
 *   3. ACCELERATING        (加速)
 *   4. CRUISING            (巡航)
 *   5. DECELERATING        (减速)
 *   6. APPROACHING_STATION (进站)
 *   7. STOPPING            (停车)
 *   8. DOORS_OPENING       (开门)
 *   9. DWELLING            (停站)
 *  10. DOORS_CLOSING       (关门)
 *  11. DEPARTING_STATION   (出站)
 *  12. TERMINAL_TURNAROUND (终到或折返)
 *
 * Driven strictly by fixed deterministic timesteps (`dt = fixedStepSec`).
 */

import type { AheadClearanceResult } from './blockOccupancy.js';
import {
  buildVirtualTrainConsist,
  getRollingStockSpec,
  resolveTrainKinematics,
  type ResolvedTrainKinematics,
} from './rollingStockCatalog.js';
import type { BuiltRouteBundle } from './routeBuilder.js';
import { solveConsistCarriagePoses, type TrackSpline3D } from './trackSpline3D.js';
import {
  SIMULATION_LABEL,
  type RollingStockSpec,
  type RunnableTrackRoute,
  type SimulatedTrainSnapshot,
  type SimulationConfig,
  type TrainLocationStatus,
  type TrainOperationalState,
  type TrainSpawnRequest,
  type VirtualTrainConsist,
} from './types.js';

export interface TurnaroundAttemptCallback {
  (
    trainId: string,
    reverseRouteId: string,
    consistLengthM: number,
  ): {
    allowed: boolean;
    reverseBundle: BuiltRouteBundle | null;
    conflictingTrainId: string | null;
  };
}

export class SimulatedTrainInstance {
  readonly trainId: string;
  readonly spec: RollingStockSpec;
  readonly consist: VirtualTrainConsist;
  readonly kinematics: ResolvedTrainKinematics;

  private routeBundle: BuiltRouteBundle;
  private state: TrainOperationalState;
  private stateTimerSec = 0;
  private departureDelayRemainingSec: number;
  private customDwellTimeSec: number | undefined;

  private headArcLengthM: number;
  private speedMps = 0;
  private accelerationMps2 = 0;
  private totalDistanceTraveledM = 0;
  private completedLapsOrTurnarounds = 0;
  private isTerminated = false;
  private doorsOpenRatio = 0;

  private currentOriginStopIndex: number;
  private targetStopIndex: number;
  private stateHistory: TrainOperationalState[] = [];

  private lastClearance: AheadClearanceResult = {
    clearanceAheadM: null,
    rawDistanceToTrainAheadM: null,
    blockedByTrainId: null,
    occupiedBlockIds: [],
  };
  private isHoldingForClearance = false;

  constructor(request: TrainSpawnRequest, initialBundle: BuiltRouteBundle) {
    if (!initialBundle.route.connectivity.valid) {
      throw new Error(
        `Cannot spawn train "${request.trainId}" on invalid/unconnected route "${initialBundle.route.routeId}": ${initialBundle.route.connectivity.reason}`,
      );
    }
    if (initialBundle.route.stationStops.length < 2) {
      throw new Error(
        `Cannot spawn train "${request.trainId}" on route "${initialBundle.route.routeId}" with fewer than 2 station stops.`,
      );
    }

    this.trainId = request.trainId;
    this.routeBundle = initialBundle;
    this.spec = getRollingStockSpec(request.rollingStockId);
    this.consist = buildVirtualTrainConsist(
      request.rollingStockId,
      request.carCount,
      `${request.trainId}-consist`,
    );
    this.kinematics = resolveTrainKinematics(this.spec, request.kinematics);
    this.customDwellTimeSec = request.dwellTimeSec;
    this.departureDelayRemainingSec = Math.max(0, request.departureDelaySec ?? 0);

    const stopCount = initialBundle.route.stationStops.length;
    const initStopIdx = Math.max(
      0,
      Math.min(stopCount - 1, Math.round(request.initialStopIndex ?? 0)),
    );
    this.currentOriginStopIndex = initStopIdx;
    this.targetStopIndex = initialBundle.route.isLoop
      ? (initStopIdx + 1) % stopCount
      : Math.min(stopCount - 1, initStopIdx + 1);

    const initStop = initialBundle.route.stationStops[initStopIdx]!;
    this.headArcLengthM = initStop.stopArcLengthM;

    this.state = request.initialState ?? 'INITIALIZING';
    this.doorsOpenRatio = this.state === 'DWELLING' ? 1.0 : 0.0;
    this.recordStateVisit(this.state);
  }

  getRoute(): RunnableTrackRoute {
    return this.routeBundle.route;
  }

  getSpline(): TrackSpline3D {
    return this.routeBundle.spline;
  }

  getState(): TrainOperationalState {
    return this.state;
  }

  getStateHistory(): readonly TrainOperationalState[] {
    return this.stateHistory;
  }

  getHeadArcLengthM(): number {
    return this.headArcLengthM;
  }

  getTailArcLengthM(): number {
    return this.headArcLengthM - this.consist.totalLengthM;
  }

  getConsistLengthM(): number {
    return this.consist.totalLengthM;
  }

  getSpeedMps(): number {
    return this.speedMps;
  }

  getIsTerminated(): boolean {
    return this.isTerminated;
  }

  setLastClearance(clearance: AheadClearanceResult): void {
    this.lastClearance = clearance;
  }

  private transitionTo(nextState: TrainOperationalState): void {
    if (this.state !== nextState) {
      this.state = nextState;
      this.stateTimerSec = 0;
      this.recordStateVisit(nextState);
    }
  }

  private recordStateVisit(st: TrainOperationalState): void {
    if (this.stateHistory[this.stateHistory.length - 1] !== st) {
      this.stateHistory.push(st);
    }
  }

  private getTargetStopArcLengthM(): number {
    const route = this.routeBundle.route;
    const stop = route.stationStops[this.targetStopIndex]!;
    // On a loop route, when advancing from the last station back to stop 0, the target arc-length
    // is at the end of the loop (route.totalLengthM) before wrapping to 0.
    if (route.isLoop && this.targetStopIndex === 0 && this.currentOriginStopIndex !== 0) {
      return route.totalLengthM;
    }
    return stop.stopArcLengthM;
  }

  private getOriginStopArcLengthM(): number {
    const route = this.routeBundle.route;
    return route.stationStops[this.currentOriginStopIndex]!.stopArcLengthM;
  }

  /**
   * Advances this train's state machine and longitudinal physics by one fixed timestep `dt` (seconds).
   */
  stepFixedTick(
    dt: number,
    config: SimulationConfig,
    clearance: AheadClearanceResult,
    onAttemptTurnaround?: TurnaroundAttemptCallback,
  ): void {
    this.lastClearance = clearance;
    this.isHoldingForClearance = false;

    const route = this.routeBundle.route;
    if (!route.connectivity.valid || this.isTerminated) {
      this.speedMps = 0;
      this.accelerationMps2 = 0;
      return;
    }

    this.stateTimerSec += dt;

    switch (this.state) {
      case 'INITIALIZING': {
        this.speedMps = 0;
        this.accelerationMps2 = 0;
        this.doorsOpenRatio = 0;
        if (this.departureDelayRemainingSec > 0) {
          this.departureDelayRemainingSec = Math.max(0, this.departureDelayRemainingSec - dt);
          if (this.departureDelayRemainingSec > 1e-6) {
            break;
          }
        }
        // If spawned at final station of a non-loop route, enter TERMINAL_TURNAROUND immediately
        if (
          !route.isLoop &&
          this.currentOriginStopIndex >= route.stationStops.length - 1
        ) {
          this.transitionTo('TERMINAL_TURNAROUND');
          break;
        }
        if (this.stateTimerSec >= dt - 1e-6) {
          this.transitionTo('READY_TO_DEPART');
        }
        break;
      }

      case 'READY_TO_DEPART': {
        this.speedMps = 0;
        this.accelerationMps2 = 0;
        this.doorsOpenRatio = 0;
        if (this.departureDelayRemainingSec > 0) {
          this.departureDelayRemainingSec = Math.max(0, this.departureDelayRemainingSec - dt);
          if (this.departureDelayRemainingSec > 1e-6) {
            break;
          }
        }

        const minDepartClearanceM = 18.0;
        if (
          clearance.clearanceAheadM !== null &&
          clearance.clearanceAheadM < minDepartClearanceM
        ) {
          this.isHoldingForClearance = true;
          break;
        }

        if (this.stateTimerSec >= dt - 1e-6) {
          this.transitionTo('DEPARTING_STATION');
        }
        break;
      }

      case 'DEPARTING_STATION':
      case 'ACCELERATING':
      case 'CRUISING':
      case 'DECELERATING':
      case 'APPROACHING_STATION':
      case 'STOPPING': {
        this.stepRunningKinematics(dt, config, clearance);
        break;
      }

      case 'DOORS_OPENING': {
        this.speedMps = 0;
        this.accelerationMps2 = 0;
        this.doorsOpenRatio = Math.min(1.0, this.stateTimerSec / config.doorOpenDurationSec);
        if (this.stateTimerSec >= config.doorOpenDurationSec - 1e-6) {
          this.doorsOpenRatio = 1.0;
          this.transitionTo('DWELLING');
        }
        break;
      }

      case 'DWELLING': {
        this.speedMps = 0;
        this.accelerationMps2 = 0;
        this.doorsOpenRatio = 1.0;
        const currentStop = route.stationStops[this.targetStopIndex];
        const dwellTargetSec =
          this.customDwellTimeSec ?? currentStop?.defaultDwellSec ?? config.dwellTimeSec;
        if (this.stateTimerSec >= dwellTargetSec - 1e-6) {
          this.transitionTo('DOORS_CLOSING');
        }
        break;
      }

      case 'DOORS_CLOSING': {
        this.speedMps = 0;
        this.accelerationMps2 = 0;
        this.doorsOpenRatio = Math.max(
          0.0,
          1.0 - this.stateTimerSec / config.doorCloseDurationSec,
        );
        if (this.stateTimerSec >= config.doorCloseDurationSec - 1e-6) {
          this.doorsOpenRatio = 0.0;
          const stopCount = route.stationStops.length;
          const reachedNonLoopTerminal =
            !route.isLoop && this.targetStopIndex >= stopCount - 1;

          if (reachedNonLoopTerminal) {
            this.currentOriginStopIndex = this.targetStopIndex;
            this.transitionTo('TERMINAL_TURNAROUND');
          } else {
            // If loop route completed a lap at stop 0, wrap headArcLengthM from totalLengthM -> 0
            if (route.isLoop && this.targetStopIndex === 0) {
              this.headArcLengthM = 0;
              this.completedLapsOrTurnarounds += 1;
            }
            this.currentOriginStopIndex = this.targetStopIndex;
            this.targetStopIndex = route.isLoop
              ? (this.targetStopIndex + 1) % stopCount
              : Math.min(stopCount - 1, this.targetStopIndex + 1);
            this.transitionTo('READY_TO_DEPART');
          }
        }
        break;
      }

      case 'TERMINAL_TURNAROUND': {
        this.speedMps = 0;
        this.accelerationMps2 = 0;
        this.doorsOpenRatio = 0.0;

        if (this.stateTimerSec < config.turnaroundDurationSec - 1e-6) {
          break;
        }

        if (route.mode === 'one_way' || !route.reverseRouteId) {
          this.completedLapsOrTurnarounds += 1;
          this.isTerminated = true;
          break;
        }

        // Shuttle mode: attempt turnaround onto reverse route
        if (onAttemptTurnaround) {
          const attempt = onAttemptTurnaround(
            this.trainId,
            route.reverseRouteId,
            this.consist.totalLengthM,
          );
          if (!attempt.allowed || !attempt.reverseBundle) {
            this.isHoldingForClearance = true;
            break;
          }

          this.routeBundle = attempt.reverseBundle;
          this.currentOriginStopIndex = 0;
          this.targetStopIndex = Math.min(
            1,
            this.routeBundle.route.stationStops.length - 1,
          );
          this.headArcLengthM =
            this.routeBundle.route.stationStops[0]?.stopArcLengthM ?? 0;
          this.completedLapsOrTurnarounds += 1;
          this.transitionTo('READY_TO_DEPART');
        }
        break;
      }
    }
  }

  /**
   * Executes longitudinal train dynamics and state transitions across the 6 motion states:
   * `DEPARTING_STATION` -> `ACCELERATING` -> `CRUISING` -> `DECELERATING` -> `APPROACHING_STATION` -> `STOPPING`.
   */
  private stepRunningKinematics(
    dt: number,
    config: SimulationConfig,
    clearance: AheadClearanceResult,
  ): void {
    const spline = this.routeBundle.spline;
    const targetStopS = this.getTargetStopArcLengthM();
    const originStopS = this.getOriginStopArcLengthM();
    const intervalLengthM = Math.max(10, targetStopS - originStopS);
    const distToStationM = Math.max(0, targetStopS - this.headArcLengthM);
    const distFromOriginM = Math.max(0, this.headArcLengthM - originStopS);

    const clearanceAheadM = clearance.clearanceAheadM;
    const isBlockGoverning =
      clearanceAheadM !== null && clearanceAheadM < distToStationM - 0.5;
    const effectiveStopDistM = isBlockGoverning ? clearanceAheadM : distToStationM;

    // Curve speed restriction over the consist footprint + 4s lookahead window
    const lookaheadM = Math.max(30, this.speedMps * 4.0);
    const maxCurvature = spline.getMaxCurvatureInWindow(
      this.headArcLengthM - this.consist.totalLengthM * 0.5,
      this.headArcLengthM + lookaheadM,
      10,
    );
    const curveLimitMps =
      maxCurvature > 1e-4
        ? Math.max(
            this.kinematics.minCurveSpeedMps,
            Math.sqrt(this.kinematics.maxCurveLateralAccelMps2 / maxCurvature),
          )
        : this.kinematics.maxSpeedMps;
    const ceilingSpeedMps = Math.min(this.kinematics.maxSpeedMps, curveLimitMps);

    // Nominal service braking distance from current speed v
    const serviceBrakeDistM =
      (this.speedMps * this.speedMps) / (2 * this.kinematics.decelerationMps2);
    const brakeHorizonM = serviceBrakeDistM + this.speedMps * dt * 1.5 + 0.4;
    const cruiseHorizonM = serviceBrakeDistM * 1.2 + this.speedMps * dt * 3.0 + 6.0;

    const approachZoneM = Math.min(48, Math.max(14, intervalLengthM * 0.22));
    const stoppingZoneM = Math.min(4.0, Math.max(1.6, intervalLengthM * 0.04));

    // 1. State transition checks before integrating velocity/position
    if (this.state === 'DEPARTING_STATION') {
      if (effectiveStopDistM <= brakeHorizonM) {
        this.transitionTo('DECELERATING');
      } else if (
        this.stateTimerSec >= config.departureClearDurationSec ||
        distFromOriginM >= Math.min(18, intervalLengthM * 0.14)
      ) {
        this.transitionTo('ACCELERATING');
      }
    }

    if (this.state === 'ACCELERATING') {
      if (effectiveStopDistM <= brakeHorizonM) {
        this.transitionTo('DECELERATING');
      } else if (
        this.speedMps >= ceilingSpeedMps - 0.05 ||
        effectiveStopDistM <= cruiseHorizonM
      ) {
        this.transitionTo('CRUISING');
      }
    }

    if (this.state === 'CRUISING') {
      if (effectiveStopDistM <= brakeHorizonM) {
        this.transitionTo('DECELERATING');
      }
    }

    if (this.state === 'DECELERATING') {
      if (
        !isBlockGoverning &&
        distToStationM <= approachZoneM &&
        distToStationM > stoppingZoneM
      ) {
        this.transitionTo('APPROACHING_STATION');
      } else if (!isBlockGoverning && distToStationM <= stoppingZoneM) {
        this.transitionTo('STOPPING');
      } else if (
        !isBlockGoverning &&
        distToStationM > cruiseHorizonM + 20 &&
        this.speedMps < ceilingSpeedMps * 0.75
      ) {
        // Ahead block cleared well before station braking zone -> resume acceleration
        this.transitionTo('ACCELERATING');
      }
    }

    if (this.state === 'APPROACHING_STATION') {
      if (!isBlockGoverning && distToStationM <= stoppingZoneM) {
        this.transitionTo('STOPPING');
      }
    }

    // 2. Compute longitudinal acceleration and integrate motion for the active running state
    switch (this.state) {
      case 'DEPARTING_STATION': {
        if (isBlockGoverning && clearanceAheadM <= 1.0) {
          this.speedMps = 0;
          this.accelerationMps2 = 0;
          this.isHoldingForClearance = true;
          break;
        }
        const departAccel = this.kinematics.accelerationMps2 * 0.85;
        this.integrateStep(dt, departAccel, ceilingSpeedMps, targetStopS, effectiveStopDistM);
        break;
      }

      case 'ACCELERATING': {
        const accel =
          this.speedMps > ceilingSpeedMps + 0.2
            ? -this.kinematics.decelerationMps2 * 0.7
            : this.kinematics.accelerationMps2;
        this.integrateStep(dt, accel, ceilingSpeedMps, targetStopS, effectiveStopDistM);
        break;
      }

      case 'CRUISING': {
        let accel = 0;
        if (this.speedMps > ceilingSpeedMps + 0.15) {
          accel = -Math.min(
            this.kinematics.decelerationMps2,
            (this.speedMps - ceilingSpeedMps) / dt,
          );
        } else if (
          this.speedMps < ceilingSpeedMps - 0.15 &&
          effectiveStopDistM > cruiseHorizonM
        ) {
          accel = Math.min(
            this.kinematics.accelerationMps2 * 0.6,
            (ceilingSpeedMps - this.speedMps) / dt,
          );
        }
        this.integrateStep(dt, accel, ceilingSpeedMps, targetStopS, effectiveStopDistM);
        break;
      }

      case 'DECELERATING': {
        if (isBlockGoverning) {
          if (clearanceAheadM <= 0.15 || (clearanceAheadM <= 1.5 && this.speedMps <= 0.08)) {
            this.speedMps = 0;
            this.accelerationMps2 = 0;
            this.isHoldingForClearance = true;
            break;
          }
          const reqDecel =
            (this.speedMps * this.speedMps) / (2 * Math.max(0.05, clearanceAheadM));
          const decel = Math.min(
            this.kinematics.emergencyDecelerationMps2,
            Math.max(0.05, reqDecel),
          );
          this.integrateStep(dt, -decel, ceilingSpeedMps, targetStopS, clearanceAheadM);
          break;
        }

        // Exact kinematic station braking curve a = v^2 / (2 * distToStationM)
        const reqDecel =
          (this.speedMps * this.speedMps) / (2 * Math.max(0.05, distToStationM));
        const clampedDecel = Math.min(
          this.kinematics.emergencyDecelerationMps2,
          Math.max(0.02, reqDecel),
        );
        this.integrateStep(dt, -clampedDecel, ceilingSpeedMps, targetStopS, distToStationM);
        if (targetStopS - this.headArcLengthM <= approachZoneM) {
          this.transitionTo('APPROACHING_STATION');
        }
        break;
      }

      case 'APPROACHING_STATION': {
        if (isBlockGoverning && clearanceAheadM <= 0.25) {
          this.speedMps = 0;
          this.accelerationMps2 = 0;
          this.isHoldingForClearance = true;
          break;
        }
        const remM = Math.max(0.02, targetStopS - this.headArcLengthM);
        const reqDecel = (this.speedMps * this.speedMps) / (2 * remM);
        const clampedDecel = Math.min(
          this.kinematics.emergencyDecelerationMps2,
          Math.max(0.02, reqDecel),
        );
        this.integrateStep(dt, -clampedDecel, ceilingSpeedMps, targetStopS, remM);
        if (targetStopS - this.headArcLengthM <= stoppingZoneM) {
          this.transitionTo('STOPPING');
        }
        break;
      }

      case 'STOPPING': {
        const remM = targetStopS - this.headArcLengthM;
        if (remM > 0.02 && this.speedMps > 0.005) {
          const reqDecel = (this.speedMps * this.speedMps) / (2 * Math.max(0.005, remM));
          const decel = Math.min(
            this.kinematics.emergencyDecelerationMps2,
            Math.max(0.02, reqDecel),
          );
          const nextV = Math.max(0.15, this.speedMps - decel * dt);
          const avgV = 0.5 * (this.speedMps + nextV);
          const ds = avgV * dt;

          if (ds >= remM - 0.02 || remM <= 0.03) {
            // Precision stop latch right onto the platform target mark!
            this.totalDistanceTraveledM += Math.max(0, remM);
            this.headArcLengthM = targetStopS;
            this.speedMps = 0;
            this.accelerationMps2 = 0;
            // Reset stateTimerSec so stoppingSettleSec counts from full stop
            this.stateTimerSec = 0;
          } else {
            this.headArcLengthM += ds;
            this.totalDistanceTraveledM += ds;
            this.speedMps = nextV;
            this.accelerationMps2 = -decel;
          }
        } else {
          // Ensure exact stop alignment
          if (remM > 0) {
            this.totalDistanceTraveledM += remM;
          }
          this.headArcLengthM = targetStopS;
          this.speedMps = 0;
          this.accelerationMps2 = 0;
          if (this.stateTimerSec >= config.stoppingSettleSec - 1e-6) {
            this.transitionTo('DOORS_OPENING');
          }
        }
        break;
      }
    }
  }

  private integrateStep(
    dt: number,
    accelMps2: number,
    maxSpeedMps: number,
    targetStopS: number,
    maxAdvanceM: number,
  ): void {
    const prevV = this.speedMps;
    let nextV = prevV + accelMps2 * dt;
    if (accelMps2 > 0 && nextV > maxSpeedMps) {
      nextV = maxSpeedMps;
    }
    if (nextV < 0) {
      nextV = 0;
    }

    let ds = 0.5 * (prevV + nextV) * dt;
    if (ds > maxAdvanceM) {
      ds = Math.max(0, maxAdvanceM);
      nextV = 0;
    }
    if (this.headArcLengthM + ds > targetStopS) {
      ds = Math.max(0, targetStopS - this.headArcLengthM);
      nextV = 0;
    }

    this.headArcLengthM += ds;
    this.totalDistanceTraveledM += ds;
    this. accelerationMps2 = dt > 1e-6 ? (nextV - prevV) / dt : 0;
    this.speedMps = nextV;
  }

  /**
   * Builds the pure TypeScript `SimulatedTrainSnapshot` for the Scene and UI systems.
   */
  toSnapshot(): SimulatedTrainSnapshot {
    const route = this.routeBundle.route;
    const spline = this.routeBundle.spline;
    const carriages = solveConsistCarriagePoses(
      spline,
      this.consist,
      this.spec,
      this.headArcLengthM,
    );

    const headSample = spline.sampleAtArcLength(this.headArcLengthM);
    const leadCar = carriages[0];
    const position = leadCar ? leadCar.position : headSample.position;
    const orientation = leadCar
      ? leadCar.orientation
      : {
          forward: headSample.tangent,
          up: { x: 0, y: 1, z: 0 },
          right: { x: 1, y: 0, z: 0 },
          yawRad: Math.atan2(headSample.tangent.x, headSample.tangent.z),
          pitchRad: 0,
          rollRad: 0,
          quaternion: [0, 0, 0, 1] as const,
        };

    const originStop = route.stationStops[this.currentOriginStopIndex]!;
    const targetStop = route.stationStops[this.targetStopIndex]!;
    const targetStopS = this.getTargetStopArcLengthM();
    const originStopS = this.getOriginStopArcLengthM();
    const intervalSpanM = Math.max(1, targetStopS - originStopS);
    const remDistM = Math.max(0, targetStopS - this.headArcLengthM);
    const progress01 = Math.max(
      0,
      Math.min(1, (this.headArcLengthM - originStopS) / intervalSpanM),
    );

    const isAtStationState =
      this.state === 'INITIALIZING' ||
      this.state === 'READY_TO_DEPART' ||
      this.state === 'STOPPING' ||
      this.state === 'DOORS_OPENING' ||
      this.state === 'DWELLING' ||
      this.state === 'DOORS_CLOSING' ||
      this.state === 'TERMINAL_TURNAROUND';

    const activeStationStop = isAtStationState
      ? remDistM <= 5.0
        ? targetStop
        : originStop
      : null;

    const locationStatus: TrainLocationStatus = {
      kind: isAtStationState ? 'at_station' : 'inter_station',
      currentStationId: activeStationStop?.stationId ?? null,
      currentStationNameJa: activeStationStop?.nameJa ?? null,
      currentStationNameEn: activeStationStop?.nameEn ?? null,
      currentPlatformId: activeStationStop?.platformId ?? null,
      fromStationId: originStop.stationId,
      fromStationNameJa: originStop.nameJa,
      toStationId: targetStop.stationId,
      toStationNameJa: targetStop.nameJa,
      currentSegmentId: headSample.trackSegmentId,
      intervalProgress01: Math.round(progress01 * 1000) / 1000,
      distanceToNextStationM: Math.round(remDistM * 100) / 100,
      currentTier: headSample.tier,
      currentStructure: headSample.structure,
    };

    return {
      trainId: this.trainId,
      rollingStockId: this.spec.rollingStockId,
      modelCode: this.spec.modelCode,
      lineId: route.lineId,
      operatorId: route.operatorId,
      routeId: route.routeId,
      lineColor: route.color,
      direction: route.direction,
      operationMode: route.mode,
      state: this.state,
      stateTimerSec: Math.round(this.stateTimerSec * 1000) / 1000,
      position,
      orientation,
      speedMps: Math.round(this.speedMps * 1000) / 1000,
      speedKph: Math.round(this.speedMps * 3.6 * 100) / 100,
      accelerationMps2: Math.round(this.accelerationMps2 * 1000) / 1000,
      headArcLengthM: Math.round(spline.normalizeArcLength(this.headArcLengthM) * 1000) / 1000,
      tailArcLengthM:
        Math.round(
          spline.normalizeArcLength(this.headArcLengthM - this.consist.totalLengthM) * 1000,
        ) / 1000,
      totalDistanceTraveledM: Math.round(this.totalDistanceTraveledM * 100) / 100,
      completedLapsOrTurnarounds: this.completedLapsOrTurnarounds,
      isTerminated: this.isTerminated,
      doorsOpenRatio: Math.round(this.doorsOpenRatio * 100) / 100,
      carriages,
      locationStatus,
      occupancyStatus: {
        occupiedBlockIds: this.lastClearance.occupiedBlockIds,
        blockedByTrainId: this.lastClearance.blockedByTrainId,
        clearanceAheadM:
          this.lastClearance.clearanceAheadM !== null
            ? Math.round(this.lastClearance.clearanceAheadM * 100) / 100
            : null,
        isHoldingForClearance: this.isHoldingForClearance,
      },
      simulationLabel: SIMULATION_LABEL,
      dataNature: 'synthetic',
      isRealtimeData: false,
    };
  }
}
