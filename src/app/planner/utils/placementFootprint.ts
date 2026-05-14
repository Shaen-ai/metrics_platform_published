import type { PlacedItem, PlannerCatalogItem } from "../types";
import { wardrobePlacementFootprintMeters } from "../wardrobe/plannerWardrobeCatalog";

/** Width × depth (m) used for room clamping, drag, and clearance — matches rendered extents where possible. */
export function placementFootprintDims(item: PlacedItem, cat: PlannerCatalogItem): { w: number; d: number } {
  if (
    item.outdoorCushionConfig?.enabled &&
    item.outdoorMeshFootprint &&
    item.outdoorMeshFootprint.width > 0 &&
    item.outdoorMeshFootprint.depth > 0
  ) {
    return { w: item.outdoorMeshFootprint.width, d: item.outdoorMeshFootprint.depth };
  }
  if (item.wardrobeConfig) {
    const { width, depth } = wardrobePlacementFootprintMeters(item.wardrobeConfig, item.wardrobePlannerRoom);
    return { w: width, d: depth };
  }
  return { w: item.width ?? cat.width, d: item.depth ?? cat.depth };
}
