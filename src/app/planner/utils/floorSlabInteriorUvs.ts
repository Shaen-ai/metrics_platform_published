import * as THREE from "three";

export type RemapFloorSlabTopFaceUvsParams = {
  /** Inner usable bounds in world X (wall inner faces). */
  innerMinX: number;
  innerMaxX: number;
  /** Inner usable bounds in world Z (wall inner faces). */
  innerMinZ: number;
  innerMaxZ: number;
  /** Floor mesh `position` (world translation; mesh is not rotated). */
  meshPosition: THREE.Vector3 | Readonly<{ x: number; y: number; z: number }>;
  /** Box half-height (`T/2`) — top cap vertices have `localY ≈ +halfHeight`. */
  halfHeight: number;
};

const TOP_EPS = 1e-5;
/** Only remap cap vertices whose normal points up (+Y), not the top rim of vertical side faces. */
const TOP_NORMAL_EPS = 0.999;

function meshPos(p: RemapFloorSlabTopFaceUvsParams["meshPosition"]): { x: number; y: number; z: number } {
  return p instanceof THREE.Vector3 ? { x: p.x, y: p.y, z: p.z } : { x: p.x, y: p.y, z: p.z };
}

/** U: innerMinX → 0, innerMaxX → 1 (margins clamp); matches BoxGeometry +Y face u ∝ +X. */
function worldXToU(wx: number, innerMinX: number, innerMaxX: number): number {
  if (wx <= innerMinX) return 0;
  if (wx >= innerMaxX) return 1;
  return (wx - innerMinX) / (innerMaxX - innerMinX);
}

/**
 * V: innerMaxZ → 0, innerMinZ → 1 (margins clamp). Matches Three.js BoxGeometry +Y face:
 * `v = 1 - iy/gridY` with Z running from −depth/2 to +depth/2 ⇒ higher Z ⇒ lower v.
 */
function worldZToV(wz: number, innerMinZ: number, innerMaxZ: number): number {
  if (wz <= innerMinZ) return 1;
  if (wz >= innerMaxZ) return 0;
  return (innerMaxZ - wz) / (innerMaxZ - innerMinZ);
}

/**
 * Remap top-face UVs so [0,1]×[0,1] spans the interior rectangle, not the full slab under walls.
 * Safe to call multiple times on the same geometry (idempotent for same params).
 */
export function remapFloorSlabTopFaceUvs(
  geometry: THREE.BufferGeometry,
  params: RemapFloorSlabTopFaceUvsParams,
): void {
  const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
  const uvAttr = geometry.getAttribute("uv") as THREE.BufferAttribute | undefined;
  const normalAttr = geometry.getAttribute("normal") as THREE.BufferAttribute | undefined;
  if (!posAttr || !uvAttr || posAttr.itemSize < 3 || uvAttr.itemSize < 2) return;

  const { innerMinX, innerMaxX, innerMinZ, innerMaxZ, halfHeight } = params;
  const { x: ox, z: oz } = meshPos(params.meshPosition);
  const n = posAttr.count;
  const useNormalGate = Boolean(normalAttr && normalAttr.itemSize >= 3);

  for (let i = 0; i < n; i++) {
    if (useNormalGate) {
      if (normalAttr!.getY(i) < TOP_NORMAL_EPS) continue;
    } else {
      const ly = posAttr.getY(i);
      if (ly < halfHeight - TOP_EPS) continue;
    }

    const wx = posAttr.getX(i) + ox;
    const wz = posAttr.getZ(i) + oz;
    const u = worldXToU(wx, innerMinX, innerMaxX);
    const v = worldZToV(wz, innerMinZ, innerMaxZ);
    uvAttr.setXY(i, u, v);
  }

  uvAttr.needsUpdate = true;
}
