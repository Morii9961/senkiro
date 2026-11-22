/**
 * GPU World-Space Radial Cutaway Shader Injection (P5: True 3D Cutaway / Underground Explorer).
 *
 * Injects clean circular radial excavation discard into MeshStandardMaterial via onBeforeCompile
 * so both standard Meshes and InstancedMeshes open a razor-sharp architectural cutaway aperture
 * into Tokyo's underground railway network without whole-city transparent ghost building soup!
 */

import * as THREE from 'three';

export interface CutawayUniforms {
  uCutawayActive: { value: number };
  uCutawayCenter: { value: THREE.Vector3 };
  uCutawayRadius: { value: number };
}

export function createCutawayUniforms(): CutawayUniforms {
  return {
    uCutawayActive: { value: 0.0 },
    uCutawayCenter: { value: new THREE.Vector3(0, 0, 0) },
    uCutawayRadius: { value: 850.0 },
  };
}

export function injectRadialCutaway(
  material: THREE.MeshStandardMaterial,
  uniforms: CutawayUniforms,
  mode: 'terrain' | 'building',
): void {
  const cacheTag = `senkiro-cutaway-${mode}-v1`;
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}:${cacheTag}`;

  const prevCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile(shader, renderer);

    shader.uniforms.uCutawayActive = uniforms.uCutawayActive;
    shader.uniforms.uCutawayCenter = uniforms.uCutawayCenter;
    shader.uniforms.uCutawayRadius = uniforms.uCutawayRadius;

    // 1. Vertex shader: unconditionally compute world position for both Mesh & InstancedMesh!
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vCutWorldPos;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vec4 cutWp = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  cutWp = instanceMatrix * cutWp;
#endif
cutWp = modelMatrix * cutWp;
vCutWorldPos = cutWp.xyz;`,
      );

    // 2. Fragment shader: clean circular radial excavation + crisp architectural edge bevel!
    const discardMargin = mode === 'building' ? '22.0' : '0.0';
    const rimHighlight =
      mode === 'terrain'
        ? `
    if (cutDist < uCutawayRadius + 14.0) {
      float rimF = 1.0 - smoothstep(uCutawayRadius, uCutawayRadius + 14.0, cutDist);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.46, 0.54, 0.62), rimF * 0.42);
    }`
        : '';

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uCutawayActive;
uniform vec3 uCutawayCenter;
uniform float uCutawayRadius;
varying vec3 vCutWorldPos;`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
if (uCutawayActive > 0.5) {
  float cutDist = length(vCutWorldPos.xz - uCutawayCenter.xz);
  if (cutDist < uCutawayRadius + ${discardMargin}) discard;
}`,
      )
      .replace(
        '#include <dithering_fragment>',
        `if (uCutawayActive > 0.5) {
  float cutDist = length(vCutWorldPos.xz - uCutawayCenter.xz);${rimHighlight}
}
#include <dithering_fragment>`,
      );
  };
  material.needsUpdate = true;
}
