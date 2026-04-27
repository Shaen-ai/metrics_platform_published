import type { FloorOutlinePoint } from "../types";

export type KitchenShapeId =
  | "square"
  | "l_in"
  | "chamfer"
  | "open_divided"
  | "open_corner"
  | "open_l";

export interface KitchenShapeParams {
  /** Long outer span along X before centering (meters). */
  spanM: number;
  /** Depth of the missing square on an L (meters). */
  legCutM: number;
  /** 45° cut size on chamfered corner (meters). */
  chamferM: number;
}

const DEFAULT_PARAMS: KitchenShapeParams = {
  spanM: 4,
  legCutM: 1.25,
  chamferM: 0.85,
};

/** Axis-aligned bounding box of outline (before centering). */
export function outlineBoundingBox(pts: FloorOutlinePoint[]) {
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  return { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ };
}

/** Shift outline so the bbox center is at the origin. */
export function centerOutlineAtBBoxCenter(pts: FloorOutlinePoint[]): FloorOutlinePoint[] {
  const bb = outlineBoundingBox(pts);
  const cx = (bb.minX + bb.maxX) / 2;
  const cz = (bb.minZ + bb.maxZ) / 2;
  return pts.map((p) => ({ x: p.x - cx, z: p.z - cz }));
}

/**
 * Build plan outline in XZ (CCW from above) and open wall edges.
 * Rectangle edges after centering: 0 bottom (−X to +X), 1 right, 2 top, 3 left.
 */
export function buildKitchenOutline(
  shape: KitchenShapeId,
  params: Partial<KitchenShapeParams> = {}
): { outline: FloorOutlinePoint[]; openEdgeIndices: number[] } {
  const { spanM, legCutM, chamferM } = { ...DEFAULT_PARAMS, ...params };
  const s = spanM;
  const h = s / 2;

  const rect = (): FloorOutlinePoint[] => [
    { x: -h, z: -h },
    { x: h, z: -h },
    { x: h, z: h },
    { x: -h, z: h },
  ];

  const lc = Math.max(0.4, Math.min(s * 0.45, legCutM));
  const ch = Math.max(0.25, Math.min(s * 0.35, chamferM));

  switch (shape) {
    case "square":
      return { outline: centerOutlineAtBBoxCenter(rect()), openEdgeIndices: [] };

    case "l_in": {
      // Missing quadrant at +X,+Z: notch from (h−lc,h) to (h,h−lc)
      const u = h - lc;
      const raw: FloorOutlinePoint[] = [
        { x: -h, z: -h },
        { x: h, z: -h },
        { x: h, z: u },
        { x: u, z: u },
        { x: u, z: h },
        { x: -h, z: h },
      ];
      return { outline: centerOutlineAtBBoxCenter(raw), openEdgeIndices: [] };
    }

    case "chamfer": {
      // Chamfer at +X,+Z corner: replace corner with (h, u) → (u, h)
      const raw: FloorOutlinePoint[] = [
        { x: -h, z: -h },
        { x: h, z: -h },
        { x: h, z: h - ch },
        { x: h - ch, z: h },
        { x: -h, z: h },
      ];
      return { outline: centerOutlineAtBBoxCenter(raw), openEdgeIndices: [] };
    }

    case "open_divided":
      return {
        outline: centerOutlineAtBBoxCenter(rect()),
        openEdgeIndices: [2], // top edge — open to living / dining
      };

    case "open_corner":
      return {
        outline: centerOutlineAtBBoxCenter(rect()),
        openEdgeIndices: [2, 3], // top + left — corner transition
      };

    case "open_l": {
      const u = h - lc;
      const raw: FloorOutlinePoint[] = [
        { x: -h, z: -h },
        { x: h, z: -h },
        { x: h, z: u },
        { x: u, z: u },
        { x: u, z: h },
        { x: -h, z: h },
      ];
      return {
        outline: centerOutlineAtBBoxCenter(raw),
        openEdgeIndices: [4], // one long leg open
      };
    }

    default:
      return { outline: centerOutlineAtBBoxCenter(rect()), openEdgeIndices: [] };
  }
}

export function bboxSizeFromOutline(outline: FloorOutlinePoint[]) {
  const bb = outlineBoundingBox(outline);
  return { width: bb.width, depth: bb.depth };
}

/** Matches kitchen wizard sliders (meters). */
export const KITCHEN_ROOM_SPAN_MIN = 2.5;
export const KITCHEN_ROOM_SPAN_MAX = 8;

function polyEdgeLenM(outline: FloorOutlinePoint[], i: number): number {
  const n = outline.length;
  const a = outline[i % n]!;
  const b = outline[(i + 1) % n]!;
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/**
 * Maps a drag along the dimension-line outward normal to updated template params.
 * `perpDeltaWorld` is incremental movement (meters) in the direction of the edge's outward SVG normal × (1/scale) mapping.
 */
export function resizeKitchenParamsFromEdgeDrag(
  shape: KitchenShapeId,
  outline: FloorOutlinePoint[],
  edgeIndex: number,
  perpDeltaWorld: number,
  params: KitchenShapeParams,
): KitchenShapeParams {
  if (Math.abs(perpDeltaWorld) < 1e-8) return params;
  const { spanM, legCutM, chamferM } = params;
  const s = spanM;
  const len = polyEdgeLenM(outline, edgeIndex);
  const lc = Math.max(0.4, Math.min(s * 0.45, legCutM));
  const ch = Math.max(0.25, Math.min(s * 0.35, chamferM));
  const clampSpan = (v: number) =>
    Math.max(KITCHEN_ROOM_SPAN_MIN, Math.min(KITCHEN_ROOM_SPAN_MAX, v));

  if (shape === "square" || shape === "open_divided" || shape === "open_corner") {
    return { ...params, spanM: clampSpan(s + 2 * perpDeltaWorld) };
  }

  if (shape === "chamfer") {
    const diagLen = Math.SQRT2 * ch;
    if (Math.abs(len - diagLen) < 0.28) {
      const nc = ch + perpDeltaWorld;
      return { ...params, chamferM: Math.max(0.25, Math.min(s * 0.35, nc)) };
    }
    return { ...params, spanM: clampSpan(s + 2 * perpDeltaWorld) };
  }

  if (shape === "l_in" || shape === "open_l") {
    if (Math.abs(len - lc) < 0.26) {
      const nlc = lc - perpDeltaWorld;
      const capped = Math.max(0.5, Math.min(s * 0.45, nlc));
      return { ...params, legCutM: capped };
    }
    return { ...params, spanM: clampSpan(s + 2 * perpDeltaWorld) };
  }

  return params;
}

export { DEFAULT_PARAMS as DEFAULT_KITCHEN_SHAPE_PARAMS };
