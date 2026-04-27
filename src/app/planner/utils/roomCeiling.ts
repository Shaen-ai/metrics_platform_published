import type { Room } from "../types";

/** Fields needed to evaluate ceiling height anywhere in plan (XZ). */
export type RoomCeilingShape = Pick<
  Room,
  | "height"
  | "ceilingSlopeX"
  | "ceilingSlopeZ"
  | "width"
  | "depth"
  | "ceilingRidgeAxis"
  | "ceilingRidgeD"
  | "ceilingRidgeA"
>;

function yRidgeAlongX(room: RoomCeilingShape, x: number): number {
  const hw = room.width / 2;
  const hD = room.ceilingRidgeD ?? room.height;
  const hC = room.height;
  const hA = room.ceilingRidgeA ?? room.height;
  if (hw < 1e-9) return hC;
  if (x <= 0) {
    const t = (x + hw) / hw;
    return hD + t * (hC - hD);
  }
  const t = x / hw;
  return hC + t * (hA - hC);
}

function yRidgeAlongZ(room: RoomCeilingShape, z: number): number {
  const hd = room.depth / 2;
  const hD = room.ceilingRidgeD ?? room.height;
  const hC = room.height;
  const hA = room.ceilingRidgeA ?? room.height;
  if (hd < 1e-9) return hC;
  if (z <= 0) {
    const t = (z + hd) / hd;
    return hD + t * (hC - hD);
  }
  const t = z / hd;
  return hC + t * (hA - hC);
}

/**
 * Interior ceiling underside height y at (x,z). Room center is (0,0).
 * Single plane unless `ceilingRidgeAxis` is set (two-slope / pyramid along that axis).
 */
export function ceilingY(room: RoomCeilingShape, x: number, z: number): number {
  const axis = room.ceilingRidgeAxis;
  if (axis === "x") {
    return yRidgeAlongX(room, x);
  }
  if (axis === "z") {
    return yRidgeAlongZ(room, z);
  }
  const sx = room.ceilingSlopeX ?? 0;
  const sz = room.ceilingSlopeZ ?? 0;
  return room.height + sx * x + sz * z;
}

export function ceilingSlopes(room: Pick<Room, "ceilingSlopeX" | "ceilingSlopeZ">): {
  sx: number;
  sz: number;
} {
  return { sx: room.ceilingSlopeX ?? 0, sz: room.ceilingSlopeZ ?? 0 };
}

export function maxCeilingY(room: RoomCeilingShape): number {
  const { width: w, depth: d } = room;
  const hw = w / 2;
  const hd = d / 2;
  if (room.ceilingRidgeAxis === "x") {
    const hD = room.ceilingRidgeD ?? room.height;
    const hC = room.height;
    const hA = room.ceilingRidgeA ?? room.height;
    return Math.max(hD, hC, hA);
  }
  if (room.ceilingRidgeAxis === "z") {
    const hD = room.ceilingRidgeD ?? room.height;
    const hC = room.height;
    const hA = room.ceilingRidgeA ?? room.height;
    return Math.max(hD, hC, hA);
  }
  return Math.max(
    ceilingY(room, -hw, -hd),
    ceilingY(room, hw, -hd),
    ceilingY(room, hw, hd),
    ceilingY(room, -hw, hd)
  );
}

export function minCeilingY(room: RoomCeilingShape): number {
  const { width: w, depth: d } = room;
  const hw = w / 2;
  const hd = d / 2;
  if (room.ceilingRidgeAxis === "x") {
    const hD = room.ceilingRidgeD ?? room.height;
    const hC = room.height;
    const hA = room.ceilingRidgeA ?? room.height;
    return Math.min(hD, hC, hA);
  }
  if (room.ceilingRidgeAxis === "z") {
    const hD = room.ceilingRidgeD ?? room.height;
    const hC = room.height;
    const hA = room.ceilingRidgeA ?? room.height;
    return Math.min(hD, hC, hA);
  }
  return Math.min(
    ceilingY(room, -hw, -hd),
    ceilingY(room, hw, -hd),
    ceilingY(room, hw, hd),
    ceilingY(room, -hw, hd)
  );
}

/** Unit normal pointing from ceiling slab downward into the room (interior). */
export function ceilingNormalDown(
  room: Pick<Room, "ceilingSlopeX" | "ceilingSlopeZ">
): { x: number; y: number; z: number } {
  const { sx, sz } = ceilingSlopes(room);
  const nx = sx;
  const ny = -1;
  const nz = sz;
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-8) return { x: 0, y: -1, z: 0 };
  return { x: nx / len, y: ny / len, z: nz / len };
}

/** Ceiling height at the center of an opening on a wall (interior line). */
export function ceilingYAtWall(
  room: RoomCeilingShape,
  wall: "front" | "back" | "left" | "right",
  alongCenter: number
): number {
  const { width: w, depth: d } = room;
  const hw = w / 2;
  const hd = d / 2;
  switch (wall) {
    case "back":
      return ceilingY(room, alongCenter, -hd);
    case "front":
      return ceilingY(room, alongCenter, hd);
    case "left":
      return ceilingY(room, -hw, alongCenter);
    case "right":
      return ceilingY(room, hw, alongCenter);
  }
}
