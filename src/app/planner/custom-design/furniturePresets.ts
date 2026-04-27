/**
 * Standard approximations in millimetres for quick sheet layouts (1 canvas unit ≈ 1 mm at 100% zoom).
 * Not a product catalogue — just convenient blocks for planning.
 */

export interface FurniturePreset {
  id: string;
  label: string;
  wMm: number;
  hMm: number;
  title: string;
}

export const KITCHEN_PRESETS: FurniturePreset[] = [
  { id: "k-base-40", label: "Base 40", wMm: 400, hMm: 720, title: "Narrow base cab · 400×720 mm" },
  { id: "k-base-60", label: "Base 60", wMm: 600, hMm: 720, title: "Standard base module · 600×720 mm" },
  { id: "k-base-80", label: "Base 80", wMm: 800, hMm: 720, title: "Wide base module · 800×720 mm" },
  { id: "k-wall-60", label: "Wall 60", wMm: 600, hMm: 360, title: "Wall unit · 600×360 mm" },
  { id: "k-wall-80", label: "Wall 80", wMm: 800, hMm: 360, title: "Wall unit · 800×360 mm" },
  { id: "k-tall", label: "Tall 60", wMm: 600, hMm: 2100, title: "Tall larder/oven column · 600×2100 mm" },
  { id: "k-island-120", label: "Island 120", wMm: 1200, hMm: 900, title: "Island block · 1200×900 mm" },
  { id: "k-sink-80", label: "Sink 80", wMm: 800, hMm: 600, title: "Sink run · 800×600 mm" },
];

export const WARDROBE_PRESETS: FurniturePreset[] = [
  { id: "w-1x40", label: "1 dr 40", wMm: 400, hMm: 2200, title: "Single door section · 400×2200 mm" },
  { id: "w-1x60", label: "1 dr 60", wMm: 600, hMm: 2200, title: "Single door section · 600×2200 mm" },
  { id: "w-1x80", label: "1 dr 80", wMm: 800, hMm: 2200, title: "Single door section · 800×2200 mm" },
  { id: "w-2-120", label: "2 dr 120", wMm: 1200, hMm: 2200, title: "Double door / pair · 1200×2200 mm" },
  { id: "w-2-180", label: "2 dr 180", wMm: 1800, hMm: 2200, title: "Wide wardrobe · 1800×2200 mm" },
  { id: "w-draw-80", label: "Drawers 80", wMm: 800, hMm: 720, title: "Drawer bank · 800×720 mm" },
  { id: "w-mid-80", label: "Half 80", wMm: 800, hMm: 1200, title: "Mid / kids height · 800×1200 mm" },
];
