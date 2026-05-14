"use client";

import { useMemo, useEffect, useLayoutEffect, useRef, memo } from "react";
import * as THREE from "three";
import { RoundedBox, useTexture } from "@react-three/drei";
import type { PlacedItem } from "../types";
import type { PlannerSwatchMaterial } from "@/lib/plannerMaterials";
import { plannerSwatchToWardrobeMaterial } from "../glbTextureMode";
import {
  buildMaterialFromSwatch,
  proxyTextureUrl,
  PLACEHOLDER_URL,
} from "../shared/buildPhysicalMaterialFromSwatch";
import { backColumnCenters, pickMaterialId, seatSegmentsCenters, seatPanWidthFromMeshDims } from "./cushionLayout";
import {
  type ChairFootprintM,
  outdoorBackClampHeightForHandlesM,
  outdoorBackCushionRadiusM,
  outdoorBackHeightM,
  outdoorSeatBackGapM,
  outdoorSeatDepthM,
  outdoorSeatPanCenterZM,
  OUTDOOR_BACK_FLUSH_WOOD_FORWARD_M,
  OUTDOOR_BACK_HEIGHT_MIN_BOOST,
  OUTDOOR_BACK_HANDLE_SIDE_INSET_M,
  OUTDOOR_BACK_TOP_SHEAR_EXTRA_Z_M,
  OUTDOOR_SEAT_BACK_WOOD_MEET_SHIFT_M,
  OUTDOOR_SEAT_EXTEND_TO_CORNER_M,
  pairedCushionWidthM,
  roundedCushionRadiusM,
  scaleThicknessM,
  seatCushionsOuterSpanXM,
} from "./cushionCompose";

const grayMat = new THREE.MeshStandardMaterial({ color: "#8a7a6e", roughness: 0.9 });

/** Seat tallness vs fitted GLB bbox; 0.49 keeps pads on the wood pan for typical outdoor chairs. */
const DEFAULT_SEAT_HEIGHT_FRAC = 0.49;
const MIN_SEAT_SURFACE_M = 0.1;
/** Nudge cushions slightly above the frame to avoid z-fighting / appearing inside the wood. */
const DEFAULT_SEAT_CLEARANCE_M = 0.018;

/** When mesh back analysis fails, a slight recline reads as outdoor seating. */
const FALLBACK_BACK_LEAN_RAD = -0.045;

function applyUpholsteryPhysicalRepeat(
  mat: THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial,
  hasImageTexture: boolean,
  panelW: number,
  panelH: number,
) {
  if (!hasImageTexture) return;
  const m = mat as THREE.MeshPhysicalMaterial;
  const ref = Math.max(panelW, panelH, 0.01);
  const rX = panelW / ref;
  const rY = panelH / ref;
  for (const key of ["map", "bumpMap", "normalMap", "roughnessMap"] as const) {
    const tex = m[key];
    if (!(tex instanceof THREE.Texture)) continue;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.matrixAutoUpdate = true;
    tex.rotation = 0;
    tex.center.set(0, 0);
    tex.offset.set(0, 0);
    tex.repeat.set(Math.max(rX, 0.01), Math.max(rY, 0.01));
    tex.anisotropy = 16;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
  }
  m.needsUpdate = true;
}

const UpholsteredCushion = memo(function UpholsteredCushion({
  width,
  height,
  depth,
  position,
  rotation,
  materialId,
  swatches,
}: {
  width: number;
  height: number;
  depth: number;
  position: [number, number, number];
  rotation?: [number, number, number];
  materialId: string;
  swatches: PlannerSwatchMaterial[];
}) {
  const swatch = useMemo(() => swatches.find((s) => s.id === materialId), [swatches, materialId]);
  const wm = useMemo(
    () => (swatch ? plannerSwatchToWardrobeMaterial(swatch) : null),
    [swatch],
  );
  const textureUrl = wm && swatch?.imageUrl ? proxyTextureUrl(swatch.imageUrl) : PLACEHOLDER_URL;
  const texture = useTexture(textureUrl);
  const externalTexture = wm && swatch?.imageUrl ? texture : null;

  const mat = useMemo(() => {
    if (!wm) {
      const m = grayMat.clone();
      m.polygonOffset = true;
      m.polygonOffsetFactor = -1;
      m.polygonOffsetUnits = -4;
      return m;
    }
    const m = buildMaterialFromSwatch(wm, externalTexture, 0, "horizontal");
    m.polygonOffset = true;
    m.polygonOffsetFactor = -1;
    m.polygonOffsetUnits = -4;
    return m;
  }, [wm, externalTexture]);

  const w = Math.max(0.01, width);
  const h = Math.max(0.01, height);
  const d = Math.max(0.01, depth);
  const radius = roundedCushionRadiusM(w, h, d);

  useLayoutEffect(() => {
    applyUpholsteryPhysicalRepeat(mat, Boolean(externalTexture), w, d);
  }, [mat, externalTexture, w, d]);

  return (
    <RoundedBox
      position={position}
      rotation={rotation ?? [0, 0, 0]}
      args={[w, h, d]}
      radius={radius}
      smoothness={3}
      castShadow
      receiveShadow
      material={mat}
      renderOrder={2}
    />
  );
});

