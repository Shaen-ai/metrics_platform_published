// ── Room Planner Types ──────────────────────────────────────────────

/**
 * Door or window opening in a wall.
 *
 * `position` is normalized in [-1, 1]: opening center along the wall from left/bottom (-1)
 * to right/top (+1), matching RoomMesh. Persisted value; UI shows distances from labeled
 * corners A–D (see `roomCorners.ts`) to the **inside edge** of the opening.
 */
export interface Opening {
  id: string;
  type: "door" | "window";
  /** Axis-aligned rectangular room: which wall the opening belongs to. */
  wall: "front" | "back" | "left" | "right";
  /** Normalized center along wall in [-1, 1] (rectangular rooms) or along polygon edge (see edgeIndex). */
  position: number;
  width: number; // Opening width in meters
  height?: number; // Opening height in meters (defaults: door=2.1m, window=1.2m)
  /**
   * When `room.floorOutline` is set (kitchen polygon mode), the opening sits on this perimeter edge.
   * Edge `i` runs from vertex `i` to vertex `(i + 1) % n` (CCW from above).
   */
  edgeIndex?: number;
}

/** Floor style options — laminate only, large rectangular planks (120–200cm × 15–25cm) */
export type FloorStyle =
  | "laminate-blonde-oak"
  | "laminate-whitewashed-wood"
  | "laminate-light-oak"
  | "laminate-soft-beige"
  | "laminate-sand-oak"
  | "laminate-raw-oak"
  | "laminate-natural-oak"
  | "laminate-natural-pine"
  | "laminate-warm-honey-oak"
  | "laminate-caramel"
  | "laminate-chestnut"
  | "laminate-weathered-oak"
  | "laminate-light-gray"
  | "laminate-pearl-gray"
  | "laminate-silver-ash"
  | "laminate-mist-gray"
  | "laminate-warm-gray"
  | "laminate-coastal-oak"
  | "laminate-light-elm"
  | "laminate-toasted-almond"
  | "laminate-golden-oak"
  | "laminate-smoked-beige"
  | "laminate-natural-hickory"
  | "laminate-desert-oak"
  | "laminate-brushed-oak"
  | "laminate-aged-oak"
  | "laminate-maple"
  | "laminate-bamboo"
  | "laminate-walnut"
  | "laminate-charcoal"
  | "laminate-rich-espresso";

/** All laminate options with display labels */
export const LAMINATE_OPTIONS: { value: FloorStyle; label: string }[] = [
  { value: "laminate-blonde-oak", label: "Blonde Oak / Nordic White" },
  { value: "laminate-whitewashed-wood", label: "Whitewashed Wood" },
  { value: "laminate-soft-beige", label: "Creamy Beige" },
  { value: "laminate-sand-oak", label: "Sandy Taupe" },
  { value: "laminate-warm-gray", label: "Greige (Gray-Beige)" },
  { value: "laminate-silver-ash", label: "Light Ash Gray" },
  { value: "laminate-weathered-oak", label: "Weathered Oak" },
  { value: "laminate-light-oak", label: "Light Natural Oak" },
  { value: "laminate-raw-oak", label: "Raw Oak" },
  { value: "laminate-natural-oak", label: "Natural Oak" },
  { value: "laminate-natural-pine", label: "Natural Pine" },
  { value: "laminate-maple", label: "Natural Maple" },
  { value: "laminate-bamboo", label: "Bamboo" },
  { value: "laminate-warm-honey-oak", label: "Warm Honey Oak" },
  { value: "laminate-caramel", label: "Caramel" },
  { value: "laminate-chestnut", label: "Chestnut" },
  { value: "laminate-coastal-oak", label: "Coastal Oak" },
  { value: "laminate-light-elm", label: "Light Elm" },
  { value: "laminate-toasted-almond", label: "Toasted Almond" },
  { value: "laminate-golden-oak", label: "Golden Oak" },
  { value: "laminate-smoked-beige", label: "Smoked Beige" },
  { value: "laminate-natural-hickory", label: "Natural Hickory" },
  { value: "laminate-desert-oak", label: "Desert Oak" },
  { value: "laminate-brushed-oak", label: "Brushed Oak" },
  { value: "laminate-aged-oak", label: "Aged Oak" },
  { value: "laminate-light-gray", label: "Light Gray" },
  { value: "laminate-pearl-gray", label: "Pearl Gray" },
  { value: "laminate-mist-gray", label: "Mist Gray" },
  { value: "laminate-walnut", label: "Warm Deep Brown / Walnut" },
  { value: "laminate-charcoal", label: "Charcoal / Dark Gray" },
  { value: "laminate-rich-espresso", label: "Rich Espresso" },
];

