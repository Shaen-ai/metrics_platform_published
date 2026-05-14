/** Admin workspace mode id for upholstered / soft seating catalog (see backend ModeSeeder). */
export const CATALOG_SOFT_FURNITURE_MODE_ID = "mode-soft-furniture";

/**
 * True when the catalog row belongs to the Soft Furniture merchant mode — the only pillar where
 * fabric/upholstery materials are offered in planners and on the public PDP.
 */
export function catalogItemIsSoftFurnitureMode(item: {
  modeId?: string;
  mode_id?: string;
}): boolean {
  const raw = item as { mode_id?: string };
  return (item.modeId ?? raw.mode_id) === CATALOG_SOFT_FURNITURE_MODE_ID;
}

/**
 * Category tokens that indicate a soft / upholstered item.
 * Used with {@link catalogItemIsSoftFurnitureMode} so texture mode and PDP heuristics stay aligned.
 */
const UPHOLSTERY_CATEGORY_HINTS = [
  "seating",
  "sofa",
  "couch",
  "armchair",
  "chair",
  "bed",
  "ottoman",
  "pouf",
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
 * Returns true when the item's categories suggest it is an upholstered / soft-furniture piece,
 * even if `isFabricCustomizable` was never explicitly set on the item record.
 */
export function catalogItemIsUpholstery(item: {
  category: string;
  additionalCategories?: string[];
  allCategories?: string[];
}): boolean {
  const blob = catalogItemAllCategoryLabels(item).join(" ").toLowerCase();
  return UPHOLSTERY_CATEGORY_HINTS.some((h) => blob.includes(h));
}

/**
 * Category labels for storefront filters: primary + extras, or API `allCategories`.
 */
export function catalogItemAllCategoryLabels(item: {
  category: string;
  additionalCategories?: string[];
  allCategories?: string[];
}): string[] {
  if (item.allCategories && item.allCategories.length > 0) {
    return [...item.allCategories];
  }
  const extra = item.additionalCategories ?? [];
  const prim = item.category?.trim() ?? "";
  const merged = prim ? [prim, ...extra] : [...extra];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of merged) {
    const t = typeof s === "string" ? s.trim() : "";
    if (!t) continue;
    const lk = t.toLowerCase();
    if (seen.has(lk)) continue;
    seen.add(lk);
    out.push(t);
  }
  return out;
}

export function catalogItemMatchesCategoryFilter(
  item: { category: string; additionalCategories?: string[]; allCategories?: string[] },
  selectedNormalized: string,
): boolean {
  if (selectedNormalized === "all") return true;
  return catalogItemAllCategoryLabels(item).some(
    (label) => label.toLowerCase() === selectedNormalized,
  );
}
