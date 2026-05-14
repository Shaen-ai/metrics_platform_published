import type { Material } from "./types";
import { materialTypeSlugs } from "@/app/planner/sheet/sheetSpec";
import { buildDefaultPlannerLaminates } from "./defaultPlannerMaterials";

/** All category slugs for a material (multi-category aware). */
export function materialCategorySlugs(m: Material): string[] {
  const raw = m.categories?.length ? m.categories : [m.category];
  return raw
    .filter((c): c is string => typeof c === "string" && c.trim() !== "")
    .map((c) => c.toLowerCase());
}

/**
 * Admin material conventions (IKEA-like roles):
 * - `category` / `categories`: `surface` | `frame` | `finish` — cabinet frame / carcass finishes
 * - `worktop` or `type`: `worktop` — worktop-only finishes (hybrid with built-in presets)
 * - Kitchen cabinet boards: all four types. Wardrobe omits **worktop-only** rows (`isWardrobeBoardFinishMaterial`).
 */
export function isWorktopMaterial(m: Material): boolean {
  const types = materialTypeSlugs(m).map((x) => x.toLowerCase());
  const cats = materialCategorySlugs(m);
  return types.includes("worktop") || cats.some((c) => c === "worktop" || c.includes("worktop"));
}

/** Materials shown as cabinet frame / body swatches in kitchen & wardrobe */
export function isFrameOrSurfaceMaterial(m: Material): boolean {
  return materialCategorySlugs(m).some((c) =>
    c === "surface" || c === "frame" || c === "finish",
  );
}

/** Wardrobe door panel finishes — category `door` (dedicated door rows in admin). */
export function isDoorFrontMaterial(m: Material): boolean {
  return materialCategorySlugs(m).includes("door");
}

/** Finishes the planners treat as board / sheet stock (not slide/hinge hardware). */
const PLANNER_CABINET_SURFACE_TYPES = new Set(["laminate", "mdf", "wood", "worktop"]);

/**
 * `type` / `types` is one of laminate, mdf, wood, worktop — what admins can assign for cabinet/door swatches.
 */
export function isPlannerCabinetSurfaceType(m: { type: string; types?: string[] }): boolean {
  return materialTypeSlugs(m).some((t) => PLANNER_CABINET_SURFACE_TYPES.has(t.toLowerCase()));
}

/**
 * Sliding door track / roller systems. Admins create materials with `type` `slide`
 * (typically `category` `hardware`).
 */
export function isSlidingMechanismMaterial(m: Material): boolean {
  return materialTypeSlugs(m).some((t) => t.toLowerCase() === "slide");
}

/**
 * True when every type slug on the row is `worktop` — countertop exclusives Wardrobe hides
 * (kitchen still surfaces them via the worktop picker). Rows tagged laminate + worktop stay visible.
 */
export function isWorktopOnlySurfaceMaterial(m: { type: string; types?: string[] }): boolean {
  const slugs = materialTypeSlugs(m)
    .map((t) => t.toLowerCase())
    .filter((t): t is string => t.trim() !== "");
  if (!slugs.length) return false;
  return slugs.every((t) => t === "worktop");
}

/**
 * Board / sheet materials for carcass and door swatches: type laminate, mdf, wood, or
 * worktop. Does not require a specific `category` — anything mis-tagged in admin still
 * appears. Sliding systems (type `slide`) are excluded.
 */
export function isBoardFinishMaterial(m: Material): boolean {
  if (isSlidingMechanismMaterial(m)) return false;
  return isPlannerCabinetSurfaceType(m);
}

/**
 * Wardrobe frame/carcass: boards (laminate, mdf, wood) but omits **worktop-only** lines (countertops stay in Kitchen).
 * Sliding track rows (`type` slide) stay out of the carcass list — they appear under door hardware instead.
 */
export function isWardrobeBoardFinishMaterial(m: Material): boolean {
  return isBoardFinishMaterial(m) && !isWorktopOnlySurfaceMaterial(m);
}

