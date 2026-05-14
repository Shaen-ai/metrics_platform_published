/**
 * Converts a WardrobeConfig into a list of cut Panels for the packer,
 * grouped by the material each panel actually consumes (frame, interior,
 * each door panel). Back panels are intentionally excluded — they are HDF
 * stock, not laminated, and are rendered with a neutral material.
 *
 * Keep the dimensional math in sync with `laminateChart.ts` so the sheet
 * viewer and the cut-list agree on every piece.
 */

import {
  PANEL_THICKNESS,
  clampWardrobeBase,
  DEFAULT_WARDROBE_BASE,
  doorFrontExtraWidthCm,
  doorFrontExtraHeightCm,
  slidingDoorPanelWidthsCm,
  wardrobeDoorPanelGrainForSection,
  wardrobeDoorPanelMaterialIdForSection,
  hingedDoorCountForSection,
  hingedDoorsForSection,
  shelfPanelWidthCm,
  shelfPanelDepthCm,
  wardrobePlinthFrontDropCm,
  wardrobeHingedDoorFlatBaseIndex,
} from "../wardrobe/data";
import type {
  GrainDirection,
  WardrobeComponent,
  WardrobeConfig,
  WardrobeSection,
} from "../wardrobe/types";
import type { Panel } from "./panelPacker";

const FRONT_TYPES = new Set(["drawer", "empty-section"]);
const CM = 0.01;
/** Matches WardrobeDoors3D door gap (m → cm). */
const DOOR_GAP_CM = 0.0006 / CM;
/** Flush stacked drawer fronts (no visible seam); polygon offset avoids z-fighting. */
const DRAWER_FRONT_CLEARANCE_CM = 0;
const T = PANEL_THICKNESS;
/** Matches WardrobeInterior3D `FRONT_CLEARANCE` (m). */
const FRONT_CLEARANCE_M = DRAWER_FRONT_CLEARANCE_CM * CM;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function sectionHasDrawerFronts(section: WardrobeSection): boolean {
  return section.components.some((c) => c.type === "drawer");
}

/**
 * Bottom Y (m from carcass base) of a drawer front — matches interior layout
 * (`PT + yPosition`) so 3D fronts/handles align with drawer boxes. Interior
 * components stack with gaps; do not chain fronts as if gaps were zero.
 */
function drawerBottomFrontMFromY(yPosCm: number): number {
  return (T + yPosCm) * CM;
}

/**
 * Top Y (m from carcass base) of the upper laminated drawer front — used to extend
 * the hinged door downward to meet the drawer stack.
 */
export function stackedDrawerFrontsTopM(sectionComponents: WardrobeComponent[]): number | null {
  const drawerEntries = sectionComponents
    .map((c, i) => ({ c, i }))
    .filter((x): x is { c: WardrobeComponent; i: number } => x.c.type === "drawer")
    .sort((a, b) => a.c.yPosition - b.c.yPosition || a.i - b.i);
  if (drawerEntries.length === 0) return null;
  const lastIdx = drawerEntries.length - 1;
  const last = drawerEntries[lastIdx].c;
  return drawerBottomFrontMFromY(last.yPosition) + last.height * CM - FRONT_CLEARANCE_M;
}

/**
 * Hinged door height (cm) and center Y (cm from carcass base). When a section
 * has drawers, `dhCm` grows so the door bottom meets the stacked drawer fronts
 * (after {@link stackedDrawerFrontsTopM}); same math as WardrobeDoors3D.
 * All Y in cm from the outer carcass base (y=0). Interior / drawer fronts use
 * T + y (top of bottom panel) — the door center must include +T, otherwise
 * the leaf sits ~T too low and the bottom drawer line reads 1–2 cm off.
 */
export function hingedDoorPanelVerticalCm(
  section: WardrobeSection,
  frameHeightCm: number,
  plinthFrontDropCm = 0,
): { dhCm: number; doorCenterYCm: number } {
  const H = frameHeightCm;
  const reduction = doorReductionCm(section);
  const { dhExtraCm, centerYShiftCm } = doorFrontExtraHeightCm(reduction);
  let dhCm = H - T - DOOR_GAP_CM * 2 - reduction + dhExtraCm;
  let doorCenterYCm = T + reduction / 2 + H / 2 + centerYShiftCm;

  const stackTopM = stackedDrawerFrontsTopM(section.components);
  if (stackTopM != null && dhCm > 0.01) {
    const doorTopCm = doorCenterYCm + dhCm / 2;
    const dReqCm = stackTopM / CM + DOOR_GAP_CM;
    if (dReqCm < doorTopCm - 1e-6) {
      const dhNewCm = doorTopCm - dReqCm;
      if (dhNewCm > 0.01) {
        dhCm = dhNewCm;
        doorCenterYCm = dReqCm + dhNewCm / 2;
      }
    }
  }

  /** Plinth overlap on the hinged leaf only when there are no drawer fronts in this bay. */
  const plinthDoorCm =
    plinthFrontDropCm > 1e-9 && !sectionHasDrawerFronts(section) ? plinthFrontDropCm : 0;
  if (plinthDoorCm > 1e-9) {
    dhCm += plinthDoorCm;
    doorCenterYCm -= plinthDoorCm / 2;
  }

  // Rail-overlap (`dhExtraCm`) otherwise pushes the leaf top to ~H + T (past the
  // carcass outer height). Keep the door within the frame outline (y ≤ H).
  const maxTopCm = H - DOOR_GAP_CM;
  const topCm = doorCenterYCm + dhCm / 2;
  if (topCm > maxTopCm + 1e-6) {
    const delta = topCm - maxTopCm;
    dhCm -= delta;
    doorCenterYCm -= delta / 2;
  }

  return { dhCm, doorCenterYCm };
}

