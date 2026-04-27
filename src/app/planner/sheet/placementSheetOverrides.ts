import type { Placement } from "./panelPacker";

/** Sheet alignment / snap step used by the viewer grid and drag-end snap. */
export const SHEET_LAYOUT_GRID_CM = 5;

/** Manual adjustments from the sheet layout viewer (cm / optional 90° preview). */
export type SheetPlacementOverride = {
  dx?: number;
  dy?: number;
  rot90?: boolean;
  /**
   * When set, this cut is shown on this sheet index (0-based) instead of the
   * packer’s sheet — same texture board size; position stays the merged x/y.
   */
  assignSheetIndex?: number;
};

export function sheetPlacementOverrideKey(
  materialId: string,
  sheetIndex: number,
  panelId: string,
): string {
  return `${materialId}|${sheetIndex}|${panelId}`;
}

/**
 * Applies user sheet overrides onto a packer placement (position + optional 90° size swap).
 */
export function mergePlacementWithOverride(
  p: Placement,
  o?: SheetPlacementOverride | null,
): Placement {
  if (!o) return p;
  const hasRot = o.rot90 === true;
  const hasSheetReassign =
    o.assignSheetIndex !== undefined && o.assignSheetIndex !== p.sheetIndex;
  if (
    !hasRot &&
    (o.dx === undefined || o.dx === 0) &&
    (o.dy === undefined || o.dy === 0) &&
    !hasSheetReassign
  ) {
    return p;
  }
  let w = p.widthCm;
  let h = p.heightCm;
  let rotated = p.rotated;
  if (hasRot) {
    const t = w;
    w = h;
    h = t;
    rotated = !rotated;
  }
  const out: Placement = {
    ...p,
    xCm: p.xCm + (o.dx ?? 0),
    yCm: p.yCm + (o.dy ?? 0),
    widthCm: w,
    heightCm: h,
    rotated,
  };
  if (o.assignSheetIndex !== undefined) {
    out.sheetIndex = o.assignSheetIndex;
  }
  return out;
}

/**
 * Keeps overrides inside the sheet bounds (for interaction clamping).
 */
export function clampPlacementOverrideToSheet(
  p: Placement,
  o: SheetPlacementOverride,
  sheetW: number,
  sheetH: number,
): { dx: number; dy: number; rot90?: boolean } {
  const dxIn = o.dx ?? 0;
  const dyIn = o.dy ?? 0;
  const hasRot = o.rot90 === true;
  let w = p.widthCm;
  let h = p.heightCm;
  if (hasRot) {
    const t = w;
    w = h;
    h = t;
  }
  let x = p.xCm + dxIn;
  let y = p.yCm + dyIn;
  const xMax = Math.max(0, sheetW - w);
  const yMax = Math.max(0, sheetH - h);
  x = Math.min(Math.max(x, 0), xMax);
  y = Math.min(Math.max(y, 0), yMax);
  const out: { dx: number; dy: number; rot90?: boolean } = {
    dx: x - p.xCm,
    dy: y - p.yCm,
  };
  if (hasRot) out.rot90 = true;
  return out;
}

const NO_OVERLAP_SEP_CM = 1e-5;

function rectsOverlapForNoOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  const s = NO_OVERLAP_SEP_CM;
  if (a.x + a.w <= b.x + s || b.x + b.w <= a.x + s) return false;
  if (a.y + a.h <= b.y + s || b.y + b.h <= a.y + s) return false;
  return true;
}

/** Expands a cut rect by `kerf` on each side — matches “no closer than kerf between cuts”. */
function inflateCutRect(
  r: { x: number; y: number; w: number; h: number },
  kerfCm: number,
): { x: number; y: number; w: number; h: number } {
  const k = Math.max(0, kerfCm);
  return {
    x: r.x - k,
    y: r.y - k,
    w: r.w + 2 * k,
    h: r.h + 2 * k,
  };
}

/** Push `r` out of obstacle’s **no-go** rect (already inflated by kerf) along the shorter penetration axis. */
function separateRectFromObstacle(
  r: { x: number; y: number; w: number; h: number },
  o: { x: number; y: number; w: number; h: number },
): boolean {
  const s = NO_OVERLAP_SEP_CM;
  if (r.x + r.w <= o.x + s || o.x + o.w <= r.x + s) return false;
  if (r.y + r.h <= o.y + s || o.y + o.h <= r.y + s) return false;
  const overlapX = Math.min(r.x + r.w - o.x, o.x + o.w - r.x);
  const overlapY = Math.min(r.y + r.h - o.y, o.y + o.h - r.y);
  if (overlapX <= s || overlapY <= s) return false;
  if (overlapX < overlapY) {
    if (r.x + r.w / 2 < o.x + o.w / 2) r.x -= overlapX;
    else r.x += overlapX;
  } else {
    if (r.y + r.h / 2 < o.y + o.h / 2) r.y -= overlapY;
    else r.y += overlapY;
  }
  return true;
}

