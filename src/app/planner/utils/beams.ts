import type { Room, RoomBeam } from "../types";
import { getWallLength } from "./openings";
import { ceilingY } from "./roomCeiling";

const MARGIN = 0.05;
/**
 * Tiny inset for numerics / z-fighting: ceiling beams in plan, wall beams vs ceiling plane, column max height.
 * (Wall beams no longer use a large “air gap” under the ceiling — that matched neither tape measure nor the mesh.)
 */
const INTERIOR_GEOMETRY_EPS = 0.002;
const BEAM_LENGTH_MIN = 0.2;
const BEAM_WIDTH_MIN = 0.04;
const BEAM_DEPTH_MIN = 0.04;

export const CEILING_SLOPE_MAX = 0.35;

export function clampBeam(beam: RoomBeam, room: Room): RoomBeam {
  const w = room.width;
  const d = room.depth;
  const hw = w / 2;
  const hd = d / 2;

  let widthM = Math.max(BEAM_WIDTH_MIN, beam.widthM);
  let depthM = Math.max(BEAM_DEPTH_MIN, beam.depthM);
  let lengthM = Math.max(BEAM_LENGTH_MIN, beam.lengthM);
  let position = beam.position;

  if (beam.surface === "wall" && beam.wall) {
    const run = beam.wallRun ?? "horizontal";
    const L = getWallLength(beam.wall, room);
    const half = L / 2;
    const wall = beam.wall;

    if (run === "horizontal") {
      const maxLen = Math.max(BEAM_LENGTH_MIN, L - 2 * MARGIN);
      lengthM = Math.min(lengthM, maxLen);
      const maxCenter = half - lengthM / 2 - MARGIN;
      const minCenter = -maxCenter;
      const cx = position * half;
      const clampedCx = Math.max(minCenter, Math.min(maxCenter, cx));
      position = half > 1e-6 ? clampedCx / half : 0;

      const ceil = ceilingYAtWallCenter(room, wall, clampedCx);
      const maxBottom = Math.max(MARGIN, ceil - widthM - INTERIOR_GEOMETRY_EPS);
      const hasCustomBottom =
        beam.horizontalBottomAboveFloorM !== undefined &&
        beam.horizontalBottomAboveFloorM !== null;

      const next: RoomBeam = {
        ...beam,
        wallRun: "horizontal",
        position,
        lengthM,
        widthM,
        depthM,
      };
      if (hasCustomBottom) {
        next.horizontalBottomAboveFloorM = Math.max(
          MARGIN,
          Math.min(maxBottom, beam.horizontalBottomAboveFloorM!)
        );
      } else {
        delete (next as { horizontalBottomAboveFloorM?: number }).horizontalBottomAboveFloorM;
      }
      delete (next as { verticalBaseAboveFloorM?: number }).verticalBaseAboveFloorM;
      return next;
    }

    const spanAlong = widthM;
    const maxCenter = half - spanAlong / 2 - MARGIN;
    const minCenter = -maxCenter;
    const cx = position * half;
    const clampedCx = Math.max(minCenter, Math.min(maxCenter, cx));
    position = half > 1e-6 ? clampedCx / half : 0;

    const base = Math.max(0, beam.verticalBaseAboveFloorM ?? 0);
    const ceil = ceilingYAtWallCenter(room, wall, clampedCx);
    const maxColH = Math.max(BEAM_LENGTH_MIN, ceil - base - INTERIOR_GEOMETRY_EPS);
    lengthM = Math.min(Math.max(BEAM_LENGTH_MIN, lengthM), maxColH);

    const col: RoomBeam = {
      ...beam,
      wallRun: "vertical",
      position,
      lengthM,
      widthM,
      depthM,
      verticalBaseAboveFloorM: base,
    };
    delete (col as { horizontalBottomAboveFloorM?: number }).horizontalBottomAboveFloorM;
    return col;
  }

  if (beam.surface === "ceiling") {
    const eps = INTERIOR_GEOMETRY_EPS;
    const axis = beam.ceilingAxis ?? "x";
    const perp = beam.ceilingPerpPosition ?? 0;
    if (axis === "x") {
      const maxLen = Math.max(BEAM_LENGTH_MIN, w - 2 * eps);
      lengthM = Math.min(lengthM, maxLen);
      const maxCx = hw - lengthM / 2 - eps;
      const cx = position * hw;
      const clampedCx = Math.max(-maxCx, Math.min(maxCx, cx));
      position = hw > 1e-6 ? clampedCx / hw : 0;
      const maxPz = hd - widthM / 2 - eps;
      const pz = perp * hd;
      const clampedPz = Math.max(-maxPz, Math.min(maxPz, pz));
      const ceilingPerpPosition = hd > 1e-6 ? clampedPz / hd : 0;
      return { ...beam, position, lengthM, widthM, depthM, ceilingAxis: "x", ceilingPerpPosition };
    }
    const maxLen = Math.max(BEAM_LENGTH_MIN, d - 2 * eps);
    lengthM = Math.min(lengthM, maxLen);
    const maxCz = hd - lengthM / 2 - eps;
    const cz = position * hd;
    const clampedCz = Math.max(-maxCz, Math.min(maxCz, cz));
    position = hd > 1e-6 ? clampedCz / hd : 0;
    const maxPx = hw - widthM / 2 - eps;
    const px = perp * hw;
    const clampedPx = Math.max(-maxPx, Math.min(maxPx, px));
    const ceilingPerpPosition = hw > 1e-6 ? clampedPx / hw : 0;
    return { ...beam, position, lengthM, widthM, depthM, ceilingAxis: "z", ceilingPerpPosition };
  }

  return beam;
}

