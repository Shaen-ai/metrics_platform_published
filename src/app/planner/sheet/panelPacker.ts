/**
 * 2D bin-packing for laminate / wood / worktop sheets.
 *
 * Algorithm: MaxRects with Best Short Side Fit (BSSF) placement + rotation
 * when allowed. Deterministic — rects sorted by area descending, tie-broken
 * by stable id. Memoize the result at the call site when inputs are stable.
 *
 * Kerf: adjacent cuts share a blade width, so each piece is placed at
 * actual size but every free rect allocated to it is grown by `kerfCm`
 * along the right and bottom edges. The net effect is a `kerfCm` gap
 * between any two adjacent pieces, matching what a real saw would leave.
 */

/** Orientation constraint coming from the material + panel roles. */
export type PanelGrainAxis = "width" | "height" | "any";

export interface Panel {
  /** Stable identifier — appears unchanged in the output placement. */
  id: string;
  widthCm: number;
  heightCm: number;
  /**
   * Grain axis the panel is cut with.
   *  - "width": grain runs along the panel's width. If material grain runs
   *    along the sheet's width the piece goes in upright; to rotate 90° we'd
   *    need material grain to also rotate, so we only allow rotation when
   *    grain is `"any"` (no-grain materials).
   *  - "height": grain runs along the panel's height. Same rule.
   *  - "any": rotation allowed.
   */
  grainAxis: PanelGrainAxis;
  /** Human label for the sheet-viewer overlay (e.g. "Top panel, Module 1"). */
  label: string;
  /** How many identical cuts of this panel are needed. Defaults to 1. */
  quantity?: number;
  /**
   * Continuity group. Panels with the same `group.key` are placed as a
   * single contiguous strip on the sheet in the order given by `group.order`.
   * Used for cabinet fronts (door + drawer stack, or doors side-by-side)
   * so the grain pattern flows seamlessly from one front to the next when
   * the wardrobe is assembled.
   */
  group?: {
    key: string;
    order: number;
    /**
     * How group members align on the sheet:
     *  - "width":  adjacent along sheet X (same Y, increasing X).
     *  - "height": adjacent along sheet Y (same X, increasing Y).
     * For grain-continuity the direction should equal the material's grain
     * axis so sequencing on the sheet matches grain flow.
     */
    direction: "width" | "height";
  };
}

export interface Sheet {
  widthCm: number;
  heightCm: number;
  kerfCm: number;
}

export interface Placement {
  panelId: string;
  label: string;
  sheetIndex: number;
  /** Placement position (cm) — origin is top-left of the sheet. */
  xCm: number;
  yCm: number;
  /** Rendered width/height (after rotation if `rotated`). */
  widthCm: number;
  heightCm: number;
  /** True when packer rotated the piece 90°; renderer must mirror that in UVs. */
  rotated: boolean;
}

export interface SheetUsage {
  index: number;
  usedAreaCm2: number;
  sheetAreaCm2: number;
  wasteRatio: number;
}

export interface PackResult {
  placements: Placement[];
  sheets: SheetUsage[];
  /** Panels that do not fit on a single sheet even when rotated. */
  overflow: Array<{ panelId: string; label: string; widthCm: number; heightCm: number }>;
  /**
   * Continuity group keys where the strip could not be placed (even after
   * sub-strip splits) and pieces fell back to solo packing — grain may not
   * match across those pieces on the sheet.
   */
  continuityGroupBreaks: string[];
}

/** `door.sliding.N` → N; other ids → null (localeCompare used as tie-break). */
function doorSlidingNumericIndex(panelId: string): number | null {
  const base = panelId.split("#")[0] ?? panelId;
  const m = /^door\.sliding\.(\d+)/.exec(base);
  return m ? parseInt(m[1]!, 10) : null;
}

interface WorkingPanel {
  panelId: string;
  label: string;
  widthCm: number;
  heightCm: number;
  /** Rotation allowed for solo MaxRects placement (false when in a group). */
  canRotate: boolean;
  /** Original grain constraint — used when a continuity strip fails and we fall back to solo packing. */
  grainAxis: PanelGrainAxis;
  groupKey?: string;
  groupOrder?: number;
  groupDirection?: "width" | "height";
}

interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function expandPanels(panels: Panel[]): WorkingPanel[] {
  const out: WorkingPanel[] = [];
  for (const p of panels) {
    if (!Number.isFinite(p.widthCm) || !Number.isFinite(p.heightCm)) continue;
    if (p.widthCm <= 0 || p.heightCm <= 0) continue;
    const qty = Math.max(1, Math.floor(p.quantity ?? 1));
    // Panels in a continuity group must keep their packer-submitted
    // orientation (rotation would break the grain alignment).
    const canRotate = p.grainAxis === "any" && !p.group;
    for (let i = 0; i < qty; i++) {
      out.push({
        panelId: qty > 1 ? `${p.id}#${i}` : p.id,
        label: qty > 1 ? `${p.label} (${i + 1}/${qty})` : p.label,
        widthCm: p.widthCm,
        heightCm: p.heightCm,
        canRotate,
        grainAxis: p.grainAxis,
        groupKey: p.group?.key,
        groupOrder: p.group?.order,
        groupDirection: p.group?.direction,
      });
    }
  }
  return out;
}

/**
 * MaxRects placement heuristic:
 *  - `bssf` Best Short Side Fit — minimize smaller leftover side (default).
 *  - `blsf` Best Long Side Fit  — minimize larger  leftover side.
 *  - `baf`  Best Area Fit       — minimize leftover area (prefers snug fits).
 *  - `bl`   Bottom-Left         — pack toward y=0, x=0; good "gravity" for
 *           sheets dominated by a few tall pieces (doors). Ties broken by
 *           lowest x+y.
 */
