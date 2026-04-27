"use client";

import { useContext, useMemo } from "react";
import * as THREE from "three";
import { useWardrobeStore } from "./store";
import { WardrobeRoomContext } from "./WardrobeRoomContext";
import {
  PANEL_THICKNESS,
  clampWardrobeBase,
  INTERNAL_RENDER_FALLBACK,
  wardrobeDoorPanelGrainForSection,
  wardrobeDoorPanelMaterialIdForSection,
} from "./data";
import { useRealisticDoorMaterial, useRealisticMaterial } from "./useRealisticMaterial";
import {
  useSheetPanelInfoForMaterial,
  useWardrobePanelPlacements,
  type PanelRenderInfo,
} from "../sheet/useWardrobePanelPlacements";
import { boxMaterialsForPanel } from "../sheet/renderHelpers";

const CM = 0.01;
const PT = PANEL_THICKNESS * CM;

/** Box faces +X, −X, +Y, −Y, +Z, −Z — rotate UVs 180° on outward kick (+Z) so grain matches doors. */
const PLINTH_FRONT_FACE_UV_ROTATE_180: boolean[] = [false, false, false, false, true, false];

/**
 * Floor support: nothing (floor mode), adjustable legs, or recessed plinth kick.
 * Rendered at y = 0 in wardrobe space; carcass is lifted in WardrobeCanvas.
 */
export default function WardrobeBase3D() {
  const embed = useContext(WardrobeRoomContext);
  const storeConfig = useWardrobeStore((s) => s.config);
  const config = embed?.config ?? storeConfig;
  const frame = config.frame;
  const baseRaw = config.base;
  const matId = config.frameMaterial;
  const frameGrain = config.frameGrainDirection ?? "horizontal";
  const doorGrain = config.doorGrainDirection ?? "horizontal";
  const doorsCfg = config.doors;

  const W = frame.width * CM;
  const D = frame.depth * CM;
  const b = clampWardrobeBase(baseRaw);

  const frameSheetHint = useSheetPanelInfoForMaterial(matId);
  /** Match wardrobePanels: vertical door grain → horizontal plinth grain so the kick reads correctly. */
  const plinthGrain = doorGrain === "vertical" ? "horizontal" : frameGrain;
  const plinthFrameMat = useRealisticMaterial(matId, plinthGrain, frameSheetHint) as THREE.MeshPhysicalMaterial;
  const placements = useWardrobePanelPlacements();

  /** Front kick uses the same finish + sheet UV as the primary door row so it matches doors visually. */
  const plinthFrontDoorId =
    doorsCfg.type === "none"
      ? INTERNAL_RENDER_FALLBACK.id
      : wardrobeDoorPanelMaterialIdForSection(doorsCfg, 0);
  const plinthFrontDoorGrain =
    doorsCfg.type === "none"
      ? plinthGrain
      : wardrobeDoorPanelGrainForSection(doorsCfg, doorGrain, 0);
  const firstDoorSheetPlacement =
    doorsCfg.type === "hinged"
      ? placements.get("door.hinged.0.0")
      : doorsCfg.type === "sliding"
        ? placements.get("door.sliding.0")
        : null;

  /** Prefer the packed `plinth.front` rect so manual sheet edits move the kick texture like doors/drawers. */
  const plinthFrontSheetPlacement =
    placements.get("plinth.front") ??
    (doorsCfg.type === "none" ? null : firstDoorSheetPlacement);

  const plinthKickDoorMat = useRealisticDoorMaterial(
    plinthFrontDoorId,
    plinthFrontDoorGrain,
    plinthFrontSheetPlacement,
  ) as THREE.MeshPhysicalMaterial;

  const plinthFrontKickMat = doorsCfg.type === "none" ? plinthFrameMat : plinthKickDoorMat;
  const plinthFrontKickGrain = doorsCfg.type === "none" ? plinthGrain : plinthFrontDoorGrain;
  /** Sheet layout: use `plinth.front` placement when present; else frame `plinth.front` or first door (fallback). */
  const plinthFrontUvPlacement = plinthFrontSheetPlacement;

  // Legacy ref dims — used when a plinth panel has no sheet placement.
  const refW = frame.width * CM - 2 * PT;
  const refH = frame.height * CM - 2 * PT;

  const legMetal = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#8a9096",
        roughness: 0.3,
        metalness: 0.72,
        clearcoat: 0.3,
        clearcoatRoughness: 0.15,
      }),
    [],
  );

  if (b.type === "floor") return null;

  if (b.type === "legs") {
    const h = b.legHeightCm * CM;
    const inset = Math.min(0.045, W * 0.05, D * 0.1);
    const legR = 0.011;
    const positions: [number, number, number][] = [
      [inset, h / 2, D / 2 - inset],
      [W - inset, h / 2, D / 2 - inset],
      [inset, h / 2, -D / 2 + inset],
      [W - inset, h / 2, -D / 2 + inset],
    ];
    return (
      <group>
        {positions.map((pos, i) => (
          <mesh key={i} position={pos} castShadow receiveShadow material={legMetal}>
            <cylinderGeometry args={[legR, legR * 0.88, h, 24]} />
          </mesh>
        ))}
      </group>
    );
  }

  const ph = b.plinthHeightCm * CM;

  // Front kick: inner width W − 2×thickness (between side panels) — matches door opening span from the front.
  // Sides to the floor are the extended frame.side panels in WardrobeFrame3D, not separate plinth pieces.
  const betweenSidesW = Math.max(0.06, W - PT * 2);
  const frontCenterZ = D / 2 - PT / 2;
  const backCenterZ = -D / 2 + PT / 2;

  return (
    <PlinthMeshes
      frontBaseMat={plinthFrontKickMat}
      backBaseMat={plinthFrameMat}
      frontUvPlacement={plinthFrontUvPlacement}
      placements={placements}
      refW={refW}
      refH={refH}
      frontGrain={plinthFrontKickGrain}
      backGrain={plinthGrain}
      ph={ph}
      centerX={W / 2}
      betweenSidesW={betweenSidesW}
      frontCenterZ={frontCenterZ}
      backCenterZ={backCenterZ}
    />
  );
}

