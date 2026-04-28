import type { Room } from "../planner/types";

export interface PlannerConfig {
  id: string;
  name: string;
  shortName: string;
  description: string;
  icon: string;
  color: string;
  bgColor: string;
  categories: string[];
  defaultRoom: Room;
  tags: string[];
  /** When true, this planner uses a dedicated layout instead of the room planner */
  customLayout?: boolean;
}

export const plannerConfigs: PlannerConfig[] = [
  {
    id: "ai-room",
    name: "AI Room Planner",
    shortName: "AI Room",
    description:
      "Submit one request with optional room or inspiration images, then get a rule-generated furniture plan with modules and estimated price.",
    icon: "Sparkles",
    color: "text-fuchsia-600",
    bgColor: "bg-fuchsia-500/10",
    categories: [],
    defaultRoom: { width: 5, depth: 4, height: 2.8, floorStyle: "laminate-natural-oak" },
    tags: ["ai", "intent", "photo", "wardrobe", "catalog"],
  },
  {
    id: "room",
    name: "Room Planner",
    shortName: "Room",
    description:
      "Design any room with our full furniture catalog. Drag, drop, and arrange everything in 3D.",
    icon: "LayoutDashboard",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    categories: [],
    defaultRoom: { width: 6, depth: 5, height: 2.8, floorStyle: "laminate-natural-oak" },
    tags: ["all", "general", "full catalog"],
  },
  {
    id: "kitchen",
    name: "Kitchen Planner",
    shortName: "Kitchen",
    description:
      "Plan your dream kitchen layout. Place cabinets, appliances, countertops and more from the catalog in 3D.",
    icon: "CookingPot",
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    categories: ["Kitchen", "Appliances", "Lighting", "Storage"],
    defaultRoom: {
      width: 5,
      depth: 4,
      height: 2.8,
      floorStyle: "laminate-light-oak",
    },
    tags: ["cabinets", "appliances", "countertops", "METOD", "ENHET", "sink", "refrigerator", "dishwasher", "hood"],
  },
  {
    id: "kitchen-design",
    name: "Kitchen Designer",
    shortName: "Kitchen+",
    description:
      "Configure main wall and optional island runs, worktops, and materials (from your admin catalog when available). Semi-transparent blocks are layout aids only — not priced.",
    icon: "PanelsTopLeft",
    color: "text-rose-600",
    bgColor: "bg-rose-500/10",
    categories: [],
    defaultRoom: { width: 5, depth: 4, height: 2.8 },
    tags: ["kitchen", "cabinets", "worktop", "configurator", "METOD"],
    customLayout: true,
  },
  {
    id: "module-planner",
    name: "Module Planner",
    shortName: "Modules",
    description:
      "Build named cabinet modules from your materials and dimensions. Save them on this device and use them in Kitchen Designer alongside your catalog — without touching the admin module list.",
    icon: "Blocks",
    color: "text-teal-600",
    bgColor: "bg-teal-500/10",
    categories: [],
    defaultRoom: { width: 4, depth: 3, height: 2.8 },
    tags: ["modules", "materials", "kitchen", "custom"],
    customLayout: true,
  },
  {
    id: "custom-design",
    name: "Custom planner",
    shortName: "Custom",
    description:
      "Draw your own custom furniture in 2D, then view it in a 3D room. Switch between a drafting sheet and the room editor anytime.",
    icon: "PencilRuler",
    color: "text-amber-700",
    bgColor: "bg-amber-500/10",
    categories: [],
    defaultRoom: { width: 4, depth: 3, height: 2.8, floorStyle: "laminate-natural-oak" },
    tags: ["custom", "furniture", "drafting", "2d", "3d"],
    customLayout: true,
  },
  {
    id: "bathroom",
    name: "Bathroom Planner",
    shortName: "Bathroom",
    description:
      "Design your perfect bathroom with showers, bathtubs, vanities and storage solutions.",
    icon: "Bath",
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
    categories: ["Bathroom", "Appliances", "Lighting", "Storage"],
    defaultRoom: {
      width: 3.5,
      depth: 3,
      height: 2.8,
      floorStyle: "laminate-whitewashed-wood",
      wallColor: "#f0f4f8",
    },
    tags: ["shower", "bathtub", "vanity", "toilet", "tiles"],
  },
  {
    id: "bedroom",
    name: "Bedroom Planner",
    shortName: "Bedroom",
    description:
      "Create a cozy bedroom with beds, wardrobes, nightstands and ambient lighting.",
    icon: "Bed",
    color: "text-indigo-500",
    bgColor: "bg-indigo-500/10",
    categories: ["Beds", "Storage", "Lighting", "Decor", "Seating"],
    defaultRoom: {
      width: 4.5,
      depth: 4,
      height: 2.8,
      floorStyle: "laminate-warm-honey-oak",
    },
    tags: ["bed", "wardrobe", "nightstand", "PAX", "PLATSA"],
  },
  {
    id: "wardrobe",
    name: "Wardrobe Planner",
    shortName: "Wardrobe",
    description:
      "Design your perfect wardrobe unit. Choose frame size, add shelves, drawers, hanging rods, and doors — all in real-time 3D.",
    icon: "DoorClosed",
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
    categories: [],
    defaultRoom: { width: 3, depth: 3, height: 2.8 },
    tags: ["wardrobe", "garderobe", "closet", "PAX", "shelves", "drawers"],
    customLayout: true,
  },
  {
    id: "living-room",
    name: "Living Room Planner",
    shortName: "Living Room",
    description:
      "Arrange sofas, entertainment centers, coffee tables and decor for the perfect living space.",
    icon: "Sofa",
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    categories: ["Seating", "Tables", "Storage", "Electronics", "Lighting", "Decor"],
    defaultRoom: {
      width: 6,
      depth: 5,
      height: 2.8,
      floorStyle: "laminate-natural-oak",
    },
    tags: ["sofa", "TV", "entertainment", "BESTÅ", "KALLAX"],
  },
  {
    id: "dining-room",
    name: "Dining Room Planner",
    shortName: "Dining",
    description:
      "Set up your dining area with tables, chairs, lighting and storage for a great entertaining space.",
    icon: "UtensilsCrossed",
    color: "text-amber-600",
    bgColor: "bg-amber-600/10",
    categories: ["Tables", "Seating", "Lighting", "Storage", "Decor"],
    defaultRoom: {
      width: 5,
      depth: 4.5,
      height: 2.8,
      floorStyle: "laminate-walnut",
    },
    tags: ["dining table", "chairs", "chandelier", "buffet"],
  },
  {
    id: "office",
    name: "Office Planner",
    shortName: "Office",
    description:
      "Design a productive workspace with desks, ergonomic chairs, monitors and storage.",
    icon: "Monitor",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    categories: ["Tables", "Seating", "Electronics", "Storage", "Lighting"],
    defaultRoom: {
      width: 4,
      depth: 3.5,
      height: 2.8,
      floorStyle: "laminate-silver-ash",
    },
    tags: ["desk", "office chair", "monitor", "bookcase"],
  },
  {
    id: "children",
    name: "Children's Room Planner",
    shortName: "Kids",
    description:
      "Create a fun and functional room for children with beds, play areas and clever storage.",
    icon: "Baby",
    color: "text-pink-500",
    bgColor: "bg-pink-500/10",
    categories: ["Beds", "Storage", "Decor", "Lighting", "Tables", "Seating"],
    defaultRoom: {
      width: 4,
      depth: 3.5,
      height: 2.8,
      floorStyle: "laminate-light-oak",
    },
    tags: ["bunk bed", "toy storage", "desk", "SMÅSTAD"],
  },
  {
    id: "hallway",
    name: "Hallway Planner",
    shortName: "Hallway",
    description:
      "Organize your entryway with coat racks, shoe storage, benches and clever lighting.",
    icon: "DoorOpen",
    color: "text-stone-500",
    bgColor: "bg-stone-500/10",
    categories: ["Storage", "Lighting", "Decor", "Seating"],
    defaultRoom: {
      width: 3,
      depth: 6,
      height: 2.8,
      floorStyle: "laminate-rich-espresso",
    },
    tags: ["coat rack", "shoe cabinet", "bench", "mirror"],
  },
];

export function getPlannerConfig(type: string): PlannerConfig | undefined {
  return plannerConfigs.find((p) => p.id === type);
}
