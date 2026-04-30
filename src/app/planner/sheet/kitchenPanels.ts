/**
 * Extracts cut panels from a KitchenConfig. Every kitchen module (base, wall,
 * island, left-wall, corner) gets modeled as a standard carcass: 2 side
 * panels, 1 bottom, 1 door front. Back panels and tops are excluded — backs
 * are HDF stock, and base-cabinet tops are covered by the worktop.
 */

import type {
  KitchenConfig,
  KitchenModule,
  BaseModuleType,
} from "../kitchen/types";
import {
  BASE_DEPTH,
  WALL_DEPTH,
  BASE_HEIGHT,
  WALL_CABINET_HEIGHT,
  PANEL_THICKNESS,
} from "../kitchen/data";
import type { Panel } from "./panelPacker";

const DOOR_GAP_CM = 0.3;

/**
 * Appliances with no cabinet carcass — skip. `fridge-unit` and `freestanding-fridge`
 * are rendered as placeholders, no cut panels.
 */
const APPLIANCE_TYPES: ReadonlySet<BaseModuleType> = new Set([
  "fridge-unit",
  "freestanding-fridge",
  "washing-machine-unit",
  "dishwasher-unit",
  "oven-unit",
]);

export interface PanelMeta {
  id: string;
  role:
    | "cabinet-side"
    | "cabinet-bottom"
    | "cabinet-door"
    | "cabinet-top";
  label: string;
  materialId: string;
  widthCm: number;
  heightCm: number;
  grainAlongWidth: boolean;
}

interface ModuleGroup {
  prefix: string;
  modules: KitchenModule[];
  depthDefault: number;
  heightDefault: number;
  /** Module groups that are wall cabinets also get a top panel. */
  includeTopPanel: boolean;
}

function moduleDepth(m: KitchenModule, fallback: number): number {
  return m.depthCm ?? fallback;
}

function moduleHeight(m: KitchenModule, fallback: number): number {
  return m.heightCm ?? fallback;
}

function addModulePanels(
  out: PanelMeta[],
  m: KitchenModule,
  prefix: string,
  cabinetMatId: string,
  doorMatId: string,
  defaultHeight: number,
  defaultDepth: number,
  includeTopPanel: boolean,
) {
  // Skip appliances and placeholders — they don't use laminate panels.
  if (APPLIANCE_TYPES.has(m.type as BaseModuleType)) return;

  const W = m.width;
  const H = moduleHeight(m, defaultHeight);
  const D = moduleDepth(m, defaultDepth);
  const T = PANEL_THICKNESS;

  out.push({
    id: `${prefix}.${m.id}.side.L`,
    role: "cabinet-side",
    label: `${m.type} side (L)`,
    materialId: cabinetMatId,
    widthCm: D,
    heightCm: H,
    grainAlongWidth: false,
  });
  out.push({
    id: `${prefix}.${m.id}.side.R`,
    role: "cabinet-side",
    label: `${m.type} side (R)`,
    materialId: cabinetMatId,
    widthCm: D,
    heightCm: H,
    grainAlongWidth: false,
  });
  out.push({
    id: `${prefix}.${m.id}.bottom`,
    role: "cabinet-bottom",
    label: `${m.type} bottom`,
    materialId: cabinetMatId,
    widthCm: Math.max(1, W - 2 * T),
    heightCm: D,
    grainAlongWidth: true,
  });
  if (includeTopPanel) {
    out.push({
      id: `${prefix}.${m.id}.top`,
      role: "cabinet-top",
      label: `${m.type} top`,
      materialId: cabinetMatId,
      widthCm: Math.max(1, W - 2 * T),
      heightCm: D,
      grainAlongWidth: true,
    });
  }
  // Sink/oven/dishwasher cut-out units typically have no door — skip door for those.
  if (
    m.type !== "sink-unit" &&
    m.type !== "oven-unit" &&
    m.type !== "dishwasher-unit"
  ) {
    out.push({
      id: `${prefix}.${m.id}.door`,
      role: "cabinet-door",
      label: `${m.type} door`,
      materialId: doorMatId,
      widthCm: Math.max(1, W - DOOR_GAP_CM * 2),
      heightCm: Math.max(1, H - DOOR_GAP_CM * 2),
      grainAlongWidth: false,
    });
  }
}

