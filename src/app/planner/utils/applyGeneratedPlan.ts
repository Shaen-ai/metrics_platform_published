import { usePlannerStore } from "../store/usePlannerStore";
import type { PlannerCatalogItem } from "../types";
import { matchAllItemsToCatalog } from "./matchCatalogItem";

export type GeneratedPlanItem = {
  id: string;
  name: string;
  category?: string;
  width_m: number;
  depth_m: number;
  height_m: number;
  color?: string;
  position?: { x?: number; z?: number };
  rotation_y?: number;
  /** Real catalog product ID returned by AI when catalog-aware extraction is active. */
  catalog_id?: string | null;
};

export type GeneratedPlanData = {
  request_id: string;
  intent: Record<string, unknown>;
  furniture_plan: {
    room?: { width?: number; depth?: number; height?: number };
    items?: GeneratedPlanItem[];
  };
  modules: Record<string, unknown>[];
  estimated_price: number;
  warnings?: string[];
};

export function applyGeneratedPlan(data: GeneratedPlanData) {
  const store = usePlannerStore.getState();
  const room = data.furniture_plan.room;

  store.resetScene();
  if (room) {
    store.setRoom({
      ...usePlannerStore.getState().room,
      width: Number(room.width) || usePlannerStore.getState().room.width,
      depth: Number(room.depth) || usePlannerStore.getState().room.depth,
      height: Number(room.height) || usePlannerStore.getState().room.height,
    });
  }

  const extractedItems = data.furniture_plan.items ?? [];
  const existingCatalog = usePlannerStore.getState().catalog;
  const catalogById = new Map(existingCatalog.map((c) => [c.id, c]));

  const fuzzyMatches = matchAllItemsToCatalog(extractedItems, existingCatalog);

  const resolvedItems: PlannerCatalogItem[] = extractedItems.map((item, idx) => {
    if (item.catalog_id && catalogById.has(item.catalog_id)) {
      return catalogById.get(item.catalog_id)!;
    }

    const fuzzy = fuzzyMatches.get(idx);
    if (fuzzy) return fuzzy.catalogItem;

    return {
      id: `planner-${data.request_id}-${item.id}`,
      name: item.name,
      category: item.category || "Generated plan",
      vendor: "",
      price: 0,
      width: Number(item.width_m) || 0.8,
      depth: Number(item.depth_m) || 0.6,
      height: Number(item.height_m) || 0.8,
      color: item.color || "#BFA58A",
    };
  });

  const ephemeralItems = resolvedItems.filter(
    (item) => !existingCatalog.some((c) => c.id === item.id),
  );
  if (ephemeralItems.length > 0) {
    store.addEphemeralCatalogItems(ephemeralItems);
  }

  for (const [index, catalogItem] of resolvedItems.entries()) {
    store.addItem(catalogItem.id);
    const source = extractedItems[index];
    const placed = usePlannerStore.getState().placedItems.at(-1);
    if (placed && source?.position) {
      usePlannerStore
        .getState()
        .updateItemPosition(placed.id, Number(source.position.x) || 0, Number(source.position.z) || 0);
    }
  }
}
