import { useMemo } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { useWardrobeStore } from "./store";
import { getMaterial, type WardrobeMaterial } from "./data";
import type { GrainDirection } from "./types";
import {
  type PanelTextureRepeatOpts,
  setWoodMapRepeatForPanel,
} from "../textureRepeat";
import type { PanelRenderInfo } from "../sheet/useWardrobePanelPlacements";
import {
  buildMaterialFromSwatch,
  proxyTextureUrl,
  PLACEHOLDER_URL,
} from "../shared/buildPhysicalMaterialFromSwatch";

export type { PanelTextureRepeatOpts };
export { setWoodMapRepeatForPanel };

export { buildMaterialFromSwatch, proxyTextureUrl, PLACEHOLDER_URL };

/**
 * Realistic PBR material for wardrobe frame & interior surfaces.
 * Generates procedural wood-grain or subtle noise textures and uses
 * MeshPhysicalMaterial with clearcoat for a lacquered-furniture look.
 */
export function useRealisticMaterial(
  matId: string,
  grainDirection: GrainDirection = "horizontal",
  /** When set (per-panel or from `useSheetPanelInfoForMaterial`), use the same catalog row + image as the sheet packer. */
  sheetInfo?: PanelRenderInfo | null,
) {
  const availableMaterials = useWardrobeStore((s) => s.availableMaterials);
  const mat = sheetInfo?.sheetMaterial ?? getMaterial(matId, availableMaterials);
  const imageSource = sheetInfo?.sheetImageUrl ?? mat.imageUrl;
  const textureUrl = imageSource ? proxyTextureUrl(imageSource) : PLACEHOLDER_URL;
  const texture = useTexture(textureUrl);
  const externalTexture = imageSource ? texture : null;

  return useMemo(
    () => buildMaterialFromSwatch(mat, externalTexture, 0, grainDirection),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      matId,
      mat.id,
      mat.color,
      mat.roughness,
      mat.metalness,
      mat.surfaceType,
      externalTexture,
      grainDirection,
      sheetInfo?.materialId,
      sheetInfo?.sheetImageUrl,
    ],
  );
}

/**
 * Realistic PBR material for door panels.
 * Handles special cases: mirror (pure reflective), frosted glass
 * (physical transmission), smoked glass; falls back to buildMaterialFromSwatch
 * for wood/matte/gloss door panels.
 */
export function useRealisticDoorMaterial(
  matId: string,
  grainDirection: GrainDirection = "horizontal",
  /** When set, bitmap + PBR match `useWardrobeSheetLayout` / sheet viewer for that cut. */
  sheetInfo?: PanelRenderInfo | null,
) {
  const availableDoorMaterials = useWardrobeStore(
    (s) => s.availableDoorMaterials,
  );
  const mat = sheetInfo?.sheetMaterial ?? getMaterial(matId, availableDoorMaterials);
  const imageSource = sheetInfo?.sheetImageUrl ?? mat.imageUrl;
  const textureUrl = imageSource ? proxyTextureUrl(imageSource) : PLACEHOLDER_URL;
  const texture = useTexture(textureUrl);
  const externalTexture = imageSource ? texture : null;

  return useMemo(() => {
    const st = mat.surfaceType ?? "matte";
    if (st === "mirror") {
      return new THREE.MeshPhysicalMaterial({
        color: "#e8eef2",
        roughness: 0.0,
        metalness: 1.0,
        envMapIntensity: 2.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.0,
      });
    }

    if (st === "frosted-glass") {
      return new THREE.MeshPhysicalMaterial({
        color: "#f0f4f7",
        roughness: 0.4,
        metalness: 0,
        transmission: 0.85,
        thickness: 0.5,
        ior: 1.5,
      });
    }

    if (st === "smoked-glass") {
      return new THREE.MeshPhysicalMaterial({
        color: "#4a545c",
        roughness: 0.08,
        metalness: 0,
        transmission: 0.7,
        thickness: 0.5,
        ior: 1.5,
      });
    }

    return buildMaterialFromSwatch(mat, externalTexture, 100, grainDirection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    matId,
    mat.id,
    mat.color,
    mat.roughness,
    mat.metalness,
    mat.surfaceType,
    externalTexture,
    grainDirection,
    sheetInfo?.materialId,
    sheetInfo?.sheetImageUrl,
  ]);
}
