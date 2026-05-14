/**
 * Data-driven placement rules for the room/outdoor planner.
 * `surfaces` entries are { surfaceType, zone } compatible with mesh userData.
 */

/** @typedef {{ surfaceType: string; zone: string }} SurfaceSpec */

/**
 * @typedef {Object} PlacementRuleDef
 * @property {SurfaceSpec[]} surfaces
 * @property {'wall_slide'|'floor_plane'|'ceiling_plane'|'free'} [movement]
 * @property {'face_wall_inward'|'face_wall_outward'|'face_down'|'face_room_center'|'upright'|'lay_flat'} [rotation]
 * @property {number} [mountHeightMin]
 * @property {number} [mountHeightMax]
 * @property {number} [fixedMountY]
 * @property {{ sideM?: number; topM?: number }} [clearance]
 * @property {boolean} [requiresWallTouch]
 * @property {boolean} [outdoorOnlyCoveredPatio]
 * @property {boolean} [kitchenWallOnly]
 * @property {boolean} [exteriorWallOnly]
 * @property {boolean} [interiorWallOnly]
 * @property {number} [clearanceAboveM] — e.g. mixer under cabinet
 * @property {SurfaceSpec[]} [variantSurfaces] — e.g. TV floor stand when large
 * @property {number} [variantMinWidthM] — use variant when item width >= this (proxy for 65"+ TV)
 */

