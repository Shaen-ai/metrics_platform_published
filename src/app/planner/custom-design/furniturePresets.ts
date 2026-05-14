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
  icon?: FurnitureIconKey;
}

export type FurnitureIconKey =
  | "cabinet"
  | "kitchen-cabinet"
  | "kitchen-island"
  | "kitchen-sink"
  | "base"
  | "wall"
  | "tall"
  | "island"
  | "sink-kitchen"
  | "wardrobe"
  | "drawers"
  | "dresser"
  | "nightstand"
  | "sink"
  | "sink-bathroom"
  | "vanity"
  | "toilet"
  | "bathtub"
  | "shower"
  | "sofa-2"
  | "sofa-3"
  | "armchair"
  | "coffee-table"
  | "tv-unit"
  | "bookshelf"
  | "corner-shelf"
  | "bed"
  | "single-bed"
  | "double-bed"
  | "king-bed"
  | "dining-table-4"
  | "dining-table-6"
  | "dining-chair"
  | "desk"
  | "l-desk"
  | "office-chair"
  | "filing-cabinet";

export const KITCHEN_PRESETS: FurniturePreset[] = [
  { id: "k-base-40", label: "Base 40", wMm: 400, hMm: 600, title: "Narrow base cab · 400×600 mm", icon: "base" },
  { id: "k-base-60", label: "Base 60", wMm: 600, hMm: 600, title: "Standard base module · 600×600 mm", icon: "base" },
  { id: "k-base-80", label: "Base 80", wMm: 800, hMm: 600, title: "Wide base module · 800×600 mm", icon: "base" },
  { id: "k-wall-60", label: "Wall 60", wMm: 600, hMm: 330, title: "Wall unit · 600×330 mm", icon: "wall" },
  { id: "k-wall-80", label: "Wall 80", wMm: 800, hMm: 330, title: "Wall unit · 800×330 mm", icon: "wall" },
  { id: "k-tall", label: "Tall 60", wMm: 600, hMm: 600, title: "Tall larder/oven column · 600×600 mm", icon: "tall" },
  { id: "k-island-120", label: "Island 120", wMm: 1200, hMm: 900, title: "Island block · 1200×900 mm", icon: "island" },
  { id: "k-sink-80", label: "Sink 80", wMm: 800, hMm: 600, title: "Sink run · 800×600 mm", icon: "sink-kitchen" },
];

export const WARDROBE_PRESETS: FurniturePreset[] = [
  { id: "w-1x40", label: "1 dr 40", wMm: 400, hMm: 600, title: "Single door section · 400×600 mm", icon: "wardrobe" },
  { id: "w-1x60", label: "1 dr 60", wMm: 600, hMm: 600, title: "Single door section · 600×600 mm", icon: "wardrobe" },
  { id: "w-1x80", label: "1 dr 80", wMm: 800, hMm: 600, title: "Single door section · 800×600 mm", icon: "wardrobe" },
  { id: "w-2-120", label: "2 dr 120", wMm: 1200, hMm: 600, title: "Double door / pair · 1200×600 mm", icon: "wardrobe" },
  { id: "w-2-180", label: "2 dr 180", wMm: 1800, hMm: 600, title: "Wide wardrobe · 1800×600 mm", icon: "wardrobe" },
  { id: "w-draw-80", label: "Drawers 80", wMm: 800, hMm: 500, title: "Drawer bank · 800×500 mm", icon: "dresser" },
  { id: "w-mid-80", label: "Half 80", wMm: 800, hMm: 300, title: "Mid / kids height · 800×300 mm", icon: "wardrobe" },
];

export const LIVING_ROOM_PRESETS: FurniturePreset[] = [
  { id: "lr-sofa-2", label: "Sofa 2-seat", wMm: 1600, hMm: 900, title: "Sofa 2-seat · 1600×900 mm", icon: "sofa-2" },
  { id: "lr-sofa-3", label: "Sofa 3-seat", wMm: 2200, hMm: 900, title: "Sofa 3-seat · 2200×900 mm", icon: "sofa-3" },
  { id: "lr-armchair", label: "Armchair", wMm: 850, hMm: 850, title: "Armchair · 850×850 mm", icon: "armchair" },
  { id: "lr-coffee-table", label: "Coffee table", wMm: 1200, hMm: 600, title: "Coffee table · 1200×600 mm", icon: "coffee-table" },
  { id: "lr-tv-unit", label: "TV unit", wMm: 1800, hMm: 450, title: "TV unit · 1800×450 mm", icon: "tv-unit" },
  { id: "lr-bookshelf", label: "Bookshelf", wMm: 900, hMm: 300, title: "Bookshelf · 900×300 mm", icon: "bookshelf" },
  { id: "lr-corner-shelf", label: "Corner shelf", wMm: 800, hMm: 800, title: "Corner shelf · 800×800 mm", icon: "corner-shelf" },
];

