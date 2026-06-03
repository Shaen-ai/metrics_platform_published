import type { RoomAnalysis } from "@/lib/interiorDesignPrompts";
import {
  normalizeInteriorDesignCoverage,
  type InteriorDesignCatalogCoverage,
  buildCoverageInstructionParagraph,
  estimateInteriorFurniturePieceBudget,
  targetCatalogAnchoredPieces,
  targetDistinctCatalogSkusForPrompt,
} from "@/lib/interiorDesignCatalog";
import { publicApiUrl } from "@/lib/publicEnv";

export interface CatalogItemSummary {
  id: string;
  name: string;
  category: string;
  /** Truncated for prompt density */
  descriptionSnippet?: string;
  width_cm: number;
  depth_cm: number;
  height_cm: number;
  price: number;
  currency: string;
  /** First storefront image absolute URL when available */
  primaryImageUrl?: string | null;
  productFamily?: string | null;
  productSubtype?: string | null;
}

const MAX_ROWS_IN_CREATIVE_PROMPT = 96;
const GEMINI_MERCHANT_LINES_MAX_CHARS = 1200;

function corpusTokens(userPrompt: string, roomAnalysis?: RoomAnalysis | null): Set<string> {
  const corpus = `${userPrompt} ${roomAnalysis?.room_type ?? ""} ${roomAnalysis?.current_style ?? ""} ${roomAnalysis?.suggestions?.join(" ") ?? ""}`;
  const out = new Set<string>();
  for (const w of corpus.toLowerCase().split(/[^a-z0-9а-яА-ЯёЁ%+]+/).filter(Boolean)) {
    if (w.length >= 3) out.add(w);
  }
  return out;
}

function truncateOneLine(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

/** Resolve relative storage URLs against API origin when needed. */
function absolutizePossibleUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const u = raw.trim();
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/")) {
    try {
      return new URL(u, `${publicApiUrl}`).href;
    } catch {
      return u;
    }
  }
  return u;
}

function rawItemToSummary(item: Record<string, unknown>): CatalogItemSummary {
  const sz = item.sizes ?? item.dimensions;
  const sizes =
    typeof sz === "object" && sz !== null ? (sz as Record<string, unknown>) : {};

  const imgsUnknown = item.images;
  const imgs = Array.isArray(imgsUnknown) ? imgsUnknown : [];
  const primary = typeof imgs[0] === "string" ? imgs[0] : "";

  const descRaw = typeof item.description === "string" ? item.description.trim() : "";

  const idVal = item.id !== undefined ? String(item.id).trim() : "";

  const pf = item.productFamily ?? item.product_family;
  const ps = item.productSubtype ?? item.product_subtype;

  return {
    id: idVal,
    name: typeof item.name === "string" && item.name.trim() ? item.name : "Item",
    category: typeof item.category === "string" ? item.category : "",
    descriptionSnippet: descRaw ? truncateOneLine(descRaw, 160) : undefined,
    width_cm: Math.round(Number(sizes.width) || 0),
    depth_cm: Math.round(Number(sizes.depth) || 0),
    height_cm: Math.round(Number(sizes.height) || 0),
    price: Number(item.price) || 0,
    currency: typeof item.currency === "string" && item.currency ? item.currency : "AMD",
    primaryImageUrl: absolutizePossibleUrl(primary),
    productFamily: typeof pf === "string" && pf.trim() ? pf.trim() : null,
    productSubtype: typeof ps === "string" && ps.trim() ? ps.trim() : null,
  };
}

function scoreSummary(s: CatalogItemSummary, tokens: Set<string>): number {
  if (!tokens.size) return 0;
  const hay = `${s.name} ${s.category} ${s.descriptionSnippet ?? ""}`.toLowerCase();
  let sc = 0;
  for (const t of tokens) {
    if (hay.includes(t)) sc += 2;
  }
  return sc;
}

