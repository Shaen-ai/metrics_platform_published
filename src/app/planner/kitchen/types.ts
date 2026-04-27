import type { FloorStyle, FloorOutlinePoint } from "../types";
import type { KitchenShapeId } from "../utils/kitchenFloorTemplates";
import type { GrainDirection } from "../textureRepeat";

export type { GrainDirection } from "../textureRepeat";

export type BaseModuleType =
  | "base-cabinet"
  | "drawer-unit"
  | "sink-unit"
  | "oven-unit"
  | "dishwasher-unit"
  | "tall-unit"
  | "fridge-unit"
  | "corner-base"
  | "washing-machine-unit"
  | "freestanding-fridge";

export type WallModuleType =
  | "wall-cabinet"
  | "wall-open"
  | "hood-unit"
  | "wall-corner";

export type KitchenModuleType = BaseModuleType | WallModuleType;

/** 3D drag-to-reorder: which run the cabinet mesh belongs to (see KitchenCabinetDragController). */
export type KitchenCabinetDragRun =
  | "main-base"
  | "main-wall"
  | "island-base"
  | "island-wall"
  | "left-base"
  | "left-wall";

export interface KitchenModule {
  id: string;
  type: KitchenModuleType;
  /** Width along the run (cm) */
  width: number;
  /** Body height from floor (cm). Omit = catalog default for type. */
  heightCm?: number;
  /** Front-back depth (cm). Omit = catalog default for type. */
  depthCm?: number;
  /** Free-form X position on the wall (cm from left edge). When set, module uses absolute positioning instead of run-based layout. */
  xCm?: number;
  /** Free-form Y position on the wall (cm from floor). When set, module uses absolute positioning instead of run-based layout. */
  yCm?: number;
  /** True when added from admin catalog (floor placement). Does not receive the global worktop slab. */
  fromAdminCatalog?: boolean;
}

export type CountertopMaterial =
  | "white-marble"
  | "black-granite"
  | "light-stone"
  | "dark-stone"
  | "butcher-block"
  | "stainless-steel"
  | "quartz-white"
  | "quartz-gray";

export type HandleStyle =
  | "bar-steel"
  | "bar-black"
  | "bar-brass"
  | "knob-steel"
  | "knob-black"
  | "recessed";

export interface DoorConfig {
  material: string;
  handle: HandleStyle;
  /** Optional catalog handle finish (`type` or `category` handle); overrides default solid color / preset price when set. */
  handleMaterialId?: string;
}

export interface CountertopConfig {
  /** Built-in preset; used when `adminMaterialId` is unset or invalid */
  material: CountertopMaterial;
  /** Admin catalog worktop — when set and valid, overrides preset for 3D + pricing */
  adminMaterialId?: string;
  /** Extra overhang beyond the cabinet depth, cm */
  overhang: number;
}

/** Optional second run (island): same module model, positioned in the room. */
export interface IslandConfig {
  enabled: boolean;
  baseModules: KitchenModule[];
  wallModules: KitchenModule[];
  hasWallCabinets: boolean;
  /** Horizontal offset from main-run center, cm (+ = along +X of main run). */
  offsetXCm: number;
  /** Distance into the room from the back wall, cm. */
  offsetZCm: number;
  rotationYRad: number;
}

/** L-shaped corner unit bridging back wall and left wall. */
export interface CornerUnitConfig {
  enabled: boolean;
  /** Width of the wing along the back wall (cm). */
  backWingWidthCm: number;
  /** Width of the wing along the left wall (cm). */
  leftWingWidthCm: number;
  heightCm: number;
  depthCm: number;
  /** Whether to also render a wall-level corner unit (mounted above the base corner). */
  hasWallCorner: boolean;
  wallCornerHeightCm: number;
  wallCornerDepthCm: number;
}

/** Cabinet run along the left wall (perpendicular to the main back-wall run). */
export interface LeftWallConfig {
  enabled: boolean;
  baseModules: KitchenModule[];
  wallModules: KitchenModule[];
  hasWallCabinets: boolean;
}

/** Layout helpers only — not priced (fridge, sink block, etc.). */
export type DesignRefKind = "fridge" | "sink" | "range" | "dishwasher";

export interface DesignPlacement {
  id: string;
  kind: DesignRefKind;
  xCm: number;
  zCm: number;
  rotationYRad: number;
}

export interface KitchenConfig {
  baseModules: KitchenModule[];
  wallModules: KitchenModule[];
  cabinetMaterial: string;
  cabinetGrainDirection?: GrainDirection;
  doorGrainDirection?: GrainDirection;
  doors: DoorConfig;
  countertop: CountertopConfig;
  hasWallCabinets: boolean;
  island: IslandConfig;
  cornerUnit: CornerUnitConfig;
  leftWall: LeftWallConfig;
  designPlacements: DesignPlacement[];
}

