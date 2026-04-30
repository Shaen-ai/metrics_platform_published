import type { Placement } from "./panelPacker";

const PREFIX_ORDER = [
  "main.base",
  "main.wall",
  "island.base",
  "island.wall",
  "left.base",
  "left.wall",
];

/** Wardrobe-style ordering: main run → island → left wall; larger pieces first as tie-break. */
export function sortKitchenSheetPlacements(placements: Placement[]): Placement[] {
  const rank = (panelId: string) => {
    const strip = panelId.split("#")[0] ?? panelId;
    for (let i = 0; i < PREFIX_ORDER.length; i++) {
      if (strip.startsWith(PREFIX_ORDER[i]!)) return i;
    }
    return PREFIX_ORDER.length;
  };
  const area = (p: Placement) => p.widthCm * p.heightCm;
  return [...placements].sort((a, b) => {
    const ra = rank(a.panelId);
    const rb = rank(b.panelId);
    if (ra !== rb) return ra - rb;
    const da = area(b) - area(a);
    if (da !== 0) return da;
    return a.panelId.localeCompare(b.panelId);
  });
}