/** @type {Record<string, PlacementRuleDef>} */
export const PLACEMENT_RULES = {
  smart_tv: {
    surfaces: [{ surfaceType: "wall", zone: "indoor" }],
    variantSurfaces: [{ surfaceType: "floor", zone: "indoor" }],
    variantMinWidthM: 1.45,
    movement: "wall_slide",
    rotation: "face_wall_inward",
    mountHeightMin: 1.0,
    mountHeightMax: 1.6,
  },
  speaker_bookshelf: {
    surfaces: [
      { surfaceType: "shelf", zone: "indoor" },
      { surfaceType: "countertop", zone: "indoor" },
      { surfaceType: "table", zone: "indoor" },
      { surfaceType: "floor", zone: "indoor" },
      { surfaceType: "floor", zone: "outdoor" },
    ],
    movement: "floor_plane",
    rotation: "upright",
  },
  speaker_soundbar: {
    surfaces: [
      { surfaceType: "wall", zone: "indoor" },
      { surfaceType: "countertop", zone: "indoor" },
      { surfaceType: "shelf", zone: "indoor" },
      { surfaceType: "table", zone: "indoor" },
    ],
    movement: "wall_slide",
    rotation: "face_wall_inward",
    mountHeightMin: 0.5,
    mountHeightMax: 1.2,
  },
  speaker_subwoofer: {
    surfaces: [{ surfaceType: "floor", zone: "indoor" }],
    movement: "floor_plane",
    rotation: "upright",
  },
  speaker_ceiling: {
    surfaces: [{ surfaceType: "ceiling", zone: "indoor" }],
    movement: "ceiling_plane",
    rotation: "face_down",
  },
  speaker_outdoor: {
    surfaces: [
      { surfaceType: "wall", zone: "exterior" },
      { surfaceType: "floor", zone: "outdoor" },
      { surfaceType: "fence", zone: "outdoor" },
    ],
    movement: "free",
    rotation: "face_wall_inward",
  },
  smart_display: {
    surfaces: [
      { surfaceType: "countertop", zone: "indoor" },
      { surfaceType: "table", zone: "indoor" },
      { surfaceType: "shelf", zone: "indoor" },
    ],
    movement: "floor_plane",
    rotation: "face_room_center",
  },
  smart_plug_switch: {
    surfaces: [{ surfaceType: "wall", zone: "indoor" }],
    movement: "wall_slide",
    rotation: "face_wall_outward",
    fixedMountY: 0.3,
  },
  smart_doorbell: {
    surfaces: [{ surfaceType: "wall", zone: "exterior" }],
    movement: "wall_slide",
    rotation: "face_wall_outward",
    fixedMountY: 1.5,
    exteriorWallOnly: true,
  },
  motion_sensor: {
    surfaces: [
      { surfaceType: "wall", zone: "indoor" },
      { surfaceType: "ceiling", zone: "indoor" },
    ],
    movement: "wall_slide",
    rotation: "face_room_center",
    mountHeightMin: 2.0,
    mountHeightMax: 2.6,
  },
  smart_thermostat: {
    surfaces: [{ surfaceType: "wall", zone: "indoor" }],
    movement: "wall_slide",
    rotation: "face_wall_outward",
    fixedMountY: 1.5,
    interiorWallOnly: true,
  },
  ac_wall: {
    surfaces: [{ surfaceType: "wall", zone: "indoor" }],
    movement: "wall_slide",
    rotation: "face_wall_inward",
    mountHeightMin: 2.0,
    mountHeightMax: 2.4,
  },
  ac_floor: {
    surfaces: [{ surfaceType: "floor", zone: "indoor" }],
    movement: "floor_plane",
    rotation: "upright",
  },
  fan_portable: {
    surfaces: [
      { surfaceType: "floor", zone: "indoor" },
      { surfaceType: "countertop", zone: "indoor" },
      { surfaceType: "table", zone: "indoor" },
    ],
    movement: "floor_plane",
    rotation: "upright",
  },
  fan_ceiling: {
    surfaces: [{ surfaceType: "ceiling", zone: "indoor" }],
    movement: "ceiling_plane",
    rotation: "face_down",
  },
  ac_outdoor_unit: {
    surfaces: [
      { surfaceType: "floor", zone: "outdoor" },
      { surfaceType: "wall", zone: "exterior" },
    ],
    movement: "floor_plane",
    rotation: "face_wall_inward",
  },
  light_ceiling: {
    surfaces: [{ surfaceType: "ceiling", zone: "indoor" }],
    movement: "ceiling_plane",
    rotation: "face_down",
  },
  light_recessed: {
    surfaces: [{ surfaceType: "ceiling", zone: "indoor" }],
    movement: "ceiling_plane",
    rotation: "face_down",
  },
  light_sconce: {
    surfaces: [{ surfaceType: "wall", zone: "indoor" }],
    movement: "wall_slide",
    rotation: "face_wall_outward",
    mountHeightMin: 1.6,
    mountHeightMax: 1.8,
  },
  light_floor: {
    surfaces: [{ surfaceType: "floor", zone: "indoor" }],
    movement: "floor_plane",
    rotation: "upright",
  },
  light_table: {
    surfaces: [
      { surfaceType: "table", zone: "indoor" },
      { surfaceType: "countertop", zone: "indoor" },
      { surfaceType: "shelf", zone: "indoor" },
    ],
    movement: "floor_plane",
    rotation: "upright",
  },
  light_strip: {
    surfaces: [
      { surfaceType: "shelf", zone: "indoor" },
      { surfaceType: "wall", zone: "indoor" },
      { surfaceType: "ceiling", zone: "indoor" },
    ],
    movement: "free",
    rotation: "face_wall_outward",
  },
  light_outdoor: {
    surfaces: [
      { surfaceType: "wall", zone: "exterior" },
      { surfaceType: "fence", zone: "outdoor" },
      { surfaceType: "ground", zone: "outdoor" },
    ],
    movement: "free",
    rotation: "upright",
  },
  refrigerator: {
    surfaces: [{ surfaceType: "floor", zone: "indoor" }],
    variantSurfaces: [{ surfaceType: "floor", zone: "outdoor" }],
    movement: "floor_plane",
    rotation: "upright",
    requiresWallTouch: true,
    clearance: { sideM: 0.05, topM: 0.1 },
    outdoorOnlyCoveredPatio: true,
  },
  kitchen_knife_block: {
    surfaces: [
      { surfaceType: "countertop", zone: "indoor" },
      { surfaceType: "table", zone: "indoor" },
    ],
    movement: "floor_plane",
    rotation: "upright",
  },
  kitchen_cutting_board: {
    surfaces: [{ surfaceType: "countertop", zone: "indoor" }],
    movement: "floor_plane",
    rotation: "lay_flat",
  },
  kitchen_dish_rack: {
    surfaces: [{ surfaceType: "countertop", zone: "indoor" }],
    movement: "floor_plane",
    rotation: "upright",
  },
  kitchen_pot_pan: {
    surfaces: [
      { surfaceType: "countertop", zone: "indoor" },
      { surfaceType: "table", zone: "indoor" },
    ],
    movement: "floor_plane",
    rotation: "upright",
  },
  kitchen_magnetic_strip: {
    surfaces: [{ surfaceType: "wall", zone: "indoor" }],
    movement: "wall_slide",
    rotation: "face_wall_outward",
    mountHeightMin: 1.4,
    mountHeightMax: 1.6,
    kitchenWallOnly: true,
  },
  small_appliance: {
    surfaces: [
      { surfaceType: "countertop", zone: "indoor" },
      { surfaceType: "table", zone: "indoor" },
    ],
    variantSurfaces: [{ surfaceType: "countertop", zone: "outdoor" }],
    movement: "floor_plane",
    rotation: "upright",
  },
  small_appliance_mixer: {
    surfaces: [
      { surfaceType: "countertop", zone: "indoor" },
      { surfaceType: "table", zone: "indoor" },
    ],
    movement: "floor_plane",
    rotation: "upright",
    clearanceAboveM: 0.3,
  },
  small_appliance_coffee: {
    surfaces: [
      { surfaceType: "countertop", zone: "indoor" },
      { surfaceType: "table", zone: "indoor" },
    ],
    movement: "floor_plane",
    rotation: "upright",
    clearanceAboveM: 0.2,
  },
  small_appliance_kettle: {
    surfaces: [
      { surfaceType: "countertop", zone: "indoor" },
      { surfaceType: "table", zone: "indoor" },
    ],
    movement: "floor_plane",
    rotation: "upright",
  },
  default_furniture: {
    surfaces: [
      { surfaceType: "floor", zone: "indoor" },
      { surfaceType: "floor", zone: "outdoor" },
    ],
    movement: "floor_plane",
    rotation: "upright",
  },
};

