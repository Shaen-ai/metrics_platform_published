import type {
  BaseModuleType,
  WallModuleType,
  HandleStyle,
  CountertopMaterial,
  CountertopConfig,
  KitchenConfig,
  KitchenModule,
  DesignRefKind,
  IslandConfig,
  CornerUnitConfig,
  LeftWallConfig,
} from "./types";
import type { Material } from "@/lib/types";
import {
  materialsFromStore as plannerMaterialsFromStore,
  worktopMaterialsFromStore as plannerWorktopMaterialsFromStore,
  handleMaterialsFromStore as plannerHandleMaterialsFromStore,
} from "@/lib/plannerMaterials";

// ── Standard kitchen dimensions (cm) ─────────────────────────────────

export const BASE_HEIGHT = 72;             // cabinet body height (without countertop)
export const COUNTERTOP_THICKNESS = 3;     // cm
export const TOTAL_BASE_HEIGHT = BASE_HEIGHT + COUNTERTOP_THICKNESS; // 75 cm
export const WALL_CABINET_HEIGHT = 70;     // cm
export const WALL_MOUNT_GAP = 55;          // gap between countertop and wall cabinets
export const WALL_MOUNT_Y = TOTAL_BASE_HEIGHT + WALL_MOUNT_GAP; // y of bottom of wall cabs = 130 cm
export const BASE_DEPTH = 60;              // cm
export const WALL_DEPTH = 35;              // cm
export const PANEL_THICKNESS = 1.8;        // cm

export const MODULE_WIDTHS = [30, 40, 45, 50, 60, 80, 90, 100] as const;

// ── Module catalogs ───────────────────────────────────────────────────

export interface ModuleDef {
  type: BaseModuleType | WallModuleType;
  name: string;
  description: string;
  defaultWidth: number;
  defaultHeightCm: number;
  defaultDepthCm: number;
  minWidth?: number;
  maxWidth?: number;
  minHeightCm?: number;
  maxHeightCm?: number;
  minDepthCm?: number;
  maxDepthCm?: number;
  price: number;
  isAppliance?: boolean;
}

export const BASE_MODULE_CATALOG: ModuleDef[] = [
  {
    type: "base-cabinet",
    name: "Base Cabinet",
    description: "Standard base cabinet with 2 doors",
    defaultWidth: 60,
    defaultHeightCm: BASE_HEIGHT,
    defaultDepthCm: BASE_DEPTH,
    minWidth: 30,
    maxWidth: 120,
    minHeightCm: 60,
    maxHeightCm: 95,
    minDepthCm: 50,
    maxDepthCm: 70,
    price: 120,
  },
  {
    type: "drawer-unit",
    name: "Drawer Unit",
    description: "3-drawer unit with soft-close runners",
    defaultWidth: 60,
    defaultHeightCm: BASE_HEIGHT,
    defaultDepthCm: BASE_DEPTH,
    minWidth: 40,
    maxWidth: 100,
    minHeightCm: 60,
    maxHeightCm: 95,
    minDepthCm: 50,
    maxDepthCm: 70,
    price: 180,
  },
  {
    type: "sink-unit",
    name: "Sink Cabinet",
    description: "Base with bowl / plumbing space — size the opening to your sink",
    defaultWidth: 80,
    defaultHeightCm: BASE_HEIGHT,
    defaultDepthCm: BASE_DEPTH,
    minWidth: 50,
    maxWidth: 120,
    minHeightCm: 60,
    maxHeightCm: 95,
    minDepthCm: 50,
    maxDepthCm: 70,
    price: 140,
  },
  {
    type: "oven-unit",
    name: "Oven Housing",
    description: "Tall housing for built-in oven",
    defaultWidth: 60,
    defaultHeightCm: 220,
    defaultDepthCm: BASE_DEPTH,
    minWidth: 55,
    maxWidth: 70,
    minHeightCm: 180,
    maxHeightCm: 240,
    minDepthCm: 55,
    maxDepthCm: 65,
    price: 200,
    isAppliance: true,
  },
  {
    type: "dishwasher-unit",
    name: "Dishwasher",
    description: "Integrated dishwasher niche — adjust width/depth to model",
    defaultWidth: 60,
    defaultHeightCm: BASE_HEIGHT,
    defaultDepthCm: 57,
    minWidth: 45,
    maxWidth: 65,
    minHeightCm: 70,
    maxHeightCm: 92,
    minDepthCm: 54,
    maxDepthCm: 65,
    price: 30,
    isAppliance: true,
  },
  {
    type: "tall-unit",
    name: "Tall Pantry",
    description: "Full-height larder or pantry",
    defaultWidth: 60,
    defaultHeightCm: 220,
    defaultDepthCm: BASE_DEPTH,
    minWidth: 40,
    maxWidth: 80,
    minHeightCm: 200,
    maxHeightCm: 240,
    minDepthCm: 50,
    maxDepthCm: 65,
    price: 280,
  },
  {
    type: "fridge-unit",
    name: "Integrated Fridge",
    description: "Built-in fridge / freezer column",
    defaultWidth: 60,
    defaultHeightCm: 210,
    defaultDepthCm: BASE_DEPTH,
    minWidth: 55,
    maxWidth: 75,
    minHeightCm: 180,
    maxHeightCm: 220,
    minDepthCm: 55,
    maxDepthCm: 65,
    price: 80,
    isAppliance: true,
  },
  {
    type: "freestanding-fridge",
    name: "Freestanding Fridge",
    description: "Full-size refrigerator — edit W×H×D to match appliance",
    defaultWidth: 70,
    defaultHeightCm: 200,
    defaultDepthCm: 65,
    minWidth: 55,
    maxWidth: 95,
    minHeightCm: 155,
    maxHeightCm: 220,
    minDepthCm: 58,
    maxDepthCm: 85,
    price: 420,
    isAppliance: true,
  },
  {
    type: "washing-machine-unit",
    name: "Washing Machine",
    description: "Washer niche (under-counter or full-height)",
    defaultWidth: 60,
    defaultHeightCm: 88,
    defaultDepthCm: 60,
    minWidth: 55,
    maxWidth: 65,
    minHeightCm: 82,
    maxHeightCm: 95,
    minDepthCm: 54,
    maxDepthCm: 65,
    price: 25,
    isAppliance: true,
  },
  {
    type: "corner-base",
    name: "Corner Unit",
    description: "Blind corner base unit",
    defaultWidth: 90,
    defaultHeightCm: BASE_HEIGHT,
    defaultDepthCm: BASE_DEPTH,
    minWidth: 80,
    maxWidth: 120,
    minHeightCm: 60,
    maxHeightCm: 95,
    minDepthCm: 55,
    maxDepthCm: 70,
    price: 220,
  },
];

