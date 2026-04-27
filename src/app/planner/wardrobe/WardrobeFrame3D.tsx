"use client";

import { useContext, useMemo } from "react";
import * as THREE from "three";
import { useWardrobeStore } from "./store";
import { WardrobeRoomContext } from "./WardrobeRoomContext";
import { PANEL_THICKNESS, clampWardrobeBase, DEFAULT_WARDROBE_BASE } from "./data";
import { useRealisticMaterial } from "./useRealisticMaterial";
import {
  useWardrobePanelPlacements,
  useSheetPanelInfoForMaterial,
} from "../sheet/useWardrobePanelPlacements";
import { boxMaterialsForPanel } from "../sheet/renderHelpers";

const CM = 0.01;
const PT = PANEL_THICKNESS * CM;

/**
 * First/last hinged doors get extra overlay width (`doorFrontExtraWidthCm`), so
 * their thin vertical edges sit almost coplanar with the outer dividers' side
 * faces — z-fights in the strip between the two inward-facing handles. Nudge
 * only those dividers slightly in X (render-only) to separate the planes.
 */
const OUTER_DIVIDER_X_NUDGE_M = 0.006;

/** Recess all vertical dividers toward the back (m) so their faces clear door inners / coplanar edges. */
const DIVIDER_Z_RECESS_M = 0.008;

function outerDividerCenterOffsetXM(dividerIndex: number, dividerCount: number): number {
  if (dividerCount <= 1) return 0;
  if (dividerIndex === 0) return OUTER_DIVIDER_X_NUDGE_M;
  if (dividerIndex === dividerCount - 1) return -OUTER_DIVIDER_X_NUDGE_M;
  return 0;
}

/**
 * Doors use negative polygon offset (closer / in front). Vertical dividers sit
 * in the same region behind the door inner face — positive offset pushes their
 * depth slightly back so laminate does not z-fight / shimmer at section joins.
 */
function materialsWithDividerDepthBias(materials: THREE.MeshPhysicalMaterial[]): THREE.MeshPhysicalMaterial[] {
  return materials.map((m) => {
    const mat = m.clone();
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = 12;
    mat.polygonOffsetUnits = 12;
    return mat;
  });
}

/**
 * HDF-like neutral finish for the back panel. Wardrobe backs are not
 * laminated and must not consume a laminate sheet — they render with a
 * flat, warm-light fiberboard color so customers can see the real product.
 */
const BACK_PANEL_MATERIAL = new THREE.MeshPhysicalMaterial({
  color: "#d7c6aa",
  roughness: 0.88,
  metalness: 0,
  clearcoat: 0.05,
  clearcoatRoughness: 0.6,
});

/**
 * Three.js BoxGeometry face order is `[+X, -X, +Y, -Y, +Z, -Z]`. For each
 * carcass panel these are the face indices whose outward normal points
 * *into* the wardrobe bay — i.e. what the customer sees after opening the
 * doors. Those faces render with the interior finish; the other faces keep
 * the frame finish (exterior).
 */
const INTERIOR_FACES = {
  left: [0] as const, // +X face (right side of a left panel)
  right: [1] as const, // -X face (left side of a right panel)
  top: [3] as const, // -Y face (downward side of a top panel)
  bottom: [2] as const, // +Y face (upward side of a bottom panel)
  divider: [0, 1] as const, // +X and -X — both sides face interior bays
};

/**
 * Merge a frame-material face array with an interior-material face array so
 * the specified face indices take the interior finish. The frame-material
 * array is cloned, so mutating callers' faces won't leak across panels.
 */
function overlayInteriorFaces(
  frameMats: THREE.MeshPhysicalMaterial[],
  interiorMats: THREE.MeshPhysicalMaterial[],
  interiorIndexes: readonly number[],
): THREE.MeshPhysicalMaterial[] {
  const out = [...frameMats];
  for (const i of interiorIndexes) {
    const m = interiorMats[i];
    if (m) out[i] = m;
  }
  return out;
}

