import type { PlannerCatalogItem } from "../types";
import type { PlannerSavedWardrobe } from "@/lib/types";
import type { WardrobeConfig } from "./types";
import { clampWardrobeBase, wardrobeBaseLiftCm } from "./data";

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

export function savedWardrobeToPlannerCatalogItem(sw: PlannerSavedWardrobe): PlannerCatalogItem {
  const dims = wardrobeFootprintMeters(sw.config);
  return {
    id: sw.id,
    name: sw.name,
    category: YOUR_WARDROBES_CATEGORY,
    vendor: "",
    price: sw.cachedPrice,
    width: dims.width,
    depth: dims.depth,
    height: dims.height,
    color: "#a89072",
  };
}

export function isYourWardrobesCategory(category: string): boolean {
  return category === YOUR_WARDROBES_CATEGORY;
}
