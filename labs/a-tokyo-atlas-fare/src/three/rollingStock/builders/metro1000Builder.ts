/**
 * SENKIRO Atlas v2 — Tokyo Metro 1000 Series (Ginza Line) 3D Mesh Builder (LOD0 / LOD1 / LOD2)
 *
 * Authentic reproduction of:
 *  - Compact 16.0m coupler pitch, 2.55m flat-sided standard-gauge (1,435mm) subway profile
 *  - Retro-modern tribute to the 1927 Type 1000: full Lemon-Yellow (#F5B100) car body,
 *    Reddish-Brown / Maroon (#683024) arched roof & overhanging front brow, and Ginza Orange (#FF8C00)
 *    + White + Dark Brown waist belt
 *  - Symmetrical front cab with central swing-out emergency door (中央貫通扉) framed by vertical
 *    decorative trim ribs, flanked by two cab windshields and vertically-stacked lower headlamp/taillamp clusters
 *  - 3 double-leaf sliding passenger doors per side (vs 4 on 20m commuter trains)
 *  - 600V DC Third-Rail collection: ZERO roof pantographs, SC101 steerable bogies equipped with side third-rail collector shoes
 */

import * as THREE from 'three';
import type {
  ConsistCarSlot,
  RollingStockLodLevel,
  RollingStockSpec,
} from '../../../domain/rollingStock/types.js';
import {
  createBogieGroup,
  createInterCarGangwayGroup,
  createRoofHvacPod,
  createSideDoorsAndWindows,
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
import type { BuiltCarLodResult } from './e235Builder.js';

export function buildMetro1000CarLod(params: {
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
  root.name = `Metro1000_Car_${slot.carNumber}_${lod}`;

  const carGroup = new THREE.Group();
  carGroup.name = 'Car_Canonical';
  if (isRearLead) {
    carGroup.rotation.y = Math.PI;
  }
  root.add(carGroup);

  const bodyLen = isLead ? dims.leadBodyLengthM : dims.intermediateBodyLengthM; // 15.52m / 15.40m
  const halfLen = bodyLen * 0.5;
  const halfW = dims.bodyWidthM * 0.5; // 1.275m (visibly narrower than E235's 1.475m!)
  const floorY = dims.floorHeightM; // 1.125m
  const eaveY = 3.06;
  const roofH = dims.roofHeightM; // 3.465m

  const headMat = isRearLead ? lightMats.rearEndHeadlight : lightMats.frontEndHeadlight;
  const tailMat = isRearLead ? lightMats.rearEndTaillight : lightMats.frontEndTaillight;

  const shellFrontX = isLead ? halfLen - 0.38 : halfLen;
  const shellRearX = -halfLen;

  // Main Lemon-Yellow Body Shell (with textured Ginza Orange + White + Brown waist belt)
  const bodyProfile = getCarBodyCrossSectionYZ(spec.bodyProfile, halfW, floorY, eaveY);
  const bodyGeom = extrudeProfileAlongX(bodyProfile, shellRearX, shellFrontX, true);
  const bodyMesh = new THREE.Mesh(bodyGeom, mats.bodyPrimary);
  bodyMesh.name = 'Body_Shell';
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  carGroup.add(bodyMesh);

  // Classic 1927-Tribute Maroon / Reddish-Brown Arched Roof Crown (NO pantographs!)
  const roofProfile = getCarRoofCrossSectionYZ(spec.bodyProfile, halfW, eaveY, roofH);
  const roofGeom = extrudeProfileAlongX(roofProfile, shellRearX, shellFrontX, true);
  const roofMesh = new THREE.Mesh(roofGeom, mats.roof);
  roofMesh.name = 'Roof_Maroon_Crown';
  roofMesh.castShadow = true;
  carGroup.add(roofMesh);

  // Explicit 3D raised Ginza Orange + White waist belt moldings on both sides (so even at grazing angles & low LOD the belt pops)
  const beltLen = shellFrontX - shellRearX;
  const beltMidX = (shellFrontX + shellRearX) * 0.5;
  const orangeBeltGeom = new THREE.BoxGeometry(beltLen, 0.16, 0.022);
  const whiteTrimGeom = new THREE.BoxGeometry(beltLen, 0.05, 0.026);

  for (const zSign of [-1, 1]) {
    const zPos = zSign * (halfW + 0.004);
    const orangeBelt = new THREE.Mesh(orangeBeltGeom, mats.primaryStripe);
    orangeBelt.position.set(beltMidX, floorY + 0.72, zPos);
    carGroup.add(orangeBelt);

    const upperWhite = new THREE.Mesh(whiteTrimGeom, mats.secondaryStripe);
    upperWhite.position.set(beltMidX, floorY + 0.82, zPos);
    carGroup.add(upperWhite);

    const lowerWhite = new THREE.Mesh(whiteTrimGeom, mats.secondaryStripe);
    lowerWhite.position.set(beltMidX, floorY + 0.62, zPos);
    carGroup.add(lowerWhite);
  }

  // ---- Lead Car Iconic Retro-Modern Front Cab (1927 Type 1000 Motif) ----
  if (isLead) {
    const cabGroup = new THREE.Group();
    cabGroup.name = 'Lead_Cab_Front';
    const noseX0 = shellFrontX;
    const noseDepth = 0.42;
    const noseTipX = noseX0 + noseDepth;

    // 1. Boxy slightly chamfered Lemon-Yellow Front Nose Block
    const noseBlockGeom = new THREE.BoxGeometry(
      noseDepth,
      eaveY - floorY,
      dims.bodyWidthM - 0.08,
    );
    const noseBlock = new THREE.Mesh(noseBlockGeom, mats.bodySecondary);
    noseBlock.position.set(noseX0 + noseDepth * 0.5, (eaveY + floorY) * 0.5, 0);
    noseBlock.castShadow = true;
    cabGroup.add(noseBlock);

    // 2. Classic Overhanging Maroon Roof Brow Cap at top of cab face
    const browGeom = new THREE.BoxGeometry(noseDepth + 0.08, 0.36, dims.bodyWidthM - 0.12);
    const browMesh = new THREE.Mesh(browGeom, mats.roof);
    browMesh.position.set(noseX0 + noseDepth * 0.52, eaveY + 0.16, 0);
    cabGroup.add(browMesh);

    // Front continuation of the Ginza Orange + White waist belt across the nose
    const frontOrangeGeom = new THREE.BoxGeometry(0.05, 0.16, dims.bodyWidthM - 0.14);
    const frontOrange = new THREE.Mesh(frontOrangeGeom, mats.primaryStripe);
    frontOrange.position.set(noseTipX + 0.01, floorY + 0.72, 0);
    cabGroup.add(frontOrange);

    const frontWhiteGeom = new THREE.BoxGeometry(0.052, 0.24, dims.bodyWidthM - 0.14);
    const frontWhite = new THREE.Mesh(frontWhiteGeom, mats.secondaryStripe);
    frontWhite.position.set(noseTipX + 0.008, floorY + 0.72, 0);
    cabGroup.add(frontWhite);

    // 3. Central Swing-Out Emergency Exit Door (中央貫通扉) with vertical retro trim moldings
    const centerDoorW = 0.66;
    const centerDoorH = eaveY - floorY - 0.14;
    const centerDoorFrameGeom = new THREE.BoxGeometry(0.065, centerDoorH, centerDoorW);
    const centerDoorFrame = new THREE.Mesh(centerDoorFrameGeom, mats.bodySecondary);
    centerDoorFrame.position.set(noseTipX + 0.012, floorY + centerDoorH * 0.5 + 0.04, 0);
    cabGroup.add(centerDoorFrame);

    if (lod !== 'low') {
      // Vertical dark/metallic trim pillars flanking the central emergency door
      const trimPillarGeom = new THREE.BoxGeometry(0.075, centerDoorH + 0.04, 0.045);
      for (const zSign of [-1, 1]) {
        const pillar = new THREE.Mesh(trimPillarGeom, mats.frontMask);
        pillar.position.set(
          noseTipX + 0.015,
          floorY + centerDoorH * 0.5 + 0.04,
          zSign * (centerDoorW * 0.5 + 0.02),
        );
        cabGroup.add(pillar);
      }

      // Central emergency door window + Left & Right driver windshields
      const centerWinGeom = new THREE.BoxGeometry(0.04, 0.64, 0.44);
      const centerWin = new THREE.Mesh(centerWinGeom, lightMats.cabinWindowGlass);
      centerWin.position.set(noseTipX + 0.032, floorY + 1.32, 0);
      cabGroup.add(centerWin);

      const sideWinGeom = new THREE.BoxGeometry(0.04, 0.72, 0.62);
      for (const zSign of [-1, 1]) {
        const sw = new THREE.Mesh(sideWinGeom, lightMats.cabinWindowGlass);
        sw.position.set(noseTipX + 0.022, floorY + 1.34, zSign * 0.76);
        cabGroup.add(sw);
      }

      // Upper Center LED Destination Matrix ([G] 浅草 / 渋谷)
      const destGeom = new THREE.BoxGeometry(0.05, 0.22, 0.92);
      const destMesh = new THREE.Mesh(destGeom, lightMats.destinationSign);
      destMesh.name = 'Destination_Sign_Front';
      destMesh.position.set(noseTipX + 0.03, eaveY - 0.14, 0);
      cabGroup.add(destMesh);
    }

    // 4. Vertically-Stacked Dual Headlamp / Taillamp Clusters on lower left & right front pillars
    const bezGeom = new THREE.BoxGeometry(0.06, 0.46, 0.22);
    const lampCylGeom = new THREE.CylinderGeometry(0.075, 0.075, 0.065, lod === 'high' ? 12 : 8);
    lampCylGeom.rotateZ(Math.PI * 0.5);

    for (const zSign of [-1, 1]) {
      const zLamp = zSign * 0.92;
      // Dark metallic lamp housing bezel
      const bez = new THREE.Mesh(bezGeom, mats.frontMask);
      bez.position.set(noseTipX + 0.015, floorY + 0.46, zLamp);
      cabGroup.add(bez);

      // Upper round lamp = White LED Headlight
      const hl = new THREE.Mesh(lampCylGeom, headMat);
      hl.name = zSign < 0 ? 'Headlight_L' : 'Headlight_R';
      hl.position.set(noseTipX + 0.03, floorY + 0.56, zLamp);
      cabGroup.add(hl);

      // Lower round lamp = Red LED Taillight
      const tl = new THREE.Mesh(lampCylGeom, tailMat);
      tl.name = zSign < 0 ? 'Taillight_L' : 'Taillight_R';
      tl.position.set(noseTipX + 0.03, floorY + 0.36, zLamp);
      cabGroup.add(tl);
    }

    // 5. Compact Lower Cowcatcher Skirt & Coupler
    const skirtGeom = new THREE.BoxGeometry(0.38, 0.44, dims.bodyWidthM - 0.24);
    const skirt = new THREE.Mesh(skirtGeom, mats.bodySecondary);
    skirt.position.set(noseTipX - 0.18, floorY - 0.28, 0);
    cabGroup.add(skirt);

    if (lod === 'high') {
      const couplerGeom = new THREE.BoxGeometry(0.4, 0.2, 0.28);
      const coupler = new THREE.Mesh(couplerGeom, mats.bogieFrame);
      coupler.position.set(noseTipX + 0.04, floorY - 0.32, 0);
      cabGroup.add(coupler);
    }

    carGroup.add(cabGroup);
  }

  if (lod === 'low') {
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

  // ---- High & Medium LOD: 3 Double-Leaf Sliding Passenger Doors per Side & Windows ----
  const doorZoneStartX = -halfLen + 0.85;
  const doorZoneEndX = isLead ? shellFrontX - 0.95 : halfLen - 0.85;

  const { group: doorsWinGroup, doors } = createSideDoorsAndWindows({
    bodyStartX: doorZoneStartX,
    bodyEndX: doorZoneEndX,
    halfWidthM: halfW,
    floorY,
    doorsPerSide: dims.doorsPerSide, // 3 doors per side!
    doorWidthM: dims.doorWidthM,
    doorHeightM: dims.doorHeightM,
    lod,
    mats,
    windowGlassMat: lightMats.cabinWindowGlass,
    addVerticalGreenBandsAboveDoors: false,
    addRoundEndAccentWindows: false,
  });
  carGroup.add(doorsWinGroup);

  // ---- Roof HVAC Pods (2 Compact Low-Profile Coolers per car, ZERO Pantographs!) ----
  for (const xHvac of [-3.3, 3.3]) {
    const pod = createRoofHvacPod(mats, 2.85, 1.78, 0.22);
    pod.position.set(xHvac, roofH - 0.04, 0);
    carGroup.add(pod);
  }

  // ---- Underfloor Equipment Boxes ----
  const underfloor = createUnderfloorEquipmentGroup(
    mats,
    dims.bogieCenterDistanceM - 2.6,
    dims.bodyWidthM,
    floorY,
    lod,
  );
  carGroup.add(underfloor);

  // ---- Standard-Gauge (1,435mm) SC101 Steerable Bogies WITH Third-Rail Collector Shoes ----
  const halfBogieSpan = dims.bogieCenterDistanceM * 0.5; // 5.30m
  const frontBogieBuilt = createBogieGroup({
    trackGaugeM: dims.trackGaugeM, // 1.435m standard gauge!
    wheelbaseM: dims.bogieWheelbaseM,
    wheelDiameterM: dims.wheelDiameterM,
    hasThirdRailShoe: true, // Distinctive third-rail collector shoe paddles!
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
    hasThirdRailShoe: true,
    lod,
    mats,
  });
  rearBogieBuilt.group.name = 'Bogie_Rear';
  rearBogieBuilt.group.position.set(-halfBogieSpan, 0, 0);
  root.add(rearBogieBuilt.group);

  // ---- Inter-Car Accordion Gangway Bellows ----
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
    pantographs: [], // Strictly 0 pantographs on third-rail Ginza Line 1000 Series!
    rearGangway,
  };
}
