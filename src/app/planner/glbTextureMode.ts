import { catalogItemIsSoftFurnitureMode, catalogItemIsUpholstery } from "@/lib/catalogItemCategories";
import type { PlannerSwatchMaterial } from "@/lib/plannerMaterials";
import type { PlannerCatalogItem } from "./types";
import type { WardrobeMaterial } from "./wardrobe/data";

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
    textureWidthCm: s.textureWidthCm,
    textureHeightCm: s.textureHeightCm,
  };
}

/**
 * Decide whether GLB texture overrides should use board/laminate swatches or upholstery (fabric/leather/Bouclé).
 * Upholstery swatches apply only to Soft Furniture mode items — never from category keywords alone on cabinets, etc.
 */
export function getGlbTextureMode(item: PlannerCatalogItem): "board" | "upholstery" {
  if (!catalogItemIsSoftFurnitureMode(item)) return "board";
  if (item.isFabricCustomizable) return "upholstery";
  return catalogItemIsUpholstery(item) ? "upholstery" : "board";
}