export interface RoomSettings {
  wallColor: string;
  floorStyle: FloorStyle;
  /**
   * Target floor width (m) along the main cabinet run (+X). The 3D corner room width is
   * max(this, cabinet-derived minimum).
   */
  footprintWidthM: number;
  /** Room depth (m) into the space (+Z from the back wall). */
  footprintDepthM: number;
  /** Shape template last chosen in the footprint wizard (optional). */
  kitchenShapeTemplate?: KitchenShapeId;
  /**
   * 2D footprint from the kitchen-design wizard (optional). When present, bbox of this polygon
   * is the source of truth for `footprintWidthM` / `footprintDepthM` after load.
   */
  floorOutline?: FloorOutlinePoint[];
  /** Open wall edges (same convention as room planner), optional. */
  floorOpenEdgeIndices?: number[];
}

export type ViewMode = "perspective" | "front";

export type KitchenStep =
  | "layout"
  | "cabinets"
  | "countertop"
  | "fronts"
  | "handles"
  | "room";

/** A snap/alignment guide line shown while dragging wall modules. */
export interface WallAlignGuide {
  /** "h" = horizontal line, "v" = vertical line */
  axis: "h" | "v";
  /** Position in cm (Y for horizontal, X for vertical) */
  posCm: number;
}

export interface KitchenUIState {
  selectedBaseModuleId: string | null;
  selectedWallModuleId: string | null;
  selectedIslandBaseModuleId: string | null;
  selectedIslandWallModuleId: string | null;
  selectedLeftBaseModuleId: string | null;
  selectedLeftWallModuleId: string | null;
  /** True when the L-shaped floor corner unit (not a run module) is the active 3D selection. */
  selectedCornerUnit: boolean;
  selectedRun: "base" | "wall";
  viewMode: ViewMode;
  activeStep: KitchenStep;
  showTemplates: boolean;
  showDimensions: boolean;
  /** When false, OrbitControls are disabled (e.g. pointer down on a cabinet so drag does not rotate the room). */
  orbitControlsEnabled: boolean;
  /** Active alignment guide lines shown during wall drag. */
  wallAlignGuides: WallAlignGuide[];
  /** Active alignment guide lines shown during floor/base module drag. */
  floorAlignGuides: FloorAlignGuide[];
}

/** A vertical snap/alignment guide line shown while dragging base (floor) modules. */
export interface FloorAlignGuide {
  /** X position along the run in cm. */
  xCm: number;
}

export interface KitchenState {
  config: KitchenConfig;
  room: RoomSettings;
  ui: KitchenUIState;
  availableMaterials: import("./data").KitchenMaterial[];
  availableDoorMaterials: import("./data").KitchenMaterial[];
  /** Admin worktops (`type`/`category` worktop); hybrid with built-in presets */
  availableWorktopMaterials: import("./data").KitchenMaterial[];
  availableHandleMaterials: import("./data").KitchenMaterial[];

  history: KitchenConfig[];
  historyIndex: number;
  canUndo: boolean;
  canRedo: boolean;

  setAvailableMaterials: (
    cabinet: import("./data").KitchenMaterial[],
    door: import("./data").KitchenMaterial[],
    handleMaterials: import("./data").KitchenMaterial[],
  ) => void;
  setAvailableWorktopMaterials: (worktops: import("./data").KitchenMaterial[]) => void;

  // Base modules
  addBaseModule: (type: BaseModuleType, opts?: { width?: number }) => void;
  /** Insert a run module from admin Module Builder / API (dims + name heuristics). */
  addModuleFromAdminCatalog: (m: import("@/lib/types").Module) => void;
  removeBaseModule: (id: string) => void;
  setBaseModuleWidth: (id: string, width: number) => void;
  setBaseModuleDimensions: (
    id: string,
    patch: { width?: number; heightCm?: number; depthCm?: number },
  ) => void;
  reorderBaseModules: (fromIndex: number, toIndex: number) => void;
  setBaseModulePosition: (id: string, xCm: number) => void;

  // Wall modules
  addWallModule: (type: WallModuleType, opts?: { width?: number }) => void;
  removeWallModule: (id: string) => void;
  setWallModuleWidth: (id: string, width: number) => void;
  setWallModuleDimensions: (
    id: string,
    patch: { width?: number; heightCm?: number; depthCm?: number },
  ) => void;
  reorderWallModules: (fromIndex: number, toIndex: number) => void;
  setWallModulePosition: (id: string, xCm: number, yCm: number) => void;
  toggleWallCabinets: () => void;

