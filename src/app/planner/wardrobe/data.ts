import type {
  WardrobeComponentType,
  HandleStyle,
  WardrobeBaseConfig,
  DoorType,
  WardrobeDoorConfig,
  WardrobeConfig,
  GrainDirection,
  ShelfDepthPlacement,
} from "./types";
import type { Material } from "@/lib/types";
import {
  materialsFromStore as plannerMaterialsFromStore,
  doorFrontMaterialsFromStore as plannerDoorFrontMaterialsFromStore,
  slidingMechanismsFromStore as plannerSlidingMechanismsFromStore,
  handleMaterialsFromStore as plannerHandleMaterialsFromStore,
} from "@/lib/plannerMaterials";
import {
  DEFAULT_SHEET_HEIGHT_CM,
  DEFAULT_SHEET_WIDTH_CM,
  DEFAULT_KERF_MM,
} from "../sheet/sheetSpec";

// ── Frame presets ────────────────────────────────────────────────────

export const FRAME_WIDTHS = [50, 75, 100, 150, 200, 250, 300] as const;
export const FRAME_HEIGHTS = [201, 236] as const;
export const FRAME_DEPTHS = [35, 58] as const;

export const FRAME_MIN_WIDTH = 40;
export const FRAME_MAX_WIDTH = 400;
export const FRAME_MIN_HEIGHT = 180;
export const FRAME_MAX_HEIGHT = 260;
export const FRAME_MIN_DEPTH = 30;
export const FRAME_MAX_DEPTH = 90;

/** Floor / legs / plinth — lift under the carcass body (`frame.height` is body only). */
export const DEFAULT_WARDROBE_BASE: WardrobeBaseConfig = {
  type: "floor",
  legHeightCm: 10,
  plinthHeightCm: 10,
  plinthRecessCm: 0,
};

export const LEG_HEIGHT_MIN = 1;
export const LEG_HEIGHT_MAX = 20;
export const PLINTH_HEIGHT_MIN = 1;
export const PLINTH_HEIGHT_MAX = 20;
export const PLINTH_RECESS_MIN = 0;
export const PLINTH_RECESS_MAX = 25;

export function clampWardrobeBase(base: WardrobeBaseConfig): WardrobeBaseConfig {
  return {
    type: base.type,
    legHeightCm: Math.round(Math.min(LEG_HEIGHT_MAX, Math.max(LEG_HEIGHT_MIN, base.legHeightCm))),
    plinthHeightCm: Math.round(
      Math.min(PLINTH_HEIGHT_MAX, Math.max(PLINTH_HEIGHT_MIN, base.plinthHeightCm)),
    ),
    // Plinth front always flush with carcass — recess is deprecated but kept
    // on the type for backward-compatible persisted data.
    plinthRecessCm: 0,
  };
}

/** Vertical offset (cm) from room floor to the bottom of the carcass (above legs or plinth). */
export function wardrobeBaseLiftCm(base: WardrobeBaseConfig): number {
  const b = clampWardrobeBase(base);
  if (b.type === "legs") return b.legHeightCm;
  if (b.type === "plinth") return b.plinthHeightCm;
  return 0;
}

/** Overall furniture height from floor to top of carcass (cm). */
export function totalWardrobeHeightCm(frameHeightCm: number, base: WardrobeBaseConfig): number {
  return frameHeightCm + wardrobeBaseLiftCm(clampWardrobeBase(base));
}

export const PANEL_THICKNESS = 1.8; // cm

/**
 * With a plinth base, fronts extend to the outer carcass bottom (y ≈ 0) so they cover the
 * bottom rail (thickness {@link PANEL_THICKNESS}); otherwise ~1.8 cm of frame shows above the kick.
 */
export function wardrobePlinthFrontDropCm(base: WardrobeBaseConfig): number {
  return clampWardrobeBase(base).type === "plinth" ? PANEL_THICKNESS : 0;
}

/**
 * In-plane rotation for door + drawer front `BoxGeometry` only (laminate vs sheet/cuts).
 * Applied in WardrobeDoors3D + WardrobeInterior3D; handles stay unrotated.
 */
export const WARDROBE_FRONT_FACE_ROTATION_Z: [number, number, number] = [0, 0, Math.PI];

/**
 * Extra door/drawer front width (cm) beyond `sectionWidth + T` so the outer
 * left/right frame stiles are fully covered (not just half of each side panel).
 */
export function doorFrontExtraWidthCm(sectionIndex: number, sectionCount: number): number {
  const T = PANEL_THICKNESS;
  const first = sectionIndex === 0;
  const last = sectionIndex === sectionCount - 1;
  return (first ? T : 0) + (last ? T : 0) - (first && last ? T : 0);
}

/** Clearance between adjacent hinged door fronts (cm) — mirrors `WardrobeDoors3D` `DOOR_GAP`. */
export const WARDROBE_HINGED_DOOR_GAP_CM = 0.0006 / 0.01;

/** Clamped per-section hinged door count (default 1). */
export function hingedDoorCountForSection(count: number | undefined): number {
  const n = typeof count === "number" && Number.isFinite(count) ? Math.round(count) : 1;
  return Math.max(1, Math.min(4, n));
}

/**
 * Layout for the N hinged doors in one bay. The collective front span matches
 * the single-door case (`sectionWidth + T - 2*DOOR_GAP + extraW`) so outer
 * edges stay aligned with the carcass. Each door then gets an equal slice of
 * that span with `DOOR_GAP` of air on each of its own edges.
 */
