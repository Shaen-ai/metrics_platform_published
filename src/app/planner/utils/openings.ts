import type { Opening, Room } from "../types";
import { edgeLength } from "./floorOutline";

export const OPENING_WIDTH_MIN_M = 0.5;
export const OPENING_WIDTH_MAX_M = 3;
export const OPENING_HEIGHT_MIN_M = 0.3;

export function defaultOpeningHeight(type: "door" | "window"): number {
  return type === "door" ? 2.1 : 1.2;
}

/** Cap opening heights so they do not exceed a ceiling plane (meters). */
export function clampOpeningsToCeilingCap(
  openings: Opening[] | undefined,
  ceilingCapM: number
): Opening[] {
  return (openings || []).map((o) => {
    const oh = o.height ?? defaultOpeningHeight(o.type);
    if (oh <= ceilingCapM) return o;
    return { ...o, height: ceilingCapM };
  });
}

export function getWallLength(wall: Opening["wall"], room: Pick<Room, "width" | "depth">): number {
  return wall === "front" || wall === "back" ? room.width : room.depth;
}

/** Wall segment length for clamps and labels: polygon edge when `edgeIndex` is set, else rectangular wall. */
export function getOpeningWallLengthM(
  opening: Opening,
  room: Pick<Room, "width" | "depth" | "floorOutline">
): number {
  const outline = room.floorOutline;
  if (Array.isArray(outline) && outline.length >= 3 && opening.edgeIndex != null) {
    const n = outline.length;
    const ei = ((opening.edgeIndex % n) + n) % n;
    return edgeLength(outline, ei);
  }
  return getWallLength(opening.wall, room);
}

/** Center of opening along wall local axis (same as RoomMesh: `position * halfWidth`). */
export function openingCenterM(position: number, wallLengthM: number): number {
  const halfWidth = wallLengthM / 2;
  return position * halfWidth;
}

/** Distance from left wall corner to left inside edge of opening (meters). */
export function leftEdgeFromCornerM(
  position: number,
  wallLengthM: number,
  openingWidthM: number
): number {
  const halfWidth = wallLengthM / 2;
  return openingCenterM(position, wallLengthM) - openingWidthM / 2 + halfWidth;
}

/** Distance from right wall corner to right inside edge of opening (meters). */
export function rightEdgeFromCornerM(
  position: number,
  wallLengthM: number,
  openingWidthM: number
): number {
  const halfWidth = wallLengthM / 2;
  const cx = openingCenterM(position, wallLengthM);
  return halfWidth - (cx + openingWidthM / 2);
}

function clampCenterM(centerXM: number, wallLengthM: number, openingWidthM: number): number {
  const halfWidth = wallLengthM / 2;
  const minCenter = -halfWidth + openingWidthM / 2;
  const maxCenter = halfWidth - openingWidthM / 2;
  return Math.max(minCenter, Math.min(maxCenter, centerXM));
}

/** Normalized position from distance (m) from left corner to left edge of opening. */
export function positionFromLeftEdgeM(
  dLeftM: number,
  wallLengthM: number,
  openingWidthM: number
): number {
  const halfWidth = wallLengthM / 2;
  if (halfWidth <= 0) return 0;
  const cx = dLeftM + openingWidthM / 2 - halfWidth;
  const clamped = clampCenterM(cx, wallLengthM, openingWidthM);
  return clamped / halfWidth;
}

/** Normalized position from distance (m) from right corner to right edge of opening. */
export function positionFromRightEdgeM(
  dRightM: number,
  wallLengthM: number,
  openingWidthM: number
): number {
  const halfWidth = wallLengthM / 2;
  if (halfWidth <= 0) return 0;
  const cx = halfWidth - openingWidthM / 2 - dRightM;
  const clamped = clampCenterM(cx, wallLengthM, openingWidthM);
  return clamped / halfWidth;
}

/** Keep center in range so the opening fits on the wall (e.g. after width or room resize). */
export function clampPositionValue(
  position: number,
  wallLengthM: number,
  openingWidthM: number
): number {
  const halfWidth = wallLengthM / 2;
  if (halfWidth <= 0) return 0;
  const cx = clampCenterM(openingCenterM(position, wallLengthM), wallLengthM, openingWidthM);
  return cx / halfWidth;
}

/** Distance along wall from the reference corner (position −1 side) to the center of a span (meters). */
export function distanceAlongWallFromCornerToCenterM(
  position: number,
  wallLengthM: number
): number {
  const halfWidth = wallLengthM / 2;
  return openingCenterM(position, wallLengthM) + halfWidth;
}

