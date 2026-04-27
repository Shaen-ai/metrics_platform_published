import * as THREE from "three";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import { ceilingYAtWall } from "./roomCeiling";
import { createWallPrismGeometry, type WallName } from "./wallPrism";
import type { Room } from "../types";

const csgEvaluator = new Evaluator();
csgEvaluator.useGroups = false;
/** Wall prisms have no UVs; default evaluator list includes `uv` and crashes in initFromGeometry. */
csgEvaluator.attributes = ["position", "normal"];

/** Extra depth so the cutter fully punches through the wall prism. */
const HOLE_DEPTH_MARGIN = 0.06;

export type WallHoleCut = {
  along0: number;
  along1: number;
  yBottom: number;
  yTop: number;
};

type OpeningLike = {
  type: string;
  position: number;
  width: number;
  height?: number;
};

/**
 * Boolean box in world space that subtracts one opening from a wall segment [segAlong0, segAlong1].
 */
function holeBrushForCut(
  wall: WallName,
  room: Pick<Room, "width" | "depth">,
  thickness: number,
  cut: WallHoleCut
): Brush {
  const { width: rw, depth: rd } = room;
  const hw = rw / 2;
  const hd = rd / 2;
  const dx = cut.along1 - cut.along0;
  const dy = cut.yTop - cut.yBottom;
  const dz = thickness + HOLE_DEPTH_MARGIN;
  const cx = (cut.along0 + cut.along1) / 2;
  const cy = (cut.yBottom + cut.yTop) / 2;

  let geo: THREE.BoxGeometry;
  let brush: Brush;

  if (wall === "front") {
    geo = new THREE.BoxGeometry(dx, dy, dz);
    geo.deleteAttribute("uv");
    brush = new Brush(geo);
    brush.position.set(cx, cy, hd + thickness / 2);
  } else if (wall === "back") {
    geo = new THREE.BoxGeometry(dx, dy, dz);
    geo.deleteAttribute("uv");
    brush = new Brush(geo);
    brush.position.set(cx, cy, -hd - thickness / 2);
  } else if (wall === "left") {
    const cz = (cut.along0 + cut.along1) / 2;
    geo = new THREE.BoxGeometry(dz, dy, dx);
    geo.deleteAttribute("uv");
    brush = new Brush(geo);
    brush.position.set(-hw - thickness / 2, cy, cz);
  } else {
    const cz = (cut.along0 + cut.along1) / 2;
    geo = new THREE.BoxGeometry(dz, dy, dx);
    geo.deleteAttribute("uv");
    brush = new Brush(geo);
    brush.position.set(hw + thickness / 2, cy, cz);
  }

  brush.updateMatrixWorld();
  return brush;
}

/**
 * Cuts that overlap a wall ridge subsegment (along the wall run), matching RoomMesh opening logic.
 */
export function wallHoleCutsForSegment(
  wallName: WallName,
  room: Room,
  halfWidth: number,
  segAlong0: number,
  segAlong1: number,
  wallOpenings: OpeningLike[]
): WallHoleCut[] {
  const cuts: WallHoleCut[] = [];
  const lo = Math.min(segAlong0, segAlong1);
  const hi = Math.max(segAlong0, segAlong1);

  const sorted = [...wallOpenings].sort((a, b) => a.position - b.position);

  for (const opening of sorted) {
    const openingCenterAlong = opening.position * halfWidth;
    const openCeil = ceilingYAtWall(room, wallName, openingCenterAlong);
    const openingHeight = Math.min(
      opening.height || (opening.type === "door" ? 2.1 : 1.2),
      Math.max(0.5, openCeil - 0.04)
    );
    const openingWidth = opening.width;
    const openingStart = openingCenterAlong - openingWidth / 2;
    const openingEnd = openingCenterAlong + openingWidth / 2;

    const a0 = Math.max(openingStart, lo);
    const a1 = Math.min(openingEnd, hi);
    if (a1 - a0 < 1e-4) continue;

    if (opening.type === "door") {
      cuts.push({ along0: a0, along1: a1, yBottom: 0, yTop: openingHeight });
    } else if (opening.type === "window") {
      const sillHeight = openingHeight > 1.5 ? 0 : 0.8;
      const windowTopY = sillHeight + openingHeight;
      cuts.push({ along0: a0, along1: a1, yBottom: sillHeight, yTop: windowTopY });
    }
  }

  return cuts;
}

/**
 * Full-height wall prism for [segAlong0, segAlong1] with rectangular holes subtracted (CSG).
 */
export function createWallPrismWithHoles(
  wall: WallName,
  segAlong0: number,
  segAlong1: number,
  room: Room,
  thickness: number,
  cuts: WallHoleCut[]
): THREE.BufferGeometry {
  const baseGeom = createWallPrismGeometry(wall, segAlong0, segAlong1, room, thickness, 0);

  if (cuts.length === 0) {
    return baseGeom;
  }

  let wallBrush = new Brush(baseGeom);
  wallBrush.updateMatrixWorld();

  for (const cut of cuts) {
    const holeBrush = holeBrushForCut(wall, room, thickness, cut);
    const next = csgEvaluator.evaluate(wallBrush, holeBrush, SUBTRACTION) as Brush;
    wallBrush.geometry.dispose();
    holeBrush.geometry.dispose();
    wallBrush = next;
  }

  return wallBrush.geometry;
}