export const WALL_MODULE_CATALOG: ModuleDef[] = [
  {
    type: "wall-cabinet",
    name: "Wall Cabinet",
    description: "Wall-mounted cabinet with doors",
    defaultWidth: 60,
    defaultHeightCm: WALL_CABINET_HEIGHT,
    defaultDepthCm: WALL_DEPTH,
    minWidth: 30,
    maxWidth: 120,
    minHeightCm: 40,
    maxHeightCm: 100,
    minDepthCm: 28,
    maxDepthCm: 42,
    price: 100,
  },
  {
    type: "wall-open",
    name: "Open Shelf",
    description: "Open floating shelf unit",
    defaultWidth: 60,
    defaultHeightCm: WALL_CABINET_HEIGHT,
    defaultDepthCm: WALL_DEPTH,
    minWidth: 30,
    maxWidth: 120,
    minHeightCm: 30,
    maxHeightCm: 90,
    minDepthCm: 25,
    maxDepthCm: 40,
    price: 60,
  },
  {
    type: "hood-unit",
    name: "Range Hood",
    description: "Extractor hood space",
    defaultWidth: 60,
    defaultHeightCm: 45,
    defaultDepthCm: WALL_DEPTH,
    minWidth: 50,
    maxWidth: 120,
    minHeightCm: 35,
    maxHeightCm: 60,
    minDepthCm: 28,
    maxDepthCm: 42,
    price: 50,
    isAppliance: true,
  },
  {
    type: "wall-corner",
    name: "Corner Wall Unit",
    description: "Corner wall cabinet",
    defaultWidth: 60,
    defaultHeightCm: WALL_CABINET_HEIGHT,
    defaultDepthCm: WALL_DEPTH,
    minWidth: 50,
    maxWidth: 90,
    minHeightCm: 40,
    maxHeightCm: 95,
    minDepthCm: 28,
    maxDepthCm: 42,
    price: 160,
  },
];

/** Default module choices for Kitchen Designer (grouped like the standard cabinet families). */
export interface KitchenModulePresetBase {
  id: string;
  label: string;
  type: BaseModuleType;
  /** Initial width in cm (clamped to catalog limits). */
  defaultWidth?: number;
  description?: string;
}

export interface KitchenModulePresetWall {
  id: string;
  label: string;
  type: WallModuleType;
  defaultWidth?: number;
  description?: string;
}

export const KITCHEN_BASE_MODULE_PRESETS: KitchenModulePresetBase[] = [
  { id: "base-corner", label: "For corner", type: "corner-base", description: "Corner base unit" },
  { id: "base-sink-single", label: "For single bowl sink", type: "sink-unit", defaultWidth: 60, description: "Sink base for a single bowl" },
  { id: "base-sink-15", label: "For one & half sink", type: "sink-unit", defaultWidth: 80, description: "Sink base for a 1½ bowl" },
  { id: "base-sink-double", label: "For double bowl sink", type: "sink-unit", defaultWidth: 100, description: "Sink base for a double bowl" },
  { id: "base-cooktop", label: "For cooktop", type: "base-cabinet", description: "Base run under a cooktop" },
  { id: "base-cooktop-oven", label: "For cooktop & oven", type: "oven-unit", description: "Tall housing for cooktop / oven stack" },
  { id: "base-dw", label: "For dishwasher", type: "dishwasher-unit", description: "Integrated dishwasher niche" },
  { id: "base-recycle", label: "For recycling/waste", type: "drawer-unit", description: "Pull-out waste / recycling" },
  { id: "base-door", label: "With door", type: "base-cabinet", description: "Standard door base" },
  { id: "base-drawers", label: "With drawers", type: "drawer-unit", description: "Drawer stack base" },
  { id: "base-door-drawer", label: "With door & drawer", type: "drawer-unit", defaultWidth: 80, description: "Door and drawer combination" },
  { id: "base-glass", label: "With glass doors", type: "base-cabinet", description: "Glass-front base (size doors to taste)" },
  { id: "base-pullout", label: "With pull-out", type: "drawer-unit", description: "Pull-out interior" },
  { id: "base-wire", label: "With wire basket", type: "base-cabinet", description: "Wire basket storage" },
  { id: "base-open", label: "Open cabinets", type: "base-cabinet", description: "Open base / shelf style" },
];

export const KITCHEN_WALL_MODULE_PRESETS: KitchenModulePresetWall[] = [
  { id: "wall-corner", label: "For corner", type: "wall-corner", description: "Corner wall unit" },
  { id: "wall-door", label: "With door", type: "wall-cabinet", description: "Wall cabinet with doors" },
  { id: "wall-glass", label: "With glass doors", type: "wall-cabinet", description: "Glass-front wall cabinet" },
  { id: "wall-horizontal", label: "Horizontal cabinets", type: "wall-cabinet", defaultWidth: 80, description: "Wide horizontal wall run" },
  { id: "wall-drawers", label: "With drawers", type: "wall-cabinet", description: "Wall unit with drawers" },
  { id: "wall-hood", label: "For extractor hood", type: "hood-unit", description: "Extractor hood space" },
  { id: "wall-otr-mw", label: "For over the range microwave", type: "wall-cabinet", defaultWidth: 60, description: "Microwave / OTR space" },
  { id: "wall-fan", label: "For integrated fan", type: "hood-unit", description: "Integrated fan / hood" },
  { id: "wall-fridge", label: "Refrigerator cabinets", type: "wall-cabinet", description: "Cabinet above fridge" },
  { id: "wall-open", label: "Open cabinets", type: "wall-open", description: "Open wall shelf unit" },
  { id: "wall-other", label: "Other", type: "wall-cabinet", description: "Generic wall cabinet" },
  { id: "wall-filler", label: "Filler pieces & cover panels", type: "wall-cabinet", defaultWidth: 30, description: "Narrow filler / panel" },
];