/**
 * Sliding door panel height (cm) after the same top clamp as {@link hingedDoorPanelVerticalCm}.
 * Keeps cut-list / sheet enumeration aligned with {@link WardrobeDoors3D}.
 */
export function slidingDoorPanelHeightCmClamped(
  frameHeightCm: number,
  maxReductionCm: number,
  plinthSlideCm: number,
  dhCm: number,
): number {
  const { centerYShiftCm } = doorFrontExtraHeightCm(maxReductionCm);
  const slideDoorYCm =
    maxReductionCm / 2 +
    frameHeightCm / 2 +
    centerYShiftCm -
    plinthSlideCm / 2;
  const maxTopCm = frameHeightCm - DOOR_GAP_CM;
  const topCm = slideDoorYCm + dhCm / 2;
  if (topCm <= maxTopCm + 1e-6) return dhCm;
  return dhCm - (topCm - maxTopCm);
}

/**
 * Laminated drawer box pieces (sides, back, bottom) — cm dimensions match
 * {@link WardrobeInterior3D} drawer `boxGeometry` math (U-shell + thin bottom).
 */
export function wardrobeDrawerBoxCutsCm(
  sectionWidthCm: number,
  frameDepthCm: number,
  drawerHeightCm: number,
): {
  side: { widthCm: number; heightCm: number };
  back: { widthCm: number; heightCm: number };
  bottom: { widthCm: number; heightCm: number; thicknessCm: number };
} {
  const boxW_cm = sectionWidthCm - 0.5;
  const boxD_cm = frameDepthCm - 1.14;
  const boxH_cm = drawerHeightCm - 0.3;
  const innerW_cm = Math.max(boxW_cm - 2 * PANEL_THICKNESS, 2);
  return {
    side: { widthCm: round1(boxD_cm), heightCm: round1(boxH_cm) },
    back: { widthCm: round1(innerW_cm), heightCm: round1(boxH_cm) },
    bottom: {
      widthCm: round1(Math.max(innerW_cm - 0.2, 0.1)),
      heightCm: round1(Math.max(boxD_cm - 0.2, 0.1)),
      thicknessCm: 0.3,
    },
  };
}

/**
 * Drawer front placement: same vertical origin as interior components
 * (`T + yPosition` from carcass base). Heights follow `component.height`; stacked
 * drawers with the same height get identical laminate fronts (no plinth/rail overlap
 * extension on the bottom drawer — that overlap is modeled on hinged doors only when
 * the bay has no drawer fronts).
 * See {@link hingedDoorPanelVerticalCm}.
 */
export function drawerFrontLayoutM(
  sectionComponents: WardrobeComponent[],
  componentIndex: number,
): { bottomFrontM: number; frontHM: number } {
  const drawerEntries = sectionComponents
    .map((c, i) => ({ c, i }))
    .filter((x): x is { c: WardrobeComponent; i: number } => x.c.type === "drawer")
    .sort((a, b) => a.c.yPosition - b.c.yPosition || a.i - b.i);

  const idx = drawerEntries.findIndex((x) => x.i === componentIndex);
  if (idx < 0) {
    return { bottomFrontM: 0, frontHM: 0 };
  }

  const current = drawerEntries[idx].c;

  const bottomFrontM = drawerBottomFrontMFromY(current.yPosition);
  const frontHM = current.height * CM - FRONT_CLEARANCE_M;

  return { bottomFrontM, frontHM };
}

export type PanelRole =
  | "frame-side-left"
  | "frame-side-right"
  | "frame-top"
  | "frame-bottom"
  | "frame-divider"
  | "plinth-side-left"
  | "plinth-side-right"
  | "plinth-front"
  | "plinth-back"
  | "interior-shelf"
  | "interior-shoe-rack"
  | "interior-drawer-front"
  | "interior-drawer-side"
  | "interior-drawer-back"
  | "interior-drawer-bottom"
  | "door-hinged"
  | "door-sliding";