export type PlacementHeuristic = "bssf" | "blsf" | "baf" | "bl";

/**
 * For each free rect that admits the panel (optionally rotated), score the
 * placement using the selected heuristic and return the best candidate.
 */
function findBestPosition(
  freeRects: FreeRect[],
  panel: WorkingPanel,
  kerfCm: number,
  heuristic: PlacementHeuristic,
): { rectIndex: number; x: number; y: number; w: number; h: number; rotated: boolean } | null {
  const candidates: Array<[number, boolean]> = [[0, false]];
  if (panel.canRotate) candidates.push([0, true]);

  let best: {
    rectIndex: number;
    score1: number;
    score2: number;
    x: number;
    y: number;
    w: number;
    h: number;
    rotated: boolean;
  } | null = null;

  for (let i = 0; i < freeRects.length; i++) {
    const rect = freeRects[i];
    for (const [, rotated] of candidates) {
      const pw = rotated ? panel.heightCm : panel.widthCm;
      const ph = rotated ? panel.widthCm : panel.heightCm;
      // Kerf grows the footprint of the placed piece on right + bottom so
      // adjacent pieces can't touch; the piece's actual dimensions stay pw/ph.
      const fw = pw + kerfCm;
      const fh = ph + kerfCm;
      if (fw > rect.w + 1e-6 || fh > rect.h + 1e-6) continue;
      const leftoverW = rect.w - fw;
      const leftoverH = rect.h - fh;
      const shortSide = Math.min(leftoverW, leftoverH);
      const longSide = Math.max(leftoverW, leftoverH);

      let score1: number;
      let score2: number;
      switch (heuristic) {
        case "blsf":
          score1 = longSide;
          score2 = shortSide;
          break;
        case "baf":
          score1 = leftoverW * leftoverH;
          score2 = shortSide;
          break;
        case "bl":
          // Bottom-left: lowest Y wins; tie-break by lowest X. Subtract from
          // large numbers so "lower is better" matches the other heuristics.
          score1 = rect.y;
          score2 = rect.x;
          break;
        case "bssf":
        default:
          score1 = shortSide;
          score2 = longSide;
          break;
      }

      if (
        best === null ||
        score1 < best.score1 - 1e-6 ||
        (Math.abs(score1 - best.score1) < 1e-6 && score2 < best.score2 - 1e-6)
      ) {
        best = {
          rectIndex: i,
          score1,
          score2,
          x: rect.x,
          y: rect.y,
          w: pw,
          h: ph,
          rotated,
        };
      }
    }
  }

  if (!best) return null;
  return {
    rectIndex: best.rectIndex,
    x: best.x,
    y: best.y,
    w: best.w,
    h: best.h,
    rotated: best.rotated,
  };
}

/**
 * Guillotine-style bottom-left: each piece sits at the top-left corner of some
 * free rectangle; the remainder splits into a right strip and a top strip.
 * Often packs sheet stock tighter than MaxRects when there are few large parts.
 */
export type PackingEngine = "maxrects" | "guillotine-bl";

function lex4Less(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  for (let j = 0; j < 4; j++) {
    if (a[j]! < b[j]! - 1e-9) return true;
    if (a[j]! > b[j]! + 1e-9) return false;
  }
  return false;
}

function findGuillotineBLPosition(
  freeRects: FreeRect[],
  panel: WorkingPanel,
  kerfCm: number,
): { rectIndex: number; x: number; y: number; w: number; h: number; rotated: boolean } | null {
  const orientations: boolean[] = panel.canRotate ? [false, true] : [false];
  let best: {
    rectIndex: number;
    x: number;
    y: number;
    w: number;
    h: number;
    rotated: boolean;
    key: [number, number, number, number];
  } | null = null;

  for (let i = 0; i < freeRects.length; i++) {
    const rect = freeRects[i]!;
    for (const rotated of orientations) {
      const pw = rotated ? panel.heightCm : panel.widthCm;
      const ph = rotated ? panel.widthCm : panel.heightCm;
      const fw = pw + kerfCm;
      const fh = ph + kerfCm;
      if (fw > rect.w + 1e-6 || fh > rect.h + 1e-6) continue;
      const x = rect.x;
      const y = rect.y;
      const key: [number, number, number, number] = [y, x, i, rotated ? 1 : 0];
      if (best === null || lex4Less(key, best.key)) {
        best = { rectIndex: i, x, y, w: pw, h: ph, rotated, key };
      }
    }
  }
  if (!best) return null;
  return {
    rectIndex: best.rectIndex,
    x: best.x,
    y: best.y,
    w: best.w,
    h: best.h,
    rotated: best.rotated,
  };
}

/** Split only the chosen rectangle into right + top guillotine children (kerf-sized footprint). */
function splitFreeRectsGuillotine(
  freeRects: FreeRect[],
  rectIndex: number,
  used: { x: number; y: number; w: number; h: number },
): FreeRect[] {
  const R = freeRects[rectIndex]!;
  if (
    used.x < R.x - 1e-6 ||
    used.y < R.y - 1e-6 ||
    used.x + used.w > R.x + R.w + 1e-6 ||
    used.y + used.h > R.y + R.h + 1e-6
  ) {
    return splitFreeRects(freeRects, used);
  }
  const rx = R.x;
  const ry = R.y;
  const fw = used.w;
  const fh = used.h;
  const out: FreeRect[] = [];
  for (let i = 0; i < freeRects.length; i++) {
    if (i !== rectIndex) out.push({ ...freeRects[i]! });
  }
  const rw = R.x + R.w - (rx + fw);
  const rh = R.y + R.h - (ry + fh);
  if (rw > 1e-6) {
    out.push({ x: rx + fw, y: ry, w: rw, h: R.h });
  }
  if (rh > 1e-6) {
    out.push({ x: rx, y: ry + fh, w: fw, h: rh });
  }
  return pruneContained(out);
}

