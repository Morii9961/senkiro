import type { Locale, StationHubDataset, StationRouteFound } from '@senkiro/contracts';
import {
  Box3,
  BoxGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  InstancedMesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { nameText, t } from '../i18n.ts';
import type { StationSelectionId } from '../plan2d/StationPlan2D.tsx';
import { STATION_PALETTES, type StationTheme } from '../theme.ts';
import { buildStationInstances } from './geometry.ts';

interface SceneOptions {
  onSelect?: (id: StationSelectionId | null) => void;
}

const VIEW = new Vector3(0.7, 1.05, 1).normalize();
const FOCUS_MS = 260;

function createRenderer(host: HTMLElement): WebGLRenderer | null {
  if (
    !host.ownerDocument.defaultView ||
    !('WebGL2RenderingContext' in host.ownerDocument.defaultView)
  ) {
    return null;
  }
  const canvas = host.ownerDocument.createElement('canvas');
  try {
    const context = canvas.getContext('webgl2', { antialias: true });
    return context === null ? null : new WebGLRenderer({ canvas, context });
  } catch {
    return null;
  }
}

export class StationSceneController {
  private readonly window: Window;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(42, 1, 0.1, 5000);
  private readonly geometry = new BoxGeometry();
  private readonly material = new MeshLambertMaterial();
  private readonly renderer: WebGLRenderer | null;
  private readonly controls: OrbitControls | null;
  private readonly observer: ResizeObserver | null = null;
  private readonly ray = new Raycaster();
  private readonly light = new HemisphereLight('#ffffff', '#8f959e', 1.2);
  private readonly key = new DirectionalLight('#fff7ec', 1.1);
  private readonly color = new Color();
  private dataset: StationHubDataset | null = null;
  private model: ReturnType<typeof buildStationInstances> | null = null;
  private mesh: InstancedMesh | null = null;
  private activeLevel: number | null = null;
  private exploded = false;
  private selection: StationSelectionId | null = null;
  private route = new Set<StationSelectionId>();
  private theme: StationTheme = 'light';
  private locale: Locale = 'ja';
  private disposed = false;
  private frame: number | null = null;
  private framesRendered = 0;
  private presses = new Map<number, Vector2>();
  private focus: {
    start: number;
    from: Vector3;
    to: Vector3;
    offset: Vector3;
    endOffset: Vector3;
  } | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly options: SceneOptions = {},
  ) {
    this.window = host.ownerDocument.defaultView ?? window;
    this.key.position.set(-45, 90, 60);
    this.scene.add(this.light, this.key);
    this.scene.background = new Color(STATION_PALETTES.light.background);
    this.renderer = createRenderer(host);
    if (!this.renderer) {
      this.controls = null;
      return;
    }

    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    host.appendChild(canvas);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.addEventListener('change', this.invalidate);
    this.controls.addEventListener('start', this.cancelFocus);
    this.controls.listenToKeyEvents(canvas);
    canvas.addEventListener('pointerdown', this.pointerDown);
    canvas.addEventListener('pointerup', this.pointerUp);
    canvas.addEventListener('pointercancel', this.clearPress);
    if (typeof ResizeObserver === 'function') {
      this.observer = new ResizeObserver(this.resize);
      this.observer.observe(host);
    } else {
      this.window.addEventListener('resize', this.resize);
    }
    this.updateLabel();
    this.resize();
    this.resetView();
  }

  getState() {
    return Object.freeze({
      datasetId: this.dataset?.complex.id ?? null,
      activeLevel: this.activeLevel,
      exploded: this.exploded,
      selectedId: this.selection,
      theme: this.theme,
      locale: this.locale,
      webglAvailable: this.renderer !== null && !this.disposed,
      disposed: this.disposed,
    });
  }

  getStats() {
    return Object.freeze({
      instances: this.model?.instances.length ?? 0,
      drawCalls: this.disposed ? 0 : (this.renderer?.info.render.calls ?? 0),
      framesRendered: this.framesRendered,
      framePending: this.frame !== null,
    });
  }

  setDataset(dataset: StationHubDataset): void {
    if (this.disposed || dataset === this.dataset) {
      return;
    }
    if (dataset.complex.id !== this.dataset?.complex.id) {
      this.activeLevel = null;
      this.selection = null;
      this.route.clear();
    }
    this.dataset = dataset;
    this.updateLabel();
    this.rebuild();
    this.resetView();
  }

  /** Level ordinal shared by operators on the same storey. Null shows all storeys. */
  setActiveLevel(ordinal: number | null): void {
    if (this.disposed || this.activeLevel === ordinal) {
      return;
    }
    this.activeLevel = ordinal;
    this.rebuild();
    this.resetView();
  }

  setExploded(exploded: boolean): void {
    if (this.disposed || this.exploded === exploded) {
      return;
    }
    this.exploded = exploded;
    this.rebuild();
    this.resetView();
  }

  setSelection(id: StationSelectionId | null): void {
    if (this.disposed || this.selection === id) {
      return;
    }
    this.selection = id;
    this.paint();
  }

  setRoute(route: StationRouteFound | null): void {
    if (this.disposed) {
      return;
    }
    this.route.clear();
    for (const step of route?.steps ?? []) {
      this.route.add(step.fromPlaceId);
      this.route.add(step.toPlaceId);
      this.route.add(step.linkId);
    }
    this.paint();
  }

  setTheme(theme: StationTheme): void {
    if (this.disposed || this.theme === theme) {
      return;
    }
    this.theme = theme;
    this.scene.background = new Color(STATION_PALETTES[theme].background);
    this.light.groundColor.set(theme === 'dark' ? '#8f959e' : '#a8a296');
    this.key.color.set(theme === 'dark' ? '#fff7ec' : '#ffffff');
    this.paint();
  }

  setLocale(locale: Locale): void {
    if (this.disposed || this.locale === locale) {
      return;
    }
    this.locale = locale;
    this.updateLabel();
    this.invalidate();
  }

  focusPlace(id: StationSelectionId): void {
    const anchor = this.model?.anchors.get(id);
    const controls = this.controls;
    if (!anchor || !controls || this.disposed) {
      return;
    }
    const offset = this.camera.position.clone().sub(controls.target);
    const endOffset = offset.clone().setLength(Math.min(offset.length(), 19));
    if (this.window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this.focus = null;
      controls.target.copy(anchor);
      this.camera.position.copy(anchor).add(endOffset);
      controls.update();
    } else {
      this.focus = {
        start: this.window.performance.now(),
        from: controls.target.clone(),
        to: anchor,
        offset,
        endOffset,
      };
    }
    this.invalidate();
  }

  resetView(): void {
    if (!this.controls || this.disposed) {
      return;
    }
    this.cancelFocus();
    const sphere = (this.mesh?.boundingBox ?? new Box3()).getBoundingSphere(new Sphere());
    const radius = Math.max(5, sphere.radius);
    const vertical = (this.camera.fov * Math.PI) / 360;
    const halfFov = Math.min(vertical, Math.atan(Math.tan(vertical) * this.camera.aspect));
    const distance = (radius / Math.sin(halfFov)) * 1.08;
    this.controls.minDistance = 2;
    this.controls.maxDistance = distance * 3;
    this.controls.target.copy(sphere.center);
    this.camera.far = distance * 5 + radius;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(sphere.center).addScaledVector(VIEW, distance);
    this.controls.update();
    this.invalidate();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    if (this.frame !== null) {
      this.window.cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    this.cancelFocus();
    this.observer?.disconnect();
    this.window.removeEventListener('resize', this.resize);
    this.controls?.removeEventListener('change', this.invalidate);
    this.controls?.removeEventListener('start', this.cancelFocus);
    this.controls?.dispose();
    const canvas = this.renderer?.domElement;
    canvas?.removeEventListener('pointerdown', this.pointerDown);
    canvas?.removeEventListener('pointerup', this.pointerUp);
    canvas?.removeEventListener('pointercancel', this.clearPress);
    this.presses.clear();
    this.clearMesh();
    this.scene.clear();
    this.geometry.dispose();
    this.material.dispose();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    canvas?.remove();
    this.dataset = null;
    this.model = null;
    this.route.clear();
    this.selection = null;
  }

  private updateLabel(): void {
    if (this.renderer) {
      const name = this.dataset && nameText(this.dataset.complex.names, this.locale);
      this.renderer.domElement.setAttribute(
        'aria-label',
        [name, t(this.locale, 'view3d')].filter(Boolean).join(' · '),
      );
    }
  }

  private clearMesh(): void {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.dispose();
      this.mesh = null;
    }
  }

  private rebuild(): void {
    if (!this.dataset) {
      return;
    }
    this.clearMesh();
    this.model = buildStationInstances(this.dataset, this.activeLevel, this.exploded);
    if (this.renderer && this.model.instances.length > 0) {
      const mesh = new InstancedMesh(this.geometry, this.material, this.model.instances.length);
      for (const [index, instance] of this.model.instances.entries()) {
        mesh.setMatrixAt(index, instance.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      this.mesh = mesh;
      this.scene.add(mesh);
    }
    this.paint();
  }

  private paint(): void {
    if (this.mesh && this.model) {
      const palette = STATION_PALETTES[this.theme];
      for (const [i, part] of this.model.instances.entries()) {
        const tone =
          part.owner === this.selection
            ? 'selection'
            : this.route.has(part.owner)
              ? 'route'
              : part.tone;
        this.mesh.setColorAt(i, this.color.set(palette[tone]));
      }
      if (this.mesh.instanceColor) {
        this.mesh.instanceColor.needsUpdate = true;
      }
    }
    this.invalidate();
  }

  private readonly resize = () => {
    if (!this.renderer || this.disposed) {
      return;
    }
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(this.window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    this.invalidate();
  };

  private readonly invalidate = () => {
    if (this.disposed || !this.renderer || this.frame !== null) {
      return;
    }
    this.frame = this.window.requestAnimationFrame(this.draw);
  };

  private readonly draw = (now: number) => {
    if (!this.renderer || !this.controls || this.disposed) {
      this.frame = null;
      return;
    }
    if (this.focus) {
      const { from, to, offset, endOffset, start } = this.focus;
      const progress = Math.max(0, Math.min(1, (now - start) / FOCUS_MS));
      const eased = 1 - (1 - progress) ** 3;
      this.controls.target.lerpVectors(from, to, eased);
      this.camera.position.lerpVectors(offset, endOffset, eased).add(this.controls.target);
      this.controls.update();
      if (progress === 1) {
        this.focus = null;
      }
    }
    this.renderer.render(this.scene, this.camera);
    this.framesRendered += 1;
    this.frame = null;
    if (this.focus) {
      this.invalidate();
    }
  };

  private readonly cancelFocus = () => {
    this.focus = null;
  };

  private readonly pointerDown = (event: PointerEvent) => {
    if (event.button === 0 && event.isPrimary) {
      this.presses.set(event.pointerId, new Vector2(event.clientX, event.clientY));
    } else {
      this.presses.clear();
    }
  };

  private readonly clearPress = (event: PointerEvent) => {
    this.presses.delete(event.pointerId);
  };

  private readonly pointerUp = (event: PointerEvent) => {
    const press = this.presses.get(event.pointerId);
    this.clearPress(event);
    const bounds = this.renderer?.domElement.getBoundingClientRect();
    if (
      !press ||
      Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5 ||
      !bounds?.width ||
      !bounds.height
    ) {
      return;
    }
    const cursor = new Vector2(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      1 - ((event.clientY - bounds.top) / bounds.height) * 2,
    );
    this.camera.updateMatrixWorld();
    this.ray.setFromCamera(cursor, this.camera);
    const instance = this.mesh && this.ray.intersectObject(this.mesh, false)[0]?.instanceId;
    this.options.onSelect?.(
      typeof instance === 'number' ? (this.model?.instances[instance]?.owner ?? null) : null,
    );
  };
}