export interface PanelMeta {
  /** Unique id for the packer and the sheet-viewer. */
  id: string;
  role: PanelRole;
  label: string;
  /** Which material id this panel should be cut from. */
  materialId: string;
  widthCm: number;
  heightCm: number;
  /** `true` when the grain should run along the panel's long edge. */
  grainAlongWidth: boolean;
  /**
   * Continuity-group hint for the packer. Fronts that should be cut as a
   * sequence on the sheet (door + drawer stack, or doors side-by-side)
   * share the same `key` and are ordered by `order`.
   */
  group?: { key: string; order: number };
  /**
   * Tie-break for shelf ordering in {@link wardrobePanelFrontOrderKey}
   * (cm from interior floor — higher = taller on the wardrobe front).
   */
  frontSortSecondary?: number;
  /**
   * When true, this panel can rotate freely on the sheet regardless of the
   * material grain axis. Use for non-visible carcass parts to reduce waste.
   */
  grainFlexible?: boolean;
  /**
   * Whether this role is treated as "front" (grain locked) by default.
   * Computed from `role` via {@link isFrontPanelDefault}; surfaced here so
   * the sheet viewer can render a Front/Free chip without importing the
   * role list.
   */
  defaultIsFront: boolean;
}

function doorReductionCm(section: WardrobeSection): number {
  let extent = 0;
  for (const comp of section.components) {
    if (FRONT_TYPES.has(comp.type)) {
      extent = Math.max(extent, comp.yPosition + comp.height);
    }
  }
  return extent;
}

export interface EnumeratedPanels {
  /** All cuts, flat list. */
  all: PanelMeta[];
  /** Same cuts, grouped by `materialId`. */
  byMaterial: Map<string, PanelMeta[]>;
}

/**
 * Roles considered visibly "front" by default — their grain orientation is
 * locked so the laminate grain reads correctly on the finished wardrobe.
 *
 * Includes carcass sides because the cabinet side faces are visible to the
 * room. The user can override on a per-panel basis via
 * `WardrobeConfig.panelFrontOverrides`.
 */
export const DEFAULT_FRONT_ROLES: ReadonlySet<PanelRole> = new Set<PanelRole>([
  "door-hinged",
  "door-sliding",
  "interior-drawer-front",
  "plinth-front",
  "frame-side-left",
  "frame-side-right",
]);

export function isFrontPanelDefault(role: PanelRole): boolean {
  return DEFAULT_FRONT_ROLES.has(role);
}

/**
 * Whether a panel should be treated as a front (grain locked). Respects the
 * user's per-panel overrides first, otherwise falls back to the role default.
 */
export function isFrontPanel(
  meta: PanelMeta,
  overrides: Record<string, boolean> | undefined,
): boolean {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, meta.id)) {
    return overrides[meta.id] === true;
  }
  return isFrontPanelDefault(meta.role);
}

/** Strip `.addon.n` / `.leg.n` tails for stable sheet sort keys. */
export function stripWardrobePanelInstanceSuffixes(id: string): string {
  let s = id;
  for (;;) {
    const next = s.replace(/\.(?:addon|leg)\.\d+$/, "");
    if (next === s) return s;
    s = next;
  }
}

/**
 * Lexicographic sort key for wardrobe sheet layout: order pieces as if
 * reading the wardrobe from the front (left bays → right). Within each bay,
 * hinged fronts follow cut logic: first door (a), drawer fronts top→bottom
 * (b, by elevation), extra hinged leaves (c), then interior shelves (d).
 * Used for the sheet viewer list / SVG piece order and for solo packing
 * order so the laminate flow follows the same sequence.
 */
