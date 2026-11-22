/**
 * Unified Dual-Mode 3D Spatial Camera Controller (P6: Map Browse + Free Explore).
 *
 * Mode 1 — Map Browse Mode ('map', default):
 *  - Left mouse drag: smooth damped Orbit rotation
 *  - Middle mouse hold + drag: continuous free ground-plane pan (browser auto-scroll suppressed!)
 *  - Right mouse drag: ground-plane pan
 *  - Wheel: smooth damped zoom with adaptive altitude-scaled pan speed
 *  - Double-click: raycast 3D object/terrain & smoothly fly focus target onto clicked location
 *  - Reset View: one-click smooth return to Tokyo 23-ward overview
 *
 * Mode 2 — Free Explore Mode ('free', optional toggle):
 *  - WASD / Arrow keys: horizontal flight along camera heading
 *  - Mouse drag (left or right): smooth yaw/pitch look (clamped ±82°, zero gimbal flip)
 *  - Q / E or Shift / Space: vertical descend / ascend
 *  - Speed selector: Slow (140 m/s) / Normal (380 m/s) / Fast (920 m/s)
 *  - Ground & metropolitan safety bounds (never clips below ground surface or underground pit floor)
 *
 * Seamless state sync between Map Browse <-> Free Explore and 2D <-> 3D with zero camera jump!
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CameraMoveSpeed, CameraNavMode } from './types.js';

interface CameraAnim {
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  startTarget: THREE.Vector3;
  endTarget: THREE.Vector3;
  startTime: number;
  durationMs: number;
}

const SPEED_MPS: Record<CameraMoveSpeed, number> = {
  slow: 140,
  normal: 380,
  fast: 920,
};

const MAX_EXTENT_XZ = 26_000;
const MAX_ALTITUDE = 15_000;

export class SpatialCameraController {
  readonly controls: OrbitControls;

  private readonly camera: THREE.PerspectiveCamera;
  private readonly domElement: HTMLElement;
  private readonly onCameraMoved?: () => void;

  private mode: CameraNavMode = 'map';
  private moveSpeed: CameraMoveSpeed = 'normal';
  private anim: CameraAnim | null = null;
  private undergroundAllowed = false;
  private minUndergroundY = -62;

  // Free Explore orientation (YXZ Euler: yaw around Y, pitch around X)
  private yaw = 0;
  private pitch = -0.5;
  private readonly pressedKeys = new Set<string>();
  private freeDragging = false;
  private lastDragX = 0;
  private lastDragY = 0;
  private readonly focusProxy = new THREE.Vector3();

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    onCameraMoved?: () => void,
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.onCameraMoved = onCameraMoved;

    this.controls = new OrbitControls(camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = false; // Pan strictly along horizontal ground plane!
    this.controls.minDistance = 85;
    this.controls.maxDistance = 18_500;
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.zoomSpeed = 1.05;
    this.controls.rotateSpeed = 0.72;
    this.controls.panSpeed = 1.05;

    // P6: Left-drag = Orbit, Middle-mouse hold+drag = Continuous free ground-plane pan, Right-drag = Pan!
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN,
    };

    this.controls.addEventListener('end', this.handleControlsEnd);
    this.domElement.addEventListener('mousedown', this.handleMouseDown);
    this.domElement.addEventListener('auxclick', this.handleAuxClick);
    this.domElement.addEventListener('pointerdown', this.handleFreePointerDown);
    this.domElement.addEventListener('pointermove', this.handleFreePointerMove);
    this.domElement.addEventListener('pointerup', this.handleFreePointerUp);
    this.domElement.addEventListener('wheel', this.handleFreeWheel, { passive: false });
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
  }

  getMode(): CameraNavMode {
    return this.mode;
  }

  getSpeed(): CameraMoveSpeed {
    return this.moveSpeed;
  }

  setSpeed(speed: CameraMoveSpeed): void {
    this.moveSpeed = speed;
  }

  setUndergroundBounds(enabled: boolean, verticalExaggeration = 1.0): void {
    this.undergroundAllowed = enabled;
    this.minUndergroundY = -60 * Math.max(1.0, verticalExaggeration);
    this.controls.maxPolarAngle = enabled ? Math.PI * 0.76 : Math.PI * 0.47;
  }

  /**
   * Seamless mode toggle between Map Browse ('map') and Free Explore ('free') with zero jump!
   */
  setMode(nextMode: CameraNavMode): void {
    if (this.mode === nextMode) return;
    this.anim = null;
    this.pressedKeys.clear();
    this.freeDragging = false;

    if (nextMode === 'free') {
      // Extract exact yaw & pitch from current camera orientation
      this.camera.lookAt(this.controls.target);
      const euler = new THREE.Euler(0, 0, 0, 'YXZ').setFromQuaternion(this.camera.quaternion, 'YXZ');
      this.yaw = euler.y;
      this.pitch = THREE.MathUtils.clamp(euler.x, -Math.PI * 0.45, Math.PI * 0.45);
      this.controls.enabled = false;
      this.mode = 'free';
    } else {
      // Project current free camera look direction forward to anchor OrbitControls target seamlessly!
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
      let tDist = 650;
      if (forward.y < -0.06 && this.camera.position.y > 0) {
        tDist = THREE.MathUtils.clamp(-this.camera.position.y / forward.y, 180, 5200);
      }
      this.controls.target
        .copy(this.camera.position)
        .addScaledVector(forward, tDist);
      this.clampTarget();
      this.mode = 'map';
      this.controls.enabled = true;
      this.controls.update();
    }
    this.onCameraMoved?.();
  }

  /**
   * Returns current focus point (OrbitControls target in map mode, projected look point in free mode)
   * so chunk streaming, shadow frustum, radial cutaway pit & 2D sync work identically in both modes!
   */
  getFocusTarget(): THREE.Vector3 {
    if (this.mode === 'map') {
      return this.controls.target;
    }
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    const dist =
      forward.y < -0.08 && this.camera.position.y > 0
        ? THREE.MathUtils.clamp(-this.camera.position.y / forward.y, 150, 2400)
        : 550;
    this.focusProxy.copy(this.camera.position).addScaledVector(forward, dist);
    this.focusProxy.y = Math.max(-50, Math.min(200, this.focusProxy.y));
    return this.focusProxy;
  }

  getDistanceToFocus(): number {
    return this.camera.position.distanceTo(this.getFocusTarget());
  }

  cancelAnimation(): void {
    this.anim = null;
  }

  sphericalToPos(
    target: THREE.Vector3,
    distance: number,
    polarDeg: number,
    azimuthDeg: number,
  ): THREE.Vector3 {
    const phi = THREE.MathUtils.degToRad(polarDeg);
    const theta = THREE.MathUtils.degToRad(azimuthDeg);
    const sinPhi = Math.sin(phi);
    return new THREE.Vector3(
      target.x + distance * sinPhi * Math.sin(theta),
      target.y + distance * Math.cos(phi),
      target.z + distance * sinPhi * Math.cos(theta),
    );
  }

  jumpTo(target: THREE.Vector3, distance: number, polarDeg: number, azimuthDeg: number): void {
    this.anim = null;
    const pos = this.sphericalToPos(target, distance, polarDeg, azimuthDeg);
    this.controls.target.copy(target);
    this.camera.position.copy(pos);
    this.camera.lookAt(target);
    if (this.mode === 'free') {
      const euler = new THREE.Euler(0, 0, 0, 'YXZ').setFromQuaternion(this.camera.quaternion, 'YXZ');
      this.yaw = euler.y;
      this.pitch = THREE.MathUtils.clamp(euler.x, -Math.PI * 0.45, Math.PI * 0.45);
    } else {
      this.controls.update();
    }
  }

  animateTo(
    endTarget: THREE.Vector3,
    distance: number,
    polarDeg: number,
    azimuthDeg: number,
    durationMs = 680,
  ): void {
    const endPos = this.sphericalToPos(endTarget, distance, polarDeg, azimuthDeg);
    this.anim = {
      startPos: this.camera.position.clone(),
      endPos,
      startTarget: this.getFocusTarget().clone(),
      endTarget: endTarget.clone(),
      startTime: performance.now(),
      durationMs,
    };
  }

  /**
   * Smoothly flies to a 3D world point picked via double-click, preserving current viewing angle!
   */
  focusWorldPoint(point: THREE.Vector3, durationMs = 620): void {
    const curTarget = this.getFocusTarget();
    const offset = new THREE.Vector3().subVectors(this.camera.position, curTarget);
    const curDist = offset.length();
    // Zoom in smoothly to an informative architectural inspection distance (280m .. 1400m)
    const nextDist = THREE.MathUtils.clamp(curDist * 0.52, 260, 1450);
    if (curDist > 1) {
      offset.multiplyScalar(nextDist / curDist);
    } else {
      offset.set(0, nextDist * 0.65, nextDist * 0.75);
    }
    const endPos = point.clone().add(offset);
    const minY = this.undergroundAllowed ? this.minUndergroundY : 12;
    endPos.y = Math.max(minY, endPos.y);

    this.anim = {
      startPos: this.camera.position.clone(),
      endPos,
      startTarget: curTarget.clone(),
      endTarget: point.clone(),
      startTime: performance.now(),
      durationMs,
    };
  }

  /**
   * Called once per animation frame with delta time in seconds.
   */
  update(now: number, dtSec: number): void {
    if (this.anim) {
      const elapsed = (now - this.anim.startTime) / this.anim.durationMs;
      if (elapsed >= 1) {
        this.camera.position.copy(this.anim.endPos);
        this.controls.target.copy(this.anim.endTarget);
        this.camera.lookAt(this.anim.endTarget);
        if (this.mode === 'free') {
          const e = new THREE.Euler(0, 0, 0, 'YXZ').setFromQuaternion(this.camera.quaternion, 'YXZ');
          this.yaw = e.y;
          this.pitch = THREE.MathUtils.clamp(e.x, -Math.PI * 0.45, Math.PI * 0.45);
        }
        this.anim = null;
        this.onCameraMoved?.();
      } else {
        const ease = elapsed * elapsed * (3 - 2 * elapsed);
        this.camera.position.lerpVectors(this.anim.startPos, this.anim.endPos, ease);
        this.controls.target.lerpVectors(this.anim.startTarget, this.anim.endTarget, ease);
        this.camera.lookAt(this.controls.target);
        if (this.mode === 'free') {
          const e = new THREE.Euler(0, 0, 0, 'YXZ').setFromQuaternion(this.camera.quaternion, 'YXZ');
          this.yaw = e.y;
          this.pitch = THREE.MathUtils.clamp(e.x, -Math.PI * 0.45, Math.PI * 0.45);
        }
      }
      if (this.mode === 'map') this.controls.update();
      return;
    }

    if (this.mode === 'map') {
      // Adaptive pan speed scaled smoothly with altitude so middle-drag pan feels natural at every zoom!
      const dist = this.camera.position.distanceTo(this.controls.target);
      this.controls.panSpeed = THREE.MathUtils.clamp(0.85 + dist / 4500, 0.85, 2.2);
      this.controls.update();
      this.clampTarget();
      this.clampCameraBounds();
    } else {
      // Free Explore Mode: apply yaw/pitch orientation & smooth WASD/QE/Space/Shift flight
      const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
      this.camera.quaternion.setFromEuler(euler);

      const speed = SPEED_MPS[this.moveSpeed];
      // Horizontal heading forward/right vectors on XZ plane
      const forwardXZ = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const rightXZ = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const move = new THREE.Vector3();

      if (this.pressedKeys.has('KeyW') || this.pressedKeys.has('ArrowUp')) move.add(forwardXZ);
      if (this.pressedKeys.has('KeyS') || this.pressedKeys.has('ArrowDown')) move.sub(forwardXZ);
      if (this.pressedKeys.has('KeyD') || this.pressedKeys.has('ArrowRight')) move.add(rightXZ);
      if (this.pressedKeys.has('KeyA') || this.pressedKeys.has('ArrowLeft')) move.sub(rightXZ);

      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(speed * dtSec);
        this.camera.position.add(move);
      }

      // Vertical ascend (E / Space) and descend (Q / ShiftLeft / ShiftRight)
      let vMove = 0;
      if (this.pressedKeys.has('KeyE') || this.pressedKeys.has('Space')) vMove += 1;
      if (
        this.pressedKeys.has('KeyQ') ||
        this.pressedKeys.has('ShiftLeft') ||
        this.pressedKeys.has('ShiftRight')
      ) {
        vMove -= 1;
      }
      if (vMove !== 0) {
        this.camera.position.y += vMove * speed * 0.65 * dtSec;
      }

      this.clampCameraBounds();
      // Keep controls.target aligned cleanly in background
      this.controls.target.copy(this.getFocusTarget());
    }
  }

  private clampTarget(): void {
    this.controls.target.x = THREE.MathUtils.clamp(
      this.controls.target.x,
      -MAX_EXTENT_XZ,
      MAX_EXTENT_XZ,
    );
    this.controls.target.z = THREE.MathUtils.clamp(
      this.controls.target.z,
      -MAX_EXTENT_XZ,
      MAX_EXTENT_XZ,
    );
    const minY = this.undergroundAllowed ? this.minUndergroundY : -5;
    this.controls.target.y = THREE.MathUtils.clamp(this.controls.target.y, minY, 450);
  }

  private clampCameraBounds(): void {
    this.camera.position.x = THREE.MathUtils.clamp(
      this.camera.position.x,
      -MAX_EXTENT_XZ,
      MAX_EXTENT_XZ,
    );
    this.camera.position.z = THREE.MathUtils.clamp(
      this.camera.position.z,
      -MAX_EXTENT_XZ,
      MAX_EXTENT_XZ,
    );
    const minY = this.undergroundAllowed ? this.minUndergroundY : 10;
    this.camera.position.y = THREE.MathUtils.clamp(this.camera.position.y, minY, MAX_ALTITUDE);
  }

  private isTypingElement(el: EventTarget | null): boolean {
    if (!(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  private handleMouseDown = (e: MouseEvent): void => {
    // Prevent Windows/Chrome middle-click auto-scroll icon so middle-drag pans seamlessly!
    if (e.button === 1) {
      e.preventDefault();
    }
    this.anim = null;
  };

  private handleAuxClick = (e: MouseEvent): void => {
    if (e.button === 1) e.preventDefault();
  };

  private handleFreePointerDown = (e: PointerEvent): void => {
    if (this.mode !== 'free') return;
    if (e.button === 0 || e.button === 2) {
      this.freeDragging = true;
      this.lastDragX = e.clientX;
      this.lastDragY = e.clientY;
      this.anim = null;
    }
  };

  private handleFreePointerMove = (e: PointerEvent): void => {
    if (this.mode !== 'free' || !this.freeDragging) return;
    const dx = e.clientX - this.lastDragX;
    const dy = e.clientY - this.lastDragY;
    this.lastDragX = e.clientX;
    this.lastDragY = e.clientY;

    const sens = 0.0038;
    this.yaw -= dx * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * sens, -Math.PI * 0.45, Math.PI * 0.45);
  };

  private handleFreePointerUp = (): void => {
    if (this.freeDragging) {
      this.freeDragging = false;
      this.onCameraMoved?.();
    }
  };

  private handleFreeWheel = (e: WheelEvent): void => {
    if (this.mode !== 'free') return;
    e.preventDefault();
    this.anim = null;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    const step = (e.deltaY > 0 ? -1 : 1) * SPEED_MPS[this.moveSpeed] * 0.16;
    this.camera.position.addScaledVector(forward, step);
    this.clampCameraBounds();
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (this.mode !== 'free') return;
    if (this.isTypingElement(e.target) || this.isTypingElement(document.activeElement)) return;
    if (
      [
        'KeyW',
        'KeyA',
        'KeyS',
        'KeyD',
        'KeyQ',
        'KeyE',
        'Space',
        'ShiftLeft',
        'ShiftRight',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
      ].includes(e.code)
    ) {
      e.preventDefault();
      this.anim = null;
      this.pressedKeys.add(e.code);
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    if (this.pressedKeys.delete(e.code) && this.mode === 'free') {
      this.onCameraMoved?.();
    }
  };

  private handleWindowBlur = (): void => {
    this.pressedKeys.clear();
    this.freeDragging = false;
  };

  private handleControlsEnd = (): void => {
    this.onCameraMoved?.();
  };

  dispose(): void {
    this.controls.removeEventListener('end', this.handleControlsEnd);
    this.domElement.removeEventListener('mousedown', this.handleMouseDown);
    this.domElement.removeEventListener('auxclick', this.handleAuxClick);
    this.domElement.removeEventListener('pointerdown', this.handleFreePointerDown);
    this.domElement.removeEventListener('pointermove', this.handleFreePointerMove);
    this.domElement.removeEventListener('pointerup', this.handleFreePointerUp);
    this.domElement.removeEventListener('wheel', this.handleFreeWheel);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    this.controls.dispose();
  }
}
