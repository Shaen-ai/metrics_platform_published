import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import type {
  WardrobeState,
  WardrobeConfig,
  WardrobeUIState,
  WardrobeSection,
  WardrobeComponent,
  WardrobeComponentType,
  RoomSettings,
  WardrobeSpaceLayoutPreset,
  WardrobeWalkInVariant,
  WardrobeCornerAttachment,
  WardrobePrimaryRun,
  DoorType,
  HandleStyle,
  HingedDoorHandleSide,
  ViewMode,
  PlannerStep,
  GrainDirection,
  WardrobeDoorConfig,
  WardrobeBaseConfig,
  WardrobeBaseType,
  ShelfDepthPlacement,
  WardrobeSheetSizeOverrideCm,
} from "./types";
import {
  normalizeSpaceLayoutFields,
  WARDROBE_BRIDGE_LIFT_DEFAULT_CM,
} from "./wardrobeSpaceLayout";
import { normalizeFloorStyle } from "../types";
import { normalizePlannerFloorSurfaceFields, normalizePlannerWallCeilingSurfaceFields } from "../roomFloorMaterial";
import { normalizeLengthUnit } from "../utils/units";
import {
  getComponentDef,
  PANEL_THICKNESS,
  wardrobeInteriorStackGapCm,
  INTERNAL_RENDER_FALLBACK,
  SECTION_MIN_WIDTH_CM,
  totalInteriorSectionWidthsCm,
  FRAME_MIN_WIDTH,
  FRAME_MAX_WIDTH,
  FRAME_MIN_HEIGHT,
  FRAME_MAX_HEIGHT,
  FRAME_MIN_DEPTH,
  FRAME_MAX_DEPTH,
  DEFAULT_WARDROBE_BASE,
  clampWardrobeBase,
  resizeDoorPanelMaterialIds,
  resizeDoorPanelGrainDirections,
  wardrobeManufacturerRowForDoorPool,
  wardrobeManufacturerRowForFramePool,
  wardrobeDoorPanelMaterialIdsLength,
  normalizeHingedDoorPanelMaterialIds,
  normalizeHingedDoorPanelGrainDirections,
  syncDoorPanelArrays,
  LEG_HEIGHT_MIN,
  LEG_HEIGHT_MAX,
  PLINTH_HEIGHT_MIN,
  PLINTH_HEIGHT_MAX,
  PLINTH_RECESS_MIN,
  PLINTH_RECESS_MAX,
  MIN_SHELF_WIDTH_CM,
  MIN_SHELF_DEPTH_CM,
  shelfMaxWidthCm,
  shelfMaxDepthCm,
} from "./data";
import type { WardrobeMaterial } from "./data";

const STORAGE_KEY = "wardrobe-configurator-state";
const MAX_HISTORY = 50;

interface PersistedData {
  config: WardrobeConfig;
  room?: RoomSettings;
  ui: Pick<WardrobeUIState, "showDoors" | "customizeEachDoor" | "linkInteriorExteriorFinishes" | "lengthUnit">;
  wardrobeSheetSizeOverrideCm?: WardrobeSheetSizeOverrideCm | null;
}

function loadFromStorage(): PersistedData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedData;
    // Migrate legacy single grainDirection → per-surface fields
    const cfg = data.config as unknown as Record<string, unknown>;
    if ("grainDirection" in cfg && cfg.grainDirection) {
      const dir = cfg.grainDirection as GrainDirection;
      if (!cfg.frameGrainDirection) cfg.frameGrainDirection = dir;
      if (!cfg.interiorGrainDirection) cfg.interiorGrainDirection = dir;
      if (!cfg.doorGrainDirection) cfg.doorGrainDirection = dir;
      delete cfg.grainDirection;
    }
    // Migrate global hingedHandlePlacement → per-section (or drop)
    const doors = cfg.doors as Record<string, unknown> | undefined;
    if (doors && "hingedHandlePlacement" in doors) {
      const hp = doors.hingedHandlePlacement as string | undefined;
      delete doors.hingedHandlePlacement;
      if (hp === "left" || hp === "right") {
        const sections = cfg.sections as WardrobeSection[] | undefined;
        if (sections) {
          cfg.sections = sections.map((sec) => ({
            ...sec,
            hingedDoorHandleSide: hp as HingedDoorHandleSide,
          }));
        }
      }
    }
    return data;
  } catch {
    return null;
  }
}

function saveToStorage(data: PersistedData) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

export function makeSections(frameWidth: number, count: number): WardrobeSection[] {
  const interior = frameWidth - PANEL_THICKNESS * 2;
  const dividerSpace = (count - 1) * PANEL_THICKNESS;
  const sectionWidth = (interior - dividerSpace) / count;

  return Array.from({ length: count }, (_, i) => ({
    id: uuidv4(),
    width: Math.round(sectionWidth * 10) / 10,
    components: [],
    /** Matches previous “auto”: even bays right, odd bays left. */
    hingedDoorHandleSide: i % 2 === 0 ? "right" : "left",
    hingedDoorCount: 1,
  }));
}

/**
 * Round vertical position to 0.1 cm (avoids coarse-step errors on stacked drawers).
 */
function snapToGrid(y: number): number {
  return Math.round(y * 10) / 10;
}

/** Vertical gap (cm) between a lower and upper stacked component — drawers sit flush. */
function minVerticalGapCm(
  lowerType: WardrobeComponentType,
  upperType: WardrobeComponentType,
  defaultGapCm: number,
): number {
  if (lowerType === "drawer" && upperType === "drawer") return 0;
  return defaultGapCm;
}

function clampY(y: number, compHeight: number, frameHeight: number): number {
  const interiorH = frameHeight - PANEL_THICKNESS * 2;
  const maxY = interiorH - compHeight;
  return Math.max(0, Math.min(maxY, y));
}

/** True if vertical ranges [y, y+h] and [o.y, o.y+o.h] violate minimum stack gap. */
function componentsOverlap(
  y: number,
  h: number,
  type: WardrobeComponentType,
  o: WardrobeComponent,
  gapCm: number,
): boolean {
  const oy = o.yPosition;
  const oh = o.height;
  const separated =
    y + h + minVerticalGapCm(type, o.type, gapCm) <= oy ||
    oy + oh + minVerticalGapCm(o.type, type, gapCm) <= y;
  return !separated;
}

/**
 * Snap/clamp desired bottom Y so the component does not overlap others (with pin spacing gap).
 * Picks the nearest valid position to `desiredY` when nudging away from collisions.
 */