export function hingedDoorsForSection(
  sectionWidthCm: number,
  sectionIndex: number,
  sectionCount: number,
  doorsPerSection: number,
): {
  /** Per-door width (cm). */
  doorWidthCm: number;
  /** Per-door center X offset from the bay center (cm). Length = N. */
  doorCenterOffsetsCm: number[];
  /** Full front span of this bay (cm, outer door-edge to outer door-edge incl. outer `DOOR_GAP`s). */
  sectionSpanCm: number;
} {
  const T = PANEL_THICKNESS;
  const DG = WARDROBE_HINGED_DOOR_GAP_CM;
  const n = hingedDoorCountForSection(doorsPerSection);
  const extraW = doorFrontExtraWidthCm(sectionIndex, sectionCount);
  const singleDoorW = sectionWidthCm + T - 2 * DG + extraW;
  const sectionSpanCm = singleDoorW; // matches width of the original single door
  const doorWidthCm = (sectionSpanCm - (n - 1) * 2 * DG) / n;
  const step = doorWidthCm + 2 * DG;
  const firstCenter = -sectionSpanCm / 2 + doorWidthCm / 2;
  const doorCenterOffsetsCm = Array.from(
    { length: n },
    (_, j) => firstCenter + j * step,
  );
  return { doorWidthCm, doorCenterOffsetsCm, sectionSpanCm };
}

/**
 * Handle side for hinged door `j` of N in a bay. For single-door bays the user
 * choice (`hingedDoorHandleSide`) wins; for N ≥ 2 doors default to French-door
 * style (left doors handle on the right, right doors handle on the left).
 */
export function hingedSubdoorHandleSide(
  doorIndex: number,
  doorCount: number,
): "left" | "right" {
  const n = hingedDoorCountForSection(doorCount);
  if (n === 1) return "right"; // placeholder; callers use section setting instead
  return doorIndex < n / 2 ? "right" : "left";
}

/**
 * Extra door height (cm) and vertical shift of door center (cm) so top/bottom
 * rails are fully overlapped on the laminate leaf.
 *
 * Always add full `T`: hinged bays with drawers are shortened afterward in
 * `hingedDoorPanelVerticalCm` so the door bottom meets the drawer stack;
 * using `T/2` here only (older behaviour) made door + drawers ~`T/2` (~0.9 cm)
 * shorter overall than an adjacent full-height door in the same frame.
 */
export function doorFrontExtraHeightCm(reductionCm: number): {
  dhExtraCm: number;
  centerYShiftCm: number;
} {
  const T = PANEL_THICKNESS;
  if (reductionCm <= 1e-9) {
    return { dhExtraCm: T, centerYShiftCm: 0 };
  }
  return { dhExtraCm: T, centerYShiftCm: T / 4 };
}

export const SHELF_PIN_SPACING = 3.2; // cm — vertical grid snap / default stack gap

/** Gap between stacked interior fittings (drawers, shelves); config override or default pin spacing. */
export function wardrobeInteriorStackGapCm(
  config: { interiorStackGapCm?: number },
): number {
  const g = config.interiorStackGapCm;
  if (g !== undefined && Number.isFinite(g)) {
    return Math.round(Math.min(15, Math.max(0, g)) * 10) / 10;
  }
  return SHELF_PIN_SPACING;
}
/** Minimum interior width per bay (cm) — dividers + storage usability */
export const SECTION_MIN_WIDTH_CM = 20;

/** Sum of section widths that fits inside the frame (interior minus vertical dividers). */
export function totalInteriorSectionWidthsCm(frameWidthCm: number, sectionCount: number): number {
  const interior = frameWidthCm - PANEL_THICKNESS * 2;
  const dividerSpace = (sectionCount - 1) * PANEL_THICKNESS;
  return Math.round((interior - dividerSpace) * 10) / 10;
}

/** Left edge of section `sectionIndex` (cm from wardrobe outer left, 0). */
export function sectionLeftEdgeCm(sections: { width: number }[], sectionIndex: number): number {
  let x = PANEL_THICKNESS;
  for (let k = 0; k < sectionIndex; k++) {
    x += sections[k].width + PANEL_THICKNESS;
  }
  return Math.round(x * 10) / 10;
}

/** Left edge of the vertical divider between section `dividerIndex` and `dividerIndex + 1` (cm). */
export function dividerLeftEdgeCm(sections: { width: number }[], dividerIndex: number): number {
  return Math.round((sectionLeftEdgeCm(sections, dividerIndex) + sections[dividerIndex].width) * 10) / 10;
}

/** Center of that divider panel (cm). */
export function dividerCenterCm(sections: { width: number }[], dividerIndex: number): number {
  return Math.round((dividerLeftEdgeCm(sections, dividerIndex) + PANEL_THICKNESS / 2) * 10) / 10;
}

// ── Component catalog ────────────────────────────────────────────────

export interface ComponentDef {
  type: WardrobeComponentType;
  name: string;
  description: string;
  defaultHeight: number; // cm
  minHeight: number;
  maxHeight: number;
  price: number;
}

export const COMPONENT_CATALOG: ComponentDef[] = [
  {
    type: "shelf",
    name: "Shelf",
    description: "Fixed horizontal shelf",
    defaultHeight: 1.8,
    minHeight: 1.8,
    maxHeight: 1.8,
    price: 15,
  },
  {
    type: "drawer",
    name: "Drawer",
    description: "Pull-out drawer with soft-close",
    defaultHeight: 17,
    minHeight: 17,
    maxHeight: 34,
    price: 45,
  },
  {
    type: "hanging-rod",
    name: "Hanging Rod",
    description: "Clothes rail for hangers",
    defaultHeight: 3,
    minHeight: 3,
    maxHeight: 3,
    price: 20,
  },
  {
    type: "pull-out-tray",
    name: "Pull-out Tray",
    description: "Pull-out wire basket tray",
    defaultHeight: 8,
    minHeight: 8,
    maxHeight: 15,
    price: 35,
  },
  {
    type: "shoe-rack",
    name: "Shoe Rack",
    description: "Angled shelf for shoes",
    defaultHeight: 5,
    minHeight: 5,
    maxHeight: 5,
    price: 25,
  },
  {
    type: "empty-section",
    name: "Empty Section",
    description: "Open space — no door coverage",
    defaultHeight: 30,
    minHeight: 10,
    maxHeight: 80,
    price: 0,
  },
];