/** Splits every free rect overlapping `used` into up to 4 sub-rects (MaxRects). */
function splitFreeRects(
  freeRects: FreeRect[],
  used: { x: number; y: number; w: number; h: number },
): FreeRect[] {
  const result: FreeRect[] = [];
  for (const r of freeRects) {
    // Axis-aligned overlap test.
    const overlaps =
      used.x < r.x + r.w &&
      used.x + used.w > r.x &&
      used.y < r.y + r.h &&
      used.y + used.h > r.y;
    if (!overlaps) {
      result.push(r);
      continue;
    }
    if (used.x > r.x) {
      result.push({ x: r.x, y: r.y, w: used.x - r.x, h: r.h });
    }
    if (used.x + used.w < r.x + r.w) {
      result.push({
        x: used.x + used.w,
        y: r.y,
        w: r.x + r.w - (used.x + used.w),
        h: r.h,
      });
    }
    if (used.y > r.y) {
      result.push({ x: r.x, y: r.y, w: r.w, h: used.y - r.y });
    }
    if (used.y + used.h < r.y + r.h) {
      result.push({
        x: r.x,
        y: used.y + used.h,
        w: r.w,
        h: r.y + r.h - (used.y + used.h),
      });
    }
  }
  return pruneContained(result);
}

function pruneContained(rects: FreeRect[]): FreeRect[] {
  const keep: boolean[] = rects.map(() => true);
  for (let i = 0; i < rects.length; i++) {
    if (!keep[i]) continue;
    for (let j = 0; j < rects.length; j++) {
      if (i === j || !keep[j]) continue;
      if (contains(rects[j], rects[i])) {
        keep[i] = false;
        break;
      }
    }
  }
  return rects.filter((_, i) => keep[i]);
}

function contains(a: FreeRect, b: FreeRect): boolean {
  return (
    a.x <= b.x + 1e-6 &&
    a.y <= b.y + 1e-6 &&
    a.x + a.w + 1e-6 >= b.x + b.w &&
    a.y + a.h + 1e-6 >= b.y + b.h
  );
}

interface Bin {
  index: number;
  freeRects: FreeRect[];
  usedAreaCm2: number;
}

function makeBin(index: number, sheet: Sheet): Bin {
  return {
    index,
    freeRects: [{ x: 0, y: 0, w: sheet.widthCm, h: sheet.heightCm }],
    usedAreaCm2: 0,
  };
}

/** Record that a panel overflows the sheet even when rotated. */
function recordOverflow(
  overflow: PackResult["overflow"],
  panel: Pick<WorkingPanel, "panelId" | "label" | "widthCm" | "heightCm">,
) {
  overflow.push({
    panelId: panel.panelId,
    label: panel.label,
    widthCm: panel.widthCm,
    heightCm: panel.heightCm,
  });
}

function canFitSheet(
  widthCm: number,
  heightCm: number,
  canRotate: boolean,
  sheet: Sheet,
): boolean {
  const fitsAsIs =
    widthCm <= sheet.widthCm + 1e-6 && heightCm <= sheet.heightCm + 1e-6;
  const fitsRotated =
    canRotate &&
    heightCm <= sheet.widthCm + 1e-6 &&
    widthCm <= sheet.heightCm + 1e-6;
  return fitsAsIs || fitsRotated;
}

/**
 * Tries to place a rectangle into one of the existing bins (or a fresh bin
 * if none fit). Returns the placed position + sheet index, or null on
 * overflow. Updates `bins` in place.
 */
function placeRect(
  bins: Bin[],
  sheet: Sheet,
  widthCm: number,
  heightCm: number,
  canRotate: boolean,
  panelId: string,
  label: string,
  heuristic: PlacementHeuristic,
  engine: PackingEngine = "maxrects",
): { sheetIndex: number; xCm: number; yCm: number; widthCm: number; heightCm: number; rotated: boolean } | null {
  if (!canFitSheet(widthCm, heightCm, canRotate, sheet)) {
    return null;
  }
  const virtualPanel: WorkingPanel = {
    panelId,
    label,
    widthCm,
    heightCm,
    canRotate,
    grainAxis: canRotate ? "any" : "width",
  };
  for (const bin of bins) {
    const best =
      engine === "guillotine-bl"
        ? findGuillotineBLPosition(bin.freeRects, virtualPanel, sheet.kerfCm)
        : findBestPosition(bin.freeRects, virtualPanel, sheet.kerfCm, heuristic);
    if (!best) continue;
    const used = {
      x: best.x,
      y: best.y,
      w: best.w + sheet.kerfCm,
      h: best.h + sheet.kerfCm,
    };
    bin.freeRects =
      engine === "guillotine-bl"
        ? splitFreeRectsGuillotine(bin.freeRects, best.rectIndex, used)
        : splitFreeRects(bin.freeRects, used);
    bin.usedAreaCm2 += best.w * best.h;
    return {
      sheetIndex: bin.index,
      xCm: best.x,
      yCm: best.y,
      widthCm: best.w,
      heightCm: best.h,
      rotated: best.rotated,
    };
  }
  const newBin = makeBin(bins.length, sheet);
  const best =
    engine === "guillotine-bl"
      ? findGuillotineBLPosition(newBin.freeRects, virtualPanel, sheet.kerfCm)
      : findBestPosition(newBin.freeRects, virtualPanel, sheet.kerfCm, heuristic);
  if (!best) return null;
  const used = {
    x: best.x,
    y: best.y,
    w: best.w + sheet.kerfCm,
    h: best.h + sheet.kerfCm,
  };
  newBin.freeRects =
    engine === "guillotine-bl"
      ? splitFreeRectsGuillotine(newBin.freeRects, best.rectIndex, used)
      : splitFreeRects(newBin.freeRects, used);
  newBin.usedAreaCm2 += best.w * best.h;
  bins.push(newBin);
  return {
    sheetIndex: newBin.index,
    xCm: best.x,
    yCm: best.y,
    widthCm: best.w,
    heightCm: best.h,
    rotated: best.rotated,
  };
}