/** `type` slugs for the wardrobe Door finish picker: boards + slide / hinge product lines. */
const WARDROBE_DOOR_FINISH_TYPE_SLUGS = new Set([
  "laminate",
  "mdf",
  "wood",
  "slide",
  "hinge",
]);

/**
 * Wardrobe door face swatches: laminate, mdf, wood, and optionally slide / hinge-typed admin rows
 * (worktop-only lines stay hidden here — use kitchen for countertops).
 */
export function isWardrobeDoorFinishMaterial(m: Material): boolean {
  if (isWorktopOnlySurfaceMaterial(m)) return false;
  return materialTypeSlugs(m).some((t) => WARDROBE_DOOR_FINISH_TYPE_SLUGS.has(t.toLowerCase()));
}

/**
 * Door/drawer handle finishes for planners.
 * - Preferred: `type` `handle` (when the admin supports it).
 * - Fallback: **`category` or `categories` includes `handle`** — use this when there is no handle type in the admin UI.
 * `imageUrl` drives swatch + 3D texture; optional extra tag `hardware` is fine but not required for detection.
 */
export function isHandleMaterial(m: Material): boolean {
  if (materialTypeSlugs(m).some((t) => t.toLowerCase() === "handle")) return true;
  return materialCategorySlugs(m).some((c) => c === "handle");
}

type RoughnessMap = Record<string, number>;
const ROUGHNESS_BY_TYPE: RoughnessMap = {
  laminate: 0.85,
  mdf: 0.88,
  wood: 0.7,
  metal: 0.3,
  glass: 0.15,
  stone: 0.6,
  fabric: 0.95,
  paper: 0.94,
  boucle: 0.96,
  plastic: 0.5,
  leather: 0.75,
  handle: 0.35,
  slide: 0.35,
  hinge: 0.38,
};
const METALNESS_BY_TYPE: RoughnessMap = {
  metal: 0.7,
  glass: 0.1,
  handle: 0.65,
  slide: 0.6,
  hinge: 0.55,
};
const SURFACE_BY_TYPE: Record<string, "wood" | "matte" | "gloss" | "stone" | "metal" | "glass"> = {
  wood: "wood",
  laminate: "matte",
  mdf: "matte",
  metal: "gloss",
  glass: "glass",
  stone: "stone",
  fabric: "matte",
  paper: "matte",
  plastic: "gloss",
  boucle: "matte",
  leather: "matte",
  handle: "metal",
  slide: "metal",
  hinge: "metal",
};

/** Prefer sheet-stock slugs first so mixed-type rows still read as laminates/boards for packers / PBR. */
const PRIMARY_SURFACE_ORDER = ["laminate", "mdf", "wood", "worktop"] as const;

function primaryPlannerSurfaceSlug(types: string[], fallbackType: string): string {
  const trimmed = types.map((t) => String(t).trim()).filter(Boolean);
  const lowered = trimmed.map((t) => t.toLowerCase());
  for (const board of PRIMARY_SURFACE_ORDER) {
    const i = lowered.indexOf(board);
    if (i !== -1) return lowered[i]!;
  }
  for (let i = 0; i < lowered.length; i++) {
    const k = lowered[i]!;
    if (k in ROUGHNESS_BY_TYPE) return k;
  }
  const fb = String(fallbackType ?? "").trim().toLowerCase();
  return fb || "laminate";
}

export interface PlannerSwatchMaterial {
  id: string;
  name: string;
  color: string;
  roughness: number;
  metalness: number;
  priceMultiplier: number;
  imageUrl?: string;
  pricePerSqm?: number;
  manufacturer?: string;
  surfaceType?: "wood" | "matte" | "gloss" | "stone" | "metal" | "glass";
  /**
   * Laminate/wood/worktop sheet metadata, propagated from the admin catalog.
   * Consumers that don't need it may ignore these fields.
   */
  sheetWidthCm?: number;
  sheetHeightCm?: number;
  grainDirection?: "along_width" | "along_height" | "none";
  kerfMm?: number;
  materialType?: string;
  /** When the admin assigned multiple catalog types (e.g. laminate + MDF). */
  materialTypes?: string[];
  /** Primary catalog role (surface, frame, door, …) for UI grouping. */
  categoryKey?: string;
  /** Visible repeat / tile on the swatch photo (cm); used for GLB upholstery tiling. */
  textureWidthCm?: number | null;
  textureHeightCm?: number | null;
}

