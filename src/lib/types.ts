import type { WardrobeConfig } from "@/app/planner/wardrobe/types";
import type { KitchenConfig } from "@/app/planner/kitchen/types";

/** User-saved wardrobe designs for Bedroom planner (local persistence only). */
export interface PlannerSavedWardrobe {
  id: string;
  name: string;
  config: WardrobeConfig;
  /** Price snapshot from wardrobe planner when saved (for room totals). */
  cachedPrice: number;
}

export interface CatalogItem {
  id: string;
  adminId: string;
  modeId?: string;
  subModeId: string;
  name: string;
  model?: string;
  modelUrl?: string;
  modelStatus?: "queued" | "processing" | "done" | "failed";
  modelJobId?: string;
  modelError?: string | null;
  description: string;
  category: string;
  price: number;
  currency: string;
  images: string[];
  sizes?: {
    width: number;
    height: number;
    depth: number;
    unit: string;
  };
  dimensions?: {
    width: number;
    height: number;
    depth: number;
    unit: string;
  };
  availableColors?: { name: string; hex: string }[];
  deliveryDays: number;
  wallMounted?: boolean;
  mountHeight?: number | null;
  isActive: boolean;
}

/**
 * Catalog finish / board. **Roles** (IKEA-style) — use `type` and `category` so planners can filter:
 * - Frame / carcass: `category` `surface` | `frame` | `finish`
 * - Worktop: `type` or `category` `worktop`
 * - Board finishes (wardrobe/kitchen): `type` laminate | mdf | wood | worktop; categories are optional for planner lists
 * - Sliding tracks / mechanisms: `type` `slide` (often with `category` `hardware`)
 * - Door/drawer **handle finishes** (planner texture + price): `type` `handle` **or** `category`/`categories` `handle` (when the admin has no handle type — tag the row with category **handle**); use `imageUrl` for swatch and 3D texture
 */
/** Which axis of the sheet the grain runs along, or "none" for random-rotatable. */
export type MaterialGrainDirection = "along_width" | "along_height" | "none";

export interface Material {
  id: string;
  adminId: string;
  name: string;
  /** Present when the row was imported from a manufacturer catalog template. */
  manufacturer?: string | null;
  type: string;
  types?: string[];
  category: string;
  categories?: string[];
  color: string;
  colorCode: string;
  pricePerUnit: number;
  unit: string;
  imageUrl?: string;
  subModeId?: string;
  /** Laminate/MDF/wood/worktop sheet size in cm. Absent → use getSheetSpec defaults. */
  sheetWidthCm?: number;
  sheetHeightCm?: number;
  /** Which sheet axis the grain runs along. Absent → "along_width". */
  grainDirection?: MaterialGrainDirection;
  /** Saw-kerf gap between cuts. Absent → 3 mm. */
  kerfMm?: number;
}

/** Admin-defined optional extras on a configurable module template. */
export interface ModuleTemplateOptionDef {
  id: string;
  label: string;
  priceDelta: number;
  defaultSelected?: boolean;
}

export interface Module {
  id: string;
  adminId: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  dimensions: {
    width: number;
    height: number;
    depth: number;
    unit: string;
  };
  imageUrl?: string;
  connectionPoints: {
    top: boolean;
    bottom: boolean;
    left: boolean;
    right: boolean;
    front: boolean;
    back: boolean;
  };
  compatibleWith: string[];
  subModeId: string;
  placementType: 'floor' | 'wall';
  /** Browser-only modules from Module Planner (not from admin API). */
  source?: 'planner';
  cabinetMaterialId?: string;
  doorMaterialId?: string;
  /** API module: enables template configurator on the published site. */
  isConfigurableTemplate?: boolean;
  pricingBodyWeight?: number;
  pricingDoorWeight?: number;
  defaultCabinetMaterialId?: string;
  defaultDoorMaterialId?: string;
  defaultHandleId?: string;
  templateOptions?: ModuleTemplateOptionDef[];
  allowedHandleIds?: string[];
}

