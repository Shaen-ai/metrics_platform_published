/**
 * Shared helpers for resolving a material's sheet (laminate / MDF / wood / worktop)
 * specification. Backend stores the fields nullable; this module is the single
 * source of truth for default values so every consumer — planner renderer,
 * packer, admin form, cut-list — treats missing data identically.
 *
 * Defaults (aligned with admin API and MaterialResource null coalescing):
 *  - sheet size: 360 × 180 cm
 *  - grain direction: along the sheet's width
 *  - kerf: 3 mm between adjacent cuts
 *
 * The wardrobe sheet viewer can apply a one-off size override for all sheeted
 * materials; use that when simulating a different stock format.
 */

import type { Material, MaterialGrainDirection } from "@/lib/types";

export const DEFAULT_SHEET_WIDTH_CM = 360;
export const DEFAULT_SHEET_HEIGHT_CM = 180;
export const DEFAULT_GRAIN_DIRECTION: MaterialGrainDirection = "along_width";
export const DEFAULT_KERF_MM = 3;

export interface SheetSpec {
  widthCm: number;
  heightCm: number;
  grainDirection: MaterialGrainDirection;
  kerfMm: number;
  /** Size of one kerf in the packer's working unit (cm). */
  kerfCm: number;
}

function positiveOrDefault(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function clampKerf(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_KERF_MM;
  return Math.min(n, 10);
}

/** Resolves a material-like object to a concrete sheet spec with defaults. */
export function getSheetSpec(
  material: Pick<
    Material,
    "sheetWidthCm" | "sheetHeightCm" | "grainDirection" | "kerfMm"
  > | null | undefined,
): SheetSpec {
  const widthCm = positiveOrDefault(material?.sheetWidthCm, DEFAULT_SHEET_WIDTH_CM);
  const heightCm = positiveOrDefault(material?.sheetHeightCm, DEFAULT_SHEET_HEIGHT_CM);
  const grainDirection: MaterialGrainDirection =
    material?.grainDirection === "along_width" ||
    material?.grainDirection === "along_height" ||
    material?.grainDirection === "none"
      ? material.grainDirection
      : DEFAULT_GRAIN_DIRECTION;
  const kerfMm = clampKerf(material?.kerfMm);
  return {
    widthCm,
    heightCm,
    grainDirection,
    kerfMm,
    kerfCm: kerfMm / 10,
  };
}

/**
 * Material types whose surfaces come from pressed sheets. Only these go
 * through the packer — hardware (slides, hinges), fabric, glass, metal etc.
 * render with the current shader path unchanged.
 */
const SHEETED_MATERIAL_TYPES = new Set(["laminate", "mdf", "wood", "worktop"]);

export function isSheetedMaterialType(type: string | null | undefined): boolean {
  if (!type) return false;
  return SHEETED_MATERIAL_TYPES.has(type.toLowerCase());
}

export function materialTypeSlugs(m: {
  type: string;
  types?: string[];
}): string[] {
  if (m.types?.length) return m.types;
  return [m.type];
}

export function isSheetedMaterialFromTypes(types: string[]): boolean {
  return types.some((t) => isSheetedMaterialType(t));
}

export function isSheetedMaterial(m: {
  type: string;
  types?: string[];
} | null | undefined): boolean {
  if (!m) return false;
  return isSheetedMaterialFromTypes(materialTypeSlugs(m));
}