/** Comparator for sorting solo (ungrouped) working panels before placement. */
/** Solo (ungrouped) piece ordering before MaxRects placement. */
export type SoloComparator = (
  a: { panelId: string; widthCm: number; heightCm: number },
  b: { panelId: string; widthCm: number; heightCm: number },
) => number;

/** Default solo comparator — area descending, id asc tie-break. */
const defaultSoloComparator: SoloComparator = (a, b) => {
  const areaDiff = b.widthCm * b.heightCm - a.widthCm * a.heightCm;
  if (areaDiff !== 0) return areaDiff;
  return a.panelId.localeCompare(b.panelId);
};

/** How group strips and solo pieces are sequenced before placement. */
export type PlacementSequence =
  | /** Legacy: all continuity groups (ordered by `groupOrder`), then all solo pieces. */ "groups-then-solo"
  | /**
   * Interleave groups and solo by descending max(strip long side, panel long side),
   * then area — lets small strips and shelves tuck into gaps before another large
   * door strip claims a new sheet (reduces “one door on sheet 2” when sheet 1 still
   * had enough total area).
   */ "mixed-long-side";

export interface PackPanelsOptions {
  /** Override the solo-piece ordering heuristic (group placement unaffected). */
  soloComparator?: SoloComparator;
  /** MaxRects placement heuristic (default: `bssf`). */
  placement?: PlacementHeuristic;
  /**
   * Order in which continuity groups are placed. Does not change grain or
   * adjacency inside a group — only sequencing of whole strips on the sheet.
   */
  groupOrder?: GroupOrderStrategy;
  /**
   * Whether to place all groups before any solo piece, or mix them by size so
   * leftover space on the first sheet is used before opening another board.
   * @default "groups-then-solo"
   */
  placementSequence?: PlacementSequence;
  /**
   * `maxrects` (default) or guillotine bottom-left. The optimizer tries both for
   * wardrobe / kitchen sheet layouts.
   */
  packingEngine?: PackingEngine;
}

type PlacementUnit =
  | { type: "group"; key: string; pieces: WorkingPanel[] }
  | { type: "solo"; panel: WorkingPanel };

function splitWorkingIntoGroupMapAndSolo(working: WorkingPanel[]): {
  groupMap: Map<string, WorkingPanel[]>;
  solo: WorkingPanel[];
} {
  const groupMap = new Map<string, WorkingPanel[]>();
  const solo: WorkingPanel[] = [];
  for (const wp of working) {
    if (wp.groupKey) {
      const list = groupMap.get(wp.groupKey) ?? [];
      list.push(wp);
      groupMap.set(wp.groupKey, list);
    } else {
      solo.push(wp);
    }
  }
  return { groupMap, solo };
}

function buildPlacementUnits(
  working: WorkingPanel[],
  sheet: Sheet,
  options: {
    sequence: PlacementSequence;
    groupOrder: GroupOrderStrategy;
    soloComparator: SoloComparator;
  },
): PlacementUnit[] {
  const { groupMap, solo } = splitWorkingIntoGroupMapAndSolo(working);
  const groupEntries = [...groupMap.entries()];
  groupEntries.sort((a, b) => compareGroupEntries(a, b, sheet, options.groupOrder));

  if (options.sequence === "groups-then-solo") {
    const units: PlacementUnit[] = [];
    for (const [key, pieces] of groupEntries) {
      units.push({ type: "group", key, pieces });
    }
    const soloSorted = [...solo].sort((a, b) => {
      const primary = options.soloComparator(a, b);
      if (primary !== 0) return primary;
      return a.panelId.localeCompare(b.panelId);
    });
    for (const panel of soloSorted) {
      units.push({ type: "solo", panel });
    }
    return units;
  }

  // mixed-long-side: one unit per group + one per solo, globally sorted.
  const units: PlacementUnit[] = [];
  for (const [key, pieces] of groupEntries) {
    units.push({ type: "group", key, pieces });
  }
  for (const panel of solo) {
    units.push({ type: "solo", panel });
  }

  function unitLongSideAndArea(u: PlacementUnit): { longSide: number; area: number; tie: string } {
    if (u.type === "solo") {
      const { widthCm: w, heightCm: h } = u.panel;
      return {
        longSide: Math.max(w, h),
        area: w * h,
        tie: u.panel.panelId,
      };
    }
    const sorted = sortGroupPieces(u.pieces);
    const { stripW, stripH } = stripDimensionsFromSorted(sorted, sheet);
    return {
      longSide: Math.max(stripW, stripH),
      area: sumArea(u.pieces),
      tie: u.key,
    };
  }

  units.sort((a, b) => {
    const sa = unitLongSideAndArea(a);
    const sb = unitLongSideAndArea(b);
    if (sb.longSide !== sa.longSide) return sb.longSide - sa.longSide;
    if (sb.area !== sa.area) return sb.area - sa.area;
    if (a.type === "solo" && b.type === "solo") {
      const c = options.soloComparator(a.panel, b.panel);
      if (c !== 0) return c;
    }
    return sa.tie.localeCompare(sb.tie);
  });

  return units;
}