export function getComponentDef(type: WardrobeComponentType): ComponentDef {
  return COMPONENT_CATALOG.find((c) => c.type === type)!;
}

/** Minimum shelf board width (cm). */
export const MIN_SHELF_WIDTH_CM = 15;
/** Same margin as cut list (`sw − 0.3`). */
export const SHELF_WIDTH_MARGIN_CM = 0.3;
export const MIN_SHELF_DEPTH_CM = 15;

export function shelfMaxWidthCm(sectionWidthCm: number): number {
  return Math.max(MIN_SHELF_WIDTH_CM, sectionWidthCm - SHELF_WIDTH_MARGIN_CM);
}

export function shelfEffectiveWidthCm(sectionWidthCm: number, shelfWidthCm?: number): number {
  const maxW = shelfMaxWidthCm(sectionWidthCm);
  if (shelfWidthCm == null || !Number.isFinite(shelfWidthCm)) return maxW;
  return Math.max(MIN_SHELF_WIDTH_CM, Math.min(maxW, Math.round(shelfWidthCm * 10) / 10));
}

/**
 * Board width in metres. Effective width in cm already includes the 3 mm
 * kerf vs the bay (`sw − 0.3` cm → `sw×0.01 − 0.003` m); do not subtract twice.
 */
export function shelfBoardWidthM(sectionWidthCm: number, shelfWidthCm?: number): number {
  const cm = shelfEffectiveWidthCm(sectionWidthCm, shelfWidthCm);
  return cm * 0.01;
}

export function shelfMaxDepthCm(frameDepthCm: number): number {
  return Math.max(MIN_SHELF_DEPTH_CM, frameDepthCm - 0.4);
}

/**
 * Board depth in metres. `interiorDepthM` is the working interior depth
 * (frame depth − side insets). When `shelfDepthCm` is omitted, uses almost
 * full depth (`interiorDepthM − 0.004`).
 */
export function shelfBoardDepthM(
  interiorDepthM: number,
  frameDepthCm: number,
  shelfDepthCm?: number,
): number {
  const fullM = Math.max(0.02, interiorDepthM - 0.004);
  if (shelfDepthCm == null || !Number.isFinite(shelfDepthCm)) return fullM;
  const maxCm = shelfMaxDepthCm(frameDepthCm);
  const cm = Math.max(MIN_SHELF_DEPTH_CM, Math.min(maxCm, Math.round(shelfDepthCm * 10) / 10));
  return Math.min(cm * 0.01, interiorDepthM - 0.002);
}

/** Offset along +Z (toward doors) for front / center / back placement. */
export function shelfDepthOffsetM(
  interiorDepthM: number,
  shelfDepthM: number,
  placement?: ShelfDepthPlacement,
): number {
  const pl: ShelfDepthPlacement = placement ?? "center";
  const slack = Math.max(0, interiorDepthM - shelfDepthM) / 2;
  if (pl === "front") return slack;
  if (pl === "back") return -slack;
  return 0;
}

/** Cut-list shelf board width (cm) — same as effective board span. */
export function shelfPanelWidthCm(sectionWidthCm: number, shelfWidthCm?: number): number {
  return Math.max(0.1, shelfEffectiveWidthCm(sectionWidthCm, shelfWidthCm));
}

export function shelfPanelDepthCm(frameDepthCm: number, shelfDepthCm?: number): number {
  const maxD = shelfMaxDepthCm(frameDepthCm);
  if (shelfDepthCm == null || !Number.isFinite(shelfDepthCm)) return Math.max(0.1, frameDepthCm - 0.4);
  return Math.max(0.1, Math.min(maxD, shelfDepthCm));
}

// ── Materials ────────────────────────────────────────────────────────

export type SurfaceType = "wood" | "matte" | "gloss" | "mirror" | "frosted-glass" | "smoked-glass";

export interface WardrobeMaterial {
  id: string;
  name: string;
  color: string; // hex
  roughness: number;
  metalness: number;
  priceMultiplier: number;
  imageUrl?: string;
  pricePerSqm?: number; // absolute price per sqm — used when available
  manufacturer?: string; // admin company name
  surfaceType?: SurfaceType;
  /** Laminate / wood / worktop sheet metadata (if applicable). */
  sheetWidthCm?: number;
  sheetHeightCm?: number;
  grainDirection?: "along_width" | "along_height" | "none";
  kerfMm?: number;
  /** Underlying admin catalog primary `type` — used to gate sheeted-material behavior. */
  materialType?: string;
  /** Full list when the admin set multiple types (e.g. laminate + MDF). */
  materialTypes?: string[];
  /** From `category` / `categories[0]` — used to group swatches in the sidebar. */
  categoryKey?: string;
  /**
   * Decor brand (e.g. Egger) from the catalog `manufacturer` field, or the admin
   * company when the row has no brand — used for the Door finish brand filter.
   */
  brandKey?: string;
}

/** No built-in frame swatches — finishes come from the admin catalog. */
export const FRAME_MATERIALS: WardrobeMaterial[] = [];

/** 1×1 PNG — enables sheet packer + UV sampling when catalog data is missing. */
const NEUTRAL_SHEET_TEXTURE_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

/**
 * Default finish when the catalog has no door/board rows. Shown in the Door finish picker
 * as the only option until real materials load. Also used for 3D when ids are missing.
 */
