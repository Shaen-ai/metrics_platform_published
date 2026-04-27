import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import type {
  KitchenState,
  KitchenConfig,
  KitchenUIState,
  RoomSettings,
  BaseModuleType,
  WallModuleType,
  HandleStyle,
  CountertopMaterial,
  ViewMode,
  KitchenStep,
  DesignRefKind,
} from "./types";
import type { FloorStyle } from "../types";
import type { KitchenMaterial } from "./data";
import type { Module } from "@/lib/types";
import {
  NEUTRAL_KITCHEN_MATERIAL,
  NEUTRAL_KITCHEN_MATERIAL_ID,
  BASE_MODULE_CATALOG,
  WALL_MODULE_CATALOG,
  getBaseModuleLimits,
  getWallModuleLimits,
  getEffectiveWallDims,
  normalizeKitchenConfig,
  defaultIslandConfig,
  defaultCornerUnitConfig,
  defaultLeftWallConfig,
  DESIGN_REF_PRESETS,
  WALL_MOUNT_Y,
  inferKitchenBaseTypeFromName,
  inferKitchenWallTypeFromName,
  clampConfigMaterialsToAvailable,
  resolveAddModuleWidth,
} from "./data";
import type { KitchenModule } from "./types";

function clampDim(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

const ROOM_HEIGHT_CM = 300;
const MIN_ROOM_WIDTH_M = 3.5;

/** Find a non-overlapping position for a new wall module within wall bounds. */
function findFreeWallPosition(
  newMod: KitchenModule,
  existingWallModules: KitchenModule[],
  baseModules: KitchenModule[],
  room?: { footprintWidthM: number; floorOutline?: { x: number; z: number }[] },
): { xCm: number; yCm: number } {
  const dim = getEffectiveWallDims(newMod);
  const isHood = newMod.type === "hood-unit";
  const newHW = (isHood ? dim.w * 0.9 : dim.w) / 2;
  const newHH = (isHood ? dim.h * 0.55 : dim.h) / 2;
  const defaultY = WALL_MOUNT_Y + newHH;

  const totalBase = baseModules.reduce((s, m) => s + m.width, 0);
  const totalWall = existingWallModules.reduce((s, m) => s + m.width, 0);
  const wallStart = (totalBase - totalWall) / 2;

  // Compute wall width in cm
  let fpW = room?.footprintWidthM ?? 5;
  if (room?.floorOutline && room.floorOutline.length >= 3) {
    let minX = Infinity, maxX = -Infinity;
    for (const p of room.floorOutline) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); }
    fpW = maxX - minX;
  }
  const wallWidthCm = Math.max(totalBase * 0.01 + 1.6, fpW, MIN_ROOM_WIDTH_M) / 0.01;
  const maxX = wallWidthCm - newHW;
  const maxY = ROOM_HEIGHT_CM - newHH;

  type Rect = { cx: number; cy: number; hw: number; hh: number };
  const rects: Rect[] = [];
  let cum = 0;
  for (const mod of existingWallModules) {
    const d = getEffectiveWallDims(mod);
    const mHood = mod.type === "hood-unit";
    const hw = (mHood ? d.w * 0.9 : d.w) / 2;
    const hh = (mHood ? d.h * 0.55 : d.h) / 2;
    const cx = mod.xCm ?? wallStart + cum + hw;
    const cy = mod.yCm ?? WALL_MOUNT_Y + hh;
    rects.push({ cx, cy, hw, hh });
    cum += mod.width;
  }

  const overlaps = (x: number, y: number) =>
    rects.some(
      (r) =>
        Math.abs(x - r.cx) < newHW + r.hw - 0.1 &&
        Math.abs(y - r.cy) < newHH + r.hh - 0.1,
    );

  const inBounds = (x: number, y: number) =>
    x >= newHW && x <= maxX && y >= newHH && y <= maxY;

  // Try placing to the right of the last module at the default Y
  const lastRect = rects[rects.length - 1];
  if (lastRect) {
    const candidate = lastRect.cx + lastRect.hw + newHW + 2;
    if (inBounds(candidate, defaultY) && !overlaps(candidate, defaultY)) {
      return { xCm: candidate, yCm: defaultY };
    }
  }

  // Scan rightward at the default Y row, within wall bounds
  for (let x = newHW; x <= maxX; x += 10) {
    if (!overlaps(x, defaultY)) {
      return { xCm: x, yCm: defaultY };
    }
  }

  // Scan a row above
  const aboveY = defaultY + newHH * 2 + 5;
  if (aboveY <= maxY) {
    for (let x = newHW; x <= maxX; x += 10) {
      if (!overlaps(x, aboveY)) {
        return { xCm: x, yCm: aboveY };
      }
    }
  }

  // Scan below default
  const belowY = Math.max(newHH, defaultY - newHH * 2 - 5);
  for (let x = newHW; x <= maxX; x += 10) {
    if (!overlaps(x, belowY)) {
      return { xCm: x, yCm: belowY };
    }
  }

  return { xCm: Math.min(totalBase / 2, maxX), yCm: defaultY };
}
import { bboxSizeFromOutline } from "../utils/kitchenFloorTemplates";

const STORAGE_KEY = "kitchen-configurator-state";
const MAX_HISTORY = 50;

interface PersistedData {
  config: KitchenConfig;
  room?: RoomSettings;
  kitchenDesignSetupComplete?: boolean;
}

function loadFromStorage(): PersistedData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedData;
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

