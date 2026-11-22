/**
 * SENKIRO Atlas v2 — Reusable 3D Railway Sub-Components & Cross-Section Extruders
 *
 * Local Car Coordinate Convention:
 *   +X = Forward (toward front cab nose)
 *   +Y = Up (y = 0 is top of steel railhead)
 *   +Z = Right side when facing +X (-Z = Left side)
 */

import * as THREE from 'three';
import type {
  BodyCrossSectionProfile,
  RollingStockLodLevel,
} from '../../domain/rollingStock/types.js';
import type { SeriesSharedMaterials } from './materials.js';

/**
 * Returns the 2D cross-section profile `[zRight, yUp][]` (ordered clockwise around +X axis so outward normals face out)
 * for the lower+side car body shell (excluding the separate roof cap so roof can take its own material).
 */
export function getCarBodyCrossSectionYZ(
  profile: BodyCrossSectionProfile,
  halfWidthM: number,
  floorY: number,
  eaveY: number,
): [number, number][] {
  if (profile === 'wide_body_barrel') {
    // JR East E235-0 2,950mm wide-body commuter profile (lower skirt narrower at 1.39m half-width, bulging to 1.475m at waist)
    const skirtW = halfWidthM - 0.085;
    const cantW = halfWidthM - 0.045;
    const bottomY = floorY - 0.12;
    const waistLowY = floorY + 0.38;
    const waistHighY = eaveY - 0.35;
    return [
      [-skirtW, bottomY],
      [-halfWidthM, waistLowY],
      [-halfWidthM, waistHighY],
      [-cantW, eaveY],
      [cantW, eaveY],
      [halfWidthM, waistHighY],
      [halfWidthM, waistLowY],
      [skirtW, bottomY],
    ];
  }

  if (profile === 'compact_subway_flat') {
    // Tokyo Metro 1000 Series 2,550mm flat-sided vertical subway profile
    const bottomY = floorY - 0.1;
    const cantW = halfWidthM - 0.02;
    return [
      [-halfWidthM, bottomY],
      [-halfWidthM, eaveY - 0.12],
      [-cantW, eaveY],
      [cantW, eaveY],
      [halfWidthM, eaveY - 0.12],
      [halfWidthM, bottomY],
    ];
  }

  // Hitachi A-train 2,800mm double-skin aluminum profile (Metro 17000): straight lower side + inward upper taper above window sill
  const bottomY = floorY - 0.11;
  const taperStartY = floorY + 1.15;
  const cantW = halfWidthM - 0.065;
  return [
    [-halfWidthM + 0.02, bottomY],
    [-halfWidthM, floorY + 0.15],
    [-halfWidthM, taperStartY],
    [-cantW, eaveY],
    [cantW, eaveY],
    [halfWidthM, taperStartY],
    [halfWidthM, floorY + 0.15],
    [halfWidthM - 0.02, bottomY],
  ];
}

/**
 * Returns the 2D cross-section profile `[zRight, yUp][]` for the arched roof crown from `eaveY` up to `roofHeightM`.
 */
export function getCarRoofCrossSectionYZ(
  profile: BodyCrossSectionProfile,
  halfWidthM: number,
  eaveY: number,
  roofHeightM: number,
): [number, number][] {
  const cantW =
    profile === 'wide_body_barrel'
      ? halfWidthM - 0.045
      : profile === 'compact_subway_flat'
        ? halfWidthM - 0.02
        : halfWidthM - 0.065;

  const midW = cantW * 0.66;
  const crownW = cantW * 0.25;
  const midY = eaveY + (roofHeightM - eaveY) * 0.68;

  return [
    [-cantW, eaveY],
    [-midW, midY],
    [-crownW, roofHeightM],
    [crownW, roofHeightM],
    [midW, midY],
    [cantW, eaveY],
  ];
}

/**
 * Extrudes a closed 2D YZ cross-section along X from `xMin` to `xMax` with front and back end caps and clean UVs.
 */
