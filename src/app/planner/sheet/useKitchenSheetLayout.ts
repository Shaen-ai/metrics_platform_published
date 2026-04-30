import { useMemo } from "react";
import { useKitchenStore } from "../kitchen/store";
import type { KitchenMaterial } from "../kitchen/data";
import { getSheetSpec, isSheetedMaterial } from "./sheetSpec";
import {
  packPanelsOptimized,
  type PackResult,
  type Panel,
  type Placement,
  type Sheet,
  type SoloComparator,
} from "./panelPacker";
import {
  mergePlacementWithOverride,
  sheetPlacementOverrideKey,
} from "./placementSheetOverrides";
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
  packerPlacementsForViewer: Placement[];
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

function buildVisibleSheets(
  sheet: Sheet,
  packerSheetCount: number,
  manualExtra: number,
  mergedPlacements: Placement[],
): { sheets: PackResult["sheets"] } {
  const visible = new Set<number>();
  for (const p of mergedPlacements) visible.add(p.sheetIndex);
  for (let e = 0; e < manualExtra; e++) visible.add(packerSheetCount + e);
  for (let i = 0; i < packerSheetCount; i++) {
    if (!mergedPlacements.some((p) => p.sheetIndex === i)) visible.delete(i);
  }

  const visibleIndices = [...visible].sort((a, b) => a - b);
  const sheets: PackResult["sheets"] = visibleIndices.map((index) => {
    const onSheet = mergedPlacements.filter((p) => p.sheetIndex === index);
    const used = onSheet.reduce((s, p) => s + p.widthCm * p.heightCm, 0);
    const sheetArea = sheet.widthCm * sheet.heightCm;
    return {
      index,
      usedAreaCm2: used,
      sheetAreaCm2: sheetArea,
      wasteRatio: sheetArea > 0 ? 1 - used / sheetArea : 1,
    };
  });
  return { sheets };
}

export function useKitchenSheetLayout(): KitchenSheetLayout {
  const config = useKitchenStore((s) => s.config);
  const cabinetMaterials = useKitchenStore((s) => s.availableMaterials);
  const doorMaterials = useKitchenStore((s) => s.availableDoorMaterials);
  const worktopMaterials = useKitchenStore((s) => s.availableWorktopMaterials);
  const sheetPlacementOverrides = useKitchenStore((s) => s.sheetPlacementOverrides);
  const sheetManualExtraSheetsByMaterial = useKitchenStore(
    (s) => s.sheetManualExtraSheetsByMaterial,
  );
  const kitchenSheetSizeOverrideCm = useKitchenStore((s) => s.kitchenSheetSizeOverrideCm);

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
      const widthCm = kitchenSheetSizeOverrideCm?.widthCm ?? spec.widthCm;
      const heightCm = kitchenSheetSizeOverrideCm?.heightCm ?? spec.heightCm;
      const sheet: Sheet = {
        widthCm,
        heightCm,
        kerfCm: spec.kerfCm,
      };
      const preps = panels.map((p) =>
        panelMetaToPackerPanel(p, spec.grainDirection, { optimize: true }),
      );
      const packerPanels: Panel[] = preps.map((p) => p.panel);
      const preRotated = new Map<string, boolean>(
        preps.map((p) => [p.panel.id, p.preRotated]),
      );

      const kitchenSoloComparator: SoloComparator = (a, b) => {
        const strip = (id: string) => id.split("#")[0] ?? id;
        const ord = strip(a.panelId).localeCompare(strip(b.panelId));
        if (ord !== 0) return ord;
        const areaDiff = b.widthCm * b.heightCm - a.widthCm * a.heightCm;
        if (areaDiff !== 0) return areaDiff;
        return a.panelId.localeCompare(b.panelId);
      };

      const packed = packPanelsOptimized(packerPanels, sheet, {
        soloComparator: kitchenSoloComparator,
        soloComparatorIsTieBreakOnly: true,
        optimizeObjective: "min-sheets",
      });
      const mergedPlacements = packed.placements.map((pl) => {
        const key = sheetPlacementOverrideKey(materialId, pl.sheetIndex, pl.panelId);
        const o = sheetPlacementOverrides[key];
        return o ? mergePlacementWithOverride(pl, o) : pl;
      });
      const packerN = packed.sheets.length;
      const storedExtra = sheetManualExtraSheetsByMaterial[materialId] ?? 0;
      const { sheets } = buildVisibleSheets(sheet, packerN, storedExtra, mergedPlacements);
      const result: PackResult = {
        ...packed,
        placements: mergedPlacements,
        sheets,
      };
      out.push({
        materialId,
        material,
        sheet,
        panels,
        result,
        preRotated,
        packerPlacementsForViewer: packed.placements,
      });
    }

    let totalSheets = 0;
    let totalOverflow = 0;
    for (const mp of out) {
      totalSheets += mp.result.sheets.length;
      totalOverflow += mp.result.overflow.length;
    }
    return { byMaterial: out, totalSheets, totalOverflow };
  }, [
    config,
    cabinetMaterials,
    doorMaterials,
    worktopMaterials,
    sheetPlacementOverrides,
    sheetManualExtraSheetsByMaterial,
    kitchenSheetSizeOverrideCm,
  ]);
}