const KEYWORD_RULES = [
  [/smart\s*tv|oled|qled|television|^tv\b/i, "smart_tv"],
  [/soundbar/i, "speaker_soundbar"],
  [/subwoofer|sub\b/i, "speaker_subwoofer"],
  [/bookshelf\s*speaker|satellite\s*speaker|^speaker\b/i, "speaker_bookshelf"],
  [/ceiling\s*speaker|in[\s-]*ceiling/i, "speaker_ceiling"],
  [/outdoor\s*speaker/i, "speaker_outdoor"],
  [/echo\s*show|nest\s*hub|smart\s*display/i, "smart_display"],
  [/smart\s*plug|smart\s*switch/i, "smart_plug_switch"],
  [/doorbell|video\s*doorbell/i, "smart_doorbell"],
  [/motion\s*sensor|occupancy/i, "motion_sensor"],
  [/thermostat/i, "smart_thermostat"],
  [/split.*ac|wall.*ac|wall\s*mounted.*air/i, "ac_wall"],
  [/tower\s*fan|pedestal\s*fan|floor.*air|standing\s*ac/i, "ac_floor"],
  [/ceiling\s*fan/i, "fan_ceiling"],
  [/portable\s*fan|desk\s*fan/i, "fan_portable"],
  [/condenser|compressor|outdoor\s*unit/i, "ac_outdoor_unit"],
  [/chandelier|pendant|ceiling\s*light(?!strip)/i, "light_ceiling"],
  [/recessed|downlight|can\s*light/i, "light_recessed"],
  [/sconce|wall\s*lamp/i, "light_sconce"],
  [/floor\s*lamp/i, "light_floor"],
  [/table\s*lamp|bedside\s*lamp/i, "light_table"],
  [/strip\s*light|led\s*strip|under\s*cabinet/i, "light_strip"],
  [/path\s*light|bollard|spike\s*light|outdoor\s*light/i, "light_outdoor"],
  [/refrigerator|fridge|freezer/i, "refrigerator"],
  [/knife\s*block|cutlery\s*stand/i, "kitchen_knife_block"],
  [/cutting\s*board|chopping\s*board/i, "kitchen_cutting_board"],
  [/dish\s*rack|draining/i, "kitchen_dish_rack"],
  [/magnetic\s*knife|knife\s*strip/i, "kitchen_magnetic_strip"],
  [/(stock\s*pot|^pot\b|^pan\b|skillet|saucepan|frying)/i, "kitchen_pot_pan"],
  [/mixer|kitchenaid|stand\s*mixer/i, "small_appliance_mixer"],
  [/coffee|espresso|nespresso|keurig/i, "small_appliance_coffee"],
  [/kettle|electric\s*kettle/i, "small_appliance_kettle"],
  [/toaster|blender|juicer|air\s*fryer/i, "small_appliance"],
];