export function extrudeProfileAlongX(
  profileYZ: readonly [number, number][],
  xMin: number,
  xMax: number,
  closeCaps = true,
): THREE.BufferGeometry {
  const n = profileYZ.length;
  const positions: number[] = [];
  const uvs: number[] = [];

  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of profileYZ) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const ySpan = Math.max(0.1, maxY - minY);
  const lenX = Math.max(0.1, xMax - xMin);

  const pushTri = (
    ax: number,
    ay: number,
    az: number,
    au: number,
    av: number,
    bx: number,
    by: number,
    bz: number,
    bu: number,
    bv: number,
    cx: number,
    cy: number,
    cz: number,
    cu: number,
    cv: number,
  ) => {
    positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    uvs.push(au, av, bu, bv, cu, cv);
  };

  // Side quads along X (wound so cross product points strictly OUTWARD from the car body!)
  for (let i = 0; i < n; i++) {
    const [z0, y0] = profileYZ[i]!;
    const [z1, y1] = profileYZ[(i + 1) % n]!;
    const v0 = (y0 - minY) / ySpan;
    const v1 = (y1 - minY) / ySpan;
    const uMax = Math.max(1, Math.round(lenX / 4));

    pushTri(xMin, y0, z0, 0, v0, xMax, y1, z1, uMax, v1, xMax, y0, z0, uMax, v0);
    pushTri(xMin, y0, z0, 0, v0, xMin, y1, z1, 0, v1, xMax, y1, z1, uMax, v1);
  }

  if (closeCaps && n >= 3) {
    // Centroid fan for end caps at xMax (+X outward) and xMin (-X outward)
    let cz = 0;
    let cy = 0;
    for (const [z, y] of profileYZ) {
      cz += z;
      cy += y;
    }
    cz /= n;
    cy /= n;

    for (let i = 0; i < n; i++) {
      const [z0, y0] = profileYZ[i]!;
      const [z1, y1] = profileYZ[(i + 1) % n]!;
      // +X front cap
      pushTri(xMax, cy, cz, 0.5, 0.5, xMax, y1, z1, 1, 0, xMax, y0, z0, 0, 0);
      // -X rear cap
      pushTri(xMin, cy, cz, 0.5, 0.5, xMin, y0, z0, 0, 0, xMin, y1, z1, 1, 0);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeVertexNormals();
  return geom;
}

export interface BogieBuildOptions {
  readonly trackGaugeM: number;
  readonly wheelbaseM: number;
  readonly wheelDiameterM: number;
  readonly hasThirdRailShoe: boolean;
  readonly lod: RollingStockLodLevel;
  readonly mats: SeriesSharedMaterials;
}

export interface BuiltBogieNode {
  readonly group: THREE.Group;
  readonly wheelsets: THREE.Group[];
}

/**
 * Builds a 3D railway bogie (DT80 / SC101 / FS779) centered at railhead y = 0.
 */
export function createBogieGroup(opts: BogieBuildOptions): BuiltBogieNode {
  const { trackGaugeM, wheelbaseM, wheelDiameterM, hasThirdRailShoe, lod, mats } = opts;
  const group = new THREE.Group();
  group.name = 'Bogie';

  const wheelRadius = wheelDiameterM * 0.5;
  const halfGauge = trackGaugeM * 0.5;
  const halfWb = wheelbaseM * 0.5;
  const wheelsets: THREE.Group[] = [];

  if (lod === 'low') {
    return { group, wheelsets };
  }

  const radialSegs = lod === 'high' ? 16 : 8;

  // 2 Wheelsets (front axle at +halfWb, rear axle at -halfWb)
  for (const xAxle of [halfWb, -halfWb]) {
    const wsGroup = new THREE.Group();
    wsGroup.name = xAxle > 0 ? 'Wheelset_Front' : 'Wheelset_Rear';
    wsGroup.position.set(xAxle, wheelRadius, 0);

    // Axle shaft
    const axleGeom = new THREE.CylinderGeometry(0.075, 0.075, trackGaugeM + 0.24, 8);
    const axleMesh = new THREE.Mesh(axleGeom, mats.bogieFrame);
    wsGroup.add(axleMesh);

    // Left & Right steel wheels (CylinderGeometry default axis is Y; leave axis along Y? No, wheel rotates around Z axis!)
    const wheelGeom = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.13, radialSegs);
    wheelGeom.rotateX(Math.PI * 0.5);

    for (const zSign of [-1, 1]) {
      const wMesh = new THREE.Mesh(wheelGeom, mats.wheelSteel);
      wMesh.position.set(0, 0, zSign * halfGauge);
      wsGroup.add(wMesh);

      if (lod === 'high') {
        // Inner wheel flange ring
        const flangeGeom = new THREE.CylinderGeometry(
          wheelRadius + 0.032,
          wheelRadius + 0.032,
          0.035,
          radialSegs,
        );
        flangeGeom.rotateX(Math.PI * 0.5);
        const fMesh = new THREE.Mesh(flangeGeom, mats.wheelSteel);
        fMesh.position.set(0, 0, zSign * (halfGauge - 0.055));
        wsGroup.add(fMesh);
      }
    }

    group.add(wsGroup);
    wheelsets.push(wsGroup);
  }

  // Bogie side frames (left & right longitudinal beams)
  const frameLen = wheelbaseM + 0.72;
  const sideFrameGeom = new THREE.BoxGeometry(frameLen, 0.24, 0.14);
  for (const zSign of [-1, 1]) {
    const sf = new THREE.Mesh(sideFrameGeom, mats.bogieFrame);
    sf.position.set(0, wheelRadius + 0.12, zSign * (halfGauge + 0.18));
    group.add(sf);
  }

  // Central bolster / transom beam
  const bolsterGeom = new THREE.BoxGeometry(0.55, 0.26, trackGaugeM + 0.42);
  const bolster = new THREE.Mesh(bolsterGeom, mats.bogieFrame);
  bolster.position.set(0, wheelRadius + 0.18, 0);
  group.add(bolster);

  if (lod === 'high') {
    // Secondary air-spring suspension pillows (空気ばね) on left & right of bolster
    const airSpringGeom = new THREE.CylinderGeometry(0.28, 0.3, 0.26, 12);
    for (const zSign of [-1, 1]) {
      const sp = new THREE.Mesh(airSpringGeom, mats.gangwayBellows);
      sp.position.set(0, wheelRadius + 0.38, zSign * (halfGauge + 0.12));
      group.add(sp);
    }

    // Axle box housings at 4 corners
    const axleBoxGeom = new THREE.BoxGeometry(0.32, 0.28, 0.2);
    for (const xAxle of [halfWb, -halfWb]) {
      for (const zSign of [-1, 1]) {
        const ab = new THREE.Mesh(axleBoxGeom, mats.bogieFrame);
        ab.position.set(xAxle, wheelRadius + 0.02, zSign * (halfGauge + 0.22));
        group.add(ab);
      }
    }
  }

  // Ginza Line 1000 Series signature 600V DC Third-Rail Collector Shoes (第三軌条集電靴)
  if (hasThirdRailShoe) {
    const shoeBeamGeom = new THREE.BoxGeometry(wheelbaseM * 0.82, 0.11, 0.12);
    const shoePaddleGeom = new THREE.BoxGeometry(0.36, 0.08, 0.26);
    for (const zSign of [-1, 1]) {
      const zOut = zSign * (halfGauge + 0.31);
      const beam = new THREE.Mesh(shoeBeamGeom, mats.collectorShoe);
      beam.position.set(0, wheelRadius - 0.06, zOut);
      group.add(beam);

      const paddle = new THREE.Mesh(shoePaddleGeom, mats.collectorShoe);
      paddle.position.set(0, wheelRadius - 0.14, zOut + zSign * 0.08);
      group.add(paddle);
    }
  }

  return { group, wheelsets };
}

