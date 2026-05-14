export type SheetTool = "select" | "line" | "rect" | "circle" | "measure";
export type SheetLengthUnit = "mm" | "cm" | "in";

export const SHEET_STORAGE_KEY = "custom-design-sheet-fabric-v1";
export const SHEET_AUTOSAVE_KEY = "custom-design-sheet-autosave-v1";

export const SHEET_HISTORY_PROPS = [
  "layerId",
  "isSheetGuide",
  "isSheetAnnotation",
  "isSheetDimension",
  "sheetId",
  "sheetLabel",
  "sheetLocked",
  "sheetVisible",
  "sheetMaterialKey",
  "sheetIconKey",
  "sheetObjectKind",
  "sheetMeasureId",
  "sheetParentId",
  "sheetRole",
] as const;

export type SheetHistoryProp = (typeof SHEET_HISTORY_PROPS)[number];

export interface SheetSerializedObject {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string | null;
  label: string;
  locked: boolean;
  visible: boolean;
  zIndex: number;
  materialKey: string | null;
  iconKey: string | null;
  objectKind: string | null;
}

export interface SheetDesignPayload {
  version: 2;
  generatedAt: string;
  unit: SheetLengthUnit;
  gridMm: number;
  snap: boolean;
  ortho: boolean;
  showGrid: boolean;
  zoom: number;
  objects: SheetSerializedObject[];
  fabric: Record<string, unknown> | null;
}

export interface SheetPersistedState {
  version: 1 | 2;
  unit: SheetLengthUnit;
  gridMm: number;
  snap: boolean;
  ortho: boolean;
  showGrid: boolean;
  layers: { id: string; name: string; visible: boolean; locked: boolean }[];
  activeLayerId: string;
  fabric: Record<string, unknown> | null;
  zoom: number;
}

export function loadSheetState(): Partial<SheetPersistedState> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SHEET_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<SheetPersistedState>;
  } catch {
    return null;
  }
}

export function saveSheetState(state: SheetPersistedState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SHEET_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}