export default function WardrobeFrame3D() {
  const embed = useContext(WardrobeRoomContext);
  const storeConfig = useWardrobeStore((s) => s.config);
  const config = embed?.config ?? storeConfig;
  const frame = config.frame;
  const sections = config.sections;
  const matId = config.frameMaterial;
  const frameGrain = config.frameGrainDirection ?? "horizontal";
  const interiorMatId = config.interiorMaterial;
  const interiorGrain = config.interiorGrainDirection ?? "horizontal";
  const base = clampWardrobeBase(config.base ?? DEFAULT_WARDROBE_BASE);
  /** Plinth mode: sides run from floor to carcass top (continuous with kick visual). */
  const plinthExtensionM = base.type === "plinth" ? base.plinthHeightCm * CM : 0;

  const frameSheetHint = useSheetPanelInfoForMaterial(matId);
  const baseMaterial = useRealisticMaterial(matId, frameGrain, frameSheetHint);
  const interiorSheetHint = useSheetPanelInfoForMaterial(interiorMatId);
  const interiorBaseMaterial = useRealisticMaterial(
    interiorMatId,
    interiorGrain,
    interiorSheetHint,
  );
  const placements = useWardrobePanelPlacements();

  const W = frame.width * CM;
  const H = frame.height * CM;
  const D = frame.depth * CM;
  const sideH = H + plinthExtensionM;
  /** Side panel center Y: spans y ∈ [−plinthExtensionM, H] in frame space. */
  const sideCenterY = H / 2 - plinthExtensionM / 2;
  // Legacy ref dims — only used when a panel has no sheet placement (e.g. the
  // selected finish has no image, or the material type is not sheet-cuttable).
  const refW = frame.width * CM - 2 * PT;
  const refH = frame.height * CM - 2 * PT;
  const refHSide = refH + plinthExtensionM;

  const dividerXPositions = useMemo(() => {
    const positions: number[] = [];
    let x = PT;
    for (let i = 0; i < sections.length - 1; i++) {
      x += sections[i].width * CM;
      positions.push(x);
      x += PT;
    }
    return positions;
  }, [sections]);

  const leftSideFrameMats = useMemo(
    () =>
      boxMaterialsForPanel(
        baseMaterial as THREE.MeshPhysicalMaterial,
        placements.get("frame.side.L"),
        { boxW: PT, boxH: sideH, boxD: D, refW, refH: refHSide, grain: frameGrain },
      ),
    [baseMaterial, placements, sideH, D, refW, refHSide, frameGrain],
  );
  const leftSideInteriorMats = useMemo(
    () =>
      boxMaterialsForPanel(
        interiorBaseMaterial as THREE.MeshPhysicalMaterial,
        null,
        { boxW: PT, boxH: sideH, boxD: D, refW, refH: refHSide, grain: interiorGrain },
      ),
    [interiorBaseMaterial, sideH, D, refW, refHSide, interiorGrain],
  );
  const leftSideMats = useMemo(
    () => overlayInteriorFaces(leftSideFrameMats, leftSideInteriorMats, INTERIOR_FACES.left),
    [leftSideFrameMats, leftSideInteriorMats],
  );

  const rightSideFrameMats = useMemo(
    () =>
      boxMaterialsForPanel(
        baseMaterial as THREE.MeshPhysicalMaterial,
        placements.get("frame.side.R"),
        { boxW: PT, boxH: sideH, boxD: D, refW, refH: refHSide, grain: frameGrain },
      ),
    [baseMaterial, placements, sideH, D, refW, refHSide, frameGrain],
  );
  const rightSideInteriorMats = useMemo(
    () =>
      boxMaterialsForPanel(
        interiorBaseMaterial as THREE.MeshPhysicalMaterial,
        null,
        { boxW: PT, boxH: sideH, boxD: D, refW, refH: refHSide, grain: interiorGrain },
      ),
    [interiorBaseMaterial, sideH, D, refW, refHSide, interiorGrain],
  );
  const rightSideMats = useMemo(
    () => overlayInteriorFaces(rightSideFrameMats, rightSideInteriorMats, INTERIOR_FACES.right),
    [rightSideFrameMats, rightSideInteriorMats],
  );

  const topBottomW = W - PT * 2;
  const topFrameMats = useMemo(
    () =>
      boxMaterialsForPanel(
        baseMaterial as THREE.MeshPhysicalMaterial,
        placements.get("frame.top"),
        { boxW: topBottomW, boxH: PT, boxD: D, refW, refH, grain: frameGrain },
      ),
    [baseMaterial, placements, topBottomW, D, refW, refH, frameGrain],
  );
  const topInteriorMats = useMemo(
    () =>
      boxMaterialsForPanel(
        interiorBaseMaterial as THREE.MeshPhysicalMaterial,
        null,
        { boxW: topBottomW, boxH: PT, boxD: D, refW, refH, grain: interiorGrain },
      ),
    [interiorBaseMaterial, topBottomW, D, refW, refH, interiorGrain],
  );
  const topMats = useMemo(
    () => overlayInteriorFaces(topFrameMats, topInteriorMats, INTERIOR_FACES.top),
    [topFrameMats, topInteriorMats],
  );

  const bottomFrameMats = useMemo(
    () =>
      boxMaterialsForPanel(
        baseMaterial as THREE.MeshPhysicalMaterial,
        placements.get("frame.bottom"),
        { boxW: topBottomW, boxH: PT, boxD: D, refW, refH, grain: frameGrain },
      ),
    [baseMaterial, placements, topBottomW, D, refW, refH, frameGrain],
  );
  const bottomInteriorMats = useMemo(
    () =>
      boxMaterialsForPanel(
        interiorBaseMaterial as THREE.MeshPhysicalMaterial,
        null,
        { boxW: topBottomW, boxH: PT, boxD: D, refW, refH, grain: interiorGrain },
      ),
    [interiorBaseMaterial, topBottomW, D, refW, refH, interiorGrain],
  );
  const bottomMats = useMemo(
    () => overlayInteriorFaces(bottomFrameMats, bottomInteriorMats, INTERIOR_FACES.bottom),
    [bottomFrameMats, bottomInteriorMats],
  );

  const backW = W - PT * 2;

  const divH = H - PT * 2;
  const divD = D - 0.01;

  return (
    <group>
      {/* Left panel — extends to floor when plinth (same group lift as carcass). */}
      <mesh position={[PT / 2, sideCenterY, 0]} material={leftSideMats} castShadow receiveShadow>
        <boxGeometry args={[PT, sideH, D]} />
      </mesh>

      {/* Right panel */}
      <mesh position={[W - PT / 2, sideCenterY, 0]} material={rightSideMats} castShadow receiveShadow>
        <boxGeometry args={[PT, sideH, D]} />
      </mesh>

      {/* Top panel */}
      <mesh position={[W / 2, H - PT / 2, 0]} material={topMats} castShadow receiveShadow>
        <boxGeometry args={[topBottomW, PT, D]} />
      </mesh>

      {/* Bottom panel */}
      <mesh position={[W / 2, PT / 2, 0]} material={bottomMats} castShadow receiveShadow>
        <boxGeometry args={[topBottomW, PT, D]} />
      </mesh>

      {/* Back panel — HDF stock, not cut from the laminate sheet. */}
      <mesh
        position={[W / 2, H / 2, -(D / 2 - 0.003)]}
        material={BACK_PANEL_MATERIAL}
        receiveShadow
      >
        <boxGeometry args={[backW, H - PT * 2, 0.005]} />
      </mesh>

      {/* Section dividers — each gets its own sheet sub-rect. */}
      {dividerXPositions.map((x, i) => (
        <DividerMesh
          key={i}
          index={i}
          dividerCount={dividerXPositions.length}
          x={x}
          H={H}
          divH={divH}
          divD={divD}
          baseMaterial={baseMaterial as THREE.MeshPhysicalMaterial}
          interiorBaseMaterial={interiorBaseMaterial as THREE.MeshPhysicalMaterial}
          refW={refW}
          refH={refH}
          frameGrain={frameGrain}
          interiorGrain={interiorGrain}
        />
      ))}
    </group>
  );
}