function mapMaterial(
  m: Material,
  cheapest: number,
  manufacturerName?: string,
): PlannerSwatchMaterial {
  const types = materialTypeSlugs(m);
  const primary = primaryPlannerSurfaceSlug(types, m.type);

  const hex =
    (typeof m.colorCode === "string" && m.colorCode.trim() !== ""
      ? m.colorCode
      : typeof m.color === "string" && m.color.trim() !== ""
        ? m.color
        : "#cccccc");

  const rowBrand = typeof m.manufacturer === "string" && m.manufacturer.trim() !== "" ? m.manufacturer.trim() : undefined;
  return {
    id: m.id,
    name: m.name,
    color: /^#?[0-9a-fA-F]{6}$/.test(hex.trim())
      ? hex.trim().startsWith("#")
        ? hex.trim()
        : `#${hex.trim()}`
      : "#cccccc",
    roughness: ROUGHNESS_BY_TYPE[primary] ?? 0.8,
    metalness: METALNESS_BY_TYPE[primary] ?? 0,
    priceMultiplier: cheapest > 0 ? m.pricePerUnit / cheapest : 1,
    imageUrl: m.imageUrl,
    pricePerSqm: m.pricePerUnit,
    /** Decor brand (catalog row); when absent, the public site may show the admin company as fallback. */
    manufacturer: rowBrand ?? (manufacturerName && manufacturerName.trim() !== "" ? manufacturerName : undefined),
    surfaceType: SURFACE_BY_TYPE[primary] ?? "matte",
    sheetWidthCm: m.sheetWidthCm,
    sheetHeightCm: m.sheetHeightCm,
    grainDirection: m.grainDirection,
    kerfMm: m.kerfMm,
    materialType: primary,
    materialTypes: types,
    categoryKey: materialCategoryKey(m),
    textureWidthCm: m.textureWidthCm,
    textureHeightCm: m.textureHeightCm,
  };
}

function materialCategoryKey(m: Material): string {
  const raw = m.categories?.[0] ?? m.category ?? "";
  const k = String(raw).trim().toLowerCase();
  return k || "other";
}

export type MaterialsFromStoreOptions = {
  /** When true, omit worktop-only materials from frame lists (wardrobe only; kitchen omits this flag). */
  forWardrobe?: boolean;
};

/**
 * Frame / carcass board finishes. Pass `{ forWardrobe: true }` from the wardrobe
 * planner; kitchen omits the option so worktop rows stay in cabinet lists.
 */
export function materialsFromStore(
  storeMaterials: Material[],
  manufacturerName?: string,
  options?: MaterialsFromStoreOptions,
): PlannerSwatchMaterial[] {
  const pick = options?.forWardrobe ? isWardrobeBoardFinishMaterial : isBoardFinishMaterial;
  const surface = storeMaterials.filter((m) => pick(m));
  if (surface.length === 0) return [];
  const cheapest = Math.min(...surface.map((m) => m.pricePerUnit));
  return surface.map((m) => mapMaterial(m, cheapest, manufacturerName));
}

/**
 * Door panel swatches for wardrobe (see `isWardrobeDoorFinishMaterial`).
 */
export function doorFrontMaterialsFromStore(
  storeMaterials: Material[],
  manufacturerName?: string,
): PlannerSwatchMaterial[] {
  const source = storeMaterials.filter(isWardrobeDoorFinishMaterial);
  if (source.length === 0) return [];
  const cheapest = Math.min(...source.map((m) => m.pricePerUnit));
  return source.map((m) => mapMaterial(m, cheapest, manufacturerName));
}

