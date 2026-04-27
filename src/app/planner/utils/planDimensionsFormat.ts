import type { LengthUnit } from "../types";

/** US-style segment label like IKEA floor plans (e.g. `118 1/8\"`). */
export function formatPlanSegmentDimension(meters: number, unit: LengthUnit): string {
  if (unit === "cm") {
    const cm = Math.round(meters * 100);
    return `${cm} cm`;
  }
  if (unit === "mm") {
    const mm = Math.round(meters * 1000);
    return `${mm} mm`;
  }
  const totalIn = meters / 0.0254;
  const whole = Math.floor(totalIn);
  let fracPart = totalIn - whole;
  if (fracPart > 1 - 1 / 16) {
    fracPart = 0;
    return `${whole + 1}"`;
  }
  let eighths = Math.round(fracPart * 8);
  if (eighths === 8) {
    return `${whole + 1}"`;
  }
  if (eighths === 0) {
    return `${whole}"`;
  }
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(eighths, 8);
  const num = eighths / g;
  const den = 8 / g;
  const fracStr = den === 1 ? `${num}"` : `${num}/${den}"`;
  return whole > 0 ? `${whole} ${fracStr}` : fracStr;
}