/**
 * Builds a single-arm pantograph (PS33H / PT71) mounted on the car roof crown.
 */
export function createSingleArmPantographGroup(
  mats: SeriesSharedMaterials,
  lod: RollingStockLodLevel,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Pantograph';

  if (lod === 'low') return group;

  // Base mounting frame
  const baseGeom = new THREE.BoxGeometry(1.45, 0.08, 1.15);
  const baseMesh = new THREE.Mesh(baseGeom, mats.bogieFrame);
  baseMesh.position.set(0, 0.06, 0);
  group.add(baseMesh);

  if (lod === 'high') {
    // 4 white porcelain support insulators
    const insGeom = new THREE.CylinderGeometry(0.06, 0.07, 0.16, 8);
    for (const x of [-0.58, 0.58]) {
      for (const z of [-0.46, 0.46]) {
        const ins = new THREE.Mesh(insGeom, mats.secondaryStripe);
        ins.position.set(x, 0.12, z);
        group.add(ins);
      }
    }
  }

  // Articulated arm sub-group (allows raising/lowering scaling along Y)
  const armGroup = new THREE.Group();
  armGroup.name = 'Pantograph_Arm';
  armGroup.position.set(0, 0.12, 0);

  // Lower single arm (tilted forward from rear hinge)
  const lowerArmGeom = new THREE.BoxGeometry(1.18, 0.06, 0.12);
  const lowerArm = new THREE.Mesh(lowerArmGeom, mats.pantographMetal);
  lowerArm.position.set(-0.12, 0.34, 0);
  lowerArm.rotation.z = 0.48;
  armGroup.add(lowerArm);

  // Upper articulated frame tilting back toward center contact wire
  const upperArmGeom = new THREE.BoxGeometry(1.24, 0.05, 0.09);
  const upperArm = new THREE.Mesh(upperArmGeom, mats.pantographMetal);
  upperArm.position.set(-0.08, 0.82, 0);
  upperArm.rotation.z = -0.44;
  armGroup.add(upperArm);

  // Contact strip panhead (舟体) spanning laterally across catenary wire
  const panGeom = new THREE.BoxGeometry(0.28, 0.05, 1.55);
  const panMesh = new THREE.Mesh(panGeom, mats.pantographMetal);
  panMesh.position.set(0.32, 1.12, 0);
  armGroup.add(panMesh);

  group.add(armGroup);
  return group;
}

