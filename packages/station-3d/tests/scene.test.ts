// @vitest-environment jsdom
import { BoxGeometry, InstancedMesh, MeshLambertMaterial } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StationSceneController } from '../src/scene/StationSceneController.ts';
import { fixtureHub, pl } from './fixtures.ts';

const gpu = vi.hoisted(() => ({
  render: vi.fn(),
  release: vi.fn(),
  loseContext: vi.fn(),
}));

vi.mock('three', async (importOriginal) => ({
  ...(await importOriginal<typeof import('three')>()),
  WebGLRenderer: class {
    readonly domElement: HTMLCanvasElement;
    readonly info = { render: { calls: 1 } };
    constructor({ canvas }: { canvas: HTMLCanvasElement }) {
      this.domElement = canvas;
    }
    setPixelRatio() {}
    setSize() {}
    render = gpu.render;
    dispose = gpu.release;
    forceContextLoss = gpu.loseContext;
  },
}));

function setup() {
  vi.stubGlobal('WebGL2RenderingContext', class {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as WebGL2RenderingContext);
  const raf = new Map<number, FrameRequestCallback>();
  let next = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((draw) => {
    next += 1;
    raf.set(next, draw);
    return next;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((key) => {
    raf.delete(key);
  });
  const tick = (time: number) => {
    const batch = [...raf.values()];
    raf.clear();
    for (const draw of batch) {
      draw(time);
    }
  };
  const host = document.createElement('div');
  Object.defineProperties(host, { clientWidth: { value: 800 }, clientHeight: { value: 600 } });
  const scene = new StationSceneController(host);
  return { scene, raf, tick, host };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('StationSceneController', () => {
  it('exposes state without a WebGL context', () => {
    const host = document.createElement('div');
    const scene = new StationSceneController(host);
    const hub = fixtureHub();
    scene.setDataset(hub);
    scene.setLocale('zh-CN');
    scene.setTheme('dark');
    expect(scene.getState()).toMatchObject({
      datasetId: hub.complex.id,
      webglAvailable: false,
      locale: 'zh-CN',
      theme: 'dark',
    });
    expect(scene.getStats()).toMatchObject({ framesRendered: 0, framePending: false });
    expect(host.children).toHaveLength(0);
    scene.dispose();
  });

  it('coalesces invalidations into one instanced draw and stays idle afterwards', () => {
    const { scene, raf, tick, host } = setup();
    const hub = fixtureHub();
    scene.setDataset(hub);
    const allInstances = scene.getStats().instances;
    scene.setActiveLevel(0);
    scene.setSelection(pl('hall'));
    scene.setTheme('dark');
    scene.setLocale('en');
    expect(raf.size).toBe(1);
    tick(0);
    expect(scene.getStats()).toMatchObject({
      drawCalls: 1,
      framesRendered: 1,
      framePending: false,
    });
    expect(scene.getStats().instances).toBeLessThan(allInstances);
    expect(host.querySelector('canvas')?.getAttribute('aria-label')).toBe('Test hub · 3D');
    tick(1000);
    expect(gpu.render).toHaveBeenCalledTimes(1);
    scene.setSelection(pl('hall'));
    expect(raf.size).toBe(0);
    scene.dispose();
  });

  it('schedules focus only until the camera settles', () => {
    const { scene, raf, tick } = setup();
    scene.setDataset(fixtureHub());
    tick(0);
    scene.focusPlace(pl('hall'));
    const now = performance.now();
    tick(now + 120);
    expect(raf.size).toBe(1);
    tick(now + 400);
    expect(raf.size).toBe(0);
    expect(scene.getStats().framesRendered).toBe(3);
    scene.dispose();
  });

  it('disposes mesh buffers, shared geometry and material, canvas, and GPU once', () => {
    const { scene, raf, host } = setup();
    const instances = vi.spyOn(InstancedMesh.prototype, 'dispose');
    const geometry = vi.spyOn(BoxGeometry.prototype, 'dispose');
    const material = vi.spyOn(MeshLambertMaterial.prototype, 'dispose');
    scene.setDataset(fixtureHub());
    scene.setActiveLevel(0);
    expect(instances).toHaveBeenCalledTimes(1);
    scene.dispose();
    scene.dispose();
    expect(instances).toHaveBeenCalledTimes(2);
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
    expect(gpu.release).toHaveBeenCalledTimes(1);
    expect(gpu.loseContext).toHaveBeenCalledTimes(1);
    expect(host.children).toHaveLength(0);
    expect(raf.size).toBe(0);
    window.dispatchEvent(new Event('resize'));
    expect(raf.size).toBe(0);
    expect(scene.getState().disposed).toBe(true);
  });
});
