/**
 * Wardrobe footprint presets: placement in the preview room.
 * L/U runs shorten the back wall module so it fits between wing depths (no corner clipping).
 */

import type { FloorOutlinePoint } from "../types";
import type {
  RoomSettings,
  WardrobeConfig,
  WardrobeSpaceLayoutPreset,
  WardrobeWalkInVariant,
  WardrobePrimaryRun,
  WardrobeCornerAttachment,
} from "./types";
import { FRAME_MIN_WIDTH, FRAME_MAX_WIDTH } from "./data";
import {
  ROOM_PLAN_MIN_M,
  ROOM_PLAN_MAX_M,
  ROOM_HEIGHT_MIN_M,
  ROOM_HEIGHT_MAX_M,
} from "../utils/units";

/** Default preview room width/depth half-span basis (m). */
export const DEFAULT_PREVIEW_ROOM_FLOOR_M = 3;
/** Default preview ceiling height (m) — matches bedroom planner initial room. */
export const DEFAULT_PREVIEW_ROOM_HEIGHT_M = 2.8;

export const WARDROBE_BRIDGE_LIFT_DEFAULT_CM = 220;
export const WARDROBE_BRIDGE_LIFT_MIN_CM = 160;
export const WARDROBE_BRIDGE_LIFT_MAX_CM = 290;

export const WARDROBE_LEG_GROUP_Z_BUMP_M = 0.018;

const VALID_PRESETS: WardrobeSpaceLayoutPreset[] = [
  "linear",
  "l_shape",
  "u_shape",
  "parallel",
  "walk_in",
  "island_walk_in",
  "bridge",
];

const VALID_WALK_IN: WardrobeWalkInVariant[] = ["u", "l", "parallel", "island"];

const DEFAULT_ROOM_M = DEFAULT_PREVIEW_ROOM_FLOOR_M;
const CORNER_GAP_M = 0.045;
const EPS = 0.004;

function bboxHalfExtents(outline: FloorOutlinePoint[]): { hw: number; hd: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of outline) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  return { hw: (maxX - minX) / 2, hd: (maxZ - minZ) / 2 };
}

export function wardrobeRoomHalfExtents(room: RoomSettings): { hw: number; hd: number } {
  const outline = room.floorOutline;
  if (outline && outline.length >= 3) {
    const { hw, hd } = bboxHalfExtents(outline);
    if (hw > 0.05 && hd > 0.05) return { hw, hd };
  }
  const rw = room.roomWidthM ?? DEFAULT_ROOM_M;
  const rd = room.roomDepthM ?? DEFAULT_ROOM_M;
  return { hw: rw / 2, hd: rd / 2 };
}

/** Total module span along local X including horizontal addons (meters). */
export function wardrobeCompositionWidthMeters(config: WardrobeConfig): number {
  const CM = 0.01;
  const W = config.frame.width * CM;
  const addons = config.addons ?? [];
  const seamStyle = config.seamStyle ?? "independent";
  const seamOffsetM = seamStyle === "shared" ? -0.018 : 0;
  let rightCount = 0;
  for (const a of addons) {
    if (a.position === "right") rightCount += 1;
  }
  const totalRightM = rightCount * (W + seamOffsetM);
  return W + totalRightM;
}

export function wardrobeLayoutGeometry(room: RoomSettings): WardrobeSpaceLayoutPreset {
  return room.spaceLayoutPreset ?? "linear";
}

export function wardrobeBridgeLiftMeters(room: RoomSettings): number {
  const cm = room.bridgeLiftCm ?? WARDROBE_BRIDGE_LIFT_DEFAULT_CM;
  return cm * 0.01;
}

