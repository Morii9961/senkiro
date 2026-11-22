/**
 * Procedural Atmospheric Sky Dome & Studio-Sky PMREM Environment Reflections (P3).
 *
 * Provides semi-realistic architectural daylight & night-dusk sky gradients,
 * subtle solar scattering halo, clean distance linear fog matching the horizon,
 * and procedural PMREM environment reflections for glass curtain walls, steel rails & water
 * with zero external HDR assets.
 */

import * as THREE from 'three';

const SKY_VERTEX_SHADER = /* glsl */ `
varying vec3 vWorldDir;
void main() {
  vWorldDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uTopColor;
uniform vec3 uMidColor;
uniform vec3 uHorizonColor;
uniform vec3 uGroundColor;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform float uSunIntensity;

varying vec3 vWorldDir;

void main() {
  vec3 dir = normalize(vWorldDir);
  float h = dir.y;

  vec3 col;
  if (h >= 0.0) {
    float midMix = smoothstep(0.0, 0.28, h);
    float topMix = smoothstep(0.22, 0.85, h);
    col = mix(uHorizonColor, uMidColor, midMix);
    col = mix(col, uTopColor, topMix);

    // Subtle atmospheric solar glow
    float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
    float sunHalo = pow(sunDot, 12.0) * 0.22 + pow(sunDot, 160.0) * 0.45;
    col += uSunColor * sunHalo * uSunIntensity;
  } else {
    float downMix = smoothstep(0.0, -0.35, h);
    col = mix(uHorizonColor * 0.88, uGroundColor, downMix);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

interface SkyPalette {
  top: number;
  mid: number;
  horizon: number;
  ground: number;
  sun: number;
  sunIntensity: number;
  fogNear: number;
  fogFar: number;
}

const DAY_PALETTE: SkyPalette = {
  top: 0x6296ca,
  mid: 0xb7d2e8,
  horizon: 0xe6edf2,
  ground: 0xc8c6c0,
  sun: 0xfff5e0,
  sunIntensity: 1.0,
  fogNear: 7500,
  fogFar: 34000,
};

const NIGHT_PALETTE: SkyPalette = {
  top: 0x060d19,
  mid: 0x0f1d33,
  horizon: 0x1a2c44,
  ground: 0x090f18,
  sun: 0x9ec5f8,
  sunIntensity: 0.45,
  fogNear: 6800,
  fogFar: 30000,
};

export class SkyEnvironmentSystem {
  readonly skyMesh: THREE.Mesh;
  readonly sunDirection = new THREE.Vector3(0.58, 0.68, 0.44).normalize();

  private readonly skyMaterial: THREE.ShaderMaterial;
  private readonly pmremGenerator: THREE.PMREMGenerator;
  private envRenderTarget: THREE.WebGLRenderTarget | null = null;
  private isDark: boolean;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, isDark: boolean) {
    this.isDark = isDark;
    this.pmremGenerator = new THREE.PMREMGenerator(renderer);
    this.pmremGenerator.compileEquirectangularShader();

    const pal = isDark ? NIGHT_PALETTE : DAY_PALETTE;
    this.skyMaterial = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX_SHADER,
      fragmentShader: SKY_FRAGMENT_SHADER,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTopColor: { value: new THREE.Color(pal.top) },
        uMidColor: { value: new THREE.Color(pal.mid) },
        uHorizonColor: { value: new THREE.Color(pal.horizon) },
        uGroundColor: { value: new THREE.Color(pal.ground) },
        uSunColor: { value: new THREE.Color(pal.sun) },
        uSunDir: { value: this.sunDirection.clone() },
        uSunIntensity: { value: pal.sunIntensity },
      },
    });

    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(52_000, 32, 18), this.skyMaterial);
    this.skyMesh.name = 'atmospheric-sky-dome';
    this.skyMesh.frustumCulled = false;
    this.skyMesh.renderOrder = -10;
    scene.add(this.skyMesh);

    this.applyToScene(scene, isDark);
  }

  private buildPmrem(isDark: boolean): THREE.WebGLRenderTarget {
    const pal = isDark ? NIGHT_PALETTE : DAY_PALETTE;
    const envScene = new THREE.Scene();

    // Soft studio-sky hemisphere shell for smooth realistic glass & water reflections
    const envMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX_SHADER,
      fragmentShader: SKY_FRAGMENT_SHADER,
      side: THREE.BackSide,
      uniforms: {
        uTopColor: { value: new THREE.Color(pal.top) },
        uMidColor: { value: new THREE.Color(pal.mid) },
        uHorizonColor: { value: new THREE.Color(pal.horizon) },
        uGroundColor: { value: new THREE.Color(pal.ground) },
        uSunColor: { value: new THREE.Color(pal.sun) },
        uSunDir: { value: this.sunDirection.clone() },
        uSunIntensity: { value: isDark ? 0.65 : 1.35 },
      },
    });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(20, 24, 14), envMat);
    envScene.add(sphere);

    // Subtle soft sun reflection highlight card
    const sunCard = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.MeshBasicMaterial({
        color: isDark ? 0x9ec5f8 : 0xfff8ea,
        side: THREE.DoubleSide,
      }),
    );
    sunCard.position.copy(this.sunDirection).multiplyScalar(14);
    sunCard.lookAt(0, 0, 0);
    envScene.add(sunCard);

    const rt = this.pmremGenerator.fromScene(envScene, 0.04);

    sphere.geometry.dispose();
    envMat.dispose();
    sunCard.geometry.dispose();
    (sunCard.material as THREE.Material).dispose();
    return rt;
  }

  applyToScene(scene: THREE.Scene, isDark: boolean): void {
    this.isDark = isDark;
    const pal = isDark ? NIGHT_PALETTE : DAY_PALETTE;

    (this.skyMaterial.uniforms.uTopColor!.value as THREE.Color).setHex(pal.top);
    (this.skyMaterial.uniforms.uMidColor!.value as THREE.Color).setHex(pal.mid);
    (this.skyMaterial.uniforms.uHorizonColor!.value as THREE.Color).setHex(pal.horizon);
    (this.skyMaterial.uniforms.uGroundColor!.value as THREE.Color).setHex(pal.ground);
    (this.skyMaterial.uniforms.uSunColor!.value as THREE.Color).setHex(pal.sun);
    this.skyMaterial.uniforms.uSunIntensity!.value = pal.sunIntensity;

    // Clean distance-graded linear fog matched exactly to horizon color (zero foreground grey wash!)
    scene.background = new THREE.Color(pal.horizon);
    scene.fog = new THREE.Fog(pal.horizon, pal.fogNear, pal.fogFar);

    const prevRt = this.envRenderTarget;
    this.envRenderTarget = this.buildPmrem(isDark);
    scene.environment = this.envRenderTarget.texture;
    prevRt?.dispose();
  }

  updateForCamera(cameraPos: THREE.Vector3): void {
    this.skyMesh.position.copy(cameraPos);
  }

  getIsDark(): boolean {
    return this.isDark;
  }

  dispose(): void {
    this.skyMesh.geometry.dispose();
    this.skyMaterial.dispose();
    this.envRenderTarget?.dispose();
    this.pmremGenerator.dispose();
  }
}
