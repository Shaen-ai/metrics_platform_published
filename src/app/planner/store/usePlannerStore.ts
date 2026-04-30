import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import {
  PlannerState,
  PlacedItem,
  Room,
  RoomBeam,
  UIState,
  FloorStyle,
  LAMINATE_OPTIONS,
  LengthUnit,
} from "../types";
import { clampBeamsForRoom, CEILING_SLOPE_MAX, clampBeam } from "../utils/beams";
import { normalizeRoomStyleTagsField } from "../utils/roomStyleTags";

const VALID_FLOOR_STYLES = new Set(LAMINATE_OPTIONS.map((o) => o.value));
function normalizeFloorStyle(style: string | undefined): FloorStyle {
  if (style && VALID_FLOOR_STYLES.has(style as FloorStyle)) return style as FloorStyle;
  const legacyMap: Record<string, FloorStyle> = {
    laminate: "laminate-natural-oak",
    "wood-light": "laminate-light-oak",
    "wood-warm": "laminate-natural-oak",
    "wood-dark": "laminate-aged-oak",
    "marble-white": "laminate-soft-beige",
    "tile-herringbone": "laminate-natural-oak",
  };
  return legacyMap[style ?? ""] ?? "laminate-natural-oak";
}
import { api } from "../../../lib/api";
import { useStore } from "../../../lib/store";
import { PlannerCatalogItem } from "../types";
import type { CatalogItem } from "../../../lib/types";
import { catalogItemMatchesCategoryFilter } from "../../../lib/catalogItemCategories";
import {
  savedWardrobeToPlannerCatalogItem,
  wardrobeFootprintMeters,
  PENDING_BEDROOM_WARDROBE_ID_KEY,
  isYourWardrobesCategory,
} from "../wardrobe/plannerWardrobeCatalog";
import { roomTemplates } from "../data/roomTemplates";
import { clampFurnitureToRoom, snapToGrid } from "../utils/math";
import { v4 as uuidv4 } from "uuid";

// ── localStorage helpers ──

function storageKey(plannerType: string) {
  return plannerType === "room"
    ? "room-planner-state"
    : `${plannerType}-planner-state`;
}

interface PersistedData {
  room: Room;
  placedItems: PlacedItem[];
  ui: UIState;
  showRoomDesigner: boolean;
  kitchenSetupComplete?: boolean;
}

function persistedSlice(s: {
  room: Room;
  placedItems: PlacedItem[];
  ui: UIState;
  showRoomDesigner: boolean;
  kitchenSetupComplete: boolean;
}): PersistedData {
  return {
    room: s.room,
    placedItems: s.placedItems,
    ui: s.ui,
    showRoomDesigner: s.showRoomDesigner,
    kitchenSetupComplete: s.kitchenSetupComplete ?? false,
  };
}

function normalizeLengthUnit(u: LengthUnit | undefined): LengthUnit {
  if (u === "in") return "in";
  return "cm";
}

function normalizeRoom(room: Room): Room {
  const sx = Math.max(-CEILING_SLOPE_MAX, Math.min(CEILING_SLOPE_MAX, room.ceilingSlopeX ?? 0));
  const sz = Math.max(-CEILING_SLOPE_MAX, Math.min(CEILING_SLOPE_MAX, room.ceilingSlopeZ ?? 0));
  const roomStyleTags = normalizeRoomStyleTagsField(room.roomStyleTags);
  return clampBeamsForRoom({
    ...room,
    ceilingSlopeX: sx,
    ceilingSlopeZ: sz,
    roomStyleTags,
  });
}

function loadFromStorage(key: string): Partial<PersistedData> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedData;
    if (data?.room?.floorStyle !== undefined) {
      data.room = { ...data.room, floorStyle: normalizeFloorStyle(data.room.floorStyle) };
    }
    if (data?.room) {
      data.room = normalizeRoom(data.room);
    }
    if (data?.ui) {
      data.ui = {
        ...defaultUI,
        ...data.ui,
        lengthUnit: normalizeLengthUnit(data.ui.lengthUnit),
      };
    }
    return data;
  } catch {
    return null;
  }
}

function saveToStorage(key: string, data: PersistedData) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // storage full or unavailable
  }
}

let persistDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let persistPending: { plannerType: string; data: PersistedData } | null = null;

/** Batches rapid updates (e.g. live Room Designer typing) so localStorage is not hammered. */
function persist(plannerType: string, data: PersistedData) {
  persistPending = { plannerType, data };
  if (persistDebounceTimer !== null) clearTimeout(persistDebounceTimer);
  persistDebounceTimer = setTimeout(() => {
    persistDebounceTimer = null;
    if (persistPending) {
      saveToStorage(storageKey(persistPending.plannerType), persistPending.data);
    }
    persistPending = null;
  }, 400);
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (persistPending) {
      saveToStorage(storageKey(persistPending.plannerType), persistPending.data);
    }
  });
}

