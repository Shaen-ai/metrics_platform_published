import * as THREE from "three";

/**
 * Default physical period for tiling when admins omit plausible `texture_width/height_cm` on the fabric row.
 * 12 cm gives ~7 repeats across an 84 cm seat (~typical quilting density vs the old 40 cm default).
 */
export const FALLBACK_UPHOLSTERY_TILE_CM = 12;

/**
 * Accepted range for stored motif size (cm). Values outside this usually mean sheet/cushion widths, not one repeat —
 * otherwise we underestimate repeats and patterns look blown up like the screenshot.
 */
const TRUST_CELL_MIN_CM = 6;
const TRUST_CELL_MAX_CM = 88;

/** Three.js MeshPhysicalMaterials from upholstery GLB overrides — clone `map`, etc., per mesh. */
const FABRIC_TEX_KEYS = ["map", "bumpMap", "normalMap", "roughnessMap", "metalnessMap"] as const;

export type UpholsteryFootprintM = {
  /** GLB-derived width along X after fit scale (m). */
  w: number;
  /** Depth along Z (m). */
  d: number;
  /** Height along Y (m). */
  h: number;
};

function effectiveMotifCm(n: number | null | undefined, fallbackCm: number): number {
  if (
    typeof n === "number" &&
    Number.isFinite(n) &&
    n >= TRUST_CELL_MIN_CM &&
    n <= TRUST_CELL_MAX_CM
  ) {
    return n;
  }
  return fallbackCm;
}

/**
 * Resolved motif widths (meters) plus one repeat tuple for the whole catalog piece.
 */
export function resolveUpholsteryFabricMetrics(
  footprint: UpholsteryFootprintM,
  textureWidthCm?: number | null,
  textureHeightCm?: number | null,
): { repeatU: number; repeatV: number; motifWidthM: number; motifHeightM: number } {
  const repeats = upholsteryFootprintRepeats(footprint, textureWidthCm, textureHeightCm);
  const fb = FALLBACK_UPHOLSTERY_TILE_CM;
  const cw = effectiveMotifCm(textureWidthCm, fb);
  const heightOrWidth =
    textureHeightCm != null && textureHeightCm > 0 ? textureHeightCm : textureWidthCm;
  const ch = effectiveMotifCm(heightOrWidth, fb);

  return {
    ...repeats,
    motifWidthM: cw / 100,
    motifHeightM: ch / 100,
  };
}

/**
 * One tiling scale for every upholstered primitive on this GLB, from overall chair bounds.
 * Avoids per-mesh bbox repeats → different spatial frequencies across adjacent panels (“patchwork” seams).
 */
export function upholsteryFootprintRepeats(
  footprint: UpholsteryFootprintM,
  textureWidthCm?: number | null,
  textureHeightCm?: number | null,
): { repeatU: number; repeatV: number } {
  const fb = FALLBACK_UPHOLSTERY_TILE_CM;
  const cw = effectiveMotifCm(textureWidthCm, fb);
  const heightOrWidth =
    textureHeightCm != null && textureHeightCm > 0 ? textureHeightCm : textureWidthCm;
  const ch = effectiveMotifCm(heightOrWidth, fb);

  const twM = cw / 100;
  const thM = ch / 100;

  /** Longest chassis span (~“one metre reference” across visible seating shells). */
  const span = Math.max(footprint.w, footprint.d, footprint.h, 0.12);

  return {
    repeatU: span / Math.max(twM, 0.004),
    repeatV: span / Math.max(thM, 0.004),
  };
}

const _tmpCorn = new THREE.Vector3();

/**
 * Fractional tiling phase so mesh islands that meet in space share quilting alignment.
 * Uses world bbox min minus garment bounds min on X/Z for offsetU (horizontal phase) and Y for offsetV (vertical stacking).
 */
function meshWorldPhaseUv(
  mesh: THREE.Mesh,
  garmentBounds: THREE.Box3,
  motifWidthM: number,
  motifHeightM: number,
): { offsetU: number; offsetV: number } {
  const g = mesh.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  const bb = g.boundingBox;
  if (!bb) return { offsetU: 0, offsetV: 0 };

  const tw = Math.max(motifWidthM, 0.004);
  const th = Math.max(motifHeightM, 0.004);

  _tmpCorn.copy(bb.min).applyMatrix4(mesh.matrixWorld);
  const bx = garmentBounds.min.x;
  const by = garmentBounds.min.y;
  const bz = garmentBounds.min.z;

  const ox = THREE.MathUtils.euclideanModulo((_tmpCorn.x - bx) / tw + 1e3, 1);
  const oz = THREE.MathUtils.euclideanModulo((_tmpCorn.z - bz) / tw + 1e3, 1);
  const oy = THREE.MathUtils.euclideanModulo((_tmpCorn.y - by) / th + 1e3, 1);

  return {
    offsetU: THREE.MathUtils.euclideanModulo(ox + oz, 1),
    offsetV: oy,
  };
}

/**
 * Set repeat + wrap on texture channels shared by glTF upholstery swaps.
 *
 * Mipmaps OFF: tiled swatches split across meshes otherwise pick inconsistent mip LODs at UV seams,
 * reading as rectangles of mismatched lightness (“multiple fabrics”).
 */
function applyRepeatAndOffsetToFabricMaps(
  mat: THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial,
  repeatU: number,
  repeatV: number,
  offsetU = 0,
  offsetV = 0,
): void {
  const ru = Math.max(repeatU, 0.02);
  const rv = Math.max(repeatV, 0.02);
  const mats = mat as unknown as Record<string, unknown>;
  for (const key of FABRIC_TEX_KEYS) {
    const tex = mats[key];
    if (!(tex instanceof THREE.Texture)) continue;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.matrixAutoUpdate = true;
    tex.rotation = 0;
    tex.center.set(0, 0);
    tex.offset.set(offsetU, offsetV);
    tex.repeat.set(ru, rv);
    tex.anisotropy = 16;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    if ("colorSpace" in tex && tex.colorSpace !== THREE.NoColorSpace) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    tex.needsUpdate = true;
  }
  mat.needsUpdate = true;
}

/**
 * Unified repeat plus world-space tiling phase — lines up quilts across neighboring GLB meshes.
 */
export function applyUpholsteryFabricClone(
  mat: THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial,
  mesh: THREE.Mesh,
  garmentBounds: THREE.Box3,
  repeatU: number,
  repeatV: number,
  motifWidthM: number,
  motifHeightM: number,
): void {
  const { offsetU, offsetV } = meshWorldPhaseUv(mesh, garmentBounds, motifWidthM, motifHeightM);
  applyRepeatAndOffsetToFabricMaps(mat, repeatU, repeatV, offsetU, offsetV);
}
