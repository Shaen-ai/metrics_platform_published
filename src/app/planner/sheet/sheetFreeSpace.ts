import type { Placement } from "./panelPacker";

export type SheetFreeRect = { x: number; y: number; w: number; h: number };

const EPS = 1e-6;

function clipRectToSheet(
  r: SheetFreeRect,
  sheetW: number,
  sheetH: number,
): SheetFreeRect | null {
  const x1 = Math.max(0, r.x);
  const y1 = Math.max(0, r.y);
  const x2 = Math.min(sheetW, r.x + r.w);
  const y2 = Math.min(sheetH, r.y + r.h);
  const w = x2 - x1;
  const h = y2 - y1;
  if (w <= EPS || h <= EPS) return null;
  return { x: x1, y: y1, w, h };
}

/** Same expansion as manual drag obstacles — kerf margin around each cut. */
export function placementObstacleRect(
  p: Pick<Placement, "xCm" | "yCm" | "widthCm" | "heightCm">,
  kerfCm: number,
): SheetFreeRect {
  const k = Math.max(0, kerfCm);
  return {
    x: p.xCm - k,
    y: p.yCm - k,
    w: p.widthCm + 2 * k,
    h: p.heightCm + 2 * k,
  };
}

function contains(a: SheetFreeRect, b: SheetFreeRect): boolean {
  return (
    a.x <= b.x + EPS &&
    a.y <= b.y + EPS &&
    a.x + a.w + EPS >= b.x + b.w &&
    a.y + a.h + EPS >= b.y + b.h
  );
}

function pruneContained(rects: SheetFreeRect[]): SheetFreeRect[] {
  const keep = rects.map(() => true);
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

/** MaxRects-style split: remove `used` from one free rectangle, return remaining pieces. */
function splitOneFreeByUsed(free: SheetFreeRect, used: SheetFreeRect): SheetFreeRect[] {
  const overlaps =
    used.x < free.x + free.w &&
    used.x + used.w > free.x &&
    used.y < free.y + free.h &&
    used.y + used.h > free.y;
  if (!overlaps) return [free];

  const out: SheetFreeRect[] = [];
  if (used.x > free.x + EPS) {
    out.push({ x: free.x, y: free.y, w: used.x - free.x, h: free.h });
  }
  if (used.x + used.w < free.x + free.w - EPS) {
    out.push({
      x: used.x + used.w,
      y: free.y,
      w: free.x + free.w - (used.x + used.w),
      h: free.h,
    });
  }
  if (used.y > free.y + EPS) {
    out.push({ x: free.x, y: free.y, w: free.w, h: used.y - free.y });
  }
  if (used.y + used.h < free.y + free.h - EPS) {
    out.push({
      x: free.x,
      y: used.y + used.h,
      w: free.w,
      h: free.y + free.h - (used.y + used.h),
    });
  }
  return out.filter((r) => r.w > EPS && r.h > EPS);
}

function subtractObstacleFromFreeList(
  freeList: SheetFreeRect[],
  obstacle: SheetFreeRect,
): SheetFreeRect[] {
  const next: SheetFreeRect[] = [];
  for (const f of freeList) {
    next.push(...splitOneFreeByUsed(f, obstacle));
  }
  return pruneContained(next);
}

/**
 * Axis-aligned free rectangles on the sheet after subtracting kerf-expanded
 * cut obstacles (same model as manual drag). Rects partition remaining area;
 * they can be used for click-hit-testing and dimension labels.
 */
export function computeSheetFreeRects(
  sheetW: number,
  sheetH: number,
  placementsOnSheet: readonly Placement[],
  kerfCm: number,
  minSideCm = 0.5,
): SheetFreeRect[] {
  let free: SheetFreeRect[] = [{ x: 0, y: 0, w: sheetW, h: sheetH }];
  for (const p of placementsOnSheet) {
    const raw = placementObstacleRect(p, kerfCm);
    const clipped = clipRectToSheet(raw, sheetW, sheetH);
    if (!clipped) continue;
    free = subtractObstacleFromFreeList(free, clipped);
  }
  const min = Math.max(0, minSideCm);
  return free.filter((r) => r.w >= min - EPS && r.h >= min - EPS);
}

/** Smallest-area free rect containing (px, py), or null (inside a cut / margin). */
export function freeRectHitTest(
  rects: readonly SheetFreeRect[],
  px: number,
  py: number,
): SheetFreeRect | null {
  let best: SheetFreeRect | null = null;
  let bestArea = Infinity;
  for (const r of rects) {
    if (px + EPS < r.x || px > r.x + r.w + EPS || py + EPS < r.y || py > r.y + r.h + EPS) {
      continue;
    }
    const a = r.w * r.h;
    if (a < bestArea - EPS) {
      bestArea = a;
      best = r;
    }
  }
  return best;
}

export function formatCm(n: number): string {
  return n % 1 === 0 ? n.toFixed(0) : n.toFixed(1);
}