export const KITCHEN_HIGH_MODULE_PRESETS: KitchenModulePresetBase[] = [
  { id: "high-oven", label: "For oven", type: "oven-unit", description: "Full-height oven housing" },
  { id: "high-mw", label: "For microwave oven", type: "tall-unit", defaultWidth: 60, description: "Tall cabinet with microwave niche" },
  { id: "high-oven-mw", label: "For oven & microwave oven", type: "oven-unit", description: "Stacked oven and microwave" },
  { id: "high-door-drawer", label: "With door & drawer", type: "tall-unit", description: "Tall with door and drawers" },
  { id: "high-door", label: "With door", type: "tall-unit", description: "Full-height door cabinet" },
  { id: "high-glass", label: "With glass doors", type: "tall-unit", description: "Tall with glass fronts" },
  { id: "high-wire", label: "With wire basket", type: "tall-unit", description: "Pull-out wire baskets" },
  { id: "high-cleaning", label: "With cleaning interior", type: "tall-unit", description: "Broom / cleaning storage" },
  { id: "high-fridge", label: "For fridge & freezer", type: "fridge-unit", description: "Built-in fridge / freezer" },
  { id: "high-pullout", label: "High cabinets with pullout", type: "tall-unit", description: "Tall cabinet with pull-outs" },
  { id: "high-filler", label: "Filler pieces & cover panels", type: "tall-unit", defaultWidth: 40, description: "Narrow tall filler" },
];

/** Width when adding from a preset (clamped to catalog limits). */
export function resolveAddModuleWidth(
  kind: "base" | "wall",
  type: BaseModuleType | WallModuleType,
  widthOverride?: number,
): number {
  if (kind === "base") {
    const t = type as BaseModuleType;
    const lim = getBaseModuleLimits(t);
    const def = getBaseModuleDef(t);
    return clamp(widthOverride ?? def.defaultWidth, lim.minW, lim.maxW);
  }
  const t = type as WallModuleType;
  const lim = getWallModuleLimits(t);
  const def = getWallModuleDef(t);
  return clamp(widthOverride ?? def.defaultWidth, lim.minW, lim.maxW);
}

export function getBaseModuleDef(type: BaseModuleType): ModuleDef {
  return BASE_MODULE_CATALOG.find((d) => d.type === type) ?? BASE_MODULE_CATALOG[0];
}

