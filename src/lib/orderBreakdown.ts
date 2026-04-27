import type { KitchenConfig } from "@/app/planner/kitchen/types";
import type { WardrobeConfig } from "@/app/planner/wardrobe/types";
import type { WardrobeComponentType } from "@/app/planner/wardrobe/types";
import type { KitchenMaterial } from "@/app/planner/kitchen/data";
import type { WardrobeMaterial } from "@/app/planner/wardrobe/data";
import {
  calculatePrice as calculateKitchenPrice,
  BASE_MODULE_CATALOG,
  WALL_MODULE_CATALOG,
  getCountertopPricePerLinearMeter,
  getCountertopDef,
  resolveCountertopKitchenMaterial,
} from "@/app/planner/kitchen/data";
import {
  calculatePrice as calculateWardrobePrice,
  getComponentDef,
  clampWardrobeBase,
  wardrobeBaseLiftCm,
  totalWardrobeHeightCm,
  DEFAULT_WARDROBE_BASE,
} from "@/app/planner/wardrobe/data";

const BREAKDOWN_VERSION = 1 as const;
const WARDROBE_ORDER_BREAKDOWN_VERSION = 2 as const;

/** v1 shopping-list style snapshot for orders (IKEA-like decomposition) */
export type KitchenOrderBreakdownV1 = {
  version: typeof BREAKDOWN_VERSION;
  cabinetFrameMaterialId: string;
  doorFrontMaterialId: string;
  handle: string;
  countertop: {
    presetKey: string;
    adminMaterialId?: string;
    overhangCm: number;
    label: string;
    pricePerLinearMeter: number;
  };
  mainWall: {
    baseModules: { type: string; widthCm: number; catalogName: string }[];
    wallModules: { type: string; widthCm: number; catalogName: string }[];
    hasWallCabinets: boolean;
  };
  island: {
    enabled: boolean;
    baseModuleCount: number;
    wallModuleCount: number;
  };
  pricing: ReturnType<typeof calculateKitchenPrice>;
};

export type WardrobeOrderBreakdownV1 = {
  version: typeof WARDROBE_ORDER_BREAKDOWN_VERSION;
  frame: { widthCm: number; heightCm: number; depthCm: number };
  base: {
    type: string;
    legHeightCm: number;
    plinthHeightCm: number;
    plinthRecessCm: number;
    liftCm: number;
    totalHeightCm: number;
  };
  frameMaterialId: string;
  interiorMaterialId: string;
  doors: {
    type: string;
    /** One finish id per physical door panel (hinged: per section; sliding: per track panel). */
    doorPanelMaterialIds: string[];
    slidingMechanismId: string;
    handle: string;
  };
  sections: number;
  components: { type: string; count: number }[];
  pricing: ReturnType<typeof calculateWardrobePrice>;
};

export function buildKitchenOrderBreakdown(
  config: KitchenConfig,
  cabinetMaterials: KitchenMaterial[],
  worktopMaterials: KitchenMaterial[],
  handleMaterials: KitchenMaterial[] = [],
): KitchenOrderBreakdownV1 {
  const resolved = resolveCountertopKitchenMaterial(config.countertop, worktopMaterials);
  const presetLabel = config.countertop.adminMaterialId
    ? resolved.name
    : getCountertopDef(config.countertop.material).name;

  const baseRows = config.baseModules.map((m) => {
    const def = BASE_MODULE_CATALOG.find((d) => d.type === m.type);
    return {
      type: m.type,
      widthCm: m.width,
      catalogName: def?.name ?? m.type,
    };
  });
  const wallRows = config.wallModules.map((m) => {
    const def = WALL_MODULE_CATALOG.find((d) => d.type === m.type);
    return {
      type: m.type,
      widthCm: m.width,
      catalogName: def?.name ?? m.type,
    };
  });

  return {
    version: BREAKDOWN_VERSION,
    cabinetFrameMaterialId: config.cabinetMaterial,
    doorFrontMaterialId: config.doors.material,
    handle: config.doors.handle,
    countertop: {
      presetKey: config.countertop.material,
      adminMaterialId: config.countertop.adminMaterialId,
      overhangCm: config.countertop.overhang,
      label: presetLabel,
      pricePerLinearMeter: Math.round(
        getCountertopPricePerLinearMeter(config.countertop, worktopMaterials),
      ),
    },
    mainWall: {
      baseModules: baseRows,
      wallModules: wallRows,
      hasWallCabinets: config.hasWallCabinets,
    },
    island: {
      enabled: config.island.enabled,
      baseModuleCount: config.island.baseModules.length,
      wallModuleCount: config.island.wallModules.length,
    },
    pricing: calculateKitchenPrice(config, cabinetMaterials, worktopMaterials, handleMaterials),
  };
}

export function buildWardrobeOrderBreakdown(
  config: WardrobeConfig,
  availableMaterials?: WardrobeMaterial[],
  slidingMechanisms?: WardrobeMaterial[],
  handleMaterials?: WardrobeMaterial[],
): WardrobeOrderBreakdownV1 {
  const compCounts = new Map<string, number>();
  for (const sec of config.sections) {
    for (const c of sec.components) {
      compCounts.set(c.type, (compCounts.get(c.type) ?? 0) + 1);
    }
  }
  const components = [...compCounts.entries()].map(([type, count]) => {
    const def = getComponentDef(type as WardrobeComponentType);
    return { type: def.name, count };
  });

  const base = clampWardrobeBase(config.base ?? DEFAULT_WARDROBE_BASE);

  return {
    version: WARDROBE_ORDER_BREAKDOWN_VERSION,
    frame: {
      widthCm: config.frame.width,
      heightCm: config.frame.height,
      depthCm: config.frame.depth,
    },
    base: {
      type: base.type,
      legHeightCm: base.legHeightCm,
      plinthHeightCm: base.plinthHeightCm,
      plinthRecessCm: base.plinthRecessCm,
      liftCm: wardrobeBaseLiftCm(base),
      totalHeightCm: totalWardrobeHeightCm(config.frame.height, base),
    },
    frameMaterialId: config.frameMaterial,
    interiorMaterialId: config.interiorMaterial,
    doors: {
      type: config.doors.type,
      doorPanelMaterialIds: [...config.doors.doorPanelMaterialIds],
      slidingMechanismId: config.doors.slidingMechanismId,
      handle: config.doors.handle,
    },
    sections: config.sections.length,
    components,
    pricing: calculateWardrobePrice(config, availableMaterials, slidingMechanisms, handleMaterials),
  };
}
