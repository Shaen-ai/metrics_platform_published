import type { LengthUnit } from "../types";

const M_PER_IN = 0.0254;

/** Room plan size limits (meters); used for sliders and inputs. */
export const ROOM_PLAN_MIN_M = 2;
export const ROOM_PLAN_MAX_M = 15;
export const ROOM_HEIGHT_MIN_M = 2;
export const ROOM_HEIGHT_MAX_M = 4;

export function metersToDisplay(meters: number, unit: LengthUnit): number {
  if (unit === "cm") return meters * 100;
  if (unit === "mm") return meters * 1000;
  return meters / M_PER_IN;
}

export function displayToMeters(value: number, unit: LengthUnit): number {
  if (unit === "cm") return value / 100;
  if (unit === "mm") return value / 1000;
  return value * M_PER_IN;
}

/** Single dimension label for display (room, openings, furniture). */
export function formatLengthLabel(meters: number, unit: LengthUnit): string {
  const v = metersToDisplay(meters, unit);
  if (unit === "cm") return `${Math.round(v)} cm`;
  if (unit === "mm") return `${Math.round(v)} mm`;
  return `${Math.round(v * 10) / 10} in`;
}

export function lengthUnitSuffix(unit: LengthUnit): string {
  if (unit === "cm") return "cm";
  if (unit === "mm") return "mm";
  return "in";
}

/** Rounded value for controlled number inputs (whole cm/mm, 0.1 in). */
export function metersToInputValue(meters: number, unit: LengthUnit): number {
  const v = metersToDisplay(meters, unit);
  if (unit === "cm" || unit === "mm") return Math.round(v);
  return Math.round(v * 10) / 10;
}

export function roomFootprintLabel(widthM: number, depthM: number, unit: LengthUnit): string {
  return `${formatLengthLabel(widthM, unit)} × ${formatLengthLabel(depthM, unit)}`;
}
