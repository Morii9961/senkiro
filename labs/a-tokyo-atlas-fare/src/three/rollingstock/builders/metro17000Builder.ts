/**
 * SENKIRO Atlas v2 — Tokyo Metro 17000 Series (Yurakucho & Fukutoshin Lines) 3D Mesh Builder (LOD0 / LOD1 / LOD2)
 *
 * Authentic reproduction of:
 *  - 20.0m coupler pitch, 2.80m Hitachi A-train double-skin tapered aluminum profile
 *  - Streamlined backward-sloped 3D curved black glass front dome (流線型傾斜ブラックドーム)
 *  - Iconic dual circular ring LED headlights ("丸目ヘッドライト") + inner red ring taillights
 *    inheriting the 7000 / 10000 Series lineage
 *  - Off-center (assistant-side) emergency evacuation door with circular window motif
 *  - Sculpted Champagne-Gold (#C5A467) & Espresso-Brown (#8F5126) aerodynamic front apron & skirt
 *  - Continuous horizontal dual-line waist & eave stripes (Yurakucho Line Gold #C8A96E + Fukutoshin Line Brown #8F5126)
 *  - Circular porthole-style accent windows near car ends, FS779 narrow-gauge bogies, PT71 single-arm pantograph
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
import type { BuiltCarLodResult } from './e235Builder.js';

export function buildMetro17000CarLod(params: {
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
  root.name = `Metro17000_Car_${slot.carNumber}_${lod}`;

  const carGroup = new THREE.Group();
  carGroup.name = 'Car_Canonical';
  if (isRearLead) {
    carGroup.rotation.y = Math.PI;
  }
  root.add(carGroup);

  const bodyLen = isLead ? dims.leadBodyLengthM : dims.intermediateBodyLengthM; // 19.63m / 19.50m
  const halfLen = bodyLen * 0.5;
  const halfW = dims.bodyWidthM * 0.5; // 1.40m
  const floorY = dims.floorHeightM; // 1.14m
  const eaveY = 3.31;
  const roofH = dims.roofHeightM; // 3.635m

  const headMat = isRearLead ? lightMats.rearEndHeadlight : lightMats.frontEndHeadlight;
  const tailMat = isRearLead ? lightMats.rearEndTaillight : lightMats.frontEndTaillight;

  // For lead car, the aerodynamic sloped nose occupies the forward 1.10 meters
  const noseLen = 1.1;
  const shellFrontX = isLead ? halfLen - noseLen : halfLen;
  const shellRearX = -halfLen;

  // Main A-Train Brushed Aluminum Body Shell
  const bodyProfile = getCarBodyCrossSectionYZ(spec.bodyProfile, halfW, floorY, eaveY);
  const bodyGeom = extrudeProfileAlongX(bodyProfile, shellRearX, shellFrontX, true);
  const bodyMesh = new THREE.Mesh(bodyGeom, mats.bodyPrimary);
  bodyMesh.name = 'Body_Shell';
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  carGroup.add(bodyMesh);

  // Arched A-Train Roof Crown
  const roofProfile = getCarRoofCrossSectionYZ(spec.bodyProfile, halfW, eaveY, roofH);
  const roofGeom = extrudeProfileAlongX(roofProfile, shellRearX, shellFrontX, true);
  const roofMesh = new THREE.Mesh(roofGeom, mats.roof);
  roofMesh.name = 'Roof_Crown';
  roofMesh.castShadow = true;
  carGroup.add(roofMesh);

  // Explicit 3D raised Yurakucho Gold + Fukutoshin Brown Horizontal Dual Belts along both sides
  // (Ensures crisp dual-color horizontal stripe visibility at all distances & angles, contrasting with E235's vertical green door bands!)
  const beltLen = shellFrontX - shellRearX;
  const beltMidX = (shellFrontX + shellRearX) * 0.5;
  const goldWaistGeom = new THREE.BoxGeometry(beltLen, 0.14, 0.022);
  const brownWaistGeom = new THREE.BoxGeometry(beltLen, 0.12, 0.022);
  const eaveGoldGeom = new THREE.BoxGeometry(beltLen, 0.09, 0.022);
  const eaveBrownGeom = new THREE.BoxGeometry(beltLen, 0.09, 0.022);

  for (const zSign of [-1, 1]) {
    const zWaist = zSign * (halfW + 0.004);
    const zEave = zSign * (halfW - 0.055);

    const goldWaist = new THREE.Mesh(goldWaistGeom, mats.primaryStripe);
    goldWaist.position.set(beltMidX, floorY + 0.78, zWaist);
    carGroup.add(goldWaist);

    const brownWaist = new THREE.Mesh(brownWaistGeom, mats.secondaryStripe);
    brownWaist.position.set(beltMidX, floorY + 0.63, zWaist);
    carGroup.add(brownWaist);

    const goldEave = new THREE.Mesh(eaveGoldGeom, mats.primaryStripe);
    goldEave.position.set(beltMidX, eaveY - 0.17, zEave);
    carGroup.add(goldEave);

    const brownEave = new THREE.Mesh(eaveBrownGeom, mats.secondaryStripe);
    brownEave.position.set(beltMidX, eaveY - 0.07, zEave);
    carGroup.add(brownEave);
  }

  // ---- Lead Car Streamlined Sloped 3D Curved Front Cab & Round Ring Headlights ("丸目") ----
  if (isLead) {
    const cabGroup = new THREE.Group();
    cabGroup.name = 'Lead_Cab_Aero_Front';
    const xBase = shellFrontX;
    const xTip = halfLen;

    // 1. Lower Sculpted Champagne-Gold & Espresso-Brown Nose Chin Apron (y = floorY - 0.11 .. floorY + 0.78)
    const chinH = 0.88;
    const chinGeom = new THREE.BoxGeometry(noseLen, chinH, dims.bodyWidthM - 0.12);
    const chinMesh = new THREE.Mesh(chinGeom, mats.bodySecondary);
    chinMesh.position.set(xBase + noseLen * 0.5, floorY + chinH * 0.5 - 0.1, 0);
    chinMesh.castShadow = true;
    cabGroup.add(chinMesh);

    // Front wrap-around Fukutoshin Brown lower accent band on the nose chin
    const frontBrownGeom = new THREE.BoxGeometry(noseLen + 0.04, 0.16, dims.bodyWidthM - 0.08);
    const frontBrown = new THREE.Mesh(frontBrownGeom, mats.secondaryStripe);
    frontBrown.position.set(xBase + noseLen * 0.5, floorY + 0.56, 0);
    cabGroup.add(frontBrown);

    // Front wrap-around Yurakucho Gold upper chin band
    const frontGoldGeom = new THREE.BoxGeometry(noseLen + 0.05, 0.16, dims.bodyWidthM - 0.1);
    const frontGold = new THREE.Mesh(frontGoldGeom, mats.primaryStripe);
    frontGold.position.set(xBase + noseLen * 0.5, floorY + 0.73, 0);
    cabGroup.add(frontGold);

    // 2. Aerodynamic Backward-Sloped Black Glass Dome (tilted ~16 degrees back from chin to roof crown!)
    const domeHeight = 1.88;
    const domeDepth = 0.88;
    const domeFrontX = domeDepth * 0.5;

    const domeGroup = new THREE.Group();
    domeGroup.name = 'Aero_Sloped_Black_Dome';
    domeGroup.position.set(xBase + 0.46, floorY + 1.56, 0);
    // Tilt backward so top recedes toward -X and bottom meets the champagne-gold nose chin!
    domeGroup.rotation.z = 0.25;
    cabGroup.add(domeGroup);

    const domeGeom = new THREE.BoxGeometry(domeDepth, domeHeight, dims.bodyWidthM - 0.18);
    const domeMesh = new THREE.Mesh(domeGeom, mats.frontMask);
    domeMesh.castShadow = true;
    domeGroup.add(domeMesh);

    // Aluminum side cheek fairings smoothly flanking the sloped black front dome
    const cheekGeom = new THREE.BoxGeometry(0.76, 1.78, 0.11);
    for (const zSign of [-1, 1]) {
      const cheek = new THREE.Mesh(cheekGeom, mats.bodyPrimary);
      cheek.position.set(xBase + 0.36, floorY + 1.52, zSign * (halfW - 0.06));
      cheek.rotation.z = 0.22;
      cabGroup.add(cheek);
    }

    // Streamlined roof fairing cap bridging sloped dome to roof crown
    const fairingGeom = new THREE.BoxGeometry(0.75, 0.34, dims.bodyWidthM - 0.36);
    const fairing = new THREE.Mesh(fairingGeom, mats.roof);
    fairing.position.set(xBase + 0.28, roofH - 0.18, 0);
    fairing.rotation.z = 0.15;
    cabGroup.add(fairing);

    if (lod !== 'low') {
      // 3. Off-Center (Left-Offset) Emergency Evacuation Door Frame & Circular Window Motif (mounted flush on dome front!)
      const emergDoorGroup = new THREE.Group();
      emergDoorGroup.position.set(domeFrontX + 0.015, -0.05, -0.34);

      const doorOutlineGeom = new THREE.BoxGeometry(0.035, 1.44, 0.58);
      const doorOutline = new THREE.Mesh(doorOutlineGeom, mats.primaryStripe);
      emergDoorGroup.add(doorOutline);

      const doorInnerGeom = new THREE.BoxGeometry(0.042, 1.38, 0.52);
      const doorInner = new THREE.Mesh(doorInnerGeom, mats.frontMask);
      emergDoorGroup.add(doorInner);

      // Circular porthole window inside the offset emergency door!
      const portholeGeom = new THREE.CylinderGeometry(0.2, 0.2, 0.055, 16);
      portholeGeom.rotateZ(Math.PI * 0.5);
      const porthole = new THREE.Mesh(portholeGeom, lightMats.cabinWindowGlass);
      porthole.position.set(0.008, 0.22, 0);
      emergDoorGroup.add(porthole);

      domeGroup.add(emergDoorGroup);

      // Panoramic sloped driver windshield beside emergency door
      const windGeom = new THREE.BoxGeometry(0.038, 0.84, 1.16);
      const windMesh = new THREE.Mesh(windGeom, lightMats.cabinWindowGlass);
      windMesh.position.set(domeFrontX + 0.015, 0.14, 0.42);
      domeGroup.add(windMesh);

      // Upper Sloped Full-Color LED Destination Sign ([Y][F] 元町・中華街 / 和光市)
      const destGeom = new THREE.BoxGeometry(0.04, 0.22, 1.18);
      const destMesh = new THREE.Mesh(destGeom, lightMats.destinationSign);
      destMesh.name = 'Destination_Sign_Front';
      destMesh.position.set(domeFrontX + 0.018, 0.72, 0);
      domeGroup.add(destMesh);
    }

    // 4. Iconic Dual Circular Ring LED Headlights ("丸目ヘッドライト") & Inner Red Taillight Rings (mounted flush on lower sloped dome!)
    const ringSegs = lod === 'high' ? 18 : 10;
    const outerBezelGeom = new THREE.CylinderGeometry(0.22, 0.22, 0.055, ringSegs);
    outerBezelGeom.rotateZ(Math.PI * 0.5);

    const headDiscGeom = new THREE.CylinderGeometry(0.175, 0.175, 0.068, ringSegs);
    headDiscGeom.rotateZ(Math.PI * 0.5);

    const tailDiscGeom = new THREE.CylinderGeometry(0.088, 0.088, 0.08, ringSegs);
    tailDiscGeom.rotateZ(Math.PI * 0.5);

    for (const zSign of [-1, 1]) {
      const lampHolder = new THREE.Group();
      lampHolder.position.set(domeFrontX + 0.02, -0.56, zSign * 0.92);

      // Champagne-gold circular outer ring housing
      const bezel = new THREE.Mesh(outerBezelGeom, mats.bodySecondary);
      lampHolder.add(bezel);

      // Circular white LED headlight ring
      const hl = new THREE.Mesh(headDiscGeom, headMat);
      hl.name = zSign < 0 ? 'Headlight_L' : 'Headlight_R';
      lampHolder.add(hl);

      // Concentric red LED taillight core/ring
      const tl = new THREE.Mesh(tailDiscGeom, tailMat);
      tl.name = zSign < 0 ? 'Taillight_L' : 'Taillight_R';
      tl.position.set(0.005, -0.03, zSign * 0.04);
      lampHolder.add(tl);

      domeGroup.add(lampHolder);
    }

    // 5. Aerodynamic Lower Skirt (排障器) & Shibata Coupler
    const skirtGeom = new THREE.BoxGeometry(0.62, 0.48, dims.bodyWidthM - 0.26);
    const skirt = new THREE.Mesh(skirtGeom, mats.bodySecondary);
    skirt.position.set(xTip - 0.36, floorY - 0.32, 0);
    cabGroup.add(skirt);

    if (lod === 'high') {
      const couplerGeom = new THREE.BoxGeometry(0.46, 0.22, 0.3);
      const coupler = new THREE.Mesh(couplerGeom, mats.bogieFrame);
      coupler.position.set(xTip + 0.04, floorY - 0.34, 0);
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

  // ---- High & Medium LOD: 4 Double-Leaf Sliding Doors per Side + Circular End Accent Windows ----
  const doorZoneStartX = -halfLen + 0.95;
  const doorZoneEndX = isLead ? shellFrontX - 0.65 : halfLen - 0.95;

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
    addVerticalGreenBandsAboveDoors: false,
    addRoundEndAccentWindows: true, // 17000 Series circular end accent windows!
  });
  carGroup.add(doorsWinGroup);

  // ---- Roof HVAC Pods (Sleek A-Train Twin Roof Units) ----
  for (const xHvac of [-4.2, 4.2]) {
    const pod = createRoofHvacPod(mats, 3.8, 1.95, 0.25);
    pod.position.set(xHvac, roofH - 0.04, 0);
    carGroup.add(pod);
  }

  // ---- PT71 Single-Arm Pantographs on M1/M2/M3/M4 Cars ----
  const pantographs: THREE.Group[] = [];
  if (slot.hasPantograph && slot.pantographCount > 0) {
    const panto1 = createSingleArmPantographGroup(mats, lod);
    panto1.position.set(-halfLen + 2.4, roofH - 0.02, 0);
    carGroup.add(panto1);
    pantographs.push(panto1);

    if (slot.pantographCount >= 2) {
      const panto2 = createSingleArmPantographGroup(mats, lod);
      panto2.position.set(halfLen - 2.4, roofH - 0.02, 0);
      panto2.rotation.y = Math.PI;
      carGroup.add(panto2);
      pantographs.push(panto2);
    }
  }

  // ---- Underfloor PMSM / VVVF Equipment Boxes ----
  const underfloor = createUnderfloorEquipmentGroup(
    mats,
    dims.bogieCenterDistanceM - 3.2,
    dims.bodyWidthM,
    floorY,
    lod,
  );
  carGroup.add(underfloor);

  // ---- Front & Rear Articulating FS779 Narrow-Gauge (1,067mm) Bogies ----
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
    pantographs,
    rearGangway,
  };
}
