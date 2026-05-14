import type { Canvas, FabricObject } from "fabric";
import type { SheetDesignPayload, SheetLengthUnit, SheetSerializedObject } from "./sheetTypes";
import { SHEET_HISTORY_PROPS } from "./sheetTypes";
import { objectDimensionsMm } from "./sheetGeometry";

type SheetObj = FabricObject & {
  sheetId?: string;
  sheetLabel?: string;
  sheetLocked?: boolean;
  sheetVisible?: boolean;
  sheetMaterialKey?: string | null;
  sheetIconKey?: string | null;
  sheetObjectKind?: string;
  isSheetGuide?: boolean;
  isSheetAnnotation?: boolean;
};

export function isExportableSheetObject(obj: FabricObject): obj is SheetObj {
  const o = obj as SheetObj;
  return !o.isSheetGuide && !o.isSheetAnnotation && !!o.sheetId;
}

export function serializeSheetObject(obj: FabricObject, zIndex: number): SheetSerializedObject | null {
  if (!isExportableSheetObject(obj)) return null;
  const dims = objectDimensionsMm(obj);
  return {
    id: obj.sheetId!,
    type: obj.type ?? "object",
    x: Math.round(obj.left ?? 0),
    y: Math.round(obj.top ?? 0),
    width: dims.width,
    height: dims.height,
    rotation: Math.round(((obj.angle ?? 0) + 360) % 360),
    color: typeof obj.stroke === "string" ? obj.stroke : typeof obj.fill === "string" ? obj.fill : null,
    label: obj.sheetLabel || "Custom",
    locked: obj.sheetLocked === true,
    visible: obj.visible !== false && obj.sheetVisible !== false,
    zIndex,
    materialKey: obj.sheetMaterialKey ?? null,
    iconKey: obj.sheetIconKey ?? null,
    objectKind: obj.sheetObjectKind ?? null,
  };
}

export function buildSheetDesignPayload(
  canvas: Canvas,
  options: {
    unit: SheetLengthUnit;
    gridMm: number;
    snap: boolean;
    ortho: boolean;
    showGrid: boolean;
  },
): SheetDesignPayload {
  const objects = canvas
    .getObjects()
    .map((obj, index) => serializeSheetObject(obj, index))
    .filter((obj): obj is SheetSerializedObject => obj !== null);

  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    unit: options.unit,
    gridMm: options.gridMm,
    snap: options.snap,
    ortho: options.ortho,
    showGrid: options.showGrid,
    zoom: canvas.getZoom(),
    objects,
    fabric: canvas.toObject([...SHEET_HISTORY_PROPS] as unknown as string[]) as unknown as Record<string, unknown>,
  };
}
