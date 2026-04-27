/**
 * Runs the sheet packer for a wardrobe config. One pack run per material
 * because each material has its own sheet size, grain, and kerf. The result
 * feeds both the sheet-viewer modal and (eventually) the 3D renderer.
 */

import { useContext, useMemo } from "react";
import { useWardrobeStore } from "../wardrobe/store";
import { WardrobeRoomContext } from "../wardrobe/WardrobeRoomContext";
import type { WardrobeMaterial } from "../wardrobe/data";
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
  enumerateWardrobePanels,
  isFrontPanel,
  panelMetaToPackerPanel,
  wardrobePanelFrontOrderKey,
  type PanelMeta,
} from "./wardrobePanels";

export interface MaterialPacking {
  materialId: string;
  material: WardrobeMaterial | null;
  sheet: Sheet;
  panels: PanelMeta[];
  result: PackResult;
  /** panelId → true when the packer received the piece with width/height swapped. */
  preRotated: Map<string, boolean>;
  /**
   * Packer output before manual overrides. The sheet viewer must use this with
   * `mergePlacementWithOverride` so drag/clamp math stays relative to raw
   * placement; `result.placements` is merged for 3D / UV lookup.
   */
  packerPlacementsForViewer: Placement[];
}

export interface WardrobeSheetLayout {
  byMaterial: MaterialPacking[];
  totalSheets: number;
  totalOverflow: number;
}

function findMaterial(
  materialId: string,
  pools: WardrobeMaterial[][],
): WardrobeMaterial | null {
  for (const pool of pools) {
    const m = pool.find((x) => x.id === materialId);
    if (m) return m;
  }
  return null;
}

/**
 * Resolves catalog entries for sheet packing. Door finishes must match
 * `useRealisticDoorMaterial` / `getMaterial(id, doorMaterials)` — if the same
 * id exists in both frame and door pools with different `imageUrl` or sheet
 * metadata, preferring the frame pool first would pack one texture while 3D
 * doors and drawer fronts sample another (wrong laminate in the viewport).
 */
function findMaterialForWardrobeSheet(
  materialId: string,
  frameMaterials: WardrobeMaterial[],
  doorMaterials: WardrobeMaterial[],
): WardrobeMaterial | null {
  return findMaterial(materialId, [doorMaterials, frameMaterials]);
}

/**
 * Sheet layout for the current wardrobe config. Memoized on the config
 * identity — the store returns a stable reference as long as nothing changes.
 */
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

export function useWardrobeSheetLayout(): WardrobeSheetLayout {
  const embed = useContext(WardrobeRoomContext);
  const storeConfig = useWardrobeStore((s) => s.config);
  const storeFrame = useWardrobeStore((s) => s.availableMaterials);
  const storeDoor = useWardrobeStore((s) => s.availableDoorMaterials);
  const sheetPlacementOverrides = useWardrobeStore((s) => s.sheetPlacementOverrides);
  const sheetManualExtraSheetsByMaterial = useWardrobeStore(
    (s) => s.sheetManualExtraSheetsByMaterial,
  );
  const wardrobeSheetSizeOverrideCm = useWardrobeStore((s) => s.wardrobeSheetSizeOverrideCm);
  const config = embed?.config ?? storeConfig;
  const frameMaterials = embed?.availableMaterials ?? storeFrame;
  const doorMaterials = embed?.availableDoorMaterials ?? storeDoor;

  return useMemo(() => {
    const { byMaterial } = enumerateWardrobePanels(config);
    const frontOverrides = config.panelFrontOverrides;
    const out: MaterialPacking[] = [];
    for (const [materialId, panels] of byMaterial) {
      const material = findMaterialForWardrobeSheet(
        materialId,
        frameMaterials,
        doorMaterials,
      );
      // Only sheeted materials (laminate / MDF / wood / worktop) go through the
      // packer. Others render with their existing shader path and simply
      // don't appear in the sheet viewer.
      if (
        !isSheetedMaterial({
          type: material?.materialType ?? "",
          types: material?.materialTypes,
        })
      ) {
        continue;
      }
      const spec = getSheetSpec(material);
      const widthCm = wardrobeSheetSizeOverrideCm?.widthCm ?? spec.widthCm;
      const heightCm = wardrobeSheetSizeOverrideCm?.heightCm ?? spec.heightCm;
      const sheet: Sheet = {
        widthCm,
        heightCm,
        kerfCm: spec.kerfCm,
      };
      const preps = panels.map((p) =>
        panelMetaToPackerPanel(p, spec.grainDirection, {
          isFront: isFrontPanel(p, frontOverrides),
          optimize: true,
        }),
      );
      const packerPanels: Panel[] = preps.map((p) => p.panel);
      const preRotated = new Map<string, boolean>(
        preps.map((p) => [p.panel.id, p.preRotated]),
      );

      const frontOrderByPanelId = new Map<string, string>();
      for (const p of panels) {
        frontOrderByPanelId.set(p.id, wardrobePanelFrontOrderKey(p));
      }

      /** Front-elevation order, then larger area — used as tie-break inside optimized packing. */
      const wardrobeSoloComparator: SoloComparator = (a, b) => {
        const strip = (id: string) => id.split("#")[0] ?? id;
        const ka = frontOrderByPanelId.get(strip(a.panelId)) ?? "\xff";
        const kb = frontOrderByPanelId.get(strip(b.panelId)) ?? "\xff";
        const ord = ka.localeCompare(kb);
        if (ord !== 0) return ord;
        const areaDiff = b.widthCm * b.heightCm - a.widthCm * a.heightCm;
        if (areaDiff !== 0) return areaDiff;
        return a.panelId.localeCompare(b.panelId);
      };

      const packed = packPanelsOptimized(packerPanels, sheet, {
        soloComparator: wardrobeSoloComparator,
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
    frameMaterials,
    doorMaterials,
    sheetPlacementOverrides,
    sheetManualExtraSheetsByMaterial,
    wardrobeSheetSizeOverrideCm,
  ]);
}
