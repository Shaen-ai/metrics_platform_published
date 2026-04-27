/**
 * Per-panel-id lookup over the current wardrobe sheet packing. 3D renderers
 * call this once and read placements for the panel ids they draw (e.g.
 * `frame.side.L`, `interior.shelf.0.1`, `door.hinged.2.0`).
 */

import { useMemo } from "react";
import type { WardrobeMaterial } from "../wardrobe/data";
import type { Placement, Sheet } from "./panelPacker";
import {
  useWardrobeSheetLayout,
  type MaterialPacking,
} from "./useWardrobeSheetLayout";

export interface PanelRenderInfo {
  placement: Placement;
  sheet: Sheet;
  /** XOR of packer rotation and swap-prep — signals 90° UV rotation. */
  textureRotated: boolean;
  materialId: string;
  sheetImageUrl?: string;
  /**
   * Catalog row used by `useWardrobeSheetLayout` for this pack run — same
   * roughness / image / surface type the sheet viewer uses. 3D must sample
   * this (not only `materialId` from a single pool) so textures match cuts.
   */
  sheetMaterial: WardrobeMaterial | null;
}

export interface WardrobePanelPlacements {
  /**
   * Lookup a per-panel render info. Returns `null` when the panel belongs
   * to a non-sheeted material, when the material has no sheet image, or
   * when the panel overflowed the sheet (overflow reporting lives on the
   * layout object). In all these cases the caller should fall back to the
   * legacy `cloneBoxMaterialsWithWoodRepeat` path.
   */
  get(panelId: string): PanelRenderInfo | null;
}

export function useWardrobePanelPlacements(): WardrobePanelPlacements {
  const layout = useWardrobeSheetLayout();

  return useMemo(() => {
    const map = new Map<string, PanelRenderInfo>();
    for (const mp of layout.byMaterial) {
      registerPlacements(map, mp);
    }
    return {
      get(panelId: string) {
        return map.get(panelId) ?? null;
      },
    };
  }, [layout]);
}

/**
 * First registered sheet placement for any panel cut from `materialId` in the
 * current layout. Use when a specific panel id has no placement (e.g.
 * overflow) but the bitmap + catalog row must still match the sheet packer.
 */
export function useSheetPanelInfoForMaterial(
  materialId: string,
): PanelRenderInfo | null {
  const layout = useWardrobeSheetLayout();
  const placements = useWardrobePanelPlacements();

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

function registerPlacements(
  map: Map<string, PanelRenderInfo>,
  mp: MaterialPacking,
) {
  // Sheet UV sampling only makes sense when the material carries an image —
  // otherwise the texture is a procedural solid color and offset/repeat do
  // nothing visible.
  const imageUrl = mp.material?.imageUrl;
  if (!imageUrl) return;
  for (const pl of mp.result.placements) {
    // Placements with quantity > 1 come out as `id#0`, `id#1`, etc. — the
    // first one stands in for the logical id (enumerators emit qty=1 so
    // this is the common case, kept for defensive lookups).
    const baseId = pl.panelId.includes("#") ? pl.panelId.split("#")[0] : pl.panelId;
    const preRotated =
      mp.preRotated.get(pl.panelId) ?? mp.preRotated.get(baseId) ?? false;
    const info: PanelRenderInfo = {
      placement: pl,
      sheet: mp.sheet,
      textureRotated: pl.rotated !== preRotated,
      materialId: mp.materialId,
      sheetImageUrl: imageUrl,
      sheetMaterial: mp.material,
    };
    map.set(pl.panelId, info);
    if (baseId !== pl.panelId && !map.has(baseId)) {
      map.set(baseId, info);
    }
  }
}