/**
 * Builds a roof-mounted HVAC air-conditioning pod (AU737 / Metro compact AC).
 */
export function createRoofHvacPod(
  mats: SeriesSharedMaterials,
  lengthM: number,
  widthM: number,
  heightM: number,
): THREE.Mesh {
  const profile: [number, number][] = [
    [-widthM * 0.5, 0],
    [-widthM * 0.42, heightM],
    [widthM * 0.42, heightM],
    [widthM * 0.5, 0],
  ];
  const geom = extrudeProfileAlongX(profile, -lengthM * 0.5, lengthM * 0.5, true);
  const mesh = new THREE.Mesh(geom, mats.hvacUnit);
  mesh.name = 'Roof_HVAC';
  mesh.castShadow = true;
  return mesh;
}

/**
 * Builds underfloor VVVF inverter, SIV auxiliary power, brake control, and air reservoir equipment boxes.
 */
export function createUnderfloorEquipmentGroup(
  mats: SeriesSharedMaterials,
  spanLengthM: number,
  bodyWidthM: number,
  floorY: number,
  lod: RollingStockLodLevel,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Underfloor_Equipment';
  if (lod === 'low') return group;

  if (lod === 'medium') {
    const blockGeom = new THREE.BoxGeometry(spanLengthM * 0.72, 0.48, bodyWidthM * 0.74);
    const block = new THREE.Mesh(blockGeom, mats.bogieFrame);
    block.position.set(0, floorY - 0.34, 0);
    group.add(block);
    return group;
  }

  // High LOD: distinct functional boxes + cylindrical air tanks along left & right underfloor bays
  const boxes: { x: number; len: number; h: number; w: number; z: number }[] = [
    { x: -spanLengthM * 0.28, len: 2.3, h: 0.54, w: bodyWidthM * 0.34, z: -bodyWidthM * 0.22 },
    { x: 0.2, len: 2.8, h: 0.56, w: bodyWidthM * 0.36, z: -bodyWidthM * 0.21 },
    { x: spanLengthM * 0.3, len: 1.9, h: 0.5, w: bodyWidthM * 0.34, z: -bodyWidthM * 0.22 },
    { x: -spanLengthM * 0.24, len: 2.5, h: 0.52, w: bodyWidthM * 0.35, z: bodyWidthM * 0.21 },
    { x: spanLengthM * 0.22, len: 2.4, h: 0.54, w: bodyWidthM * 0.35, z: bodyWidthM * 0.21 },
  ];

  for (const b of boxes) {
    const g = new THREE.BoxGeometry(b.len, b.h, b.w);
    const m = new THREE.Mesh(g, mats.bogieFrame);
    m.position.set(b.x, floorY - 0.1 - b.h * 0.5, b.z);
    group.add(m);
  }

  // Dual cylindrical main air reservoirs (元空気ダメ)
  const tankGeom = new THREE.CylinderGeometry(0.21, 0.21, 1.65, 10);
  tankGeom.rotateZ(Math.PI * 0.5);
  for (const xTank of [-0.4, 1.35]) {
    const tank = new THREE.Mesh(tankGeom, mats.bogieFrame);
    tank.position.set(xTank, floorY - 0.36, bodyWidthM * 0.23);
    group.add(tank);
  }

  return group;
}