export function wardrobePanelFrontOrderKey(meta: PanelMeta): string {
  const id = stripWardrobePanelInstanceSuffixes(meta.id);
  const secPad = (n: number) => String(n).padStart(4, "0");
  /** Higher yPosition (taller on the wardrobe interior) sorts first within a shelf column. */
  const yRank = (y: number) => String(Math.round(1e6 - y * 10)).padStart(8, "0");

  switch (meta.role) {
    case "frame-top":
      return "01-a-top";
    case "frame-bottom":
      return "01-b-bottom";
    case "frame-side-left":
      return "02-a-sideL";
    case "frame-side-right":
      return "02-b-sideR";
    case "frame-divider": {
      const m = /^frame\.divider\.(\d+)/.exec(id);
      if (m) return `03-div-${secPad(parseInt(m[1]!, 10))}`;
      return `03-div-${id}`;
    }
    case "plinth-front":
      return "04-a-plinthF";
    case "plinth-back":
      return "04-b-plinthB";
    case "interior-shelf": {
      const m = /^interior\.shelf\.(\d+)\.(\d+)/.exec(id);
      const s = m ? parseInt(m[1]!, 10) : 0;
      const y = meta.frontSortSecondary ?? 0;
      /* d- = after door/drawer/extra-door stack for this bay */
      return `05-${secPad(s)}-d-shelf-${yRank(y)}`;
    }
    case "interior-shoe-rack": {
      const m = /^interior\.shoe-rack\.(\d+)\.(\d+)/.exec(id);
      const s = m ? parseInt(m[1]!, 10) : 0;
      const y = meta.frontSortSecondary ?? 0;
      return `05-${secPad(s)}-d-shoe-${yRank(y)}`;
    }
    case "interior-drawer-front": {
      const m = /^interior\.drawer\.(\d+)\.(\d+)/.exec(id);
      const s = m ? parseInt(m[1]!, 10) : 0;
      const y = meta.frontSortSecondary ?? 0;
      /* b- = after first door (a-), top drawer first */
      return `05-${secPad(s)}-b-drw-${yRank(y)}`;
    }
    case "interior-drawer-side": {
      const m = /^interior\.drawer\.side\.[01]\.(\d+)\.(\d+)/.exec(id);
      const s = m ? parseInt(m[1]!, 10) : 0;
      const y = meta.frontSortSecondary ?? 0;
      return `05-${secPad(s)}-b-drwbox-side-${yRank(y)}`;
    }
    case "interior-drawer-back": {
      const m = /^interior\.drawer\.back\.(\d+)\.(\d+)/.exec(id);
      const s = m ? parseInt(m[1]!, 10) : 0;
      const y = meta.frontSortSecondary ?? 0;
      return `05-${secPad(s)}-b-drwbox-back-${yRank(y)}`;
    }
    case "interior-drawer-bottom": {
      const m = /^interior\.drawer\.bottom\.(\d+)\.(\d+)/.exec(id);
      const s = m ? parseInt(m[1]!, 10) : 0;
      const y = meta.frontSortSecondary ?? 0;
      return `05-${secPad(s)}-b-drwbox-bot-${yRank(y)}`;
    }
    case "door-hinged": {
      const m = /^door\.hinged\.(\d+)\.(\d+)/.exec(id);
      const s = m ? parseInt(m[1]!, 10) : 0;
      const d = m ? parseInt(m[2]!, 10) : 0;
      /* a- = first door in bay; c- = extra leaves after drawers */
      const tier = d === 0 ? "a" : "c";
      return `05-${secPad(s)}-${tier}-dr-${secPad(d)}`;
    }
    case "door-sliding": {
      const m = /^door\.sliding\.(\d+)/.exec(id);
      const i = m ? parseInt(m[1]!, 10) : 0;
      return `06-sld-${secPad(i)}`;
    }
    default:
      return `99-${meta.id}`;
  }
}

/**
 * Given a planner grain direction ("horizontal" | "vertical"), returns whether
 * the grain should run along the panel's width axis. This matches the
 * behavior of the old `applyGrainRotation` path: "horizontal" = grain along
 * the panel's width; "vertical" = grain along the panel's height.
 */
function grainAlongWidthFor(dir: GrainDirection): boolean {
  return dir === "horizontal";
}

/**
 * Enumerates every laminate cut the wardrobe produces. `frameMaterialId` is
 * used for the carcass & interior; each door panel uses whatever is in
 * `doors.doorPanelMaterialIds[i]`, so a multi-material wardrobe naturally
 * splits into multiple packer runs.
 *
 * Grain direction follows the config toggles (`frameGrainDirection`,
 * `interiorGrainDirection`, per-door `doorPanelGrainDirections`). Flipping
 * a toggle re-packs the affected panels and re-samples the sheet texture,
 * so the 3D view shows the change immediately.
 */