/**
 * @param {object} catalogItem
 * @param {string} [catalogItem.placementRuleId]
 * @param {string} catalogItem.name
 * @param {string} catalogItem.category
 * @param {string} [catalogItem.subCategory]
 * @param {string[]} [catalogItem.additionalCategories]
 * @param {string[]} [catalogItem.allCategories]
 * @returns {string}
 */
export function resolvePlacementRuleId(catalogItem) {
  if (catalogItem.placementRuleId && PLACEMENT_RULES[catalogItem.placementRuleId]) {
    return catalogItem.placementRuleId;
  }
  const blob = [
    catalogItem.name,
    catalogItem.category,
    catalogItem.subCategory ?? "",
    ...(catalogItem.additionalCategories ?? []),
    ...(catalogItem.allCategories ?? []),
  ]
    .join(" ")
    .toLowerCase();

  for (const [re, id] of KEYWORD_RULES) {
    if (re.test(blob)) return id;
  }

  if (/appliance|mixer|coffee|kettle|toaster/i.test(blob)) return "small_appliance";

  if (catalogItem.wallMounted) {
    if (/light|lamp|sconce/i.test(blob)) return "light_sconce";
    if (/tv|display|screen/i.test(blob)) return "smart_tv";
    return "ac_wall";
  }

  return "default_furniture";
}

/**
 * Surfaces for a rule, including TV floor variant when item is wide enough.
 * @param {string} categoryId
 * @param {{ widthM?: number }} [itemDims]
 * @returns {SurfaceSpec[]}
 */
export function getSurfacesForRule(categoryId, itemDims) {
  const rule = PLACEMENT_RULES[categoryId] ?? PLACEMENT_RULES.default_furniture;
  if (
    categoryId === "smart_tv" &&
    rule.variantSurfaces &&
    itemDims?.widthM != null &&
    rule.variantMinWidthM != null &&
    itemDims.widthM >= rule.variantMinWidthM
  ) {
    return [...rule.surfaces, ...rule.variantSurfaces];
  }
  if (categoryId === "refrigerator" && rule.variantSurfaces) {
    return [...rule.surfaces, ...rule.variantSurfaces];
  }
  if (categoryId === "small_appliance" && rule.variantSurfaces) {
    return [...rule.surfaces, ...rule.variantSurfaces];
  }
  return rule.surfaces;
}

export function getRule(ruleId) {
  return PLACEMENT_RULES[ruleId] ?? PLACEMENT_RULES.default_furniture;
}