export function slidingMechanismsFromStore(
  storeMaterials: Material[],
  manufacturerName?: string,
): PlannerSwatchMaterial[] {
  const items = storeMaterials.filter(isSlidingMechanismMaterial);
  if (items.length === 0) return [];
  const cheapest = Math.min(...items.map((m) => m.pricePerUnit));
  return items.map((m) => mapMaterial(m, cheapest, manufacturerName));
}

export function handleMaterialsFromStore(
  storeMaterials: Material[],
  manufacturerName?: string,
): PlannerSwatchMaterial[] {
  const items = storeMaterials.filter(isHandleMaterial);
  if (items.length === 0) return [];
  const cheapest = Math.min(...items.map((m) => m.pricePerUnit));
  return items.map((m) => mapMaterial(m, cheapest, manufacturerName));
}

/**
 * Worktop finishes from admin when `type` or `category` marks worktops.
 * Used alongside built-in COUNTERTOP presets in Kitchen Designer.
 */
export function worktopMaterialsFromStore(
  storeMaterials: Material[],
  manufacturerName?: string,
): PlannerSwatchMaterial[] {
  const w = storeMaterials.filter(isWorktopMaterial);
  if (w.length === 0) return [];
  const cheapest = Math.min(...w.map((m) => m.pricePerUnit));
  return w.map((m) => mapMaterial(m, cheapest, manufacturerName));
}

/** Building / hard-finish catalog — never offer as sofa / ottoman fabric. */
const BUILDING_SUB_MODE_IDS = new Set([
  "sub-building-doors",
  "sub-building-windows-glazing",
  "sub-building-flooring",
  "sub-building-wall-finishes",
  "sub-building-ceiling-materials",
  "sub-building-plinth",
]);

const MATERIAL_MODE_BUILDING = "mode-building-materials";

/**
 * True when a category slug belongs to architectural / hard finishes (e.g. `building-flooring-ceramic`).
 * Avoid treating `textile` as tile via naive substring checks.
 */
function materialCategoryMarksHardSurface(cat: string): boolean {
  const k = cat.toLowerCase().trim();
  if (k === "textile" || k === "textiles") return false;

  const blockedPhrases = [
    "building",
    "flooring",
    "ceramic",
    "porcelain",
    "parquet",
    "wall-finishes",
    "wall_finishes",
    "ceiling-material",
    "plinth",
    "windows-glazing",
    "windows_glazing",
  ];
  if (blockedPhrases.some((p) => k.includes(p))) return true;

  const tokens = k.split(/[-_/]+/).filter(Boolean);
  return tokens.some((t) => t === "tile" || t === "tiles");
}

/** Non-textile material types for surfaces — never counted as upholstery. */
const HARD_SURFACE_TYPE_SLUGS = new Set([
  "ceramic",
  "porcelain",
  "tile",
  "stone",
  "glass",
  "metal",
  "laminate",
  "mdf",
  "wood",
  "worktop",
  "paper",
]);

/** Type slugs for textile / soft seating finishes (storefront + planners). */
const UPHOLSTERY_RELATED_TYPE_SLUGS = new Set([
  "fabric",
  "leather",
  "boucle",
  "textile",
  "velvet",
  "chenille",
  "suede",
  "microfiber",
  "microfibre",
  "wool",
  "linen",
  "cotton",
  "upholstery",
  "mesh",
  "vinyl",
  "plastic",
]);

/** Category slugs that positively identify textile upholstery (exact-ish; avoids `building-*` false positives). */
const UPHOLSTERY_TEXTILE_CATEGORY_SLUGS = new Set([
  "upholstery",
  "textile",
  "textiles",
  "fabrics",
  "fabric",
  "velvet",
  "chenille",
  "boucle",
  "bouclé",
  "leather",
  "suede",
  "soft-furniture",
  "soft_furniture",
]);