function DividerMesh({
  index,
  dividerCount,
  x,
  H,
  divH,
  divD,
  baseMaterial,
  interiorBaseMaterial,
  refW,
  refH,
  frameGrain,
  interiorGrain,
}: {
  index: number;
  dividerCount: number;
  x: number;
  H: number;
  divH: number;
  divD: number;
  baseMaterial: THREE.MeshPhysicalMaterial;
  interiorBaseMaterial: THREE.MeshPhysicalMaterial;
  refW: number;
  refH: number;
  frameGrain: "horizontal" | "vertical";
  interiorGrain: "horizontal" | "vertical";
}) {
  const placements = useWardrobePanelPlacements();
  const xBias = outerDividerCenterOffsetXM(index, dividerCount);
  const mats = useMemo(() => {
    const frameMats = boxMaterialsForPanel(
      baseMaterial,
      placements.get(`frame.divider.${index}`),
      { boxW: PT, boxH: divH, boxD: divD, refW, refH, grain: frameGrain },
    );
    const interiorMats = boxMaterialsForPanel(
      interiorBaseMaterial,
      null,
      { boxW: PT, boxH: divH, boxD: divD, refW, refH, grain: interiorGrain },
    );
    const mixed = overlayInteriorFaces(frameMats, interiorMats, INTERIOR_FACES.divider);
    return materialsWithDividerDepthBias(mixed);
  }, [
    baseMaterial,
    interiorBaseMaterial,
    placements,
    index,
    divH,
    divD,
    refW,
    refH,
    frameGrain,
    interiorGrain,
  ]);
  return (
    <mesh
      position={[x + PT / 2 + xBias, H / 2, -DIVIDER_Z_RECESS_M]}
      material={mats}
      castShadow
      receiveShadow={false}
    >
      <boxGeometry args={[PT, divH, divD]} />
    </mesh>
  );
}