/**
 * Builds an inter-car accordion gangway bellows (貫通路幌) and coupler at the rear end of a car.
 */
export function createInterCarGangwayGroup(
  mats: SeriesSharedMaterials,
  gapM: number,
  floorY: number,
  doorHeightM: number,
  lod: RollingStockLodLevel,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Gangway_Rear';
  if (lod === 'low') return group;

  const bellowsDepth = Math.max(0.32, gapM * 0.92);
  const bellowsGeom = new THREE.BoxGeometry(bellowsDepth, doorHeightM + 0.16, 1.18);
  const bellowsMesh = new THREE.Mesh(bellowsGeom, mats.gangwayBellows);
  bellowsMesh.position.set(-bellowsDepth * 0.5, floorY + (doorHeightM + 0.16) * 0.5, 0);
  group.add(bellowsMesh);

  if (lod === 'high') {
    // Semi-permanent drawbar coupler beneath gangway
    const couplerGeom = new THREE.BoxGeometry(bellowsDepth + 0.2, 0.18, 0.26);
    const couplerMesh = new THREE.Mesh(couplerGeom, mats.bogieFrame);
    couplerMesh.position.set(-bellowsDepth * 0.5, floorY - 0.22, 0);
    group.add(couplerMesh);
  }

  return group;
}

export interface BuiltDoorPair {
  readonly side: 'left' | 'right';
  readonly doorwayIndex: number;
  readonly forwardLeaf: THREE.Mesh;
  readonly rearLeaf: THREE.Mesh;
  readonly closedForwardX: number;
  readonly closedRearX: number;
  readonly maxSlideOffsetM: number;
}

/**
 * Builds all double-leaf sliding passenger doors (`Door_L_*`, `Door_R_*`) and recessed passenger windows
 * along both sides of a car body.
 */