export const INTERNAL_RENDER_FALLBACK: WardrobeMaterial = {
  id: "_fallback",
  name: "Neutral",
  color: "#eceae5",
  roughness: 0.92,
  metalness: 0,
  priceMultiplier: 1,
  surfaceType: "matte",
  materialType: "laminate",
  imageUrl: NEUTRAL_SHEET_TEXTURE_URL,
  sheetWidthCm: DEFAULT_SHEET_WIDTH_CM,
  sheetHeightCm: DEFAULT_SHEET_HEIGHT_CM,
  grainDirection: "along_width",
  kerfMm: DEFAULT_KERF_MM,
  categoryKey: "default",
  manufacturer: "Default",
  brandKey: "default",
};

/** Kept empty — built-in list is `INTERNAL_RENDER_FALLBACK` via `withDefaultWardrobeDoorFinishes`. */
export const DOOR_MATERIALS: WardrobeMaterial[] = [];

/** Ensures the door-finish bar always has at least the built-in neutral swatch. */
export function withDefaultWardrobeDoorFinishes(mats: WardrobeMaterial[]): WardrobeMaterial[] {
  return mats.length > 0 ? mats : [INTERNAL_RENDER_FALLBACK];
}

export function getMaterial(id: string, extraMaterials?: WardrobeMaterial[]): WardrobeMaterial {
  if (extraMaterials) {
    const found = extraMaterials.find((m) => m.id === id);
    if (found) return found;
  }
  if (id === INTERNAL_RENDER_FALLBACK.id) return INTERNAL_RENDER_FALLBACK;
  return INTERNAL_RENDER_FALLBACK;
}

/** Door panel count for the active door mode (matches WardrobeDoors3D). */
export function wardrobeDoorPanelMaterialIdsLength(
  doorType: DoorType,
  frameWidthCm: number,
  sectionCount: number,
): number {
  if (doorType === "none") return 0;
  if (doorType === "hinged") return sectionCount;
  return Math.max(2, Math.ceil(frameWidthCm / 75));
}

/** In-plane gap between sliding door faces (cm) — matches `WardrobeDoors3D` `DOOR_GAP` (0.6 mm). */
export const WARDROBE_SLIDING_DOOR_GAP_CM = 0.0006 / 0.01;

/**
 * Sliding door panel widths (cm) for the clear front span and door count.
 * Overlap is 5% of the clear span so pairs cover when stacked; used by 3D,
 * laminate cut list, and sheet enumeration (stay in sync).
 */
export function slidingDoorPanelWidthsCm(
  frameWidthCm: number,
  doorCount: number,
): { spanW: number; overlap: number; doorW: number; slidePanelW: number } {
  const n = Math.max(2, doorCount);
  const spanW = frameWidthCm - 2 * WARDROBE_SLIDING_DOOR_GAP_CM;
  const overlap = spanW * 0.05;
  const doorW = (spanW + overlap * (n - 1)) / n;
  const slidePanelW = doorW - WARDROBE_SLIDING_DOOR_GAP_CM;
  return { spanW, overlap, doorW, slidePanelW };
}

/** Resize panel id list when bay count or sliding panel count changes; new slots copy index 0. */
export function resizeDoorPanelMaterialIds(
  prev: string[],
  newLen: number,
  defaultId: string,
): string[] {
  if (newLen === 0) return [];
  const seed = prev.length > 0 ? prev[0]! : defaultId;
  return Array.from({ length: newLen }, (_, i) => (i < prev.length ? prev[i]! : seed));
}

/** Resize per-panel grain list to match door count; new slots copy index 0. */
export function resizeDoorPanelGrainDirections(
  prev: GrainDirection[],
  newLen: number,
  defaultDir: GrainDirection,
): GrainDirection[] {
  if (newLen === 0) return [];
  const seed = prev.length > 0 ? prev[0]! : defaultDir;
  return Array.from({ length: newLen }, (_, i) => (i < prev.length ? prev[i]! : seed));
}

/** Keep `doorPanelMaterialIds` length in sync with frame, sections, and door type. */
export function syncDoorPanelMaterialIds(config: WardrobeConfig): WardrobeConfig {
  const { doors, frame, sections } = config;
  const targetLen = wardrobeDoorPanelMaterialIdsLength(doors.type, frame.width, sections.length);
  const next = resizeDoorPanelMaterialIds(
    doors.doorPanelMaterialIds,
    targetLen,
    INTERNAL_RENDER_FALLBACK.id,
  );
  if (
    next.length === doors.doorPanelMaterialIds.length &&
    next.every((id, i) => id === doors.doorPanelMaterialIds[i])
  ) {
    return config;
  }
  return {
    ...config,
    doors: { ...doors, doorPanelMaterialIds: next },
  };
}

/** Keep `doorPanelGrainDirections` the same length as `doorPanelMaterialIds`. */
export function syncDoorPanelGrainDirections(config: WardrobeConfig): WardrobeConfig {
  const { doors } = config;
  const targetLen = doors.doorPanelMaterialIds.length;
  const prev = doors.doorPanelGrainDirections ?? [];
  const base = config.doorGrainDirection ?? "horizontal";
  const next = resizeDoorPanelGrainDirections(prev, targetLen, base);
  if (
    next.length === prev.length &&
    next.every((g, i) => g === (prev[i] ?? base))
  ) {
    return config;
  }
  return {
    ...config,
    doors: { ...doors, doorPanelGrainDirections: next },
  };
}

/** After material ids change, resize grain arrays to match. */
export function syncDoorPanelArrays(config: WardrobeConfig): WardrobeConfig {
  return syncDoorPanelGrainDirections(syncDoorPanelMaterialIds(config));
}