function resolveYNoOverlap(
  desiredY: number,
  h: number,
  type: WardrobeComponentType,
  others: WardrobeComponent[],
  frameHeight: number,
  gapCm: number,
): number {
  const interiorH = frameHeight - PANEL_THICKNESS * 2;
  let y = snapToGrid(clampY(desiredY, h, frameHeight));

  for (let iter = 0; iter < 32; iter++) {
    const overlapping = others.filter((o) => componentsOverlap(y, h, type, o, gapCm));
    if (overlapping.length === 0) return y;

    const candidates: number[] = [];
    for (const o of overlapping) {
      const above = o.yPosition + o.height + minVerticalGapCm(o.type, type, gapCm);
      const below = o.yPosition - h - minVerticalGapCm(type, o.type, gapCm);
      if (above >= 0 && above + h <= interiorH) candidates.push(above);
      if (below >= 0 && below + h <= interiorH) candidates.push(below);
    }

    if (candidates.length === 0) {
      return clampY(y, h, frameHeight);
    }

    const best = candidates.reduce((a, b) =>
      Math.abs(a - desiredY) <= Math.abs(b - desiredY) ? a : b,
    );
    const next = snapToGrid(clampY(best, h, frameHeight));
    if (next === y) {
      const alt = candidates.find((c) => snapToGrid(clampY(c, h, frameHeight)) !== y);
      if (alt === undefined) return y;
      y = snapToGrid(clampY(alt, h, frameHeight));
    } else {
      y = next;
    }
  }

  return y;
}

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  if (from === to) return [...arr];
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Reassigns yPosition (cm from interior bottom) so components stack bottom-up
 * with the lowest item at y=0 — aligns the bottom drawer with the door bottom.
 * `topToBottomOrder` is top-first (highest shelf/drawer first, bottom drawer last).
 */
function repackComponentsVertical(
  components: WardrobeComponent[],
  frameHeight: number,
  topToBottomOrder: WardrobeComponent[],
  gapCm: number,
): WardrobeComponent[] {
  const idSet = new Set(components.map((c) => c.id));
  let order = topToBottomOrder.filter((c) => idSet.has(c.id));
  if (order.length !== components.length) {
    order = [...components].sort(
      (a, b) => b.yPosition - a.yPosition || a.id.localeCompare(b.id),
    );
  }
  const bottomToTop = [...order].reverse();
  const idToY = new Map<string, number>();
  let y = 0;
  let prev: WardrobeComponent | null = null;
  for (const c of bottomToTop) {
    const yp = snapToGrid(clampY(y, c.height, frameHeight));
    idToY.set(c.id, yp);
    const g = prev ? minVerticalGapCm(prev.type, c.type, gapCm) : 0;
    y = yp + c.height + g;
    prev = c;
  }
  return components.map((c) => {
    const ny = idToY.get(c.id);
    return ny !== undefined ? { ...c, yPosition: ny } : c;
  });
}

const defaultConfig: WardrobeConfig = {
  frame: { width: 150, height: 236, depth: 58 },
  base: { ...DEFAULT_WARDROBE_BASE },
  sections: makeSections(150, 2),
  doors: {
    type: "hinged",
    doorPanelMaterialIds: [INTERNAL_RENDER_FALLBACK.id, INTERNAL_RENDER_FALLBACK.id],
    doorPanelGrainDirections: ["horizontal", "horizontal"],
    slidingMechanismId: INTERNAL_RENDER_FALLBACK.id,
    handle: "bar-steel",
  },
  frameMaterial: INTERNAL_RENDER_FALLBACK.id,
  interiorMaterial: INTERNAL_RENDER_FALLBACK.id,
};

const defaultRoom: RoomSettings = {
  wallColor: "#b8c4c8",
  floorStyle: "laminate-soft-beige",
  roomWidthM: 3,
  roomDepthM: 3,
  roomHeightM: 2.8,
  spaceLayoutPreset: "linear",
  walkInVariant: "u",
  bridgeLiftCm: WARDROBE_BRIDGE_LIFT_DEFAULT_CM,
  wardrobeCornerAttachment: "left",
};

function normalizeWardrobeRoom(room?: RoomSettings): RoomSettings {
  const r = { ...defaultRoom, ...(room ?? {}) };
  const surf = normalizePlannerFloorSurfaceFields(r);
  const interior = normalizePlannerWallCeilingSurfaceFields(r);
  return normalizeSpaceLayoutFields({
    ...r,
    ...surf,
    ...interior,
    floorStyle: normalizeFloorStyle(r.floorStyle),
  });
}

function normalizeFrameDimensions(config: WardrobeConfig): WardrobeConfig {
  const { frame } = config;
  const out: WardrobeConfig = {
    ...config,
    frame: {
      ...frame,
      width: Math.round(Math.min(FRAME_MAX_WIDTH, Math.max(FRAME_MIN_WIDTH, frame.width))),
      height: Math.round(Math.min(FRAME_MAX_HEIGHT, Math.max(FRAME_MIN_HEIGHT, frame.height))),
      depth: Math.round(Math.min(FRAME_MAX_DEPTH, Math.max(FRAME_MIN_DEPTH, frame.depth))),
    },
  };
  const ig = config.interiorStackGapCm;
  if (ig !== undefined && Number.isFinite(ig)) {
    out.interiorStackGapCm = Math.round(Math.min(15, Math.max(0, ig)) * 10) / 10;
  }
  if (ig !== undefined && !Number.isFinite(ig)) {
    delete out.interiorStackGapCm;
  }
  return out;
}

function isGrainDirection(x: unknown): x is GrainDirection {
  return x === "horizontal" || x === "vertical";
}

/** Migrate legacy `doors.material` / hinged+sliding into `doorPanelMaterialIds`. */
function normalizeDoorConfig(config: WardrobeConfig): WardrobeConfig {
  const raw = config.doors as WardrobeDoorConfig & {
    material?: string;
    hingedMaterial?: string;
    slidingMaterial?: string;
    doorPanelMaterialIds?: unknown;
    doorPanelGrainDirections?: unknown;
  };
  const legacy = typeof raw.material === "string" ? raw.material : INTERNAL_RENDER_FALLBACK.id;
  const hinged = typeof raw.hingedMaterial === "string" ? raw.hingedMaterial : legacy;
  const sliding = typeof raw.slidingMaterial === "string" ? raw.slidingMaterial : legacy;
  const slidingMechanismId =
    typeof raw.slidingMechanismId === "string" ? raw.slidingMechanismId : INTERNAL_RENDER_FALLBACK.id;

  const frameW = config.frame.width;
  const targetLen = wardrobeDoorPanelMaterialIdsLength(raw.type, frameW, config.sections);

  let prevIds: string[] = [];
  if (Array.isArray(raw.doorPanelMaterialIds) && raw.doorPanelMaterialIds.length > 0) {
    prevIds = raw.doorPanelMaterialIds.filter((x): x is string => typeof x === "string");
  } else {
    const matForLegacyType = raw.type === "sliding" ? sliding : hinged;
    prevIds = targetLen > 0 ? Array.from({ length: targetLen }, () => matForLegacyType) : [];
  }

  const doorPanelMaterialIds =
    raw.type === "hinged"
      ? normalizeHingedDoorPanelMaterialIds(prevIds, config.sections, INTERNAL_RENDER_FALLBACK.id)
      : resizeDoorPanelMaterialIds(prevIds, targetLen, INTERNAL_RENDER_FALLBACK.id);

  const baseGrain = config.doorGrainDirection ?? "horizontal";
  let prevGrains: GrainDirection[] = [];
  if (Array.isArray(raw.doorPanelGrainDirections)) {
    prevGrains = raw.doorPanelGrainDirections.filter(isGrainDirection);
  }
  const doorPanelGrainDirections =
    raw.type === "hinged"
      ? normalizeHingedDoorPanelGrainDirections(prevGrains, config.sections, baseGrain)
      : resizeDoorPanelGrainDirections(prevGrains, targetLen, baseGrain);

  return {
    ...config,
    doors: {
      type: raw.type,
      doorPanelMaterialIds,
      doorPanelGrainDirections,
      slidingMechanismId,
      handle: raw.handle,
    },
  };
}

