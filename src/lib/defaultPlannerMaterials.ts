import type { Material } from "./types";

/** Same neutral 1×1 PNG as wardrobe sheet fallback — swatches + WebGL tiling work without CDN. */
const DEFAULT_SWATCH_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

type DefaultLaminateDef = Omit<
  Material,
  "adminId" | "manufacturer" | "modeId" | "subModeId" | "sheetWidthCm" | "sheetHeightCm" | "grainDirection" | "kerfMm"
> &
  Partial<Pick<Material, "manufacturer" | "sheetWidthCm" | "sheetHeightCm" | "grainDirection" | "kerfMm">>;

/** Stable IDs — never collide with UUID catalog rows — prepended only when planners need fallback boards. */
const DEFAULT_PLANNER_LAMINATES: readonly DefaultLaminateDef[] = [
  {
    id: "default-planner-laminate-natural-oak",
    type: "laminate",
    types: ["laminate"],
    category: "surface",
    categories: ["surface", "frame", "door"],
    name: "Natural oak (starter)",
    color: "#d0a870",
    colorCode: "#d0a870",
    pricePerUnit: 89,
    unit: "sqm",
    manufacturer: "Planner",
    imageUrl: DEFAULT_SWATCH_DATA_URL,
  },
  {
    id: "default-planner-laminate-alpine-white",
    type: "laminate",
    types: ["laminate"],
    category: "surface",
    categories: ["surface", "frame", "door"],
    name: "Alpine white (starter)",
    color: "#efede8",
    colorCode: "#efede8",
    pricePerUnit: 82,
    unit: "sqm",
    manufacturer: "Planner",
    imageUrl: DEFAULT_SWATCH_DATA_URL,
  },
  {
    id: "default-planner-laminate-soft-gray",
    type: "laminate",
    types: ["laminate"],
    category: "surface",
    categories: ["surface", "frame", "door"],
    name: "Soft gray (starter)",
    color: "#c8c4bc",
    colorCode: "#c8c4bc",
    pricePerUnit: 86,
    unit: "sqm",
    manufacturer: "Planner",
    imageUrl: DEFAULT_SWATCH_DATA_URL,
  },
  {
    id: "default-planner-laminate-walnut",
    type: "laminate",
    types: ["laminate"],
    category: "surface",
    categories: ["surface", "frame", "door"],
    name: "Classic walnut (starter)",
    color: "#6b4f3b",
    colorCode: "#6b4f3b",
    pricePerUnit: 112,
    unit: "sqm",
    manufacturer: "Planner",
    imageUrl: DEFAULT_SWATCH_DATA_URL,
  },
  {
    id: "default-planner-laminate-anthracite",
    type: "laminate",
    types: ["laminate"],
    category: "surface",
    categories: ["surface", "frame", "door"],
    name: "Anthracite (starter)",
    color: "#3a3d42",
    colorCode: "#3a3d42",
    pricePerUnit: 94,
    unit: "sqm",
    manufacturer: "Planner",
    imageUrl: DEFAULT_SWATCH_DATA_URL,
  },
  {
    id: "default-planner-laminate-sand-beige",
    type: "laminate",
    types: ["laminate"],
    category: "surface",
    categories: ["surface", "frame", "door"],
    name: "Sand beige (starter)",
    color: "#d8c9ae",
    colorCode: "#d8c9ae",
    pricePerUnit: 84,
    unit: "sqm",
    manufacturer: "Planner",
    imageUrl: DEFAULT_SWATCH_DATA_URL,
  },
];

/** Built-in laminates attached to `adminId` for pricing/sync with the tenant row. */
export function buildDefaultPlannerLaminates(adminId: string): Material[] {
  return DEFAULT_PLANNER_LAMINATES.map((row) => ({
    ...row,
    adminId,
    manufacturer: row.manufacturer ?? null,
  }));
}
