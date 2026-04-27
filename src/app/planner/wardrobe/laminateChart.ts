/**
 * Cut list for wardrobe laminate panels (dimensions align with 3D frame/doors/interior).
 * Thickness uses PANEL_THICKNESS from data.ts (1.8 cm).
 * Admin duplicate: metrics_platform/src/lib/wardrobe/laminateChart.ts — keep logic in sync.
 */

import type { WardrobeConfig, WardrobeSection } from "./types";
import {
  PANEL_THICKNESS,
  clampWardrobeBase,
  DEFAULT_WARDROBE_BASE,
  doorFrontExtraWidthCm,
  doorFrontExtraHeightCm,
  slidingDoorPanelWidthsCm,
  wardrobePlinthFrontDropCm,
  hingedDoorCountForSection,
  hingedDoorsForSection,
  shelfPanelWidthCm,
  shelfPanelDepthCm,
} from "./data";
import {
  drawerFrontLayoutM,
  hingedDoorPanelVerticalCm,
  slidingDoorPanelHeightCmClamped,
} from "../sheet/wardrobePanels";

const CM = 0.01;
const T = PANEL_THICKNESS;
/** Matches WardrobeDoors3D */
const DOOR_GAP_CM = 0.0006 / CM;
const DOOR_THICKNESS_CM = 0.018 / CM;

export type LaminateCategory = "frame" | "interior" | "door" | "back";

