import type { CatalogItemSummary } from "@/lib/catalogForPrompts";

/**
 * Mirrors backend RoomSubtypePolicy denylist — subtypes that should not appear
 * in certain room types.
 */
const BEDROOM_SUBTYPES = [
  "bed", "wardrobe", "mattress", "crib", "bunk_bed", "bedroom_set",
  "duvet", "bedding", "pillow", "bed_linens", "comforter", "mattress_topper", "bed_sheet", "blanket",
];

const SUBTYPE_DENYLIST: Record<string, string[]> = {
  living_room: BEDROOM_SUBTYPES,
  living: BEDROOM_SUBTYPES,
  dining_room: BEDROOM_SUBTYPES,
  home_office: BEDROOM_SUBTYPES,
  hallway: BEDROOM_SUBTYPES,
  outdoor_patio: BEDROOM_SUBTYPES,
  bedroom: ["dining_table", "bar_stool", "bar_table", "kitchen_table", "kitchen_cabinet"],
  kitchen: ["bed", "wardrobe", "mattress", "sofa", "coffee_table", "tv_stand", "crib", "bedroom_set", "duvet", "bedding"],
  bathroom: ["bed", "sofa", "wardrobe", "dining_table", "coffee_table", "tv_stand", "crib", "bedroom_set", "duvet", "bedding"],
};

const OUTDOOR_PATTERN = /\b(outdoor|patio|garden|terrace|balcony)\b/i;

const INDOOR_ROOM_KEYS = new Set([
  "living_room", "living", "bedroom", "dining_room",
  "home_office", "kitchen", "bathroom", "hallway",
  "children", "studio",
]);

function normalizeRoomKey(roomType: string): string {
  const key = roomType.toLowerCase().trim().replace(/[-\s]+/g, "_");
  if (key.includes("living")) return "living_room";
  if (key.includes("dining")) return "dining_room";
  if (key.includes("office")) return "home_office";
  if (key.includes("patio") || key.includes("outdoor")) return "outdoor_patio";
  return key;
}

function isIndoorRoom(normalizedKey: string): boolean {
  for (const k of INDOOR_ROOM_KEYS) {
    if (normalizedKey.includes(k)) return true;
  }
  return false;
}

export interface RoomFilterResult {
  kept: string[];
  dropped: string[];
}

/**
 * Filter catalog ids that are inappropriate for the detected room type.
 * Drops outdoor furniture in indoor rooms and applies subtype deny rules.
 */
export function filterCatalogIdsForRoom(
  ids: string[],
  roomType: string | undefined | null,
  byId: Map<string, CatalogItemSummary>,
): RoomFilterResult {
  if (!roomType || ids.length === 0) return { kept: ids, dropped: [] };

  const roomKey = normalizeRoomKey(roomType);
  const deny = SUBTYPE_DENYLIST[roomKey];
  const indoor = isIndoorRoom(roomKey);

  const kept: string[] = [];
  const dropped: string[] = [];

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      kept.push(id);
      continue;
    }

    if (deny && row.productSubtype) {
      const sub = row.productSubtype.toLowerCase().trim();
      if (deny.includes(sub)) {
        dropped.push(id);
        continue;
      }
    }

    if (indoor) {
      const haystack = `${row.category} ${row.name} ${row.descriptionSnippet ?? ""}`;
      if (OUTDOOR_PATTERN.test(haystack)) {
        dropped.push(id);
        continue;
      }
    }

    kept.push(id);
  }

  return { kept, dropped };
}
