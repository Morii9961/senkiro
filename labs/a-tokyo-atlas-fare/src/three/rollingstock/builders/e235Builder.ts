/**
 * SENKIRO Atlas v2 — JR East E235-0 Series (Yamanote Line) 3D Mesh Builder (LOD0 / LOD1 / LOD2)
 *
 * Authentic reproduction of:
 *  - 20.0m coupler pitch, 2.95m wide-body barrel cross-section (拡幅車体裾絞り断面)
 *  - Ken Okuyama "Flat Digital Frame" front face: rounded Uguisu Green (#80C241) outer bezel,
 *    flat black glass front mask, upper-corner rectangular LED headlights, upper LED destination display,
 *    and white-silver crash-energy cowcatcher skirt (排障器)
 *  - Sustina flush laser-welded stainless steel body with 4 VERTICAL Uguisu Green graduated dot-matrix
 *    door bands per side (no horizontal waist stripe!) + upper cantrail Uguisu Green eave line
 *  - DT80/TR264 narrow-gauge (1,067mm) bolsterless bogies, AU737 roof HVAC pods, PS33H single-arm pantograph
 */

import * as THREE from 'three';
import type {
  ConsistCarSlot,
  RollingStockLodLevel,
  RollingStockSpec,
} from '../domain/types.js';
import {
  createBogieGroup,
  createInterCarGangwayGroup,
  createRoofHvacPod,
  createSideDoorsAndWindows,
  createSingleArmPantographGroup,
  createUnderfloorEquipmentGroup,
  extrudeProfileAlongX,
  getCarBodyCrossSectionYZ,
  getCarRoofCrossSectionYZ,
  type BuiltDoorPair,
} from '../components.js';
import type {
  ConsistDynamicLightMaterials,
  SeriesSharedMaterials,
} from '../materials.js';

export interface BuiltCarLodResult {
  readonly group: THREE.Group;
  readonly frontBogie: THREE.Group | null;
  readonly rearBogie: THREE.Group | null;
  readonly wheelsets: THREE.Group[];
  readonly doors: BuiltDoorPair[];
  readonly pantographs: THREE.Group[];
  readonly rearGangway: THREE.Group | null;
}

