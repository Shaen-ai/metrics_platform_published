import type { Opening, Room } from "../types";

/**
 * Interior floor corners of the centered room (Y up, +Z = front).
 * Clockwise from above starting at back-left:
 *   A = back-left (−width/2, −depth/2)   B = back-right
 *   C = front-right                        D = front-left
 *
 * Matches wall names: back z=−d/2, front z=+d/2, left x=−w/2, right x=+w/2.
 * 3D labels use these letters when Room Designer is open; UI copy references the same IDs.
 */
export type RoomCornerId = "A" | "B" | "C" | "D";

export const ROOM_CORNER_IDS: RoomCornerId[] = ["A", "B", "C", "D"];

const LABEL_Y = 0.03;

/** World position for a corner marker (slightly above floor). */
export function cornerFloorPosition(
  id: RoomCornerId,
  room: Pick<Room, "width" | "depth">
): [number, number, number] {
  const hw = room.width / 2;
  const hd = room.depth / 2;
  switch (id) {
    case "A":
      return [-hw, LABEL_Y, -hd];
    case "B":
      return [hw, LABEL_Y, -hd];
    case "C":
      return [hw, LABEL_Y, hd];
    case "D":
      return [-hw, LABEL_Y, hd];
  }
}

/** When facing a wall from inside the room, the opening “left” corner (smaller wall coordinate). */
export function wallOpeningCornerLeft(wall: Opening["wall"]): RoomCornerId {
  switch (wall) {
    case "back":
      return "A";
    case "front":
      return "D";
    case "left":
      return "A";
    case "right":
      return "B";
  }
}

/** When facing a wall from inside the room, the opening “right” corner. */
export function wallOpeningCornerRight(wall: Opening["wall"]): RoomCornerId {
  switch (wall) {
    case "back":
      return "B";
    case "front":
      return "C";
    case "left":
      return "D";
    case "right":
      return "C";
  }
}

/** Edge between the two corners at the ends of a wall (e.g. back → "A–B"). */
export function wallBeamEdgeLabel(wall: Opening["wall"]): string {
  const a = wallOpeningCornerLeft(wall);
  const b = wallOpeningCornerRight(wall);
  return `${a}–${b}`;
}

/** First corner on the wall for “distance from … along wall” copy. */
export function wallBeamReferenceCorner(wall: Opening["wall"]): RoomCornerId {
  return wallOpeningCornerLeft(wall);
}

/** Ceiling beam parallel to X: measure along +X from corners A/D; copy uses A → B. */
export function ceilingAlongRunLabels(axis: "x" | "z"): {
  from: RoomCornerId;
  toward: RoomCornerId;
  edge: string;
} {
  if (axis === "x") {
    return { from: "A", toward: "B", edge: "A–B" };
  }
  return { from: "A", toward: "D", edge: "A–D" };
}

/** Perpendicular offset: for X-run beam, depth (+Z) A → D; for Z-run, width (+X) A → B. */
export function ceilingPerpLabels(axis: "x" | "z"): {
  from: RoomCornerId;
  toward: RoomCornerId;
  edge: string;
} {
  if (axis === "x") {
    return { from: "A", toward: "D", edge: "A–D" };
  }
  return { from: "A", toward: "B", edge: "A–B" };
}

/** Compact UI label for distances measured from a corner along a wall edge (e.g. "From A · A–B"). */
export function fromCornerAlongEdge(from: RoomCornerId, edge: string): string {
  return `From ${from} · ${edge}`;
}