/**
 * Clamps to the sheet, then resolves overlaps with fixed obstacles so manual
 * drags cannot stack pieces on top of each other.
 *
 * @param kerfCm — Blade kerf between adjacent cuts (same as {@link Sheet.kerfCm} in the packer).
 *   Obstacles are expanded by this amount so cut lines stay at least `kerfCm` apart.
 */
export function constrainPlacementOverrideNoOverlap(
  baseP: Placement,
  o: SheetPlacementOverride,
  sheetW: number,
  sheetH: number,
  obstacles: readonly { x: number; y: number; w: number; h: number }[],
  kerfCm: number,
): SheetPlacementOverride {
  let cur: SheetPlacementOverride = {
    ...clampPlacementOverrideToSheet(baseP, o, sheetW, sheetH),
  };
  if (o.rot90 === true) cur.rot90 = true;
  if (o.assignSheetIndex !== undefined) cur.assignSheetIndex = o.assignSheetIndex;

  if (obstacles.length === 0) return cur;

  const k = Math.max(0, kerfCm);

  for (let iter = 0; iter < 80; iter++) {
    const merged = mergePlacementWithOverride(baseP, cur);
    const r = {
      x: merged.xCm,
      y: merged.yCm,
      w: merged.widthCm,
      h: merged.heightCm,
    };
    let changed = false;
    for (const ob of obstacles) {
      const noGo = inflateCutRect(ob, k);
      if (separateRectFromObstacle(r, noGo)) changed = true;
    }
    r.x = Math.min(Math.max(r.x, 0), Math.max(0, sheetW - r.w));
    r.y = Math.min(Math.max(r.y, 0), Math.max(0, sheetH - r.h));

    cur = {
      dx: r.x - baseP.xCm,
      dy: r.y - baseP.yCm,
    };
    if (o.rot90 === true) cur.rot90 = true;
    if (o.assignSheetIndex !== undefined) cur.assignSheetIndex = o.assignSheetIndex;

    const reclamped = clampPlacementOverrideToSheet(baseP, cur, sheetW, sheetH);
    cur = { ...reclamped };
    if (o.rot90 === true) cur.rot90 = true;
    if (o.assignSheetIndex !== undefined) cur.assignSheetIndex = o.assignSheetIndex;

    const check = mergePlacementWithOverride(baseP, cur);
    const box = {
      x: check.xCm,
      y: check.yCm,
      w: check.widthCm,
      h: check.heightCm,
    };
    let anyOverlap = false;
    for (const ob of obstacles) {
      if (rectsOverlapForNoOverlap(box, inflateCutRect(ob, k))) {
        anyOverlap = true;
        break;
      }
    }
    if (!anyOverlap) break;
    if (!changed) break;
  }

  return cur;
}

/**
 * Snaps the current merged position to the 5 cm grid and returns overrides
 * relative to the packer placement (clamped to the sheet). Preserves rot90.
 */
export function snapPlacementOverridesToGrid(
  baseP: Placement,
  o: SheetPlacementOverride | undefined | null,
  sheetW: number,
  sheetH: number,
): SheetPlacementOverride {
  const merged = mergePlacementWithOverride(baseP, o);
  let nx =
    Math.round(merged.xCm / SHEET_LAYOUT_GRID_CM) * SHEET_LAYOUT_GRID_CM;
  let ny =
    Math.round(merged.yCm / SHEET_LAYOUT_GRID_CM) * SHEET_LAYOUT_GRID_CM;
  const w = merged.widthCm;
  const h = merged.heightCm;
  const xMax = Math.max(0, sheetW - w);
  const yMax = Math.max(0, sheetH - h);
  nx = Math.min(Math.max(nx, 0), xMax);
  ny = Math.min(Math.max(ny, 0), yMax);

  const candidate: SheetPlacementOverride = {
    dx: nx - baseP.xCm,
    dy: ny - baseP.yCm,
  };
  if (o?.rot90 === true) candidate.rot90 = true;
  if (o?.assignSheetIndex !== undefined) candidate.assignSheetIndex = o.assignSheetIndex;
  const clamped = clampPlacementOverrideToSheet(baseP, candidate, sheetW, sheetH);
  const out: SheetPlacementOverride = { ...clamped };
  if (o?.assignSheetIndex !== undefined) out.assignSheetIndex = o.assignSheetIndex;
  return out;
}