export function enumerateWardrobePanels(
  config: WardrobeConfig,
  opts?: { layoutLegCount?: number },
): EnumeratedPanels {
  const { frame, sections, doors } = config;
  const base = clampWardrobeBase(config.base ?? DEFAULT_WARDROBE_BASE);
  const plinthDropCm = wardrobePlinthFrontDropCm(base);
  const W = frame.width;
  const H = frame.height;
  const D = frame.depth;
  const frameMat = config.frameMaterial;
  const interiorMat = config.interiorMaterial;
  const frameGrain: GrainDirection = config.frameGrainDirection ?? "horizontal";
  const interiorGrain: GrainDirection = config.interiorGrainDirection ?? "horizontal";
  const doorGrainFallback: GrainDirection = config.doorGrainDirection ?? "horizontal";

  const frameGrainAW = grainAlongWidthFor(frameGrain);
  const interiorGrainAW = grainAlongWidthFor(interiorGrain);
  /** `defaultIsFront` is stamped at the end once every meta exists. */
  const out: Array<Omit<PanelMeta, "defaultIsFront">> = [];

  const topBottomW = W - 2 * T;
  const sidePanelHeightCm =
    base.type === "plinth" ? H + base.plinthHeightCm : H;

  out.push({
    id: "frame.side.L",
    role: "frame-side-left",
    label: "Side panel (left)",
    materialId: frameMat,
    widthCm: D,
    heightCm: sidePanelHeightCm,
    grainAlongWidth: frameGrainAW,
    group: { key: "frame-run-sides", order: 0 },
  });
  out.push({
    id: "frame.side.R",
    role: "frame-side-right",
    label: "Side panel (right)",
    materialId: frameMat,
    widthCm: D,
    heightCm: sidePanelHeightCm,
    grainAlongWidth: frameGrainAW,
    group: { key: "frame-run-sides", order: 1 },
  });
  out.push({
    id: "frame.top",
    role: "frame-top",
    label: "Top panel",
    materialId: frameMat,
    widthCm: topBottomW,
    heightCm: D,
    grainAlongWidth: frameGrainAW,
    grainFlexible: true,
    group: { key: "frame-run-top-bottom", order: 0 },
  });
  out.push({
    id: "frame.bottom",
    role: "frame-bottom",
    label: "Bottom panel",
    materialId: frameMat,
    widthCm: topBottomW,
    heightCm: D,
    grainAlongWidth: frameGrainAW,
    grainFlexible: true,
    group: { key: "frame-run-top-bottom", order: 1 },
  });

  const dividerH = H - 2 * T;
  const dividerD = D - 1;
  for (let i = 0; i < sections.length - 1; i++) {
    out.push({
      id: `frame.divider.${i}`,
      role: "frame-divider",
      label: `Vertical divider ${i + 1}`,
      materialId: frameMat,
      widthCm: dividerD,
      heightCm: dividerH,
      grainAlongWidth: frameGrainAW,
      grainFlexible: true,
      group: { key: "frame-run-dividers", order: i },
    });
  }

  if (base.type === "plinth") {
    // Front/back kicks between extended frame sides; sides-to-floor = taller frame.side panels (no plinth.side pieces).
    const betweenSidesW = Math.max(6, topBottomW);
    /** Matches WardrobeBase3D: visible kick uses door laminate when doors are on (same sheet strip as first door). */
    const plinthFrontUsesDoor = doors.type !== "none";
    const plinthFrontMat = plinthFrontUsesDoor
      ? wardrobeDoorPanelMaterialIdForSection(doors, 0, sections)
      : frameMat;
    const plinthFrontGrain: GrainDirection = plinthFrontUsesDoor
      ? wardrobeDoorPanelGrainForSection(doors, doorGrainFallback, 0, sections)
      : doorGrainFallback === "vertical"
        ? "horizontal"
        : frameGrain;
    const plinthFrontGrainAW = grainAlongWidthFor(plinthFrontGrain);
    const plinthFrontGrainFlexible = plinthFrontUsesDoor
      ? wardrobeDoorPanelGrainForSection(doors, doorGrainFallback, 0, sections) !== "vertical"
      : doorGrainFallback !== "vertical";

    let plinthFrontGroup: PanelMeta["group"];
    if (plinthFrontUsesDoor) {
      if (doors.type === "hinged") {
        plinthFrontGroup = { key: "section-0-fronts", order: -1 };
      } else {
        plinthFrontGroup = { key: "sliding-doors-row", order: -1 };
      }
    } else {
      plinthFrontGroup = { key: "frame-run-plinth", order: 0 };
    }

    const backGrain: GrainDirection =
      doorGrainFallback === "vertical" ? "horizontal" : frameGrain;
    const backGrainAW = grainAlongWidthFor(backGrain);
    const backGrainFlexible = doorGrainFallback !== "vertical";

    out.push({
      id: "plinth.front",
      role: "plinth-front",
      label: "Plinth kick (front)",
      materialId: plinthFrontMat,
      widthCm: round1(betweenSidesW),
      heightCm: round1(base.plinthHeightCm),
      grainAlongWidth: plinthFrontGrainAW,
      grainFlexible: plinthFrontGrainFlexible,
      group: plinthFrontGroup,
    });
    out.push({
      id: "plinth.back",
      role: "plinth-back",
      label: "Plinth back",
      materialId: frameMat,
      widthCm: round1(betweenSidesW),
      heightCm: round1(base.plinthHeightCm),
      grainAlongWidth: backGrainAW,
      grainFlexible: backGrainFlexible,
      group: { key: "frame-run-plinth", order: 1 },
    });
  }

  // Track the "visible-side" material & grain per section so drawer fronts
  // inherit the same look as the hinged door above them. This also lets the
  // packer keep drawer + door in the same continuity group.
  interface SectionFrontInfo {
    materialId: string;
    grain: GrainDirection;
  }
  const sectionFrontInfo: SectionFrontInfo[] = sections.map((_, sIdx) => ({
    materialId: wardrobeDoorPanelMaterialIdForSection(doors, sIdx, sections),
    grain: wardrobeDoorPanelGrainForSection(doors, doorGrainFallback, sIdx, sections),
  }));

  let slidingMaxFrontExtentCm = 0;
  if (doors.type === "sliding") {
    for (const sec of sections) {
      for (const comp of sec.components) {
        if (FRONT_TYPES.has(comp.type)) {
          slidingMaxFrontExtentCm = Math.max(
            slidingMaxFrontExtentCm,
            comp.yPosition + comp.height,
          );
        }
      }
    }
  }

  sections.forEach((section, sIdx) => {
    const sw = section.width;
    const frontInfo = sectionFrontInfo[sIdx];
    const frontGrainAW = grainAlongWidthFor(frontInfo.grain);

    // Gather drawer components with their yPosition so we can order them
    // top-to-bottom for the continuity group. The group key + order is
    // materialized later when we emit the hinged door (so the door's
    // `order: 0` pins it to the top of the stack).
    const drawerComponents: Array<{
      cIdx: number;
      comp: (typeof section.components)[number];
    }> = [];

    section.components.forEach((comp, cIdx) => {
      if (comp.type === "shelf") {
        const compGrain: GrainDirection = comp.grainDirection ?? interiorGrain;
        out.push({
          id: `interior.shelf.${sIdx}.${cIdx}`,
          role: "interior-shelf",
          label: `Shelf · section ${sIdx + 1}`,
          materialId: interiorMat,
          widthCm: round1(shelfPanelWidthCm(sw, comp.shelfWidthCm)),
          heightCm: round1(shelfPanelDepthCm(D, comp.shelfDepthCm)),
          grainAlongWidth: grainAlongWidthFor(compGrain),
          /** Allow 90° rotation on the sheet for best laminate yield (like frame top/bottom). */
          grainFlexible: true,
          frontSortSecondary: comp.yPosition,
        });
      } else if (comp.type === "shoe-rack") {
        const compGrain: GrainDirection = comp.grainDirection ?? interiorGrain;
        const rackW_cm = Math.max(0.1, sw - 0.6);
        const rackD_cm = Math.max(0.1, (D - 2) * 0.6);
        out.push({
          id: `interior.shoe-rack.${sIdx}.${cIdx}`,
          role: "interior-shoe-rack",
          label: `Shoe-rack board · section ${sIdx + 1}`,
          materialId: interiorMat,
          widthCm: round1(rackW_cm),
          heightCm: round1(rackD_cm),
          grainAlongWidth: grainAlongWidthFor(compGrain),
          grainFlexible: true,
          frontSortSecondary: comp.yPosition,
        });
      } else if (comp.type === "drawer") {
        drawerComponents.push({ cIdx, comp });
      }
    });

    // Sort drawers top-to-bottom (higher yPosition = higher on wardrobe).
    drawerComponents.sort((a, b) => b.comp.yPosition - a.comp.yPosition);

    // Emit drawer fronts, using the section's door material so they match
    // the door visually and can share its continuity group when appropriate.
    /** Hinged sections: drawer fronts belong with the first door of the bay (cut order + sheet strip). */
    const partOfHingedSectionFrontStack =
      doors.type === "hinged" && frontInfo.materialId !== undefined;
    drawerComponents.forEach((d, drawerIndex) => {
      const { comp, cIdx } = d;
      // Match hinged door overlay (covers vertical dividers / frame edges on the sheet).
      const frontW = sw + T - DOOR_GAP_CM * 2 + doorFrontExtraWidthCm(sIdx, sections.length);
      const { frontHM } = drawerFrontLayoutM(section.components, cIdx);
      const frontH = round1(frontHM / CM);
      const compGrain: GrainDirection = comp.grainDirection ?? frontInfo.grain;

      // Group with first hinged door: same material strip, door order 0 then drawers 1…
      // Grain matches the section door so horizontal/vertical layout reads correctly on the sheet.
      const effectiveFrontGrain: GrainDirection = partOfHingedSectionFrontStack
        ? frontInfo.grain
        : compGrain;
      const aw = grainAlongWidthFor(effectiveFrontGrain);

      out.push({
        id: `interior.drawer.${sIdx}.${cIdx}`,
        role: "interior-drawer-front",
        label: `Drawer front · section ${sIdx + 1}`,
        materialId: frontInfo.materialId,
        widthCm: round1(frontW),
        heightCm: round1(frontH),
        grainAlongWidth: aw,
        frontSortSecondary: comp.yPosition,
        group: partOfHingedSectionFrontStack
          ? { key: `section-${sIdx}-fronts`, order: drawerIndex + 1 }
          : undefined,
      });

      const boxCuts = wardrobeDrawerBoxCutsCm(sw, D, comp.height);
      const ySort = comp.yPosition;
      if (boxCuts.side.widthCm > 0.05 && boxCuts.side.heightCm > 0.05) {
        for (const sideIdx of [0, 1]) {
          out.push({
            id: `interior.drawer.side.${sideIdx}.${sIdx}.${cIdx}`,
            role: "interior-drawer-side",
            label: `Drawer side · section ${sIdx + 1} · ${sideIdx + 1}/2`,
            materialId: interiorMat,
            widthCm: boxCuts.side.widthCm,
            heightCm: boxCuts.side.heightCm,
            grainAlongWidth: interiorGrainAW,
            grainFlexible: true,
            frontSortSecondary: ySort,
          });
        }
      }
      if (boxCuts.back.widthCm > 0.05 && boxCuts.back.heightCm > 0.05) {
        out.push({
          id: `interior.drawer.back.${sIdx}.${cIdx}`,
          role: "interior-drawer-back",
          label: `Drawer back · section ${sIdx + 1}`,
          materialId: interiorMat,
          widthCm: boxCuts.back.widthCm,
          heightCm: boxCuts.back.heightCm,
          grainAlongWidth: interiorGrainAW,
          grainFlexible: true,
          frontSortSecondary: ySort,
        });
      }
      if (boxCuts.bottom.widthCm > 0.05 && boxCuts.bottom.heightCm > 0.05) {
        out.push({
          id: `interior.drawer.bottom.${sIdx}.${cIdx}`,
          role: "interior-drawer-bottom",
          label: `Drawer bottom · section ${sIdx + 1}`,
          materialId: interiorMat,
          widthCm: boxCuts.bottom.widthCm,
          heightCm: boxCuts.bottom.heightCm,
          grainAlongWidth: interiorGrainAW,
          grainFlexible: true,
          frontSortSecondary: ySort,
        });
      }
    });
  });

  // Doors — each panel carries its own grain direction from config; fall
  // back to the wardrobe-wide door grain if the per-panel entry is missing.
  if (doors.type === "hinged") {
    // Flat running index across sections so grouping order is stable when
    // bays contain multiple doors (e.g., French-door sections).
    let rowOrder = 0;
    sections.forEach((section, idx) => {
      const n = hingedDoorCountForSection(section.hingedDoorCount);
      const { doorWidthCm } = hingedDoorsForSection(section.width, idx, sections.length, n);
      const { dhCm } = hingedDoorPanelVerticalCm(section, H, plinthDropCm);
      const dh = dhCm;
      if (dh <= 0.01) {
        rowOrder += n;
        return;
      }
      for (let doorIdx = 0; doorIdx < n; doorIdx++) {
        const flat = wardrobeHingedDoorFlatBaseIndex(sections, idx) + doorIdx;
        const matId =
          doors.doorPanelMaterialIds[flat] ??
          doors.doorPanelMaterialIds[0] ??
          frameMat;
        const grainDir =
          doors.doorPanelGrainDirections[flat] ??
          doors.doorPanelGrainDirections[0] ??
          doorGrainFallback;
        // First door of each bay shares `section-{idx}-fronts` with that
        // section's drawer fronts (order 0 = door, 1… = drawers top→bottom).
        // Additional hinged leaves in the same section use `hinged-doors-row`.
        let group: PanelMeta["group"];
        if (doorIdx === 0) {
          group = { key: `section-${idx}-fronts`, order: 0 };
        } else {
          group = { key: `hinged-doors-row`, order: rowOrder };
        }
        out.push({
          id: `door.hinged.${idx}.${doorIdx}`,
          role: "door-hinged",
          label:
            n === 1
              ? `Hinged door ${idx + 1}`
              : `Hinged door · section ${idx + 1} · ${doorIdx + 1}/${n}`,
          materialId: matId,
          widthCm: round1(doorWidthCm),
          heightCm: round1(dh),
          grainAlongWidth: grainAlongWidthFor(grainDir),
          group,
        });
        rowOrder += 1;
      }
    });
  } else if (doors.type === "sliding") {
    const doorCount = Math.max(2, doors.doorPanelMaterialIds.length);
    const { slidePanelW } = slidingDoorPanelWidthsCm(W, doorCount);
    const maxReduction = Math.max(0, ...sections.map(doorReductionCm));
    const { dhExtraCm: slideDhExtraCm } = doorFrontExtraHeightCm(maxReduction);
    const plinthSlideCm = plinthDropCm > 0 && maxReduction <= 1e-9 ? plinthDropCm : 0;
    const dh = H - T - DOOR_GAP_CM * 2 - maxReduction + slideDhExtraCm + plinthSlideCm;
    // Sliding panels: always one continuity group so the packer lays all
    // doors in one strip left→right (full front list), same as 3D order.

    // Indices 0…n-1 are door 1…n left→right on the front; same order for sheet strip + 3D UV.
    if (dh > 0.01) {
      for (let i = 0; i < doorCount; i++) {
        const matId = doors.doorPanelMaterialIds[i] ?? doors.doorPanelMaterialIds[0] ?? frameMat;
        const grain =
          doors.doorPanelGrainDirections[i] ??
          doors.doorPanelGrainDirections[0] ??
          doorGrainFallback;
        out.push({
          id: `door.sliding.${i}`,
          role: "door-sliding",
          label: `Sliding door ${i + 1}`,
          materialId: matId,
          widthCm: round1(slidePanelW),
          heightCm: round1(dh),
          grainAlongWidth: grainAlongWidthFor(grain),
          group: { key: `sliding-doors-row`, order: i },
        });
      }
    }
  }

  // Duplicate every primary-module panel for each addon so the sheet
  // packer sees the full composition. Addon panels share the same
  // dimensions / grain / material / group rules as the primary.
  const addonCount = (config.addons ?? []).length;
  const drafts: Array<Omit<PanelMeta, "defaultIsFront">> = out.slice();
  if (addonCount > 0) {
    (config.addons ?? []).forEach((addon, addonIdx) => {
      for (const p of out) {
        // Namespace the panel id per addon and copy the continuity group
        // key so each addon's fronts are still grouped independently.
        const suffix = `.addon.${addonIdx}`;
        const duplicate: Omit<PanelMeta, "defaultIsFront"> = {
          ...p,
          id: `${p.id}${suffix}`,
          label: `${p.label} (addon ${addonIdx + 1})`,
          group: p.group
            ? { key: `${p.group.key}${suffix}`, order: p.group.order }
            : undefined,
        };
        drafts.push(duplicate);
      }
      void addon;
    });
  }

  const layoutLegCount = Math.max(1, Math.floor(opts?.layoutLegCount ?? 1));
  let layoutDrafts = drafts.slice();
  if (layoutLegCount > 1) {
    const basePanels = drafts.slice();
    for (let leg = 1; leg < layoutLegCount; leg++) {
      const letter = String.fromCharCode(65 + leg);
      for (const p of basePanels) {
        layoutDrafts.push({
          ...p,
          id: `${p.id}.leg.${leg}`,
          label: `${p.label} · Run ${letter}`,
          group: p.group
            ? { key: `${p.group.key}.leg.${leg}`, order: p.group.order }
            : undefined,
        });
      }
    }
  }

  // Stamp the computed default front/non-front classification on each panel.
  const allWithAddons: PanelMeta[] = layoutDrafts.map((p) => ({
    ...p,
    defaultIsFront: isFrontPanelDefault(p.role),
  }));

  const byMaterial = new Map<string, PanelMeta[]>();
  for (const p of allWithAddons) {
    const list = byMaterial.get(p.materialId) ?? [];
    list.push(p);
    byMaterial.set(p.materialId, list);
  }

  return { all: allWithAddons, byMaterial };
}

