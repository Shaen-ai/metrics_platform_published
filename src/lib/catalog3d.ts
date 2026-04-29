import type { CatalogItem } from "@/lib/types";

/** How to present catalog 3D in the UI (tabs, grid, viewer). */
export type Catalog3dPresentation = "none" | "generating" | "failed" | "viewer";

export function getCatalog3dPresentation(item: CatalogItem): Catalog3dPresentation {
  const url = item.modelUrl?.trim();
  if (!url) return "none";
  const s = item.modelStatus?.toLowerCase?.()?.trim() ?? "";
  if (s === "failed") return "failed";
  if (s === "queued" || s === "processing") return "generating";
  return "viewer";
}
