import { formatPrice as formatPriceLib } from "@/lib/utils";
import { Room } from "../types";
import { getVerticalWallBeamFloorObstacles } from "./beams";
import { pointInFloorOutline, roomUsesFloorOutline } from "./floorOutline";

/** Clamp value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Snap a value to a grid */
export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

/**
 * Clamp furniture position so the bounding box stays within room bounds.
 * Room is centered at origin: x in [-w/2, w/2], z in [-d/2, d/2].
 * itemWidth and itemDepth are the furniture footprint AFTER rotation.
 * If item is larger than room, centers it at origin.
 */
function clampCenterToFloorOutline(
  x: number,
  z: number,
  itemWidth: number,
  itemDepth: number,
  rotationY: number,
  room: Room
): { x: number; z: number } {
  const outline = room.floorOutline!;
  const cos = Math.abs(Math.cos(rotationY));
  const sin = Math.abs(Math.sin(rotationY));
  const halfW = (itemWidth * cos + itemDepth * sin) / 2;
  const halfD = (itemWidth * sin + itemDepth * cos) / 2;

  let cx = x;
  let cz = z;
  const halfRoomW = room.width / 2;
  const halfRoomD = room.depth / 2;
  cx = clamp(cx, -halfRoomW + halfW, halfRoomW - halfW);
  cz = clamp(cz, -halfRoomD + halfD, halfRoomD - halfD);

  if (pointInFloorOutline(cx, cz, outline)) return { x: cx, z: cz };

  for (let i = 0; i < 28; i++) {
    cx *= 0.88;
    cz *= 0.88;
    if (pointInFloorOutline(cx, cz, outline)) break;
  }
  if (!pointInFloorOutline(cx, cz, outline)) {
    cx = 0;
    cz = 0;
  }
  return { x: cx, z: cz };
}

export function clampToRoom(
  x: number,
  z: number,
  itemWidth: number,
  itemDepth: number,
  rotationY: number,
  room: Room
): { x: number; z: number } {
  if (roomUsesFloorOutline(room)) {
    return clampCenterToFloorOutline(x, z, itemWidth, itemDepth, rotationY, room);
  }

  // Calculate rotated bounding box half-sizes
  const cos = Math.abs(Math.cos(rotationY));
  const sin = Math.abs(Math.sin(rotationY));
  const halfW = (itemWidth * cos + itemDepth * sin) / 2;
  const halfD = (itemWidth * sin + itemDepth * cos) / 2;

  const halfRoomW = room.width / 2;
  const halfRoomD = room.depth / 2;

  // If item is larger than room, center it
  if (halfW >= halfRoomW) {
    x = 0;
  } else {
    x = clamp(x, -halfRoomW + halfW, halfRoomW - halfW);
  }

  if (halfD >= halfRoomD) {
    z = 0;
  } else {
    z = clamp(z, -halfRoomD + halfD, halfRoomD - halfD);
  }

  return { x, z };
}

const OBSTACLE_EPS = 0.008;

function resolveFootprintFromObstacle(
  x: number,
  z: number,
  halfW: number,
  halfD: number,
  obs: { minX: number; maxX: number; minZ: number; maxZ: number }
): { x: number; z: number } {
  const ix0 = x - halfW;
  const ix1 = x + halfW;
  const iz0 = z - halfD;
  const iz1 = z + halfD;
  const ox = Math.min(ix1, obs.maxX) - Math.max(ix0, obs.minX);
  const oz = Math.min(iz1, obs.maxZ) - Math.max(iz0, obs.minZ);
  if (ox <= 0 || oz <= 0) return { x, z };

  const cx = (obs.minX + obs.maxX) / 2;
  const cz = (obs.minZ + obs.maxZ) / 2;
  if (ox < oz) {
    const push = ox + OBSTACLE_EPS;
    return x < cx ? { x: x - push, z } : { x: x + push, z };
  }
  const push = oz + OBSTACLE_EPS;
  return z < cz ? { x, z: z - push } : { x, z: z + push };
}

/**
 * Same as clampToRoom, then nudges (x,z) so the rotated footprint does not overlap
 * vertical wall beam columns (stone pillars).
 */
export function clampFurnitureToRoom(
  x: number,
  z: number,
  itemWidth: number,
  itemDepth: number,
  rotationY: number,
  room: Room
): { x: number; z: number } {
  let { x: cx, z: cz } = clampToRoom(x, z, itemWidth, itemDepth, rotationY, room);
  const obstacles = getVerticalWallBeamFloorObstacles(room);
  if (!obstacles.length) return { x: cx, z: cz };

  const cos = Math.abs(Math.cos(rotationY));
  const sin = Math.abs(Math.sin(rotationY));
  const halfW = (itemWidth * cos + itemDepth * sin) / 2;
  const halfD = (itemWidth * sin + itemDepth * cos) / 2;

  for (let iter = 0; iter < 10; iter++) {
    let changed = false;
    for (const obs of obstacles) {
      const next = resolveFootprintFromObstacle(cx, cz, halfW, halfD, obs);
      if (next.x !== cx || next.z !== cz) {
        cx = next.x;
        cz = next.z;
        changed = true;
      }
    }
    const r = clampToRoom(cx, cz, itemWidth, itemDepth, rotationY, room);
    cx = r.x;
    cz = r.z;
    if (!changed) break;
  }

  return { x: cx, z: cz };
}

/**
 * Compute the target floor-plane position from a drag pointer hit,
 * subtracting the grab offset so the item doesn't jump.
 */
export function computeDragPosition(
  pointerX: number,
  pointerZ: number,
  offsetX: number,
  offsetZ: number
): { x: number; z: number } {
  return { x: pointerX - offsetX, z: pointerZ - offsetZ };
}

/** Format price using the tenant’s main currency (defaults to USD). */
export function formatPrice(price: number, currency: string = "USD"): string {
  return formatPriceLib(price, currency);
}