export interface PackerPanelPrep {
  panel: Panel;
  /**
   * True when the panel's width/height had to be swapped before submission
   * to align the panel's desired grain with the material's sheet axis. The
   * renderer combines this with `placement.rotated` to decide whether to
   * rotate the sampled texture 90°.
   */
  preRotated: boolean;
}

export interface PanelMetaPrepOptions {
  /** True when this panel is treated as a visible front (grain locked). */
  isFront?: boolean;
  /** True when the Optimize Cutting mode is active. */
  optimize?: boolean;
}

/**
 * Turns a PanelMeta into a packer Panel, honoring the material's grain
 * direction. When the material is rotatable (`grainDirection: "none"`) the
 * panel inherits `grainAxis: "any"` and the packer decides rotation. When
 * the material has a fixed grain axis we pre-rotate the panel (swap w/h)
 * if its desired grain doesn't match, then lock rotation to avoid a
 * conflicting second 90° turn by the packer.
 *
 * When `opts.optimize` is true AND `opts.isFront === false`, the panel is
 * emitted with `grainAxis: "any"` and no group — the packer is free to
 * rotate it for best yield; the 3D renderer compensates via
 * `PanelRenderInfo.textureRotated` so the interior still textures cleanly.
 */
export function panelMetaToPackerPanel(
  meta: PanelMeta,
  materialGrain: "along_width" | "along_height" | "none",
  opts?: PanelMetaPrepOptions,
): PackerPanelPrep {
  const optimizeNonFront = opts?.optimize === true && opts?.isFront === false;

  if (optimizeNonFront && !meta.group) {
    // Non-front in optimize mode: drop grain + group constraints entirely so
    // the packer can rotate freely and pack tighter. The interior surface's
    // UVs are sampled from the sheet anyway, so a 90° turn is harmless.
    // Continuity groups are always preserved so strips stay contiguous.
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

  if (meta.grainFlexible) {
    return {
      panel: {
        id: meta.id,
        widthCm: meta.widthCm,
        heightCm: meta.heightCm,
        grainAxis: "any",
        label: meta.label,
        group: meta.group
          ? {
              key: meta.group.key,
              order: meta.group.order,
              direction: materialGrain === "along_height" ? "height" : "width",
            }
          : undefined,
      },
      preRotated: false,
    };
  }

  // Direction the group members are laid out along on the sheet. For a
  // grain-carrying material, continuity is preserved only along the sheet's
  // grain axis; for a no-grain material we default to "width" (the long
  // edge of the default 360×180 cm sheet) so the viewer shows strips along
  // the typical reading direction.
  const groupDirection: "width" | "height" =
    materialGrain === "along_height" ? "height" : "width";
  const forwardGroup = meta.group
    ? {
        key: meta.group.key,
        order: meta.group.order,
        direction: groupDirection,
      }
    : undefined;

  if (materialGrain === "none") {
    return {
      panel: {
        id: meta.id,
        widthCm: meta.widthCm,
        heightCm: meta.heightCm,
        grainAxis: "any",
        label: meta.label,
        group: forwardGroup,
      },
      preRotated: false,
    };
  }

  const needsSwap =
    (meta.grainAlongWidth && materialGrain === "along_height") ||
    (!meta.grainAlongWidth && materialGrain === "along_width");

  const widthCm = needsSwap ? meta.heightCm : meta.widthCm;
  const heightCm = needsSwap ? meta.widthCm : meta.heightCm;
  return {
    panel: {
      id: meta.id,
      widthCm,
      heightCm,
      grainAxis: materialGrain === "along_width" ? "width" : "height",
      label: meta.label,
      group: forwardGroup,
    },
    preRotated: needsSwap,
  };
}