/** Persist using `s` = state *before* the incoming `set` return (correct `config`/`room` from closure). */
function persistSliceValues(
  s: KitchenState,
  patch: Partial<Pick<KitchenState, "config" | "room" | "kitchenDesignSetupComplete">>,
) {
  saveToStorage({
    config: patch.config ?? s.config,
    room: patch.room ?? s.room,
    kitchenDesignSetupComplete:
      patch.kitchenDesignSetupComplete ?? s.kitchenDesignSetupComplete,
  });
}

const defaultConfig: KitchenConfig = {
  cabinetMaterial: NEUTRAL_KITCHEN_MATERIAL_ID,
  cabinetGrainDirection: "horizontal",
  doorGrainDirection: "horizontal",
  doors: { material: NEUTRAL_KITCHEN_MATERIAL_ID, handle: "bar-steel" },
  countertop: { material: "light-stone", overhang: 2 },
  hasWallCabinets: false,
  baseModules: [],
  wallModules: [],
  island: defaultIslandConfig(),
  cornerUnit: defaultCornerUnitConfig(),
  leftWall: defaultLeftWallConfig(),
  designPlacements: [],
};

const defaultRoom: RoomSettings = {
  wallColor: "#e8e6e2",
  floorStyle: "laminate-light-oak",
  footprintWidthM: 5,
  footprintDepthM: 4,
};

const defaultUI: KitchenUIState = {
  selectedBaseModuleId: null,
  selectedWallModuleId: null,
  selectedIslandBaseModuleId: null,
  selectedIslandWallModuleId: null,
  selectedLeftBaseModuleId: null,
  selectedLeftWallModuleId: null,
  selectedCornerUnit: false,
  selectedRun: "base",
  viewMode: "perspective",
  activeStep: "layout",
  showTemplates: false,
  showDimensions: true,
  orbitControlsEnabled: true,
  wallAlignGuides: [],
  floorAlignGuides: [],
};

const persisted = loadFromStorage();
const initialConfigNormalized = clampConfigMaterialsToAvailable(
  normalizeKitchenConfig(
    persisted?.config ? (persisted.config as KitchenConfig) : defaultConfig,
  ),
  [NEUTRAL_KITCHEN_MATERIAL],
  [NEUTRAL_KITCHEN_MATERIAL],
  [],
  [],
);

function mergePersistedRoom(saved?: RoomSettings): RoomSettings {
  const merged: RoomSettings = {
    ...defaultRoom,
    ...(saved ?? {}),
  };
  if (merged.floorOutline && merged.floorOutline.length >= 3) {
    const bb = bboxSizeFromOutline(merged.floorOutline);
    return {
      ...merged,
      footprintWidthM: bb.width,
      footprintDepthM: bb.depth,
    };
  }
  return {
    ...merged,
    footprintWidthM: saved?.footprintWidthM ?? defaultRoom.footprintWidthM,
    footprintDepthM: saved?.footprintDepthM ?? defaultRoom.footprintDepthM,
  };
}

const mergedInitialRoom: RoomSettings = mergePersistedRoom(persisted?.room);

type SetFn = (
  partial: Partial<KitchenState> | ((s: KitchenState) => Partial<KitchenState>),
) => void;
type GetFn = () => KitchenState;

function pushHistory(set: SetFn, get: GetFn, newConfig: KitchenConfig) {
  const s = get();
  const newHistory = s.history.slice(0, s.historyIndex + 1);
  newHistory.push(structuredClone(newConfig));
  if (newHistory.length > MAX_HISTORY) newHistory.shift();
  const newIndex = newHistory.length - 1;
  set({
    history: newHistory,
    historyIndex: newIndex,
    canUndo: newIndex > 0,
    canRedo: false,
  });
}

