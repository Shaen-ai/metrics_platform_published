import type { Material } from "./types";
import { materialTypeSlugs } from "@/app/planner/sheet/sheetSpec";

/** All category slugs for a material (multi-category aware). */
export function materialCategorySlugs(m: Material): string[] {
  const list = m.categories?.length ? m.categories : [m.category];
  return list.map((c) => c.toLowerCase());
}

/**
 * Admin material conventions (IKEA-like roles):
 * - `category` / `categories`: `surface` | `frame` | `finish` — cabinet frame / carcass finishes
 * - `worktop` or `type`: `worktop` — worktop-only finishes (hybrid with built-in presets)
 * - Kitchen cabinet boards: all four types. Wardrobe omits worktop-typed lines (`isWardrobeBoardFinishMaterial`).
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

/** `type` / `types` includes the `worktop` slug (used to omit from wardrobe swatches; kitchen still shows). */
export function isWorktopTypeMaterial(m: { type: string; types?: string[] }): boolean {
  return materialTypeSlugs(m).some((t) => t.toLowerCase() === "worktop");
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
 * Wardrobe frame/carcass: boards (laminate, mdf, wood) but omits worktop-typed lines.
 * Sliding track rows (`type` slide) stay out of the carcass list — they appear under door hardware instead.
 */
export function isWardrobeBoardFinishMaterial(m: Material): boolean {
  return isBoardFinishMaterial(m) && !isWorktopTypeMaterial(m);
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
 * (worktop-typed lines stay hidden here — use kitchen for countertops).
 */
export function isWardrobeDoorFinishMaterial(m: Material): boolean {
  if (isWorktopTypeMaterial(m)) return false;
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
  plastic: "gloss",
  boucle: "matte",
  leather: "matte",
  handle: "metal",
  slide: "metal",
  hinge: "metal",
};

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
}

function mapMaterial(
  m: Material,
  cheapest: number,
  manufacturerName?: string,
): PlannerSwatchMaterial {
  const types = materialTypeSlugs(m);
  const primary =
    types.find((t) => t in ROUGHNESS_BY_TYPE) ?? types[0] ?? m.type;

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
  };
}

function materialCategoryKey(m: Material): string {
  const raw = m.categories?.[0] ?? m.category ?? "";
  const k = String(raw).trim().toLowerCase();
  return k || "other";
}

export type MaterialsFromStoreOptions = {
  /** When true, omit materials whose `type` is worktop (wardrobe only; kitchen passes false/omit). */
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

export function isUpholsteryFabricMaterial(m: Material): boolean {
  if (materialCategorySlugs(m).some((c) => c === "upholstery")) return true;
  return materialTypeSlugs(m).some((t) => {
    const x = t.toLowerCase();
    return x === "fabric" || x === "leather" || x === "boucle";
  });
}

/**
 * Soft seating / upholstery swatches (fabric, leather, Bouclé, or category upholstery).
 */
export function upholsteryMaterialsFromStore(
  storeMaterials: Material[],
  manufacturerName?: string,
): PlannerSwatchMaterial[] {
  const items = storeMaterials.filter(isUpholsteryFabricMaterial);
  if (items.length === 0) return [];
  const cheapest = Math.min(...items.map((m) => m.pricePerUnit));
  return items.map((m) => mapMaterial(m, cheapest, manufacturerName));
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