/**
 * Floor style color config:
 * - `hue`  — Canvas2D "color" composite (replaces hue/saturation, keeps grain luminosity)
 * - `lift` — brightness shift: positive = white overlay (lightens), negative = black overlay (darkens)
 * - `tint` — MeshStandardMaterial.color (final multiplicative brightness)
 */
export interface FloorTint {
  hue: string;
  lift: number;
  tint: string;
}

export const FLOOR_STYLE_TINTS: Record<FloorStyle, FloorTint> = {
  "laminate-blonde-oak":    { hue: "#efe1c8", lift: 0.42, tint: "#ffffff" },
  "laminate-whitewashed-wood": { hue: "#ded6ca", lift: 0.46, tint: "#ffffff" },
  "laminate-light-oak":    { hue: "#dcc090", lift: 0.30, tint: "#ffffff" },
  "laminate-soft-beige":   { hue: "#ddd0bc", lift: 0.36, tint: "#ffffff" },
  "laminate-sand-oak":     { hue: "#e4c99e", lift: 0.28, tint: "#ffffff" },
  "laminate-raw-oak":      { hue: "#d7b98e", lift: 0.20, tint: "#ffffff" },
  "laminate-natural-oak":  { hue: "#d0a860", lift: 0.10, tint: "#ffffff" },
  "laminate-natural-pine": { hue: "#e2c783", lift: 0.18, tint: "#ffffff" },
  "laminate-warm-honey-oak": { hue: "#d89b42", lift: 0.10, tint: "#ffffff" },
  "laminate-caramel":      { hue: "#c7833d", lift: 0.02, tint: "#ffffff" },
  "laminate-chestnut":     { hue: "#9a5f36", lift: -0.05, tint: "#ffffff" },
  "laminate-weathered-oak": { hue: "#b3a18d", lift: 0.20, tint: "#f7f5f1" },
  "laminate-light-gray":   { hue: "#c8c9c8", lift: 0.38, tint: "#ffffff" },
  "laminate-pearl-gray":   { hue: "#d8d8d4", lift: 0.44, tint: "#ffffff" },
  "laminate-silver-ash":   { hue: "#cfd2d1", lift: 0.34, tint: "#ffffff" },
  "laminate-mist-gray":    { hue: "#deded9", lift: 0.48, tint: "#ffffff" },
  "laminate-warm-gray":    { hue: "#c8c0b7", lift: 0.34, tint: "#fbfaf7" },
  "laminate-coastal-oak":  { hue: "#d7c7b2", lift: 0.32, tint: "#ffffff" },
  "laminate-light-elm":    { hue: "#e3cfaa", lift: 0.26, tint: "#ffffff" },
  "laminate-toasted-almond": { hue: "#d0a875", lift: 0.16, tint: "#ffffff" },
  "laminate-golden-oak":   { hue: "#d6a14f", lift: 0.08, tint: "#ffffff" },
  "laminate-smoked-beige": { hue: "#b8a48e", lift: 0.18, tint: "#fbfaf7" },
  "laminate-natural-hickory": { hue: "#c18f5f", lift: 0.05, tint: "#ffffff" },
  "laminate-desert-oak":   { hue: "#d6b58a", lift: 0.22, tint: "#ffffff" },
  "laminate-brushed-oak":  { hue: "#b89264", lift: 0.02, tint: "#ffffff" },
  "laminate-aged-oak":     { hue: "#9f7b55", lift: -0.04, tint: "#ffffff" },
  "laminate-maple":        { hue: "#e0c898", lift: 0.25,  tint: "#ffffff" },
  "laminate-bamboo":       { hue: "#d8c060", lift: 0.15,  tint: "#ffffff" },
  "laminate-walnut":       { hue: "#7d5638", lift: -0.12, tint: "#ffffff" },
  "laminate-charcoal":     { hue: "#50535a", lift: -0.08, tint: "#e8e8e8" },
  "laminate-rich-espresso": { hue: "#432818", lift: -0.28, tint: "#ffffff" },
};