function dedupePreserveOrder(ids: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const k = String(id).trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/**
 * Loads tenant-facing admin JSON (coverage + storefront flags).
 */
export async function fetchPublicAdminInteriorDesignCoverage(
  adminSlug: string,
): Promise<{ coverage: InteriorDesignCatalogCoverage }> {
  try {
    const res = await fetch(
      `${publicApiUrl}/public/${encodeURIComponent(adminSlug)}`,
      { cache: "no-store", headers: { Accept: "application/json" } },
    );
    if (!res.ok) return { coverage: normalizeInteriorDesignCoverage(null) };
    const json = await res.json();
    const blob = json?.data?.interiorDesignCatalogCoverage ?? json?.data?.interior_design_catalog_coverage;
    return { coverage: normalizeInteriorDesignCoverage(blob) };
  } catch {
    return { coverage: normalizeInteriorDesignCoverage(null) };
  }
}

/**
 * Loads active catalog merged with optional library tier; passes `interior_design_ai`
 * so rows flagged `forDesign` participate in prompting.
 */
export async function fetchRawCatalogItemsForInteriorDesignAi(adminSlug: string): Promise<CatalogItemSummary[]> {
  try {
    const params = new URLSearchParams({
      include_library: "1",
      interior_design_ai: "1",
    });
    const res = await fetch(
      `${publicApiUrl}/public/${encodeURIComponent(adminSlug)}/catalog?${params.toString()}`,
      { cache: "no-store", headers: { Accept: "application/json" } },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: unknown };
    const itemsUnknown = json.data;
    const items = Array.isArray(itemsUnknown) ? itemsUnknown : [];
    return items
      .filter((row): row is Record<string, unknown> =>
        typeof row === "object" && row !== null && !Array.isArray(row),
      )
      .map(rawItemToSummary)
      .filter((r) => r.id);
  } catch {
    return [];
  }
}

export interface InteriorDesignCatalogContext {
  coverage: InteriorDesignCatalogCoverage;
  estimatedPieces: number;
  anchoredPieces: number;
  distinctRequired: number;
  summariesForDirector: CatalogItemSummary[];
  catalogTextForClaude: string;
  coverageInstructions: string;
  summaryById: Map<string, CatalogItemSummary>;
}

export async function buildInteriorDesignCatalogContext(options: {
  adminSlug: string;
  textPrompt: string;
  roomAnalysis?: RoomAnalysis | null;
  preferredCatalogIds?: string[];
  /** When set, skips public admin fetch (e.g. tests). */
  coverageOverride?: InteriorDesignCatalogCoverage;
}): Promise<InteriorDesignCatalogContext> {
  const { adminSlug, textPrompt, roomAnalysis, preferredCatalogIds, coverageOverride } = options;

  const coverage =
    coverageOverride ??
    ((await fetchPublicAdminInteriorDesignCoverage(adminSlug)).coverage ??
      normalizeInteriorDesignCoverage(null));

  const pinned = dedupePreserveOrder(preferredCatalogIds ?? []);
  const allRows = await fetchRawCatalogItemsForInteriorDesignAi(adminSlug);

  /** Admin-only SKU pins that are missing still get ignored (graceful when stale id). */
  const pinnedSummaries = pinned
    .map((id) => allRows.find((r) => r.id === id))
    .filter((x): x is CatalogItemSummary => Boolean(x));

  const tokens = corpusTokens(textPrompt, roomAnalysis);
  const pinnedSet = new Set(pinned);
  const rest = allRows.filter((r) => !pinnedSet.has(r.id));
  rest.sort((a, b) => {
    const sa = scoreSummary(a, tokens);
    const sb = scoreSummary(b, tokens);
    if (sb !== sa) return sb - sa;
    return String(a.name).localeCompare(String(b.name));
  });

  const ranked = [...pinnedSummaries, ...rest].slice(0, MAX_ROWS_IN_CREATIVE_PROMPT);
  const estimatedPieces = estimateInteriorFurniturePieceBudget(roomAnalysis);
  const distinctRequired = targetDistinctCatalogSkusForPrompt(
    coverage,
    estimatedPieces,
    ranked.length || allRows.length,
  );
  const anchoredPieces = targetCatalogAnchoredPieces(coverage, estimatedPieces);

  const coverageInstructions = buildCoverageInstructionParagraph(
    coverage,
    distinctRequired,
    anchoredPieces,
    estimatedPieces,
    allRows.length,
  );

  const catalogTextForClaude =
    ranked.length === 0
      ? ""
      : `\nDistinct SKUs surfaced for this Creative Director window: ${ranked.length} of ${allRows.length} merchant items (preference-ranked from user brief + optional pins).\n`

  const catalogTextBody = ranked.length === 0 ? "" : catalogSummaryToPromptText(ranked);

  return {
    coverage,
    estimatedPieces,
    anchoredPieces,
    distinctRequired,
    summariesForDirector: ranked,
    catalogTextForClaude: ranked.length === 0 ? "" : `${catalogTextForClaude}${catalogTextBody}`,
    coverageInstructions,
    summaryById: new Map(allRows.map((x) => [x.id, x])),
  };
}

/**
 * One line each — compact for Claude prompts.
 */
export function catalogSummaryToPromptText(items: CatalogItemSummary[]): string {
  if (!items.length) return "";
  return items
    .map((i) => {
      let line = `- [${i.id}] "${i.name}" (${i.category}) ${i.width_cm}×${i.depth_cm}×${i.height_cm} cm, ${i.price} ${i.currency}`;
      if (i.descriptionSnippet) line += ` — ${truncateOneLine(i.descriptionSnippet, 220)}`;
      return line;
    })
    .join("\n");
}

/**
 * Gemini appendix block from Structured Creative picks.
 */
export function buildGeminiMerchantFurnitureCatalogBlock(
  selectedIds: string[],
  byId: Map<string, CatalogItemSummary>,
  coverage?: InteriorDesignCatalogCoverage | null,
): string {
  const ids = dedupePreserveOrder(selectedIds).slice(0, 48);
  if (!ids.length) return "";

  const is100Percent = coverage && coverage.mode === "percent" && coverage.value >= 100;
  const isCountMode = coverage && coverage.mode === "count";
  const isStrict = is100Percent || isCountMode;

  const header = isStrict
    ? `\nMERCHANT CATALOG — STRICT MODE (100% catalog furniture):\nEVERY piece of furniture in the output image MUST be one of these catalog products. Do NOT add ANY furniture, seating, tables, storage, lighting fixtures, or decorative objects that are not listed below. If a furniture type is needed but no catalog match exists, LEAVE THAT SPOT EMPTY — show only the designed walls, floor, and ceiling in that area. The room should contain ONLY catalog items below plus wall/floor/ceiling finishes, curtains, rugs, and small decor (vases, plants, art).\n`
    : `\nMERCHANT CATALOG PRODUCTS — match visible furniture to these (${ids.length} SKUs):\n`;

  let body = header;
  let total = body.length;

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) continue;
    const line = `- "${row.name}" [${row.id}] (${row.category}, ~${row.width_cm}×${row.depth_cm}×${row.height_cm} cm)${row.descriptionSnippet ? ` — ${row.descriptionSnippet}` : ""}`;
    const nextLen = total + line.length + 1;
    if (nextLen > (isStrict ? GEMINI_MERCHANT_LINES_MAX_CHARS + 600 : GEMINI_MERCHANT_LINES_MAX_CHARS)) break;
    body += `${line}\n`;
    total = nextLen;
  }

  if (isStrict) {
    body += `\nREPEAT: No furniture beyond this list. A beautifully designed but sparsely furnished room is BETTER than a room with non-catalog furniture.\n`;
  }

  return `${body}`;
}