function normalizeBaseConfig(config: WardrobeConfig): WardrobeConfig {
  const raw = config.base as WardrobeBaseConfig | undefined;
  if (!raw || typeof raw.type !== "string") {
    return { ...config, base: clampWardrobeBase({ ...DEFAULT_WARDROBE_BASE }) };
  }
  return { ...config, base: clampWardrobeBase(raw) };
}

/** Legacy “auto” was stored as missing `hingedDoorHandleSide`; assign explicit left/right. */
function normalizeHingedDoorHandleSides(config: WardrobeConfig): WardrobeConfig {
  return {
    ...config,
    sections: config.sections.map((sec, i) => {
      const h = sec.hingedDoorHandleSide;
      if (h === "left" || h === "right") return sec;
      return {
        ...sec,
        hingedDoorHandleSide: i % 2 === 0 ? "right" : "left",
      };
    }),
  };
}

/** Clamp a per-section hinged door count to [1, 4] (default 1). */
export function normalizeHingedDoorCount(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 1;
  return Math.max(1, Math.min(4, v));
}

/** Ensure every section has a valid `hingedDoorCount` (legacy configs default to 1). */
function normalizeHingedDoorCounts(config: WardrobeConfig): WardrobeConfig {
  return {
    ...config,
    sections: config.sections.map((sec) => ({
      ...sec,
      hingedDoorCount: normalizeHingedDoorCount(sec.hingedDoorCount),
    })),
  };
}

/**
 * Validate persisted interior positions on load: clamp each component's Y
 * to the interior range and resolve any overlaps against the items placed
 * so far (bottom-up order). Does NOT bottom-pack the stack — free-float
 * positions the user set up are preserved across reloads.
 */
function normalizeInteriorVerticalStack(config: WardrobeConfig): WardrobeConfig {
  const G = wardrobeInteriorStackGapCm(config);
  const fh = config.frame.height;
  return {
    ...config,
    sections: config.sections.map((sec) => {
      if (sec.components.length === 0) return sec;
      const bottomToTop = [...sec.components].sort(
        (a, b) => a.yPosition - b.yPosition || a.id.localeCompare(b.id),
      );
      const placed: typeof sec.components = [];
      const updatedById = new Map<string, { yPosition: number }>();
      for (const c of bottomToTop) {
        const snapped = snapToGrid(clampY(c.yPosition, c.height, fh));
        const y = resolveYNoOverlap(snapped, c.height, c.type, placed, fh, G);
        placed.push({ ...c, yPosition: y });
        updatedById.set(c.id, { yPosition: y });
      }
      const components = sec.components.map((c) => {
        const upd = updatedById.get(c.id);
        return upd ? { ...c, yPosition: upd.yPosition } : c;
      });
      return { ...sec, components };
    }),
  };
}

const defaultUI: WardrobeUIState = {
  selectedSectionId: null,
  selectedComponentId: null,
  showDoors: true,
  viewMode: "perspective",
  activeStep: "frame",
  showTemplates: false,
  showDimensions: true,
  dividerDragActive: false,
  customizeEachDoor: false,
  linkInteriorExteriorFinishes: false,
  lengthUnit: "cm",
};

const persisted = loadFromStorage();
const initialRoomNormalized = normalizeWardrobeRoom(persisted?.room);
const initialConfigNormalized = normalizeInteriorVerticalStack(
  normalizeHingedDoorCounts(
    normalizeHingedDoorHandleSides(
      normalizeFrameDimensions(
        normalizeDoorConfig(normalizeBaseConfig(persisted?.config ?? defaultConfig)),
      ),
    ),
  ),
);

function persist(
  config: WardrobeConfig,
  room: RoomSettings,
  ui: WardrobeUIState,
  wardrobeSheetSizeOverrideCm: WardrobeSheetSizeOverrideCm | null,
) {
  saveToStorage({
    config,
    room,
    ui: {
      showDoors: ui.showDoors,
      customizeEachDoor: ui.customizeEachDoor,
      linkInteriorExteriorFinishes: ui.linkInteriorExteriorFinishes,
      lengthUnit: ui.lengthUnit,
    },
    wardrobeSheetSizeOverrideCm: wardrobeSheetSizeOverrideCm ?? undefined,
  });
}

type GetFn = () => WardrobeState;

/** JSON round-trip; wardrobe config is plain data (localStorage-safe). */
function cloneConfigForHistory(c: WardrobeConfig): WardrobeConfig {
  return JSON.parse(JSON.stringify(c)) as WardrobeConfig;
}

let persistRafId: number | null = null;

/** Batches writes and runs after paint so interaction (e.g. shelf reorder) stays responsive. */
function schedulePersistFromGet(get: GetFn) {
  if (persistRafId !== null) {
    cancelAnimationFrame(persistRafId);
  }
  persistRafId = requestAnimationFrame(() => {
    persistRafId = null;
    const st = get();
    persist(st.config, st.room, st.ui, st.wardrobeSheetSizeOverrideCm);
  });
}

function cloneRoom(room: RoomSettings): RoomSettings {
  return JSON.parse(JSON.stringify(room)) as RoomSettings;
}

function appendHistoryEntry(
  s: WardrobeState,
  nextConfig: WardrobeConfig,
  nextRoom: RoomSettings,
): Pick<WardrobeState, "history" | "historyIndex" | "canUndo" | "canRedo"> {
  const newHistory = s.history.slice(0, s.historyIndex + 1);
  newHistory.push({
    config: cloneConfigForHistory(nextConfig),
    room: cloneRoom(nextRoom),
  });
  if (newHistory.length > MAX_HISTORY) newHistory.shift();
  const newIndex = newHistory.length - 1;
  return {
    history: newHistory,
    historyIndex: newIndex,
    canUndo: newIndex > 0,
    canRedo: false,
  };
}

