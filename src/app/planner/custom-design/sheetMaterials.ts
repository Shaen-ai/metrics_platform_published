import type { PlannerSwatchMaterial } from "@/lib/plannerMaterials";
import { materialThumbnailSrc } from "@/lib/materialDisplayImage";

export interface SheetMaterial {
  key: string;
  label: string;
  group: string;
  color: string;
  texture: string;
  imageUrl?: string;
  source?: "admin" | "built-in";
}

const texture = (a: string, b: string) =>
  `repeating-linear-gradient(135deg, ${a} 0 8px, ${b} 8px 16px)`;

export const SHEET_MATERIALS: SheetMaterial[] = [
  { key: "oak", label: "Oak", group: "Wood finishes", color: "#c8a56a", texture: texture("#c8a56a", "#d9bc83"), source: "built-in" },
  { key: "walnut", label: "Walnut", group: "Wood finishes", color: "#6b4328", texture: texture("#5a341f", "#7a4a2c"), source: "built-in" },
  { key: "white-oak", label: "White Oak", group: "Wood finishes", color: "#d8c8a4", texture: texture("#d8c8a4", "#eadfbd"), source: "built-in" },
  { key: "pine", label: "Pine", group: "Wood finishes", color: "#e2c27b", texture: texture("#e2c27b", "#f0d997"), source: "built-in" },
  { key: "dark-wenge", label: "Dark Wenge", group: "Wood finishes", color: "#2b1b14", texture: texture("#21130e", "#3a2419"), source: "built-in" },
  { key: "mdf-white", label: "MDF White", group: "Wood finishes", color: "#f8fafc", texture: texture("#f8fafc", "#e5e7eb"), source: "built-in" },
  { key: "mdf-grey", label: "MDF Grey", group: "Wood finishes", color: "#9ca3af", texture: texture("#9ca3af", "#cbd5e1"), source: "built-in" },
  { key: "ral-white", label: "RAL White", group: "Painted", color: "#f9fafb", texture: texture("#f9fafb", "#eef2f7"), source: "built-in" },
  { key: "ral-black", label: "RAL Black", group: "Painted", color: "#111827", texture: texture("#111827", "#1f2937"), source: "built-in" },
  { key: "fabric-light-grey", label: "Light Grey", group: "Fabric", color: "#cbd5e1", texture: texture("#cbd5e1", "#e2e8f0"), source: "built-in" },
  { key: "fabric-dark-grey", label: "Dark Grey", group: "Fabric", color: "#475569", texture: texture("#475569", "#64748b"), source: "built-in" },
  { key: "fabric-beige", label: "Beige", group: "Fabric", color: "#d6c3a5", texture: texture("#d6c3a5", "#e9dcc5"), source: "built-in" },
  { key: "fabric-navy", label: "Navy", group: "Fabric", color: "#172554", texture: texture("#172554", "#1e3a8a"), source: "built-in" },
  { key: "velvet-green", label: "Velvet Green", group: "Fabric", color: "#166534", texture: texture("#14532d", "#15803d"), source: "built-in" },
  { key: "brushed-steel", label: "Brushed Steel", group: "Metal", color: "#94a3b8", texture: texture("#94a3b8", "#cbd5e1"), source: "built-in" },
  { key: "matte-black", label: "Matte Black", group: "Metal", color: "#020617", texture: texture("#020617", "#1e293b"), source: "built-in" },
  { key: "gold", label: "Gold", group: "Metal", color: "#d4af37", texture: texture("#b8860b", "#facc15"), source: "built-in" },
];

function cssImageUrl(url: string) {
  return `url("${url.replace(/"/g, "%22")}")`;
}

function humanizeGroup(raw?: string) {
  const clean = raw?.trim();
  if (!clean) return "Admin Materials";
  return clean
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function sheetMaterialsFromPlannerSwatches(materials: PlannerSwatchMaterial[]): SheetMaterial[] {
  return materials.map((material) => ({
    key: material.id,
    label: material.manufacturer ? `${material.name} · ${material.manufacturer}` : material.name,
    group: humanizeGroup(material.categoryKey ?? material.materialType),
    color: material.color,
    imageUrl: materialThumbnailSrc(material.imageUrl),
    texture: materialThumbnailSrc(material.imageUrl) ? cssImageUrl(materialThumbnailSrc(material.imageUrl)!) : texture(material.color, material.color),
    source: "admin",
  }));
}

export function getSheetMaterial(key?: string | null, materials: SheetMaterial[] = SHEET_MATERIALS) {
  if (!key) return null;
  return materials.find((m) => m.key === key) ?? SHEET_MATERIALS.find((m) => m.key === key) ?? null;
}

export function groupedSheetMaterials(materials: SheetMaterial[] = SHEET_MATERIALS) {
  return materials.reduce<Record<string, SheetMaterial[]>>((acc, material) => {
    acc[material.group] = [...(acc[material.group] ?? []), material];
    return acc;
  }, {});
}
