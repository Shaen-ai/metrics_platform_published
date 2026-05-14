import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import {
  PlannerState,
  PlacedItem,
  Room,
  RoomBeam,
  UIState,
  FloorStyle,
  LengthUnit,
  normalizeFloorStyle,
  type PlannerFloorSurfacePatch,
  type PlannerWallCeilingSurfacePatch,
  type PlannerPlinthSurfacePatch,
} from "../types";
import {
  normalizePlannerFloorSurfaceFields,
  normalizePlannerWallCeilingSurfaceFields,
} from "../roomFloorMaterial";
import { clampBeamsForRoom, CEILING_SLOPE_MAX, clampBeam } from "../utils/beams";
import { normalizeRoomStyleTagsField } from "../utils/roomStyleTags";

import { api } from "../../../lib/api";
import { useStore } from "../../../lib/store";
import { PlannerCatalogItem } from "../types";
import type { CatalogItem } from "../../../lib/types";
import { catalogItemMatchesCategoryFilter, catalogItemIsSoftFurnitureMode } from "../../../lib/catalogItemCategories";
import { isUpholsteryFabricMaterial } from "../../../lib/plannerMaterials";
import {
  savedWardrobeToPlannerCatalogItem,
  wardrobeFootprintMeters,
  legacyWardrobePlacementFootprintBounds,
  wardrobePlacementFootprintBounds,
  PENDING_BEDROOM_WARDROBE_ID_KEY,
  isYourWardrobesCategory,
} from "../wardrobe/plannerWardrobeCatalog";
import { outdoorCushionConfigFromDefaultsJson } from "../outdoor/types";
import { roomTemplates } from "../data/roomTemplates";
import { getPlannerConfig } from "../../planners/config";
import { clampFurnitureToRoom, snapToGrid } from "../utils/math";
import { normalizeLengthUnit } from "../utils/units";
import { placementFootprintDims } from "../utils/placementFootprint";
import { v4 as uuidv4 } from "uuid";
import { resolvePlacementRuleId } from "@/config/placementRules";
import {
  collectValidPlannerSurfaceImageUrls,
  stripStaleRoomSurfaceTextures,
} from "../utils/stripStaleRoomSurfaceTextures";

/** Strip non-persisted runtime fields from placed items (hydrate + save). */
function stripOutdoorMeshFootprint(items: PlacedItem[]): PlacedItem[] {
  return items.map((item) =>
    item.outdoorMeshFootprint
      ? (() => {
          const { outdoorMeshFootprint: _, ...rest } = item;
          return rest;
        })()
      : item,
  );
}

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

// ── Defaults (used by loadFromStorage before store init) ──

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

function persistedSlice(s: {
  room: Room;
  placedItems: PlacedItem[];
  ui: UIState;
  showRoomDesigner: boolean;
  kitchenSetupComplete: boolean;
}): PersistedData {
  return {
    room: s.room,
    placedItems: stripOutdoorMeshFootprint(s.placedItems),
    ui: s.ui,
    showRoomDesigner: s.showRoomDesigner,
    kitchenSetupComplete: s.kitchenSetupComplete ?? false,
  };
}

function normalizeRoom(room: Room): Room {
  const sx = Math.max(-CEILING_SLOPE_MAX, Math.min(CEILING_SLOPE_MAX, room.ceilingSlopeX ?? 0));
  const sz = Math.max(-CEILING_SLOPE_MAX, Math.min(CEILING_SLOPE_MAX, room.ceilingSlopeZ ?? 0));
  const roomStyleTags = normalizeRoomStyleTagsField(room.roomStyleTags);
  const floorSurf = normalizePlannerFloorSurfaceFields({
    floorMaterialMode: room.floorMaterialMode,
    floorCustomTextureUrl: room.floorCustomTextureUrl,
    floorUvRepeatX: room.floorUvRepeatX,
    floorUvRepeatY: room.floorUvRepeatY,
    floorTextureWidthCm: room.floorTextureWidthCm,
    floorTextureHeightCm: room.floorTextureHeightCm,
    floorMaterialProductWidthCm: room.floorMaterialProductWidthCm,
    floorMaterialProductHeightCm: room.floorMaterialProductHeightCm,
    floorTextureStartSide: room.floorTextureStartSide,
    floorLayoutPattern: room.floorLayoutPattern,
    floorUvRotationDeg: room.floorUvRotationDeg,
    floorTileWidthCm: room.floorTileWidthCm,
    floorTileHeightCm: room.floorTileHeightCm,
    floorTileGroutCm: room.floorTileGroutCm,
    floorTileGroutColor: room.floorTileGroutColor,
  });
  const interiorSurf = normalizePlannerWallCeilingSurfaceFields(room);
  return clampBeamsForRoom({
    ...room,
    ...floorSurf,
    ...interiorSurf,
    floorStyle: normalizeFloorStyle(room.floorStyle),
    ceilingSlopeX: sx,
    ceilingSlopeZ: sz,
    roomStyleTags,
  });
}