export interface LaminateRow {
  label: string;
  /** Cut rectangle (cm) — primary face dimensions */
  widthCm: number;
  heightCm: number;
  /** Board thickness (cm) */
  thicknessCm: number;
  qty: number;
  category: LaminateCategory;
  note?: string;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

const FRONT_TYPES = new Set(["drawer", "empty-section"]);

/** Max interior front extent across bays — matches sliding door math in WardrobeDoors3D. */
function slidingMaxFrontExtentCm(sections: WardrobeSection[]): number {
  let m = 0;
  for (const sec of sections) {
    for (const comp of sec.components) {
      if (FRONT_TYPES.has(comp.type)) {
        m = Math.max(m, comp.yPosition + comp.height);
      }
    }
  }
  return m;
}

/** Max top of drawer/empty fronts (cm from interior floor) — matches WardrobeDoors3D / wardrobePanels. */
function doorReductionCm(section: WardrobeSection): number {
  let extent = 0;
  for (const comp of section.components) {
    if (FRONT_TYPES.has(comp.type)) {
      extent = Math.max(extent, comp.yPosition + comp.height);
    }
  }
  return extent;
}

export function buildWardrobeLaminateChart(config: WardrobeConfig): LaminateRow[] {
  const rows: LaminateRow[] = [];
  const { frame, sections, doors } = config;
  const base = clampWardrobeBase(config.base ?? DEFAULT_WARDROBE_BASE);
  const plinthDropCm = wardrobePlinthFrontDropCm(base);
  const W = frame.width;
  const H = frame.height;
  const D = frame.depth;
  const backThickCm = 0.5; // WardrobeFrame3D back is ~5 mm; listed separately from structural T
  const topBottomW = W - 2 * T;
  const sidePanelHCm = base.type === "plinth" ? H + base.plinthHeightCm : H;

  rows.push({
    label: "Side panel (L)",
    widthCm: D,
    heightCm: sidePanelHCm,
    thicknessCm: T,
    qty: 1,
    category: "frame",
    note:
      base.type === "plinth"
        ? "Floor to top; includes plinth zone (matches 3D)"
        : "Face D×H, thickness T",
  });
  rows.push({
    label: "Side panel (R)",
    widthCm: D,
    heightCm: sidePanelHCm,
    thicknessCm: T,
    qty: 1,
    category: "frame",
  });
  rows.push({
    label: "Top panel",
    widthCm: topBottomW,
    heightCm: D,
    thicknessCm: T,
    qty: 1,
    category: "frame",
  });
  rows.push({
    label: "Bottom panel",
    widthCm: topBottomW,
    heightCm: D,
    thicknessCm: T,
    qty: 1,
    category: "frame",
  });

  rows.push({
    label: "Back panel",
    widthCm: W,
    heightCm: H,
    thicknessCm: backThickCm,
    qty: 1,
    // Back panels are HDF stock, not laminated — tracked separately so the
    // sheet packer can skip them and the cut-list can price them against a
    // different material.
    category: "back",
    note: "HDF/back board (thin vs 1.8 cm carcass)",
  });

  const dividerH = H - 2 * T;
  const dividerD = D - 1; // WardrobeFrame3D: D - 0.01 m
  for (let i = 0; i < sections.length - 1; i++) {
    rows.push({
      label: `Vertical divider ${i + 1}`,
      widthCm: dividerD,
      heightCm: dividerH,
      thicknessCm: T,
      qty: 1,
      category: "frame",
    });
  }

  if (base.type === "plinth") {
    const betweenSidesW = Math.max(6, topBottomW);
    const plinthFrontIsDoorLaminate = doors.type !== "none";
    rows.push({
      label: "Plinth kick (front)",
      widthCm: round1(betweenSidesW),
      heightCm: round1(base.plinthHeightCm),
      thicknessCm: T,
      qty: 1,
      category: plinthFrontIsDoorLaminate ? "door" : "frame",
      note: plinthFrontIsDoorLaminate
        ? "Door laminate — packed with doors on the sheet (matches 3D)"
        : "Width W − 2×T between extended sides; aligns with door opening from front",
    });
    rows.push({
      label: "Plinth back",
      widthCm: round1(betweenSidesW),
      heightCm: round1(base.plinthHeightCm),
      thicknessCm: T,
      qty: 1,
      category: "frame",
    });
  }

  const slidingMaxExtent =
    doors.type === "sliding" ? slidingMaxFrontExtentCm(sections) : 0;

  // Interior: shelves & drawer fronts (matches WardrobeInterior3D m → cm)
  sections.forEach((section, sIdx) => {
    const sw = section.width;

    section.components.forEach((comp, cIdx) => {
      if (comp.type === "shelf") {
        rows.push({
          label: `Shelf board — section ${sIdx + 1} #${cIdx + 1}`,
          widthCm: round1(shelfPanelWidthCm(sw, comp.shelfWidthCm)),
          heightCm: round1(shelfPanelDepthCm(D, comp.shelfDepthCm)),
          thicknessCm: round1(comp.height),
          qty: 1,
          category: "interior",
          note: "Span × depth, shelf thickness = component height",
        });
      }
      if (comp.type === "drawer") {
        const drawerGapCm = 0.0002 / CM;
        const frontW = sw + T - 2 * drawerGapCm + doorFrontExtraWidthCm(sIdx, sections.length);
        const { frontHM } = drawerFrontLayoutM(section.components, cIdx, {
          frameHeightCm: H,
          doorsType: doors.type,
          slidingMaxFrontExtentCm: slidingMaxExtent,
          plinthFrontDropCm: plinthDropCm,
        });
        const frontH = round1(frontHM / CM);
        rows.push({
          label: `Drawer front — section ${sIdx + 1} #${cIdx + 1}`,
          widthCm: round1(frontW),
          heightCm: round1(frontH),
          thicknessCm: round1(DOOR_THICKNESS_CM),
          qty: 1,
          category: "interior",
          note: "Front face — same overlay & thickness as hinged doors (matches 3D)",
        });
      }
    });
  });

  // Doors — WardrobeDoors3D
  if (doors.type === "hinged") {
    sections.forEach((section, idx) => {
      const n = hingedDoorCountForSection(section.hingedDoorCount);
      const { doorWidthCm } = hingedDoorsForSection(section.width, idx, sections.length, n);
      const { dhCm: dh } = hingedDoorPanelVerticalCm(section, H, plinthDropCm);
      if (dh <= 0.01) return;
      rows.push({
        label:
          n === 1
            ? `Hinged door — section ${idx + 1}`
            : `Hinged door — section ${idx + 1} (${n}× French-door)`,
        widthCm: round1(doorWidthCm),
        heightCm: round1(dh),
        thicknessCm: DOOR_THICKNESS_CM,
        qty: n,
        category: "door",
      });
    });
  } else if (doors.type === "sliding") {
    const doorCount = Math.max(2, doors.doorPanelMaterialIds.length);
    const { slidePanelW } = slidingDoorPanelWidthsCm(W, doorCount);
    const maxReduction = Math.max(...sections.map(doorReductionCm));
    const { dhExtraCm: slideDhExtraCm } = doorFrontExtraHeightCm(maxReduction);
    const plinthSlideCm = plinthDropCm > 0 && maxReduction <= 1e-9 ? plinthDropCm : 0;
    const dhRaw = H - T - DOOR_GAP_CM * 2 - maxReduction + slideDhExtraCm + plinthSlideCm;
    const dh = slidingDoorPanelHeightCmClamped(H, maxReduction, plinthSlideCm, dhRaw);
    if (dh > 0.01) {
      for (let i = 0; i < doorCount; i++) {
        rows.push({
          label: `Sliding door panel ${i + 1}`,
          widthCm: round1(slidePanelW),
          heightCm: round1(dh),
          thicknessCm: DOOR_THICKNESS_CM,
          qty: 1,
          category: "door",
        });
      }
    }
  }

  return rows;
}