function collectGroup(
  out: PanelMeta[],
  group: ModuleGroup,
  cabinetMatId: string,
  doorMatId: string,
) {
  for (const m of group.modules) {
    addModulePanels(
      out,
      m,
      group.prefix,
      cabinetMatId,
      doorMatId,
      group.heightDefault,
      group.depthDefault,
      group.includeTopPanel,
    );
  }
}

export interface EnumeratedKitchenPanels {
  all: PanelMeta[];
  byMaterial: Map<string, PanelMeta[]>;
}

export function enumerateKitchenPanels(
  config: KitchenConfig,
): EnumeratedKitchenPanels {
  const cabinetMat = config.cabinetMaterial;
  const doorMat = config.doors.material || cabinetMat;

  const groups: ModuleGroup[] = [
    {
      prefix: "main.base",
      modules: config.baseModules,
      depthDefault: BASE_DEPTH,
      heightDefault: BASE_HEIGHT,
      includeTopPanel: false,
    },
    {
      prefix: "main.wall",
      modules: config.hasWallCabinets ? config.wallModules : [],
      depthDefault: WALL_DEPTH,
      heightDefault: WALL_CABINET_HEIGHT,
      includeTopPanel: true,
    },
    {
      prefix: "island.base",
      modules: config.island.enabled ? config.island.baseModules : [],
      depthDefault: BASE_DEPTH,
      heightDefault: BASE_HEIGHT,
      includeTopPanel: false,
    },
    {
      prefix: "island.wall",
      modules:
        config.island.enabled && config.island.hasWallCabinets
          ? config.island.wallModules
          : [],
      depthDefault: WALL_DEPTH,
      heightDefault: WALL_CABINET_HEIGHT,
      includeTopPanel: true,
    },
    {
      prefix: "left.base",
      modules: config.leftWall.enabled ? config.leftWall.baseModules : [],
      depthDefault: BASE_DEPTH,
      heightDefault: BASE_HEIGHT,
      includeTopPanel: false,
    },
    {
      prefix: "left.wall",
      modules:
        config.leftWall.enabled && config.leftWall.hasWallCabinets
          ? config.leftWall.wallModules
          : [],
      depthDefault: WALL_DEPTH,
      heightDefault: WALL_CABINET_HEIGHT,
      includeTopPanel: true,
    },
  ];

  const all: PanelMeta[] = [];
  for (const g of groups) collectGroup(all, g, cabinetMat, doorMat);

  const byMaterial = new Map<string, PanelMeta[]>();
  for (const p of all) {
    const list = byMaterial.get(p.materialId) ?? [];
    list.push(p);
    byMaterial.set(p.materialId, list);
  }
  return { all, byMaterial };
}

export interface PackerPanelPrep {
  panel: Panel;
  preRotated: boolean;
}

export function panelMetaToPackerPanel(
  meta: PanelMeta,
  materialGrain: "along_width" | "along_height" | "none",
  opts?: { optimize?: boolean },
): PackerPanelPrep {
  const isDoor = meta.role === "cabinet-door";
  if (
    opts?.optimize &&
    !isDoor &&
    materialGrain !== "none"
  ) {
    return {
      panel: {
        id: meta.id,
        widthCm: meta.widthCm,
        heightCm: meta.heightCm,
        grainAxis: "any",
        label: meta.label,
      },
      preRotated: false,
    };
  }
  if (materialGrain === "none") {
    return {
      panel: {
        id: meta.id,
        widthCm: meta.widthCm,
        heightCm: meta.heightCm,
        grainAxis: "any",
        label: meta.label,
      },
      preRotated: false,
    };
  }
  const needsSwap =
    (meta.grainAlongWidth && materialGrain === "along_height") ||
    (!meta.grainAlongWidth && materialGrain === "along_width");
  return {
    panel: {
      id: meta.id,
      widthCm: needsSwap ? meta.heightCm : meta.widthCm,
      heightCm: needsSwap ? meta.widthCm : meta.heightCm,
      grainAxis: materialGrain === "along_width" ? "width" : "height",
      label: meta.label,
    },
    preRotated: needsSwap,
  };
}
