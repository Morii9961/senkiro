/**
 * Architectural 3D Cutaway Strata Frame Visuals (Underground Explorer).
 *
 * Replaces opaque dark excavation walls with a bright, airy architectural blueprint frame:
 *  - Luminous surface perimeter collar ring at y = 0.35 with soft radial compass tick marks
 *  - Floating horizontal depth-contour rings at L-1 (-10), L-2 (-20), L-3 (-30), L-4 (-40)
 *  - Four slender cardinal depth hairlines linking surface to subterranean tiers
 *  - Soft semi-transparent luminous blueprint datum disc at the bottom (zero black hole!)
 */

import * as THREE from 'three';

const DEPTH_TIERS = [10, 20, 30, 40] as const;

function createBlueprintDatumTexture(isDark: boolean): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cx = size / 2;
    const cy = size / 2;

    // Bright frosted blueprint wash in light mode, clean translucent deep navy in dark mode
    const radGrad = ctx.createRadialGradient(cx, cy, size * 0.04, cx, cy, cx);
    if (isDark) {
      radGrad.addColorStop(0.0, 'rgba(20, 48, 78, 0.92)');
      radGrad.addColorStop(0.7, 'rgba(15, 34, 56, 0.85)');
      radGrad.addColorStop(1.0, 'rgba(15, 34, 56, 0.45)');
    } else {
      radGrad.addColorStop(0.0, 'rgba(229, 240, 250, 0.92)');
      radGrad.addColorStop(0.7, 'rgba(219, 231, 243, 0.84)');
      radGrad.addColorStop(1.0, 'rgba(203, 222, 240, 0.42)');
    }
    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, size, size);

    // Subtle blueprint coordinate grid
    ctx.strokeStyle = isDark ? 'rgba(125, 211, 252, 0.14)' : 'rgba(56, 122, 178, 0.16)';
    ctx.lineWidth = 1;
    const step = size / 16;
    for (let i = step; i < size; i += step) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }

    // Crisp concentric compass rings
    ctx.strokeStyle = isDark ? 'rgba(56, 189, 248, 0.46)' : 'rgba(37, 99, 166, 0.42)';
    ctx.lineWidth = 1.6;
    for (const frac of [0.22, 0.46, 0.72, 0.95]) {
      ctx.beginPath();
      ctx.arc(cx, cy, cx * frac, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Cardinal N/S/E/W compass crosshairs
    ctx.strokeStyle = isDark ? 'rgba(125, 211, 252, 0.36)' : 'rgba(30, 80, 138, 0.34)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(16, cy);
    ctx.lineTo(size - 16, cy);
    ctx.moveTo(cx, 16);
    ctx.lineTo(cx, size - 16);
    ctx.stroke();

    // Subtle radial degree ticks on outer ring
    ctx.strokeStyle = isDark ? 'rgba(186, 230, 253, 0.45)' : 'rgba(30, 80, 138, 0.38)';
    ctx.lineWidth = 1.2;
    for (let deg = 0; deg < 360; deg += 15) {
      const rad = (deg * Math.PI) / 180;
      const rOuter = cx * 0.95;
      const rInner = deg % 45 === 0 ? cx * 0.89 : cx * 0.92;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(rad) * rInner, cy + Math.sin(rad) * rInner);
      ctx.lineTo(cx + Math.cos(rad) * rOuter, cy + Math.sin(rad) * rOuter);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function buildRadialTickGeometry(segments = 48): THREE.BufferGeometry {
  const positions: number[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const isMajor = i % 6 === 0;
    const r0 = isMajor ? 0.975 : 0.99;
    const r1 = isMajor ? 1.032 : 1.018;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    positions.push(cos * r0, 0, sin * r0, cos * r1, 0, sin * r1);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geom;
}

function buildCircleLoopGeometry(segments = 96): THREE.BufferGeometry {
  const positions: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    positions.push(Math.cos(a), 0, Math.sin(a));
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geom;
}

function buildCardinalGuidesGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const angles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
  for (const a of angles) {
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    positions.push(cx, 0.25, cz, cx, -44, cz);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geom;
}

export class CutawayPitVisuals {
  readonly group = new THREE.Group();

  private readonly rimMesh: THREE.Mesh;
  private readonly rimMat: THREE.MeshStandardMaterial;
  private readonly rimTicks: THREE.LineSegments;
  private readonly rimTicksMat: THREE.LineBasicMaterial;
  private readonly depthRingMeshes: THREE.Mesh[] = [];
  private readonly depthRingLines: THREE.LineLoop[] = [];
  private readonly depthRingMats: THREE.MeshBasicMaterial[] = [];
  private readonly depthLineMats: THREE.LineBasicMaterial[] = [];
  private readonly cardinalGuides: THREE.LineSegments;
  private readonly cardinalGuidesMat: THREE.LineBasicMaterial;
  private readonly datumDisc: THREE.Mesh;
  private readonly datumMat: THREE.MeshBasicMaterial;
  private datumTex: THREE.CanvasTexture;
  private readonly sharedDepthRingGeom: THREE.RingGeometry;
  private readonly sharedDepthLoopGeom: THREE.BufferGeometry;
  private isDark: boolean;

  constructor(isDark: boolean) {
    this.isDark = isDark;
    this.group.name = 'underground-cutaway-pit';
    this.group.visible = false;

    // 1. Crisp luminous surface perimeter collar ring at y = 0.35
    const rimGeom = new THREE.RingGeometry(0.992, 1.012, 96);
    rimGeom.rotateX(-Math.PI / 2);
    this.rimMat = new THREE.MeshStandardMaterial({
      color: isDark ? 0x56ccf2 : 0x3b82b8,
      emissive: isDark ? 0x0ea5e9 : 0x38bdf8,
      emissiveIntensity: isDark ? 0.58 : 0.24,
      roughness: 0.38,
      metalness: 0.28,
      transparent: true,
      opacity: isDark ? 0.82 : 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.rimMesh = new THREE.Mesh(rimGeom, this.rimMat);
    this.rimMesh.position.y = 0.35;
    this.rimMesh.name = 'cutaway-rim-collar';
    this.rimMesh.renderOrder = 8;

    // Soft radial architectural compass tick marks around surface collar
    const ticksGeom = buildRadialTickGeometry(48);
    this.rimTicksMat = new THREE.LineBasicMaterial({
      color: isDark ? 0x7dd3fc : 0x47779e,
      transparent: true,
      opacity: isDark ? 0.55 : 0.45,
      depthWrite: false,
    });
    this.rimTicks = new THREE.LineSegments(ticksGeom, this.rimTicksMat);
    this.rimTicks.position.y = 0.42;
    this.rimTicks.name = 'cutaway-rim-ticks';
    this.rimTicks.renderOrder = 9;

    // 2. Delicate floating horizontal depth-contour rings at L-1 (-10), L-2 (-20), L-3 (-30), L-4 (-40)
    this.sharedDepthRingGeom = new THREE.RingGeometry(0.9965, 1.0035, 96);
    this.sharedDepthRingGeom.rotateX(-Math.PI / 2);
    this.sharedDepthLoopGeom = buildCircleLoopGeometry(96);

    DEPTH_TIERS.forEach((depth, idx) => {
      const fade = 1.0 - idx * 0.12;
      const ringMat = new THREE.MeshBasicMaterial({
        color: isDark ? 0x38bdf8 : 0x4f83b0,
        transparent: true,
        opacity: (isDark ? 0.34 : 0.28) * fade,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const ringMesh = new THREE.Mesh(this.sharedDepthRingGeom, ringMat);
      ringMesh.position.y = -depth;
      ringMesh.name = `cutaway-depth-ring-L-${idx + 1}`;
      ringMesh.renderOrder = 4;

      const lineMat = new THREE.LineBasicMaterial({
        color: isDark ? 0x7dd3fc : 0x3b76a8,
        transparent: true,
        opacity: (isDark ? 0.52 : 0.42) * fade,
        depthWrite: false,
      });
      const loop = new THREE.LineLoop(this.sharedDepthLoopGeom, lineMat);
      loop.position.y = -depth;
      loop.name = `cutaway-depth-contour-L-${idx + 1}`;
      loop.renderOrder = 5;

      this.depthRingMats.push(ringMat);
      this.depthLineMats.push(lineMat);
      this.depthRingMeshes.push(ringMesh);
      this.depthRingLines.push(loop);
      this.group.add(ringMesh, loop);
    });

    // 3. Slender cardinal vertical depth hairlines (no opaque cylinder wall!)
    this.cardinalGuidesMat = new THREE.LineBasicMaterial({
      color: isDark ? 0x38bdf8 : 0x5c8ab5,
      transparent: true,
      opacity: isDark ? 0.3 : 0.26,
      depthWrite: false,
    });
    this.cardinalGuides = new THREE.LineSegments(
      buildCardinalGuidesGeometry(),
      this.cardinalGuidesMat,
    );
    this.cardinalGuides.name = 'cutaway-cardinal-guides';
    this.cardinalGuides.renderOrder = 3;

    // 4. Soft semi-transparent luminous blueprint datum disc at bottom (bright & airy!)
    this.datumTex = createBlueprintDatumTexture(isDark);
    const datumGeom = new THREE.CircleGeometry(1.0, 96);
    datumGeom.rotateX(-Math.PI / 2);
    this.datumMat = new THREE.MeshBasicMaterial({
      map: this.datumTex,
      color: isDark ? 0x1e4a76 : 0xffffff,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.datumDisc = new THREE.Mesh(datumGeom, this.datumMat);
    this.datumDisc.position.y = -46;
    this.datumDisc.name = 'cutaway-floor-datum';
    this.datumDisc.renderOrder = 1;

    this.group.add(this.rimMesh, this.rimTicks, this.cardinalGuides, this.datumDisc);
  }

  update(
    active: boolean,
    centerX: number,
    centerZ: number,
    radius: number,
    verticalExaggeration: number,
  ): void {
    this.group.visible = active;
    if (!active) return;

    this.group.position.set(centerX, 0, centerZ);
    const vScale = Math.max(1.0, Math.min(2.6, verticalExaggeration));

    this.rimMesh.scale.set(radius, 1, radius);
    this.rimTicks.scale.set(radius, 1, radius);
    this.cardinalGuides.scale.set(radius, vScale, radius);

    for (let i = 0; i < DEPTH_TIERS.length; i++) {
      const y = -DEPTH_TIERS[i]! * vScale;
      const ringMesh = this.depthRingMeshes[i]!;
      const loop = this.depthRingLines[i]!;
      ringMesh.scale.set(radius, 1, radius);
      ringMesh.position.y = y;
      loop.scale.set(radius, 1, radius);
      loop.position.y = y;
    }

    this.datumDisc.scale.set(radius, 1, radius);
    this.datumDisc.position.y = -46 * vScale;
  }

  setTheme(isDark: boolean): void {
    if (this.isDark === isDark) return;
    this.isDark = isDark;

    this.datumTex.dispose();
    this.datumTex = createBlueprintDatumTexture(isDark);
    this.datumMat.map = this.datumTex;
    this.datumMat.color.setHex(isDark ? 0x1e4a76 : 0xffffff);
    this.datumMat.opacity = 0.22;
    this.datumMat.needsUpdate = true;

    this.rimMat.color.setHex(isDark ? 0x56ccf2 : 0x3b82b8);
    this.rimMat.emissive.setHex(isDark ? 0x0ea5e9 : 0x38bdf8);
    this.rimMat.emissiveIntensity = isDark ? 0.58 : 0.24;
    this.rimMat.opacity = isDark ? 0.82 : 0.72;

    this.rimTicksMat.color.setHex(isDark ? 0x7dd3fc : 0x47779e);
    this.rimTicksMat.opacity = isDark ? 0.55 : 0.45;

    this.cardinalGuidesMat.color.setHex(isDark ? 0x38bdf8 : 0x5c8ab5);
    this.cardinalGuidesMat.opacity = isDark ? 0.3 : 0.26;

    for (let i = 0; i < DEPTH_TIERS.length; i++) {
      const fade = 1.0 - i * 0.12;
      this.depthRingMats[i]!.color.setHex(isDark ? 0x38bdf8 : 0x4f83b0);
      this.depthRingMats[i]!.opacity = (isDark ? 0.34 : 0.28) * fade;
      this.depthLineMats[i]!.color.setHex(isDark ? 0x7dd3fc : 0x3b76a8);
      this.depthLineMats[i]!.opacity = (isDark ? 0.52 : 0.42) * fade;
    }
  }

  dispose(): void {
    this.rimMesh.geometry.dispose();
    this.rimTicks.geometry.dispose();
    this.cardinalGuides.geometry.dispose();
    this.datumDisc.geometry.dispose();
    this.sharedDepthRingGeom.dispose();
    this.sharedDepthLoopGeom.dispose();
    this.datumTex.dispose();
    this.rimMat.dispose();
    this.rimTicksMat.dispose();
    this.cardinalGuidesMat.dispose();
    this.datumMat.dispose();
    for (const m of this.depthRingMats) m.dispose();
    for (const m of this.depthLineMats) m.dispose();
  }
}
