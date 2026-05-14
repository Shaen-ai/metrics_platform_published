import type { PlannerCatalogItem } from "../types";
import type { PlannerSavedWardrobe } from "@/lib/types";
import type { WardrobeConfig, RoomSettings } from "./types";
import { clampWardrobeBase, wardrobeBaseLiftCm } from "./data";
import {
  wardrobeCompositionWidthMeters,
  wardrobeLayoutLegItems,
  WARDROBE_LEG_GROUP_Z_BUMP_M,
} from "./wardrobeSpaceLayout";

const YOUR_WARDROBES_CATEGORY = "Your wardrobes";

/** sessionStorage: auto-place this saved-wardrobe id after opening Bedroom planner */
export const PENDING_BEDROOM_WARDROBE_ID_KEY = "pending-bedroom-wardrobe-id";

/**
 * Outer footprint in meters for room layout (primary + right addons on X,
 * top addons on Y, depth = frame.depth).
 */
export function wardrobeFootprintMeters(config: WardrobeConfig): {
  width: number;
  depth: number;
  height: number;
} {
  const CM = 0.01;
  const W = config.frame.width * CM;
  const H = config.frame.height * CM;
  const D = config.frame.depth * CM;
  const seam = config.seamStyle === "shared" ? -0.018 : 0;
  const addons = config.addons ?? [];
  let rightCount = 0;
  let topCount = 0;
  for (const a of addons) {
    if (a.position === "right") rightCount += 1;
    else topCount += 1;
  }
  const totalRightM = rightCount * (W + seam);
  const widthM = W + totalRightM;
  const base = clampWardrobeBase(config.base);
  const liftM = wardrobeBaseLiftCm(base) * CM;
  const totalTopM = topCount * (H + seam);
  const bodyHeightM = H + totalTopM;
  const heightM = liftM + bodyHeightM;
  return {
    width: Math.round(widthM * 10000) / 10000,
    depth: Math.round(D * 10000) / 10000,
    height: Math.round(heightM * 10000) / 10000,
  };
}

/**
 * Axis-aligned floor footprint + center (XZ), same space as leg placements before item.rotationY.
 * Center is where `clampFurnitureToRoom` assumes `item.position` sits when rotating width × depth.
 */
export function wardrobePlacementFootprintBounds(
  config: WardrobeConfig,
  plannerRoom: RoomSettings | undefined,
): { width: number; depth: number; centerX: number; centerZ: number } {
  return wardrobePlacementFootprintBoundsInternal(config, plannerRoom, false);
}

/** Previous migration used `bump...bump + depth`; keep this only to repair saved positions. */
export function legacyWardrobePlacementFootprintBounds(
  config: WardrobeConfig,
  plannerRoom: RoomSettings | undefined,
): { width: number; depth: number; centerX: number; centerZ: number } {
  return wardrobePlacementFootprintBoundsInternal(config, plannerRoom, true);
}

function wardrobePlacementFootprintBoundsInternal(
  config: WardrobeConfig,
  plannerRoom: RoomSettings | undefined,
  legacyForwardDepth: boolean,
): { width: number; depth: number; centerX: number; centerZ: number } {
  const Wtot = wardrobeCompositionWidthMeters(config);
  const D_m = config.frame.depth * 0.01;

  const legs = plannerRoom
    ? wardrobeLayoutLegItems(plannerRoom, Wtot, D_m)
    : [
        {
          xM: 0,
          zM: 0,
          rotationY: 0,
          label: "",
          frameWidthCm: config.frame.width,
          legRole: "back" as const,
        },
      ];

  const CM = 0.01;
  const seamStyle = config.seamStyle ?? "independent";
  const seamOffsetM = seamStyle === "shared" ? -0.018 : 0;
  const addons = config.addons ?? [];
  let rightCount = 0;
  for (const a of addons) {
    if (a.position === "right") rightCount += 1;
  }

  const bump = WARDROBE_LEG_GROUP_Z_BUMP_M;
  const minLocalZ = legacyForwardDepth ? bump : bump - D_m / 2;
  const maxLocalZ = legacyForwardDepth ? bump + D_m : bump + D_m / 2;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const leg of legs) {
    const Wleg = leg.frameWidthCm * CM;
    const totalRightM = rightCount * (Wleg + seamOffsetM);
    const baseX = -(Wleg + totalRightM) / 2;
    const rowSpan = Wleg + totalRightM;
    const corners: [number, number][] = [
      [baseX, minLocalZ],
      [baseX + rowSpan, minLocalZ],
      [baseX + rowSpan, maxLocalZ],
      [baseX, maxLocalZ],
    ];
    const c = Math.cos(leg.rotationY);
    const s = Math.sin(leg.rotationY);
    for (const [lx, lz] of corners) {
      const wx = leg.xM + c * lx + s * lz;
      const wz = leg.zM - s * lx + c * lz;
      minX = Math.min(minX, wx);
      maxX = Math.max(maxX, wx);
      minZ = Math.min(minZ, wz);
      maxZ = Math.max(maxZ, wz);
    }
  }

  const bboxW = maxX - minX;
  const bboxD = maxZ - minZ;

  return {
    width: Math.round(bboxW * 10000) / 10000,
    depth: Math.round(bboxD * 10000) / 10000,
    centerX: Math.round(((minX + maxX) / 2) * 10000) / 10000,
    centerZ: Math.round(((minZ + maxZ) / 2) * 10000) / 10000,
  };
}

/**
 * Axis-aligned footprint on the bedroom floor for clamp / drag — matches multi-leg L/U layouts
 * (union of each leg's module row), not just nominal linear width × depth.
 */
export function wardrobePlacementFootprintMeters(
  config: WardrobeConfig,
  plannerRoom: RoomSettings | undefined,
): { width: number; depth: number } {
  const b = wardrobePlacementFootprintBounds(config, plannerRoom);
  return { width: b.width, depth: b.depth };
}

export function savedWardrobeToPlannerCatalogItem(sw: PlannerSavedWardrobe): PlannerCatalogItem {
  const linearDims = wardrobeFootprintMeters(sw.config);
  const placeDims = wardrobePlacementFootprintMeters(sw.config, sw.room);
  return {
    id: sw.id,
    name: sw.name,
    category: YOUR_WARDROBES_CATEGORY,
    vendor: "",
    price: sw.cachedPrice,
    width: placeDims.width,
    depth: placeDims.depth,
    height: linearDims.height,
    color: "#a89072",
    ...(sw.room ? { wardrobePlannerRoom: structuredClone(sw.room) } : {}),
  };
}

export function isYourWardrobesCategory(category: string): boolean {
  return category === YOUR_WARDROBES_CATEGORY;
}