  // Island
  setIslandEnabled: (enabled: boolean) => void;
  addIslandBaseModule: (type: BaseModuleType, opts?: { width?: number }) => void;
  removeIslandBaseModule: (id: string) => void;
  setIslandBaseModuleWidth: (id: string, width: number) => void;
  setIslandBaseModuleDimensions: (
    id: string,
    patch: { width?: number; heightCm?: number; depthCm?: number },
  ) => void;
  reorderIslandBaseModules: (fromIndex: number, toIndex: number) => void;
  setIslandBaseModulePosition: (id: string, xCm: number) => void;
  addIslandWallModule: (type: WallModuleType, opts?: { width?: number }) => void;
  removeIslandWallModule: (id: string) => void;
  setIslandWallModuleWidth: (id: string, width: number) => void;
  setIslandWallModuleDimensions: (
    id: string,
    patch: { width?: number; heightCm?: number; depthCm?: number },
  ) => void;
  reorderIslandWallModules: (fromIndex: number, toIndex: number) => void;
  setIslandWallModulePosition: (id: string, xCm: number, yCm: number) => void;
  toggleIslandWallCabinets: () => void;
  setIslandPose: (patch: { offsetXCm?: number; offsetZCm?: number; rotationYRad?: number }) => void;

  // Corner unit
  setCornerUnitEnabled: (enabled: boolean) => void;
  setCornerUnitDimensions: (patch: {
    backWingWidthCm?: number;
    leftWingWidthCm?: number;
    heightCm?: number;
    depthCm?: number;
    hasWallCorner?: boolean;
    wallCornerHeightCm?: number;
    wallCornerDepthCm?: number;
  }) => void;

  // Left wall
  setLeftWallEnabled: (enabled: boolean) => void;
  addLeftBaseModule: (type: BaseModuleType, opts?: { width?: number }) => void;
  removeLeftBaseModule: (id: string) => void;
  setLeftBaseModuleWidth: (id: string, width: number) => void;
  setLeftBaseModuleDimensions: (
    id: string,
    patch: { width?: number; heightCm?: number; depthCm?: number },
  ) => void;
  reorderLeftBaseModules: (fromIndex: number, toIndex: number) => void;
  setLeftBaseModulePosition: (id: string, xCm: number) => void;
  addLeftWallModule: (type: WallModuleType, opts?: { width?: number }) => void;
  removeLeftWallModule: (id: string) => void;
  setLeftWallModuleWidth: (id: string, width: number) => void;
  setLeftWallModuleDimensions: (
    id: string,
    patch: { width?: number; heightCm?: number; depthCm?: number },
  ) => void;
  reorderLeftWallModules: (fromIndex: number, toIndex: number) => void;
  setLeftWallModulePosition: (id: string, xCm: number, yCm: number) => void;
  toggleLeftWallCabinets: () => void;

  // Design placeholders (not furniture)
  addDesignPlacement: (kind: DesignRefKind) => void;
  removeDesignPlacement: (id: string) => void;
  setDesignPlacementPose: (
    id: string,
    patch: { xCm?: number; zCm?: number; rotationYRad?: number },
  ) => void;

  // Materials & finish
  setCabinetMaterial: (id: string) => void;
  setCabinetGrainDirection: (direction: GrainDirection) => void;
  setDoorMaterial: (id: string) => void;
  setDoorGrainDirection: (direction: GrainDirection) => void;
  setDoorHandle: (handle: HandleStyle) => void;
  setDoorHandleMaterial: (materialId: string | undefined) => void;
  setCountertopMaterial: (material: CountertopMaterial) => void;
  setAdminCountertopMaterial: (materialId: string | undefined) => void;

  // Room
  setWallColor: (color: string) => void;
  setFloorStyle: (style: FloorStyle) => void;
  /** First-run footprint wizard; also toggled from header “Shape”. */
  kitchenDesignSetupComplete: boolean;
  setKitchenDesignSetupComplete: (complete: boolean) => void;
  applyRoomFootprintFromWizard: (payload: {
    footprintWidthM: number;
    footprintDepthM: number;
    kitchenShapeTemplate?: KitchenShapeId;
    outline?: FloorOutlinePoint[];
    openEdgeIndices?: number[];
  }) => void;

  // UI
  selectBaseModule: (id: string | null) => void;
  selectWallModule: (id: string | null) => void;
  selectIslandBaseModule: (id: string | null) => void;
  selectIslandWallModule: (id: string | null) => void;
  selectLeftBaseModule: (id: string | null) => void;
  selectLeftWallModule: (id: string | null) => void;
  selectCornerUnit: () => void;

  setSelectedRun: (run: "base" | "wall") => void;
  setViewMode: (mode: ViewMode) => void;
  setActiveStep: (step: KitchenStep) => void;
  setShowTemplates: (show: boolean) => void;
  toggleDimensions: () => void;
  setOrbitControlsEnabled: (enabled: boolean) => void;
  setWallAlignGuides: (guides: WallAlignGuide[]) => void;
  setFloorAlignGuides: (guides: FloorAlignGuide[]) => void;

  // Undo/redo
  undo: () => void;
  redo: () => void;

  // Templates
  applyTemplate: (config: KitchenConfig) => void;

  /** Persist-only sync after material catalog load (e.g. clamp invalid ids) — no undo history push */
  setConfigForHydrate: (config: KitchenConfig) => void;

  /** Snapshot current config into undo history (call after drag-end, etc.) */
  pushCurrentConfigToHistory: () => void;

  // Reset
  resetConfig: () => void;
}