export function materialReadsAsBuildingOrHardSurface(m: Material): boolean {
  const modeAware = m as Material & { modeId?: string };
  if (modeAware.modeId === MATERIAL_MODE_BUILDING) return true;

  /**
   * Admins often leave `sub_mode_id` on a building sub-mode while the row is real upholstery
   * (`category` upholstery / textile). Those must still appear on soft-furniture PDPs.
   * Wall coverings stay excluded: their categories match `materialCategoryMarksHardSurface`.
   */
  if (materialLooksLikeDedicatedUpholsteryOrSoftTextile(m)) return false;

  if (m.subModeId && BUILDING_SUB_MODE_IDS.has(m.subModeId)) return true;
  for (const c of materialCategorySlugs(m)) {
    if (materialCategoryMarksHardSurface(c)) return true;
  }
  if (materialTypeSlugs(m).some((t) => HARD_SURFACE_TYPE_SLUGS.has(t.toLowerCase()))) return true;
  return false;
}

/** True when the row is clearly sofa/upholstery catalog, not wallpaper/tile/flooring. */
function materialLooksLikeDedicatedUpholsteryOrSoftTextile(m: Material): boolean {
  const cats = materialCategorySlugs(m);
  if (cats.some((c) => UPHOLSTERY_TEXTILE_CATEGORY_SLUGS.has(c.trim().toLowerCase()))) {
    return true;
  }
  if (materialTypeSlugs(m).some((t) => UPHOLSTERY_RELATED_TYPE_SLUGS.has(t.toLowerCase()))) {
    return !cats.some((c) => materialCategoryMarksHardSurface(c));
  }
  return false;
}

const SOFT_FURNITURE_MODE_ID = "mode-soft-furniture";

/** Sub-modes under Soft Furniture where decor rows are normally textiles / foam / etc. */
const SOFT_FURNITURE_MATERIAL_SUB_MODE_IDS = new Set([
  "sub-sofas",
  "sub-armchairs",
  "sub-ottomans",
  "sub-mattresses",
  "sub-headboards",
]);

export function isUpholsteryFabricMaterial(m: Material): boolean {
  if (materialReadsAsBuildingOrHardSurface(m)) return false;

  if (materialTypeSlugs(m).some((t) => UPHOLSTERY_RELATED_TYPE_SLUGS.has(t.toLowerCase()))) {
    return true;
  }

  return materialCategorySlugs(m).some((c) => {
    const k = c.trim().toLowerCase();
    return UPHOLSTERY_TEXTILE_CATEGORY_SLUGS.has(k);
  });
}

/**
 * Public catalog product detail: upholstery swatch sources.
 * Soft-furniture PDPs (or materials tagged in the soft-furniture catalog) include generic decor rows
 * once building/tile/board/slide/handle exclusions apply — fixes “no swatches” when type is left as surface/finish.
 */
function isCatalogFabricSwatchMaterial(m: Material, catalogItemModeId?: string): boolean {
  if (materialReadsAsBuildingOrHardSurface(m)) return false;
  if (isUpholsteryFabricMaterial(m)) return true;

  const modeAware = m as Material & { modeId?: string };
  const materialTaggedSoft =
    modeAware.modeId === SOFT_FURNITURE_MODE_ID ||
    (m.subModeId !== undefined && SOFT_FURNITURE_MATERIAL_SUB_MODE_IDS.has(m.subModeId));

  if (materialTaggedSoft || catalogItemModeId === SOFT_FURNITURE_MODE_ID) {
    if (isBoardFinishMaterial(m) || isSlidingMechanismMaterial(m) || isHandleMaterial(m)) return false;
    return true;
  }

  return false;
}

export function fabricPartAllowedMaterialIds(part: {
  allowedMaterialIds?: string[] | null;
  allowed_material_ids?: string[] | null;
}): string[] | null {
  if (part.allowedMaterialIds !== undefined) {
    return part.allowedMaterialIds;
  }
  if (part.allowed_material_ids !== undefined) {
    return part.allowed_material_ids;
  }
  return null;
}