export const useWardrobeStore = create<WardrobeState>()(
  subscribeWithSelector((set, get) => {
    const initialConfig = initialConfigNormalized;
    const initialRoom = initialRoomNormalized;
    return {
      config: initialConfig,
      room: initialRoom,
      ui: {
        ...defaultUI,
        showDoors: persisted?.ui?.showDoors ?? defaultUI.showDoors,
        customizeEachDoor: persisted?.ui?.customizeEachDoor ?? defaultUI.customizeEachDoor,
        linkInteriorExteriorFinishes:
          persisted?.ui?.linkInteriorExteriorFinishes ?? defaultUI.linkInteriorExteriorFinishes,
        lengthUnit: normalizeLengthUnit(persisted?.ui?.lengthUnit),
      },
      availableMaterials: [],
      availableDoorMaterials: [],
      availableSlidingMechanisms: [],
      availableHandleMaterials: [],

      sheetPlacementOverrides: {},
      sheetManualExtraSheetsByMaterial: {},
      wardrobeSheetSizeOverrideCm: persisted?.wardrobeSheetSizeOverrideCm ?? null,

      history: [
        {
          config: cloneConfigForHistory(initialConfig),
          room: cloneRoom(initialRoom),
        },
      ],
      historyIndex: 0,
      canUndo: false,
      canRedo: false,

      setAvailableMaterials: (frame, door, slidingMechanisms, handleMaterials) =>
        set({
          availableMaterials: frame,
          availableDoorMaterials: door,
          availableSlidingMechanisms: slidingMechanisms,
          availableHandleMaterials: handleMaterials,
        }),

      mergeCatalogMaterialsIntoPools: (rows: WardrobeMaterial[]) =>
        set(() => {
          if (rows.length === 0) return {};
          const s = get();
          const fm = [...s.availableMaterials];
          const dm = [...s.availableDoorMaterials];
          const fSeen = new Set(fm.map((x) => x.id));
          const dSeen = new Set(dm.map((x) => x.id));
          for (const row of rows) {
            if (wardrobeManufacturerRowForFramePool(row) && !fSeen.has(row.id)) {
              fm.push(row);
              fSeen.add(row.id);
            }
            if (wardrobeManufacturerRowForDoorPool(row) && !dSeen.has(row.id)) {
              dm.push(row);
              dSeen.add(row.id);
            }
          }
          return { availableMaterials: fm, availableDoorMaterials: dm };
        }),

      setConfigForHydrate: (config: WardrobeConfig) =>
        set(() => {
          schedulePersistFromGet(get);
          return { config };
        }),

      setSheetPlacementOverrides: (update) =>
        set((s) => ({
          sheetPlacementOverrides:
            typeof update === "function" ? update(s.sheetPlacementOverrides) : update,
        })),

      clearSheetPlacementOverrides: () =>
        set({ sheetPlacementOverrides: {}, sheetManualExtraSheetsByMaterial: {} }),

      bumpSheetManualExtraSheets: (materialId) =>
        set((s) => ({
          sheetManualExtraSheetsByMaterial: {
            ...s.sheetManualExtraSheetsByMaterial,
            [materialId]: (s.sheetManualExtraSheetsByMaterial[materialId] ?? 0) + 1,
          },
        })),

      setWardrobeSheetSizeOverride: (value) =>
        set(() => {
          schedulePersistFromGet(get);
          return {
            wardrobeSheetSizeOverrideCm: value,
            sheetPlacementOverrides: {},
            sheetManualExtraSheetsByMaterial: {},
          };
        }),

      // ── Frame ──

      setFrameWidth: (w) =>
        set((s) => {
          const width = Math.round(Math.min(FRAME_MAX_WIDTH, Math.max(FRAME_MIN_WIDTH, w)));
          const frame = { ...s.config.frame, width };
          const sections = redistributeSections(s.config.sections, frame.width);
          const config = syncDoorPanelArrays({ ...s.config, frame, sections });
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      setFrameHeight: (h) =>
        set((s) => {
          const height = Math.round(Math.min(FRAME_MAX_HEIGHT, Math.max(FRAME_MIN_HEIGHT, h)));
          const frame = { ...s.config.frame, height };
          const config = { ...s.config, frame };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      setFrameDepth: (d) =>
        set((s) => {
          const depth = Math.round(Math.min(FRAME_MAX_DEPTH, Math.max(FRAME_MIN_DEPTH, d)));
          const frame = { ...s.config.frame, depth };
          const config = { ...s.config, frame };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      setWardrobeBaseType: (type: WardrobeBaseType) =>
        set((s) => {
          const base = clampWardrobeBase({ ...s.config.base, type });
          const config = { ...s.config, base };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      setWardrobeLegHeightCm: (cm) =>
        set((s) => {
          const legHeightCm = Math.round(Math.min(LEG_HEIGHT_MAX, Math.max(LEG_HEIGHT_MIN, cm)));
          const base = clampWardrobeBase({ ...s.config.base, type: "legs", legHeightCm });
          const config = { ...s.config, base };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      setWardrobePlinthHeightCm: (cm) =>
        set((s) => {
          const plinthHeightCm = Math.round(
            Math.min(PLINTH_HEIGHT_MAX, Math.max(PLINTH_HEIGHT_MIN, cm)),
          );
          const base = clampWardrobeBase({ ...s.config.base, type: "plinth", plinthHeightCm });
          const config = { ...s.config, base };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      setWardrobePlinthRecessCm: (cm) =>
        set((s) => {
          const plinthRecessCm =
            Math.round(Math.min(PLINTH_RECESS_MAX, Math.max(PLINTH_RECESS_MIN, cm)) * 10) / 10;
          const base = clampWardrobeBase({ ...s.config.base, type: "plinth", plinthRecessCm });
          const config = { ...s.config, base };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      // ── Sections ──

      setSectionCount: (count) =>
        set((s) => {
          const clamped = Math.max(1, Math.min(6, count));
          const sections = makeSections(s.config.frame.width, clamped);
          const config = syncDoorPanelArrays({ ...s.config, sections });
          schedulePersistFromGet(get);
          return {
            config,
            ui: { ...s.ui, selectedSectionId: null, selectedComponentId: null },
            ...appendHistoryEntry(s, config, s.room),
          };
        }),

      setSectionWidth: (sectionId, width) =>
        set((s) => {
          const idx = s.config.sections.findIndex((sec) => sec.id === sectionId);
          if (idx < 0) return s;
          const sections = setSectionWidthsWithRemainder(s.config.sections, s.config.frame.width, idx, width);
          const config = { ...s.config, sections };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      adjustSectionDivider: (dividerIndex, newLeftWidthCm) =>
        set((s) => {
          const n = s.config.sections.length;
          if (dividerIndex < 0 || dividerIndex >= n - 1) return s;
          const a = s.config.sections[dividerIndex].width;
          const b = s.config.sections[dividerIndex + 1].width;
          const pair = a + b;
          const min = SECTION_MIN_WIDTH_CM;
          const newA = roundCm(Math.min(Math.max(newLeftWidthCm, min), pair - min));
          const newB = roundCm(pair - newA);
          const sections = s.config.sections.map((sec, i) =>
            i === dividerIndex ? { ...sec, width: newA } : i === dividerIndex + 1 ? { ...sec, width: newB } : sec,
          );
          const config = { ...s.config, sections };
          if (!s.ui.dividerDragActive) {
            schedulePersistFromGet(get);
            return { config, ...appendHistoryEntry(s, config, s.room) };
          }
          return { config };
        }),

      setDividerDragActive: (active) =>
        set((s) => {
          if (!active && s.ui.dividerDragActive) {
            schedulePersistFromGet(get);
            return {
              ui: { ...s.ui, dividerDragActive: active },
              ...appendHistoryEntry(s, s.config, s.room),
            };
          }
          return { ui: { ...s.ui, dividerDragActive: active } };
        }),

      setSectionHingedDoorHandleSide: (sectionId, side) =>
        set((s) => {
          const sections = s.config.sections.map((sec) =>
            sec.id === sectionId ? { ...sec, hingedDoorHandleSide: side } : sec,
          );
          const config = { ...s.config, sections };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      setSectionHingedDoorCount: (sectionId, count) =>
        set((s) => {
          const hingedDoorCount = normalizeHingedDoorCount(count);
          const sections = s.config.sections.map((sec) =>
            sec.id === sectionId ? { ...sec, hingedDoorCount } : sec,
          );
          let config: WardrobeConfig = { ...s.config, sections };
          if (config.doors.type === "hinged") {
            config = syncDoorPanelArrays(config);
          }
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      // ── Components ──

      addComponent: (sectionId, type) =>
        set((s) => {
          const G = wardrobeInteriorStackGapCm(s.config);
          const def = getComponentDef(type);
          const section = s.config.sections.find((sec) => sec.id === sectionId);
          if (!section) return s;

          let yPos = 0;
          if (section.components.length > 0) {
            const sorted = [...section.components].sort((a, b) => a.yPosition - b.yPosition);
            const top = sorted[sorted.length - 1];
            yPos = top.yPosition + top.height + minVerticalGapCm(top.type, type, G);
          }
          yPos = snapToGrid(clampY(yPos, def.defaultHeight, s.config.frame.height));
          yPos = resolveYNoOverlap(
            yPos,
            def.defaultHeight,
            type,
            section.components,
            s.config.frame.height,
            G,
          );

          const comp = {
            id: uuidv4(),
            type,
            yPosition: yPos,
            height: def.defaultHeight,
          };

          const sections = s.config.sections.map((sec) =>
            sec.id === sectionId
              ? { ...sec, components: [...sec.components, comp] }
              : sec
          );
          const config = { ...s.config, sections };
          schedulePersistFromGet(get);
          return {
            config,
            ui: { ...s.ui, selectedComponentId: comp.id },
            ...appendHistoryEntry(s, config, s.room),
          };
        }),

      duplicateComponent: (sectionId, componentId) =>
        set((s) => {
          const G = wardrobeInteriorStackGapCm(s.config);
          const section = s.config.sections.find((sec) => sec.id === sectionId);
          if (!section) return s;
          const original = section.components.find((c) => c.id === componentId);
          if (!original) return s;

          let yPos =
            original.yPosition +
            original.height +
            minVerticalGapCm(original.type, original.type, G);
          yPos = snapToGrid(clampY(yPos, original.height, s.config.frame.height));
          yPos = resolveYNoOverlap(
            yPos,
            original.height,
            original.type,
            section.components,
            s.config.frame.height,
            G,
          );

          const dup: WardrobeComponent = {
            id: uuidv4(),
            type: original.type,
            yPosition: yPos,
            height: original.height,
            grainDirection: original.grainDirection,
            ...(original.type === "shelf"
              ? {
                  shelfWidthCm: original.shelfWidthCm,
                  shelfDepthCm: original.shelfDepthCm,
                  shelfDepthPlacement: original.shelfDepthPlacement,
                }
              : {}),
          };

          const sections = s.config.sections.map((sec) =>
            sec.id === sectionId
              ? { ...sec, components: [...sec.components, dup] }
              : sec
          );
          const config = { ...s.config, sections };
          schedulePersistFromGet(get);
          return {
            config,
            ui: { ...s.ui, selectedComponentId: dup.id },
            ...appendHistoryEntry(s, config, s.room),
          };
        }),

      removeComponent: (sectionId, componentId) =>
        set((s) => {
          const sections = s.config.sections.map((sec) => {
            if (sec.id !== sectionId) return sec;
            // Free-float: removing one item leaves the rest at their
            // current Y positions (no bottom-pack "falling" effect).
            const components = sec.components.filter((c) => c.id !== componentId);
            return { ...sec, components };
          });
          const config = { ...s.config, sections };
          schedulePersistFromGet(get);
          return {
            config,
            ui: {
              ...s.ui,
              selectedComponentId:
                s.ui.selectedComponentId === componentId ? null : s.ui.selectedComponentId,
            },
            ...appendHistoryEntry(s, config, s.room),
          };
        }),

      moveComponent: (sectionId, componentId, newY) =>
        set((s) => {
          const G = wardrobeInteriorStackGapCm(s.config);
          const sections = s.config.sections.map((sec) => {
            if (sec.id !== sectionId) return sec;
            const components = sec.components.map((c) => {
              if (c.id !== componentId) return c;
              const snapped = snapToGrid(clampY(newY, c.height, s.config.frame.height));
              const others = sec.components.filter((o) => o.id !== componentId);
              const y = resolveYNoOverlap(
                snapped,
                c.height,
                c.type,
                others,
                s.config.frame.height,
                G,
              );
              return { ...c, yPosition: y };
            });
            // Free-float: keep the component exactly where the user put it
            // (clamped + collision-resolved). No bottom-up repack here, so
            // shelves/drawers/etc. can sit at any height the user drags
            // them to. Explicit reorder / add operations still repack.
            return { ...sec, components };
          });
          const config = { ...s.config, sections };
          // While the user is dragging (divider-drag flag doubles as
          // "interactive manipulation in progress"), skip history / persist.
          // `setDividerDragActive(false)` at drag-end commits one snapshot.
          if (!s.ui.dividerDragActive) {
            schedulePersistFromGet(get);
            return { config, ...appendHistoryEntry(s, config, s.room) };
          }
          return { config };
        }),

      reorderComponents: (sectionId, fromId, toId) =>
        set((s) => {
          const G = wardrobeInteriorStackGapCm(s.config);
          const section = s.config.sections.find((sec) => sec.id === sectionId);
          if (!section) return s;
          if (fromId === toId) return s;

          const topToBottom = [...section.components].sort(
            (a, b) => b.yPosition - a.yPosition || a.id.localeCompare(b.id),
          );
          const fromOrderIdx = topToBottom.findIndex((c) => c.id === fromId);
          const toOrderIdx = topToBottom.findIndex((c) => c.id === toId);
          if (fromOrderIdx < 0 || toOrderIdx < 0) return s;

          const reorderedTopToBottom = arrayMove(topToBottom, fromOrderIdx, toOrderIdx);
          const components = repackComponentsVertical(
            section.components,
            s.config.frame.height,
            reorderedTopToBottom,
            G,
          );

          const sections = s.config.sections.map((sec) =>
            sec.id === sectionId ? { ...sec, components } : sec,
          );
          const config = { ...s.config, sections };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      setComponentGrainDirection: (sectionId, componentId, direction) =>
        set((s) => {
          const sections = s.config.sections.map((sec) => {
            if (sec.id !== sectionId) return sec;
            return {
              ...sec,
              components: sec.components.map((c) =>
                c.id === componentId ? { ...c, grainDirection: direction } : c
              ),
            };
          });
          const config = { ...s.config, sections };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      setComponentYPosition: (sectionId, componentId, yCm) =>
        set((s) => {
          const G = wardrobeInteriorStackGapCm(s.config);
          const sections = s.config.sections.map((sec) => {
            if (sec.id !== sectionId) return sec;
            const components = sec.components.map((c) => {
              if (c.id !== componentId) return c;
              const snapped = snapToGrid(clampY(yCm, c.height, s.config.frame.height));
              const others = sec.components.filter((o) => o.id !== componentId);
              const y = resolveYNoOverlap(
                snapped,
                c.height,
                c.type,
                others,
                s.config.frame.height,
                G,
              );
              return { ...c, yPosition: y };
            });
            // Free-float: honour the requested Y (clamp + no-overlap) and
            // leave the other components alone.
            return { ...sec, components };
          });
          const config = { ...s.config, sections };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      setComponentHeight: (sectionId, componentId, heightCm) =>
        set((s) => {
          const G = wardrobeInteriorStackGapCm(s.config);
          const sections = s.config.sections.map((sec) => {
            if (sec.id !== sectionId) return sec;
            const comp = sec.components.find((c) => c.id === componentId);
            if (!comp) return sec;
            const def = getComponentDef(comp.type);
            const h = Math.round(Math.min(def.maxHeight, Math.max(def.minHeight, heightCm)) * 10) / 10;
            const othersFromBase = sec.components.filter((o) => o.id !== componentId);
            const y = resolveYNoOverlap(
              comp.yPosition,
              h,
              comp.type,
              othersFromBase,
              s.config.frame.height,
              G,
            );
            // Free-float: adjust only the resized component; preserve other
            // items' Y positions.
            const components = sec.components.map((c) =>
              c.id === componentId ? { ...c, yPosition: y, height: h } : c,
            );
            return { ...sec, components };
          });
          const config = { ...s.config, sections };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      setShelfWidthCm: (sectionId, componentId, widthCm) =>
        set((s) => {
          const sections = s.config.sections.map((sec) => {
            if (sec.id !== sectionId) return sec;
            const components = sec.components.map((c) => {
              if (c.id !== componentId || c.type !== "shelf") return c;
              const maxW = shelfMaxWidthCm(sec.width);
              const w = Math.round(
                Math.min(maxW, Math.max(MIN_SHELF_WIDTH_CM, widthCm)) * 10,
              ) / 10;
              return { ...c, shelfWidthCm: w };
            });
            return { ...sec, components };
          });
          const config = { ...s.config, sections };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      setShelfDepthCm: (sectionId, componentId, depthCm) =>
        set((s) => {
          const D = s.config.frame.depth;
          const sections = s.config.sections.map((sec) => {
            if (sec.id !== sectionId) return sec;
            const components = sec.components.map((c) => {
              if (c.id !== componentId || c.type !== "shelf") return c;
              if (depthCm == null || !Number.isFinite(depthCm)) {
                const { shelfDepthCm: _, ...rest } = c;
                return rest as WardrobeComponent;
              }
              const maxD = shelfMaxDepthCm(D);
              const d = Math.round(
                Math.min(maxD, Math.max(MIN_SHELF_DEPTH_CM, depthCm)) * 10,
              ) / 10;
              return { ...c, shelfDepthCm: d };
            });
            return { ...sec, components };
          });
          const config = { ...s.config, sections };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      setShelfDepthPlacement: (
        sectionId,
        componentId,
        placement: ShelfDepthPlacement,
      ) =>
        set((s) => {
          const sections = s.config.sections.map((sec) => {
            if (sec.id !== sectionId) return sec;
            const components = sec.components.map((c) =>
              c.id === componentId && c.type === "shelf"
                ? { ...c, shelfDepthPlacement: placement }
                : c,
            );
            return { ...sec, components };
          });
          const config = { ...s.config, sections };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      setInteriorStackGapCm: (cm) =>
        set((s) => {
          const interiorStackGapCm =
            Math.round(Math.min(15, Math.max(0, cm)) * 10) / 10;
          const config = { ...s.config, interiorStackGapCm };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      // ── Doors ──

      setDoorType: (type) =>
        set((s) => {
          const prev = s.config.doors.doorPanelMaterialIds;
          const seed = prev.length > 0 ? prev[0]! : INTERNAL_RENDER_FALLBACK.id;
          const prevForResize = prev.length > 0 ? prev : [seed];
          const targetLen = wardrobeDoorPanelMaterialIdsLength(
            type,
            s.config.frame.width,
            s.config.sections,
          );
          const doorPanelMaterialIds =
            type === "hinged"
              ? normalizeHingedDoorPanelMaterialIds(
                  prevForResize,
                  s.config.sections,
                  INTERNAL_RENDER_FALLBACK.id,
                )
              : resizeDoorPanelMaterialIds(
                  prevForResize,
                  targetLen,
                  INTERNAL_RENDER_FALLBACK.id,
                );
          const doorPanelGrainDirections =
            type === "hinged"
              ? normalizeHingedDoorPanelGrainDirections(
                  s.config.doors.doorPanelGrainDirections ?? [],
                  s.config.sections,
                  s.config.doorGrainDirection ?? "horizontal",
                )
              : resizeDoorPanelGrainDirections(
                  s.config.doors.doorPanelGrainDirections ?? [],
                  targetLen,
                  s.config.doorGrainDirection ?? "horizontal",
                );
          // Sliding doors default to no handle (recessed edge pulls are typical);
          // switching back to hinged from the sliding default restores a visible handle.
          const prevHandle = s.config.doors.handle;
          const handle: HandleStyle =
            type === "sliding"
              ? "none"
              : prevHandle === "none"
                ? "bar-steel"
                : prevHandle;
          const doors = { ...s.config.doors, type, doorPanelMaterialIds, doorPanelGrainDirections, handle };
          if (type === "sliding") doors.handleMaterialId = undefined;
          const config = { ...s.config, doors };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      setAllDoorPanelMaterials: (materialId) =>
        set((s) => {
          const len = wardrobeDoorPanelMaterialIdsLength(
            s.config.doors.type,
            s.config.frame.width,
            s.config.sections,
          );
          const doorPanelMaterialIds = Array.from({ length: len }, () => materialId);
          const g = s.config.doorGrainDirection ?? "horizontal";
          const doorPanelGrainDirections = Array.from({ length: len }, () => g);
          const config = {
            ...s.config,
            doors: { ...s.config.doors, doorPanelMaterialIds, doorPanelGrainDirections },
          };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      setDoorPanelMaterial: (panelIndex, materialId) =>
        set((s) => {
          const ids = [...s.config.doors.doorPanelMaterialIds];
          if (panelIndex < 0 || panelIndex >= ids.length) return s;
          ids[panelIndex] = materialId;
          const config = { ...s.config, doors: { ...s.config.doors, doorPanelMaterialIds: ids } };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      setDoorPanelGrainDirection: (panelIndex, direction) =>
        set((s) => {
          const grains = [...(s.config.doors.doorPanelGrainDirections ?? [])];
          if (panelIndex < 0 || panelIndex >= grains.length) return s;
          grains[panelIndex] = direction;
          const config = { ...s.config, doors: { ...s.config.doors, doorPanelGrainDirections: grains } };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      setSlidingMechanism: (materialId) =>
        set((s) => {
          const config = { ...s.config, doors: { ...s.config.doors, slidingMechanismId: materialId } };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      setDoorHandle: (handle) =>
        set((s) => {
          const doors = { ...s.config.doors, handle };
          if (handle === "none") doors.handleMaterialId = undefined;
          const config = { ...s.config, doors };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      setDoorHandleMaterial: (materialId) =>
        set((s) => {
          const doors = { ...s.config.doors, handleMaterialId: materialId };
          const config = { ...s.config, doors };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      // ── Materials ──

      setFrameMaterial: (materialId) =>
        set((s) => {
          const config = { ...s.config, frameMaterial: materialId };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      setInteriorMaterial: (materialId) =>
        set((s) => {
          const config = { ...s.config, interiorMaterial: materialId };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      setExteriorMaterial: (materialId) =>
        set((s) => {
          const doorsCfg = s.config.doors;
          if (doorsCfg.type === "none") {
            const config = { ...s.config, frameMaterial: materialId };
            schedulePersistFromGet(get);
            return {
              config,
              ui: { ...s.ui, customizeEachDoor: false },
              ...appendHistoryEntry(s, config, s.room),
            };
          }
          const len = wardrobeDoorPanelMaterialIdsLength(
            doorsCfg.type,
            s.config.frame.width,
            s.config.sections,
          );
          const g = s.config.doorGrainDirection ?? s.config.frameGrainDirection ?? "horizontal";
          const doorPanelMaterialIds = Array.from({ length: len }, () => materialId);
          const doorPanelGrainDirections = Array.from({ length: len }, () => g);
          const config = {
            ...s.config,
            frameMaterial: materialId,
            doors: {
              ...doorsCfg,
              doorPanelMaterialIds,
              doorPanelGrainDirections,
            },
          };
          schedulePersistFromGet(get);
          return {
            config,
            ui: { ...s.ui, customizeEachDoor: false },
            ...appendHistoryEntry(s, config, s.room),
          };
        }),

      setFrameGrainDirection: (direction) =>
        set((s) => {
          const config = { ...s.config, frameGrainDirection: direction };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      setInteriorGrainDirection: (direction) =>
        set((s) => {
          const config = { ...s.config, interiorGrainDirection: direction };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      setDoorGrainDirection: (direction) =>
        set((s) => {
          const sections = s.config.sections.map((sec) => ({
            ...sec,
            components: sec.components.map((c) => {
              if (c.type !== "drawer" || c.grainDirection === undefined) return c;
              const { grainDirection: _removed, ...rest } = c;
              return rest as WardrobeComponent;
            }),
          }));
          const len = wardrobeDoorPanelMaterialIdsLength(
            s.config.doors.type,
            s.config.frame.width,
            s.config.sections,
          );
          const doorPanelGrainDirections = Array.from({ length: len }, () => direction);
          const config = {
            ...s.config,
            doorGrainDirection: direction,
            sections,
            doors: { ...s.config.doors, doorPanelGrainDirections },
          };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      setExteriorGrainDirection: (direction) =>
        set((s) => {
          const sections = s.config.sections.map((sec) => ({
            ...sec,
            components: sec.components.map((c) => {
              if (c.type !== "drawer" || c.grainDirection === undefined) return c;
              const { grainDirection: _removed, ...rest } = c;
              return rest as WardrobeComponent;
            }),
          }));
          const len = wardrobeDoorPanelMaterialIdsLength(
            s.config.doors.type,
            s.config.frame.width,
            s.config.sections,
          );
          const doorPanelGrainDirections =
            len > 0
              ? Array.from({ length: len }, () => direction)
              : (s.config.doors.doorPanelGrainDirections ?? []);
          const config = {
            ...s.config,
            frameGrainDirection: direction,
            doorGrainDirection: direction,
            sections,
            doors: { ...s.config.doors, doorPanelGrainDirections },
          };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      // ── Room ──

      setWallColor: (color) =>
        set((s) => {
          const room = { ...s.room, wallColor: color };
          schedulePersistFromGet(get);
          return { room };
        }),

      setFloorStyle: (style) =>
        set((s) => {
          const room = normalizeWardrobeRoom({ ...s.room, floorStyle: style });
          schedulePersistFromGet(get);
          return { room };
        }),

      setPlannerFloorSurface: (patch) =>
        set((s) => {
          const room = normalizeWardrobeRoom({ ...s.room, ...patch });
          schedulePersistFromGet(get);
          return { room };
        }),

      setPlannerWallCeilingSurface: (patch) =>
        set((s) => {
          const room = normalizeWardrobeRoom({ ...s.room, ...patch });
          schedulePersistFromGet(get);
          return { room };
        }),

      setSpaceLayoutPreset: (preset: WardrobeSpaceLayoutPreset) =>
        set((s) => {
          const room = normalizeSpaceLayoutFields({ ...s.room, spaceLayoutPreset: preset });
          schedulePersistFromGet(get);
          return {
            room,
            sheetPlacementOverrides: {},
            ...appendHistoryEntry(s, s.config, room),
          };
        }),

      setWalkInVariant: (variant: WardrobeWalkInVariant) =>
        set((s) => {
          const room = normalizeSpaceLayoutFields({ ...s.room, walkInVariant: variant });
          schedulePersistFromGet(get);
          return {
            room,
            sheetPlacementOverrides: {},
            ...appendHistoryEntry(s, s.config, room),
          };
        }),

      setBridgeLiftCm: (cm: number) =>
        set((s) => {
          const room = normalizeSpaceLayoutFields({ ...s.room, bridgeLiftCm: cm });
          schedulePersistFromGet(get);
          return { room, ...appendHistoryEntry(s, s.config, room) };
        }),

      setRoomWidthM: (widthM: number) =>
        set((s) => {
          const room = normalizeSpaceLayoutFields({ ...s.room, roomWidthM: widthM });
          schedulePersistFromGet(get);
          return {
            room,
            sheetPlacementOverrides: {},
            ...appendHistoryEntry(s, s.config, room),
          };
        }),

      setRoomDepthM: (depthM: number) =>
        set((s) => {
          const room = normalizeSpaceLayoutFields({ ...s.room, roomDepthM: depthM });
          schedulePersistFromGet(get);
          return {
            room,
            sheetPlacementOverrides: {},
            ...appendHistoryEntry(s, s.config, room),
          };
        }),

      setRoomHeightM: (heightM: number) =>
        set((s) => {
          const room = normalizeSpaceLayoutFields({ ...s.room, roomHeightM: heightM });
          schedulePersistFromGet(get);
          return {
            room,
            sheetPlacementOverrides: {},
            ...appendHistoryEntry(s, s.config, room),
          };
        }),

      setWardrobeCornerAttachment: (attachment: WardrobeCornerAttachment) =>
        set((s) => {
          const room = normalizeSpaceLayoutFields({ ...s.room, wardrobeCornerAttachment: attachment });
          schedulePersistFromGet(get);
          return {
            room,
            sheetPlacementOverrides: {},
            ...appendHistoryEntry(s, s.config, room),
          };
        }),

      setWardrobePrimaryRun: (run: WardrobePrimaryRun | undefined) =>
        set((s) => {
          const room = normalizeSpaceLayoutFields({ ...s.room, wardrobePrimaryRun: run });
          schedulePersistFromGet(get);
          return { room };
        }),

      // ── UI ──

      selectSection: (id) =>
        set((s) => ({ ui: { ...s.ui, selectedSectionId: id, selectedComponentId: null } })),

      selectComponent: (id) =>
        set((s) => ({ ui: { ...s.ui, selectedComponentId: id } })),

      toggleDoors: () =>
        set((s) => {
          const ui = { ...s.ui, showDoors: !s.ui.showDoors };
          schedulePersistFromGet(get);
          return { ui };
        }),

      setCustomizeEachDoor: (on) =>
        set((s) => {
          const ui = { ...s.ui, customizeEachDoor: on };
          schedulePersistFromGet(get);
          return { ui };
        }),

      setLinkInteriorExteriorFinishes: (on) =>
        set((s) => {
          const ui = { ...s.ui, linkInteriorExteriorFinishes: on };
          schedulePersistFromGet(get);
          return { ui };
        }),

      setViewMode: (mode) =>
        set((s) => {
          const ui = { ...s.ui, viewMode: mode };
          schedulePersistFromGet(get);
          return { ui };
        }),

      setActiveStep: (step) =>
        set((s) => ({ ui: { ...s.ui, activeStep: step } })),

      setShowTemplates: (show) =>
        set((s) => ({ ui: { ...s.ui, showTemplates: show } })),

      toggleDimensions: () =>
        set((s) => ({ ui: { ...s.ui, showDimensions: !s.ui.showDimensions } })),

      setLengthUnit: (unit) =>
        set((s) => {
          const ui = { ...s.ui, lengthUnit: normalizeLengthUnit(unit) };
          schedulePersistFromGet(get);
          return { ui };
        }),

      // ── Undo / Redo ──

      undo: () =>
        set((s) => {
          if (s.historyIndex <= 0) return s;
          const newIndex = s.historyIndex - 1;
          const entry = s.history[newIndex]!;
          const config = cloneConfigForHistory(entry.config);
          const room = cloneRoom(entry.room);
          schedulePersistFromGet(get);
          return {
            config,
            room,
            historyIndex: newIndex,
            canUndo: newIndex > 0,
            canRedo: true,
          };
        }),

      redo: () =>
        set((s) => {
          if (s.historyIndex >= s.history.length - 1) return s;
          const newIndex = s.historyIndex + 1;
          const entry = s.history[newIndex]!;
          const config = cloneConfigForHistory(entry.config);
          const room = cloneRoom(entry.room);
          schedulePersistFromGet(get);
          return {
            config,
            room,
            historyIndex: newIndex,
            canUndo: true,
            canRedo: newIndex < s.history.length - 1,
          };
        }),

      // ── Templates ──

      applyTemplate: (templateConfig) =>
        set((s) => {
          const config = normalizeFrameDimensions(
            normalizeDoorConfig(normalizeBaseConfig(structuredClone(templateConfig))),
          );
          const room = normalizeSpaceLayoutFields({ ...defaultRoom });
          schedulePersistFromGet(get);
          return {
            config,
            room,
            sheetPlacementOverrides: {},
            sheetManualExtraSheetsByMaterial: {},
            wardrobeSheetSizeOverrideCm: null,
            ui: { ...s.ui, showTemplates: false, selectedSectionId: null, selectedComponentId: null },
            ...appendHistoryEntry(s, config, room),
          };
        }),

      // ── Addons ──

      addWardrobeAddon: (position) =>
        set((s) => {
          const nextId = `addon-${Date.now().toString(36)}-${Math.random()
            .toString(36)
            .slice(2, 6)}`;
          const existing = s.config.addons ?? [];
          const config: WardrobeConfig = {
            ...s.config,
            addons: [...existing, { id: nextId, position }],
            seamStyle: s.config.seamStyle ?? "independent",
          };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      removeWardrobeAddon: (id) =>
        set((s) => {
          const existing = s.config.addons ?? [];
          const config: WardrobeConfig = {
            ...s.config,
            addons: existing.filter((a) => a.id !== id),
          };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      setSeamStyle: (style) =>
        set((s) => {
          const config: WardrobeConfig = { ...s.config, seamStyle: style };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      setPanelFrontOverride: (panelId, isFront) =>
        set((s) => {
          const prev = s.config.panelFrontOverrides ?? {};
          const next: Record<string, boolean> = { ...prev };
          if (isFront === null) {
            if (!(panelId in next)) return s;
            delete next[panelId];
          } else {
            if (next[panelId] === isFront) return s;
            next[panelId] = isFront;
          }
          const config: WardrobeConfig = { ...s.config, panelFrontOverrides: next };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      clearPanelFrontOverrides: () =>
        set((s) => {
          if (!s.config.panelFrontOverrides || Object.keys(s.config.panelFrontOverrides).length === 0) {
            return s;
          }
          const config: WardrobeConfig = { ...s.config, panelFrontOverrides: {} };
          schedulePersistFromGet(get);
          return { config, ...appendHistoryEntry(s, config, s.room) };
        }),

      // ── Reset ──

      resetConfig: () => {
        localStorage.removeItem(STORAGE_KEY);
        const freshConfig = { ...defaultConfig, sections: makeSections(defaultConfig.frame.width, 2) };
        const freshRoom = normalizeSpaceLayoutFields({ ...defaultRoom });
        set({
          config: freshConfig,
          room: freshRoom,
          ui: { ...defaultUI },
          sheetPlacementOverrides: {},
          sheetManualExtraSheetsByMaterial: {},
          wardrobeSheetSizeOverrideCm: null,
          history: [{ config: cloneConfigForHistory(freshConfig), room: cloneRoom(freshRoom) }],
          historyIndex: 0,
          canUndo: false,
          canRedo: false,
        });
      },
    };
  })
);

function roundCm(w: number): number {
  return Math.round(w * 10) / 10;
}

/**
 * Set one bay width so the total interior width stays valid.
 * - Sections 0..n-2: updates that bay and recomputes the last bay.
 * - Last section index: adjusts the last two bays together (pair sum fixed by sections 0..n-3).
 */
function setSectionWidthsWithRemainder(
  sections: WardrobeSection[],
  frameWidth: number,
  sectionIndex: number,
  widthCm: number,
): WardrobeSection[] {
  const n = sections.length;
  const target = totalInteriorSectionWidthsCm(frameWidth, n);
  const min = SECTION_MIN_WIDTH_CM;

  if (n === 0) return sections;
  if (n === 1) {
    return sections.map((sec) => ({ ...sec, width: roundCm(target) }));
  }

  if (sectionIndex === n - 1) {
    const sumBeforePair = sections.slice(0, n - 2).reduce((a, s) => a + s.width, 0);
    const pair = roundCm(target - sumBeforePair);
    const wLast = roundCm(Math.min(Math.max(widthCm, min), pair - min));
    const wPrev = roundCm(pair - wLast);
    return sections.map((sec, idx) => {
      if (idx === n - 2) return { ...sec, width: wPrev };
      if (idx === n - 1) return { ...sec, width: wLast };
      return sec;
    });
  }

  const sumOther = sections.reduce((acc, s, j) => (j !== sectionIndex && j < n - 1 ? acc + s.width : acc), 0);
  const maxWi = roundCm(target - min - sumOther);
  const wi = roundCm(Math.min(Math.max(widthCm, min), maxWi));
  const wLast = roundCm(target - sumOther - wi);
  return sections.map((sec, idx) => {
    if (idx === sectionIndex) return { ...sec, width: wi };
    if (idx === n - 1) return { ...sec, width: wLast };
    return sec;
  });
}

function redistributeSections(sections: WardrobeSection[], newFrameWidth: number): WardrobeSection[] {
  const interior = newFrameWidth - PANEL_THICKNESS * 2;
  const dividerSpace = (sections.length - 1) * PANEL_THICKNESS;
  const available = interior - dividerSpace;
  const totalCurrent = sections.reduce((sum, s) => sum + s.width, 0);

  if (totalCurrent <= 0) {
    const each = available / sections.length;
    return sections.map((s) => ({ ...s, width: Math.round(each * 10) / 10 }));
  }

  return sections.map((s) => ({
    ...s,
    width: Math.round(((s.width / totalCurrent) * available) * 10) / 10,
  }));
}