export function normalizeSpaceLayoutFields(room: RoomSettings): RoomSettings {
  let preset: WardrobeSpaceLayoutPreset = room.spaceLayoutPreset ?? "linear";
  if (!VALID_PRESETS.includes(preset)) preset = "linear";

  let walkInVariant: WardrobeWalkInVariant = room.walkInVariant ?? "u";
  if (!VALID_WALK_IN.includes(walkInVariant)) walkInVariant = "u";
  if (preset === "island_walk_in") walkInVariant = "island";

  let bridgeLiftCm = Number(room.bridgeLiftCm);
  if (!Number.isFinite(bridgeLiftCm)) bridgeLiftCm = WARDROBE_BRIDGE_LIFT_DEFAULT_CM;
  bridgeLiftCm = Math.round(
    Math.min(WARDROBE_BRIDGE_LIFT_MAX_CM, Math.max(WARDROBE_BRIDGE_LIFT_MIN_CM, bridgeLiftCm)),
  );

  let roomWidthM = Number(room.roomWidthM);
  if (!Number.isFinite(roomWidthM)) roomWidthM = DEFAULT_ROOM_M;
  roomWidthM = Math.round(Math.min(ROOM_PLAN_MAX_M, Math.max(ROOM_PLAN_MIN_M, roomWidthM)) * 100) / 100;

  let roomDepthM = Number(room.roomDepthM);
  if (!Number.isFinite(roomDepthM)) roomDepthM = DEFAULT_ROOM_M;
  roomDepthM = Math.round(Math.min(ROOM_PLAN_MAX_M, Math.max(ROOM_PLAN_MIN_M, roomDepthM)) * 100) / 100;

  let roomHeightM = Number(room.roomHeightM);
  if (!Number.isFinite(roomHeightM)) roomHeightM = DEFAULT_PREVIEW_ROOM_HEIGHT_M;
  roomHeightM =
    Math.round(Math.min(ROOM_HEIGHT_MAX_M, Math.max(ROOM_HEIGHT_MIN_M, roomHeightM)) * 100) / 100;

  const wardrobeCornerAttachment: WardrobeCornerAttachment =
    room.wardrobeCornerAttachment === "right" ? "right" : "left";

  let wardrobePrimaryRun = room.wardrobePrimaryRun;
  if (
    wardrobePrimaryRun !== undefined &&
    !(["back", "left", "right", "side"] as const).includes(wardrobePrimaryRun)
  ) {
    wardrobePrimaryRun = undefined;
  }

  return {
    ...room,
    spaceLayoutPreset: preset,
    walkInVariant,
    bridgeLiftCm,
    roomWidthM,
    roomDepthM,
    roomHeightM,
    wardrobeCornerAttachment,
    wardrobePrimaryRun,
  };
}

export interface WardrobeLegTransform {
  xM: number;
  zM: number;
  rotationY: number;
  label: string;
}

export type WardrobeLegRole = "back" | "left" | "right" | "side" | "island";

export type WardrobeLayoutLegItem = WardrobeLegTransform & {
  frameWidthCm: number;
  legRole: WardrobeLegRole;
};

interface AxRect {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
}

function aabbOverlapXZ(a: AxRect, b: AxRect): boolean {
  return Math.abs(a.cx - b.cx) < a.hx + b.hx && Math.abs(a.cz - b.cz) < a.hz + b.hz;
}

function nominalWidthCm(Wtot_m: number): number {
  return Math.round(Wtot_m * 1000) / 10;
}

/** Physical limit for a flush back run between two wing depths (cm). */
export function maxBackWallWidthCm(hw: number, D_m: number): number {
  const innerM = Math.max(0.2, 2 * hw - 2 * D_m - CORNER_GAP_M);
  const cm = innerM * 100;
  return Math.round(Math.min(FRAME_MAX_WIDTH, Math.max(FRAME_MIN_WIDTH, cm)) * 10) / 10;
}

function backLegBox(W_back_m: number, hd: number, D_m: number): AxRect {
  return {
    cx: 0,
    cz: -hd + D_m / 2,
    hx: W_back_m / 2 + EPS,
    hz: D_m / 2 + EPS,
  };
}

function sideLegBoxLeftWall(hw: number, D_m: number, Wnom_m: number, zc: number): AxRect {
  return {
    cx: -hw + D_m / 2 + EPS,
    cz: zc,
    hx: D_m / 2 + EPS,
    hz: Wnom_m / 2 + EPS,
  };
}

function sideLegBoxRightWall(hw: number, D_m: number, Wnom_m: number, zc: number): AxRect {
  return {
    cx: hw - D_m / 2 - EPS,
    cz: zc,
    hx: D_m / 2 + EPS,
    hz: Wnom_m / 2 + EPS,
  };
}

