import * as THREE from "three";
import type { Placement, Sheet } from "./sheet/panelPacker";

/** Homogeneous UV: (u,v) → (1−u, 1−v), right-multiplied with sheet mapping. */
const UV_MATRIX_ROTATE_180 = new THREE.Matrix3().set(-1, 0, 1, 0, -1, 1, 0, 0, 1);

export type GrainDirection = "horizontal" | "vertical";

export type PanelTextureRepeatOpts = {
  /** Extra repeat along panel width (after width ref). Default 1. */
  panelWidthRepeatMul?: number;
  /** Extra repeat along panel height. Default 1. */
  panelHeightRepeatMul?: number;
  /**
   * If set, used instead of `refW_m` only for the width-axis repeat. Drawer
   * fronts should pass section inner width so horizontal density matches that
   * bay (~2 tiles across), not the full carcass width (which stretches grain).
   */
  widthRefM?: number;
  /**
   * Equal-width sliding wardrobe doors: shift texture phase so door 0,1,2…
   * align like one continuous strip (legacy repeat path when sheet UV is unused).
   * Only applied when `slidingStripCount > 1` and sizes match (same `panelW_m`).
   */
  slidingStripIndex?: number;
  /** Door count in the row — use with `slidingStripIndex`. */
  slidingStripCount?: number;
};

export function applyGrainRotation(tex: THREE.Texture, direction: GrainDirection) {
  if (direction === "vertical") {
    tex.rotation = Math.PI / 2;
    tex.center.set(0.5, 0.5);
  } else {
    tex.rotation = 0;
    tex.center.set(0, 0);
  }
  tex.needsUpdate = true;
}

/**
 * Set texture repeat for a panel face so that the laminate pattern
 * maintains consistent physical density across all panels. One full
 * texture copy maps to the reference dimensions (refW × refH), and each
 * panel shows only the fraction it physically covers.
 *
 * Handles both grain orientations correctly: when grain is vertical the
 * texture is rotated 90° via `applyGrainRotation`, which swaps the role
 * of `repeat.x` / `repeat.y` — `repeat.x` drives what's seen along surface
 * Y and `repeat.y` drives surface X. We compensate here so the visible
 * density stays consistent regardless of grain direction.
 */
export function setWoodMapRepeatForPanel(
  tex: THREE.Texture,
  panelW_m: number,
  panelH_m: number,
  refW_m: number,
  refH_m: number,
  grainDirection: GrainDirection,
  opts?: PanelTextureRepeatOpts,
): void {
  const safeRefW = Math.max(refW_m, 0.01);
  const safeRefH = Math.max(refH_m, 0.01);
  const wMul = opts?.panelWidthRepeatMul ?? 1;
  const hMul = opts?.panelHeightRepeatMul ?? 1;

  let rX: number;
  let rY: number;

  if (grainDirection === "vertical") {
    // Rotated 90°: tex X → surface Y, tex Y → surface X.
    // `widthRefM` (surface X reference) overrides refH here.
    const xRef = opts?.widthRefM ?? safeRefH;
    rX = (panelH_m / safeRefW) * hMul;
    rY = (panelW_m / xRef) * wMul;
  } else {
    const xRef = opts?.widthRefM ?? safeRefW;
    rX = (panelW_m / xRef) * wMul;
    rY = (panelH_m / safeRefH) * hMul;
  }

  tex.repeat.set(Math.max(rX, 0.001), Math.max(rY, 0.001));

  const stripN = opts?.slidingStripCount;
  const stripI = opts?.slidingStripIndex;
  if (
    stripN !== undefined &&
    stripI !== undefined &&
    stripN > 1 &&
    stripI >= 0 &&
    stripI < stripN
  ) {
    // Phase along the wardrobe front so door 1→N matches a single horizontal strip.
    if (grainDirection === "horizontal") {
      const xRef = opts?.widthRefM ?? safeRefW;
      tex.offset.set(-(stripI * panelW_m) / Math.max(xRef, 1e-6), 0);
    } else {
      // Vertical grain on face: horizontal continuity uses the width repeat axis.
      const xRef = opts?.widthRefM ?? safeRefH;
      tex.offset.set(0, -(stripI * panelW_m) / Math.max(xRef, 1e-6));
    }
  } else {
    tex.offset.set(0, 0);
  }

  tex.needsUpdate = true;
}

/**
 * Three.js BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z.
 * For `BoxGeometry(width, height, depth)` with width=X, height=Y, depth=Z:
 * each pair is (panelW_m, panelH_m) for setWoodMapRepeatForPanel.
 */
const BOX_FACE_DIMS_M = (W: number, H: number, D: number) =>
  [
    [D, H],
    [D, H],
    [W, D],
    [W, D],
    [W, H],
    [W, H],
  ] as const;

