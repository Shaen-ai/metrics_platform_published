import type { CatalogItem, Material } from "@/lib/types";
import type { PlannerCatalogItem, Room } from "../types";

function addUrl(set: Set<string>, url: string | undefined | null) {
  if (typeof url === "string") {
    const t = url.trim();
    if (t !== "") set.add(t);
  }
}

/** Image URLs that still exist on Materials, storefront catalog, or the planner catalog fetch (incl. library). */
export function collectValidPlannerSurfaceImageUrls(
  materials: Material[],
  catalogItems: CatalogItem[],
  plannerCatalog: PlannerCatalogItem[],
): Set<string> {
  const set = new Set<string>();
  for (const m of materials) {
    addUrl(set, m.imageUrl);
  }
  for (const c of catalogItems) {
    for (const img of c.images ?? []) {
      addUrl(set, img);
    }
  }
  for (const p of plannerCatalog) {
    addUrl(set, p.imageUrl);
  }
  return set;
}

function urlIsStillValid(url: string | undefined | null, valid: Set<string>): boolean {
  if (url == null) return true;
  const t = url.trim();
  if (t === "") return true;
  return valid.has(t);
}

/**
 * Drop floor / wall / ceiling / plinth texture selections whose image URL no longer appears in the
 * tenant's Materials or catalog API payloads (removed products, wrong localStorage, etc.).
 */
export function stripStaleRoomSurfaceTextures(room: Room, validUrls: Set<string>): { room: Room; changed: boolean } {
  let next: Room = room;
  let changed = false;
  const ok = (u: string | undefined | null) => urlIsStillValid(u, validUrls);

  if (room.floorCustomTextureUrl && !ok(room.floorCustomTextureUrl)) {
    next = {
      ...next,
      floorMaterialMode: "preset",
      floorCustomTextureUrl: undefined,
      floorMaterialName: undefined,
      floorMaterialUnit: undefined,
      floorMaterialPricePerUnit: undefined,
      floorMaterialProductWidthCm: undefined,
      floorMaterialProductHeightCm: undefined,
      floorTextureWidthCm: undefined,
      floorTextureHeightCm: undefined,
    };
    changed = true;
  }

  if (next.wallCustomTextureUrl && !ok(next.wallCustomTextureUrl)) {
    next = {
      ...next,
      wallMaterialMode: "color",
      wallCustomTextureUrl: undefined,
      wallMaterialName: undefined,
      wallMaterialUnit: undefined,
      wallMaterialPricePerUnit: undefined,
      wallMaterialProductWidthCm: undefined,
      wallMaterialProductHeightCm: undefined,
      wallTextureWidthCm: undefined,
      wallTextureHeightCm: undefined,
    };
    changed = true;
  }

  if (next.ceilingCustomTextureUrl && !ok(next.ceilingCustomTextureUrl)) {
    next = {
      ...next,
      ceilingMaterialMode: "color",
      ceilingCustomTextureUrl: undefined,
      ceilingMaterialName: undefined,
      ceilingMaterialUnit: undefined,
      ceilingMaterialPricePerUnit: undefined,
      ceilingMaterialProductWidthCm: undefined,
      ceilingMaterialProductHeightCm: undefined,
      ceilingTextureWidthCm: undefined,
      ceilingTextureHeightCm: undefined,
    };
    changed = true;
  }

  if (next.plinthCustomTextureUrl && !ok(next.plinthCustomTextureUrl)) {
    next = {
      ...next,
      plinthMaterialMode: "color",
      plinthCustomTextureUrl: undefined,
      plinthMaterialName: undefined,
      plinthMaterialUnit: undefined,
      plinthMaterialPricePerUnit: undefined,
      plinthMaterialProductWidthCm: undefined,
      plinthMaterialProductHeightCm: undefined,
    };
    changed = true;
  }

  return { room: next, changed };
}
