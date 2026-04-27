import type { Module } from "@/lib/types";

const defaultConnectionPoints: Module["connectionPoints"] = {
  top: false,
  bottom: false,
  left: false,
  right: false,
  front: false,
  back: false,
};

/** Map public API module JSON to our Module shape (sizes → dimensions, connection points array → flags). */
export function normalizeApiModule(raw: Record<string, unknown>): Module {
  const sizes = raw.sizes as Module["dimensions"] | undefined;
  const dims = raw.dimensions as Module["dimensions"] | undefined;
  const dimensions = dims ?? sizes ?? { width: 0, height: 0, depth: 0, unit: "cm" };

  const cp = raw.connectionPoints;
  let connectionPoints = { ...defaultConnectionPoints };
  if (Array.isArray(cp)) {
    for (const row of cp) {
      const pos = (row as { position?: string }).position;
      if (
        pos === "top" ||
        pos === "bottom" ||
        pos === "left" ||
        pos === "right" ||
        pos === "front" ||
        pos === "back"
      ) {
        connectionPoints[pos] = true;
      }
    }
  } else if (cp && typeof cp === "object") {
    connectionPoints = { ...connectionPoints, ...(cp as Module["connectionPoints"]) };
  }

  const compatibleWith = Array.isArray(raw.compatibleWith)
    ? (raw.compatibleWith as string[])
    : [];

  return {
    ...(raw as unknown as Module),
    dimensions,
    connectionPoints,
    compatibleWith,
    subModeId: typeof raw.subModeId === "string" ? raw.subModeId : "",
  };
}