/**
 * Clones a textured PBR material per box face so laminate scale matches ref dimensions.
 * Handles all texture channels (map, bumpMap, normalMap, roughnessMap) so they stay in sync.
 * If `base.map` is null, returns six references to the same material.
 */
function applyLegacyFaceUvRotate180(tex: THREE.Texture | null | undefined): void {
  if (!tex) return;
  tex.rotation += Math.PI;
  tex.center.set(0.5, 0.5);
  tex.needsUpdate = true;
}

export function cloneBoxMaterialsWithWoodRepeat(
  base: THREE.MeshPhysicalMaterial,
  boxW_m: number,
  boxH_m: number,
  boxD_m: number,
  refW_m: number,
  refH_m: number,
  grainDirection: GrainDirection,
  opts?: PanelTextureRepeatOpts,
  faceRotate180?: boolean[],
): THREE.MeshPhysicalMaterial[] {
  if (!base.map) {
    return [base, base, base, base, base, base];
  }

  const faceDims = BOX_FACE_DIMS_M(boxW_m, boxH_m, boxD_m);
  return faceDims.map(([fw, fh], faceIdx) => {
    const mat = base.clone() as THREE.MeshPhysicalMaterial;
    mat.map = base.map!.clone();
    setWoodMapRepeatForPanel(mat.map, fw, fh, refW_m, refH_m, grainDirection, opts);
    if (base.bumpMap) {
      mat.bumpMap = base.bumpMap.clone();
      setWoodMapRepeatForPanel(mat.bumpMap, fw, fh, refW_m, refH_m, grainDirection, opts);
    }
    if (base.normalMap) {
      mat.normalMap = base.normalMap.clone();
      setWoodMapRepeatForPanel(mat.normalMap, fw, fh, refW_m, refH_m, grainDirection, opts);
    }
    if (base.roughnessMap) {
      mat.roughnessMap = base.roughnessMap.clone();
      setWoodMapRepeatForPanel(mat.roughnessMap, fw, fh, refW_m, refH_m, grainDirection, opts);
    }
    if (faceRotate180?.[faceIdx]) {
      applyLegacyFaceUvRotate180(mat.map);
      applyLegacyFaceUvRotate180(mat.bumpMap);
      applyLegacyFaceUvRotate180(mat.normalMap);
      applyLegacyFaceUvRotate180(mat.roughnessMap);
    }
    mat.needsUpdate = true;
    return mat;
  });
}

/* -------------------------------------------------------------------------- *
 * Sheet-UV sampling
 *
 * Newer code path — each panel receives a rectangle on a physical sheet (via
 * `panelPacker`) and the texture is sampled from that sub-rect using
 * `offset` + `repeat` + `rotation`. Unlike the legacy helpers above, the
 * wrap mode is clamped so the image never tiles, and the packer decides
 * rotation at layout time instead of at sampling time.
 * -------------------------------------------------------------------------- */

/**
 * Configures a texture to sample the sub-rect described by `placement`
 * from a physical sheet of `sheet` dimensions. The piece's actual look
 * follows its exact position on the sheet — different panels pointing at
 * different sheet regions produce visibly different grain.
 *
 * `textureRotated` signals a 90° rotation at render time. Two callers need
 * this:
 *  - The packer physically rotated a free-rotation piece (`placement.rotated`).
 *  - The panel preparation swapped its width/height before submission to
 *    align the panel's desired grain with the material's sheet axis
 *    (`preRotated` in the panel's packing prep).
 * Callers combine those two conditions with XOR to compute the flag.
 */
