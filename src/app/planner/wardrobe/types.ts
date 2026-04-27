import type { FloorStyle } from "../types";
import type { GrainDirection } from "../textureRepeat";

export type { GrainDirection } from "../textureRepeat";

export type WardrobeSheetSizeOverrideCm = { widthCm: number; heightCm: number };

export type WardrobeComponentType =
  | "shelf"
  | "drawer"
  | "hanging-rod"
  | "pull-out-tray"
  | "shoe-rack"
  | "empty-section";

/** Position of a shelf board along the bay depth (doors = front, +Z). */
export type ShelfDepthPlacement = "front" | "center" | "back";

export interface WardrobeComponent {
  id: string;
  type: WardrobeComponentType;
  yPosition: number; // cm from bottom of interior
  height: number; // cm
  grainDirection?: GrainDirection;
  /**
   * Shelf-only: span width in cm (≤ section width − margin). Omit = use full
   * bay width (centered).
   */
  shelfWidthCm?: number;
  /**
   * Shelf-only: board depth in cm (≤ frame depth − margin). Omit = full
   * interior depth; shortening frees space to use {@link shelfDepthPlacement}.
   */
  shelfDepthCm?: number;
  /** Shelf-only: slide the board toward the doors, back wall, or centered. */
  shelfDepthPlacement?: ShelfDepthPlacement;
}

/** Hinged door for this bay — omit for alternating (even = right, odd = left). */
export type HingedDoorHandleSide = "left" | "right";

export interface WardrobeSection {
  id: string;
  width: number; // cm
  components: WardrobeComponent[];
  /**
   * When wardrobe doors are hinged and this bay has a single door: handle on
   * this panel edge. For multi-door bays (`hingedDoorCount >= 2`) the
   * handles are auto-placed so that the doors meet in the middle (French
   * doors) and this field is ignored.
   */
  hingedDoorHandleSide?: HingedDoorHandleSide;
  /**
   * Number of hinged doors in front of this bay. Default 1 (single door).
   * Set to 2 for French-door style (two doors meeting in the middle) — the
   * carcass remains a single open section (no vertical divider between the
   * doors). Only applies when `doors.type === "hinged"`.
   */
  hingedDoorCount?: number;
}

export type DoorType = "none" | "hinged" | "sliding";
export type HandleStyle = "none" | "bar-steel" | "bar-black" | "bar-brass" | "knob-steel" | "knob-black";

export interface WardrobeDoorConfig {
  type: DoorType;
  /**
   * Finish per physical door panel for the current `type` (length 0 when `none`).
   * Hinged: one per section; sliding: `max(2, ceil(frame.width / 75))` (matches 3D).
   */
  doorPanelMaterialIds: string[];
  /** Wood grain direction per door panel — same length as `doorPanelMaterialIds`. */
  doorPanelGrainDirections: GrainDirection[];
  /** Sliding track / roller system (`type` slide in admin catalog) */
  slidingMechanismId: string;
  handle: HandleStyle;
  /** Optional catalog handle finish (`type` or `category` handle); overrides default solid color / preset price when set. */
  handleMaterialId?: string;
}

export interface WardrobeFrame {
  width: number; // cm
  height: number; // cm
  depth: number; // cm
}

/** How the carcass meets the floor — body height stays `frame.height`; base adds lift below. */
export type WardrobeBaseType = "floor" | "legs" | "plinth";

export interface WardrobeBaseConfig {
  type: WardrobeBaseType;
  /** Clearance under the carcass (cm) — `legs` only; typical 8–15 */
  legHeightCm: number;
  /** Kick / plinth zone height (cm) — `plinth` only */
  plinthHeightCm: number;
  /** Front setback of the plinth face from the cabinet front (cm) — `plinth` only */
  plinthRecessCm: number;
}

export interface RoomSettings {
  wallColor: string;
  floorStyle: FloorStyle;
}

/**
 * Secondary wardrobe module. Attaches to the primary wardrobe either to the
 * right (horizontal addon — extends wardrobe width) or on top (vertical
 * addon — extends wardrobe height). Each addon renders an identical copy
 * of the primary wardrobe's body at the computed offset. Designers use
 * these when the primary wardrobe's panels would exceed the material's
 * sheet size (see the sheet viewer's overflow warning).
 */
export interface WardrobeAddon {
  id: string;
  /**
   * "right" = placed to the right of the previous module (x+= wardrobe width + seam).
   * "top"   = placed on top of the previous module (y+= wardrobe height + seam).
   */
  position: "right" | "top";
}