/**
 * Back pad: optional vertical shear z += shearZY * y (mesh space) so top moves more forward in +Z
 * than bottom after Rx(lean), while leanRad stays the same.
 */
const UpholsteredBackCushionSheared = memo(function UpholsteredBackCushionSheared({
  width,
  height,
  depth,
  shearZY,
  materialId,
  swatches,
}: {
  width: number;
  height: number;
  depth: number;
  shearZY: number;
  materialId: string;
  swatches: PlannerSwatchMaterial[];
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const swatch = useMemo(() => swatches.find((s) => s.id === materialId), [swatches, materialId]);
  const wm = useMemo(
    () => (swatch ? plannerSwatchToWardrobeMaterial(swatch) : null),
    [swatch],
  );
  const textureUrl = wm && swatch?.imageUrl ? proxyTextureUrl(swatch.imageUrl) : PLACEHOLDER_URL;
  const texture = useTexture(textureUrl);
  const externalTexture = wm && swatch?.imageUrl ? texture : null;

  const mat = useMemo(() => {
    if (!wm) {
      const m = grayMat.clone();
      m.polygonOffset = true;
      m.polygonOffsetFactor = -1;
      m.polygonOffsetUnits = -4;
      return m;
    }
    const m = buildMaterialFromSwatch(wm, externalTexture, 0, "horizontal");
    m.polygonOffset = true;
    m.polygonOffsetFactor = -1;
    m.polygonOffsetUnits = -4;
    return m;
  }, [wm, externalTexture]);

  const w = Math.max(0.01, width);
  const h = Math.max(0.01, height);
  const d = Math.max(0.01, depth);
  const radius = outdoorBackCushionRadiusM(w, h, d);

  useLayoutEffect(() => {
    applyUpholsteryPhysicalRepeat(mat, Boolean(externalTexture), w, h);
  }, [mat, externalTexture, w, h]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const trans = new THREE.Matrix4().makeTranslation(0, h / 2, -d / 2);
    const shear = new THREE.Matrix4().set(1, 0, 0, 0, 0, 1, 0, 0, 0, shearZY, 1, 0, 0, 0, 0, 1);
    const composed = new THREE.Matrix4().multiplyMatrices(trans, shear);
    mesh.matrix.copy(composed);
    mesh.matrixAutoUpdate = false;
    mesh.matrixWorldNeedsUpdate = true;
  }, [d, h, materialId, shearZY]);

  return (
    <RoundedBox
      ref={meshRef}
      position={[0, 0, 0]}
      args={[w, h, d]}
      radius={radius}
      smoothness={3}
      castShadow
      receiveShadow
      material={mat}
      renderOrder={2}
    />
  );
});

/**
 * Procedural outdoor cushions: seat/back share width rules, thickness scales with footprint,
 * back pivots at the seat rear seam and leans from GLB back-slab regression when available.
 */
