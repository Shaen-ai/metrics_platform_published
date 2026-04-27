/**
 * Per-panel-id lookup over the current kitchen sheet packing. 3D
 * renderers call this once and read placements for the panel ids they
 * draw (e.g. `main.base.{moduleId}.door`).
 */

import { useMemo } from "react";
import type { Placement, Sheet } from "./panelPacker";
import {
  useKitchenSheetLayout,
  type MaterialPacking,
} from "./useKitchenSheetLayout";

export interface KitchenPanelRenderInfo {
  placement: Placement;
  sheet: Sheet;
  textureRotated: boolean;
  materialId: string;
  sheetImageUrl?: string;
}

export interface KitchenPanelPlacements {
  get(panelId: string): KitchenPanelRenderInfo | null;
}

export function useKitchenPanelPlacements(): KitchenPanelPlacements {
  const layout = useKitchenSheetLayout();

  return useMemo(() => {
    const map = new Map<string, KitchenPanelRenderInfo>();
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

function registerPlacements(
  map: Map<string, KitchenPanelRenderInfo>,
  mp: MaterialPacking,
) {
  const imageUrl = mp.material?.imageUrl;
  if (!imageUrl) return;
  for (const pl of mp.result.placements) {
    const baseId = pl.panelId.includes("#")
      ? pl.panelId.split("#")[0]
      : pl.panelId;
    const preRotated =
      mp.preRotated.get(pl.panelId) ?? mp.preRotated.get(baseId) ?? false;
    const info: KitchenPanelRenderInfo = {
      placement: pl,
      sheet: mp.sheet,
      textureRotated: pl.rotated !== preRotated,
      materialId: mp.materialId,
      sheetImageUrl: imageUrl,
    };
    map.set(pl.panelId, info);
    if (baseId !== pl.panelId && !map.has(baseId)) {
      map.set(baseId, info);
    }
  }
}