const MAX_REFERENCE_PRODUCT_FETCH = 3;

export async function fetchProductImagePartsForGemini(ids: string[], byId: Map<string, CatalogItemSummary>) {
  const parts: Array<{ inlineData: { mimeType: string; data: string } }> = [];
  for (const id of dedupePreserveOrder(ids).slice(0, MAX_REFERENCE_PRODUCT_FETCH)) {
    const row = byId.get(id);
    const url = row?.primaryImageUrl;
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const got = await tryFetchImageInline(url);
    if (got) parts.push({ inlineData: got });
    if (parts.length >= MAX_REFERENCE_PRODUCT_FETCH) break;
  }
  return parts;
}

async function tryFetchImageInline(url: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8500);
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    if (!res.ok || res.status >= 400) return null;

    const contentTypeRaw = res.headers.get("content-type") || "";
    let mime =
      /image\/(jpeg|jpg|png|webp)/i.exec(contentTypeRaw)?.[1]?.toLowerCase() ??
      (/\.png(\?|$)/i.test(url) ? "png" : /\.webp(\?|$)/i.test(url) ? "webp" : "jpeg");
    if (mime === "jpg") mime = "jpeg";

    const arr = await res.arrayBuffer();
    /** ~900 KB decoded budget */
    if (arr.byteLength > 900_000) return null;

    return {
      mimeType: `image/${mime}`,
      data: Buffer.from(arr).toString("base64"),
    };
  } catch {
    return null;
  }
}

/** Legacy name — callers use richer context internally. */
export async function fetchCatalogSummary(adminSlug: string): Promise<CatalogItemSummary[]> {
  const ctx = await buildInteriorDesignCatalogContext({
    adminSlug,
    textPrompt: "",
    roomAnalysis: null,
    preferredCatalogIds: [],
  });
  return ctx.summariesForDirector;
}

/**
 * Coverage instructions when the user explicitly pinned catalog products.
 * Overrides the merchant percent/count rules to ensure only pinned SKUs appear.
 */
export function buildPinsOnlyCoverageInstructions(
  pinnedSummaries: CatalogItemSummary[],
): string {
  if (pinnedSummaries.length === 0) return "";

  const idList = pinnedSummaries.map((s) => `"${s.name}" [${s.id}]`).join(", ");
  return `
CATALOG COVERAGE — PINS-ONLY MODE (user selected ${pinnedSummaries.length} specific product(s)):
The user hand-picked exactly these products: ${idList}.
"selected_catalog_ids" MUST contain ONLY these ${pinnedSummaries.length} id(s) — do NOT add any other catalog SKU ids.
In the fullPrompt and arrangement, mention ONLY these products by name. Do NOT introduce other catalog furniture.
If the room needs more furniture than provided, describe empty/open space — do NOT invent or add unpinned products.
If the user wants the same product placed multiple times, repeat its name in different positions in the arrangement.`;
}