export function buildE235CarLod(params: {
  spec: RollingStockSpec;
  slot: ConsistCarSlot;
  lod: RollingStockLodLevel;
  mats: SeriesSharedMaterials;
  lightMats: ConsistDynamicLightMaterials;
}): BuiltCarLodResult {
  const { spec, slot, lod, mats, lightMats } = params;
  const dims = spec.dimensions;
  const isLead = slot.role === 'lead_front' || slot.role === 'lead_rear';
  const isRearLead = slot.role === 'lead_rear';

  const root = new THREE.Group();
  root.name = `E235_Car_${slot.carNumber}_${lod}`;

  // Build in canonical orientation (+X = cab front for lead cars), then rotate 180 deg around Y if lead_rear
  const carGroup = new THREE.Group();
  carGroup.name = 'Car_Canonical';
  if (isRearLead) {
    carGroup.rotation.y = Math.PI;
  }
  root.add(carGroup);

  const bodyLen = isLead ? dims.leadBodyLengthM : dims.intermediateBodyLengthM;
  const halfLen = bodyLen * 0.5;
  const halfW = dims.bodyWidthM * 0.5; // 1.475m
  const floorY = dims.floorHeightM; // 1.13m
  const eaveY = 3.32;
  const roofH = dims.roofHeightM; // 3.62m

  // Choose headlight/taillight dynamic material according to whether this cab is at front or rear of consist
  const headMat = isRearLead ? lightMats.rearEndHeadlight : lightMats.frontEndHeadlight;
  const tailMat = isRearLead ? lightMats.rearEndTaillight : lightMats.frontEndTaillight;

  // Main car body shell (for lead car, stops 0.55m short of front tip so the sculpted cab nose forms the front)
  const shellFrontX = isLead ? halfLen - 0.52 : halfLen;
  const shellRearX = -halfLen;

  const bodyProfile = getCarBodyCrossSectionYZ(spec.bodyProfile, halfW, floorY, eaveY);
  const bodyGeom = extrudeProfileAlongX(bodyProfile, shellRearX, shellFrontX, true);
  const bodyMesh = new THREE.Mesh(bodyGeom, mats.bodyPrimary);
  bodyMesh.name = 'Body_Shell';
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  carGroup.add(bodyMesh);

  // Arched Sustina roof crown
  const roofProfile = getCarRoofCrossSectionYZ(spec.bodyProfile, halfW, eaveY, roofH);
  const roofGeom = extrudeProfileAlongX(roofProfile, shellRearX, shellFrontX, true);
  const roofMesh = new THREE.Mesh(roofGeom, mats.roof);
  roofMesh.name = 'Roof_Crown';
  roofMesh.castShadow = true;
  carGroup.add(roofMesh);

  // Upper cantrail Uguisu Green eave line running along both sides of the car
  const eaveStripeLen = shellFrontX - shellRearX;
  const eaveMidX = (shellFrontX + shellRearX) * 0.5;
  const eaveGeom = new THREE.BoxGeometry(eaveStripeLen, 0.13, 0.025);
  for (const zSign of [-1, 1]) {
    const eaveStripe = new THREE.Mesh(eaveGeom, mats.primaryStripe);
    eaveStripe.position.set(eaveMidX, eaveY - 0.08, zSign * (halfW - 0.035));
    carGroup.add(eaveStripe);
  }

  // ---- Lead Car Iconic "Flat Digital Smartphone Frame" Front Cab ----
  if (isLead) {
    const cabGroup = new THREE.Group();
    cabGroup.name = 'Lead_Cab_Front';
    const noseX0 = shellFrontX;
    const noseDepth = 0.55;
    const noseTipX = noseX0 + noseDepth;

    // 1. Thick Rounded Uguisu Green Outer Bezel Frame (#80C241) wrapping the front cab
    const bezelGeom = new THREE.BoxGeometry(noseDepth, eaveY - floorY + 0.16, dims.bodyWidthM - 0.04);
    const bezelMesh = new THREE.Mesh(bezelGeom, mats.primaryStripe);
    bezelMesh.position.set(noseX0 + noseDepth * 0.5, (eaveY + floorY) * 0.5, 0);
    bezelMesh.castShadow = true;
    cabGroup.add(bezelMesh);

    // Rounded green forehead brow bridging bezel to roof crown
    const browGeom = new THREE.BoxGeometry(noseDepth * 0.92, 0.24, dims.bodyWidthM - 0.28);
    const browMesh = new THREE.Mesh(browGeom, mats.primaryStripe);
    browMesh.position.set(noseX0 + noseDepth * 0.46, eaveY + 0.14, 0);
    cabGroup.add(browMesh);

    // Side Uguisu Green corner wrap behind front cab bezel (framing driver cab door)
    const sideWrapGeom = new THREE.BoxGeometry(0.95, eaveY - floorY, 0.028);
    for (const zSign of [-1, 1]) {
      const wrap = new THREE.Mesh(sideWrapGeom, mats.primaryStripe);
      wrap.position.set(noseX0 - 0.42, (eaveY + floorY) * 0.5, zSign * (halfW + 0.004));
      cabGroup.add(wrap);

      if (lod !== 'low') {
        // Driver cab side window
        const cabWinGeom = new THREE.BoxGeometry(0.56, 0.78, 0.034);
        const cabWin = new THREE.Mesh(cabWinGeom, lightMats.cabinWindowGlass);
        cabWin.position.set(noseX0 - 0.36, floorY + 1.28, zSign * (halfW + 0.006));
        cabGroup.add(cabWin);
      }
    }

    // 2. Flat Glossy Black Glass Front Screen ("スマホ顔") inset inside the Uguisu Green outer bezel
    const maskW = dims.bodyWidthM - 0.34;
    const maskH = eaveY - floorY - 0.12;
    const maskGeom = new THREE.BoxGeometry(0.08, maskH, maskW);
    const maskMesh = new THREE.Mesh(maskGeom, mats.frontMask);
    maskMesh.position.set(noseTipX - 0.01, (eaveY + floorY) * 0.5 + 0.03, 0);
    cabGroup.add(maskMesh);

    // Panoramic front windshield glass panel inside black visor
    if (lod !== 'low') {
      const windGeom = new THREE.BoxGeometry(0.04, 0.94, maskW - 0.18);
      const windMesh = new THREE.Mesh(windGeom, lightMats.cabinWindowGlass);
      windMesh.position.set(noseTipX + 0.02, floorY + 1.44, 0);
      cabGroup.add(windMesh);

      // Off-center vertical cab pillar & bottom black wiper bar
      const pillarGeom = new THREE.BoxGeometry(0.05, 0.94, 0.06);
      const pillar = new THREE.Mesh(pillarGeom, mats.frontMask);
      pillar.position.set(noseTipX + 0.025, floorY + 1.44, 0.32);
      cabGroup.add(pillar);
    }

    // 3. Upper-Corner Rectangular LED Headlights (E235 signature high-mounted corner headlights!)
    const hlGeom = new THREE.BoxGeometry(0.05, 0.18, 0.34);
    for (const zSign of [-1, 1]) {
      const hl = new THREE.Mesh(hlGeom, headMat);
      hl.name = zSign < 0 ? 'Headlight_L' : 'Headlight_R';
      hl.position.set(noseTipX + 0.025, eaveY - 0.22, zSign * (maskW * 0.5 - 0.24));
      cabGroup.add(hl);
    }

    // 4. Red LED Taillight Strips (mounted above/beside the upper visor & lower skirt corners)
    const tlGeom = new THREE.BoxGeometry(0.05, 0.09, 0.28);
    for (const zSign of [-1, 1]) {
      const tl = new THREE.Mesh(tlGeom, tailMat);
      tl.name = zSign < 0 ? 'Taillight_L' : 'Taillight_R';
      tl.position.set(noseTipX + 0.025, eaveY - 0.07, zSign * (maskW * 0.5 - 0.24));
      cabGroup.add(tl);
    }

    // 5. Center Top Full-Color LED Destination & Line Matrix Sign
    if (lod !== 'low') {
      const destGeom = new THREE.BoxGeometry(0.045, 0.2, 1.05);
      const destMesh = new THREE.Mesh(destGeom, lightMats.destinationSign);
      destMesh.name = 'Destination_Sign_Front';
      destMesh.position.set(noseTipX + 0.024, eaveY - 0.16, 0);
      cabGroup.add(destMesh);
    }

    // 6. White-Silver Crash-Energy Cowcatcher Skirt (排障器) & Shibata Tight-Lock Coupler
    const skirtGeom = new THREE.BoxGeometry(0.48, 0.54, dims.bodyWidthM - 0.22);
    const skirtMesh = new THREE.Mesh(skirtGeom, mats.bodySecondary);
    skirtMesh.position.set(noseTipX - 0.26, floorY - 0.34, 0);
    cabGroup.add(skirtMesh);

    if (lod === 'high') {
      const couplerGeom = new THREE.BoxGeometry(0.45, 0.22, 0.32);
      const coupler = new THREE.Mesh(couplerGeom, mats.bogieFrame);
      coupler.position.set(noseTipX + 0.04, floorY - 0.36, 0);
      cabGroup.add(coupler);
    }

    carGroup.add(cabGroup);
  }

  // ---- Low LOD (LOD2 Far Overview): add 4 distinct vertical Uguisu Green door bands per side ----
  if (lod === 'low') {
    const doorStartX = -halfLen + 1.2;
    const doorEndX = isLead ? shellFrontX - 1.1 : halfLen - 1.2;
    const baySpan = (doorEndX - doorStartX) / dims.doorsPerSide;
    const bandGeom = new THREE.BoxGeometry(dims.doorWidthM, eaveY - floorY - 0.1, 0.03);

    for (const zSign of [-1, 1]) {
      for (let i = 0; i < dims.doorsPerSide; i++) {
        const cx = doorStartX + (i + 0.5) * baySpan;
        const band = new THREE.Mesh(bandGeom, mats.primaryStripe);
        band.position.set(cx, (eaveY + floorY) * 0.5, zSign * (halfW + 0.005));
        carGroup.add(band);
      }
    }

    return {
      group: root,
      frontBogie: null,
      rearBogie: null,
      wheelsets: [],
      doors: [],
      pantographs: [],
      rearGangway: null,
    };
  }

  // ---- High & Medium LOD: Movable Double-Leaf Sliding Passenger Doors & Windows ----
  const doorZoneStartX = -halfLen + 0.95;
  const doorZoneEndX = isLead ? shellFrontX - 1.05 : halfLen - 0.95;

  const { group: doorsWinGroup, doors } = createSideDoorsAndWindows({
    bodyStartX: doorZoneStartX,
    bodyEndX: doorZoneEndX,
    halfWidthM: halfW,
    floorY,
    doorsPerSide: dims.doorsPerSide,
    doorWidthM: dims.doorWidthM,
    doorHeightM: dims.doorHeightM,
    lod,
    mats,
    windowGlassMat: lightMats.cabinWindowGlass,
    addVerticalGreenBandsAboveDoors: true,
    addRoundEndAccentWindows: false,
  });
  carGroup.add(doorsWinGroup);

  // ---- Roof HVAC Pods (2 AU737 Centralized Coolers per car) ----
  for (const xHvac of [-4.1, 4.1]) {
    const pod = createRoofHvacPod(mats, 3.6, 2.05, 0.28);
    pod.position.set(xHvac, roofH - 0.04, 0);
    carGroup.add(pod);
  }

  // ---- PS33H Single-Arm Pantographs on MoHa cars ----
  const pantographs: THREE.Group[] = [];
  if (slot.hasPantograph && slot.pantographCount > 0) {
    const panto1 = createSingleArmPantographGroup(mats, lod);
    panto1.position.set(-halfLen + 2.35, roofH - 0.02, 0);
    carGroup.add(panto1);
    pantographs.push(panto1);

    if (slot.pantographCount >= 2) {
      const panto2 = createSingleArmPantographGroup(mats, lod);
      panto2.position.set(halfLen - 2.35, roofH - 0.02, 0);
      panto2.rotation.y = Math.PI;
      carGroup.add(panto2);
      pantographs.push(panto2);
    }
  }

  // ---- Underfloor VVVF / SIV Equipment Boxes ----
  const underfloor = createUnderfloorEquipmentGroup(
    mats,
    dims.bogieCenterDistanceM - 3.2,
    dims.bodyWidthM,
    floorY,
    lod,
  );
  carGroup.add(underfloor);

  // ---- Front & Rear Articulating DT80 / TR264 Bogies ----
  const halfBogieSpan = dims.bogieCenterDistanceM * 0.5;
  const frontBogieBuilt = createBogieGroup({
    trackGaugeM: dims.trackGaugeM,
    wheelbaseM: dims.bogieWheelbaseM,
    wheelDiameterM: dims.wheelDiameterM,
    hasThirdRailShoe: false,
    lod,
    mats,
  });
  frontBogieBuilt.group.name = 'Bogie_Front';
  frontBogieBuilt.group.position.set(halfBogieSpan, 0, 0);
  root.add(frontBogieBuilt.group);

  const rearBogieBuilt = createBogieGroup({
    trackGaugeM: dims.trackGaugeM,
    wheelbaseM: dims.bogieWheelbaseM,
    wheelDiameterM: dims.wheelDiameterM,
    hasThirdRailShoe: false,
    lod,
    mats,
  });
  rearBogieBuilt.group.name = 'Bogie_Rear';
  rearBogieBuilt.group.position.set(-halfBogieSpan, 0, 0);
  root.add(rearBogieBuilt.group);

  // ---- Inter-Car Accordion Gangway Bellows at Rear Coupling End ----
  let rearGangway: THREE.Group | null = null;
  if (slot.role !== 'lead_rear') {
    rearGangway = createInterCarGangwayGroup(
      mats,
      dims.interCarGapM,
      floorY,
      dims.doorHeightM,
      lod,
    );
    rearGangway.position.set(-halfLen, 0, 0);
    root.add(rearGangway);
  }

  const normalizedDoors: BuiltDoorPair[] = isRearLead
    ? doors.map((d) => ({
        ...d,
        side: d.side === 'left' ? 'right' : 'left',
      }))
    : doors;

  return {
    group: root,
    frontBogie: frontBogieBuilt.group,
    rearBogie: rearBogieBuilt.group,
    wheelsets: [...frontBogieBuilt.wheelsets, ...rearBogieBuilt.wheelsets],
    doors: normalizedDoors,
    pantographs,
    rearGangway,
  };
}