/** First panel finish — legacy helper for single-id consumers. */
export function wardrobeDoorPanelMaterialId(doors: WardrobeDoorConfig): string {
  return doors.doorPanelMaterialIds[0] ?? INTERNAL_RENDER_FALLBACK.id;
}

/**
 * Drawer / door front material for a section index.
 * Sliding doors: section→panel mapping is ambiguous — use first panel’s finish for all bays.
 */
export function wardrobeDoorPanelMaterialIdForSection(
  doors: WardrobeDoorConfig,
  sectionIndex: number,
): string {
  const ids = doors.doorPanelMaterialIds;
  if (ids.length === 0) return INTERNAL_RENDER_FALLBACK.id;
  if (doors.type === "hinged") {
    return ids[sectionIndex] ?? ids[0]!;
  }
  return ids[0]!;
}

/** Grain for drawer / door fronts by section. Sliding: first panel’s grain for all bays. */
export function wardrobeDoorPanelGrainForSection(
  doors: WardrobeDoorConfig,
  fallback: GrainDirection,
  sectionIndex: number,
): GrainDirection {
  const g = doors.doorPanelGrainDirections;
  if (g.length === 0) return fallback;
  if (doors.type === "hinged") {
    return g[sectionIndex] ?? g[0] ?? fallback;
  }
  return g[0] ?? fallback;
}

// ── Convert admin store materials → WardrobeMaterial ─────────────────

/** Exact names from the old built-in frame/door swatches — hide if still present in DB. */
const LEGACY_BUILTIN_FINISH_NAMES = new Set(
  [
    "White",
    "White Gloss",
    "Birch",
    "Oak",
    "Light Oak",
    "Natural Oak",
    "Walnut",
    "Black-Brown",
    "Dark Grey",
    "Grey-Beige",
    "Anthracite",
    "Mirror",
    "Frosted Glass",
    "Smoked Glass",
    "Pine",
    "White Pine",
    "Yellow Pine",
    "Knotty Pine",
    "Southern Pine",
    "Light Pine",
    "Honey Pine",
  ].map((s) => s.toLowerCase()),
);

function isLegacyBuiltinFinishName(name: string): boolean {
  return LEGACY_BUILTIN_FINISH_NAMES.has(name.trim().toLowerCase());
}

function toWardrobeSwatch(
  m: Omit<WardrobeMaterial, "surfaceType" | "brandKey"> & {
    surfaceType?: SurfaceType | string;
    manufacturer?: string;
    categoryKey?: string;
  },
): WardrobeMaterial {
  const n = m.name.toLowerCase();
  let surfaceType = (m.surfaceType === "glass" ? "frosted-glass" : m.surfaceType) as SurfaceType;
  if (n.includes("mirror") && !n.includes("frost") && !n.includes("smoked")) {
    surfaceType = "mirror";
  }
  const brandKey = wardrobeBrandKeyFromSwatch(m);
  return {
    ...m,
    surfaceType,
    brandKey,
  };
}

function wardrobeBrandKeyFromSwatch(m: { manufacturer?: string; categoryKey?: string }): string {
  if (m.manufacturer && m.manufacturer.trim() !== "") {
    return m.manufacturer.trim().toLowerCase().replace(/\s+/g, " ");
  }
  if (m.categoryKey === "default") return "default";
  return "other";
}

export function materialsFromStore(
  storeMaterials: Material[],
  manufacturerName?: string,
): WardrobeMaterial[] {
  return plannerMaterialsFromStore(storeMaterials, manufacturerName, { forWardrobe: true })
    .filter((m) => !isLegacyBuiltinFinishName(m.name))
    .map(toWardrobeSwatch);
}

/** Door panel swatches: laminate, mdf, wood, slide, or hinge; worktop-typed lines omitted. */
export function doorFrontMaterialsFromStore(
  storeMaterials: Material[],
  manufacturerName?: string,
): WardrobeMaterial[] {
  return plannerDoorFrontMaterialsFromStore(storeMaterials, manufacturerName)
    .filter((m) => !isLegacyBuiltinFinishName(m.name))
    .map(toWardrobeSwatch);
}

/** Sliding track systems — admin materials with `type` `slide`. */
export function slidingMechanismsFromStore(
  storeMaterials: Material[],
  manufacturerName?: string,
): WardrobeMaterial[] {
  return plannerSlidingMechanismsFromStore(storeMaterials, manufacturerName).map(toWardrobeSwatch);
}

/** Handle finishes — admin materials with `type` `handle` or `category`/`categories` `handle`. */
export function handleMaterialsFromStore(
  storeMaterials: Material[],
  manufacturerName?: string,
): WardrobeMaterial[] {
  return plannerHandleMaterialsFromStore(storeMaterials, manufacturerName).map(toWardrobeSwatch);
}

const CATEGORY_ORDER = [
  "default",
  "surface",
  "frame",
  "finish",
  "door",
  "worktop",
  "hardware",
  "handle",
  "upholstery",
  "other",
];

/** Group finish swatches by primary catalog category for the wardrobe sidebar. */
export function groupWardrobeMaterialsByCategory(
  mats: WardrobeMaterial[],
): { key: string; label: string; items: WardrobeMaterial[] }[] {
  const bucket = new Map<string, WardrobeMaterial[]>();
  for (const m of mats) {
    const key = (m.categoryKey ?? "other").toLowerCase();
    if (!bucket.has(key)) bucket.set(key, []);
    bucket.get(key)!.push(m);
  }
  const keys = [...bucket.keys()];
  keys.sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b);
  });
  return keys.map((key) => ({
    key,
    label: formatWardrobeCategoryLabel(key),
    items: bucket.get(key)!,
  }));
}