const WARDROBE_FOOTPRINT_ORIGIN_VERSION = 2;

function rotateLocalXZ(x: number, z: number, rotationY: number): { x: number; z: number } {
  return {
    x: x * Math.cos(rotationY) + z * Math.sin(rotationY),
    z: -x * Math.sin(rotationY) + z * Math.cos(rotationY),
  };
}

function placedItemHeight(item: PlacedItem, cat: PlannerCatalogItem): number {
  return item.height ?? cat.height;
}

function migrateWardrobeFootprintCenters(items: PlacedItem[]): { items: PlacedItem[]; changed: boolean } {
  let changed = false;
  const next = items.map((item) => {
    if (
      !item.wardrobeConfig ||
      item.wardrobeFootprintOriginVersion === WARDROBE_FOOTPRINT_ORIGIN_VERSION
    ) {
      return item;
    }

    const nextBounds = wardrobePlacementFootprintBounds(item.wardrobeConfig, item.wardrobePlannerRoom);
    const prevBounds = item.wardrobeFootprintOriginCentered
      ? legacyWardrobePlacementFootprintBounds(item.wardrobeConfig, item.wardrobePlannerRoom)
      : { centerX: 0, centerZ: 0 };
    const th = item.rotationY ?? 0;
    const delta = rotateLocalXZ(
      nextBounds.centerX - prevBounds.centerX,
      nextBounds.centerZ - prevBounds.centerZ,
      th,
    );
    changed = true;
    return {
      ...item,
      position: { x: item.position.x + delta.x, z: item.position.z + delta.z },
      wardrobeFootprintOriginCentered: true,
      wardrobeFootprintOriginVersion: WARDROBE_FOOTPRINT_ORIGIN_VERSION,
    };
  });
  return { items: next, changed };
}