/**
 * Structural beam on a wall or ceiling.
 * - Wall: `wallRun` — horizontal = member along the wall just under the ceiling; vertical = column from floor up.
 *   Placement: `position` (normalized) ↔ distance from wall’s left (−1) corner to beam center; only that distance in UI.
 *   Horizontal: `lengthM` = span along wall; `widthM` = vertical thickness; `depthM` = protrusion into room.
 *   If `horizontalBottomAboveFloorM` is set, bottom of the beam sits that many meters above the floor; if omitted, beam snaps under the ceiling (legacy).
 *   Vertical: `lengthM` = column height; `widthM` × `depthM` = footprint on the wall plane; `verticalBaseAboveFloorM` = gap from floor to column bottom (default 0).
 * - Ceiling: `ceilingAxis` — beam parallel to room X or Z. Corners A–D (floor, when Room Designer is open):
 *   A back-left, B back-right, C front-right, D front-left. `position` is normalized along the run (X-run → edge
 *   A–B; Z-run → edge A–D). `ceilingPerpPosition` is normalized on the perpendicular edge (X-run → A–D; Z-run →
 *   A–B). UI shows distance from A along each edge to the nearest face of the beam (`lengthM` / `widthM`).
 *   Profile: `lengthM` along run, `widthM` across, `depthM` down from ceiling.
 */
export interface RoomBeam {
  id: string;
  surface: "wall" | "ceiling";
  wall?: "front" | "back" | "left" | "right";
  /** Wall: beam long axis on the wall face. Default horizontal. */
  wallRun?: "horizontal" | "vertical";
  /** Normalized [-1, 1]: center along wall or along ceiling run (openings convention). */
  position: number;
  lengthM: number;
  widthM: number;
  depthM: number;
  /** Horizontal wall: meters from floor to bottom of beam; omit to snap under ceiling. */
  horizontalBottomAboveFloorM?: number;
  /** Vertical wall: meters from floor to bottom of column. */
  verticalBaseAboveFloorM?: number;
  /** Ceiling: beam parallel to room X or Z. */
  ceilingAxis?: "x" | "z";
  /** Ceiling: normalized center on perpendicular axis; 0 = room center. */
  ceilingPerpPosition?: number;
}

/** One vertex of the floor footprint in meters (XZ plane), CCW when viewed from above. */
export interface FloorOutlinePoint {
  x: number;
  z: number;
}

/** Room dimensions in meters */
export interface Room {
  width: number;  // X axis
  depth: number;  // Z axis
  height: number; // Y at room center (0,0); ceiling plane reference
  /** Ceiling slope: rise per meter in +X (dimensionless). 0 = flat. */
  ceilingSlopeX?: number;
  /** Ceiling slope: rise per meter in +Z (dimensionless). 0 = flat. */
  ceilingSlopeZ?: number;
  /**
   * Piecewise-linear ceiling along one axis (D → room center → A), constant along the other.
   * Enables a peak or valley at the center (e.g. pyramid along width). When set, use
   * `height` at center, `ceilingRidgeD` / `ceilingRidgeA` at the two ends; slopes are unused.
   */
  ceilingRidgeAxis?: "x" | "z";
  /** Ceiling height (m) at D (−X or −Z end). Used with `ceilingRidgeAxis`. */
  ceilingRidgeD?: number;
  /** Ceiling height (m) at A (+X or +Z end). Used with `ceilingRidgeAxis`. */
  ceilingRidgeA?: number;
  /**
   * Optional CCW floor polygon (3+ points). When present, the 3D room uses this footprint instead of
   * a plain rectangle; `width` / `depth` should remain the axis-aligned bounding box for UI and lighting.
   */
  floorOutline?: FloorOutlinePoint[];
  /** Indices of perimeter edges with no wall mesh (open transition to other spaces). */
  openEdgeIndices?: number[];
  openings?: Opening[]; // Doors and windows
  beams?: RoomBeam[];
  wallColor?: string;   // Hex color for all walls
  floorStyle?: FloorStyle;
  /** Optional style labels (e.g. from presets); persisted with planner state. */
  roomStyleTags?: string[];
}