function formatWardrobeCategoryLabel(key: string): string {
  if (key === "other") return "Other";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

const BRAND_GROUP_PRIORITY = ["default"] as const;

/** Group door/carcass swatches by decor brand (`brandKey` / manufacturer). */
export function groupWardrobeMaterialsByBrand(
  mats: WardrobeMaterial[],
): { key: string; label: string; items: WardrobeMaterial[] }[] {
  const bucket = new Map<string, WardrobeMaterial[]>();
  for (const m of mats) {
    const key = m.brandKey ?? "other";
    if (!bucket.has(key)) bucket.set(key, []);
    bucket.get(key)!.push(m);
  }
  const keys = [...bucket.keys()];
  keys.sort((a, b) => {
    const ad = (BRAND_GROUP_PRIORITY as readonly string[]).indexOf(a);
    const bd = (BRAND_GROUP_PRIORITY as readonly string[]).indexOf(b);
    if (ad !== -1 && bd !== -1) return ad - bd;
    if (ad !== -1) return -1;
    if (bd !== -1) return 1;
    if (a === "other") return 1;
    if (b === "other") return -1;
    return a.localeCompare(b);
  });
  return keys.map((key) => ({
    key,
    label: formatWardrobeBrandLabel(key),
    items: bucket.get(key)!,
  }));
}

export function formatWardrobeBrandLabel(key: string): string {
  if (key === "other") return "Other";
  if (key === "default") return "Default";
  return key
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" · ");
}

// ── Handles ──────────────────────────────────────────────────────────

export interface HandleDef {
  id: HandleStyle;
  name: string;
  price: number;
}

export const HANDLES: HandleDef[] = [
  { id: "none", name: "No handle", price: 0 },
  { id: "bar-steel", name: "Bar — Brushed Nickel", price: 8 },
  { id: "bar-black", name: "Bar — Matte Black", price: 8 },
  { id: "bar-brass", name: "Bar — Brushed Brass", price: 12 },
  { id: "knob-steel", name: "Knob — Satin Chrome", price: 5 },
  { id: "knob-black", name: "Knob — Matte Black", price: 5 },
];

export const HANDLE_COLORS: Record<Exclude<HandleStyle, "none">, { color: string; roughness: number; metalness: number }> = {
  "bar-steel": { color: "#a8a8a8", roughness: 0.28, metalness: 0.85 },
  "bar-black": { color: "#1a1a1a", roughness: 0.45, metalness: 0.3 },
  "bar-brass": { color: "#c5a55a", roughness: 0.3, metalness: 0.8 },
  "knob-steel": { color: "#b0b0b0", roughness: 0.22, metalness: 0.9 },
  "knob-black": { color: "#1a1a1a", roughness: 0.45, metalness: 0.3 },
};

// ── Templates ────────────────────────────────────────────────────────

export interface WardrobeTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  config: import("./types").WardrobeConfig;
}

function templateSections(frameWidth: number, count: number): import("./types").WardrobeSection[] {
  const interior = frameWidth - PANEL_THICKNESS * 2;
  const dividerSpace = (count - 1) * PANEL_THICKNESS;
  const sectionWidth = (interior - dividerSpace) / count;
  return Array.from({ length: count }, (_, i) => ({
    id: `tmpl-${count}-${i}`,
    width: Math.round(sectionWidth * 10) / 10,
    components: [],
  }));
}

function templateSectionsWithComponents(
  frameWidth: number,
  sectionDefs: { components: { type: import("./types").WardrobeComponentType; y: number; h: number }[] }[]
): import("./types").WardrobeSection[] {
  const count = sectionDefs.length;
  const interior = frameWidth - PANEL_THICKNESS * 2;
  const dividerSpace = (count - 1) * PANEL_THICKNESS;
  const sectionWidth = (interior - dividerSpace) / count;
  return sectionDefs.map((def, i) => ({
    id: `tmpl-${count}-${i}`,
    width: Math.round(sectionWidth * 10) / 10,
    components: def.components.map((c, j) => ({
      id: `tmpl-comp-${i}-${j}`,
      type: c.type,
      yPosition: c.y,
      height: c.h,
    })),
  }));
}

