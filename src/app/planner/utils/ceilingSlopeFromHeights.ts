import type { Room } from "../types";
import { CEILING_SLOPE_MAX } from "./beams";

export type CeilingSlopeAxis = "x" | "z";
export type CeilingHeightAnchor = "d" | "middle" | "a";

/** Ceiling heights (m) at D, room center, A along the chosen axis (see plan: D = −side, A = +side). */
export type CeilingTripleM = { d: number; middle: number; a: number };

/**
 * Linear ceiling along the axis: y = b + k t with t = −L/2 at D, 0 at center, +L/2 at A.
 * Then hD = b − kL/2, hA = b + kL/2 ⇒ b = (hD + hA) / 2 and k = (hA − hD) / L.
 * Stored `room.height` is b (height at room center). hM is unused but kept for call-site clarity;
 * if hM ≠ (hD+hA)/2 the plane cannot pass through all three points — D and A define the line.
 */
export function fitCenterHeightAndSlope(
  hD: number,
  _hM: number,
  hA: number,
  spanM: number
): { centerM: number; slopePerM: number } {
  const L = Math.max(spanM, 1e-6);
  const slopePerM = (hA - hD) / L;
  const centerM = (hD + hA) / 2;
  return { centerM, slopePerM };
}

export function clampSlope(slopePerM: number): {
  slope: number;
  clamped: boolean;
} {
  const lo = -CEILING_SLOPE_MAX;
  const hi = CEILING_SLOPE_MAX;
  const s = Math.max(lo, Math.min(hi, slopePerM));
  return { slope: s, clamped: s !== slopePerM };
}

/** Clamp each half-span slope for ridge (rise per meter along that half). */
export function clampRidgeTriple(
  hD: number,
  hM: number,
  hA: number,
  halfSpanM: number
): { d: number; middle: number; a: number; clamped: boolean } {
  const h = Math.max(halfSpanM, 1e-6);
  const maxRise = CEILING_SLOPE_MAX * h;
  let d = hD;
  let m = hM;
  let a = hA;
  let clamped = false;

  let riseToMid = m - d;
  if (Math.abs(riseToMid) > maxRise) {
    riseToMid = Math.sign(riseToMid) * maxRise;
    d = m - riseToMid;
    clamped = true;
  }
  let riseToA = a - m;
  if (Math.abs(riseToA) > maxRise) {
    riseToA = Math.sign(riseToA) * maxRise;
    a = m + riseToA;
    clamped = true;
  }
  return { d, middle: m, a, clamped };
}

/** Read D / middle / A from room (ridge profile or single plane). */
export function tripleFromRoom(room: Room, axis: CeilingSlopeAxis): CeilingTripleM {
  if (room.ceilingRidgeAxis === axis) {
    const h0 = room.height;
    return {
      d: room.ceilingRidgeD ?? h0,
      middle: h0,
      a: room.ceilingRidgeA ?? h0,
    };
  }
  const w = room.width;
  const d = room.depth;
  const sx = room.ceilingSlopeX ?? 0;
  const sz = room.ceilingSlopeZ ?? 0;
  const h0 = room.height;
  if (axis === "x") {
    const hw = w / 2;
    return {
      d: h0 + sx * -hw,
      middle: h0,
      a: h0 + sx * hw,
    };
  }
  const hd = d / 2;
  return {
    d: h0 + sz * -hd,
    middle: h0,
    a: h0 + sz * hd,
  };
}

export function inferSlopeAxis(
  room: Pick<Room, "ceilingSlopeX" | "ceilingSlopeZ" | "ceilingRidgeAxis">
): CeilingSlopeAxis {
  if (room.ceilingRidgeAxis) return room.ceilingRidgeAxis;
  const sx = Math.abs(room.ceilingSlopeX ?? 0);
  const sz = Math.abs(room.ceilingSlopeZ ?? 0);
  return sz > sx ? "z" : "x";
}

export function spanForAxis(room: Pick<Room, "width" | "depth">, axis: CeilingSlopeAxis): number {
  return axis === "x" ? room.width : room.depth;
}

/**
 * Three collinear points at D (−L/2), center (0), A (+L/2) satisfy middle = (D + A) / 2.
 * Otherwise the profile is a two-segment “pyramid” / ridge at the center.
 */
export const CEILING_TRIPLE_COPLANAR_EPS_M = 0.002;

export function tripleIsCoplanarAlongAxis(triple: CeilingTripleM): boolean {
  const planeMid = (triple.d + triple.a) / 2;
  return Math.abs(triple.middle - planeMid) <= CEILING_TRIPLE_COPLANAR_EPS_M;
}

/** Build room update from triple + axis (single plane or ridge — chosen automatically). */
export function roomFromTriple(
  room: Room,
  triple: CeilingTripleM,
  axis: CeilingSlopeAxis
): { room: Room; slopeClamped: boolean } {
  const ridge = !tripleIsCoplanarAlongAxis(triple);

  if (ridge) {
    const half = spanForAxis(room, axis) / 2;
    const { d, middle, a, clamped } = clampRidgeTriple(triple.d, triple.middle, triple.a, half);
    const next: Room = {
      ...room,
      height: middle,
      ceilingRidgeAxis: axis,
      ceilingRidgeD: d,
      ceilingRidgeA: a,
      ceilingSlopeX: 0,
      ceilingSlopeZ: 0,
    };
    return { room: next, slopeClamped: clamped };
  }

  const L = spanForAxis(room, axis);
  const { centerM, slopePerM } = fitCenterHeightAndSlope(triple.d, triple.middle, triple.a, L);
  const { slope, clamped } = clampSlope(slopePerM);
  const next: Room = {
    ...room,
    height: centerM,
    ceilingSlopeX: axis === "x" ? slope : 0,
    ceilingSlopeZ: axis === "z" ? slope : 0,
    ceilingRidgeAxis: undefined,
    ceilingRidgeD: undefined,
    ceilingRidgeA: undefined,
  };
  return { room: next, slopeClamped: clamped };
}