export interface WardrobeConfig {
  frame: WardrobeFrame;
  base: WardrobeBaseConfig;
  sections: WardrobeSection[];
  doors: WardrobeDoorConfig;
  frameMaterial: string;
  interiorMaterial: string;
  frameGrainDirection?: GrainDirection;
  interiorGrainDirection?: GrainDirection;
  doorGrainDirection?: GrainDirection;
  /**
   * Additional modules attached to the primary wardrobe. Each addon is a
   * duplicate of the primary at a computed offset. Empty by default — the
   * planner stays a single module until the user clicks "Add addon".
   */
  addons?: WardrobeAddon[];
  /**
   * Seam treatment between adjacent modules. `independent` keeps each
   * module's own side panels (two panels meet at a 3.6 cm seam); `shared`
   * removes one side at the seam so the touching panels fuse visually.
   * Default: `independent`.
   */
  seamStyle?: "independent" | "shared";
  /**
   * Vertical gap between stacked interior components (cm), e.g. between drawer
   * bodies. Defaults to shelf pin spacing (3.2).
   */
  interiorStackGapCm?: number;
  /**
   * Per-panel override of the default front/non-front classification used by
   * the optimizer. Keyed by `PanelMeta.id` (addon-namespaced). A missing key
   * falls back to `isFrontPanelDefault(role)`.
   */
  panelFrontOverrides?: Record<string, boolean>;
}

export type ViewMode = "perspective" | "front" | "side";

export type PlannerStep = "frame" | "sections" | "interior" | "doors" | "finish";

export interface WardrobeUIState {
  selectedSectionId: string | null;
  selectedComponentId: string | null;
  showDoors: boolean;
  viewMode: ViewMode;
  activeStep: PlannerStep;
  showTemplates: boolean;
  showDimensions: boolean;
  /** True while dragging a vertical section divider (disables orbit). */
  dividerDragActive: boolean;
  /** Whether the user chose to customise each door panel individually. */
  customizeEachDoor: boolean;
}

/** @see ../sheet/placementSheetOverrides — persisted sheet viewer tweaks (3D/planner). */
export type WardrobeSheetPlacementOverride = import("../sheet/placementSheetOverrides").SheetPlacementOverride;

export interface WardrobeState {
  config: WardrobeConfig;
  room: RoomSettings;
  ui: WardrobeUIState;
  availableMaterials: import("../wardrobe/data").WardrobeMaterial[];
  availableDoorMaterials: import("../wardrobe/data").WardrobeMaterial[];
  availableSlidingMechanisms: import("../wardrobe/data").WardrobeMaterial[];
  availableHandleMaterials: import("../wardrobe/data").WardrobeMaterial[];

  /**
   * Manual sheet layout adjustments (drag / 90° preview), keyed by
   * `materialId|sheetIndex|panelId`. Applied to packer output in
   * `useWardrobeSheetLayout` so 3D and the sheet view stay in sync.
   */
  sheetPlacementOverrides: Record<string, WardrobeSheetPlacementOverride>;

  /**
   * Extra empty boards per catalog material for the sheet viewer (indices after
   * the packer’s last sheet). Not part of undo history.
   */
  sheetManualExtraSheetsByMaterial: Record<string, number>;

  /**
   * When set, wardrobe sheet packing (viewer + 3D UV) uses this width/height
   * for every sheeted material instead of each row’s catalog size.
   */
  wardrobeSheetSizeOverrideCm: WardrobeSheetSizeOverrideCm | null;

  /** Undo/redo history */
  history: WardrobeConfig[];
  historyIndex: number;
  canUndo: boolean;
  canRedo: boolean;

  setAvailableMaterials: (
    frame: import("../wardrobe/data").WardrobeMaterial[],
    door: import("../wardrobe/data").WardrobeMaterial[],
    slidingMechanisms: import("../wardrobe/data").WardrobeMaterial[],
    handleMaterials: import("../wardrobe/data").WardrobeMaterial[],
  ) => void;

  setSheetPlacementOverrides: (
    update:
      | Record<string, WardrobeSheetPlacementOverride>
      | ((prev: Record<string, WardrobeSheetPlacementOverride>) => Record<string, WardrobeSheetPlacementOverride>),
  ) => void;
  clearSheetPlacementOverrides: () => void;

  bumpSheetManualExtraSheets: (materialId: string) => void;

