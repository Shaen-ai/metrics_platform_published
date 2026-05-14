import type { FabricObject } from "fabric";

export const CANVAS_SCALE = 0.1;

export function mmToCanvas(mm: number) {
  return mm * CANVAS_SCALE;
}

export function canvasToMm(px: number) {
  return px / CANVAS_SCALE;
}

export function makeSheetId(prefix = "sheet") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function readableTextColor(color?: string | null) {
  if (!color) return "#0f172a";
  const hex = color.startsWith("#") ? color.slice(1) : color;
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "#0f172a";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.45 ? "#ffffff" : "#0f172a";
}

export function normalizeAngle(angle: number) {
  const next = angle % 360;
  return next < 0 ? next + 360 : next;
}

export function snapRotation(angle: number, threshold = 5) {
  const normalized = normalizeAngle(angle);
  for (const target of [0, 90, 180, 270, 360]) {
    if (Math.abs(normalized - target) <= threshold) return target === 360 ? 0 : target;
  }
  return normalized;
}

export function objectDimensionsMm(obj: FabricObject) {
  return {
    width: Math.max(1, Math.round(canvasToMm(obj.getScaledWidth()))),
    height: Math.max(1, Math.round(canvasToMm(obj.getScaledHeight()))),
  };
}

export function objectCenter(obj: FabricObject) {
  const center = obj.getCenterPoint();
  return { x: center.x, y: center.y };
}

export function objectBounds(obj: FabricObject) {
  const rect = obj.getBoundingRect();
  return {
    left: rect.left,
    top: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    centerX: rect.left + rect.width / 2,
    centerY: rect.top + rect.height / 2,
    width: rect.width,
    height: rect.height,
  };
}

export function distanceMm(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.round(canvasToMm(Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2)));
}