export const useKitchenStore = create<KitchenState>()(
  subscribeWithSelector((set, get) => {
    const initialConfig = initialConfigNormalized;
    const initialRoom = mergedInitialRoom;

    return {
      config: initialConfig,
      room: initialRoom,
      kitchenDesignSetupComplete: persisted?.kitchenDesignSetupComplete === true,
      ui: { ...defaultUI },
      availableMaterials: [NEUTRAL_KITCHEN_MATERIAL],
      availableDoorMaterials: [NEUTRAL_KITCHEN_MATERIAL],
      availableWorktopMaterials: [],
      availableHandleMaterials: [],

      history: [structuredClone(initialConfig)],
      historyIndex: 0,
      canUndo: false,
      canRedo: false,

      setAvailableMaterials: (cabinet, door, handleMaterials) =>
        set({
          availableMaterials: cabinet,
          availableDoorMaterials: door,
          availableHandleMaterials: handleMaterials,
        }),

      setAvailableWorktopMaterials: (worktops) => set({ availableWorktopMaterials: worktops }),

      // ── Base modules ──

      addBaseModule: (type: BaseModuleType, opts?: { width?: number }) =>
        set((s) => {
          const width = resolveAddModuleWidth("base", type, opts?.width);
          const module = { id: uuidv4(), type, width };
          const config = { ...s.config, baseModules: [...s.config.baseModules, module] };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      addModuleFromAdminCatalog: (m: Module) =>
        set((s) => {
          const w = Math.round(m.dimensions.width);
          const h = Math.round(m.dimensions.height);
          const d = Math.round(m.dimensions.depth);
          if (m.placementType === "floor") {
            const type = inferKitchenBaseTypeFromName(m.name);
            const lim = getBaseModuleLimits(type);
            const id = uuidv4();
            const km = {
              id,
              type,
              width: clampDim(w, lim.minW, lim.maxW),
              heightCm: clampDim(h, lim.minH, lim.maxH),
              depthCm: clampDim(d, lim.minD, lim.maxD),
              fromAdminCatalog: true,
            };
            const config = { ...s.config, baseModules: [...s.config.baseModules, km] };
            persistSliceValues(s, { config });
            pushHistory(set, get, config);
            return {
              config,
              ui: {
                ...s.ui,
                selectedBaseModuleId: id,
                selectedWallModuleId: null,
                selectedIslandBaseModuleId: null,
                selectedIslandWallModuleId: null,
                selectedRun: "base" as const,
              },
            };
          }
          const type = inferKitchenWallTypeFromName(m.name);
          const lim = getWallModuleLimits(type);
          const id = uuidv4();
          const kmBase: KitchenModule = {
            id,
            type,
            width: clampDim(w, lim.minW, lim.maxW),
            heightCm: clampDim(h, lim.minH, lim.maxH),
            depthCm: clampDim(d, lim.minD, lim.maxD),
          };
          const pos = findFreeWallPosition(kmBase, s.config.wallModules, s.config.baseModules, s.room);
          const km: KitchenModule = { ...kmBase, xCm: pos.xCm, yCm: pos.yCm };
          const config = {
            ...s.config,
            hasWallCabinets: true,
            wallModules: [...s.config.wallModules, km],
          };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return {
            config,
            ui: {
              ...s.ui,
              selectedWallModuleId: id,
              selectedBaseModuleId: null,
              selectedIslandBaseModuleId: null,
              selectedIslandWallModuleId: null,
              selectedRun: "wall" as const,
            },
          };
        }),

      removeBaseModule: (id: string) =>
        set((s) => {
          const config = {
            ...s.config,
            baseModules: s.config.baseModules.filter((m) => m.id !== id),
          };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return {
            config,
            ui: {
              ...s.ui,
              selectedBaseModuleId:
                s.ui.selectedBaseModuleId === id ? null : s.ui.selectedBaseModuleId,
            },
          };
        }),

      setBaseModuleWidth: (id: string, width: number) =>
        set((s) => {
          const config = {
            ...s.config,
            baseModules: s.config.baseModules.map((m) => {
              if (m.id !== id) return m;
              const lim = getBaseModuleLimits(m.type as BaseModuleType);
              return { ...m, width: clampDim(width, lim.minW, lim.maxW) };
            }),
          };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      setBaseModuleDimensions: (id, patch) =>
        set((s) => {
          const config = {
            ...s.config,
            baseModules: s.config.baseModules.map((m) => {
              if (m.id !== id) return m;
              const lim = getBaseModuleLimits(m.type as BaseModuleType);
              const next = { ...m };
              if (patch.width !== undefined)
                next.width = clampDim(patch.width, lim.minW, lim.maxW);
              if (patch.heightCm !== undefined)
                next.heightCm = clampDim(patch.heightCm, lim.minH, lim.maxH);
              if (patch.depthCm !== undefined)
                next.depthCm = clampDim(patch.depthCm, lim.minD, lim.maxD);
              return next;
            }),
          };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      reorderBaseModules: (fromIndex: number, toIndex: number) =>
        set((s) => {
          const modules = [...s.config.baseModules];
          const [moved] = modules.splice(fromIndex, 1);
          modules.splice(toIndex, 0, moved);
          const config = { ...s.config, baseModules: modules };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      setBaseModulePosition: (id: string, xCm: number) =>
        set((s) => {
          const config = {
            ...s.config,
            baseModules: s.config.baseModules.map((m) =>
              m.id === id ? { ...m, xCm } : m,
            ),
          };
          persistSliceValues(s, { config });
          return { config };
        }),

      // ── Wall modules ──

      addWallModule: (type: WallModuleType, opts?: { width?: number }) =>
        set((s) => {
          const width = resolveAddModuleWidth("wall", type, opts?.width);
          const mod: KitchenModule = { id: uuidv4(), type, width };
          const pos = findFreeWallPosition(mod, s.config.wallModules, s.config.baseModules, s.room);
          const module: KitchenModule = { ...mod, xCm: pos.xCm, yCm: pos.yCm };
          const config = { ...s.config, wallModules: [...s.config.wallModules, module] };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      removeWallModule: (id: string) =>
        set((s) => {
          const config = {
            ...s.config,
            wallModules: s.config.wallModules.filter((m) => m.id !== id),
          };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return {
            config,
            ui: {
              ...s.ui,
              selectedWallModuleId:
                s.ui.selectedWallModuleId === id ? null : s.ui.selectedWallModuleId,
            },
          };
        }),

      setWallModuleWidth: (id: string, width: number) =>
        set((s) => {
          const config = {
            ...s.config,
            wallModules: s.config.wallModules.map((m) => {
              if (m.id !== id) return m;
              const lim = getWallModuleLimits(m.type as WallModuleType);
              return { ...m, width: clampDim(width, lim.minW, lim.maxW) };
            }),
          };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      setWallModuleDimensions: (id, patch) =>
        set((s) => {
          const config = {
            ...s.config,
            wallModules: s.config.wallModules.map((m) => {
              if (m.id !== id) return m;
              const lim = getWallModuleLimits(m.type as WallModuleType);
              const next = { ...m };
              if (patch.width !== undefined)
                next.width = clampDim(patch.width, lim.minW, lim.maxW);
              if (patch.heightCm !== undefined)
                next.heightCm = clampDim(patch.heightCm, lim.minH, lim.maxH);
              if (patch.depthCm !== undefined)
                next.depthCm = clampDim(patch.depthCm, lim.minD, lim.maxD);
              return next;
            }),
          };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      reorderWallModules: (fromIndex: number, toIndex: number) =>
        set((s) => {
          const modules = [...s.config.wallModules];
          const [moved] = modules.splice(fromIndex, 1);
          modules.splice(toIndex, 0, moved);
          const config = { ...s.config, wallModules: modules };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      setWallModulePosition: (id: string, xCm: number, yCm: number) =>
        set((s) => {
          const config = {
            ...s.config,
            wallModules: s.config.wallModules.map((m) =>
              m.id === id ? { ...m, xCm, yCm } : m,
            ),
          };
          persistSliceValues(s, { config });
          return { config };
        }),

      toggleWallCabinets: () =>
        set((s) => {
          const config = { ...s.config, hasWallCabinets: !s.config.hasWallCabinets };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      // ── Island ──

      setIslandEnabled: (enabled: boolean) =>
        set((s) => {
          const config = {
            ...s.config,
            island: { ...s.config.island, enabled },
          };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      addIslandBaseModule: (type: BaseModuleType, opts?: { width?: number }) =>
        set((s) => {
          const width = resolveAddModuleWidth("base", type, opts?.width);
          const mod = { id: uuidv4(), type, width };
          const island = { ...s.config.island, baseModules: [...s.config.island.baseModules, mod] };
          const config = { ...s.config, island };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      removeIslandBaseModule: (id: string) =>
        set((s) => {
          const island = {
            ...s.config.island,
            baseModules: s.config.island.baseModules.filter((m) => m.id !== id),
          };
          const config = { ...s.config, island };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return {
            config,
            ui: {
              ...s.ui,
              selectedIslandBaseModuleId:
                s.ui.selectedIslandBaseModuleId === id ? null : s.ui.selectedIslandBaseModuleId,
            },
          };
        }),

      setIslandBaseModuleWidth: (id: string, width: number) =>
        set((s) => {
          const island = {
            ...s.config.island,
            baseModules: s.config.island.baseModules.map((m) => {
              if (m.id !== id) return m;
              const lim = getBaseModuleLimits(m.type as BaseModuleType);
              return { ...m, width: clampDim(width, lim.minW, lim.maxW) };
            }),
          };
          const config = { ...s.config, island };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      setIslandBaseModuleDimensions: (id, patch) =>
        set((s) => {
          const island = {
            ...s.config.island,
            baseModules: s.config.island.baseModules.map((m) => {
              if (m.id !== id) return m;
              const lim = getBaseModuleLimits(m.type as BaseModuleType);
              const next = { ...m };
              if (patch.width !== undefined)
                next.width = clampDim(patch.width, lim.minW, lim.maxW);
              if (patch.heightCm !== undefined)
                next.heightCm = clampDim(patch.heightCm, lim.minH, lim.maxH);
              if (patch.depthCm !== undefined)
                next.depthCm = clampDim(patch.depthCm, lim.minD, lim.maxD);
              return next;
            }),
          };
          const config = { ...s.config, island };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      reorderIslandBaseModules: (fromIndex: number, toIndex: number) =>
        set((s) => {
          const modules = [...s.config.island.baseModules];
          const [moved] = modules.splice(fromIndex, 1);
          modules.splice(toIndex, 0, moved);
          const island = { ...s.config.island, baseModules: modules };
          const config = { ...s.config, island };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      setIslandBaseModulePosition: (id: string, xCm: number) =>
        set((s) => {
          const island = {
            ...s.config.island,
            baseModules: s.config.island.baseModules.map((m) =>
              m.id === id ? { ...m, xCm } : m,
            ),
          };
          const config = { ...s.config, island };
          persistSliceValues(s, { config });
          return { config };
        }),

      addIslandWallModule: (type: WallModuleType, opts?: { width?: number }) =>
        set((s) => {
          const width = resolveAddModuleWidth("wall", type, opts?.width);
          const mod = { id: uuidv4(), type, width };
          const island = { ...s.config.island, wallModules: [...s.config.island.wallModules, mod] };
          const config = { ...s.config, island };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      removeIslandWallModule: (id: string) =>
        set((s) => {
          const island = {
            ...s.config.island,
            wallModules: s.config.island.wallModules.filter((m) => m.id !== id),
          };
          const config = { ...s.config, island };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return {
            config,
            ui: {
              ...s.ui,
              selectedIslandWallModuleId:
                s.ui.selectedIslandWallModuleId === id ? null : s.ui.selectedIslandWallModuleId,
            },
          };
        }),

      setIslandWallModuleWidth: (id: string, width: number) =>
        set((s) => {
          const island = {
            ...s.config.island,
            wallModules: s.config.island.wallModules.map((m) => {
              if (m.id !== id) return m;
              const lim = getWallModuleLimits(m.type as WallModuleType);
              return { ...m, width: clampDim(width, lim.minW, lim.maxW) };
            }),
          };
          const config = { ...s.config, island };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      setIslandWallModuleDimensions: (id, patch) =>
        set((s) => {
          const island = {
            ...s.config.island,
            wallModules: s.config.island.wallModules.map((m) => {
              if (m.id !== id) return m;
              const lim = getWallModuleLimits(m.type as WallModuleType);
              const next = { ...m };
              if (patch.width !== undefined)
                next.width = clampDim(patch.width, lim.minW, lim.maxW);
              if (patch.heightCm !== undefined)
                next.heightCm = clampDim(patch.heightCm, lim.minH, lim.maxH);
              if (patch.depthCm !== undefined)
                next.depthCm = clampDim(patch.depthCm, lim.minD, lim.maxD);
              return next;
            }),
          };
          const config = { ...s.config, island };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      reorderIslandWallModules: (fromIndex: number, toIndex: number) =>
        set((s) => {
          const modules = [...s.config.island.wallModules];
          const [moved] = modules.splice(fromIndex, 1);
          modules.splice(toIndex, 0, moved);
          const island = { ...s.config.island, wallModules: modules };
          const config = { ...s.config, island };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      setIslandWallModulePosition: (id: string, xCm: number, yCm: number) =>
        set((s) => {
          const island = {
            ...s.config.island,
            wallModules: s.config.island.wallModules.map((m) =>
              m.id === id ? { ...m, xCm, yCm } : m,
            ),
          };
          const config = { ...s.config, island };
          persistSliceValues(s, { config });
          return { config };
        }),

      toggleIslandWallCabinets: () =>
        set((s) => {
          const island = {
            ...s.config.island,
            hasWallCabinets: !s.config.island.hasWallCabinets,
          };
          const config = { ...s.config, island };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      setIslandPose: (patch) =>
        set((s) => {
          const island = {
            ...s.config.island,
            ...(patch.offsetXCm !== undefined && { offsetXCm: patch.offsetXCm }),
            ...(patch.offsetZCm !== undefined && { offsetZCm: patch.offsetZCm }),
            ...(patch.rotationYRad !== undefined && { rotationYRad: patch.rotationYRad }),
          };
          const config = { ...s.config, island };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      // ── Corner unit ──

      setCornerUnitEnabled: (enabled: boolean) =>
        set((s) => {
          const cornerUnit = { ...s.config.cornerUnit, enabled };
          const leftWall = enabled ? { ...s.config.leftWall, enabled: true } : s.config.leftWall;
          const config = { ...s.config, cornerUnit, leftWall };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return {
            config,
            ui: {
              ...s.ui,
              ...(enabled ? {} : { selectedCornerUnit: false }),
            },
          };
        }),

      setCornerUnitDimensions: (patch) =>
        set((s) => {
          const cu = s.config.cornerUnit;
          const cornerUnit = {
            ...cu,
            ...(patch.backWingWidthCm !== undefined && { backWingWidthCm: clampDim(patch.backWingWidthCm, 60, 120) }),
            ...(patch.leftWingWidthCm !== undefined && { leftWingWidthCm: clampDim(patch.leftWingWidthCm, 60, 120) }),
            ...(patch.heightCm !== undefined && { heightCm: clampDim(patch.heightCm, 60, 95) }),
            ...(patch.depthCm !== undefined && { depthCm: clampDim(patch.depthCm, 50, 70) }),
            ...(patch.hasWallCorner !== undefined && { hasWallCorner: patch.hasWallCorner }),
            ...(patch.wallCornerHeightCm !== undefined && { wallCornerHeightCm: clampDim(patch.wallCornerHeightCm, 40, 100) }),
            ...(patch.wallCornerDepthCm !== undefined && { wallCornerDepthCm: clampDim(patch.wallCornerDepthCm, 25, 42) }),
          };
          const config = { ...s.config, cornerUnit };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      // ── Left wall ──

      setLeftWallEnabled: (enabled: boolean) =>
        set((s) => {
          const leftWall = { ...s.config.leftWall, enabled };
          const cornerUnit = enabled ? { ...s.config.cornerUnit, enabled: true } : s.config.cornerUnit;
          const config = { ...s.config, leftWall, cornerUnit };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      addLeftBaseModule: (type: BaseModuleType, opts?: { width?: number }) =>
        set((s) => {
          const width = resolveAddModuleWidth("base", type, opts?.width);
          const mod = { id: uuidv4(), type, width };
          const leftWall = { ...s.config.leftWall, baseModules: [...s.config.leftWall.baseModules, mod] };
          const config = { ...s.config, leftWall };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      removeLeftBaseModule: (id: string) =>
        set((s) => {
          const leftWall = {
            ...s.config.leftWall,
            baseModules: s.config.leftWall.baseModules.filter((m) => m.id !== id),
          };
          const config = { ...s.config, leftWall };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return {
            config,
            ui: {
              ...s.ui,
              selectedLeftBaseModuleId:
                s.ui.selectedLeftBaseModuleId === id ? null : s.ui.selectedLeftBaseModuleId,
            },
          };
        }),

      setLeftBaseModuleWidth: (id: string, width: number) =>
        set((s) => {
          const leftWall = {
            ...s.config.leftWall,
            baseModules: s.config.leftWall.baseModules.map((m) => {
              if (m.id !== id) return m;
              const lim = getBaseModuleLimits(m.type as BaseModuleType);
              return { ...m, width: clampDim(width, lim.minW, lim.maxW) };
            }),
          };
          const config = { ...s.config, leftWall };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      setLeftBaseModuleDimensions: (id, patch) =>
        set((s) => {
          const leftWall = {
            ...s.config.leftWall,
            baseModules: s.config.leftWall.baseModules.map((m) => {
              if (m.id !== id) return m;
              const lim = getBaseModuleLimits(m.type as BaseModuleType);
              const next = { ...m };
              if (patch.width !== undefined)
                next.width = clampDim(patch.width, lim.minW, lim.maxW);
              if (patch.heightCm !== undefined)
                next.heightCm = clampDim(patch.heightCm, lim.minH, lim.maxH);
              if (patch.depthCm !== undefined)
                next.depthCm = clampDim(patch.depthCm, lim.minD, lim.maxD);
              return next;
            }),
          };
          const config = { ...s.config, leftWall };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      reorderLeftBaseModules: (fromIndex: number, toIndex: number) =>
        set((s) => {
          const modules = [...s.config.leftWall.baseModules];
          const [moved] = modules.splice(fromIndex, 1);
          modules.splice(toIndex, 0, moved);
          const leftWall = { ...s.config.leftWall, baseModules: modules };
          const config = { ...s.config, leftWall };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      setLeftBaseModulePosition: (id: string, xCm: number) =>
        set((s) => {
          const leftWall = {
            ...s.config.leftWall,
            baseModules: s.config.leftWall.baseModules.map((m) =>
              m.id === id ? { ...m, xCm } : m,
            ),
          };
          const config = { ...s.config, leftWall };
          persistSliceValues(s, { config });
          return { config };
        }),

      addLeftWallModule: (type: WallModuleType, opts?: { width?: number }) =>
        set((s) => {
          const width = resolveAddModuleWidth("wall", type, opts?.width);
          const mod = { id: uuidv4(), type, width };
          const leftWall = { ...s.config.leftWall, wallModules: [...s.config.leftWall.wallModules, mod] };
          const config = { ...s.config, leftWall };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      removeLeftWallModule: (id: string) =>
        set((s) => {
          const leftWall = {
            ...s.config.leftWall,
            wallModules: s.config.leftWall.wallModules.filter((m) => m.id !== id),
          };
          const config = { ...s.config, leftWall };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return {
            config,
            ui: {
              ...s.ui,
              selectedLeftWallModuleId:
                s.ui.selectedLeftWallModuleId === id ? null : s.ui.selectedLeftWallModuleId,
            },
          };
        }),

      setLeftWallModuleWidth: (id: string, width: number) =>
        set((s) => {
          const leftWall = {
            ...s.config.leftWall,
            wallModules: s.config.leftWall.wallModules.map((m) => {
              if (m.id !== id) return m;
              const lim = getWallModuleLimits(m.type as WallModuleType);
              return { ...m, width: clampDim(width, lim.minW, lim.maxW) };
            }),
          };
          const config = { ...s.config, leftWall };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      setLeftWallModuleDimensions: (id, patch) =>
        set((s) => {
          const leftWall = {
            ...s.config.leftWall,
            wallModules: s.config.leftWall.wallModules.map((m) => {
              if (m.id !== id) return m;
              const lim = getWallModuleLimits(m.type as WallModuleType);
              const next = { ...m };
              if (patch.width !== undefined)
                next.width = clampDim(patch.width, lim.minW, lim.maxW);
              if (patch.heightCm !== undefined)
                next.heightCm = clampDim(patch.heightCm, lim.minH, lim.maxH);
              if (patch.depthCm !== undefined)
                next.depthCm = clampDim(patch.depthCm, lim.minD, lim.maxD);
              return next;
            }),
          };
          const config = { ...s.config, leftWall };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      reorderLeftWallModules: (fromIndex: number, toIndex: number) =>
        set((s) => {
          const modules = [...s.config.leftWall.wallModules];
          const [moved] = modules.splice(fromIndex, 1);
          modules.splice(toIndex, 0, moved);
          const leftWall = { ...s.config.leftWall, wallModules: modules };
          const config = { ...s.config, leftWall };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      setLeftWallModulePosition: (id: string, xCm: number, yCm: number) =>
        set((s) => {
          const leftWall = {
            ...s.config.leftWall,
            wallModules: s.config.leftWall.wallModules.map((m) =>
              m.id === id ? { ...m, xCm, yCm } : m,
            ),
          };
          const config = { ...s.config, leftWall };
          persistSliceValues(s, { config });
          return { config };
        }),

      toggleLeftWallCabinets: () =>
        set((s) => {
          const leftWall = {
            ...s.config.leftWall,
            hasWallCabinets: !s.config.leftWall.hasWallCabinets,
          };
          const config = { ...s.config, leftWall };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      // ── Design placeholders (not priced) ──

      addDesignPlacement: (kind: DesignRefKind) =>
        set((s) => {
          const preset = DESIGN_REF_PRESETS[kind];
          const totalW = s.config.baseModules.reduce((sum, m) => sum + m.width, 0);
          const placement = {
            id: uuidv4(),
            kind,
            xCm: Math.max(30, totalW / 2),
            zCm: preset.depthCm / 2 + 90,
            rotationYRad: 0,
          };
          const config = {
            ...s.config,
            designPlacements: [...s.config.designPlacements, placement],
          };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      removeDesignPlacement: (id: string) =>
        set((s) => {
          const config = {
            ...s.config,
            designPlacements: s.config.designPlacements.filter((p) => p.id !== id),
          };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      setDesignPlacementPose: (id, patch) =>
        set((s) => {
          const config = {
            ...s.config,
            designPlacements: s.config.designPlacements.map((p) =>
              p.id === id
                ? {
                    ...p,
                    ...(patch.xCm !== undefined && { xCm: patch.xCm }),
                    ...(patch.zCm !== undefined && { zCm: patch.zCm }),
                    ...(patch.rotationYRad !== undefined && { rotationYRad: patch.rotationYRad }),
                  }
                : p,
            ),
          };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      // ── Materials & finish ──

      setCabinetMaterial: (id: string) =>
        set((s) => {
          const config = { ...s.config, cabinetMaterial: id };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      setCabinetGrainDirection: (direction) =>
        set((s) => {
          const config = { ...s.config, cabinetGrainDirection: direction };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      setDoorMaterial: (id: string) =>
        set((s) => {
          const config = { ...s.config, doors: { ...s.config.doors, material: id } };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      setDoorHandle: (handle: HandleStyle) =>
        set((s) => {
          const doors = { ...s.config.doors, handle };
          if (handle === "recessed") doors.handleMaterialId = undefined;
          const config = { ...s.config, doors };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      setDoorHandleMaterial: (materialId: string | undefined) =>
        set((s) => {
          const config = {
            ...s.config,
            doors: { ...s.config.doors, handleMaterialId: materialId },
          };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      setDoorGrainDirection: (direction) =>
        set((s) => {
          const config = { ...s.config, doorGrainDirection: direction };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      setCountertopMaterial: (material: CountertopMaterial) =>
        set((s) => {
          const config = {
            ...s.config,
            countertop: { ...s.config.countertop, material, adminMaterialId: undefined },
          };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      setAdminCountertopMaterial: (materialId: string | undefined) =>
        set((s) => {
          const config = {
            ...s.config,
            countertop: { ...s.config.countertop, adminMaterialId: materialId },
          };
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return { config };
        }),

      // ── Room ──

      setKitchenDesignSetupComplete: (complete: boolean) =>
        set((s) => {
          persistSliceValues(s, { kitchenDesignSetupComplete: complete });
          return { kitchenDesignSetupComplete: complete };
        }),

      applyRoomFootprintFromWizard: (payload) =>
        set((s) => {
          let fw = payload.footprintWidthM;
          let fd = payload.footprintDepthM;
          const outlineCopy =
            payload.outline && payload.outline.length >= 3
              ? payload.outline.map((p) => ({ x: p.x, z: p.z }))
              : undefined;
          if (outlineCopy) {
            const bb = bboxSizeFromOutline(outlineCopy);
            fw = bb.width;
            fd = bb.depth;
          }
          const room: RoomSettings = {
            ...s.room,
            footprintWidthM: fw,
            footprintDepthM: fd,
            kitchenShapeTemplate: payload.kitchenShapeTemplate,
            floorOutline: outlineCopy,
            floorOpenEdgeIndices: payload.openEdgeIndices
              ? [...payload.openEdgeIndices]
              : undefined,
          };
          persistSliceValues(s, { room, kitchenDesignSetupComplete: true });
          return { room, kitchenDesignSetupComplete: true };
        }),

      setWallColor: (color: string) =>
        set((s) => {
          const room = { ...s.room, wallColor: color };
          persistSliceValues(s, { room });
          return { room };
        }),

      setFloorStyle: (style: FloorStyle) =>
        set((s) => {
          const room = { ...s.room, floorStyle: style };
          persistSliceValues(s, { room });
          return { room };
        }),

      // ── UI ──

      selectBaseModule: (id) =>
        set((s) => ({
          ui: {
            ...s.ui,
            selectedBaseModuleId: id,
            selectedWallModuleId: null,
            selectedIslandBaseModuleId: null,
            selectedIslandWallModuleId: null,
            selectedLeftBaseModuleId: null,
            selectedLeftWallModuleId: null,
            selectedCornerUnit: false,
            selectedRun: "base",
          },
        })),

      selectWallModule: (id) =>
        set((s) => ({
          ui: {
            ...s.ui,
            selectedWallModuleId: id,
            selectedBaseModuleId: null,
            selectedIslandBaseModuleId: null,
            selectedIslandWallModuleId: null,
            selectedLeftBaseModuleId: null,
            selectedLeftWallModuleId: null,
            selectedCornerUnit: false,
            selectedRun: "wall",
          },
        })),

      selectIslandBaseModule: (id) =>
        set((s) => ({
          ui: {
            ...s.ui,
            selectedIslandBaseModuleId: id,
            selectedIslandWallModuleId: null,
            selectedBaseModuleId: null,
            selectedWallModuleId: null,
            selectedLeftBaseModuleId: null,
            selectedLeftWallModuleId: null,
            selectedCornerUnit: false,
            selectedRun: "base",
          },
        })),

      selectIslandWallModule: (id) =>
        set((s) => ({
          ui: {
            ...s.ui,
            selectedIslandWallModuleId: id,
            selectedIslandBaseModuleId: null,
            selectedBaseModuleId: null,
            selectedWallModuleId: null,
            selectedLeftBaseModuleId: null,
            selectedLeftWallModuleId: null,
            selectedCornerUnit: false,
            selectedRun: "wall",
          },
        })),

      selectLeftBaseModule: (id) =>
        set((s) => ({
          ui: {
            ...s.ui,
            selectedLeftBaseModuleId: id,
            selectedLeftWallModuleId: null,
            selectedBaseModuleId: null,
            selectedWallModuleId: null,
            selectedIslandBaseModuleId: null,
            selectedIslandWallModuleId: null,
            selectedCornerUnit: false,
            selectedRun: "base",
          },
        })),

      selectLeftWallModule: (id) =>
        set((s) => ({
          ui: {
            ...s.ui,
            selectedLeftWallModuleId: id,
            selectedLeftBaseModuleId: null,
            selectedBaseModuleId: null,
            selectedWallModuleId: null,
            selectedIslandBaseModuleId: null,
            selectedIslandWallModuleId: null,
            selectedCornerUnit: false,
            selectedRun: "wall",
          },
        })),

      selectCornerUnit: () =>
        set((s) => ({
          ui: {
            ...s.ui,
            selectedCornerUnit: true,
            selectedBaseModuleId: null,
            selectedWallModuleId: null,
            selectedIslandBaseModuleId: null,
            selectedIslandWallModuleId: null,
            selectedLeftBaseModuleId: null,
            selectedLeftWallModuleId: null,
            selectedRun: "base",
          },
        })),

      setSelectedRun: (run) =>
        set((s) => ({ ui: { ...s.ui, selectedRun: run } })),

      setViewMode: (mode: ViewMode) =>
        set((s) => ({ ui: { ...s.ui, viewMode: mode } })),

      setActiveStep: (step: KitchenStep) =>
        set((s) => ({ ui: { ...s.ui, activeStep: step } })),

      setShowTemplates: (show: boolean) =>
        set((s) => ({ ui: { ...s.ui, showTemplates: show } })),

      toggleDimensions: () =>
        set((s) => ({ ui: { ...s.ui, showDimensions: !s.ui.showDimensions } })),

      setOrbitControlsEnabled: (enabled: boolean) =>
        set((s) => ({ ui: { ...s.ui, orbitControlsEnabled: enabled } })),

      setWallAlignGuides: (guides) =>
        set((s) => ({ ui: { ...s.ui, wallAlignGuides: guides } })),

      setFloorAlignGuides: (guides) =>
        set((s) => ({ ui: { ...s.ui, floorAlignGuides: guides } })),

      // ── Undo / Redo ──

      undo: () =>
        set((s) => {
          if (s.historyIndex <= 0) return s;
          const newIndex = s.historyIndex - 1;
          const config = structuredClone(s.history[newIndex]);
          persistSliceValues(s, { config });
          return {
            config,
            historyIndex: newIndex,
            canUndo: newIndex > 0,
            canRedo: true,
          };
        }),

      redo: () =>
        set((s) => {
          if (s.historyIndex >= s.history.length - 1) return s;
          const newIndex = s.historyIndex + 1;
          const config = structuredClone(s.history[newIndex]);
          persistSliceValues(s, { config });
          return {
            config,
            historyIndex: newIndex,
            canUndo: true,
            canRedo: newIndex < s.history.length - 1,
          };
        }),

      // ── Templates ──

      applyTemplate: (templateConfig: KitchenConfig) =>
        set((s) => {
          const config = clampConfigMaterialsToAvailable(
            normalizeKitchenConfig(structuredClone(templateConfig)),
            s.availableMaterials,
            s.availableDoorMaterials,
            s.availableWorktopMaterials,
            s.availableHandleMaterials,
          );
          persistSliceValues(s, { config });
          pushHistory(set, get, config);
          return {
            config,
            ui: {
              ...s.ui,
              showTemplates: false,
              selectedBaseModuleId: null,
              selectedWallModuleId: null,
              selectedIslandBaseModuleId: null,
              selectedIslandWallModuleId: null,
              selectedLeftBaseModuleId: null,
              selectedLeftWallModuleId: null,
              selectedCornerUnit: false,
            },
          };
        }),

      setConfigForHydrate: (config: KitchenConfig) =>
        set((s) => {
          persistSliceValues(s, { config });
          return { config };
        }),

      pushCurrentConfigToHistory: () => {
        pushHistory(set, get, get().config);
      },

      // ── Reset ──

      resetConfig: () => {
        localStorage.removeItem(STORAGE_KEY);
        const s = get();
        let freshConfig = structuredClone(defaultConfig);
        freshConfig = clampConfigMaterialsToAvailable(
          freshConfig,
          s.availableMaterials,
          s.availableDoorMaterials,
          s.availableWorktopMaterials,
          s.availableHandleMaterials,
        );
        // Regenerate IDs so they're unique
        freshConfig.baseModules = freshConfig.baseModules.map((m) => ({
          ...m,
          id: uuidv4(),
        }));
        freshConfig.wallModules = freshConfig.wallModules.map((m) => ({
          ...m,
          id: uuidv4(),
        }));
        freshConfig.island = {
          ...freshConfig.island,
          baseModules: freshConfig.island.baseModules.map((m) => ({ ...m, id: uuidv4() })),
          wallModules: freshConfig.island.wallModules.map((m) => ({ ...m, id: uuidv4() })),
        };
        freshConfig.cornerUnit = defaultCornerUnitConfig();
        freshConfig.leftWall = {
          ...defaultLeftWallConfig(),
          baseModules: [],
          wallModules: [],
        };
        freshConfig.designPlacements = [];
        set({
          config: freshConfig,
          room: {
            ...defaultRoom,
            floorOutline: undefined,
            floorOpenEdgeIndices: undefined,
            kitchenShapeTemplate: undefined,
          },
          kitchenDesignSetupComplete: false,
          ui: { ...defaultUI },
          history: [structuredClone(freshConfig)],
          historyIndex: 0,
          canUndo: false,
          canRedo: false,
        });
      },
    };
  }),
);
