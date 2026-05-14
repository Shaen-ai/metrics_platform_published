/**
 * Pure wardrobe sheet packing + placement-map building.
 * Keeps GPU-side hooks cheap: one computation per planner render via providers.
 */

import {
  wardrobeConfigWithFrameWidth,
  type WardrobeMaterial,
} from "../wardrobe/data";
import type { WardrobeConfig, WardrobeSheetSizeOverrideCm, RoomSettings } from "../wardrobe/types";
import {
  wardrobeLayoutLegCountForConfig,
  wardrobeLayoutLegWidthsFromConfig,
} from "../wardrobe/wardrobeSpaceLayout";
import { getSheetSpec } from "./sheetSpec";
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
  type SheetPlacementOverride,
} from "./placementSheetOverrides";
import {
  enumerateWardrobePanels,
  isFrontPanel,
  panelMetaToPackerPanel,
  wardrobePanelFrontOrderKey,
  type EnumeratedPanels,
  type PanelMeta,
} from "./wardrobePanels";

function enumeratePanelsMultiLegWidths(
  config: WardrobeConfig,
  legWidthsCm: number[],
): EnumeratedPanels {
  const allMerged: PanelMeta[] = [];
  for (let leg = 0; leg < legWidthsCm.length; leg++) {
    const w = legWidthsCm[leg]!;
    const legCfg = wardrobeConfigWithFrameWidth(config, w);
    const { all } = enumerateWardrobePanels(legCfg, { layoutLegCount: 1 });
    for (const p of all) {
      const np: PanelMeta =
        leg === 0
          ? p
          : {
              ...p,
              id: `${p.id}.leg.${leg}`,
              label: `${p.label} · Run ${String.fromCharCode(65 + leg)}`,
              group: p.group
                ? { key: `${p.group.key}.leg.${leg}`, order: p.group.order }
                : undefined,
            };
      allMerged.push(np);
    }
  }
  const byMaterial = new Map<string, PanelMeta[]>();
  for (const p of allMerged) {
    const list = byMaterial.get(p.materialId) ?? [];
    list.push(p);
    byMaterial.set(p.materialId, list);
  }
  return { all: allMerged, byMaterial };
}

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

export interface PanelRenderInfo {
  placement: Placement;
  sheet: Sheet;
  /** XOR of packer rotation and swap-prep — signals 90° UV rotation. */
  textureRotated: boolean;
  materialId: string;
  sheetImageUrl?: string;
  /**
   * Catalog row used for this pack run — same roughness / image / surface
   * type the sheet viewer uses.
   */
  sheetMaterial: WardrobeMaterial | null;
}

export interface WardrobePanelPlacements {
  /** Lookup per-panel UV / sheet sampling info; null ⇒ fall back to legacy tiling. */
  get(panelId: string): PanelRenderInfo | null;
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

function findMaterialForWardrobeSheet(
  materialId: string,
  frameMaterials: WardrobeMaterial[],
  doorMaterials: WardrobeMaterial[],
): WardrobeMaterial | null {
  return findMaterial(materialId, [doorMaterials, frameMaterials]);
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

export interface WardrobeSheetLayoutComputationDeps {
  config: WardrobeConfig;
  frameMaterials: WardrobeMaterial[];
  doorMaterials: WardrobeMaterial[];
  sheetPlacementOverrides: Record<string, SheetPlacementOverride>;
  sheetManualExtraSheetsByMaterial: Record<string, number>;
  wardrobeSheetSizeOverrideCm: WardrobeSheetSizeOverrideCm | null;
  /** Planner room footprint presets — omitted for embed defaults to single-leg packing. */
  room?: RoomSettings;
  /** Embed override when full room snapshot is unavailable. */
  layoutLegCount?: number;
  /** Per-run carcass widths (cm); when set, overrides uniform leg cloning for sheet optimization. */
  layoutLegWidthsCm?: number[];
}

/** Full panel enumeration + optimized packing — call once per config change cluster. */
export function computeWardrobeSheetLayout(
  deps: WardrobeSheetLayoutComputationDeps,
): WardrobeSheetLayout {
  const {
    config,
    frameMaterials,
    doorMaterials,
    sheetPlacementOverrides,
    sheetManualExtraSheetsByMaterial,
    wardrobeSheetSizeOverrideCm,
    room,
    layoutLegCount: layoutLegCountOverride,
    layoutLegWidthsCm: layoutLegWidthsCmOverride,
  } = deps;

  const layoutLegWidthsCm =
    layoutLegWidthsCmOverride ?? wardrobeLayoutLegWidthsFromConfig(room ?? undefined, config);

  const layoutLegCount = Math.max(
    1,
    layoutLegCountOverride !== undefined
      ? Math.floor(layoutLegCountOverride)
      : wardrobeLayoutLegCountForConfig(room ?? undefined, config),
  );

  const useMultiWidths =
    layoutLegWidthsCm !== undefined &&
    layoutLegWidthsCm.length > 0 &&
    !(
      layoutLegWidthsCm.length === 1 &&
      Math.abs(layoutLegWidthsCm[0]! - config.frame.width) < 0.5
    );

  const enumerated: EnumeratedPanels =
    useMultiWidths && layoutLegWidthsCm
      ? enumeratePanelsMultiLegWidths(config, layoutLegWidthsCm)
      : enumerateWardrobePanels(config, { layoutLegCount });

  const { byMaterial } = enumerated;
  const frontOverrides = config.panelFrontOverrides;
  const out: MaterialPacking[] = [];
  for (const [materialId, panels] of byMaterial) {
    const material = findMaterialForWardrobeSheet(
      materialId,
      frameMaterials,
      doorMaterials,
    );
    const spec = getSheetSpec(material ?? undefined);
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
}

function registerPlacements(
  map: Map<string, PanelRenderInfo>,
  mp: MaterialPacking,
) {
  const imageUrl = mp.material?.imageUrl;
  if (!imageUrl) return;
  for (const pl of mp.result.placements) {
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

/** Panel-id lookup map for UV sampling from a precomputed sheet layout. */
export function wardrobePanelPlacementsFromLayout(
  layout: WardrobeSheetLayout,
): WardrobePanelPlacements {
  const map = new Map<string, PanelRenderInfo>();
  for (const mp of layout.byMaterial) {
    registerPlacements(map, mp);
  }
  return {
    get(panelId: string) {
      return map.get(panelId) ?? null;
    },
  };
}