function loadFromStorage(key: string): Partial<PersistedData> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedData;
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
    if (data?.placedItems?.length) {
      data.placedItems = stripOutdoorMeshFootprint(data.placedItems);
      const mig = migrateWardrobeFootprintCenters(data.placedItems);
      data.placedItems = mig.items;
      if (mig.changed && data.room) {
        saveToStorage(key, {
          room: normalizeRoom(data.room),
          placedItems: mig.items,
          ui: { ...defaultUI, ...data.ui, lengthUnit: normalizeLengthUnit(data.ui?.lengthUnit) },
          showRoomDesigner: data.showRoomDesigner ?? false,
          ...(data.kitchenSetupComplete !== undefined ? { kitchenSetupComplete: data.kitchenSetupComplete } : {}),
        });
      }
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

// ── Store ──

/** Default planner id before `initPlanner` runs. Do not preload localStorage here: on the client the
 *  module loads with `window` and would restore persisted items, while SSR has no storage — that
 *  diverges TopBar totals and breaks hydration. Persisted state is applied in `initPlanner` (useEffect). */
const INITIAL_TYPE = "room";

export const usePlannerStore = create<PlannerState>()(
  subscribeWithSelector((set, get) => ({
    plannerType: INITIAL_TYPE,
    room: normalizeRoom(defaultRoom),
    catalog: [],
    placedItems: [],
    selectedItemId: null,
    isDragging: false,
    dragItemId: null,
    ui: {
      ...defaultUI,
      lengthUnit: normalizeLengthUnit(defaultUI.lengthUnit),
      topView: false,
    },
    searchQuery: "",
    showRoomDesigner: false,
    kitchenSetupComplete: false,
    webglContextLost: false,
    plannerCatalogHydratedFromApi: false,

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
      set({ plannerCatalogHydratedFromApi: false });
      try {
        const slug = adminSlug || "demo";
        const type = plannerType || "room";
        let subModesQuery: string | string[] | undefined;
        if (type !== "room") {
          const plannerCfg = getPlannerConfig(type);
          const slugs =
            plannerCfg?.catalogSubModes?.length ?? 0
              ? [...plannerCfg!.catalogSubModes!]
              : [type];
          subModesQuery = slugs.length === 1 ? slugs[0]! : slugs;
        }
        const apiRes = await api.getCatalog(slug, subModesQuery, true);

        const apiItems = (apiRes.data as CatalogItem[]).map((item): PlannerCatalogItem => {
          const sizes = item.sizes || item.dimensions;
          const unit = sizes?.unit || "cm";
          const toMeters = unit === "inch" ? 0.0254 : 0.01;
          const plannerSubcategory =
            item.plannerSubcategory != null &&
            typeof item.plannerSubcategory === "string" &&
            item.plannerSubcategory.trim() !== ""
              ? item.plannerSubcategory.trim()
              : undefined;
          const softFabricEligible =
            catalogItemIsSoftFurnitureMode(item) && item.isFabricCustomizable === true;
          return {
            id: item.id,
            name: item.name,
            category: item.category,
            additionalCategories: item.additionalCategories,
            allCategories: item.allCategories,
            subCategory: plannerSubcategory,
            modeId: item.modeId,
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
            supportsOutdoorCushions:
              typeof item.supportsOutdoorCushions === "boolean"
                ? item.supportsOutdoorCushions
                : undefined,
            outdoorCushionDefaults:
              item.outdoorCushionDefaults && typeof item.outdoorCushionDefaults === "object"
                ? (item.outdoorCushionDefaults as Record<string, unknown>)
                : null,
            placementRuleId:
              item.placementRuleId && typeof item.placementRuleId === "string"
                ? item.placementRuleId
                : undefined,
            surfaceTextureWidthCm: item.surfaceTextureWidthCm ?? null,
            surfaceTextureHeightCm: item.surfaceTextureHeightCm ?? null,
            surfaceItemWidthCm: item.surfaceItemWidthCm ?? null,
            surfaceItemHeightCm: item.surfaceItemHeightCm ?? null,
            surfaceLayoutPattern: item.surfaceLayoutPattern ?? null,
            isFabricCustomizable: softFabricEligible ? true : undefined,
            fabricParts:
              softFabricEligible &&
              Array.isArray(item.fabricParts) &&
              item.fabricParts.length > 0
                ? item.fabricParts
                : undefined,
          };
        });

        const localWardrobes =
          type === "bedroom" || type === "ai-room"
            ? useStore.getState().plannerSavedWardrobes.map(savedWardrobeToPlannerCatalogItem)
            : [];
        const items = [...localWardrobes, ...apiItems];
        set({ catalog: items, plannerCatalogHydratedFromApi: true });

        get().syncRoomSurfaceTextures({ skipHydrationGate: true });

        // After catalog loads, reconcile room surface product dimensions.
        // If a floor/wall texture URL matches a catalog item that has explicit item
        // dimensions (surfaceItemWidthCm/Height), patch the room so boards are
        // rendered at the correct physical size even when loading old saved state.
        const currentRoom = get().room;
        const byUrl = new Map(items.filter((i) => i.imageUrl).map((i) => [i.imageUrl!, i]));

        const floorItem = currentRoom.floorCustomTextureUrl
          ? byUrl.get(currentRoom.floorCustomTextureUrl)
          : undefined;
        if (floorItem) {
          const floorPatch: PlannerFloorSurfacePatch = {};
          // Update product dims when: (a) not set, or (b) currently equal to texture dims
          // (the old buggy code set product = texture; use catalog item dims to correct this).
          const floorProdWNeedsUpdate =
            currentRoom.floorMaterialProductWidthCm == null ||
            currentRoom.floorMaterialProductWidthCm === currentRoom.floorTextureWidthCm;
          const floorProdHNeedsUpdate =
            currentRoom.floorMaterialProductHeightCm == null ||
            currentRoom.floorMaterialProductHeightCm === currentRoom.floorTextureHeightCm;
          if (floorProdWNeedsUpdate && floorItem.surfaceItemWidthCm != null) {
            floorPatch.floorMaterialProductWidthCm = floorItem.surfaceItemWidthCm;
          }
          if (floorProdHNeedsUpdate && floorItem.surfaceItemHeightCm != null) {
            floorPatch.floorMaterialProductHeightCm = floorItem.surfaceItemHeightCm;
          }
          if (currentRoom.floorTextureWidthCm == null && floorItem.surfaceTextureWidthCm != null) {
            floorPatch.floorTextureWidthCm = floorItem.surfaceTextureWidthCm;
          }
          if (currentRoom.floorTextureHeightCm == null && floorItem.surfaceTextureHeightCm != null) {
            floorPatch.floorTextureHeightCm = floorItem.surfaceTextureHeightCm;
          }
          if (Object.keys(floorPatch).length > 0) {
            get().setPlannerFloorSurface(floorPatch);
          }
        }

        const wallItem = currentRoom.wallCustomTextureUrl
          ? byUrl.get(currentRoom.wallCustomTextureUrl)
          : undefined;
        if (wallItem) {
          const wallPatch: PlannerWallCeilingSurfacePatch = {};
          const wallProdWNeedsUpdate =
            currentRoom.wallMaterialProductWidthCm == null ||
            currentRoom.wallMaterialProductWidthCm === currentRoom.wallTextureWidthCm;
          const wallProdHNeedsUpdate =
            currentRoom.wallMaterialProductHeightCm == null ||
            currentRoom.wallMaterialProductHeightCm === currentRoom.wallTextureHeightCm;
          if (wallProdWNeedsUpdate && wallItem.surfaceItemWidthCm != null) {
            wallPatch.wallMaterialProductWidthCm = wallItem.surfaceItemWidthCm;
          }
          if (wallProdHNeedsUpdate && wallItem.surfaceItemHeightCm != null) {
            wallPatch.wallMaterialProductHeightCm = wallItem.surfaceItemHeightCm;
          }
          if (Object.keys(wallPatch).length > 0) {
            get().setPlannerWallCeilingSurface(wallPatch);
          }
        }

        if (typeof window !== "undefined" && type === "bedroom") {
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
        set({ plannerCatalogHydratedFromApi: true });
        get().syncRoomSurfaceTextures({ skipHydrationGate: true });
      }
    },

    syncRoomSurfaceTextures: (opts) => {
      if (typeof window === "undefined") return;
      const pub = useStore.getState();
      if (!pub.initialized) return;
      if (!opts?.skipHydrationGate && !get().plannerCatalogHydratedFromApi) return;

      const s = get();
      const valid = collectValidPlannerSurfaceImageUrls(
        pub.materials,
        pub.catalogItems,
        s.catalog,
      );
      const { room: stripped, changed } = stripStaleRoomSurfaceTextures(s.room, valid);
      if (!changed) return;

      const room = normalizeRoom(stripped);
      set((state) => {
        persist(state.plannerType, { ...persistedSlice(state), room });
        return { room };
      });
    },

    mergeSavedWardrobesIntoCatalog: () => {
      const s = get();
      if (s.plannerType !== "bedroom" && s.plannerType !== "ai-room") return;
      const locals = useStore.getState().plannerSavedWardrobes.map(savedWardrobeToPlannerCatalogItem);
      const rest = s.catalog.filter((c) => !isYourWardrobesCategory(c.category));
      set({ catalog: [...locals, ...rest] });
      get().syncRoomSurfaceTextures({ skipHydrationGate: true });
    },

    addEphemeralCatalogItems: (items) => {
      set((s) => {
        const seen = new Set(s.catalog.map((c) => c.id));
        const merged = [...s.catalog];
        for (const it of items) {
          if (seen.has(it.id)) continue;
          seen.add(it.id);
          merged.push(it);
        }
        return { catalog: merged };
      });
      get().syncRoomSurfaceTextures({ skipHydrationGate: true });
    },

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
        plannerCatalogHydratedFromApi: false,
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
        const room = normalizeRoom({ ...s.room, floorStyle: style });
        persist(s.plannerType, { ...persistedSlice(s), room });
        return { room };
      }),

    setPlannerFloorSurface: (patch: PlannerFloorSurfacePatch) =>
      set((s) => {
        const room = normalizeRoom({ ...s.room, ...patch });
        persist(s.plannerType, { ...persistedSlice(s), room });
        return { room };
      }),

    setPlannerWallCeilingSurface: (patch: PlannerWallCeilingSurfacePatch) =>
      set((s) => {
        const room = normalizeRoom({ ...s.room, ...patch });
        persist(s.plannerType, { ...persistedSlice(s), room });
        return { room };
      }),

    setPlannerPlinthSurface: (patch: PlannerPlinthSurfacePatch) =>
      set((s) => {
        const room = normalizeRoom({ ...s.room, ...patch });
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
          const { w, d } = placementFootprintDims(item, cat);
          const h = placedItemHeight(item, cat);
          const position = clampFurnitureToRoom(
            item.position.x,
            item.position.z,
            w,
            d,
            item.rotationY,
            room,
            h,
            item.positionY ?? 0,
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
          const { w, d } = placementFootprintDims(item, cat);
          const h = placedItemHeight(item, cat);
          const position = clampFurnitureToRoom(
            item.position.x,
            item.position.z,
            w,
            d,
            item.rotationY,
            room,
            h,
            item.positionY ?? 0,
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
        const fpLinear = wardrobeConfig ? wardrobeFootprintMeters(wardrobeConfig) : null;
        const fpPlace = wardrobeConfig ? wardrobePlacementFootprintBounds(wardrobeConfig, saved?.room) : null;
        const widthM = fpPlace?.width ?? catalogItem.width;
        const depthM = fpPlace?.depth ?? catalogItem.depth;
        const heightM = fpLinear?.height ?? catalogItem.height;

        const clamped = clampFurnitureToRoom(
          0, 0,
          widthM, depthM,
          0, s.room,
          heightM,
          0,
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

        const placementRuleId = resolvePlacementRuleId(catalogItem);
        const newItem: PlacedItem = {
          id: uuidv4(),
          catalogId,
          position: finalPosition,
          positionY: catalogItem.wallMounted && catalogItem.mountHeight ? catalogItem.mountHeight : undefined,
          rotationY: 0,
          color: catalogItem.color,
          placementRuleId,
          ...(fpLinear && wardrobeConfig && fpPlace
            ? {
                width: fpPlace.width,
                depth: fpPlace.depth,
                height: fpLinear.height,
                wardrobeConfig,
                wardrobeFootprintOriginCentered: true,
                wardrobeFootprintOriginVersion: WARDROBE_FOOTPRINT_ORIGIN_VERSION,
                ...(saved?.room ? { wardrobePlannerRoom: structuredClone(saved.room) } : {}),
              }
            : {}),
        };

        const effW = newItem.width ?? catalogItem.width;
        const supportsOutdoor =
          s.plannerType === "outdoor" &&
          Boolean(catalogItem.modelUrl) &&
          catalogItem.supportsOutdoorCushions === true;

        let withOutdoor = newItem;
        if (supportsOutdoor) {
          const mats = useStore.getState().materials.filter(isUpholsteryFabricMaterial);
          const firstUph = mats[0]?.id ?? null;
          const defaultsJson =
            catalogItem.outdoorCushionDefaults !== undefined
              ? catalogItem.outdoorCushionDefaults
              : null;
          const cfg = outdoorCushionConfigFromDefaultsJson(defaultsJson, effW, firstUph);
          if (defaultsJson && typeof defaultsJson === "object" && (defaultsJson as { enabled?: boolean }).enabled === true) {
            cfg.enabled = true;
          } else if (catalogItem.supportsOutdoorCushions === true && defaultsJson) {
            cfg.enabled = (defaultsJson as { enabled?: boolean }).enabled === true;
          }
          withOutdoor = { ...newItem, outdoorCushionConfig: cfg };
        }

        // Seed fabric part material ids for fabric-customizable items.
        let withFabric = withOutdoor;
        if (
          catalogItemIsSoftFurnitureMode(catalogItem) &&
          catalogItem.isFabricCustomizable &&
          Array.isArray(catalogItem.fabricParts) &&
          catalogItem.fabricParts.length > 0
        ) {
          const allMats = useStore.getState().materials.filter(isUpholsteryFabricMaterial);
          const firstUph = allMats[0]?.id ?? "";
          const fabricPartMaterialIds: Record<string, string> = {};
          for (const part of catalogItem.fabricParts) {
            const allowed = part.allowedMaterialIds;
            if (allowed === null || allowed.length === 0) {
              fabricPartMaterialIds[part.id] = firstUph;
            } else {
              fabricPartMaterialIds[part.id] = allowed[0];
            }
          }
          withFabric = { ...withOutdoor, fabricPartMaterialIds };
        }

        const placedItems = [...s.placedItems, withFabric];
        persist(s.plannerType, { ...persistedSlice(s), placedItems });
        return { placedItems, selectedItemId: withFabric.id };
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

          const { w, d } = placementFootprintDims(item, catalogItem);
          const h = placedItemHeight(item, catalogItem);

          let newX = x;
          let newZ = z;

          if (s.ui.snapToGrid) {
            newX = snapToGrid(newX, s.ui.gridSize);
            newZ = snapToGrid(newZ, s.ui.gridSize);
          }

          const clamped = clampFurnitureToRoom(
            newX, newZ,
            w, d,
            item.rotationY, s.room,
            h,
            item.positionY ?? 0,
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

    updateItemPlacement: (id, patch) =>
      set((s) => {
        const placedItems = s.placedItems.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        );
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

          const updated = { ...item, ...dims };
          const nextItem =
            updated.outdoorCushionConfig?.enabled &&
            (dims.width !== undefined || dims.depth !== undefined || dims.height !== undefined)
              ? { ...updated, outdoorMeshFootprint: undefined }
              : updated;

          const catalogItem = s.catalog.find((c) => c.id === item.catalogId);
          if (!catalogItem) return item;

          const { w, d } = placementFootprintDims(nextItem, catalogItem);
          const h = placedItemHeight(nextItem, catalogItem);

          const clamped = clampFurnitureToRoom(
            item.position.x, item.position.z,
            w, d,
            item.rotationY, s.room,
            h,
            item.positionY ?? 0,
          );

          return { ...nextItem, position: clamped };
        });

        persist(s.plannerType, { ...persistedSlice(s), placedItems });
        return { placedItems };
      }),

    setOutdoorCushionConfig: (id, config) =>
      set((s) => {
        const placedItems = s.placedItems.map((item) => {
          if (item.id !== id) return item;
          let next: PlacedItem = { ...item, outdoorCushionConfig: config };
          if (!config.enabled) {
            next = { ...next, outdoorMeshFootprint: undefined };
          }
          const cat = s.catalog.find((c) => c.id === item.catalogId);
          if (!cat) return next;

          const prevEnabled = item.outdoorCushionConfig?.enabled ?? false;
          const nextEnabled = config.enabled;
          // Fabric / layout-only edits must not re-clamp position — that shifted items in the room.
          if (prevEnabled === nextEnabled) {
            return next;
          }

          const { w, d } = placementFootprintDims(next, cat);
          const h = placedItemHeight(next, cat);
          const position = clampFurnitureToRoom(
            next.position.x,
            next.position.z,
            w,
            d,
            next.rotationY,
            s.room,
            h,
            next.positionY ?? 0,
          );
          return { ...next, position };
        });
        persist(s.plannerType, { ...persistedSlice(s), placedItems });
        return { placedItems };
      }),

    setOutdoorMeshFootprint: (id, footprint) =>
      set((s) => {
        const placedItems = s.placedItems.map((item) => {
          if (item.id !== id) return item;
          if (footprint == null) {
            if (item.outdoorMeshFootprint == null) return item;
          } else if (
            item.outdoorMeshFootprint &&
            item.outdoorMeshFootprint.width === footprint.width &&
            item.outdoorMeshFootprint.depth === footprint.depth
          ) {
            return item;
          }
          const cat = s.catalog.find((c) => c.id === item.catalogId);
          const next: PlacedItem = {
            ...item,
            outdoorMeshFootprint: footprint ?? undefined,
          };
          if (!cat) return next;
          const { w, d } = placementFootprintDims(next, cat);
          const h = placedItemHeight(next, cat);
          const position = clampFurnitureToRoom(
            item.position.x,
            item.position.z,
            w,
            d,
            item.rotationY,
            s.room,
            h,
            item.positionY ?? 0,
          );
          return { ...next, position };
        });
        persist(s.plannerType, { ...persistedSlice(s), placedItems });
        return { placedItems };
      }),

    setFabricPartMaterial: (itemId, partId, materialId) =>
      set((s) => {
        const placedItems = s.placedItems.map((item) => {
          if (item.id !== itemId) return item;
          return {
            ...item,
            fabricPartMaterialIds: {
              ...(item.fabricPartMaterialIds ?? {}),
              [partId]: materialId,
            },
          };
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

          const { w, d } = placementFootprintDims(item, catalogItem);
          const h = placedItemHeight(item, catalogItem);
          const newRotation = item.rotationY + deltaRadians;

          const clamped = clampFurnitureToRoom(
            item.position.x, item.position.z,
            w, d,
            newRotation, s.room,
            h,
            item.positionY ?? 0,
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