export function getWallModuleDef(type: WallModuleType): ModuleDef {
  return WALL_MODULE_CATALOG.find((d) => d.type === type) ?? WALL_MODULE_CATALOG[0];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export interface ModuleDimensionLimits {
  minW: number;
  maxW: number;
  minH: number;
  maxH: number;
  minD: number;
  maxD: number;
}

export function getBaseModuleLimits(type: BaseModuleType): ModuleDimensionLimits {
  const def = getBaseModuleDef(type);
  return {
    minW: def.minWidth ?? 30,
    maxW: def.maxWidth ?? 120,
    minH: def.minHeightCm ?? 60,
    maxH: def.maxHeightCm ?? 240,
    minD: def.minDepthCm ?? 50,
    maxD: def.maxDepthCm ?? 70,
  };
}

export function getWallModuleLimits(type: WallModuleType): ModuleDimensionLimits {
  const def = getWallModuleDef(type);
  return {
    minW: def.minWidth ?? 30,
    maxW: def.maxWidth ?? 120,
    minH: def.minHeightCm ?? 35,
    maxH: def.maxHeightCm ?? 100,
    minD: def.minDepthCm ?? 25,
    maxD: def.maxDepthCm ?? 42,
  };
}

function kitchenModuleCatalogKind(module: KitchenModule): "base" | "wall" {
  if (BASE_MODULE_CATALOG.some((d) => d.type === module.type)) return "base";
  return "wall";
}

/** Wider bounds for admin-catalog modules so W×H×D can be edited freely. */
function relaxCatalogLimits(
  lim: ModuleDimensionLimits,
  module: KitchenModule,
): ModuleDimensionLimits {
  if (!module.fromAdminCatalog) return lim;
  return {
    minW: Math.min(lim.minW, 15),
    maxW: Math.max(lim.maxW, 320),
    minH: Math.min(lim.minH, 40),
    maxH: Math.max(lim.maxH, 320),
    minD: Math.min(lim.minD, 20),
    maxD: Math.max(lim.maxD, 120),
  };
}

/** Limits for UI sliders and store clamping — matches wardrobe-style wide admin edits. */
export function limitsForKitchenModuleEdit(module: KitchenModule): ModuleDimensionLimits {
  const lim =
    kitchenModuleCatalogKind(module) === "base"
      ? getBaseModuleLimits(module.type as BaseModuleType)
      : getWallModuleLimits(module.type as WallModuleType);
  return relaxCatalogLimits(lim, module);
}

/** Resolved body size in cm (clamped to catalog limits). */
export function getEffectiveBaseDims(m: KitchenModule): { w: number; h: number; d: number } {
  const def = BASE_MODULE_CATALOG.find((x) => x.type === m.type);
  if (!def) {
    return { w: m.width, h: BASE_HEIGHT, d: BASE_DEPTH };
  }
  const lim = limitsForKitchenModuleEdit(m);
  return {
    w: clamp(m.width, lim.minW, lim.maxW),
    h: clamp(m.heightCm ?? def.defaultHeightCm, lim.minH, lim.maxH),
    d: clamp(m.depthCm ?? def.defaultDepthCm, lim.minD, lim.maxD),
  };
}

export function getEffectiveWallDims(m: KitchenModule): { w: number; h: number; d: number } {
  const def = WALL_MODULE_CATALOG.find((x) => x.type === m.type);
  if (!def) {
    return { w: m.width, h: WALL_CABINET_HEIGHT, d: WALL_DEPTH };
  }
  const lim = limitsForKitchenModuleEdit(m);
  return {
    w: clamp(m.width, lim.minW, lim.maxW),
    h: clamp(m.heightCm ?? def.defaultHeightCm, lim.minH, lim.maxH),
    d: clamp(m.depthCm ?? def.defaultDepthCm, lim.minD, lim.maxD),
  };
}

/** Standard worktop slab only over these bases (tall / fridge / washer skip). Admin floor catalog units skip worktop. */
export function baseReceivesStandardCountertop(m: KitchenModule, bodyHeightCm: number): boolean {
  if (m.fromAdminCatalog) return false;
  const skip: BaseModuleType[] = [
    "freestanding-fridge",
    "tall-unit",
    "oven-unit",
    "washing-machine-unit",
  ];
  if (skip.includes(m.type as BaseModuleType)) return false;
  return bodyHeightCm <= TOTAL_BASE_HEIGHT + 2;
}

export function getMaxBaseDepthCm(modules: KitchenModule[], overhangCm: number): number {
  if (modules.length === 0) return BASE_DEPTH + overhangCm;
  return (
    modules.reduce((mx, mod) => Math.max(mx, getEffectiveBaseDims(mod).d), BASE_DEPTH) + overhangCm
  );
}

// ── Materials ─────────────────────────────────────────────────────────

export type SurfaceType = "wood" | "matte" | "gloss" | "stone" | "metal" | "glass";

export interface KitchenMaterial {
  id: string;
  name: string;
  color: string;
  roughness: number;
  metalness: number;
  priceMultiplier: number;
  surfaceType?: SurfaceType;
  imageUrl?: string;
  manufacturer?: string;
  pricePerSqm?: number;
  /** Laminate/wood/worktop sheet metadata (if applicable). */
  sheetWidthCm?: number;
  sheetHeightCm?: number;
  grainDirection?: "along_width" | "along_height" | "none";
  kerfMm?: number;
  /** Underlying admin catalog primary `type` — e.g. "laminate", "wood", "worktop". */
  materialType?: string;
  materialTypes?: string[];
}

/** When the admin catalog is empty: flat grey, no wood grain — user can still design. */
export const NEUTRAL_KITCHEN_MATERIAL_ID = "__neutral_kitchen__";

export const NEUTRAL_KITCHEN_MATERIAL: KitchenMaterial = {
  id: NEUTRAL_KITCHEN_MATERIAL_ID,
  name: "Default",
  color: "#c4c4c4",
  roughness: 0.92,
  metalness: 0,
  priceMultiplier: 1,
  surfaceType: "matte",
};

export const CABINET_MATERIALS: KitchenMaterial[] = [
  { id: "white-matte",   name: "White",         color: "#eceae5", roughness: 0.92, metalness: 0,    priceMultiplier: 1.0,  surfaceType: "matte" },
  { id: "white-gloss",   name: "White Gloss",   color: "#f0eeeb", roughness: 0.12, metalness: 0.04, priceMultiplier: 1.15, surfaceType: "gloss" },
  { id: "light-gray",    name: "Light Gray",    color: "#c4c0b8", roughness: 0.88, metalness: 0,    priceMultiplier: 1.05, surfaceType: "matte" },
  { id: "warm-gray",     name: "Warm Gray",     color: "#9e9892", roughness: 0.87, metalness: 0,    priceMultiplier: 1.05, surfaceType: "matte" },
  { id: "anthracite",    name: "Anthracite",    color: "#424242", roughness: 0.88, metalness: 0.03, priceMultiplier: 1.1,  surfaceType: "matte" },
  { id: "black-gloss",   name: "Black Gloss",   color: "#1a1a1a", roughness: 0.1,  metalness: 0.05, priceMultiplier: 1.2,  surfaceType: "gloss" },
  { id: "navy-blue",     name: "Navy Blue",     color: "#2a3a5e", roughness: 0.85, metalness: 0,    priceMultiplier: 1.1,  surfaceType: "matte" },
  { id: "forest-green",  name: "Forest Green",  color: "#3a5a42", roughness: 0.85, metalness: 0,    priceMultiplier: 1.1,  surfaceType: "matte" },
  { id: "sage-green",    name: "Sage Green",    color: "#8fa88f", roughness: 0.87, metalness: 0,    priceMultiplier: 1.1,  surfaceType: "matte" },
  { id: "dusty-pink",    name: "Dusty Pink",    color: "#c4a09a", roughness: 0.88, metalness: 0,    priceMultiplier: 1.1,  surfaceType: "matte" },
  { id: "birch",         name: "Birch",         color: "#d6c6a8", roughness: 0.72, metalness: 0,    priceMultiplier: 1.15, surfaceType: "wood" },
  { id: "natural-oak",   name: "Oak",           color: "#b8935a", roughness: 0.68, metalness: 0,    priceMultiplier: 1.3,  surfaceType: "wood" },
  { id: "light-oak",     name: "Light Oak",     color: "#c9a86c", roughness: 0.70, metalness: 0,    priceMultiplier: 1.2,  surfaceType: "wood" },
  { id: "walnut",        name: "Walnut",        color: "#5c3a1e", roughness: 0.62, metalness: 0,    priceMultiplier: 1.4,  surfaceType: "wood" },
];

export const DOOR_MATERIALS: KitchenMaterial[] = [...CABINET_MATERIALS];

// ── Countertop options ────────────────────────────────────────────────

export interface CountertopDef {
  material: CountertopMaterial;
  name: string;
  color: string;
  roughness: number;
  metalness: number;
  pricePerLinearMeter: number;
  surfaceType: SurfaceType;
}

export const COUNTERTOP_OPTIONS: CountertopDef[] = [
  { material: "white-marble",    name: "White Marble",    color: "#f0ede8", roughness: 0.28, metalness: 0.04, pricePerLinearMeter: 180, surfaceType: "stone" },
  { material: "quartz-white",    name: "Quartz White",    color: "#f5f2ed", roughness: 0.36, metalness: 0.01, pricePerLinearMeter: 170, surfaceType: "stone" },
  { material: "light-stone",     name: "Light Quartz",    color: "#d8d4cc", roughness: 0.44, metalness: 0.01, pricePerLinearMeter: 150, surfaceType: "stone" },
  { material: "quartz-gray",     name: "Quartz Gray",     color: "#8a8680", roughness: 0.40, metalness: 0.01, pricePerLinearMeter: 175, surfaceType: "stone" },
  { material: "dark-stone",      name: "Dark Quartz",     color: "#3a3530", roughness: 0.38, metalness: 0.02, pricePerLinearMeter: 160, surfaceType: "stone" },
  { material: "black-granite",   name: "Black Granite",   color: "#1c1c1e", roughness: 0.32, metalness: 0.04, pricePerLinearMeter: 200, surfaceType: "stone" },
  { material: "butcher-block",   name: "Butcher Block",   color: "#b8935a", roughness: 0.70, metalness: 0,    pricePerLinearMeter: 120, surfaceType: "wood" },
  { material: "stainless-steel", name: "Stainless Steel", color: "#b8bcc0", roughness: 0.18, metalness: 0.92, pricePerLinearMeter: 220, surfaceType: "metal" },
];

export function getCountertopDef(material: CountertopMaterial): CountertopDef {
  return COUNTERTOP_OPTIONS.find((c) => c.material === material) ?? COUNTERTOP_OPTIONS[0];
}

// ── Handles ───────────────────────────────────────────────────────────

export interface HandleDef {
  id: HandleStyle;
  name: string;
  price: number;
}

export const HANDLES: HandleDef[] = [
  { id: "bar-steel",  name: "Bar — Brushed Nickel",  price: 12 },
  { id: "bar-black",  name: "Bar — Matte Black",     price: 12 },
  { id: "bar-brass",  name: "Bar — Brushed Brass",   price: 18 },
  { id: "knob-steel", name: "Knob — Satin Chrome",   price: 8  },
  { id: "knob-black", name: "Knob — Matte Black",    price: 8  },
  { id: "recessed",   name: "Recessed (push-open)",  price: 22 },
];

export const HANDLE_COLORS: Record<HandleStyle, { color: string; roughness: number; metalness: number }> = {
  "bar-steel":  { color: "#a8a8a8", roughness: 0.28, metalness: 0.85 },
  "bar-black":  { color: "#1a1a1a", roughness: 0.45, metalness: 0.30 },
  "bar-brass":  { color: "#c5a55a", roughness: 0.30, metalness: 0.80 },
  "knob-steel": { color: "#b0b0b0", roughness: 0.22, metalness: 0.90 },
  "knob-black": { color: "#1a1a1a", roughness: 0.45, metalness: 0.30 },
  "recessed":   { color: "#888888", roughness: 0.50, metalness: 0.30 },
};

// ── Material conversion from admin store ─────────────────────────────

export function materialsFromStore(
  storeMaterials: Material[],
  manufacturerName?: string,
): KitchenMaterial[] {
  return plannerMaterialsFromStore(storeMaterials, manufacturerName).map((m) => ({
    ...m,
    surfaceType: (m.surfaceType ?? "matte") as SurfaceType,
  }));
}

/** Admin worktop rows — when non-empty, planner uses only these (built-in presets hidden). */
export function worktopMaterialsFromStore(
  storeMaterials: Material[],
  manufacturerName?: string,
): KitchenMaterial[] {
  return plannerWorktopMaterialsFromStore(storeMaterials, manufacturerName).map((m) => ({
    ...m,
    surfaceType: (m.surfaceType ?? "matte") as SurfaceType,
  }));
}

/** Handle finishes — admin materials with `type` `handle` or `category`/`categories` `handle`. */
export function handleMaterialsFromStore(
  storeMaterials: Material[],
  manufacturerName?: string,
): KitchenMaterial[] {
  return plannerHandleMaterialsFromStore(storeMaterials, manufacturerName).map((m) => ({
    ...m,
    surfaceType: (m.surfaceType ?? "matte") as SurfaceType,
  }));
}

export function inferKitchenBaseTypeFromName(name: string): BaseModuleType {
  const n = name.toLowerCase();
  if (n.includes("drawer")) return "drawer-unit";
  if (n.includes("sink")) return "sink-unit";
  if (n.includes("oven")) return "oven-unit";
  if (n.includes("dishwasher")) return "dishwasher-unit";
  if (n.includes("fridge") || n.includes("refrigerator")) return "fridge-unit";
  if (n.includes("washing")) return "washing-machine-unit";
  if (n.includes("corner")) return "corner-base";
  if (n.includes("tall") || n.includes("pantry") || n.includes("larder")) return "tall-unit";
  return "base-cabinet";
}

export function inferKitchenWallTypeFromName(name: string): WallModuleType {
  const n = name.toLowerCase();
  if (n.includes("hood")) return "hood-unit";
  if (n.includes("open") || n.includes("shelf")) return "wall-open";
  if (n.includes("corner")) return "wall-corner";
  return "wall-cabinet";
}

/**
 * Resolve cabinet/door PBR from the current palette. When `extra` is non-empty (admin catalog),
 * only those swatches are used — unknown ids fall back to the first catalog entry.
 * Built-in presets apply only when the palette is empty (offline / no admin materials).
 */
export function getMaterial(id: string, extra?: KitchenMaterial[]): KitchenMaterial {
  if (extra?.length) {
    const found = extra.find((m) => m.id === id);
    if (found) return found;
    return extra[0]!;
  }
  const builtin = CABINET_MATERIALS.find((m) => m.id === id);
  if (builtin) return builtin;
  return NEUTRAL_KITCHEN_MATERIAL;
}

/** If config references a material id not in the current admin lists, snap to the first entry. */
export function clampConfigMaterialsToAvailable(
  config: KitchenConfig,
  cabinetMaterials: KitchenMaterial[],
  doorMaterials: KitchenMaterial[],
  worktopMaterials?: KitchenMaterial[],
  handleMaterials?: KitchenMaterial[],
): KitchenConfig {
  let next = config;
  if (cabinetMaterials.length > 0 && !cabinetMaterials.some((m) => m.id === config.cabinetMaterial)) {
    next = { ...next, cabinetMaterial: cabinetMaterials[0]!.id };
  }
  if (doorMaterials.length > 0 && !doorMaterials.some((m) => m.id === config.doors.material)) {
    next = { ...next, doors: { ...next.doors, material: doorMaterials[0]!.id } };
  }
  if (worktopMaterials && worktopMaterials.length > 0) {
    const id = next.countertop.adminMaterialId;
    if (!id || !worktopMaterials.some((m) => m.id === id)) {
      next = {
        ...next,
        countertop: { ...next.countertop, adminMaterialId: worktopMaterials[0]!.id },
      };
    }
  } else if (next.countertop.adminMaterialId) {
    next = {
      ...next,
      countertop: { ...next.countertop, adminMaterialId: undefined },
    };
  }
  if (handleMaterials && handleMaterials.length > 0) {
    const hid = next.doors.handleMaterialId;
    if (hid && !handleMaterials.some((m) => m.id === hid)) {
      next = { ...next, doors: { ...next.doors, handleMaterialId: undefined } };
    }
  } else if (next.doors.handleMaterialId) {
    next = { ...next, doors: { ...next.doors, handleMaterialId: undefined } };
  }
  return next;
}

/** Countertop style as KitchenMaterial for 3D (avoids resolving enum against cabinet swatches). */
export function countertopToKitchenMaterial(material: CountertopMaterial): KitchenMaterial {
  const def = getCountertopDef(material);
  return {
    id: `ct-${def.material}`,
    name: def.name,
    color: def.color,
    roughness: def.roughness,
    metalness: def.metalness,
    priceMultiplier: 1,
    surfaceType: def.surfaceType,
  };
}

/** Resolve worktop for 3D / labels: when admin worktops exist, only those are used; else built-in preset. */
export function resolveCountertopKitchenMaterial(
  countertop: CountertopConfig,
  worktopMaterials: KitchenMaterial[],
): KitchenMaterial {
  if (worktopMaterials.length > 0) {
    const w = countertop.adminMaterialId
      ? worktopMaterials.find((m) => m.id === countertop.adminMaterialId)
      : undefined;
    return w ?? worktopMaterials[0]!;
  }
  if (countertop.adminMaterialId) {
    const w = worktopMaterials.find((m) => m.id === countertop.adminMaterialId);
    if (w) return w;
  }
  return countertopToKitchenMaterial(countertop.material);
}

/** €/linear meter — admin `pricePerSqm` doubles as linear rate when worktop comes from catalog */
export function getCountertopPricePerLinearMeter(
  countertop: CountertopConfig,
  worktopMaterials: KitchenMaterial[],
): number {
  if (worktopMaterials.length > 0) {
    const w = countertop.adminMaterialId
      ? worktopMaterials.find((m) => m.id === countertop.adminMaterialId)
      : undefined;
    const chosen = w ?? worktopMaterials[0]!;
    if (chosen.pricePerSqm != null) return chosen.pricePerSqm;
    return getCountertopDef(countertop.material).pricePerLinearMeter;
  }
  if (countertop.adminMaterialId) {
    const w = worktopMaterials.find((m) => m.id === countertop.adminMaterialId);
    if (w?.pricePerSqm != null) return w.pricePerSqm;
  }
  return getCountertopDef(countertop.material).pricePerLinearMeter;
}

export function defaultIslandConfig(): IslandConfig {
  return {
    enabled: false,
    baseModules: [],
    wallModules: [],
    hasWallCabinets: true,
    offsetXCm: 0,
    offsetZCm: 180,
    rotationYRad: 0,
  };
}

export function defaultCornerUnitConfig(): CornerUnitConfig {
  return {
    enabled: false,
    backWingWidthCm: 90,
    leftWingWidthCm: 90,
    heightCm: BASE_HEIGHT,
    depthCm: BASE_DEPTH,
    hasWallCorner: false,
    wallCornerHeightCm: WALL_CABINET_HEIGHT,
    wallCornerDepthCm: WALL_DEPTH,
  };
}

export function defaultLeftWallConfig(): LeftWallConfig {
  return {
    enabled: false,
    baseModules: [],
    wallModules: [],
    hasWallCabinets: true,
  };
}

/** Migrate older saved configs missing island / design placements / corner / left wall. */
export function normalizeKitchenConfig(c: KitchenConfig): KitchenConfig {
  return {
    ...c,
    island: {
      ...defaultIslandConfig(),
      ...c.island,
      baseModules: c.island?.baseModules ?? [],
      wallModules: c.island?.wallModules ?? [],
    },
    cornerUnit: {
      ...defaultCornerUnitConfig(),
      ...(c.cornerUnit ?? {}),
    },
    leftWall: {
      ...defaultLeftWallConfig(),
      ...(c.leftWall ?? {}),
      baseModules: c.leftWall?.baseModules ?? [],
      wallModules: c.leftWall?.wallModules ?? [],
    },
    designPlacements: c.designPlacements ?? [],
    cabinetGrainDirection: c.cabinetGrainDirection ?? "horizontal",
    doorGrainDirection: c.doorGrainDirection ?? "horizontal",
    countertop: {
      material: c.countertop?.material ?? "light-stone",
      overhang: c.countertop?.overhang ?? 2,
      adminMaterialId: c.countertop?.adminMaterialId,
    },
  };
}

export interface DesignRefPreset {
  kind: DesignRefKind;
  label: string;
  widthCm: number;
  depthCm: number;
  heightCm: number;
}

export const DESIGN_REF_PRESETS: Record<DesignRefKind, DesignRefPreset> = {
  fridge: {
    kind: "fridge",
    label: "Fridge (layout)",
    widthCm: 70,
    depthCm: 65,
    heightCm: 185,
  },
  sink: {
    kind: "sink",
    label: "Sink area (layout)",
    widthCm: 80,
    depthCm: 55,
    heightCm: 25,
  },
  range: {
    kind: "range",
    label: "Cooktop / range (layout)",
    widthCm: 60,
    depthCm: 60,
    heightCm: 12,
  },
  dishwasher: {
    kind: "dishwasher",
    label: "Dishwasher (layout)",
    widthCm: 60,
    depthCm: 58,
    heightCm: 85,
  },
};

// ── Pricing ───────────────────────────────────────────────────────────

function kitchenHandleUnitPrice(
  config: KitchenConfig,
  handleMaterials: KitchenMaterial[],
): number {
  const id = config.doors.handleMaterialId;
  if (id && handleMaterials.length > 0) {
    const h = handleMaterials.find((m) => m.id === id);
    if (h?.pricePerSqm != null) return h.pricePerSqm;
  }
  const handleDef = HANDLES.find((h) => h.id === config.doors.handle) ?? HANDLES[0];
  return handleDef.price;
}

function priceBaseRun(
  modules: KitchenModule[],
  cabinetMat: KitchenMaterial,
  doorMat: KitchenMaterial,
  handleUnitPrice: number,
): number {
  return modules.reduce((sum, m) => {
    const def = BASE_MODULE_CATALOG.find((d) => d.type === m.type);
    if (!def) return sum;
    const dim = getEffectiveBaseDims(m);
    const sizeScale = (dim.w * dim.h * dim.d) / (60 * 72 * 60);
    const bodyPrice = def.price * cabinetMat.priceMultiplier * Math.max(0.35, Math.min(2.2, sizeScale));
    const isApplianceFront =
      def.isAppliance &&
      m.type !== "sink-unit" &&
      m.type !== "corner-base";
    const frontPrice = isApplianceFront
      ? (dim.w / 60) * 15
      : (dim.w / 60) * 55 * doorMat.priceMultiplier + handleUnitPrice;
    return sum + bodyPrice + frontPrice;
  }, 0);
}

function priceWallRun(
  modules: KitchenModule[],
  enabled: boolean,
  cabinetMat: KitchenMaterial,
  doorMat: KitchenMaterial,
  handleUnitPrice: number,
): number {
  if (!enabled) return 0;
  return modules.reduce((sum, m) => {
    const def = WALL_MODULE_CATALOG.find((d) => d.type === m.type);
    if (!def) return sum;
    const dim = getEffectiveWallDims(m);
    const sizeScale = (dim.w * dim.h * dim.d) / (60 * 70 * 35);
    const bodyPrice = def.price * cabinetMat.priceMultiplier * Math.max(0.35, Math.min(2, sizeScale));
    const isHood = m.type === "hood-unit";
    const frontPrice = isHood
      ? 0
      : (dim.w / 60) * 40 * doorMat.priceMultiplier + handleUnitPrice;
    return sum + bodyPrice + frontPrice;
  }, 0);
}

function countertopLinearCost(
  baseModules: KitchenModule[],
  countertop: CountertopConfig,
  worktopMaterials: KitchenMaterial[],
): number {
  const rate = getCountertopPricePerLinearMeter(countertop, worktopMaterials);
  let counterWidthCm = 0;
  let i = 0;
  const bases = baseModules;
  while (i < bases.length) {
    const dim = getEffectiveBaseDims(bases[i]);
    if (!baseReceivesStandardCountertop(bases[i], dim.h)) {
      i++;
      continue;
    }
    let seg = 0;
    while (i < bases.length) {
      const d2 = getEffectiveBaseDims(bases[i]);
      if (!baseReceivesStandardCountertop(bases[i], d2.h)) break;
      seg += bases[i].width;
      i++;
    }
    counterWidthCm += seg;
  }
  return (counterWidthCm / 100) * rate;
}

export function calculatePrice(
  config: KitchenConfig,
  materials: KitchenMaterial[],
  worktopMaterials: KitchenMaterial[] = [],
  handleMaterials: KitchenMaterial[] = [],
): {
  base: number;
  wall: number;
  countertop: number;
  islandBase: number;
  islandWall: number;
  islandCountertop: number;
  total: number;
} {
  const cabinetMat = getMaterial(config.cabinetMaterial, materials);
  const doorMat = getMaterial(config.doors.material, materials);
  const handleUnit = kitchenHandleUnitPrice(config, handleMaterials);

  const baseCost = priceBaseRun(config.baseModules, cabinetMat, doorMat, handleUnit);
  const wallCost = priceWallRun(
    config.wallModules,
    config.hasWallCabinets,
    cabinetMat,
    doorMat,
    handleUnit,
  );
  const countertopCost = countertopLinearCost(config.baseModules, config.countertop, worktopMaterials);

  const isl = config.island;
  const islandBaseCost =
    isl?.enabled ? priceBaseRun(isl.baseModules, cabinetMat, doorMat, handleUnit) : 0;
  const islandWallCost =
    isl?.enabled
      ? priceWallRun(isl.wallModules, isl.hasWallCabinets, cabinetMat, doorMat, handleUnit)
      : 0;
  const islandCtCost =
    isl?.enabled ? countertopLinearCost(isl.baseModules, config.countertop, worktopMaterials) : 0;

  const total =
    baseCost + wallCost + countertopCost + islandBaseCost + islandWallCost + islandCtCost;

  return {
    base: Math.round(baseCost),
    wall: Math.round(wallCost),
    countertop: Math.round(countertopCost),
    islandBase: Math.round(islandBaseCost),
    islandWall: Math.round(islandWallCost),
    islandCountertop: Math.round(islandCtCost),
    total: Math.round(total),
  };
}

// ── Templates ─────────────────────────────────────────────────────────

import { v4 as uuidv4 } from "uuid";

export interface KitchenTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  config: KitchenConfig;
}

