import * as THREE from "three";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";

const csgEvaluator = new Evaluator();
csgEvaluator.useGroups = false;
csgEvaluator.attributes = ["position", "normal"];

const HOLE_DEPTH_MARGIN = 0.06;

export type PolygonWallHoleCut = {
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

/** Unit tangent (XZ) from A → B, length L; outward normal for CCW polygon. */
export function edgeFrame(ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const L = Math.hypot(dx, dz);
  if (L < 1e-9) {
    return { tx: 1, tz: 0, L: 0, ox: 0, oz: 1 };
  }
  const tx = dx / L;
  const tz = dz / L;
  const ox = tz;
  const oz = -tx;
  return { tx, tz, L, ox, oz };
}

/**
 * Cuts along one wall segment from A→B. `along` runs from inner edge midpoint: −halfLen…+halfLen.
 */
export function polygonWallHoleCutsForSegment(
  segAlong0: number,
  segAlong1: number,
  halfLen: number,
  wallOpenings: OpeningLike[],
  ceilingCap: number
): PolygonWallHoleCut[] {
  const cuts: PolygonWallHoleCut[] = [];
  const lo = Math.min(segAlong0, segAlong1);
  const hi = Math.max(segAlong0, segAlong1);
  const sorted = [...wallOpenings].sort((a, b) => a.position - b.position);

  for (const opening of sorted) {
    const openingCenterAlong = opening.position * halfLen;
    const openingHeight = Math.min(
      opening.height || (opening.type === "door" ? 2.1 : 1.2),
      Math.max(0.5, ceilingCap - 0.04)
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

function holeBrushOriented(
  worldX: number,
  worldZ: number,
  rotationY: number,
  halfAlong: number,
  yBottom: number,
  yTop: number,
  thickness: number
): Brush {
  const dx = halfAlong * 2;
  const dy = yTop - yBottom;
  const dz = thickness + HOLE_DEPTH_MARGIN;
  const cy = (yBottom + yTop) / 2;
  const geo = new THREE.BoxGeometry(dx, dy, dz);
  geo.deleteAttribute("uv");
  const brush = new Brush(geo);
  brush.rotation.y = rotationY;
  brush.position.set(worldX, cy, worldZ);
  brush.updateMatrixWorld();
  return brush;
}

/**
 * Vertical wall slab along inner edge A→B, extruded outward by thickness/2, with rectangular holes.
 */
export function createPolygonWallSegmentWithHoles(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  height: number,
  thickness: number,
  cuts: PolygonWallHoleCut[]
): THREE.BufferGeometry {
  const { tx, tz, L, ox, oz } = edgeFrame(ax, az, bx, bz);
  if (L < 1e-6) {
    return new THREE.BufferGeometry();
  }

  const Mx = (ax + bx) / 2;
  const Mz = (az + bz) / 2;
  const mx = Mx + ox * (thickness / 2);
  const mz = Mz + oz * (thickness / 2);
  const rotationY = Math.atan2(-tz, tx);

  const baseGeo = new THREE.BoxGeometry(L, height, thickness);
  baseGeo.deleteAttribute("uv");
  let wallBrush = new Brush(baseGeo);
  wallBrush.rotation.y = rotationY;
  wallBrush.position.set(mx, height / 2, mz);
  wallBrush.updateMatrixWorld();

  if (cuts.length === 0) {
    return wallBrush.geometry;
  }

  for (const cut of cuts) {
    const midAlong = (cut.along0 + cut.along1) / 2;
    const halfAlong = (cut.along1 - cut.along0) / 2;
    const hx = Mx + tx * midAlong + ox * (thickness / 2);
    const hz = Mz + tz * midAlong + oz * (thickness / 2);
    const holeBrush = holeBrushOriented(hx, hz, rotationY, halfAlong, cut.yBottom, cut.yTop, thickness);
    const next = csgEvaluator.evaluate(wallBrush, holeBrush, SUBTRACTION) as Brush;
    wallBrush.geometry.dispose();
    holeBrush.geometry.dispose();
    wallBrush = next;
  }

  const finalGeom = wallBrush.geometry;
  return finalGeom;
}
