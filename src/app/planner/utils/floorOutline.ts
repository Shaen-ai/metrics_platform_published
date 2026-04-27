import type { FloorOutlinePoint, Opening, Room } from "../types";
import { outlineBoundingBox } from "./kitchenFloorTemplates";

/** Ray-casting point-in-polygon on XZ. */
export function pointInFloorOutline(x: number, z: number, outline: FloorOutlinePoint[]): boolean {
  let inside = false;
  const n = outline.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = outline[i]!.x,
      zi = outline[i]!.z;
    const xj = outline[j]!.x,
      zj = outline[j]!.z;
    const intersect =
      (zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-14) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Approximate polygon area (XZ) for labels. */
export function floorOutlineAreaSqM(outline: FloorOutlinePoint[]): number {
  let a = 0;
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const p = outline[i]!;
    const q = outline[(i + 1) % n]!;
    a += p.x * q.z - q.x * p.z;
  }
  return Math.abs(a) * 0.5;
}

export function roomUsesFloorOutline(room: Room): boolean {
  return Array.isArray(room.floorOutline) && room.floorOutline.length >= 3;
}

/** Edge length in meters. */
export function edgeLength(outline: FloorOutlinePoint[], edgeIndex: number): number {
  const n = outline.length;
  const a = outline[edgeIndex % n]!;
  const b = outline[(edgeIndex + 1) % n]!;
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/** Smallest allowed wall segment after dragging a corner (m). */
export const FLOOR_VERTEX_MIN_EDGE_M = 0.32;
/** Max axis-aligned footprint width or depth from freeform edits (m). */
export const FLOOR_OUTLINE_MAX_BBOX_M = 15;
/** Corners closer than this (m) after a drag can merge into one vertex (e.g. 5 → 4 corners). */
export const FLOOR_VERTEX_MERGE_DISTANCE_M = 0.22;

export function validateKitchenFloorOutline(
  outline: FloorOutlinePoint[],
  opts?: { minEdge?: number; maxBbox?: number },
): boolean {
  const minEdge = opts?.minEdge ?? FLOOR_VERTEX_MIN_EDGE_M;
  const maxBbox = opts?.maxBbox ?? FLOOR_OUTLINE_MAX_BBOX_M;
  const n = outline.length;
  if (n < 3) return false;
  for (let e = 0; e < n; e++) {
    const a = outline[e]!;
    const b = outline[(e + 1) % n]!;
    if (Math.hypot(b.x - a.x, b.z - a.z) < minEdge) return false;
  }
  const bb = outlineBoundingBox(outline);
  if (bb.width > maxBbox + 1e-6 || bb.depth > maxBbox + 1e-6) return false;
  if (bb.width < minEdge * 2 - 1e-9 || bb.depth < minEdge * 2 - 1e-9) return false;
  if (floorOutlineAreaSqM(outline) < minEdge * minEdge * 0.35) return false;
  return true;
}

export function tryMoveFloorVertex(
  outline: FloorOutlinePoint[],
  vertexIndex: number,
  deltaX: number,
  deltaZ: number,
  opts?: { minEdge?: number; maxBbox?: number },
): FloorOutlinePoint[] | null {
  const n = outline.length;
  if (n < 3) return null;
  const i = ((vertexIndex % n) + n) % n;
  if (Math.abs(deltaX) < 1e-9 && Math.abs(deltaZ) < 1e-9) return null;

  const p = outline[i]!;
  const trial = { x: p.x + deltaX, z: p.z + deltaZ };
  const candidate = outline.map((pt, idx) => (idx === i ? trial : { ...pt }));

  if (!validateKitchenFloorOutline(candidate, opts)) return null;
  return candidate;
}

/** New edge index (in the n−1 polygon) that replaces the two edges meeting at `removedVertex`. */
function mergedOpenEdgeIndexAfterVertexRemoval(removedVertex: number, oldVertexCount: number): number {
  const pred = (removedVertex - 1 + oldVertexCount) % oldVertexCount;
  return pred < removedVertex ? pred : pred - 1;
}

/**
 * If vertex `movedVertexIndex` lies within `mergeDist` of any other vertex, remove it (merge corners).
 * Remaps open-edge indices and openings that referenced the collapsed edges.
 */
export function mergeFloorVertexIfNearby(
  outline: FloorOutlinePoint[],
  movedVertexIndex: number,
  openEdgeIndices: number[],
  openings: Opening[],
  opts?: { mergeDist?: number; minEdge?: number; maxBbox?: number },
): {
  outline: FloorOutlinePoint[];
  openEdgeIndices: number[];
  openings: Opening[];
} | null {
  const mergeDist = opts?.mergeDist ?? FLOOR_VERTEX_MERGE_DISTANCE_M;
  const n = outline.length;
  if (n <= 3) return null;
  const i = ((movedVertexIndex % n) + n) % n;
  const p = outline[i]!;
  let hit = -1;
  for (let j = 0; j < n; j++) {
    if (j === i) continue;
    if (Math.hypot(p.x - outline[j]!.x, p.z - outline[j]!.z) < mergeDist) {
      hit = j;
      break;
    }
  }
  if (hit < 0) return null;

  const removed = i;
  const newOutline = outline.filter((_, idx) => idx !== removed);
  if (!validateKitchenFloorOutline(newOutline, opts)) return null;

  const edgeLow = (removed - 1 + n) % n;
  const edgeHigh = removed;
  const collapsed = new Set([edgeLow, edgeHigh]);
  const hadOpenCollapsed = openEdgeIndices.some((ei) => collapsed.has(ei));

  let nextOpen = openEdgeIndices
    .filter((ei) => !collapsed.has(ei))
    .map((ei) => (ei > removed ? ei - 1 : ei));

  if (hadOpenCollapsed) {
    const add = mergedOpenEdgeIndexAfterVertexRemoval(removed, n);
    if (!nextOpen.includes(add)) nextOpen.push(add);
  }
  nextOpen = nextOpen.filter((e) => e >= 0 && e < newOutline.length);

  const nextOpenings = openings
    .filter((o) => (o.edgeIndex === undefined ? true : !collapsed.has(o.edgeIndex)))
    .map((o) => {
      const ei = o.edgeIndex ?? 0;
      return { ...o, edgeIndex: ei > removed ? ei - 1 : ei };
    });

  return { outline: newOutline, openEdgeIndices: nextOpen, openings: nextOpenings };
}

function unit2d(x: number, z: number): { x: number; z: number } {
  const L = Math.hypot(x, z);
  if (L < 1e-9) return { x: 1, z: 0 };
  return { x: x / L, z: z / L };
}

/**
 * Chamfer / cut a single corner: replace vertex `vertexIndex` with two points inset `depthM`
 * along the incoming and outgoing edges. Remaps `openEdgeIndices` and opening `edgeIndex`.
 *
 * Vertex `i` is the start of edge `i` (CCW). Use the same index as the selected wall in the wizard.
 */
export function chamferFloorVertex(
  outline: FloorOutlinePoint[],
  vertexIndex: number,
  depthM: number,
  openEdgeIndices: number[],
  openings: Opening[],
  opts?: { minEdge?: number; maxBbox?: number },
): {
  outline: FloorOutlinePoint[];
  openEdgeIndices: number[];
  openings: Opening[];
} | null {
  const n = outline.length;
  if (n < 3 || depthM < 1e-4) return null;
  const i = ((vertexIndex % n) + n) % n;
  const pPrev = outline[(i - 1 + n) % n]!;
  const p = outline[i]!;
  const pNext = outline[(i + 1) % n]!;

  const lenIn = Math.hypot(p.x - pPrev.x, p.z - pPrev.z);
  const lenOut = Math.hypot(pNext.x - p.x, pNext.z - p.z);
  const minEdge = opts?.minEdge ?? FLOOR_VERTEX_MIN_EDGE_M;

  const d = Math.min(depthM, lenIn * 0.48, lenOut * 0.48);
  if (d < minEdge * 0.28) return null;

  const uIn = unit2d(pPrev.x - p.x, pPrev.z - p.z);
  const uOut = unit2d(pNext.x - p.x, pNext.z - p.z);
  const a: FloorOutlinePoint = { x: p.x + uIn.x * d, z: p.z + uIn.z * d };
  const b: FloorOutlinePoint = { x: p.x + uOut.x * d, z: p.z + uOut.z * d };

  if (Math.hypot(b.x - a.x, b.z - a.z) < minEdge) return null;

  const nextOutline = [...outline.slice(0, i), a, b, ...outline.slice(i + 1)];
  if (!validateKitchenFloorOutline(nextOutline, opts)) return null;

  const nextOpen = [
    ...new Set(
      openEdgeIndices.map((ei) => {
        if (ei === i) return i + 1;
        if (ei > i) return ei + 1;
        return ei;
      }),
    ),
  ]
    .filter((e) => e >= 0 && e < nextOutline.length)
    .sort((x, y) => x - y);

  const nextOpenings = openings.map((o) => {
    if (o.edgeIndex === undefined) return o;
    const ei = o.edgeIndex;
    if (ei === i) return { ...o, edgeIndex: i + 1 };
    if (ei > i) return { ...o, edgeIndex: ei + 1 };
    return o;
  });

  return {
    outline: nextOutline,
    openEdgeIndices: nextOpen,
    openings: nextOpenings,
  };
}

/** Distance along edge from vertex `edgeIndex` to opening center (meters), [-1…1] convention on full segment length `L`. */
function openingCenterDistFromCorner(openingPositionNorm: number, L: number): number {
  const halfWidth = L / 2;
  return openingPositionNorm * halfWidth + halfWidth;
}

/** Normalized [-1,1] position from corner-to-center distance on segment length L, span width w. */
function openingNormFromCenterDist(distFromCornerToCenterM: number, L: number, openingWidthM: number): number {
  const halfWidth = L / 2;
  if (halfWidth <= 0) return 0;
  const cx = distFromCornerToCenterM - halfWidth;
  const minC = -halfWidth + openingWidthM / 2;
  const maxC = halfWidth - openingWidthM / 2;
  const cxc = Math.max(minC, Math.min(maxC, cx));
  return cxc / halfWidth;
}

/**
 * Insert a corner on an edge (split edge `edgeIndex` at fraction `tAlong` from its start vertex, 0…1).
 * Remaps open edges and openings. `tAlong` is clamped away from 0/1 so vertices don’t duplicate.
 */
export function splitFloorEdgeAt(
  outline: FloorOutlinePoint[],
  edgeIndex: number,
  tAlong: number,
  openEdgeIndices: number[],
  openings: Opening[],
  opts?: { minEdge?: number; maxBbox?: number },
): {
  outline: FloorOutlinePoint[];
  openEdgeIndices: number[];
  openings: Opening[];
} | null {
  const n = outline.length;
  if (n < 3) return null;
  const ei = ((edgeIndex % n) + n) % n;
  const t = Math.min(0.95, Math.max(0.05, tAlong));
  const a = outline[ei]!;
  const b = outline[(ei + 1) % n]!;
  const L = Math.hypot(b.x - a.x, b.z - a.z);
  const minEdge = opts?.minEdge ?? FLOOR_VERTEX_MIN_EDGE_M;
  if (L < minEdge * 2.2) return null;
  const L1 = L * t;
  const L2 = L * (1 - t);
  if (L1 < minEdge || L2 < minEdge) return null;

  const newPt: FloorOutlinePoint = {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
  };
  const nextOutline = [...outline.slice(0, ei + 1), newPt, ...outline.slice(ei + 1)];
  if (!validateKitchenFloorOutline(nextOutline, opts)) return null;

  const wasOpen = openEdgeIndices.includes(ei);
  const nextOpenSet = new Set<number>();
  for (const oe of openEdgeIndices) {
    if (oe < ei) nextOpenSet.add(oe);
    else if (oe === ei) {
      if (wasOpen) {
        nextOpenSet.add(ei);
        nextOpenSet.add(ei + 1);
      }
    } else nextOpenSet.add(oe + 1);
  }
  const nextOpen = [...nextOpenSet].filter((e) => e >= 0 && e < nextOutline.length).sort((a, b) => a - b);

  const nextOpenings = openings.map((o) => {
    if (o.edgeIndex === undefined) return o;
    if (o.edgeIndex < ei) return o;
    if (o.edgeIndex > ei) return { ...o, edgeIndex: o.edgeIndex + 1 };
    const dCenter = openingCenterDistFromCorner(o.position, L);
    const splitD = L * t;
    if (dCenter <= splitD + 1e-9) {
      return {
        ...o,
        edgeIndex: ei,
        position: openingNormFromCenterDist(dCenter, L1, o.width),
      };
    }
    const d2 = dCenter - splitD;
    return {
      ...o,
      edgeIndex: ei + 1,
      position: openingNormFromCenterDist(d2, L2, o.width),
    };
  });

  return { outline: nextOutline, openEdgeIndices: nextOpen, openings: nextOpenings };
}

/**
 * Remove a corner.vertex and join its two neighbors (fewer vertices). Fails if fewer than 4 vertices.
 * Same remapping rules as merging two corners, but no distance check.
 */
export function deleteFloorVertex(
  outline: FloorOutlinePoint[],
  vertexIndex: number,
  openEdgeIndices: number[],
  openings: Opening[],
  opts?: { minEdge?: number; maxBbox?: number },
): {
  outline: FloorOutlinePoint[];
  openEdgeIndices: number[];
  openings: Opening[];
} | null {
  const n = outline.length;
  if (n <= 3) return null;
  const removed = ((vertexIndex % n) + n) % n;
  const newOutline = outline.filter((_, idx) => idx !== removed);
  if (!validateKitchenFloorOutline(newOutline, opts)) return null;

  const edgeLow = (removed - 1 + n) % n;
  const edgeHigh = removed;
  const collapsed = new Set([edgeLow, edgeHigh]);
  const hadOpenCollapsed = openEdgeIndices.some((e) => collapsed.has(e));

  let nextOpen = openEdgeIndices
    .filter((e) => !collapsed.has(e))
    .map((e) => (e > removed ? e - 1 : e));

  if (hadOpenCollapsed) {
    const add = mergedOpenEdgeIndexAfterVertexRemoval(removed, n);
    if (!nextOpen.includes(add)) nextOpen.push(add);
  }
  nextOpen = nextOpen.filter((e) => e >= 0 && e < newOutline.length);

  const nextOpenings = openings
    .filter((o) => (o.edgeIndex === undefined ? true : !collapsed.has(o.edgeIndex)))
    .map((o) => {
      const ei = o.edgeIndex ?? 0;
      return { ...o, edgeIndex: ei > removed ? ei - 1 : ei };
    });

  return {
    outline: newOutline,
    openEdgeIndices: [...new Set(nextOpen)].sort((a, b) => a - b),
    openings: nextOpenings,
  };
}

export function getRoomBbox(room: Room) {
  if (roomUsesFloorOutline(room)) {
    return outlineBoundingBox(room.floorOutline!);
  }
  return {
    minX: -room.width / 2,
    maxX: room.width / 2,
    minZ: -room.depth / 2,
    maxZ: room.depth / 2,
    width: room.width,
    depth: room.depth,
  };
}