// ── Defaults ──

const defaultRoom: Room = {
  width: 6,
  depth: 5,
  height: 2.8,
  floorStyle: "laminate-natural-oak",
};

const defaultUI: UIState = {
  snapToGrid: true,
  gridSize: 0.1,
  showGrid: false,
  showDimensions: true,
  topView: false,
  lengthUnit: "cm",
};

// ── Store ──

const INITIAL_TYPE = "room";
const persisted = loadFromStorage(storageKey(INITIAL_TYPE));

export const usePlannerStore = create<PlannerState>()(
  subscribeWithSelector((set, get) => ({
    plannerType: INITIAL_TYPE,
    room: normalizeRoom(persisted?.room ?? defaultRoom),
    catalog: [],
    placedItems: persisted?.placedItems ?? [],
    selectedItemId: null,
    isDragging: false,
    dragItemId: null,
    ui: {
      ...(persisted?.ui ?? defaultUI),
      lengthUnit: normalizeLengthUnit(persisted?.ui?.lengthUnit),
      topView: false,
    },
    searchQuery: "",
    showRoomDesigner: persisted?.showRoomDesigner ?? false,
    kitchenSetupComplete: false,
    webglContextLost: false,

    setWebglContextLost: (lost) => set({ webglContextLost: lost }),

    setKitchenSetupComplete: (complete) =>
      set((s) => {
        if (s.plannerType !== "kitchen") {
          return {};
        }
        persist(s.plannerType, { ...persistedSlice(s), kitchenSetupComplete: complete });
        return { kitchenSetupComplete: complete };
      }),

    fetchCatalog: async (adminSlug?: string, plannerType?: string) => {
      try {
        const slug = adminSlug || "demo";
        const type = plannerType || "room";
        const subMode = type && type !== "room" ? type : undefined;
        const apiRes = await api.getCatalog(slug, subMode, true);

        const apiItems = (apiRes.data as CatalogItem[]).map((item): PlannerCatalogItem => {
          const sizes = item.sizes || item.dimensions;
          const unit = sizes?.unit || "cm";
          const toMeters = unit === "inch" ? 0.0254 : 0.01;
          return {
            id: item.id,
            name: item.name,
            category: item.category,
            additionalCategories: item.additionalCategories,
            allCategories: item.allCategories,
            vendor: "",
            price: item.price,
            width: Math.round((sizes?.width || 80) * toMeters * 1e4) / 1e4,
            depth: Math.round((sizes?.depth || 50) * toMeters * 1e4) / 1e4,
            height: Math.round((sizes?.height || 80) * toMeters * 1e4) / 1e4,
            color: item.availableColors?.[0]?.hex || "#8B8B8B",
            imageUrl: item.images?.[0],
            modelUrl: item.modelStatus === "done" ? item.modelUrl : undefined,
            modelStatus: item.modelStatus,
            wallMounted: item.wallMounted ?? false,
            mountHeight: item.mountHeight ?? undefined,
          };
        });

        const localWardrobes =
          subMode === "bedroom" || subMode === "ai-room"
            ? useStore.getState().plannerSavedWardrobes.map(savedWardrobeToPlannerCatalogItem)
            : [];
        const items = [...localWardrobes, ...apiItems];
        set({ catalog: items });

        if (typeof window !== "undefined" && subMode === "bedroom") {
          const pending = sessionStorage.getItem(PENDING_BEDROOM_WARDROBE_ID_KEY);
          if (pending) {
            sessionStorage.removeItem(PENDING_BEDROOM_WARDROBE_ID_KEY);
            const st = get();
            if (st.catalog.some((c) => c.id === pending)) {
              get().addItem(pending);
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch planner catalog:", err);
      }
    },

    mergeSavedWardrobesIntoCatalog: () => {
      const s = get();
      if (s.plannerType !== "bedroom" && s.plannerType !== "ai-room") return;
      const locals = useStore.getState().plannerSavedWardrobes.map(savedWardrobeToPlannerCatalogItem);
      const rest = s.catalog.filter((c) => !isYourWardrobesCategory(c.category));
      set({ catalog: [...locals, ...rest] });
    },

    addEphemeralCatalogItems: (items) =>
      set((s) => {
        const seen = new Set(s.catalog.map((c) => c.id));
        const merged = [...s.catalog];
        for (const it of items) {
          if (seen.has(it.id)) continue;
          seen.add(it.id);
          merged.push(it);
        }
        return { catalog: merged };
      }),

    initPlanner: (type: string, defaultRoomOverride?: Room, adminSlug?: string) => {
      const key = storageKey(type);
      const saved = loadFromStorage(key);
      const rawRoom = saved?.room ?? defaultRoomOverride ?? defaultRoom;
      const room = normalizeRoom(rawRoom);
      const ui = {
        ...(saved?.ui ?? defaultUI),
        lengthUnit: normalizeLengthUnit(saved?.ui?.lengthUnit),
        topView: false,
      };
      set({
        plannerType: type,
        room,
        placedItems: saved?.placedItems ?? [],
        selectedItemId: null,
        isDragging: false,
        dragItemId: null,
        ui,
        searchQuery: "",
        showRoomDesigner: saved?.showRoomDesigner ?? false,
        kitchenSetupComplete:
          type === "kitchen" ? saved?.kitchenSetupComplete === true : false,
      });

      get().fetchCatalog(adminSlug, type);
    },

    // ── Room actions ──
    setRoomWidth: (w) =>
      set((s) => {
        const room = normalizeRoom({ ...s.room, width: w });
        persist(s.plannerType, { ...persistedSlice(s), room });
        return { room };
      }),

    setRoomDepth: (d) =>
      set((s) => {
        const room = normalizeRoom({ ...s.room, depth: d });
        persist(s.plannerType, { ...persistedSlice(s), room });
        return { room };
      }),

    setRoomHeight: (h) =>
      set((s) => {
        const room = normalizeRoom({ ...s.room, height: h });
        persist(s.plannerType, { ...persistedSlice(s), room });
        return { room };
      }),

    setRoom: (room) =>
      set((s) => {
        const next = normalizeRoom(room);
        persist(s.plannerType, { ...persistedSlice(s), room: next });
        return { room: next };
      }),

    setWallColor: (color) =>
      set((s) => {
        const room = { ...s.room, wallColor: color };
        persist(s.plannerType, { ...persistedSlice(s), room });
        return { room };
      }),

    setFloorStyle: (style) =>
      set((s) => {
        const room = { ...s.room, floorStyle: style };
        persist(s.plannerType, { ...persistedSlice(s), room });
        return { room };
      }),

    addOpening: (opening) =>
      set((s) => {
        const openings = [...(s.room.openings || []), opening];
        const room = normalizeRoom({ ...s.room, openings });
        persist(s.plannerType, { ...persistedSlice(s), room });
        return { room };
      }),

    removeOpening: (id) =>
      set((s) => {
        const openings = (s.room.openings || []).filter((o) => o.id !== id);
        const room = normalizeRoom({ ...s.room, openings });
        persist(s.plannerType, { ...persistedSlice(s), room });
        return { room };
      }),

    addBeam: (beam: RoomBeam) =>
      set((s) => {
        const beams = [...(s.room.beams || []), clampBeam(beam, s.room)];
        const room = normalizeRoom({ ...s.room, beams });
        const placedItems = s.placedItems.map((item) => {
          const cat = s.catalog.find((c) => c.id === item.catalogId);
          if (!cat) return item;
          const w = item.width ?? cat.width;
          const d = item.depth ?? cat.depth;
          const position = clampFurnitureToRoom(
            item.position.x,
            item.position.z,
            w,
            d,
            item.rotationY,
            room
          );
          return { ...item, position };
        });
        persist(s.plannerType, { ...persistedSlice(s), room, placedItems });
        return { room, placedItems };
      }),

    updateBeam: (id, patch) =>
      set((s) => {
        const beams = (s.room.beams || []).map((b) =>
          b.id === id ? { ...b, ...patch, id: b.id } : b
        );
        const room = normalizeRoom({ ...s.room, beams });
        const placedItems = s.placedItems.map((item) => {
          const cat = s.catalog.find((c) => c.id === item.catalogId);
          if (!cat) return item;
          const w = item.width ?? cat.width;
          const d = item.depth ?? cat.depth;
          const position = clampFurnitureToRoom(
            item.position.x,
            item.position.z,
            w,
            d,
            item.rotationY,
            room
          );
          return { ...item, position };
        });
        persist(s.plannerType, { ...persistedSlice(s), room, placedItems });
        return { room, placedItems };
      }),

    removeBeam: (id) =>
      set((s) => {
        const beams = (s.room.beams || []).filter((b) => b.id !== id);
        const room = normalizeRoom({ ...s.room, beams: beams.length ? beams : undefined });
        persist(s.plannerType, { ...persistedSlice(s), room });
        return { room };
      }),

    // ── Item actions ──
    addItem: (catalogId) =>
      set((s) => {
        const catalogItem = s.catalog.find((c) => c.id === catalogId);
        if (!catalogItem) return s;

        const saved = useStore.getState().plannerSavedWardrobes.find((w) => w.id === catalogId);
        const wardrobeConfig = saved ? structuredClone(saved.config) : undefined;
        const fp = wardrobeConfig ? wardrobeFootprintMeters(wardrobeConfig) : null;
        const widthM = fp?.width ?? catalogItem.width;
        const depthM = fp?.depth ?? catalogItem.depth;

        const clamped = clampFurnitureToRoom(
          0, 0,
          widthM, depthM,
          0, s.room
        );
        
        const margin = 0.05;
        const halfW = widthM / 2;
        const halfD = depthM / 2;
        const halfRoomW = s.room.width / 2;
        const halfRoomD = s.room.depth / 2;
        
        const finalX = Math.max(
          -halfRoomW + halfW + margin,
          Math.min(halfRoomW - halfW - margin, clamped.x)
        );
        const finalZ = Math.max(
          -halfRoomD + halfD + margin,
          Math.min(halfRoomD - halfD - margin, clamped.z)
        );
        
        const finalPosition = { x: finalX, z: finalZ };

        const newItem: PlacedItem = {
          id: uuidv4(),
          catalogId,
          position: finalPosition,
          positionY: catalogItem.wallMounted && catalogItem.mountHeight ? catalogItem.mountHeight : undefined,
          rotationY: 0,
          color: catalogItem.color,
          ...(fp && wardrobeConfig
            ? { width: fp.width, depth: fp.depth, height: fp.height, wardrobeConfig }
            : {}),
        };

        const placedItems = [...s.placedItems, newItem];
        persist(s.plannerType, { ...persistedSlice(s), placedItems });
        return { placedItems, selectedItemId: newItem.id };
      }),

    removeItem: (id) =>
      set((s) => {
        const placedItems = s.placedItems.filter((i) => i.id !== id);
        persist(s.plannerType, { ...persistedSlice(s), placedItems });
        return {
          placedItems,
          selectedItemId: s.selectedItemId === id ? null : s.selectedItemId,
        };
      }),

    updateItemPosition: (id, x, z) =>
      set((s) => {
        const WALL_SNAP_THRESHOLD = 0.15;

        const placedItems = s.placedItems.map((item) => {
          if (item.id !== id) return item;

          const catalogItem = s.catalog.find((c) => c.id === item.catalogId);
          if (!catalogItem) return item;

          const w = item.width ?? catalogItem.width;
          const d = item.depth ?? catalogItem.depth;

          let newX = x;
          let newZ = z;

          if (s.ui.snapToGrid) {
            newX = snapToGrid(newX, s.ui.gridSize);
            newZ = snapToGrid(newZ, s.ui.gridSize);
          }

          const clamped = clampFurnitureToRoom(
            newX, newZ,
            w, d,
            item.rotationY, s.room
          );

          const isKitchenItem = catalogItemMatchesCategoryFilter(
            catalogItem,
            "kitchen",
          );
          if (isKitchenItem) {
            const halfRoomW = s.room.width / 2;
            const halfRoomD = s.room.depth / 2;
            const halfW = w / 2;
            const halfD = d / 2;

            const distToLeftWall = clamped.x - (-halfRoomW + halfW);
            const distToRightWall = (halfRoomW - halfW) - clamped.x;
            const distToFrontWall = clamped.z - (-halfRoomD + halfD);
            const distToBackWall = (halfRoomD - halfD) - clamped.z;

            if (distToLeftWall < WALL_SNAP_THRESHOLD) clamped.x = -halfRoomW + halfW;
            else if (distToRightWall < WALL_SNAP_THRESHOLD) clamped.x = halfRoomW - halfW;

            if (distToFrontWall < WALL_SNAP_THRESHOLD) clamped.z = -halfRoomD + halfD;
            else if (distToBackWall < WALL_SNAP_THRESHOLD) clamped.z = halfRoomD - halfD;
          }

          return { ...item, position: clamped };
        });

        persist(s.plannerType, { ...persistedSlice(s), placedItems });
        return { placedItems };
      }),

    updateItemGltfFinishMaterial: (id, materialId) =>
      set((s) => {
        const placedItems = s.placedItems.map((item) =>
          item.id === id ? { ...item, gltfFinishMaterialId: materialId } : item
        );
        persist(s.plannerType, { ...persistedSlice(s), placedItems });
        return { placedItems };
      }),

    updateItemColor: (id, color) =>
      set((s) => {
        const placedItems = s.placedItems.map((item) =>
          item.id === id ? { ...item, color } : item
        );
        persist(s.plannerType, { ...persistedSlice(s), placedItems });
        return { placedItems };
      }),

    updateItemDimensions: (id, dims) =>
      set((s) => {
        const placedItems = s.placedItems.map((item) => {
          if (item.id !== id) return item;
          if (item.wardrobeConfig) return item;

          const catalogItem = s.catalog.find((c) => c.id === item.catalogId);
          if (!catalogItem) return item;

          const updated = { ...item, ...dims };
          const w = updated.width ?? catalogItem.width;
          const d = updated.depth ?? catalogItem.depth;

          const clamped = clampFurnitureToRoom(
            item.position.x, item.position.z,
            w, d,
            item.rotationY, s.room
          );

          return { ...updated, position: clamped };
        });

        persist(s.plannerType, { ...persistedSlice(s), placedItems });
        return { placedItems };
      }),

    rotateItem: (id, deltaRadians) =>
      set((s) => {
        const placedItems = s.placedItems.map((item) => {
          if (item.id !== id) return item;

          const catalogItem = s.catalog.find((c) => c.id === item.catalogId);
          if (!catalogItem) return item;

          const w = item.width ?? catalogItem.width;
          const d = item.depth ?? catalogItem.depth;
          const newRotation = item.rotationY + deltaRadians;

          const clamped = clampFurnitureToRoom(
            item.position.x, item.position.z,
            w, d,
            newRotation, s.room
          );

          return { ...item, rotationY: newRotation, position: clamped };
        });

        persist(s.plannerType, { ...persistedSlice(s), placedItems });
        return { placedItems };
      }),

    toggleItemMovable: (id) =>
      set((s) => {
        const placedItems = s.placedItems.map((item) =>
          item.id === id ? { ...item, movable: item.movable === false ? undefined : false } : item
        );
        persist(s.plannerType, { ...persistedSlice(s), placedItems });
        return { placedItems };
      }),

    selectItem: (id) => set({ selectedItemId: id }),

    startDrag: (id) => set({ isDragging: true, dragItemId: id, selectedItemId: id }),
    endDrag: () => set({ isDragging: false, dragItemId: null }),

    deleteSelected: () => {
      const { selectedItemId } = get();
      if (selectedItemId) {
        get().removeItem(selectedItemId);
      }
    },

    // ── UI actions ──
    toggleSnapToGrid: () =>
      set((s) => {
        const ui = { ...s.ui, snapToGrid: !s.ui.snapToGrid };
        persist(s.plannerType, { ...persistedSlice(s), ui });
        return { ui };
      }),

    toggleShowGrid: () =>
      set((s) => {
        const ui = { ...s.ui, showGrid: !s.ui.showGrid };
        persist(s.plannerType, { ...persistedSlice(s), ui });
        return { ui };
      }),

    toggleShowDimensions: () =>
      set((s) => {
        const ui = { ...s.ui, showDimensions: !s.ui.showDimensions };
        persist(s.plannerType, { ...persistedSlice(s), ui });
        return { ui };
      }),

    setTopView: (v) => set((s) => ({ ui: { ...s.ui, topView: v } })),

    setSearchQuery: (q) => set({ searchQuery: q }),

    setLengthUnit: (lengthUnit) =>
      set((s) => {
        const ui = { ...s.ui, lengthUnit: normalizeLengthUnit(lengthUnit) };
        persist(s.plannerType, { ...persistedSlice(s), ui });
        return { ui };
      }),

    setShowRoomDesigner: (show) =>
      set((s) => {
        persist(s.plannerType, { ...persistedSlice(s), showRoomDesigner: show });
        return { showRoomDesigner: show };
      }),

    // ── Persistence ──
    resetScene: () => {
      const { plannerType } = get();
      localStorage.removeItem(storageKey(plannerType));
      set({
        room: defaultRoom,
        placedItems: [],
        selectedItemId: null,
        isDragging: false,
        dragItemId: null,
        ui: defaultUI,
        searchQuery: "",
        showRoomDesigner: false,
        kitchenSetupComplete: false,
      });
    },

    setRoomStyleTags: (tags) =>
      set((s) => {
        const room = normalizeRoom({
          ...s.room,
          roomStyleTags: tags === undefined ? undefined : normalizeRoomStyleTagsField(tags),
        });
        persist(s.plannerType, { ...persistedSlice(s), room });
        return { room };
      }),
  }))
);

export { roomTemplates };
