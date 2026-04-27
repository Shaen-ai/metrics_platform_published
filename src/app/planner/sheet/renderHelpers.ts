/**
 * Helpers shared by wardrobe + kitchen 3D components. They unify the
 * "use sheet-UV sampling when a packer placement exists, otherwise fall
 * back to the legacy refW/refH tiling" decision in one place.
 */

import type * as THREE from "three";
import {
  cloneBoxMaterialsFromPlacements,
  cloneBoxMaterialsWithWoodRepeat,
  cloneMaterialFromPlacement,
  type GrainDirection,
  type PanelTextureRepeatOpts,
} from "../textureRepeat";
import type { PanelRenderInfo } from "./useWardrobePanelPlacements";

export interface LegacyBoxFallback {
  boxW: number;
  boxH: number;
  boxD: number;
  refW: number;
  refH: number;
  grain: GrainDirection;
  opts?: PanelTextureRepeatOpts;
}

/** Optional per-face UV tweak when building box materials (sheet or legacy path). */
export interface BoxPanelSheetOptions {
  /**
   * `BoxGeometry` face order: +X, −X, +Y, −Y, +Z, −Z. `true` = 180° in-plane rotation
   * on that face (wardrobe front is +Z, index 4).
   */
  faceRotate180?: boolean[];
}

/**
 * Returns an array of 6 box-face materials for a wardrobe / kitchen box.
 * When `placement` is present, every face samples the same sheet sub-rect
 * (the customer only sees one face per panel anyway — hidden faces can
 * reuse the outer placement without visible difference).
 */
export function boxMaterialsForPanel(
  base: THREE.MeshPhysicalMaterial,
  info: PanelRenderInfo | null,
  fallback: LegacyBoxFallback,
  sheetOpts?: BoxPanelSheetOptions,
): THREE.MeshPhysicalMaterial[] {
  if (info) {
    return cloneBoxMaterialsFromPlacements(
      base,
      info.sheet,
      info.placement,
      info.textureRotated,
      sheetOpts?.faceRotate180,
    );
  }
  return cloneBoxMaterialsWithWoodRepeat(
    base,
    fallback.boxW,
    fallback.boxH,
    fallback.boxD,
    fallback.refW,
    fallback.refH,
    fallback.grain,
    fallback.opts,
    sheetOpts?.faceRotate180,
  );
}

/**
 * Materials for a single mesh surface (e.g. a plane door panel). Returns one
 * material. When no placement is available the caller receives the base
 * (unmodified) material and is free to fall back to whatever sampling it was
 * doing before.
 */
export function planarMaterialForPanel(
  base: THREE.MeshPhysicalMaterial,
  info: PanelRenderInfo | null,
): THREE.MeshPhysicalMaterial {
  if (info) {
    return cloneMaterialFromPlacement(base, info.placement, info.sheet, info.textureRotated);
  }
  return base;
}