function executePlacementUnits(
  units: PlacementUnit[],
  sheet: Sheet,
  placement: PlacementHeuristic,
  packingEngine: PackingEngine,
): PackResult {
  const bins: Bin[] = [];
  const placements: Placement[] = [];
  const overflow: PackResult["overflow"] = [];
  const continuityGroupBreaks: string[] = [];

  for (const unit of units) {
    if (unit.type === "group") {
      placeGroup(
        unit.pieces,
        sheet,
        bins,
        placements,
        overflow,
        continuityGroupBreaks,
        placement,
        packingEngine,
      );
      continue;
    }

    const panel = unit.panel;
    const placed = placeRect(
      bins,
      sheet,
      panel.widthCm,
      panel.heightCm,
      panel.canRotate,
      panel.panelId,
      panel.label,
      placement,
      packingEngine,
    );
    if (!placed) {
      recordOverflow(overflow, panel);
      continue;
    }
    placements.push({
      panelId: panel.panelId,
      label: panel.label,
      sheetIndex: placed.sheetIndex,
      xCm: placed.xCm,
      yCm: placed.yCm,
      widthCm: placed.widthCm,
      heightCm: placed.heightCm,
      rotated: placed.rotated,
    });
  }

  const sheetAreaCm2 = sheet.widthCm * sheet.heightCm;
  const sheets: SheetUsage[] = bins.map((b) => ({
    index: b.index,
    usedAreaCm2: b.usedAreaCm2,
    sheetAreaCm2,
    wasteRatio: sheetAreaCm2 > 0 ? 1 - b.usedAreaCm2 / sheetAreaCm2 : 0,
  }));

  return { placements, sheets, overflow, continuityGroupBreaks };
}

/**
 * Pack a list of panels onto sheets of the given size.
 *
 * Ordering:
 *  - Default (`placementSequence: "groups-then-solo"`): continuity groups first
 *    (largest combined area first by `groupOrder`), then solo pieces
 *    (MaxRects + `soloComparator`).
 *  - `placementSequence: "mixed-long-side"`: interleaves groups and solo by
 *    descending long side / area so interior cuts can fill the first sheet
 *    before a second door strip opens another board.
 *
 * Panels that cannot fit on a sheet even after rotation are returned in
 * `overflow`.
 */
export function packPanels(
  panels: Panel[],
  sheet: Sheet,
  options?: PackPanelsOptions,
): PackResult {
  const working = expandPanels(panels);
  const placement: PlacementHeuristic = options?.placement ?? "bssf";
  const groupOrder: GroupOrderStrategy = options?.groupOrder ?? "sum-area-desc";
  const sequence: PlacementSequence = options?.placementSequence ?? "groups-then-solo";
  const packingEngine: PackingEngine = options?.packingEngine ?? "maxrects";
  const cmp = options?.soloComparator ?? defaultSoloComparator;

  const units = buildPlacementUnits(working, sheet, {
    sequence,
    groupOrder,
    soloComparator: cmp,
  });

  return executePlacementUnits(units, sheet, placement, packingEngine);
}

function sumArea(pieces: WorkingPanel[]): number {
  let a = 0;
  for (const p of pieces) a += p.widthCm * p.heightCm;
  return a;
}

function cloneBins(bins: Bin[]): Bin[] {
  return bins.map((b) => ({
    index: b.index,
    freeRects: b.freeRects.map((r) => ({ ...r })),
    usedAreaCm2: b.usedAreaCm2,
  }));
}

/** Same ordering as legacy `placeGroup` — declared order, then sliding door index, then id. */
function sortGroupPieces(pieces: WorkingPanel[]): WorkingPanel[] {
  return [...pieces].sort((a, b) => {
    const ao = a.groupOrder ?? 0;
    const bo = b.groupOrder ?? 0;
    if (ao !== bo) return ao - bo;
    const na = doorSlidingNumericIndex(a.panelId);
    const nb = doorSlidingNumericIndex(b.panelId);
    if (na !== null && nb !== null && na !== nb) return na - nb;
    if (na !== null && nb === null) return -1;
    if (na === null && nb !== null) return 1;
    return a.panelId.localeCompare(b.panelId);
  });
}

function stripDimensionsFromSorted(
  sorted: WorkingPanel[],
  sheet: Sheet,
): { stripW: number; stripH: number; direction: "width" | "height" } {
  const direction = sorted[0]?.groupDirection ?? "width";
  const k = sheet.kerfCm;
  if (direction === "width") {
    const stripW =
      sorted.reduce((s, p) => s + p.widthCm, 0) + k * Math.max(0, sorted.length - 1);
    const stripH = sorted.reduce((m, p) => Math.max(m, p.heightCm), 0);
    return { stripW, stripH, direction };
  }
  const stripW = sorted.reduce((m, p) => Math.max(m, p.widthCm), 0);
  const stripH =
    sorted.reduce((s, p) => s + p.heightCm, 0) + k * Math.max(0, sorted.length - 1);
  return { stripW, stripH, direction };
}

/** How to order continuity groups before placement. Internal strip order and `group.direction` are unchanged — only which group is placed first varies. */
export type GroupOrderStrategy =
  | "sum-area-desc"
  | "sum-area-asc"
  | "strip-bounds-desc"
  | "strip-bounds-asc"
  | "long-side-desc";

