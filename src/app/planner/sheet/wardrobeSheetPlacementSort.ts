import type { Placement } from "./panelPacker";

/**
 * Sliding door index from panel id (`door.sliding.N`, optional `#qty` / `.addon`).
 * Returns null if not a sliding wardrobe door panel.
 */
export function parseWardrobeSlidingDoorIndex(panelId: string): number | null {
  const base = panelId.split("#")[0] ?? panelId;
  const m = /^door\.sliding\.(\d+)/.exec(base);
  return m ? parseInt(m[1]!, 10) : null;
}

/**
 * Sorts placements for the sheet viewer in wardrobe **front-elevation** order
 * (same sequence as {@link wardrobePanelFrontOrderKey} in `wardrobePanels.ts`).
 * Pieces that are physically contiguous on the sheet stay in order; this
 * orders the piece list / overlays to match how you read the wardrobe from
 * the front (left → right, then top → bottom within each bay).
 */
export function sortPlacementsWardrobeFrontOrder(
  placements: Placement[],
  orderByPanelId: Map<string, string>,
): Placement[] {
  const keyOf = (panelId: string): string => {
    const base = panelId.split("#")[0] ?? panelId;
    return orderByPanelId.get(base) ?? "\xff" + base;
  };
  return [...placements].sort((a, b) => {
    const c = keyOf(a.panelId).localeCompare(keyOf(b.panelId));
    if (c !== 0) return c;
    return a.panelId.localeCompare(b.panelId);
  });
}

/**
 * @deprecated Prefer {@link sortPlacementsWardrobeFrontOrder}, which includes
 * sliding-door order and full front elevation ordering.
 */
export function sortPlacementsWardrobeDoorOrder(placements: Placement[]): Placement[] {
  const sliding: Placement[] = [];
  const rest: Placement[] = [];
  for (const p of placements) {
    if (parseWardrobeSlidingDoorIndex(p.panelId) !== null) sliding.push(p);
    else rest.push(p);
  }
  sliding.sort(
    (a, b) =>
      (parseWardrobeSlidingDoorIndex(a.panelId) ?? 0) -
      (parseWardrobeSlidingDoorIndex(b.panelId) ?? 0),
  );
  return [...sliding, ...rest];
}
