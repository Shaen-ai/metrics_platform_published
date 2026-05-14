import type { PlannerCatalogItem } from "../types";
import type { GeneratedPlanItem } from "./applyGeneratedPlan";

const CATEGORY_SYNONYMS: Record<string, string[]> = {
  seating: ["sofa", "couch", "chair", "armchair", "bench", "stool", "ottoman", "pouf", "recliner", "loveseat", "sectional"],
  tables: ["table", "desk", "coffee table", "side table", "dining table", "console", "nightstand", "end table"],
  storage: ["shelf", "shelves", "bookcase", "cabinet", "dresser", "wardrobe", "sideboard", "credenza", "chest", "drawer", "buffet", "hutch", "rack"],
  lighting: ["lamp", "light", "chandelier", "pendant", "sconce", "floor lamp", "table lamp", "lantern"],
  beds: ["bed", "mattress", "headboard", "bunk", "daybed"],
  decor: ["rug", "carpet", "mirror", "vase", "plant", "art", "picture", "frame", "clock", "sculpture", "cushion", "pillow", "throw"],
};

function normalizeForComparison(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

function tokenize(s: string): string[] {
  return normalizeForComparison(s).split(/\s+/).filter(Boolean);
}

function getCategorySynonymGroup(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [group, synonyms] of Object.entries(CATEGORY_SYNONYMS)) {
    if (lower.includes(group)) return group;
    for (const syn of synonyms) {
      if (lower.includes(syn)) return group;
    }
  }
  return null;
}

function categoryCompatibility(extracted: GeneratedPlanItem, catalog: PlannerCatalogItem): number {
  const extractedGroup = getCategorySynonymGroup(
    `${extracted.name} ${extracted.category ?? ""}`,
  );
  const allCats = [
    catalog.category,
    ...(catalog.additionalCategories ?? []),
    ...(catalog.allCategories ?? []),
    catalog.name,
  ].join(" ");
  const catalogGroup = getCategorySynonymGroup(allCats);

  if (extractedGroup && catalogGroup && extractedGroup === catalogGroup) return 1;
  if (extractedGroup && catalogGroup && extractedGroup !== catalogGroup) return 0;
  return 0.3;
}

function nameOverlap(extractedName: string, catalogName: string): number {
  const aTokens = tokenize(extractedName);
  const bTokens = tokenize(catalogName);
  if (aTokens.length === 0 || bTokens.length === 0) return 0;

  let matchCount = 0;
  for (const tok of aTokens) {
    if (bTokens.some((b) => b.includes(tok) || tok.includes(b))) {
      matchCount++;
    }
  }
  return matchCount / Math.max(aTokens.length, bTokens.length);
}

function dimensionSimilarity(extracted: GeneratedPlanItem, catalog: PlannerCatalogItem): number {
  const ew = Number(extracted.width_m) || 0.8;
  const ed = Number(extracted.depth_m) || 0.6;
  const eh = Number(extracted.height_m) || 0.8;

  const dw = Math.abs(ew - catalog.width) / Math.max(ew, catalog.width, 0.01);
  const dd = Math.abs(ed - catalog.depth) / Math.max(ed, catalog.depth, 0.01);
  const dh = Math.abs(eh - catalog.height) / Math.max(eh, catalog.height, 0.01);

  const avgDiff = (dw + dd + dh) / 3;
  return Math.max(0, 1 - avgDiff);
}

export interface CatalogMatchResult {
  catalogItem: PlannerCatalogItem;
  score: number;
}

const MATCH_THRESHOLD = 0.35;

/**
 * Score a single catalog item against an extracted plan item.
 * Weights: category 30%, name 40%, dimensions 30%.
 */
function scoreMatch(extracted: GeneratedPlanItem, catalog: PlannerCatalogItem): number {
  const catScore = categoryCompatibility(extracted, catalog);
  const nameScore = nameOverlap(extracted.name, catalog.name);
  const dimScore = dimensionSimilarity(extracted, catalog);
  return catScore * 0.3 + nameScore * 0.4 + dimScore * 0.3;
}

/**
 * Find the best matching catalog item for an AI-extracted furniture piece.
 * Returns null if no item exceeds the confidence threshold.
 */
export function matchExtractedItemToCatalog(
  extracted: GeneratedPlanItem,
  catalog: PlannerCatalogItem[],
): CatalogMatchResult | null {
  if (catalog.length === 0) return null;

  let best: CatalogMatchResult | null = null;

  for (const item of catalog) {
    const score = scoreMatch(extracted, item);
    if (score > MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { catalogItem: item, score };
    }
  }

  return best;
}

/**
 * Match all extracted plan items to catalog products.
 * Each catalog item is used at most once (greedy best-first assignment).
 */
export function matchAllItemsToCatalog(
  extractedItems: GeneratedPlanItem[],
  catalog: PlannerCatalogItem[],
): Map<number, CatalogMatchResult> {
  const results = new Map<number, CatalogMatchResult>();
  const usedCatalogIds = new Set<string>();

  const scored: Array<{ extractedIdx: number; catalogItem: PlannerCatalogItem; score: number }> = [];

  for (let i = 0; i < extractedItems.length; i++) {
    for (const catItem of catalog) {
      const score = scoreMatch(extractedItems[i]!, catItem);
      if (score > MATCH_THRESHOLD) {
        scored.push({ extractedIdx: i, catalogItem: catItem, score });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);

  for (const entry of scored) {
    if (results.has(entry.extractedIdx)) continue;
    if (usedCatalogIds.has(entry.catalogItem.id)) continue;

    results.set(entry.extractedIdx, {
      catalogItem: entry.catalogItem,
      score: entry.score,
    });
    usedCatalogIds.add(entry.catalogItem.id);
  }

  return results;
}
