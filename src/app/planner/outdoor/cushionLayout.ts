import type { OutdoorCushionConfig } from "./types";

/**
 * Sitting surface is usually narrower than the mesh bbox (armrests / sides).
 * Wide shallow pieces (benches) use a smaller inset so pads still span the bench.
 */
export function seatPanWidthFromMeshDims(meshWM: number, meshDM: number): number {
  const w = meshWM;
  const d = meshDM;
  if (!(w > 0.15)) return Math.max(0.12, w * 0.85);
  const ratio = d > 0.01 ? w / d : 1.5;
  const insetFrac = ratio >= 1.85 ? 0.04 : ratio >= 1.4 ? 0.075 : 0.11;
  const inset = Math.min(Math.max(w * insetFrac, 0.05), w * 0.24);
  return Math.max(0.18, w - 2 * inset);
}

export interface WidthCenter {
  widthM: number;
  centerXM: number;
}

/** Row specs along local X (centered on 0); total width should not exceed totalWidthM badly */
export function seatSegmentsCenters(
  cfg: OutdoorCushionConfig,
  totalWidthM: number,
): WidthCenter[] {
  const gap = Math.max(0, cfg.gapBetweenSegmentsM);
  if (cfg.seatLayout === "continuous") {
    const w = cfg.seatSegmentWidthsM[0] ?? totalWidthM;
    return [{ widthM: Math.min(w, totalWidthM), centerXM: 0 }];
  }
  const raw = cfg.seatSegmentWidthsM.filter((x) => x > 0);
  if (raw.length === 0) {
    return [{ widthM: totalWidthM, centerXM: 0 }];
  }
  const n = raw.length;
  const totalGaps = n > 1 ? (n - 1) * gap : 0;
  const sum = raw.reduce((a, b) => a + b, 0);
  const used = sum + totalGaps;
  const scale = used > totalWidthM && used > 0 ? totalWidthM / used : 1;
  const widths = raw.map((w) => w * scale);
  const g = gap * scale;
  const block = widths.reduce((a, b) => a + b, 0) + (n > 1 ? (n - 1) * g : 0);
  let x0 = -block / 2;
  const out: WidthCenter[] = [];
  for (let i = 0; i < widths.length; i++) {
    const wi = widths[i];
    x0 += wi / 2;
    out.push({ widthM: wi, centerXM: x0 });
    x0 += wi / 2;
    if (i < widths.length - 1) x0 += g;
  }
  return out;
}

export function backColumnCenters(
  cfg: OutdoorCushionConfig,
  totalWidthM: number,
  seatSpecs: WidthCenter[],
): WidthCenter[] {
  if (cfg.backMode === "single") {
    return [{ widthM: totalWidthM, centerXM: 0 }];
  }
  if (seatSpecs.length > 1) {
    return seatSpecs.map((s) => ({ widthM: s.widthM, centerXM: s.centerXM }));
  }
  const nCol = Math.max(2, cfg.backMaterialIds.length || 3);
  const w = totalWidthM / nCol;
  const out: WidthCenter[] = [];
  let x0 = -totalWidthM / 2;
  for (let i = 0; i < nCol; i++) {
    x0 += w / 2;
    out.push({ widthM: w, centerXM: x0 });
    x0 += w / 2;
  }
  return out;
}

export function pickMaterialId(ids: string[], index: number, fallback: string): string {
  if (ids.length === 0) return fallback;
  if (ids.length === 1) return ids[0];
  return ids[index] ?? ids[ids.length - 1] ?? ids[0];
}

export function equalSegmentWidths(totalWidthM: number, segmentCount: number, gapM: number): number[] {
  const n = Math.max(1, Math.floor(segmentCount));
  const gap = Math.max(0, gapM);
  const totalGaps = n > 1 ? (n - 1) * gap : 0;
  const w = (totalWidthM - totalGaps) / n;
  const slice = Math.max(0.02, w);
  return Array.from({ length: n }, () => slice);
}