function groupStripBounds(
  pieces: WorkingPanel[],
  sheet: Sheet,
): { stripW: number; stripH: number; stripArea: number; longSide: number } {
  const sorted = sortGroupPieces(pieces);
  const { stripW, stripH } = stripDimensionsFromSorted(sorted, sheet);
  return {
    stripW,
    stripH,
    stripArea: stripW * stripH,
    longSide: Math.max(stripW, stripH),
  };
}

function compareGroupEntries(
  a: [string, WorkingPanel[]],
  b: [string, WorkingPanel[]],
  sheet: Sheet,
  strategy: GroupOrderStrategy,
): number {
  const piecesA = a[1];
  const piecesB = b[1];
  const sumA = sumArea(piecesA);
  const sumB = sumArea(piecesB);
  const boundsA = groupStripBounds(piecesA, sheet);
  const boundsB = groupStripBounds(piecesB, sheet);

  switch (strategy) {
    case "sum-area-desc":
      if (sumA !== sumB) return sumB - sumA;
      break;
    case "sum-area-asc":
      if (sumA !== sumB) return sumA - sumB;
      break;
    case "strip-bounds-desc":
      if (boundsA.stripArea !== boundsB.stripArea) return boundsB.stripArea - boundsA.stripArea;
      break;
    case "strip-bounds-asc":
      if (boundsA.stripArea !== boundsB.stripArea) return boundsA.stripArea - boundsB.stripArea;
      break;
    case "long-side-desc":
      if (boundsA.longSide !== boundsB.longSide) return boundsB.longSide - boundsA.longSide;
      break;
  }
  return a[0].localeCompare(b[0]);
}

/**
 * Places one contiguous strip (already sorted). Mutates `bins` and `placements` on success.
 */
function tryPlaceContiguousStrip(
  sorted: WorkingPanel[],
  sheet: Sheet,
  bins: Bin[],
  placements: Placement[],
  placement: PlacementHeuristic,
  groupKey: string,
  packingEngine: PackingEngine,
): boolean {
  if (sorted.length === 0) return true;
  const { stripW, stripH, direction } = stripDimensionsFromSorted(sorted, sheet);
  const anchor = placeRect(
    bins,
    sheet,
    stripW,
    stripH,
    false,
    `${groupKey}:strip`,
    `${groupKey} (group)`,
    placement,
    packingEngine,
  );
  if (!anchor) return false;
  const k = sheet.kerfCm;
  let cursor = 0;
  for (const piece of sorted) {
    const xCm = direction === "width" ? anchor.xCm + cursor : anchor.xCm;
    const yCm = direction === "height" ? anchor.yCm + cursor : anchor.yCm;
    placements.push({
      panelId: piece.panelId,
      label: piece.label,
      sheetIndex: anchor.sheetIndex,
      xCm,
      yCm,
      widthCm: piece.widthCm,
      heightCm: piece.heightCm,
      rotated: false,
    });
    cursor += (direction === "width" ? piece.widthCm : piece.heightCm) + k;
  }
  return true;
}

/**
 * Places a continuity group as one or more contiguous strips. Tries the full
 * strip first, then binary splits along the declared order, then solo fallback.
 */
function placeGroup(
  pieces: WorkingPanel[],
  sheet: Sheet,
  bins: Bin[],
  placements: Placement[],
  overflow: PackResult["overflow"],
  continuityGroupBreaks: string[],
  placement: PlacementHeuristic,
  packingEngine: PackingEngine,
) {
  if (pieces.length === 0) return;

  const sorted = sortGroupPieces(pieces);
  const groupKey = sorted[0]!.groupKey ?? "group";

  if (tryPlaceContiguousStrip(sorted, sheet, bins, placements, placement, groupKey, packingEngine)) {
    return;
  }

  if (sorted.length >= 2) {
    for (let split = 1; split < sorted.length; split++) {
      const a = sorted.slice(0, split);
      const b = sorted.slice(split);
      const binsTrial = cloneBins(bins);
      const trialPlacements: Placement[] = [];
      if (
        tryPlaceContiguousStrip(a, sheet, binsTrial, trialPlacements, placement, groupKey, packingEngine) &&
        tryPlaceContiguousStrip(b, sheet, binsTrial, trialPlacements, placement, groupKey, packingEngine)
      ) {
        bins.length = 0;
        bins.push(...binsTrial);
        placements.push(...trialPlacements);
        return;
      }
    }
  }

  continuityGroupBreaks.push(groupKey);

  for (const piece of sorted) {
    const allowRotate = piece.grainAxis === "any" || piece.canRotate;
    const placed = placeRect(
      bins,
      sheet,
      piece.widthCm,
      piece.heightCm,
      allowRotate,
      piece.panelId,
      piece.label,
      placement,
      packingEngine,
    );
    if (!placed) {
      recordOverflow(overflow, piece);
      continue;
    }
    placements.push({
      panelId: piece.panelId,
      label: piece.label,
      sheetIndex: placed.sheetIndex,
      xCm: placed.xCm,
      yCm: placed.yCm,
      widthCm: placed.widthCm,
      heightCm: placed.heightCm,
      rotated: placed.rotated,
    });
  }
}

/**
 * Rank two pack results for {@link packPanelsOptimized}: lower is better on
 * each criterion, in an order that depends on {@link PackOptimizeObjective}.
 *
 * `min-sheets` (default for wardrobe): fewer boards first, then less scrap on
 * those boards — matches shop practice where an extra sheet is worse than
 * leaving usable-looking gaps on fewer boards.
 *
 * `min-waste`: minimize total offcut area first, then sheet count — can prefer
 * an extra thinly-used sheet if it lowers summed waste.
 */
export type PackOptimizeObjective = "min-sheets" | "min-waste";