/**
 * Textile / upholstery rows for the public catalog PDP only — never board stock, tiles, or building materials.
 */
export function catalogFabricSwatchSourceMaterials(
  item: {
    isFabricCustomizable?: boolean;
    /** Catalog item mode; soft-furniture PDP widens to non-board decor after building/tile exclusions. */
    modeId?: string;
    fabricParts?: Array<{
      allowedMaterialIds?: string[] | null;
      allowed_material_ids?: string[] | null;
    }> | null;
  } | null,
  storeMaterials: Material[],
): Material[] {
  if (!item?.isFabricCustomizable) return [];

  const catMode = item.modeId;
  const textile = (rows: Material[]) => rows.filter((m) => isCatalogFabricSwatchMaterial(m, catMode));

  const parts = item.fabricParts;
  const baseList = textile(storeMaterials);

  if (!parts?.length) {
    return baseList;
  }

  const union = new Set<string>();
  let anyExplicitList = false;
  for (const p of parts) {
    const ids = fabricPartAllowedMaterialIds(p);
    if (ids === null) continue;
    anyExplicitList = true;
    for (const id of ids) union.add(id);
  }
  if (anyExplicitList && union.size > 0) {
    const picked = textile(storeMaterials.filter((m) => union.has(m.id)));
    if (picked.length > 0) return picked;
  }

  const allPartsUnrestricted = parts.every((p) => fabricPartAllowedMaterialIds(p) === null);
  if (allPartsUnrestricted) {
    return baseList;
  }
  return [];
}

/** Map an arbitrary material subset to planner-style swatches (price multipliers vs cheapest in list). */
export function plannerSwatchesFromMaterialList(
  items: Material[],
  manufacturerName?: string,
): PlannerSwatchMaterial[] {
  if (items.length === 0) return [];
  const cheapest = Math.min(...items.map((m) => m.pricePerUnit));
  return items.map((m) => mapMaterial(m, cheapest, manufacturerName));
}

/**
 * Soft seating / upholstery swatches (fabric, leather, Bouclé, or category upholstery).
 */
export function upholsteryMaterialsFromStore(
  storeMaterials: Material[],
  manufacturerName?: string,
): PlannerSwatchMaterial[] {
  return plannerSwatchesFromMaterialList(
    storeMaterials.filter(isUpholsteryFabricMaterial),
    manufacturerName,
  );
}

/** When the filtered catalog has no board/laminate rows, prepend built-in starter laminates bound to this admin.
 * Does not inject starters when `plannerMaterialIds` is a non-empty allow-list (explicit curator control). */
export function mergeDefaultBoardMaterialsWhenMissing(
  filteredMaterials: Material[],
  adminId: string | undefined,
  predicate: (m: Material) => boolean,
  plannerMaterialIds?: string[] | null,
): Material[] {
  if (filteredMaterials.some(predicate)) return filteredMaterials;
  if (plannerMaterialIds != null && plannerMaterialIds.length > 0) {
    return filteredMaterials;
  }
  const boundId = adminId?.trim() || "published-default";
  const defaults = buildDefaultPlannerLaminates(boundId);
  const ids = new Set(filteredMaterials.map((m) => m.id));
  return [...defaults.filter((d) => !ids.has(d.id)), ...filteredMaterials];
}

/**
 * When non-empty, restricts planner material lists to these catalog ids.
 * Null, undefined, or empty array means use all materials (default).
 * If the whitelist matches nothing (stale config / template library), all materials are shown.
 */
export function filterMaterialsForPlanner(
  materials: Material[],
  allowedIds?: string[] | null,
): Material[] {
  if (allowedIds == null || allowedIds.length === 0) return materials;
  const set = new Set(allowedIds);
  const filtered = materials.filter((m) => set.has(m.id));
  if (filtered.length === 0) return materials;
  return filtered;
}
