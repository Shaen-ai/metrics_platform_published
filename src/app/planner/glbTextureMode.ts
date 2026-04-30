import { catalogItemAllCategoryLabels } from "@/lib/catalogItemCategories";
import type { PlannerSwatchMaterial } from "@/lib/plannerMaterials";
import type { PlannerCatalogItem } from "./types";
import type { WardrobeMaterial } from "./wardrobe/data";

/** Normalized tokens that suggest soft / upholstered GLB catalog pieces (board vs fabric picker). */
const UPHOLSTERY_HINT = [
  "seating",
  "sofa",
  "couch",
  "armchair",
  "chair",
  "bed",
  "ottoman",
  "bench",
  "upholstery",
  "fabric",
  "boucle",
  "bouclé",
  "sectional",
  "loveseat",
  "recliner",
  "chaise",
  "divan",
];

/**
 * Map a planner board/upholstery swatch into the wardrobe material shape for `buildMaterialFromSwatch`.
 */
export function plannerSwatchToWardrobeMaterial(s: PlannerSwatchMaterial): WardrobeMaterial {
  return {
    id: s.id,
    name: s.name,
    color: s.color,
    roughness: s.roughness,
    metalness: s.metalness,
    priceMultiplier: s.priceMultiplier,
    imageUrl: s.imageUrl,
    pricePerSqm: s.pricePerSqm,
    manufacturer: s.manufacturer,
    surfaceType: s.surfaceType as WardrobeMaterial["surfaceType"],
    sheetWidthCm: s.sheetWidthCm,
    sheetHeightCm: s.sheetHeightCm,
    grainDirection: s.grainDirection,
    kerfMm: s.kerfMm,
    materialType: s.materialType,
    materialTypes: s.materialTypes,
    categoryKey: s.categoryKey,
  };
}

/**
 * Decide whether GLB texture overrides should use board/laminate swatches or upholstery (fabric/leather/Bouclé).
 */
export function getGlbTextureMode(item: PlannerCatalogItem): "board" | "upholstery" {
  const labels = catalogItemAllCategoryLabels(item);
  const blob = labels.join(" ").toLowerCase();
  if (UPHOLSTERY_HINT.some((h) => blob.includes(h))) {
    return "upholstery";
  }
  return "board";
}
