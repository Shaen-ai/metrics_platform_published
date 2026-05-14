/**
 * Pure layout helpers for procedural outdoor cushions — reusable across chair/bench GLBs.
 * All lengths are meters in the same space as the fitted mesh footprint (W×D×H).
 */

export interface ChairFootprintM {
  widthM: number;
  depthM: number;
  heightM: number;
}

/** Scales catalog thickness toward realistic proportions for very small/large pieces. */
export function thicknessScaleFromFootprint(fp: ChairFootprintM): number {
  const ref = 0.55;
  const span = Math.min(fp.widthM, fp.depthM);
  return Math.min(1.18, Math.max(0.82, span / ref));
}

export function scaleThicknessM(baseThicknessM: number, fp: ChairFootprintM): number {
  return Math.max(0.02, baseThicknessM * thicknessScaleFromFootprint(fp));
}

/** Shared horizontal inset so seat and back keep the same visible span. */
export function cushionHorizontalInsetM(fp: ChairFootprintM): number {
  return Math.min(0.014, Math.max(0.004, Math.min(fp.widthM, fp.depthM) * 0.02));
}

export function pairedCushionWidthM(segmentWidthM: number, fp: ChairFootprintM): number {
  const inset = cushionHorizontalInsetM(fp);
  return Math.max(0.02, segmentWidthM - 2 * inset);
}

/** Outer X span of seat pads (for one full-width back aligned to segmented seats). */
export function seatCushionsOuterSpanXM(seatSpecs: { widthM: number; centerXM: number }[], fp: ChairFootprintM): number {
  if (seatSpecs.length === 0) return 0.02;
  const l = seatSpecs[0].centerXM - pairedCushionWidthM(seatSpecs[0].widthM, fp) / 2;
  const r =
    seatSpecs[seatSpecs.length - 1].centerXM +
    pairedCushionWidthM(seatSpecs[seatSpecs.length - 1].widthM, fp) / 2;
  return Math.max(0.02, r - l);
}

export function roundedCushionRadiusM(widthM: number, heightM: number, depthM: number): number {
  const m = Math.min(widthM, heightM, depthM);
  return Math.min(0.022, Math.max(0.0035, m * 0.11));
}

/** Push seat/back meeting line toward the wood corner (rear, −Z) so foam sits in the frame joint. */
export const OUTDOOR_SEAT_BACK_WOOD_MEET_SHIFT_M = 0.15;

/**
 * Extra seat-pad length toward the rear / seat–back corner (−Z), front edge fixed (back pad position unchanged).
 */
export const OUTDOOR_SEAT_EXTEND_TO_CORNER_M = 0.03;

/** Pull whole back pad toward seat (+Z) so the front face sits at wood plane instead of inside the frame. */
export const OUTDOOR_BACK_FLUSH_WOOD_FORWARD_M = 0.1;

/**
 * Extra forward (+Z) at the top vs bottom along the pad height (mesh shear z += k·y), meters.
 * Keeps parent leanRad unchanged.
 */
export const OUTDOOR_BACK_TOP_SHEAR_EXTRA_Z_M = 0.1;

/**
 * Back-pad height trim (m): keep top below arm / handle line so foam does not sit inside grips.
 * Also caps vs chair height in {@link outdoorBackClampHeightForHandlesM}.
 */
export const OUTDOOR_BACK_HANDLE_HEIGHT_TRIM_M = 0.055;

/** Extra inset on the outer handle-side edges of the back pad only (m). */
export const OUTDOOR_BACK_HANDLE_SIDE_INSET_M = 0.025;

/** Max fraction of mesh tallness used for procedural back height (handles / arms). */
export const OUTDOOR_BACK_MAX_H_FRAC_OF_CHAIR = 0.34;

/** Extra height on the back (upper) cushion vs handle-trimmed baseline (m). */
export const OUTDOOR_BACK_EXTRA_HEIGHT_M = 0.08;

export function outdoorBackClampHeightForHandlesM(backHeightM: number, chairHeightM: number): number {
  const cap = chairHeightM * OUTDOOR_BACK_MAX_H_FRAC_OF_CHAIR + OUTDOOR_BACK_EXTRA_HEIGHT_M;
  const trimmed = backHeightM - OUTDOOR_BACK_HANDLE_HEIGHT_TRIM_M;
  return Math.max(0.11, Math.min(trimmed + OUTDOOR_BACK_EXTRA_HEIGHT_M, cap));
}

/** Tighter fillet on back pads so corners read closer to rectilinear wood rails. */
export function outdoorBackCushionRadiusM(widthM: number, heightM: number, depthM: number): number {
  const loose = roundedCushionRadiusM(widthM, heightM, depthM);
  return Math.min(0.012, Math.max(0.0025, loose * 0.5));
}

/** Seat pad depth along Z — proportional to chair depth. */
export function outdoorSeatDepthM(depthM: number): number {
  return Math.max(0.08, depthM * 0.52);
}

/** Seat center Z (forward of origin) so pads sit on the pan, not under the front rail. */
export function outdoorSeatPanCenterZM(depthM: number): number {
  return depthM * 0.11;
}

/** Small foam gap / soft joint at the seat–back seam (not z-fighting). */
export function outdoorSeatBackGapM(depthM: number): number {
  return Math.min(0.009, Math.max(0.0025, depthM * 0.011));
}

/** Minimum multiplier vs catalog back height so pads read a bit taller outdoors. */
export const OUTDOOR_BACK_HEIGHT_MIN_BOOST = 1.12;

export function outdoorBackHeightM(
  heightM: number,
  catalogOverrideM: number | undefined,
): number {
  if (typeof catalogOverrideM === "number" && catalogOverrideM > 0.08) return catalogOverrideM;
  return Math.max(0.15, heightM * 0.38);
}
