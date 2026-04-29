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
