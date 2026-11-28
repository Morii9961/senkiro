/**
 * WebGPU-Ready High-Realism Renderer Factory & Subtle HDR Bloom Post-Processing Wrapper.
 *
 * Inspects hardware GPU capability (`navigator.gpu`), configures Three.js WebGL2 rendering
 * at maximum architectural realism (logarithmic depth buffer, 2048x2048 PCFSoft shadows,
 * max texture anisotropy, ACES Filmic HDR tone mapping, PMREM IBL), and wraps an optional
 * multisampled HDR `EffectComposer` + `UnrealBloomPass` + `OutputPass` pipeline that keeps
 * `preserveDrawingBuffer` and `readPixels` intact while giving sunset/night Tokyo windows,
 * train headlights, and neon accents a subtle cinematic glow.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

export type RendererBackendLabel = 'WebGPU' | 'WebGL2';

export interface WebGpuCapabilityReport {
  supported: boolean;
  adapterName: string | null;
}

export interface OptimalRendererOptions {
  /** Enable subtle HDR bloom post-processing (high threshold 0.88; day 0.10 / night 0.28). Defaults to true. */
  enableBloom?: boolean;
  /** Maximum device pixel ratio cap (defaults to 2). */
  maxPixelRatio?: number;
  /** Initial night factor [0..1] used to calibrate bloom strength. */
  initialNightFactor?: number;
}

export interface OptimalRendererBundle {
  readonly renderer: THREE.WebGLRenderer;
  readonly backendLabel: RendererBackendLabel;
  readonly webGpuSupported: boolean;
  readonly maxAnisotropy: number;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  setSize(width: number, height: number): void;
  setNightFactor(nightFactor: number): void;
  setBloomTuning(strength: number, threshold: number): void;
  setBloomEnabled(enabled: boolean): void;
  isBloomEnabled(): boolean;
  getSceneRenderStats(): { calls: number; triangles: number };
  dispose(): void;
}

interface NavigatorWithGpu extends Navigator {
  gpu?: {
    requestAdapter: () => Promise<{
      info?: {
        description?: string;
        architecture?: string;
        vendor?: string;
      };
    } | null>;
  };
}

/**
 * Probes hardware WebGPU adapter availability asynchronously without failing on unsupported browsers.
 */
export async function probeWebGpuCapability(): Promise<WebGpuCapabilityReport> {
  if (typeof navigator === 'undefined') {
    return { supported: false, adapterName: null };
  }
  const gpu = (navigator as NavigatorWithGpu).gpu;
  if (!gpu || typeof gpu.requestAdapter !== 'function') {
    return { supported: false, adapterName: null };
  }
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return { supported: false, adapterName: null };
    const info = adapter.info;
    const adapterName =
      info?.description?.trim() ||
      [info?.vendor, info?.architecture].filter(Boolean).join(' ').trim() ||
      'WebGPU Hardware Adapter';
    return { supported: true, adapterName };
  } catch {
    return { supported: false, adapterName: null };
  }
}

/**
 * Upgrades a directional sun light to crisp 2048x2048 soft architectural shadows.
 */
export function configureHighQualitySunShadow(
  light: THREE.DirectionalLight,
  spanM = 1850,
): void {
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.camera.near = 150;
  light.shadow.camera.far = 8800;
  light.shadow.camera.left = -spanM;
  light.shadow.camera.right = spanM;
  light.shadow.camera.top = spanM;
  light.shadow.camera.bottom = -spanM;
  light.shadow.bias = -0.00025;
  light.shadow.normalBias = 1.2;
  light.shadow.camera.updateProjectionMatrix();
}

/**
 * Sanitizes HalfFloat HDR render buffer pixels before UnrealBloomPass so any Inf/NaN
 * from extreme grazing GGX specular highlights cannot poison the Gaussian bloom pyramid.
 */