/** Customer selection for a module template (materials, handle, toggles). */
export interface ModuleTemplateSelection {
  cabinetMaterialId: string;
  doorMaterialId: string;
  handleId: string;
  /** option id -> selected */
  extraOptions: Record<string, boolean>;
}

export interface ModuleTemplatePriceBreakdown {
  basePrice: number;
  bodyDelta: number;
  doorDelta: number;
  handleDelta: number;
  extrasTotal: number;
  total: number;
  pricingVersion: number;
}

export interface Admin {
  id: string;
  companyName: string;
  slug: string;
  logo?: string;
  language: "en" | "ru";
  currency: string;
  selectedPlannerTypes?: string[];
  paypalEmail?: string;
  /** When set and non-empty, planners only offer these material ids; otherwise all materials are shown. */
  plannerMaterialIds?: string[] | null;
  /**
   * When true, public planners only use this admin’s API catalog. When false (default), the
   * platform default library (CATALOG_LIBRARY_SLUG) and built-in 3D catalog are merged in.
   */
  useCustomPlannerCatalog?: boolean;
  publicSiteLayout?: string;
  publicSiteTexts?: PublicSiteTexts;
  publicSiteTheme?: PublicSiteTheme;
  customDesignKey?: string | null;
  entitlements?: PlanEntitlementsSnapshot;
}

export interface PublicSiteTexts {
  heroTitle?: string;
  heroSubtitle?: string;
  primaryCta?: string;
  secondaryCta?: string;
  catalogTitle?: string;
  catalogSubtitle?: string;
  plannersTitle?: string;
  plannersSubtitle?: string;
  materialsTitle?: string;
  materialsSubtitle?: string;
  footerTagline?: string;
}

export interface PublicSiteTheme {
  primaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
}

export interface PlanEntitlementsSnapshot {
  planTier: string;
  trialEndsAt?: string | null;
  onTrial: boolean;
  aiChatMonthlyLimit: number | null;
  aiChatRemaining: number | null;
  image3dMonthlyLimit: number;
  image3dRemaining: number;
  inFirstImage3dBonusWindow: boolean;
  publishedLayouts?: boolean;
  customTheme?: boolean;
  bespokeDesign?: boolean;
}

/** @deprecated Use CartLine — kept for migration typing */
export interface CartItem {
  item: CatalogItem;
  quantity: number;
}

export type CartCatalogLine = {
  kind: "catalog";
  lineId: string;
  item: CatalogItem;
  quantity: number;
};

export type CartWardrobeLine = {
  kind: "wardrobe";
  lineId: string;
  name: string;
  price: number;
  quantity: number;
  config: WardrobeConfig;
};

export type CartKitchenFurnitureLine = {
  kind: "kitchen-furniture";
  lineId: string;
  name: string;
  price: number;
  quantity: number;
  config: KitchenConfig;
};

/** Module Planner line — API template with selection or legacy DIY module snapshot. */
export type CartModulePlannerLine = {
  kind: "module-planner";
  lineId: string;
  name: string;
  price: number;
  quantity: number;
  module: Module;
  /** Set for configurable templates from API. */
  selection?: ModuleTemplateSelection;
  breakdown?: ModuleTemplatePriceBreakdown;
};

export type CartLine =
  | CartCatalogLine
  | CartWardrobeLine
  | CartKitchenFurnitureLine
  | CartModulePlannerLine;

export type FurnitureType = 
  | "table" 
  | "chair" 
  | "cabinet" 
  | "shelf" 
  | "sofa" 
  | "bed" 
  | "desk" 
  | "drawer" 
  | "wardrobe"
  | "custom-rect"
  | "custom-circle";

export interface CanvasObject {
  id: string;
  type: "rect" | "circle";
  furnitureType: FurnitureType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  rotation: number;
  color: string;
  material?: Material;
  legHeight?: number;
  hasLegs?: boolean;
}

export interface RoomSettings {
  width: number;
  height: number;
  roomType?: "bedroom" | "living-room" | "kitchen" | "bathroom" | "office" | "custom";
}
