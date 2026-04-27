export type SheetTool = "select" | "line" | "rect" | "circle";
export type SheetLengthUnit = "mm" | "cm" | "in";

export const SHEET_STORAGE_KEY = "custom-design-sheet-fabric-v1";

export interface SheetPersistedState {
  version: 1;
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
