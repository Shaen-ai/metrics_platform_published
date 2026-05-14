import type { PlannerSavedWardrobe, Module, Material } from "@/lib/types";
import type { Room, PlacedItem, PlannerCatalogItem, LengthUnit } from "../types";
import type { WardrobeConfig } from "../wardrobe/types";
import type { RoomSettings as WardrobeRoomSettings } from "../wardrobe/types";
import type { WardrobeSheetSizeOverrideCm } from "../wardrobe/types";
import type { PriceBreakdown as WardrobePriceBreakdown } from "../wardrobe/data";
import type { KitchenConfig } from "../kitchen/types";
import { usePlannerStore } from "../store/usePlannerStore";
import { useStore } from "@/lib/store";
import { getPlannerConfig } from "../../planners/config";
import { loadSheetState } from "../custom-design/sheetTypes";

function isoNow(): string {
  return new Date().toISOString();
}

function collectRoomPlannerMaterialIds(placedItems: PlacedItem[]): string[] {
  const ids = new Set<string>();
  for (const item of placedItems) {
    if (item.gltfFinishMaterialId) ids.add(item.gltfFinishMaterialId);
    for (const id of item.outdoorCushionConfig?.seatMaterialIds ?? []) {
      if (id) ids.add(id);
    }
    for (const id of item.outdoorCushionConfig?.backMaterialIds ?? []) {
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

function buildMaterialReferences(materials: Material[], materialIds: string[]): Record<string, unknown>[] {
  const materialById = new Map(materials.map((m) => [m.id, m]));
  return materialIds.map((id) => {
    const material = materialById.get(id);
    return {
      id,
      name: material?.name ?? null,
      manufacturer: material?.manufacturer ?? null,
      type: material?.type ?? null,
      types: material?.types ?? null,
      category: material?.category ?? null,
      categories: material?.categories ?? null,
      color: material?.colorCode || material?.color || null,
      pricePerUnit: material?.pricePerUnit ?? null,
      unit: material?.unit ?? null,
    };
  });
}

export function buildRoomPlannerDesignSnapshot(
  plannerType: string,
  room: Room,
  placedItems: PlacedItem[],
  catalog: PlannerCatalogItem[],
  savedWardrobes: PlannerSavedWardrobe[] | undefined,
  lengthUnit: LengthUnit,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const items = placedItems.map((p) => {
    const cat = catalog.find((c) => c.id === p.catalogId);
    return {
      placedId: p.id,
      catalogId: p.catalogId,
      catalogName: cat?.name ?? null,
      catalogVendor: cat?.vendor ?? null,
      catalogPrice: cat?.price ?? null,
      category: cat?.category ?? null,
      positionM: p.position,
      positionYM: p.positionY,
      rotationRad: p.rotationY,
      rotationDeg: (p.rotationY * 180) / Math.PI,
      sizeM: {
        width: p.width ?? cat?.width ?? null,
        depth: p.depth ?? cat?.depth ?? null,
        height: p.height ?? cat?.height ?? null,
      },
      color: p.color,
      gltfFinishMaterialId: p.gltfFinishMaterialId ?? null,
      movable: p.movable,
      /** Full custom wardrobe configuration when this piece is a designed unit */
      wardrobeConfig: p.wardrobeConfig ?? null,
      outdoorCushionConfig: p.outdoorCushionConfig ?? null,
    };
  });

  const cfg = getPlannerConfig(plannerType);

  const base: Record<string, unknown> = {
    kind: "room-planner",
    generatedAt: isoNow(),
    plannerType,
    plannerDisplayName: cfg?.name ?? plannerType,
    lengthUnit,
    room,
    placedItems: items,
    savedWardrobesLibrary:
      savedWardrobes?.map((sw) => ({
        id: sw.id,
        name: sw.name,
        cachedPrice: sw.cachedPrice,
        config: sw.config,
      })) ?? [],
  };

  if (extra && Object.keys(extra).length > 0) {
    return { ...base, ...extra };
  }
  return base;
}

/** Snapshot from current room planner Zustand state (bedroom, kitchen catalog, AI room, etc.). */
export function buildRoomPlannerEmailDesign(extra?: Record<string, unknown>): Record<string, unknown> {
  const st = usePlannerStore.getState();
  const store = useStore.getState();
  const materialReferences = buildMaterialReferences(
    store.materials,
    collectRoomPlannerMaterialIds(st.placedItems),
  );
  return buildRoomPlannerDesignSnapshot(
    st.plannerType,
    st.room,
    st.placedItems,
    st.catalog,
    store.plannerSavedWardrobes,
    st.ui.lengthUnit,
    {
      ...(materialReferences.length > 0 ? { materialReferences } : {}),
      ...(extra ?? {}),
    },
  );
}

export function buildWardrobeEmailDesign(input: {
  config: WardrobeConfig;
  room: WardrobeRoomSettings;
  wardrobeSheetSizeOverrideCm: WardrobeSheetSizeOverrideCm | null;
  price: WardrobePriceBreakdown;
}): Record<string, unknown> {
  return {
    kind: "wardrobe-planner",
    generatedAt: isoNow(),
    plannerType: "wardrobe",
    plannerDisplayName: "Wardrobe Planner",
    room: input.room,
    wardrobeSheetSizeOverrideCm: input.wardrobeSheetSizeOverrideCm,
    config: input.config,
    estimatedPrice: input.price,
  };
}

export function buildKitchenEmailDesign(input: {
  config: KitchenConfig;
  price: {
    base: number;
    wall: number;
    countertop: number;
    islandBase: number;
    islandWall: number;
    islandCountertop: number;
    total: number;
  };
}): Record<string, unknown> {
  return {
    kind: "kitchen-designer",
    generatedAt: isoNow(),
    plannerType: "kitchen-design",
    plannerDisplayName: "Kitchen Designer",
    config: input.config,
    estimatedPrice: input.price,
  };
}

function simplifyPlannerModule(m: Module): Record<string, unknown> {
  return {
    id: m.id,
    name: m.name,
    description: m.description,
    price: m.price,
    currency: m.currency,
    dimensions: m.dimensions,
    placementType: m.placementType,
    source: m.source,
    kitchenModuleType: m.kitchenModuleType,
    kitchenDoorPreset: m.kitchenDoorPreset,
    kitchenDoorLeafCount: m.kitchenDoorLeafCount,
    cabinetMaterialId: m.cabinetMaterialId,
    doorMaterialId: m.doorMaterialId,
    connectionPoints: m.connectionPoints,
    isConfigurableTemplate: m.isConfigurableTemplate,
    templateOptions: m.templateOptions,
    allowedHandleIds: m.allowedHandleIds,
  };
}

export function buildModulePlannerEmailDesign(input: {
  customModules: Module[];
  templateDraft: {
    templateId: string;
    templateName: string;
    selection: Record<string, unknown> | null;
    priceBreakdown: Record<string, unknown> | null;
  } | null;
}): Record<string, unknown> {
  return {
    kind: "module-planner",
    generatedAt: isoNow(),
    plannerType: "module-planner",
    plannerDisplayName: "Module Planner",
    customModules: input.customModules.map(simplifyPlannerModule),
    configurableTemplateDraft: input.templateDraft,
  };
}

export function buildCustomDesignEmailDesign(): Record<string, unknown> {
  const sheet = loadSheetState();
  return {
    kind: "custom-design",
    generatedAt: isoNow(),
    plannerType: "custom-design",
    plannerDisplayName: "Custom planner",
    mode: "sheet",
    sheetDraft: sheet,
  };
}