export const WARDROBE_TEMPLATES: WardrobeTemplate[] = [
  {
    id: "empty",
    name: "Start from Scratch",
    description: "Empty frame — build your own design",
    icon: "plus",
    config: {
      frame: { width: 150, height: 236, depth: 58 },
      base: { ...DEFAULT_WARDROBE_BASE },
      sections: templateSections(150, 2),
      doors: {
        type: "none",
        doorPanelMaterialIds: [],
        doorPanelGrainDirections: [],
        slidingMechanismId: INTERNAL_RENDER_FALLBACK.id,
        handle: "bar-steel",
      },
      frameMaterial: INTERNAL_RENDER_FALLBACK.id,
      interiorMaterial: INTERNAL_RENDER_FALLBACK.id,
    },
  },
  {
    id: "compact",
    name: "Compact Single",
    description: "75 cm single-section with shelves and rod",
    icon: "layout",
    config: {
      frame: { width: 75, height: 236, depth: 58 },
      base: { ...DEFAULT_WARDROBE_BASE },
      sections: templateSectionsWithComponents(75, [
        {
          components: [
            { type: "shelf", y: 0, h: 1.8 },
            { type: "shelf", y: 38.4, h: 1.8 },
            { type: "hanging-rod", y: 105, h: 3 },
            { type: "shelf", y: 192, h: 1.8 },
          ],
        },
      ]),
      doors: {
        type: "hinged",
        doorPanelMaterialIds: [INTERNAL_RENDER_FALLBACK.id],
        doorPanelGrainDirections: ["horizontal"],
        slidingMechanismId: INTERNAL_RENDER_FALLBACK.id,
        handle: "bar-steel",
      },
      frameMaterial: INTERNAL_RENDER_FALLBACK.id,
      interiorMaterial: INTERNAL_RENDER_FALLBACK.id,
    },
  },
  {
    id: "classic-duo",
    name: "Classic Double",
    description: "150 cm with hanging and shelving zones",
    icon: "columns",
    config: {
      frame: { width: 150, height: 236, depth: 58 },
      base: { ...DEFAULT_WARDROBE_BASE },
      sections: templateSectionsWithComponents(150, [
        {
          components: [
            { type: "shelf", y: 0, h: 1.8 },
            { type: "shelf", y: 25.6, h: 1.8 },
            { type: "shelf", y: 51.2, h: 1.8 },
            { type: "shelf", y: 76.8, h: 1.8 },
            { type: "hanging-rod", y: 115, h: 3 },
          ],
        },
        {
          components: [
            { type: "drawer", y: 0, h: 17 },
            { type: "drawer", y: 17, h: 17 },
            { type: "hanging-rod", y: 60, h: 3 },
            { type: "shelf", y: 160, h: 1.8 },
          ],
        },
      ]),
      doors: {
        type: "hinged",
        doorPanelMaterialIds: [INTERNAL_RENDER_FALLBACK.id, INTERNAL_RENDER_FALLBACK.id],
        doorPanelGrainDirections: ["horizontal", "horizontal"],
        slidingMechanismId: INTERNAL_RENDER_FALLBACK.id,
        handle: "bar-steel",
      },
      frameMaterial: INTERNAL_RENDER_FALLBACK.id,
      interiorMaterial: INTERNAL_RENDER_FALLBACK.id,
    },
  },
  {
    id: "walk-in",
    name: "Wide Walk-in",
    description: "250 cm with 4 organized sections",
    icon: "maximize",
    config: {
      frame: { width: 250, height: 236, depth: 58 },
      base: { ...DEFAULT_WARDROBE_BASE },
      sections: templateSectionsWithComponents(250, [
        {
          components: [
            { type: "shelf", y: 0, h: 1.8 },
            { type: "shelf", y: 25.6, h: 1.8 },
            { type: "shelf", y: 51.2, h: 1.8 },
            { type: "shoe-rack", y: 76.8, h: 5 },
          ],
        },
        {
          components: [
            { type: "drawer", y: 0, h: 17 },
            { type: "drawer", y: 17, h: 17 },
            { type: "hanging-rod", y: 60, h: 3 },
          ],
        },
        {
          components: [
            { type: "hanging-rod", y: 0, h: 3 },
            { type: "shelf", y: 115, h: 1.8 },
            { type: "hanging-rod", y: 128, h: 3 },
          ],
        },
        {
          components: [
            { type: "pull-out-tray", y: 0, h: 8 },
            { type: "pull-out-tray", y: 12.8, h: 8 },
            { type: "shelf", y: 38.4, h: 1.8 },
            { type: "shelf", y: 64, h: 1.8 },
            { type: "shelf", y: 89.6, h: 1.8 },
          ],
        },
      ]),
      doors: {
        type: "sliding",
        doorPanelMaterialIds: Array.from({ length: Math.max(2, Math.ceil(250 / 75)) }, () => INTERNAL_RENDER_FALLBACK.id),
        doorPanelGrainDirections: Array.from({ length: Math.max(2, Math.ceil(250 / 75)) }, () => "horizontal" as const),
        slidingMechanismId: INTERNAL_RENDER_FALLBACK.id,
        handle: "none",
      },
      frameMaterial: INTERNAL_RENDER_FALLBACK.id,
      interiorMaterial: INTERNAL_RENDER_FALLBACK.id,
    },
  },
  {
    id: "dresser",
    name: "Dresser Style",
    description: "200 cm with drawer-heavy layout",
    icon: "archive",
    config: {
      frame: { width: 200, height: 236, depth: 58 },
      base: { ...DEFAULT_WARDROBE_BASE },
      sections: templateSectionsWithComponents(200, [
        {
          components: [
            { type: "drawer", y: 0, h: 17 },
            { type: "drawer", y: 17, h: 17 },
            { type: "drawer", y: 34, h: 17 },
            { type: "hanging-rod", y: 80, h: 3 },
          ],
        },
        {
          components: [
            { type: "drawer", y: 0, h: 17 },
            { type: "drawer", y: 17, h: 17 },
            { type: "drawer", y: 34, h: 17 },
            { type: "shelf", y: 80, h: 1.8 },
            { type: "shelf", y: 105.6, h: 1.8 },
          ],
        },
        {
          components: [
            { type: "shelf", y: 0, h: 1.8 },
            { type: "shelf", y: 25.6, h: 1.8 },
            { type: "hanging-rod", y: 60, h: 3 },
            { type: "shelf", y: 160, h: 1.8 },
          ],
        },
      ]),
      doors: {
        type: "hinged",
        doorPanelMaterialIds: [
          INTERNAL_RENDER_FALLBACK.id,
          INTERNAL_RENDER_FALLBACK.id,
          INTERNAL_RENDER_FALLBACK.id,
        ],
        doorPanelGrainDirections: ["horizontal", "horizontal", "horizontal"],
        slidingMechanismId: INTERNAL_RENDER_FALLBACK.id,
        handle: "bar-brass",
      },
      frameMaterial: INTERNAL_RENDER_FALLBACK.id,
      interiorMaterial: INTERNAL_RENDER_FALLBACK.id,
    },
  },
  {
    id: "office-nook",
    name: "Office Nook",
    description: "120 cm with drawers and open shelving",
    icon: "archive",
    config: {
      frame: { width: 120, height: 201, depth: 58 },
      base: { ...DEFAULT_WARDROBE_BASE },
      sections: templateSectionsWithComponents(120, [
        {
          components: [
            { type: "drawer", y: 0, h: 17 },
            { type: "drawer", y: 17, h: 17 },
            { type: "shelf", y: 44, h: 1.8 },
            { type: "shelf", y: 70, h: 1.8 },
            { type: "shelf", y: 96, h: 1.8 },
          ],
        },
      ]),
      doors: {
        type: "hinged",
        doorPanelMaterialIds: [INTERNAL_RENDER_FALLBACK.id],
        doorPanelGrainDirections: ["horizontal"],
        slidingMechanismId: INTERNAL_RENDER_FALLBACK.id,
        handle: "knob-steel",
      },
      frameMaterial: INTERNAL_RENDER_FALLBACK.id,
      interiorMaterial: INTERNAL_RENDER_FALLBACK.id,
    },
  },
];