function PlinthMeshes({
  frontBaseMat,
  backBaseMat,
  frontUvPlacement,
  placements,
  refW,
  refH,
  frontGrain,
  backGrain,
  ph,
  centerX,
  betweenSidesW,
  frontCenterZ,
  backCenterZ,
}: {
  frontBaseMat: THREE.MeshPhysicalMaterial;
  backBaseMat: THREE.MeshPhysicalMaterial;
  frontUvPlacement: PanelRenderInfo | null;
  placements: ReturnType<typeof useWardrobePanelPlacements>;
  refW: number;
  refH: number;
  frontGrain: "horizontal" | "vertical";
  backGrain: "horizontal" | "vertical";
  ph: number;
  centerX: number;
  betweenSidesW: number;
  frontCenterZ: number;
  backCenterZ: number;
}) {
  const frontMats = useMemo(
    () =>
      boxMaterialsForPanel(
        frontBaseMat,
        frontUvPlacement,
        {
          boxW: betweenSidesW,
          boxH: ph,
          boxD: PT,
          refW,
          refH,
          grain: frontGrain,
        },
        { faceRotate180: PLINTH_FRONT_FACE_UV_ROTATE_180 },
      ),
    [frontBaseMat, frontUvPlacement, betweenSidesW, ph, PT, refW, refH, frontGrain],
  );
  const backMats = useMemo(
    () =>
      boxMaterialsForPanel(backBaseMat, placements.get("plinth.back"), {
        boxW: betweenSidesW, boxH: ph, boxD: PT, refW, refH, grain: backGrain,
      }),
    [backBaseMat, placements, betweenSidesW, ph, PT, refW, refH, backGrain],
  );

  return (
    <group>
      {/* Front kickboard — width = outer cabinet − 2×panel thickness (between extended sides). */}
      <mesh position={[centerX, ph / 2, frontCenterZ]} material={frontMats} castShadow receiveShadow>
        <boxGeometry args={[betweenSidesW, ph, PANEL_THICKNESS * CM]} />
      </mesh>
      {/* Back kick */}
      <mesh position={[centerX, ph / 2, backCenterZ]} material={backMats} receiveShadow>
        <boxGeometry args={[betweenSidesW, ph, PANEL_THICKNESS * CM]} />
      </mesh>
    </group>
  );
}