export function createSideDoorsAndWindows(params: {
  bodyStartX: number;
  bodyEndX: number;
  halfWidthM: number;
  floorY: number;
  doorsPerSide: 3 | 4;
  doorWidthM: number;
  doorHeightM: number;
  lod: RollingStockLodLevel;
  mats: SeriesSharedMaterials;
  windowGlassMat: THREE.Material;
  addVerticalGreenBandsAboveDoors?: boolean;
  addRoundEndAccentWindows?: boolean;
}): {
  group: THREE.Group;
  doors: BuiltDoorPair[];
} {
  const {
    bodyStartX,
    bodyEndX,
    halfWidthM,
    floorY,
    doorsPerSide,
    doorWidthM,
    doorHeightM,
    lod,
    mats,
    windowGlassMat,
    addVerticalGreenBandsAboveDoors = false,
    addRoundEndAccentWindows = false,
  } = params;

  const group = new THREE.Group();
  group.name = 'Doors_And_Windows';
  const doors: BuiltDoorPair[] = [];

  const usableSpan = bodyEndX - bodyStartX;
  const baySpan = usableSpan / doorsPerSide;
  const doorCentersX: number[] = [];
  for (let i = 0; i < doorsPerSide; i++) {
    doorCentersX.push(bodyStartX + (i + 0.5) * baySpan);
  }

  const leafWidth = doorWidthM * 0.5;
  const leafThickness = 0.032;
  const leafGeom = new THREE.BoxGeometry(leafWidth - 0.012, doorHeightM, leafThickness);
  const doorRecessBackdropGeom = new THREE.BoxGeometry(doorWidthM - 0.02, doorHeightM - 0.02, 0.012);

  for (const side of ['left', 'right'] as const) {
    const zSign = side === 'right' ? 1 : -1;
    // Backdrop sits flush just outside body skin (visible when doors slide open); door leaves slide immediately outside backdrop
    const backdropZ = zSign * (halfWidthM + 0.005);
    const doorZ = zSign * (halfWidthM + 0.024);

    for (let i = 0; i < doorCentersX.length; i++) {
      const cx = doorCentersX[i]!;

      if (lod === 'high') {
        // Dark interior doorway backdrop visible when sliding doors open!
        const backdrop = new THREE.Mesh(doorRecessBackdropGeom, mats.gangwayBellows);
        backdrop.position.set(cx, floorY + doorHeightM * 0.5, backdropZ);
        group.add(backdrop);
      }

      const fwdX = cx + leafWidth * 0.5;
      const rearX = cx - leafWidth * 0.5;

      const forwardLeaf = new THREE.Mesh(leafGeom, mats.doorLeaf);
      forwardLeaf.name = `Door_${side === 'left' ? 'L' : 'R'}_${i + 1}_Fwd`;
      forwardLeaf.position.set(fwdX, floorY + doorHeightM * 0.5, doorZ);
      group.add(forwardLeaf);

      const rearLeaf = new THREE.Mesh(leafGeom, mats.doorLeaf);
      rearLeaf.name = `Door_${side === 'left' ? 'L' : 'R'}_${i + 1}_Rear`;
      rearLeaf.position.set(rearX, floorY + doorHeightM * 0.5, doorZ);
      group.add(rearLeaf);

      doors.push({
        side,
        doorwayIndex: i,
        forwardLeaf,
        rearLeaf,
        closedForwardX: fwdX,
        closedRearX: rearX,
        maxSlideOffsetM: leafWidth * 0.92,
      });

      // E235-0 signature vertical Uguisu Green door header pillar extension up to the eave band
      if (addVerticalGreenBandsAboveDoors) {
        const headerGeom = new THREE.BoxGeometry(doorWidthM + 0.08, 0.34, 0.03);
        const header = new THREE.Mesh(headerGeom, mats.primaryStripe);
        header.position.set(cx, floorY + doorHeightM + 0.17, zSign * (halfWidthM + 0.004));
        group.add(header);
      }
    }

    // Passenger Windows between adjacent doorways
    const winBottomY = floorY + 0.84;
    const winHeight = 0.92;
    const winY = winBottomY + winHeight * 0.5;
    const winZ = zSign * (halfWidthM + 0.014);

    for (let i = 0; i < doorCentersX.length - 1; i++) {
      const midX = (doorCentersX[i]! + doorCentersX[i + 1]!) * 0.5;
      const availW = doorCentersX[i + 1]! - doorCentersX[i]! - doorWidthM - 0.56;
      if (availW <= 0.4) continue;

      const winGeom = new THREE.BoxGeometry(availW, winHeight, 0.028);
      const winMesh = new THREE.Mesh(winGeom, windowGlassMat);
      winMesh.position.set(midX, winY, winZ);
      group.add(winMesh);

      if (lod === 'high') {
        // Center mullion divider post
        const postGeom = new THREE.BoxGeometry(0.06, winHeight + 0.02, 0.034);
        const post = new THREE.Mesh(postGeom, mats.frontMask);
        post.position.set(midX, winY, winZ);
        group.add(post);
      }
    }

    // End windows outside outer doors
    const firstDoorX = doorCentersX[0]!;
    const lastDoorX = doorCentersX[doorCentersX.length - 1]!;
    const frontSpace = bodyEndX - (lastDoorX + doorWidthM * 0.5) - 0.35;
    const rearSpace = firstDoorX - doorWidthM * 0.5 - bodyStartX - 0.35;

    if (addRoundEndAccentWindows && lod !== 'low') {
      // Tokyo Metro 17000 Series iconic circular porthole-style accent windows near car ends!
      const roundGeom = new THREE.CylinderGeometry(0.34, 0.34, 0.034, 16);
      roundGeom.rotateX(Math.PI * 0.5);
      if (frontSpace > 0.6) {
        const rw = new THREE.Mesh(roundGeom, windowGlassMat);
        rw.position.set(lastDoorX + doorWidthM * 0.5 + frontSpace * 0.5, winY, winZ);
        group.add(rw);
      }
      if (rearSpace > 0.6) {
        const rw = new THREE.Mesh(roundGeom, windowGlassMat);
        rw.position.set(firstDoorX - doorWidthM * 0.5 - rearSpace * 0.5, winY, winZ);
        group.add(rw);
      }
    } else {
      if (frontSpace > 0.65) {
        const g = new THREE.BoxGeometry(frontSpace * 0.72, winHeight, 0.028);
        const m = new THREE.Mesh(g, windowGlassMat);
        m.position.set(lastDoorX + doorWidthM * 0.5 + frontSpace * 0.55, winY, winZ);
        group.add(m);
      }
      if (rearSpace > 0.65) {
        const g = new THREE.BoxGeometry(rearSpace * 0.72, winHeight, 0.028);
        const m = new THREE.Mesh(g, windowGlassMat);
        m.position.set(firstDoorX - doorWidthM * 0.5 - rearSpace * 0.55, winY, winZ);
        group.add(m);
      }
    }
  }

  return { group, doors };
}