// ── Pricing ──────────────────────────────────────────────────────────

function frameSizeTier(width: number, height: number): number {
  const area = (width / 100) * (height / 100); // m²
  if (area < 1) return 120;
  if (area < 2) return 200;
  if (area < 3) return 300;
  if (area < 5) return 420;
  return 550;
}

export interface PriceBreakdown {
  frame: number;
  sections: number;
  components: number;
  doors: number;
  handles: number;
  /** Sliding track / roller set (sliding doors only) */
  slidingMechanism: number;
  /** Leg or plinth hardware / labour estimate */
  baseOption: number;
  materialSurcharge: number;
  total: number;
}

/** Calculate exterior surface area in sqm for material pricing */
function frameSurfaceArea(w: number, h: number, d: number): number {
  return 2 * (w * h + w * d + h * d) / 10000;
}

function wardrobeHandlePricePerDoor(
  doors: import("./types").WardrobeDoorConfig,
  handleMaterials?: WardrobeMaterial[],
): number {
  const id = doors.handleMaterialId;
  if (id && handleMaterials?.length) {
    const h = handleMaterials.find((m) => m.id === id);
    if (h?.pricePerSqm != null) return h.pricePerSqm;
  }
  const handleDef = HANDLES.find((h) => h.id === doors.handle);
  return handleDef?.price ?? 8;
}

export function calculatePrice(
  config: import("./types").WardrobeConfig,
  availableMaterials?: WardrobeMaterial[],
  slidingMechanisms?: WardrobeMaterial[],
  handleMaterials?: WardrobeMaterial[],
): PriceBreakdown {
  const { frame, sections, doors, frameMaterial, interiorMaterial } = config;
  const base = clampWardrobeBase(config.base ?? DEFAULT_WARDROBE_BASE);

  let baseOption = 0;
  if (base.type === "legs") {
    baseOption = Math.round(40 + (base.legHeightCm - LEG_HEIGHT_MIN) * 4);
  } else if (base.type === "plinth") {
    baseOption = Math.round(55 + base.plinthHeightCm * 2.5 + base.plinthRecessCm * 3);
  }

  const frameBase = frameSizeTier(frame.width, frame.height);
  const sectionSurcharge = Math.max(0, sections.length - 1) * 25;

  let componentTotal = 0;
  for (const section of sections) {
    for (const comp of section.components) {
      const def = getComponentDef(comp.type);
      componentTotal += def.price;
    }
  }

  let doorPrice = 0;
  let handlePrice = 0;
  let mechanismPrice = 0;
  if (doors.type !== "none") {
    const doorCount = doors.doorPanelMaterialIds.length;
    for (let i = 0; i < doorCount; i++) {
      const panelMatId = doors.doorPanelMaterialIds[i] ?? INTERNAL_RENDER_FALLBACK.id;
      const doorMat = getMaterial(panelMatId, availableMaterials);
      doorPrice += 60 * doorMat.priceMultiplier;
    }

    handlePrice = doorCount * wardrobeHandlePricePerDoor(doors, handleMaterials);

    if (doors.type === "sliding") {
      const mechPools = slidingMechanisms?.length ? slidingMechanisms : availableMaterials;
      const mech = getMaterial(doors.slidingMechanismId, mechPools);
      const trackBase = Math.max(90, frame.width * 0.6);
      mechanismPrice = Math.round(
        mech.pricePerSqm != null ? mech.pricePerSqm : trackBase * mech.priceMultiplier,
      );
    }
  }

  const frameMat = getMaterial(frameMaterial, availableMaterials);
  const intMat = getMaterial(interiorMaterial, availableMaterials);

  let materialSurcharge: number;
  if (frameMat.pricePerSqm != null || intMat.pricePerSqm != null) {
    const area = frameSurfaceArea(frame.width, frame.height, frame.depth);
    const frameCost = (frameMat.pricePerSqm ?? 0) * area * 0.6;
    const intCost = (intMat.pricePerSqm ?? 0) * area * 0.4;
    materialSurcharge = Math.round(frameCost + intCost);
  } else {
    const avgMultiplier = (frameMat.priceMultiplier + intMat.priceMultiplier) / 2;
    materialSurcharge = Math.round((frameBase + componentTotal) * (avgMultiplier - 1));
  }

  const total =
    frameBase +
    sectionSurcharge +
    componentTotal +
    doorPrice +
    handlePrice +
    mechanismPrice +
    baseOption +
    materialSurcharge;

  return {
    frame: frameBase,
    sections: sectionSurcharge,
    components: componentTotal,
    doors: Math.round(doorPrice),
    handles: Math.round(handlePrice),
    slidingMechanism: Math.round(mechanismPrice),
    baseOption: Math.round(baseOption),
    materialSurcharge,
    total: Math.round(total),
  };
}