export const BEDROOM_PRESETS: FurniturePreset[] = [
  { id: "br-single-bed", label: "Single bed", wMm: 1000, hMm: 2000, title: "Single bed · 1000×2000 mm", icon: "single-bed" },
  { id: "br-double-bed", label: "Double bed", wMm: 1600, hMm: 2000, title: "Double bed · 1600×2000 mm", icon: "double-bed" },
  { id: "br-king-bed", label: "King bed", wMm: 2000, hMm: 2000, title: "King bed · 2000×2000 mm", icon: "king-bed" },
  { id: "br-nightstand", label: "Nightstand", wMm: 500, hMm: 450, title: "Nightstand · 500×450 mm", icon: "nightstand" },
  { id: "br-dresser", label: "Dresser", wMm: 1200, hMm: 500, title: "Dresser · 1200×500 mm", icon: "dresser" },
  { id: "br-wardrobe", label: "Wardrobe", wMm: 1200, hMm: 600, title: "Wardrobe · 1200×600 mm", icon: "wardrobe" },
];

export const BATHROOM_PRESETS: FurniturePreset[] = [
  { id: "ba-bathtub", label: "Bathtub", wMm: 1700, hMm: 800, title: "Bathtub · 1700×800 mm", icon: "bathtub" },
  { id: "ba-shower", label: "Shower", wMm: 900, hMm: 900, title: "Shower · 900×900 mm", icon: "shower" },
  { id: "ba-toilet", label: "Toilet", wMm: 380, hMm: 680, title: "Toilet · 380×680 mm", icon: "toilet" },
  { id: "ba-sink", label: "Sink", wMm: 600, hMm: 500, title: "Sink · 600×500 mm", icon: "sink-bathroom" },
  { id: "ba-vanity", label: "Vanity", wMm: 1200, hMm: 500, title: "Vanity · 1200×500 mm", icon: "vanity" },
];

export const DINING_PRESETS: FurniturePreset[] = [
  { id: "di-table-4", label: "Dining table 4-seat", wMm: 1200, hMm: 900, title: "Dining table 4-seat · 1200×900 mm", icon: "dining-table-4" },
  { id: "di-table-6", label: "Dining table 6-seat", wMm: 1800, hMm: 900, title: "Dining table 6-seat · 1800×900 mm", icon: "dining-table-6" },
  { id: "di-chair", label: "Dining chair", wMm: 450, hMm: 450, title: "Dining chair · 450×450 mm", icon: "dining-chair" },
];

export const OFFICE_PRESETS: FurniturePreset[] = [
  { id: "of-desk", label: "Desk", wMm: 1400, hMm: 700, title: "Desk · 1400×700 mm", icon: "desk" },
  { id: "of-l-desk", label: "L-desk", wMm: 2000, hMm: 1600, title: "L-desk · 2000×1600 mm", icon: "l-desk" },
  { id: "of-chair", label: "Office chair", wMm: 650, hMm: 650, title: "Office chair · 650×650 mm", icon: "office-chair" },
  { id: "of-filing", label: "Filing cabinet", wMm: 460, hMm: 620, title: "Filing cabinet · 460×620 mm", icon: "filing-cabinet" },
];

export const FURNITURE_PRESET_GROUPS: { id: string; label: string; tone: string; presets: FurniturePreset[] }[] = [
  { id: "kitchen", label: "Kitchen", tone: "emerald", presets: KITCHEN_PRESETS },
  { id: "wardrobe", label: "Wardrobe", tone: "violet", presets: WARDROBE_PRESETS },
  { id: "living", label: "Living room", tone: "amber", presets: LIVING_ROOM_PRESETS },
  { id: "bedroom", label: "Bedroom", tone: "rose", presets: BEDROOM_PRESETS },
  { id: "bathroom", label: "Bathroom", tone: "sky", presets: BATHROOM_PRESETS },
  { id: "dining", label: "Dining", tone: "orange", presets: DINING_PRESETS },
  { id: "office", label: "Office", tone: "slate", presets: OFFICE_PRESETS },
];