/** An item in the furniture catalog */
export interface PlannerCatalogItem {
  id: string;
  name: string;
  category: string;
  subCategory?: string;
  vendor: string;
  price: number;
  width: number;   // meters
  depth: number;   // meters
  height: number;  // meters
  color: string;   // hex color
  imageUrl?: string;
  modelUrl?: string;
  modelStatus?: "queued" | "processing" | "done" | "failed";
  wallMounted?: boolean;
  mountHeight?: number; // meters above floor for wall-mounted items
}

/** A furniture item placed in the room */
export interface PlacedItem {
  id: string;
  catalogId: string;
  position: { x: number; z: number };
  positionY?: number; // height above floor for wall-mounted items
  rotationY: number; // radians
  color: string;     // per-item hex color (defaults from catalog)
  width?: number;    // per-item override (meters); falls back to catalog
  depth?: number;
  height?: number;
  movable?: boolean;  // false = locked in place; defaults to true
  /**
   * When set, this piece is a user-designed wardrobe (Bedroom planner).
   * Kept on the instance so edits in Wardrobe planner do not change placed copies.
   */
  wardrobeConfig?: import("./wardrobe/types").WardrobeConfig;
}

/** Linear measure for planner UI (room, openings, sidebar). Stored data stays in meters. */
export type LengthUnit = "cm" | "in" | "mm";

/** UI state toggles */
export interface UIState {
  snapToGrid: boolean;
  gridSize: number; // meters
  showGrid: boolean;
  showDimensions: boolean;
  topView: boolean;
  /** Default cm; persisted with planner state. */
  lengthUnit: LengthUnit;
}

/** Full planner state */
export interface PlannerState {
  plannerType: string;
  room: Room;
  catalog: PlannerCatalogItem[];
  placedItems: PlacedItem[];
  selectedItemId: string | null;
  isDragging: boolean;
  dragItemId: string | null;
  ui: UIState;
  searchQuery: string;

  // Planner init
  initPlanner: (type: string, defaultRoom?: Room, adminSlug?: string) => void;
  /** Re-merge saved wardrobes into catalog (Bedroom planner, after storage hydration). */
  mergeSavedWardrobesIntoCatalog: () => void;

  // Room actions
  setRoomWidth: (w: number) => void;
  setRoomDepth: (d: number) => void;
  setRoomHeight: (h: number) => void;
  setRoom: (room: Room) => void;
  setWallColor: (color: string) => void;
  setFloorStyle: (style: FloorStyle) => void;
  addOpening: (opening: Opening) => void;
  removeOpening: (id: string) => void;
  addBeam: (beam: RoomBeam) => void;
  updateBeam: (id: string, patch: Partial<Omit<RoomBeam, "id">>) => void;
  removeBeam: (id: string) => void;

  // Item actions
  addItem: (catalogId: string) => void;
  removeItem: (id: string) => void;
  updateItemPosition: (id: string, x: number, z: number) => void;
  updateItemColor: (id: string, color: string) => void;
  updateItemDimensions: (id: string, dims: { width?: number; depth?: number; height?: number }) => void;
  rotateItem: (id: string, deltaRadians: number) => void;
  toggleItemMovable: (id: string) => void;
  selectItem: (id: string | null) => void;
  startDrag: (id: string) => void;
  endDrag: () => void;
  deleteSelected: () => void;

  // UI actions
  toggleSnapToGrid: () => void;
  toggleShowGrid: () => void;
  toggleShowDimensions: () => void;
  setTopView: (v: boolean) => void;
  setLengthUnit: (unit: LengthUnit) => void;
  setSearchQuery: (q: string) => void;
  showRoomDesigner: boolean;
  setShowRoomDesigner: (show: boolean) => void;

  /** Kitchen planner: user finished shape + 2D layout wizard (persisted per planner storage key). */
  kitchenSetupComplete: boolean;
  setKitchenSetupComplete: (complete: boolean) => void;

  webglContextLost: boolean;
  setWebglContextLost: (lost: boolean) => void;

  // Catalog
  fetchCatalog: (adminSlug?: string, plannerType?: string) => Promise<void>;

  // Persistence
  resetScene: () => void;

  /** Replace room style tags (normalized); pass undefined to clear. */
  setRoomStyleTags: (tags: string[] | undefined) => void;

  addEphemeralCatalogItems: (items: PlannerCatalogItem[]) => void;
}