function scoreResult(r: PackResult): {
  overflow: number;
  sheets: number;
  totalWasteCm2: number;
  continuityBreaks: number;
  /** Smallest used/total ratio among sheets — tie-break for equal waste. */
  minSheetUtil: number;
} {
  let totalWasteCm2 = 0;
  let minSheetUtil = 1;
  for (const s of r.sheets) {
    totalWasteCm2 += Math.max(0, s.sheetAreaCm2 - s.usedAreaCm2);
    const u = s.sheetAreaCm2 > 0 ? s.usedAreaCm2 / s.sheetAreaCm2 : 0;
    minSheetUtil = Math.min(minSheetUtil, u);
  }
  return {
    overflow: r.overflow.length,
    sheets: r.sheets.length,
    totalWasteCm2,
    continuityBreaks: r.continuityGroupBreaks.length,
    minSheetUtil: r.sheets.length === 0 ? 0 : minSheetUtil,
  };
}

function isBetterOptimizedPack(
  candidate: PackResult,
  best: PackResult,
  objective: PackOptimizeObjective,
): boolean {
  const a = scoreResult(candidate);
  const b = scoreResult(best);
  if (a.overflow !== b.overflow) return a.overflow < b.overflow;

  if (objective === "min-sheets") {
    if (a.sheets !== b.sheets) return a.sheets < b.sheets;
    if (Math.abs(a.totalWasteCm2 - b.totalWasteCm2) > 1e-3) {
      return a.totalWasteCm2 < b.totalWasteCm2;
    }
    if (Math.abs(a.minSheetUtil - b.minSheetUtil) > 1e-6) {
      return a.minSheetUtil > b.minSheetUtil;
    }
  } else {
    if (Math.abs(a.totalWasteCm2 - b.totalWasteCm2) > 1e-3) {
      return a.totalWasteCm2 < b.totalWasteCm2;
    }
    if (a.sheets !== b.sheets) return a.sheets < b.sheets;
    if (Math.abs(a.minSheetUtil - b.minSheetUtil) > 1e-6) {
      return a.minSheetUtil > b.minSheetUtil;
    }
  }

  return a.continuityBreaks < b.continuityBreaks;
}

const OPTIMIZE_COMPARATORS: SoloComparator[] = [
  // Area descending (same as the default).
  (a, b) => b.widthCm * b.heightCm - a.widthCm * a.heightCm,
  // Longest side descending — tall narrow strips placed first.
  (a, b) => Math.max(b.widthCm, b.heightCm) - Math.max(a.widthCm, a.heightCm),
  // Shortest side descending — squarer pieces first, leaves long off-cuts.
  (a, b) => Math.min(b.widthCm, b.heightCm) - Math.min(a.widthCm, a.heightCm),
  // Perimeter descending.
  (a, b) => b.widthCm + b.heightCm - (a.widthCm + a.heightCm),
  // Height descending — wins when sheet grain runs vertical and tall pieces dominate.
  (a, b) => b.heightCm - a.heightCm,
  // Width descending — wins when horizontally-grained strips dominate.
  (a, b) => b.widthCm - a.widthCm,
  // Aspect ratio (long/short) descending — elongated pieces first.
  (a, b) => {
    const ra =
      Math.max(a.widthCm, a.heightCm) / Math.max(1e-9, Math.min(a.widthCm, a.heightCm));
    const rb =
      Math.max(b.widthCm, b.heightCm) / Math.max(1e-9, Math.min(b.widthCm, b.heightCm));
    return rb - ra;
  },
  // |width − height| descending — separates oblongs from near-squares.
  (a, b) =>
    Math.abs(b.widthCm - b.heightCm) - Math.abs(a.widthCm - a.heightCm),
  // Area ascending — small pieces first; helps fill gaps left by MaxRects.
  (a, b) => a.widthCm * a.heightCm - b.widthCm * b.heightCm,
  // Width ascending — alternates row packing vs area-desc defaults.
  (a, b) => a.widthCm - b.widthCm,
  // Height ascending.
  (a, b) => a.heightCm - b.heightCm,
];

const OPTIMIZE_PLACEMENTS: PlacementHeuristic[] = ["bssf", "blsf", "baf", "bl"];

/** Wardrobe-style layouts have several continuity strips; placement order affects leftovers for solo pieces. */
const OPTIMIZE_GROUP_ORDERS: GroupOrderStrategy[] = [
  "sum-area-desc",
  "sum-area-asc",
  "strip-bounds-desc",
  "strip-bounds-asc",
  "long-side-desc",
];

const OPTIMIZE_PLACEMENT_SEQUENCES: PlacementSequence[] = ["groups-then-solo", "mixed-long-side"];

const OPTIMIZE_PACKING_ENGINES: PackingEngine[] = ["maxrects", "guillotine-bl"];

/** Remap packer output from a W/H-swapped sheet back to catalog (viewer / UV) axes. */
function normalizePackResultToCanonicalSheet(
  result: PackResult,
  sheetUsed: Sheet,
  canonicalSheet: Sheet,
): PackResult {
  if (
    Math.abs(sheetUsed.widthCm - canonicalSheet.widthCm) < 1e-6 &&
    Math.abs(sheetUsed.heightCm - canonicalSheet.heightCm) < 1e-6
  ) {
    return result;
  }
  const canonArea = canonicalSheet.widthCm * canonicalSheet.heightCm;
  const placements = result.placements.map((p) => ({
    ...p,
    xCm: p.yCm,
    yCm: p.xCm,
    widthCm: p.heightCm,
    heightCm: p.widthCm,
    rotated: !p.rotated,
  }));
  const sheets = result.sheets.map((s) => ({
    ...s,
    sheetAreaCm2: canonArea,
    wasteRatio: canonArea > 0 ? 1 - s.usedAreaCm2 / canonArea : 1,
  }));
  return { ...result, placements, sheets };
}