const HDR_SANITIZE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    float sanitizeChannel(float v) {
      return (v >= 0.0 && v <= 65000.0) ? min(v, 6.0) : 0.0;
    }
    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      gl_FragColor = vec4(
        sanitizeChannel(tex.r),
        sanitizeChannel(tex.g),
        sanitizeChannel(tex.b),
        1.0
      );
    }
  `,
};

/**
 * Creates a maximally configured Three.js renderer with optional multisampled HDR bloom
 * post-processing and hardware WebGPU capability detection.
 */
export function createOptimalRenderer(
  container: HTMLElement,
  options: OptimalRendererOptions = {},
): OptimalRendererBundle {
  const width = Math.max(1, container.clientWidth || 960);
  const height = Math.max(1, container.clientHeight || 640);
  let maxDpr = options.maxPixelRatio ?? 2;
  const getClampedPixelRatio = (): number =>
    typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, maxDpr) : 1;
  let pixelRatio = getClampedPixelRatio();

  const webGpuSupported =
    typeof navigator !== 'undefined' &&
    Boolean((navigator as NavigatorWithGpu).gpu && typeof (navigator as NavigatorWithGpu).gpu?.requestAdapter === 'function');

  // Active rendering uses WebGL2 for full GLSL onBeforeCompile cutaway & ShaderMaterial compatibility
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
    logarithmicDepthBuffer: true,
  });

  const gl = renderer.getContext();
  const dbgExt = gl.getExtension('WEBGL_debug_renderer_info');
  const glRendererStr = String(
    (dbgExt ? gl.getParameter(dbgExt.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) ?? '',
  );
  const isSoftwareRenderer = /swiftshader|llvmpipe|software|basic render/i.test(glRendererStr);
  if (isSoftwareRenderer) {
    maxDpr = 0.75;
    pixelRatio = 0.75;
  }

  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  renderer.shadowMap.enabled = !isSoftwareRenderer;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.localClippingEnabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.setAttribute('data-testid', 'three-3d-canvas');
  container.appendChild(renderer.domElement);

  const maxAnisotropy = Math.min(16, Math.max(1, renderer.capabilities.getMaxAnisotropy()));
  const isWebGL2 = renderer.capabilities.isWebGL2;

  let bloomEnabled = isSoftwareRenderer ? false : (options.enableBloom ?? true);
  let nightFactor = Math.max(0, Math.min(1, options.initialNightFactor ?? 0));
  let customBloomStrength: number | null = null;
  let customBloomThreshold: number | null = null;
  let curW = width;
  let curH = height;

  // Lazy-initialized non-MSAA HDR EffectComposer + FXAA pass (avoids Windows ANGLE D3D11
  // WebGL2 MSAA+HalfFloat+UnrealBloomPass write-back tile/white-screen corruption on resize)
  let composer: EffectComposer | null = null;
  let renderPass: RenderPass | null = null;
  let sanitizePass: ShaderPass | null = null;
  let bloomPass: UnrealBloomPass | null = null;
  let outputPass: OutputPass | null = null;
  let fxaaPass: ShaderPass | null = null;
  let composerTarget: THREE.WebGLRenderTarget | null = null;
  let composerFailed = false;
  let lastSceneCalls = 0;
  let lastSceneTriangles = 0;

  const computeBloomStrength = (nf: number): number => 0.10 + nf * 0.18; // 0.10 dusk -> 0.28 night

  const syncFxaaResolution = (): void => {
    if (!fxaaPass) return;
    const effW = Math.max(1, Math.floor(curW * pixelRatio));
    const effH = Math.max(1, Math.floor(curH * pixelRatio));
    const resUniform = fxaaPass.material.uniforms['resolution'];
    if (resUniform && resUniform.value instanceof THREE.Vector2) {
      resUniform.value.set(1 / effW, 1 / effH);
    }
  };

  const ensureComposer = (scene: THREE.Scene, camera: THREE.Camera): EffectComposer | null => {
    if (composerFailed) return null;
    if (composer && renderPass) {
      renderPass.scene = scene;
      renderPass.camera = camera;
      return composer;
    }
    try {
      const rtWidth = Math.max(1, Math.floor(curW * pixelRatio));
      const rtHeight = Math.max(1, Math.floor(curH * pixelRatio));
      composerTarget = new THREE.WebGLRenderTarget(rtWidth, rtHeight, {
        type: isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType,
        samples: 0,
      });

      composer = new EffectComposer(renderer, composerTarget);
      renderPass = new RenderPass(scene, camera);
      const origRenderPass = renderPass.render.bind(renderPass);
      renderPass.render = (r, writeBuf, readBuf, dt, maskActive) => {
        origRenderPass(r, writeBuf, readBuf, dt, maskActive);
        lastSceneCalls = r.info.render.calls;
        lastSceneTriangles = r.info.render.triangles;
      };
      sanitizePass = new ShaderPass(HDR_SANITIZE_SHADER);
      bloomPass = new UnrealBloomPass(
        new THREE.Vector2(rtWidth, rtHeight),
        customBloomStrength ?? computeBloomStrength(nightFactor),
        0.38, // crisp architectural halation radius
        customBloomThreshold ?? (0.92 - nightFactor * 0.10),
      );
      outputPass = new OutputPass();
      fxaaPass = new ShaderPass(FXAAShader);

      composer.addPass(renderPass);
      composer.addPass(sanitizePass);
      composer.addPass(bloomPass);
      composer.addPass(outputPass);
      composer.addPass(fxaaPass);
      composer.setPixelRatio(pixelRatio);
      composer.setSize(curW, curH);
      syncFxaaResolution();
      return composer;
    } catch {
      composerFailed = true;
      return null;
    }
  };

  return {
    renderer,
    backendLabel: 'WebGL2',
    webGpuSupported,
    maxAnisotropy,

    render(scene: THREE.Scene, camera: THREE.Camera): void {
      // Guarantee clean default framebuffer / viewport / scissor state before every frame
      renderer.setRenderTarget(null);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, curW, curH);

      // Use HDR Bloom + FXAA during golden hour / blue hour / night where emissive glow matters;
      // use crisp native hardware MSAA direct rendering during bright midday!
      const effectiveStrength = customBloomStrength ?? computeBloomStrength(nightFactor);
      if (bloomEnabled && (nightFactor >= 0.08 || effectiveStrength >= 0.09)) {
        const comp = ensureComposer(scene, camera);
        if (comp) {
          comp.render();
          return;
        }
      }
      renderer.render(scene, camera);
      lastSceneCalls = renderer.info.render.calls;
      lastSceneTriangles = renderer.info.render.triangles;
    },

    getSceneRenderStats(): { calls: number; triangles: number } {
      return { calls: lastSceneCalls, triangles: lastSceneTriangles };
    },

    setSize(newW: number, newH: number): void {
      curW = Math.max(1, Math.floor(newW));
      curH = Math.max(1, Math.floor(newH));
      pixelRatio = getClampedPixelRatio();
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(curW, curH, false);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, curW, curH);
      if (composer) {
        composer.setPixelRatio(pixelRatio);
        composer.setSize(curW, curH);
        syncFxaaResolution();
      }
    },

    setNightFactor(nf: number): void {
      nightFactor = Math.max(0, Math.min(1, nf));
      if (bloomPass) {
        bloomPass.strength = customBloomStrength ?? computeBloomStrength(nightFactor);
        // Only genuine HDR highlights (skyscraper windows, beacons, headlights) bloom cleanly
        bloomPass.threshold = customBloomThreshold ?? (0.92 - nightFactor * 0.10);
      }
    },

    setBloomTuning(strength: number, threshold: number): void {
      customBloomStrength = Math.max(0, Math.min(0.6, strength));
      customBloomThreshold = Math.max(0.5, Math.min(1.2, threshold));
      if (bloomPass) {
        bloomPass.strength = customBloomStrength;
        bloomPass.threshold = customBloomThreshold;
      }
    },

    setBloomEnabled(enabled: boolean): void {
      bloomEnabled = isSoftwareRenderer ? false : enabled;
    },

    isBloomEnabled(): boolean {
      return bloomEnabled && !composerFailed;
    },

    dispose(): void {
      fxaaPass?.dispose();
      sanitizePass?.dispose();
      bloomPass?.dispose();
      outputPass?.dispose();
      composer?.dispose();
      composerTarget?.dispose();
      renderer.dispose();
    },
  };
}