/** Slide wing runs forward (+Z) until their footprint clears the back box (plan view). */
function resolveSideLegZ(
  hw: number,
  hd: number,
  D_m: number,
  Wnom_m: number,
  W_back_m: number,
  side: "left" | "right",
): number {
  const backBox = backLegBox(W_back_m, hd, D_m);
  let z = -hd + Wnom_m / 2 + EPS;
  const maxZ = hd - Wnom_m / 2 - 0.08;
  for (let i = 0; i < 120; i++) {
    const box =
      side === "left"
        ? sideLegBoxLeftWall(hw, D_m, Wnom_m, z)
        : sideLegBoxRightWall(hw, D_m, Wnom_m, z);
    if (!aabbOverlapXZ(box, backBox)) break;
    z += 0.012;
  }
  return Math.min(z, maxZ);
}

function deriveDefaultPrimaryRun(
  preset: WardrobeSpaceLayoutPreset,
  walkInVariant: WardrobeWalkInVariant,
): WardrobePrimaryRun {
  if (preset === "u_shape" || (preset === "walk_in" && walkInVariant === "u")) return "left";
  if (preset === "l_shape" || (preset === "walk_in" && walkInVariant === "l")) return "side";
  return "back";
}

export function wardrobeLayoutEffectivePrimary(room: RoomSettings): WardrobePrimaryRun {
  const preset = room.spaceLayoutPreset ?? "linear";
  const wi = room.walkInVariant ?? "u";
  const fallback = deriveDefaultPrimaryRun(preset, wi);
  return room.wardrobePrimaryRun ?? fallback;
}

export function wardrobeLayoutInteractiveLegIndex(
  room: RoomSettings,
  legs: WardrobeLayoutLegItem[],
): number {
  const primary = wardrobeLayoutEffectivePrimary(room);
  const idx = legs.findIndex((l) => l.legRole === primary);
  return idx >= 0 ? idx : 0;
}

function mirrorLegItems(items: WardrobeLayoutLegItem[]): WardrobeLayoutLegItem[] {
  return items.map((leg) => ({
    ...leg,
    xM: -leg.xM,
    rotationY: -leg.rotationY,
  }));
}

function linearLegItem(hw: number, hd: number, D_m: number, nominalCm: number): WardrobeLayoutLegItem {
  return {
    xM: 0,
    zM: -hd + D_m / 2 + EPS,
    rotationY: 0,
    label: "Straight run",
    frameWidthCm: nominalCm,
    legRole: "back",
  };
}

function buildParallelLegs(
  hw: number,
  hd: number,
  D_m: number,
  nominalCm: number,
): WardrobeLayoutLegItem[] {
  return [
    {
      xM: 0,
      zM: -hd + D_m / 2 + EPS,
      rotationY: 0,
      label: "Wall A",
      frameWidthCm: nominalCm,
      legRole: "left",
    },
    {
      xM: 0,
      zM: hd - D_m / 2 - EPS,
      rotationY: Math.PI,
      label: "Wall B",
      frameWidthCm: nominalCm,
      legRole: "right",
    },
  ];
}

function buildLShapeLegs(
  hw: number,
  hd: number,
  D_m: number,
  nominalCm: number,
): WardrobeLayoutLegItem[] {
  const Wnom_m = nominalCm * 0.01;
  const W_back_cm = Math.min(nominalCm, maxBackWallWidthCm(hw, D_m));
  const W_back_m = W_back_cm * 0.01;

  const zSide = resolveSideLegZ(hw, hd, D_m, Wnom_m, W_back_m, "left");

  return [
    {
      xM: 0,
      zM: -hd + D_m / 2 + EPS,
      rotationY: 0,
      label: "Back run",
      frameWidthCm: W_back_cm,
      legRole: "back",
    },
    {
      xM: -hw + D_m / 2 + EPS,
      zM: zSide,
      rotationY: Math.PI / 2,
      label: "Side run",
      frameWidthCm: nominalCm,
      legRole: "side",
    },
  ];
}

