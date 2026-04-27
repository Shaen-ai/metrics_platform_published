import type { Material, MaterialGrainDirection } from "./types";

/** Row shape from `GET /api/public/material-templates` (MaterialTemplateResource). */
export interface PublicMaterialTemplateRow {
  id: string;
  manufacturer?: string | null;
  name: string;
  type: string;
  types?: string[];
  category: string;
  categories?: string[];
  color: string;
  colorHex?: string;
  colorCode?: string;
  unit: string;
  imageUrl?: string;
  sheetWidthCm?: number | null;
  sheetHeightCm?: number | null;
  grainDirection?: MaterialGrainDirection;
  kerfMm?: number | null;
}

/**
 * Maps a global template row to the `Material` shape the planners expect, bound to
 * the current public admin (ids stay stable for session-only preview pricing).
 */
export function mapTemplateRowToMaterial(row: PublicMaterialTemplateRow, adminId: string): Material {
  const types = row.types?.length ? row.types : [row.type];
  const categories = row.categories?.length ? row.categories : [row.category];
  const code = (row.colorCode ?? row.colorHex ?? row.color ?? "#888888").trim() || "#888888";
  return {
    id: row.id,
    adminId,
    name: row.name,
    manufacturer: row.manufacturer ?? null,
    type: row.type,
    types,
    category: typeof row.category === "string" && row.category ? row.category : categories[0] ?? "surface",
    categories,
    color: row.color,
    colorCode: code,
    pricePerUnit: 0,
    unit: row.unit || "sqm",
    imageUrl: row.imageUrl,
    subModeId: undefined,
    sheetWidthCm: row.sheetWidthCm ?? undefined,
    sheetHeightCm: row.sheetHeightCm ?? undefined,
    grainDirection: row.grainDirection,
    kerfMm: row.kerfMm ?? undefined,
  };
}
