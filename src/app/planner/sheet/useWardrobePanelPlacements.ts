/**
 * Per-panel-id lookup over the current wardrobe sheet packing. 3D renderers
 * read placements from the shared sheet-layout bundle (one pack per frame).
 */

import { useMemo } from "react";
import {
  wardrobePanelPlacementsFromLayout,
  type PanelRenderInfo,
  type WardrobePanelPlacements,
  type WardrobeSheetLayout,
} from "./wardrobeSheetLayoutCore";
import { useWardrobeSheetLayoutBundle } from "./WardrobeSheetLayoutProviders";

export type { PanelRenderInfo, WardrobePanelPlacements, WardrobeSheetLayout };

export { wardrobePanelPlacementsFromLayout };

export function useWardrobePanelPlacements(): WardrobePanelPlacements {
  return useWardrobeSheetLayoutBundle().placements;
}

/**
 * First registered sheet placement for any panel cut from `materialId` in the
 * current layout. Use when a specific panel id has no placement (e.g.
 * overflow) but the bitmap + catalog row must still match the sheet packer.
 */
export function useSheetPanelInfoForMaterial(
  materialId: string,
): PanelRenderInfo | null {
  const { layout, placements } = useWardrobeSheetLayoutBundle();

  return useMemo(() => {
    const mp = layout.byMaterial.find((m) => m.materialId === materialId);
    if (!mp) return null;
    for (const panel of mp.panels) {
      const info = placements.get(panel.id);
      if (info) return info;
    }
    return null;
  }, [layout, placements, materialId]);
}
