import { useMemo } from "react";
import { useKitchenStore } from "../kitchen/store";
import type { KitchenMaterial } from "../kitchen/data";
import { getSheetSpec, isSheetedMaterial } from "./sheetSpec";
import { packPanels, type PackResult, type Panel, type Sheet } from "./panelPacker";
import {
  enumerateKitchenPanels,
  panelMetaToPackerPanel,
  type PanelMeta,
} from "./kitchenPanels";

export interface MaterialPacking {
  materialId: string;
  material: KitchenMaterial | null;
  sheet: Sheet;
  panels: PanelMeta[];
  result: PackResult;
  preRotated: Map<string, boolean>;
}

export interface KitchenSheetLayout {
  byMaterial: MaterialPacking[];
  totalSheets: number;
  totalOverflow: number;
}

function findMaterial(
  materialId: string,
  pools: KitchenMaterial[][],
): KitchenMaterial | null {
  for (const pool of pools) {
    const m = pool.find((x) => x.id === materialId);
    if (m) return m;
  }
  return null;
}

/**
 * Kitchen equivalent of `useWardrobeSheetLayout`. Runs the packer once per
 * admin-catalog material used by any module (cabinet + door). Built-in
 * preset materials (without a `materialType`) are skipped because they have
 * no sheet metadata.
 */
export function useKitchenSheetLayout(): KitchenSheetLayout {
  const config = useKitchenStore((s) => s.config);
  const cabinetMaterials = useKitchenStore((s) => s.availableMaterials);
  const doorMaterials = useKitchenStore((s) => s.availableDoorMaterials);
  const worktopMaterials = useKitchenStore((s) => s.availableWorktopMaterials);

  return useMemo(() => {
    const { byMaterial } = enumerateKitchenPanels(config);
    const out: MaterialPacking[] = [];
    for (const [materialId, panels] of byMaterial) {
      const material = findMaterial(materialId, [
        cabinetMaterials,
        doorMaterials,
        worktopMaterials,
      ]);
      if (
        !isSheetedMaterial({
          type: material?.materialType ?? "",
          types: material?.materialTypes,
        })
      ) {
        continue;
      }
      const spec = getSheetSpec(material);
      const sheet: Sheet = {
        widthCm: spec.widthCm,
        heightCm: spec.heightCm,
        kerfCm: spec.kerfCm,
      };
      const preps = panels.map((p) =>
        panelMetaToPackerPanel(p, spec.grainDirection),
      );
      const packerPanels: Panel[] = preps.map((p) => p.panel);
      const preRotated = new Map<string, boolean>(
        preps.map((p) => [p.panel.id, p.preRotated]),
      );
      const result = packPanels(packerPanels, sheet);
      out.push({ materialId, material, sheet, panels, result, preRotated });
    }

    let totalSheets = 0;
    let totalOverflow = 0;
    for (const mp of out) {
      totalSheets += mp.result.sheets.length;
      totalOverflow += mp.result.overflow.length;
    }
    return { byMaterial: out, totalSheets, totalOverflow };
  }, [config, cabinetMaterials, doorMaterials, worktopMaterials]);
}