function ceilingYAtWallCenter(
  room: Pick<
    Room,
    | "height"
    | "ceilingSlopeX"
    | "ceilingSlopeZ"
    | "width"
    | "depth"
    | "ceilingRidgeAxis"
    | "ceilingRidgeD"
    | "ceilingRidgeA"
  >,
  wall: NonNullable<RoomBeam["wall"]>,
  alongCenter: number
): number {
  const hw = room.width / 2;
  const hd = room.depth / 2;
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

export function clampBeamsForRoom(room: Room): Room {
  const beams = room.beams;
  if (!beams?.length) return room;
  return { ...room, beams: beams.map((b) => clampBeam(b, room)) };
}

export interface BeamBoxWorld {
  position: [number, number, number];
  rotation: [number, number, number];
  args: [number, number, number];
}

/** Axis-aligned floor (XZ) footprints of vertical wall columns for furniture collision. */
export function getVerticalWallBeamFloorObstacles(
  room: Room
): Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> {
  const out: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> = [];
  for (const b of room.beams ?? []) {
    if (b.surface !== "wall" || (b.wallRun ?? "horizontal") !== "vertical" || !b.wall) continue;
    const box = getWallBeamBox(b, room);
    if (!box) continue;
    const [px, , pz] = box.position;
    const [sx, , sz] = box.args;
    out.push({
      minX: px - sx / 2,
      maxX: px + sx / 2,
      minZ: pz - sz / 2,
      maxZ: pz + sz / 2,
    });
  }
  return out;
}

/** BoxGeometry args (x,y,z) and world transform for a wall-mounted beam. */
export function getWallBeamBox(beam: RoomBeam, room: Room): BeamBoxWorld | null {
  if (beam.surface !== "wall" || !beam.wall) return null;
  const w = room.width;
  const d = room.depth;
  const hw = w / 2;
  const hd = d / 2;
  const L = getWallLength(beam.wall, room);
  const half = L / 2;
  const along = beam.position * half;
  const { lengthM, widthM, depthM } = beam;
  const run = beam.wallRun ?? "horizontal";

  if (run === "vertical") {
    const base = beam.verticalBaseAboveFloorM ?? 0;
    const yc = base + lengthM / 2;
    switch (beam.wall) {
      case "back":
        return {
          position: [along, yc, -hd + depthM / 2],
          rotation: [0, 0, 0],
          args: [widthM, lengthM, depthM],
        };
      case "front":
        return {
          position: [along, yc, hd - depthM / 2],
          rotation: [0, 0, 0],
          args: [widthM, lengthM, depthM],
        };
      case "left":
        return {
          position: [-hw + depthM / 2, yc, along],
          rotation: [0, 0, 0],
          args: [depthM, lengthM, widthM],
        };
      case "right":
        return {
          position: [hw - depthM / 2, yc, along],
          rotation: [0, 0, 0],
          args: [depthM, lengthM, widthM],
        };
    }
  }

  const hasCustomBottom =
    beam.horizontalBottomAboveFloorM !== undefined &&
    beam.horizontalBottomAboveFloorM !== null;
  const mountY = hasCustomBottom
    ? beam.horizontalBottomAboveFloorM! + widthM / 2
    : ceilingYAtWallCenter(room, beam.wall, along) - widthM / 2 - INTERIOR_GEOMETRY_EPS;

  switch (beam.wall) {
    case "back":
      return {
        position: [along, mountY, -hd + depthM / 2],
        rotation: [0, 0, 0],
        args: [lengthM, widthM, depthM],
      };
    case "front":
      return {
        position: [along, mountY, hd - depthM / 2],
        rotation: [0, 0, 0],
        args: [lengthM, widthM, depthM],
      };
    case "left":
      return {
        position: [-hw + depthM / 2, mountY, along],
        rotation: [0, 0, 0],
        args: [depthM, widthM, lengthM],
      };
    case "right":
      return {
        position: [hw - depthM / 2, mountY, along],
        rotation: [0, 0, 0],
        args: [depthM, widthM, lengthM],
      };
  }
}

export function getCeilingBeamBox(beam: RoomBeam, room: Room): BeamBoxWorld | null {
  if (beam.surface !== "ceiling") return null;
  const w = room.width;
  const d = room.depth;
  const hw = w / 2;
  const hd = d / 2;
  const { lengthM, widthM, depthM } = beam;
  const axis = beam.ceilingAxis ?? "x";

  if (axis === "x") {
    const cx = beam.position * hw;
    const cz = (beam.ceilingPerpPosition ?? 0) * hd;
    const y = ceilingY(room, cx, cz) - depthM / 2;
    return {
      position: [cx, y, cz],
      rotation: [0, 0, 0],
      args: [lengthM, depthM, widthM],
    };
  }
  const cz = beam.position * hd;
  const cx = (beam.ceilingPerpPosition ?? 0) * hw;
  const y = ceilingY(room, cx, cz) - depthM / 2;
  return {
    position: [cx, y, cz],
    rotation: [0, 0, 0],
    args: [widthM, depthM, lengthM],
  };
}