function buildUShapeLegs(
  hw: number,
  hd: number,
  D_m: number,
  nominalCm: number,
): WardrobeLayoutLegItem[] {
  const Wnom_m = nominalCm * 0.01;
  const W_back_cm = Math.min(nominalCm, maxBackWallWidthCm(hw, D_m));
  const W_back_m = W_back_cm * 0.01;

  const zSide = resolveSideLegZ(hw, hd, D_m, Wnom_m, W_back_m, "left");

  return [
    {
      xM: 0,
      zM: -hd + D_m / 2 + EPS,
      rotationY: 0,
      label: "Back run",
      frameWidthCm: W_back_cm,
      legRole: "back",
    },
    {
      xM: -hw + D_m / 2 + EPS,
      zM: zSide,
      rotationY: Math.PI / 2,
      label: "Left run",
      frameWidthCm: nominalCm,
      legRole: "left",
    },
    {
      xM: hw - D_m / 2 - EPS,
      zM: zSide,
      rotationY: -Math.PI / 2,
      label: "Right run",
      frameWidthCm: nominalCm,
      legRole: "right",
    },
  ];
}

function islandLegItem(nominalCm: number): WardrobeLayoutLegItem {
  return {
    xM: 0,
    zM: 0,
    rotationY: 0,
    label: "Island",
    frameWidthCm: nominalCm,
    legRole: "island",
  };
}

export function wardrobeLayoutLegItems(
  room: RoomSettings,
  Wtot_m: number,
  D_m: number,
): WardrobeLayoutLegItem[] {
  const { hw, hd } = wardrobeRoomHalfExtents(room);
  const preset = room.spaceLayoutPreset ?? "linear";
  const nominalCm = nominalWidthCm(Wtot_m);

  let items: WardrobeLayoutLegItem[];

  if (preset === "linear" || preset === "bridge") {
    items = [linearLegItem(hw, hd, D_m, nominalCm)];
  } else if (preset === "parallel") {
    items = buildParallelLegs(hw, hd, D_m, nominalCm);
  } else if (preset === "l_shape") {
    items = buildLShapeLegs(hw, hd, D_m, nominalCm);
  } else if (preset === "u_shape") {
    items = buildUShapeLegs(hw, hd, D_m, nominalCm);
  } else if (preset === "island_walk_in") {
    items = [...buildUShapeLegs(hw, hd, D_m, nominalCm), islandLegItem(nominalCm)];
  } else if (preset === "walk_in") {
    const v = room.walkInVariant ?? "u";
    if (v === "u") items = buildUShapeLegs(hw, hd, D_m, nominalCm);
    else if (v === "l") items = buildLShapeLegs(hw, hd, D_m, nominalCm);
    else if (v === "parallel") items = buildParallelLegs(hw, hd, D_m, nominalCm);
    else items = [...buildUShapeLegs(hw, hd, D_m, nominalCm), islandLegItem(nominalCm)];
  } else {
    items = [linearLegItem(hw, hd, D_m, nominalCm)];
  }

  if (room.wardrobeCornerAttachment === "right") {
    items = mirrorLegItems(items);
  }

  return items;
}

export function wardrobeLegTransforms(
  room: RoomSettings,
  Wtot_m: number,
  D_m: number,
): WardrobeLegTransform[] {
  return wardrobeLayoutLegItems(room, Wtot_m, D_m).map((leg) => ({
    xM: leg.xM,
    zM: leg.zM,
    rotationY: leg.rotationY,
    label: leg.label,
  }));
}

export function wardrobeLayoutLegWidthsFromConfig(
  room: RoomSettings | undefined,
  config: WardrobeConfig,
): number[] | undefined {
  if (!room) return undefined;
  const Wtot = wardrobeCompositionWidthMeters(config);
  const D_m = config.frame.depth * 0.01;
  return wardrobeLayoutLegItems(room, Wtot, D_m).map((l) => l.frameWidthCm);
}

export function wardrobeLayoutLegCountForConfig(
  room: RoomSettings | undefined,
  config: WardrobeConfig,
): number {
  if (!room) return 1;
  const Wtot = wardrobeCompositionWidthMeters(config);
  const D_m = config.frame.depth * 0.01;
  return wardrobeLayoutLegItems(room, Wtot, D_m).length;
}