export const OutdoorCushionMeshes = memo(function OutdoorCushionMeshes({
  item,
  width,
  depth,
  height,
  swatches,
  seatPanOffsetX = 0,
  seatPanOffsetZ = 0,
  seatPanWidthOverrideM,
  backPanWidthOverrideM,
  backRestLeanRad,
  backSideZSign = -1,
}: {
  item: PlacedItem;
  width: number;
  depth: number;
  height: number;
  swatches: PlannerSwatchMaterial[];
  seatPanOffsetX?: number;
  seatPanOffsetZ?: number;
  seatPanWidthOverrideM?: number;
  backPanWidthOverrideM?: number;
  /** Rotation.X (rad) from mesh back-slab analysis; negative = typical rearward lean. */
  backRestLeanRad?: number | null;
  /** Which local Z side has the backrest. Default matches the original -Z cushion convention. */
  backSideZSign?: -1 | 1;
}) {
  const cfg = item.outdoorCushionConfig;
  const enabled = Boolean(cfg?.enabled);
  const groupRef = useRef<THREE.Group>(null);

  const fp: ChairFootprintM = useMemo(
    () => ({ widthM: width, depthM: depth, heightM: height }),
    [width, depth, height],
  );

  useEffect(() => {
    if (!enabled || !groupRef.current) return;
    groupRef.current.traverse((ch) => {
      if ((ch as THREE.Mesh).isMesh) {
        ch.userData.itemId = item.id;
      }
    });
  }, [enabled, item.id]);

  const seatPanW = useMemo(() => {
    if (typeof seatPanWidthOverrideM === "number" && seatPanWidthOverrideM > 0.12) {
      return Math.min(width * 0.98, Math.max(0.14, seatPanWidthOverrideM));
    }
    return seatPanWidthFromMeshDims(width, depth);
  }, [seatPanWidthOverrideM, width, depth]);

  const backLayoutW = useMemo(() => {
    if (typeof backPanWidthOverrideM === "number" && backPanWidthOverrideM > 0.12) {
      return Math.min(width * 0.98, Math.max(0.14, backPanWidthOverrideM));
    }
    return seatPanW;
  }, [backPanWidthOverrideM, width, seatPanW]);

  const seatSpecs = useMemo(() => {
    if (!cfg || !enabled) return [];
    return seatSegmentsCenters(cfg, seatPanW);
  }, [cfg, enabled, seatPanW]);

  const backSpecs = useMemo(() => {
    if (!cfg || !enabled || seatSpecs.length === 0) return [];
    return backColumnCenters(cfg, backLayoutW, seatSpecs);
  }, [cfg, enabled, backLayoutW, seatSpecs]);

  if (!cfg || !enabled) return null;

  const defaultMatId = swatches[0]?.id ?? "";
  const seatY =
    typeof cfg.seatSurfaceOffsetM === "number"
      ? cfg.seatSurfaceOffsetM
      : Math.max(MIN_SEAT_SURFACE_M, height * DEFAULT_SEAT_HEIGHT_FRAC) + DEFAULT_SEAT_CLEARANCE_M;

  const seatThickness = scaleThicknessM(Math.max(0.02, cfg.seatThicknessM), fp);
  const backThickness = scaleThicknessM(Math.max(0.02, cfg.backThicknessM), fp);
  const H_catalogBack = outdoorBackHeightM(height, cfg.backHeightM);
  const backSign: -1 | 1 = backSideZSign === 1 ? 1 : -1;
  const forwardSign = -backSign;

  const seatDepthBase = outdoorSeatDepthM(depth);
  const seatZBase = outdoorSeatPanCenterZM(depth) * forwardSign;
  const seatFrontZ = seatZBase + forwardSign * (seatDepthBase / 2);
  const seatRearZ = seatZBase + backSign * (seatDepthBase / 2);
  const seatReAtWoodZ = seatRearZ + backSign * OUTDOOR_SEAT_BACK_WOOD_MEET_SHIFT_M;
  const seatDepth = seatDepthBase + OUTDOOR_SEAT_BACK_WOOD_MEET_SHIFT_M;
  const seatZ = (seatReAtWoodZ + seatFrontZ) / 2;
  const gapZ = outdoorSeatBackGapM(depth);
  const depthTweakM = (typeof cfg.backDepthOffsetM === "number" ? cfg.backDepthOffsetM : 0) * forwardSign;
  /** Pivot before wood-corner shift (for keeping back top world position). */
  const pivotZBeforeWood = seatRearZ + backSign * gapZ + depthTweakM;
  const pivotZ = seatReAtWoodZ + backSign * gapZ + depthTweakM;
  const seamY = seatY + seatThickness;

  /** Seat only: longer toward rear corner; front edge unchanged so back pad placement stays the same. */
  const seatFrontZAnchor = seatZ + forwardSign * (seatDepth / 2);
  const seatDepthExtended = seatDepth + OUTDOOR_SEAT_EXTEND_TO_CORNER_M;
  const seatZExtended = seatFrontZAnchor + backSign * (seatDepthExtended / 2);

  const leanRad =
    typeof backRestLeanRad === "number" && Number.isFinite(backRestLeanRad)
      ? backRestLeanRad
      : FALLBACK_BACK_LEAN_RAD;

  const backYRotation = backSign === 1 ? Math.PI : 0;
  const backLeanEuler = new THREE.Euler(leanRad, backYRotation, 0, "XYZ");

  const singleFullBackSpanW =
    cfg.backMode === "single" && seatSpecs.length > 1 ? seatCushionsOuterSpanXM(seatSpecs, fp) : null;

  const seatNodes = seatSpecs.map((spec, i) => {
    const mid = pickMaterialId(cfg.seatMaterialIds, i, defaultMatId);
    if (!mid) return null;
    const cw = pairedCushionWidthM(spec.widthM, fp);
    return (
      <UpholsteredCushion
        key={`seat-${item.id}-${i}`}
        width={cw}
        height={seatThickness}
        depth={seatDepthExtended}
        position={[spec.centerXM, seatY + seatThickness / 2, seatZExtended]}
        materialId={mid}
        swatches={swatches}
      />
    );
  });

  const backNodes = backSpecs.map((spec, i) => {
    const mid = pickMaterialId(cfg.backMaterialIds, i, defaultMatId);
    if (!mid) return null;
    const fullWidth = singleFullBackSpanW != null && cfg.backMode === "single";
    const cw = fullWidth ? singleFullBackSpanW : pairedCushionWidthM(spec.widthM, fp);
    const trim = Math.min(OUTDOOR_BACK_HANDLE_SIDE_INSET_M, cw * 0.22);
    const trimLeft = fullWidth || backSpecs.length === 1 || i === 0 ? trim : 0;
    const trimRight = fullWidth || backSpecs.length === 1 || i === backSpecs.length - 1 ? trim : 0;
    /** Cut only the outer handle-side parts of the top/back pad; keep inner cushion seams intact. */
    const cwBack = Math.max(0.02, cw - trimLeft - trimRight);
    const cx = (fullWidth ? 0 : spec.centerXM) + (trimLeft - trimRight) / 2;
    const pOld = new THREE.Vector3(cx, seamY, pivotZBeforeWood);
    const pCorner = new THREE.Vector3(cx, seamY, pivotZ);
    const topRef = pOld
      .clone()
      .add(new THREE.Vector3(0, H_catalogBack, -backThickness / 2).applyEuler(backLeanEuler));
    const upDir = new THREE.Vector3(0, 1, 0).applyEuler(backLeanEuler);
    const thickOff = new THREE.Vector3(0, 0, -backThickness / 2).applyEuler(backLeanEuler);
    const H_hit = Math.max(0.12, topRef.clone().sub(pCorner).sub(thickOff).dot(upDir));
    let H_back = Math.max(H_hit, H_catalogBack * OUTDOOR_BACK_HEIGHT_MIN_BOOST);
    H_back = outdoorBackClampHeightForHandlesM(H_back, height);
    if (!Number.isFinite(H_back) || H_back < 0.08) H_back = 0.12;
    const backPivotZ = pivotZ + forwardSign * OUTDOOR_BACK_FLUSH_WOOD_FORWARD_M;
    const denom = Math.max(
      1e-3,
      H_back * Math.max(1e-3, Math.abs(Math.cos(leanRad))),
    );
    const shearZY = OUTDOOR_BACK_TOP_SHEAR_EXTRA_Z_M / denom;
    return (
      <group key={`back-${item.id}-${i}`} position={[cx, seamY, backPivotZ]} rotation={[leanRad, backYRotation, 0]}>
        <UpholsteredBackCushionSheared
          width={cwBack}
          height={H_back}
          depth={backThickness}
          shearZY={shearZY}
          materialId={mid}
          swatches={swatches}
        />
      </group>
    );
  });

  return (
    <group ref={groupRef} position={[seatPanOffsetX, 0, seatPanOffsetZ]}>
      {seatNodes}
      {backNodes}
    </group>
  );
});