export function applyPanelUVFromSheet(
  tex: THREE.Texture,
  placement: Placement,
  sheet: Sheet,
  textureRotated = false,
  /** Extra in-plane flip so the pattern reads upside-down vs default mapping (e.g. plinth kick). */
  rotate180 = false,
): void {
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;

  const sw = Math.max(sheet.widthCm, 1e-6);
  const sh = Math.max(sheet.heightCm, 1e-6);
  const sx = placement.widthCm / sw;
  const sy = placement.heightCm / sh;

  // We bypass Three.js's offset/repeat/rotation/center combined matrix
  // (which has tricky center-translation interactions) and set the 3×3 UV
  // matrix directly. The derivation below maps mesh UV [0,1]² to the sheet
  // sub-rect at `(xCm, yCm, widthCm, heightCm)`, with Y flipped (mesh UV is
  // bottom-left origin, sheet image is top-left).
  //
  //   non-rotated:
  //     u' = sx*u + xCm/sw
  //     v' = sy*v + (1 - (yCm + heightCm)/sh)
  //
  //   rotated 90° (grain axis swapped relative to sheet):
  //     u' = sx*v + xCm/sw
  //     v' = sy*(1 - u) + (1 - (yCm + heightCm)/sh)
  //          = -sy*u + sy + (1 - (yCm + heightCm)/sh)
  //
  // Storing these directly as the UV matrix avoids ambiguity about
  // scale-rotate-translate order.
  tex.matrixAutoUpdate = false;
  const tx = placement.xCm / sw;
  const ty = 1 - (placement.yCm + placement.heightCm) / sh;

  if (textureRotated) {
    // [ 0,  sx, tx ]
    // [-sy, 0,  ty + sy ]
    // [ 0,  0,  1 ]
    tex.matrix.set(
      0, sx, tx,
      -sy, 0, ty + sy,
      0, 0, 1,
    );
  } else {
    // [ sx, 0,  tx ]
    // [ 0,  sy, ty ]
    // [ 0,  0,  1  ]
    tex.matrix.set(
      sx, 0, tx,
      0, sy, ty,
      0, 0, 1,
    );
  }

  if (rotate180) {
    const composed = new THREE.Matrix3();
    composed.multiplyMatrices(tex.matrix, UV_MATRIX_ROTATE_180);
    tex.matrix.copy(composed);
  }

  // Keep offset/repeat/rotation/center mirroring the matrix so any other
  // consumer that reads them sees consistent values.
  tex.offset.set(tx, ty);
  tex.repeat.set(sx, sy);
  tex.rotation = textureRotated ? Math.PI / 2 : 0;
  tex.center.set(0, 0);
  // Full-sheet mipmaps blur small sub-rectangles (wrong LOD at panel edges).
  // Sample base level only for atlas / cut-list UVs.
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
}

/**
 * Clones a PBR material and all its texture channels, mapping each to the
 * given sheet placement. Call this once per panel.
 *
 * If the base material has no `map` (e.g. procedural solid color) the
 * original material is returned unchanged — sheet sampling is meaningful
 * only for image-backed materials.
 */
export function cloneMaterialFromPlacement(
  base: THREE.MeshPhysicalMaterial,
  placement: Placement,
  sheet: Sheet,
  textureRotated = false,
  rotate180 = false,
): THREE.MeshPhysicalMaterial {
  if (!base.map) return base;
  const mat = base.clone() as THREE.MeshPhysicalMaterial;
  mat.map = base.map.clone();
  applyPanelUVFromSheet(mat.map, placement, sheet, textureRotated, rotate180);
  if (base.bumpMap) {
    mat.bumpMap = base.bumpMap.clone();
    applyPanelUVFromSheet(mat.bumpMap, placement, sheet, textureRotated, rotate180);
  }
  if (base.normalMap) {
    mat.normalMap = base.normalMap.clone();
    applyPanelUVFromSheet(mat.normalMap, placement, sheet, textureRotated, rotate180);
  }
  if (base.roughnessMap) {
    mat.roughnessMap = base.roughnessMap.clone();
    applyPanelUVFromSheet(mat.roughnessMap, placement, sheet, textureRotated, rotate180);
  }
  mat.needsUpdate = true;
  return mat;
}

/**
 * Box face order in `BoxGeometry`: +X, -X, +Y, -Y, +Z, -Z. Callers supply a
 * per-face placement so each face samples its own region of the sheet — in
 * the common case of a cabinet panel, only the visible outer face has a
 * real sheet allocation; hidden faces can reuse any placement (typically
 * the outer one) since customers never see them.
 */
export function cloneBoxMaterialsFromPlacements(
  base: THREE.MeshPhysicalMaterial,
  sheet: Sheet,
  perFacePlacements:
    | [Placement, Placement, Placement, Placement, Placement, Placement]
    | Placement,
  textureRotated = false,
  /** BoxGeometry face order +X, −X, +Y, −Y, +Z, −Z — e.g. rotate outward wardrobe front (+Z) for plinth. */
  faceRotate180?: boolean[],
): THREE.MeshPhysicalMaterial[] {
  const toSix: [Placement, Placement, Placement, Placement, Placement, Placement] =
    Array.isArray(perFacePlacements)
      ? perFacePlacements
      : [
          perFacePlacements,
          perFacePlacements,
          perFacePlacements,
          perFacePlacements,
          perFacePlacements,
          perFacePlacements,
        ];
  if (!base.map) {
    return [base, base, base, base, base, base];
  }
  return toSix.map((pl, faceIdx) =>
    cloneMaterialFromPlacement(
      base,
      pl,
      sheet,
      textureRotated,
      faceRotate180?.[faceIdx] ?? false,
    ),
  );
}
