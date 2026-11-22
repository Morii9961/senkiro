/**
 * Architectural 3D Cutaway Pit Cross-Section Visuals (P5: Underground Explorer).
 *
 * Renders a crisp circular geological cross-section wall with Tokyo subsurface strata
 * and depth datum markers (L-1 -10, L-2 -20, L-3 -30, L-4 -40), surface bevel collar ring,
 * and deep reference compass disc around the GPU cutaway aperture.
 */

import * as THREE from 'three';

function createStrataWallTexture(isDark: boolean): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Subsurface Kanto Loam / Tokyo Gravel / Deep Silt geological bands (0m .. -48m)
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    if (isDark) {
      grad.addColorStop(0.0, '#2c3645');
      grad.addColorStop(0.18, '#232c39');
      grad.addColorStop(0.45, '#1a2330');
      grad.addColorStop(0.75, '#131b26');
      grad.addColorStop(1.0, '#0d141e');
    } else {
      grad.addColorStop(0.0, '#7c766d');
      grad.addColorStop(0.18, '#66625b');
      grad.addColorStop(0.45, '#50555e');
      grad.addColorStop(0.75, '#3b434e');
      grad.addColorStop(1.0, '#2a323d');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle geological strata horizontal striations
    for (let y = 6; y < h; y += 7) {
      ctx.fillStyle = y % 14 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(0, y, w, 2);
    }

    // Crisp architectural depth datum lines matching L-1 (-10), L-2 (-20), L-3 (-30), L-4 (-40)
    // Wall spans y = 0 .. -48 -> fraction = depth / 48
    const tiers: [number, string][] = [
      [10, 'L-1 (-10)'],
      [20, 'L-2 (-20)'],
      [30, 'L-3 (-30)'],
      [40, 'L-4 (-40)'],
    ];
    ctx.font = 'bold 13px ui-monospace, SFMono-Regular, Menlo, monospace';
    for (const [depth, label] of tiers) {
      const py = (depth / 48) * h;
      ctx.strokeStyle = isDark ? 'rgba(56,189,248,0.42)' : 'rgba(226,232,240,0.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = isDark ? 'rgba(186,230,253,0.75)' : 'rgba(241,245,249,0.78)';
      ctx.fillText(label, 14, py - 5);
      ctx.fillText(label, 270, py - 5);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(4, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createPitFloorTexture(isDark: boolean): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = isDark ? '#0b121c' : '#1e2733';
    ctx.fillRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    ctx.strokeStyle = isDark ? 'rgba(56,189,248,0.18)' : 'rgba(148,163,184,0.22)';
    ctx.lineWidth = 1.5;

    // Concentric radial scale circles
    for (const frac of [0.25, 0.5, 0.75, 0.96]) {
      ctx.beginPath();
      ctx.arc(cx, cy, cx * frac, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Cardinal N/S/E/W crosshairs
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(size, cy);
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, size);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class CutawayPitVisuals {
  readonly group = new THREE.Group();

  private readonly wallMesh: THREE.Mesh;
  private readonly rimMesh: THREE.Mesh;
  private readonly floorMesh: THREE.Mesh;
  private readonly wallMat: THREE.MeshStandardMaterial;
  private readonly rimMat: THREE.MeshStandardMaterial;
  private readonly floorMat: THREE.MeshStandardMaterial;
  private wallTex: THREE.CanvasTexture;
  private floorTex: THREE.CanvasTexture;
  private isDark: boolean;

  constructor(isDark: boolean) {
    this.isDark = isDark;
    this.group.name = 'underground-cutaway-pit';
    this.group.visible = false;

    this.wallTex = createStrataWallTexture(isDark);
    this.floorTex = createPitFloorTexture(isDark);

    // Cylindrical earth cross-section wall spanning y = 0 down to y = -48 (unit radius = 1)
    const wallGeom = new THREE.CylinderGeometry(1, 1, 48, 72, 1, true);
    wallGeom.translate(0, -24, 0);
    this.wallMat = new THREE.MeshStandardMaterial({
      map: this.wallTex,
      roughness: 0.92,
      metalness: 0.04,
      side: THREE.BackSide,
    });
    this.wallMesh = new THREE.Mesh(wallGeom, this.wallMat);
    this.wallMesh.name = 'cutaway-strata-wall';
    this.wallMesh.renderOrder = 2;

    // Surface chamfer collar ring framing the circular excavation cleanly
    const rimGeom = new THREE.RingGeometry(0.992, 1.024, 72);
    rimGeom.rotateX(-Math.PI / 2);
    this.rimMat = new THREE.MeshStandardMaterial({
      color: isDark ? 0x38bdf8 : 0x5c6a7a,
      emissive: isDark ? 0x0284c7 : 0x1e293b,
      emissiveIntensity: isDark ? 0.35 : 0.08,
      roughness: 0.5,
      metalness: 0.35,
      side: THREE.DoubleSide,
    });
    this.rimMesh = new THREE.Mesh(rimGeom, this.rimMat);
    this.rimMesh.position.y = 0.45;
    this.rimMesh.name = 'cutaway-rim-collar';
    this.rimMesh.renderOrder = 8;

    // Deep subterranean compass floor disc at y = -48
    const floorGeom = new THREE.CircleGeometry(1.002, 72);
    floorGeom.rotateX(-Math.PI / 2);
    this.floorMat = new THREE.MeshStandardMaterial({
      map: this.floorTex,
      roughness: 0.94,
      metalness: 0.05,
    });
    this.floorMesh = new THREE.Mesh(floorGeom, this.floorMat);
    this.floorMesh.position.y = -48;
    this.floorMesh.name = 'cutaway-floor-datum';
    this.floorMesh.renderOrder = 1;

    this.group.add(this.wallMesh, this.rimMesh, this.floorMesh);
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
    this.wallMesh.scale.set(radius, vScale, radius);
    this.rimMesh.scale.set(radius, 1, radius);
    this.floorMesh.scale.set(radius, 1, radius);
    this.floorMesh.position.y = -48 * vScale;
  }

  setTheme(isDark: boolean): void {
    if (this.isDark === isDark) return;
    this.isDark = isDark;

    this.wallTex.dispose();
    this.wallTex = createStrataWallTexture(isDark);
    this.wallMat.map = this.wallTex;
    this.wallMat.needsUpdate = true;

    this.floorTex.dispose();
    this.floorTex = createPitFloorTexture(isDark);
    this.floorMat.map = this.floorTex;
    this.floorMat.needsUpdate = true;

    this.rimMat.color.setHex(isDark ? 0x38bdf8 : 0x5c6a7a);
    this.rimMat.emissive.setHex(isDark ? 0x0284c7 : 0x1e293b);
    this.rimMat.emissiveIntensity = isDark ? 0.35 : 0.08;
  }

  dispose(): void {
    this.wallMesh.geometry.dispose();
    this.rimMesh.geometry.dispose();
    this.floorMesh.geometry.dispose();
    this.wallTex.dispose();
    this.floorTex.dispose();
    this.wallMat.dispose();
    this.rimMat.dispose();
    this.floorMat.dispose();
  }
}