function clonePanelsWithoutContinuityGroups(panels: Panel[]): Panel[] {
  return panels.map((p) => ({ ...p, group: undefined }));
}

/**
 * Runs `packPanels` with every combination of sheet instance (optional W/H swap),
 * packing engine (MaxRects vs guillotine BL), placement sequence, group order,
 * solo-ordering heuristic, and placement heuristic. Wardrobe enables axis swap
 * only when material grain is omnidirectional. Up to 2 × 2 × 2 × 5 × 9 × 4 packs.
 *
 * Why this beats a single heuristic: MaxRects-BSSF alone is quite sensitive
 * to piece order and the choice of leftover-side metric. Pairing different
 * orderings with different placement rules explores a much wider layout
 * space and reliably pushes sheet utilization from ~45-60% up into the
 * 75-90% range for typical wardrobe cut-lists. Varying **group** order
 * further reduces waste when many strips compete with loose interior panels.
 *
 * By default {@link PackPanelsOptimizedOptions.optimizeObjective} is
 * `min-sheets` so layouts that fit on fewer boards win even if total offcuts
 * are larger (closer to manual nesting).
 */
export interface PackPanelsOptimizedOptions {
  /**
   * When set, combined with each optimize comparator. If
   * {@link soloComparatorIsTieBreakOnly} is true, packing heuristics sort
   * solo pieces first and this comparator breaks ties only (recommended for
   * wardrobe — otherwise a strict front-elevation order silences the 9 runs).
   */
  soloComparator?: SoloComparator;
  /** When true with `soloComparator`, heuristic order wins; base is tie-break. */
  soloComparatorIsTieBreakOnly?: boolean;
  /** Defaults to `min-sheets` (fewer boards first). */
  optimizeObjective?: PackOptimizeObjective;
  /**
   * When true (default), also nest on sheet height×width and remap coordinates
   * back to catalog W×H — often cuts waste on wide boards with tall parts.
   * Pass false to nest only in catalog orientation.
   */
  trySwapSheetAxes?: boolean;
  /**
   * When true (default), also try packing with continuity groups dissolved so
   * doors/drawer fronts may separate on the sheet for better yield (grain
   * continuity across those fronts is no longer guaranteed on the board).
   */
  tryDissolveContinuityGroups?: boolean;
}

export function packPanelsOptimized(
  panels: Panel[],
  sheet: Sheet,
  options?: PackPanelsOptimizedOptions,
): PackResult {
  const objective: PackOptimizeObjective = options?.optimizeObjective ?? "min-sheets";
  const baseSolo = options?.soloComparator;
  const tieBreakOnly = options?.soloComparatorIsTieBreakOnly === true;
  const trySwap = options?.trySwapSheetAxes !== false;
  const tryDissolve = options?.tryDissolveContinuityGroups !== false;
  const sheetVariants: Sheet[] = [sheet];
  if (trySwap && Math.abs(sheet.widthCm - sheet.heightCm) > 1e-6) {
    sheetVariants.push({ ...sheet, widthCm: sheet.heightCm, heightCm: sheet.widthCm });
  }

  const panelVariants: Panel[][] = [panels];
  if (tryDissolve && panels.some((p) => p.group !== undefined)) {
    panelVariants.push(clonePanelsWithoutContinuityGroups(panels));
  }

  let best: PackResult | null = null;
  for (const panelSet of panelVariants) {
    for (const sheetInst of sheetVariants) {
      for (const packingEngine of OPTIMIZE_PACKING_ENGINES) {
        for (const placementSequence of OPTIMIZE_PLACEMENT_SEQUENCES) {
          for (const groupOrder of OPTIMIZE_GROUP_ORDERS) {
            for (const cmp of OPTIMIZE_COMPARATORS) {
              const combined: SoloComparator =
                baseSolo && tieBreakOnly
                  ? (a, b) => {
                      const h = cmp(a, b);
                      if (h !== 0) return h;
                      return baseSolo(a, b);
                    }
                  : baseSolo
                    ? (a, b) => {
                        const primary = baseSolo(a, b);
                        if (primary !== 0) return primary;
                        return cmp(a, b);
                      }
                    : cmp;
              for (const placement of OPTIMIZE_PLACEMENTS) {
                const rRaw = packPanels(panelSet, sheetInst, {
                  soloComparator: combined,
                  placement,
                  groupOrder,
                  placementSequence,
                  packingEngine,
                });
                const r = normalizePackResultToCanonicalSheet(rRaw, sheetInst, sheet);
                if (best === null || isBetterOptimizedPack(r, best, objective)) {
                  best = r;
                }
              }
            }
          }
        }
      }
    }
  }
  return best!;
}

/**
 * Utility: given a material's grain direction (sheet axis) and a panel's
 * desired grain direction on the panel itself, returns the constraint the
 * packer should use. Materials with `grainDirection: "none"` always yield
 * `"any"` (freely rotatable). When both are defined and match, the panel
 * is "upright"; when they disagree, the packer forces a 90° rotation by
 * swapping the panel's width/height before submission.
 */
export function resolvePanelGrainAxis(
  materialGrain: "along_width" | "along_height" | "none",
  panelPrefersAlongWidth: boolean,
): { axis: PanelGrainAxis; swapDimensions: boolean } {
  if (materialGrain === "none") return { axis: "any", swapDimensions: false };
  if (panelPrefersAlongWidth) {
    return {
      axis: "width",
      swapDimensions: materialGrain === "along_height",
    };
  }
  return {
    axis: "height",
    swapDimensions: materialGrain === "along_width",
  };
}