function makeBase(
  defs: { type: BaseModuleType; width: number }[],
): import("./types").KitchenModule[] {
  return defs.map((d) => ({ id: uuidv4(), type: d.type, width: d.width }));
}
function makeWall(
  defs: { type: WallModuleType; width: number }[],
): import("./types").KitchenModule[] {
  return defs.map((d) => ({ id: uuidv4(), type: d.type, width: d.width }));
}

export const KITCHEN_TEMPLATES: KitchenTemplate[] = [
  {
    id: "classic-white",
    name: "Classic White",
    description: "Timeless all-white kitchen with marble countertop",
    icon: "🍳",
    config: {
      cabinetMaterial: "white-matte",
      doors: { material: "white-matte", handle: "bar-steel" },
      countertop: { material: "white-marble", overhang: 2 },
      hasWallCabinets: true,
      baseModules: makeBase([
        { type: "base-cabinet", width: 60 },
        { type: "sink-unit",    width: 80 },
        { type: "base-cabinet", width: 60 },
        { type: "oven-unit",    width: 60 },
        { type: "drawer-unit",  width: 60 },
      ]),
      wallModules: makeWall([
        { type: "wall-cabinet", width: 60 },
        { type: "hood-unit",    width: 60 },
        { type: "wall-cabinet", width: 60 },
        { type: "wall-cabinet", width: 60 },
        { type: "wall-cabinet", width: 60 },
      ]),
      island: defaultIslandConfig(),
      cornerUnit: defaultCornerUnitConfig(),
      leftWall: defaultLeftWallConfig(),
      designPlacements: [],
    },
  },
  {
    id: "scandi-oak",
    name: "Scandinavian Oak",
    description: "Warm oak fronts with butcher block countertop",
    icon: "🌿",
    config: {
      cabinetMaterial: "birch",
      doors: { material: "natural-oak", handle: "bar-brass" },
      countertop: { material: "butcher-block", overhang: 2 },
      hasWallCabinets: true,
      baseModules: makeBase([
        { type: "tall-unit",    width: 60 },
        { type: "base-cabinet", width: 60 },
        { type: "sink-unit",    width: 80 },
        { type: "drawer-unit",  width: 60 },
        { type: "oven-unit",    width: 60 },
      ]),
      wallModules: makeWall([
        { type: "wall-open",    width: 60 },
        { type: "wall-cabinet", width: 60 },
        { type: "hood-unit",    width: 60 },
        { type: "wall-cabinet", width: 60 },
        { type: "wall-open",    width: 60 },
      ]),
      island: defaultIslandConfig(),
      cornerUnit: defaultCornerUnitConfig(),
      leftWall: defaultLeftWallConfig(),
      designPlacements: [],
    },
  },
  {
    id: "modern-dark",
    name: "Modern Dark",
    description: "Sleek anthracite cabinets with black granite worktop",
    icon: "🖤",
    config: {
      cabinetMaterial: "anthracite",
      doors: { material: "anthracite", handle: "bar-black" },
      countertop: { material: "black-granite", overhang: 2 },
      hasWallCabinets: true,
      baseModules: makeBase([
        { type: "fridge-unit",  width: 60 },
        { type: "base-cabinet", width: 60 },
        { type: "sink-unit",    width: 80 },
        { type: "dishwasher-unit", width: 60 },
        { type: "oven-unit",    width: 60 },
        { type: "drawer-unit",  width: 60 },
      ]),
      wallModules: makeWall([
        { type: "wall-cabinet", width: 60 },
        { type: "wall-cabinet", width: 60 },
        { type: "hood-unit",    width: 60 },
        { type: "wall-cabinet", width: 60 },
        { type: "wall-cabinet", width: 60 },
        { type: "wall-cabinet", width: 60 },
      ]),
      island: defaultIslandConfig(),
      cornerUnit: defaultCornerUnitConfig(),
      leftWall: defaultLeftWallConfig(),
      designPlacements: [],
    },
  },
  {
    id: "navy-brass",
    name: "Navy & Brass",
    description: "Rich navy blue cabinets with brass hardware",
    icon: "⚓",
    config: {
      cabinetMaterial: "navy-blue",
      doors: { material: "navy-blue", handle: "bar-brass" },
      countertop: { material: "quartz-white", overhang: 2 },
      hasWallCabinets: false,
      baseModules: makeBase([
        { type: "tall-unit",    width: 60 },
        { type: "drawer-unit",  width: 60 },
        { type: "sink-unit",    width: 80 },
        { type: "base-cabinet", width: 60 },
        { type: "oven-unit",    width: 60 },
      ]),
      wallModules: makeWall([]),
      island: defaultIslandConfig(),
      cornerUnit: defaultCornerUnitConfig(),
      leftWall: defaultLeftWallConfig(),
      designPlacements: [],
    },
  },
  {
    id: "compact-urban",
    name: "Compact Urban",
    description: "Short main wall — ideal for city apartments",
    icon: "🏙️",
    config: {
      cabinetMaterial: "warm-gray",
      doors: { material: "anthracite", handle: "recessed" },
      countertop: { material: "quartz-gray", overhang: 2 },
      hasWallCabinets: true,
      baseModules: makeBase([
        { type: "sink-unit", width: 80 },
        { type: "drawer-unit", width: 60 },
        { type: "oven-unit", width: 60 },
      ]),
      wallModules: makeWall([
        { type: "wall-cabinet", width: 60 },
        { type: "hood-unit", width: 60 },
        { type: "wall-cabinet", width: 60 },
      ]),
      island: defaultIslandConfig(),
      cornerUnit: defaultCornerUnitConfig(),
      leftWall: defaultLeftWallConfig(),
      designPlacements: [],
    },
  },
];