  setWardrobeSheetSizeOverride: (value: WardrobeSheetSizeOverrideCm | null) => void;

  // Frame
  setFrameWidth: (w: number) => void;
  setFrameHeight: (h: number) => void;
  setFrameDepth: (d: number) => void;

  setWardrobeBaseType: (type: WardrobeBaseType) => void;
  setWardrobeLegHeightCm: (cm: number) => void;
  setWardrobePlinthHeightCm: (cm: number) => void;
  setWardrobePlinthRecessCm: (cm: number) => void;

  // Sections
  setSectionCount: (count: number) => void;
  /** Set width (cm) for a section; when there are multiple bays, the last section absorbs the remainder. */
  setSectionWidth: (sectionId: string, width: number) => void;
  /** Move the divider between `dividerIndex` and `dividerIndex + 1` so the left bay has `newLeftWidthCm`. */
  adjustSectionDivider: (dividerIndex: number, newLeftWidthCm: number) => void;
  setDividerDragActive: (active: boolean) => void;
  setSectionHingedDoorHandleSide: (sectionId: string, side: HingedDoorHandleSide) => void;
  /** 1 = single hinged door, 2 = French-doors. Clamped to [1, 4]. */
  setSectionHingedDoorCount: (sectionId: string, count: number) => void;

  // Components
  addComponent: (sectionId: string, type: WardrobeComponentType) => void;
  duplicateComponent: (sectionId: string, componentId: string) => void;
  removeComponent: (sectionId: string, componentId: string) => void;
  moveComponent: (sectionId: string, componentId: string, newY: number) => void;
  reorderComponents: (sectionId: string, fromId: string, toId: string) => void;
  setComponentGrainDirection: (sectionId: string, componentId: string, direction: GrainDirection) => void;
  /** Bottom edge height (cm from interior floor). Clamped and collision-resolved. */
  setComponentYPosition: (sectionId: string, componentId: string, yCm: number) => void;
  /** Component height (cm), clamped to catalog min/max for the type. */
  setComponentHeight: (sectionId: string, componentId: string, heightCm: number) => void;
  /** Shelf-only: board width in cm (partial width, centered in the bay). */
  setShelfWidthCm: (sectionId: string, componentId: string, widthCm: number) => void;
  /** Shelf-only: board depth in cm; use full interior depth when omitted in UI. */
  setShelfDepthCm: (sectionId: string, componentId: string, depthCm: number | undefined) => void;
  setShelfDepthPlacement: (
    sectionId: string,
    componentId: string,
    placement: ShelfDepthPlacement,
  ) => void;
  setInteriorStackGapCm: (cm: number) => void;

  // Doors
  setDoorType: (type: DoorType) => void;
  setAllDoorPanelMaterials: (materialId: string) => void;
  setDoorPanelMaterial: (panelIndex: number, materialId: string) => void;
  setDoorPanelGrainDirection: (panelIndex: number, direction: GrainDirection) => void;
  setSlidingMechanism: (materialId: string) => void;
  setDoorHandle: (handle: HandleStyle) => void;
  setDoorHandleMaterial: (materialId: string | undefined) => void;

  // Materials
  setFrameMaterial: (materialId: string) => void;
  setInteriorMaterial: (materialId: string) => void;
  setFrameGrainDirection: (direction: GrainDirection) => void;
  setInteriorGrainDirection: (direction: GrainDirection) => void;
  setDoorGrainDirection: (direction: GrainDirection) => void;

  // Room
  setWallColor: (color: string) => void;
  setFloorStyle: (style: FloorStyle) => void;

  // UI
  selectSection: (id: string | null) => void;
  selectComponent: (id: string | null) => void;
  toggleDoors: () => void;
  setCustomizeEachDoor: (on: boolean) => void;
  setViewMode: (mode: ViewMode) => void;
  setActiveStep: (step: PlannerStep) => void;
  setShowTemplates: (show: boolean) => void;
  toggleDimensions: () => void;

  // Undo / Redo
  undo: () => void;
  redo: () => void;

  // Templates
  applyTemplate: (config: WardrobeConfig) => void;

  // Addons
  addWardrobeAddon: (position: "right" | "top") => void;
  removeWardrobeAddon: (id: string) => void;
  setSeamStyle: (style: "independent" | "shared") => void;

  setPanelFrontOverride: (panelId: string, isFront: boolean | null) => void;
  clearPanelFrontOverrides: () => void;

  // Persistence
  resetConfig: () => void;
}