/** Normalized position from distance along wall from that corner to span center (e.g. wall beam). */
export function positionFromDistanceAlongWallToCenterM(
  distFromCornerM: number,
  wallLengthM: number,
  spanWidthM: number
): number {
  const halfWidth = wallLengthM / 2;
  const centerCoord = distFromCornerM - halfWidth;
  const norm = halfWidth > 1e-9 ? centerCoord / halfWidth : 0;
  return clampPositionValue(norm, wallLengthM, spanWidthM);
}

/**
 * Distance from the reference corner (position −1 side) to the nearest edge of a span along the wall
 * (tape measure from the corner toward the room along that edge).
 */
export function distanceAlongWallFromCornerToNearestEdgeM(
  position: number,
  wallLengthM: number,
  spanAlongWallM: number
): number {
  return Math.max(
    0,
    distanceAlongWallFromCornerToCenterM(position, wallLengthM) - spanAlongWallM / 2
  );
}

/** Normalized position from distance along wall from that corner to the nearest edge of the span. */
export function positionFromDistanceAlongWallToNearestEdgeM(
  distFromCornerToNearestEdgeM: number,
  wallLengthM: number,
  spanAlongWallM: number
): number {
  return positionFromDistanceAlongWallToCenterM(
    distFromCornerToNearestEdgeM + spanAlongWallM / 2,
    wallLengthM,
    spanAlongWallM
  );
}

/** Gap between two intervals on a line (0 if overlapping). */
export function gapBetweenIntervals(
  aLeft: number,
  aRight: number,
  bLeft: number,
  bRight: number
): number {
  if (aRight <= bLeft) return bLeft - aRight;
  if (bRight <= aLeft) return aLeft - bRight;
  return 0;
}

export function getEdgesAlongWall(opening: Opening, wallLengthM: number): { left: number; right: number } {
  const cx = openingCenterM(opening.position, wallLengthM);
  return { left: cx - opening.width / 2, right: cx + opening.width / 2 };
}

export interface WindowClearanceInfo {
  leftCornerToWindowLeftCm: number;
  rightCornerToWindowRightCm: number;
  minGapToAnyDoorCm: number | null;
  gapToPrevWindowCm: number | null;
  gapToNextWindowCm: number | null;
}

/** Clearance metrics for a window on a wall (edge distances in cm). */
export function computeWindowClearance(
  windowId: string,
  wall: Opening["wall"],
  openings: Opening[],
  wallLengthM: number,
  /** When set (polygon footprint), only openings on this perimeter edge are compared. */
  segmentEdgeIndex?: number | null
): WindowClearanceInfo | null {
  const sameSegment = (o: Opening) => {
    if (segmentEdgeIndex != null) return o.edgeIndex === segmentEdgeIndex;
    return o.wall === wall;
  };

  const win = openings.find((o) => o.id === windowId && o.type === "window" && sameSegment(o));
  if (!win) return null;

  const w = getEdgesAlongWall(win, wallLengthM);
  const doorsOnWall = openings.filter((o) => sameSegment(o) && o.type === "door");
  const windowsOnWall = openings
    .filter((o) => sameSegment(o) && o.type === "window")
    .slice()
    .sort((a, b) => a.position - b.position);

  let minDoorGap: number | null = null;
  for (const d of doorsOnWall) {
    const e = getEdgesAlongWall(d, wallLengthM);
    const g = gapBetweenIntervals(w.left, w.right, e.left, e.right);
    if (minDoorGap === null || g < minDoorGap) minDoorGap = g;
  }

  const idx = windowsOnWall.findIndex((o) => o.id === windowId);
  let gapPrev: number | null = null;
  let gapNext: number | null = null;
  if (idx > 0) {
    const prev = windowsOnWall[idx - 1]!;
    const pw = getEdgesAlongWall(prev, wallLengthM);
    gapPrev = gapBetweenIntervals(pw.left, pw.right, w.left, w.right);
  }
  if (idx >= 0 && idx < windowsOnWall.length - 1) {
    const next = windowsOnWall[idx + 1]!;
    const nw = getEdgesAlongWall(next, wallLengthM);
    gapNext = gapBetweenIntervals(w.left, w.right, nw.left, nw.right);
  }

  return {
    leftCornerToWindowLeftCm: leftEdgeFromCornerM(win.position, wallLengthM, win.width) * 100,
    rightCornerToWindowRightCm: rightEdgeFromCornerM(win.position, wallLengthM, win.width) * 100,
    minGapToAnyDoorCm: minDoorGap !== null ? minDoorGap * 100 : null,
    gapToPrevWindowCm: gapPrev !== null ? gapPrev * 100 : null,
    gapToNextWindowCm: gapNext !== null ? gapNext * 100 : null,
  };
}

/** After room width/depth changes, keep openings on-wall. */
export function clampOpeningsForRoom(room: Room): Opening[] {
  return (room.openings || []).map((o) => {
    const len = getOpeningWallLengthM(o, room);
    return { ...o, position: clampPositionValue(o.position, len, o.width) };
  });
}
