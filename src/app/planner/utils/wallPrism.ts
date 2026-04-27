import * as THREE from "three";
import { ceilingY } from "./roomCeiling";
import type { Room } from "../types";

export type WallName = "front" | "back" | "left" | "right";

function pushQuad(positions: number[], indices: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) {
  const base = positions.length / 3;
  for (const p of [a, b, c, d]) {
    positions.push(p.x, p.y, p.z);
  }
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/**
 * Turn indexed geometry into non-indexed triangles, each with the face normal (no vertex averaging).
 * `computeVertexNormals` on a wall prism blends normals at 90° corners so large faces look warped;
 * material flatShading fixes thickness perception but breaks even emissive color. This keeps both.
 */
function applyFaceNormalsNonIndexed(geom: THREE.BufferGeometry) {
  const position = geom.attributes.position as THREE.BufferAttribute;
  const index = geom.index;
  if (!index) {
    geom.computeVertexNormals();
    return;
  }
  const newPositions: number[] = [];
  const newNormals: number[] = [];
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < index.count; i += 3) {
    const ia = index.getX(i);
    const ib = index.getX(i + 1);
    const ic = index.getX(i + 2);
    vA.fromBufferAttribute(position, ia);
    vB.fromBufferAttribute(position, ib);
    vC.fromBufferAttribute(position, ic);
    e1.subVectors(vB, vA);
    e2.subVectors(vC, vA);
    n.crossVectors(e1, e2).normalize();
    for (const j of [ia, ib, ic]) {
      newPositions.push(position.getX(j), position.getY(j), position.getZ(j));
      newNormals.push(n.x, n.y, n.z);
    }
  }
  geom.deleteAttribute("position");
  geom.setIndex(null);
  geom.setAttribute("position", new THREE.Float32BufferAttribute(newPositions, 3));
  geom.setAttribute("normal", new THREE.Float32BufferAttribute(newNormals, 3));
}

/**
 * Wall segment prism: floor y=yBottom to ceiling plane, constant thickness T.
 * `along0` / `along1` along wall run (world X for front/back, world Z for left/right).
 */
export function createWallPrismGeometry(
  wall: WallName,
  along0: number,
  along1: number,
  room: Pick<
    Room,
    | "width"
    | "depth"
    | "height"
    | "ceilingSlopeX"
    | "ceilingSlopeZ"
    | "ceilingRidgeAxis"
    | "ceilingRidgeD"
    | "ceilingRidgeA"
  >,
  T: number,
  yBottom: number
): THREE.BufferGeometry {
  const { width: w, depth: d } = room;
  const hw = w / 2;
  const hd = d / 2;
  const yAt = (x: number, z: number) => ceilingY(room, x, z);

  const positions: number[] = [];
  const indices: number[] = [];

  const a0 = Math.min(along0, along1);
  const a1 = Math.max(along0, along1);

  if (wall === "back") {
    const zOuter = -hd - T;
    const zInner = -hd;
    const x0 = a0;
    const x1 = a1;
    const b00 = new THREE.Vector3(x0, yBottom, zOuter);
    const b10 = new THREE.Vector3(x1, yBottom, zOuter);
    const b11 = new THREE.Vector3(x1, yBottom, zInner);
    const b01 = new THREE.Vector3(x0, yBottom, zInner);
    const t00 = new THREE.Vector3(x0, yAt(x0, zOuter), zOuter);
    const t10 = new THREE.Vector3(x1, yAt(x1, zOuter), zOuter);
    const t11 = new THREE.Vector3(x1, yAt(x1, zInner), zInner);
    const t01 = new THREE.Vector3(x0, yAt(x0, zInner), zInner);

    pushQuad(positions, indices, b00, b10, b11, b01);
    pushQuad(positions, indices, t00, t01, t11, t10);
    pushQuad(positions, indices, b00, t00, t10, b10);
    pushQuad(positions, indices, b11, t11, t01, b01);
    pushQuad(positions, indices, b00, b01, t01, t00);
    pushQuad(positions, indices, b10, t10, t11, b11);
  } else if (wall === "front") {
    const zI = hd;
    const zO = hd + T;
    const x0 = a0;
    const x1 = a1;
    const b00 = new THREE.Vector3(x0, yBottom, zO);
    const b10 = new THREE.Vector3(x1, yBottom, zO);
    const b11 = new THREE.Vector3(x1, yBottom, zI);
    const b01 = new THREE.Vector3(x0, yBottom, zI);
    const t00 = new THREE.Vector3(x0, yAt(x0, zO), zO);
    const t10 = new THREE.Vector3(x1, yAt(x1, zO), zO);
    const t11 = new THREE.Vector3(x1, yAt(x1, zI), zI);
    const t01 = new THREE.Vector3(x0, yAt(x0, zI), zI);

    pushQuad(positions, indices, b00, b10, b11, b01);
    pushQuad(positions, indices, t00, t01, t11, t10);
    // Outer / inner vertical faces: winding must face out of the prism at +Z (outer) and into the room at zI (−Z),
    // unlike the back wall (same vertex order there gives +Z on inner / −Z on outer).
    pushQuad(positions, indices, b00, t00, t10, b10);
    pushQuad(positions, indices, b01, t01, t11, b11);
    pushQuad(positions, indices, b00, b01, t01, t00);
    pushQuad(positions, indices, b10, t10, t11, b11);
  } else if (wall === "left") {
    const xO = -hw - T;
    const xI = -hw;
    const z0 = a0;
    const z1 = a1;
    const b00 = new THREE.Vector3(xO, yBottom, z0);
    const b01 = new THREE.Vector3(xO, yBottom, z1);
    const b11 = new THREE.Vector3(xI, yBottom, z1);
    const b10 = new THREE.Vector3(xI, yBottom, z0);
    const t00 = new THREE.Vector3(xO, yAt(xO, z0), z0);
    const t01 = new THREE.Vector3(xO, yAt(xO, z1), z1);
    const t11 = new THREE.Vector3(xI, yAt(xI, z1), z1);
    const t10 = new THREE.Vector3(xI, yAt(xI, z0), z0);

    pushQuad(positions, indices, b00, b10, b11, b01);
    pushQuad(positions, indices, t00, t01, t11, t10);
    pushQuad(positions, indices, b00, b01, t01, t00);
    pushQuad(positions, indices, b10, t10, t11, b11);
    pushQuad(positions, indices, b00, t00, t10, b10);
    pushQuad(positions, indices, b11, t11, t01, b01);
  } else {
    const xI = hw;
    const xO = hw + T;
    const z0 = a0;
    const z1 = a1;
    const b00 = new THREE.Vector3(xI, yBottom, z0);
    const b10 = new THREE.Vector3(xI, yBottom, z1);
    const b11 = new THREE.Vector3(xO, yBottom, z1);
    const b01 = new THREE.Vector3(xO, yBottom, z0);
    const t00 = new THREE.Vector3(xI, yAt(xI, z0), z0);
    const t10 = new THREE.Vector3(xI, yAt(xI, z1), z1);
    const t11 = new THREE.Vector3(xO, yAt(xO, z1), z1);
    const t01 = new THREE.Vector3(xO, yAt(xO, z0), z0);

    // Bottom / top: cannot reuse the same corner order as the left wall — here b10/b01 sit on z1/z0
    // differently, so (b00,b10,b11,b01) inverts Y normals vs other walls and breaks per-face lighting.
    pushQuad(positions, indices, b00, b01, b11, b10);
    pushQuad(positions, indices, t00, t10, t11, t01);
    // End caps z=z0 / z=z1 (outward −Z / +Z), matching left-wall cap behavior
    pushQuad(positions, indices, b00, t00, t01, b01);
    pushQuad(positions, indices, b10, b11, t11, t10);
    // Inner at xI (−X into room); outer at xO (+X)
    pushQuad(positions, indices, b00, b10, t10, t00);
    pushQuad(positions, indices, b11, b01, t01, t11);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  applyFaceNormalsNonIndexed(geom);
  return geom;
}

/** Thick ceiling: interior bottom follows `ceilingY`; top is +T in Y (ridge uses two bottom panels). */
export function createSlopedCeilingGeometry(
  room: Pick<
    Room,
    | "width"
    | "depth"
    | "height"
    | "ceilingSlopeX"
    | "ceilingSlopeZ"
    | "ceilingRidgeAxis"
    | "ceilingRidgeD"
    | "ceilingRidgeA"
  >,
  T: number,
  margin: number
): THREE.BufferGeometry {
  const { width: w, depth: d } = room;
  const hw = w / 2 + margin;
  const hd = d / 2 + margin;
  const yAt = (x: number, z: number) => ceilingY(room, x, z);

  const positions: number[] = [];
  const indices: number[] = [];
  const up = new THREE.Vector3(0, T, 0);

  if (room.ceilingRidgeAxis === "x") {
    const bFL = new THREE.Vector3(-hw, yAt(-hw, -hd), -hd);
    const bMidF = new THREE.Vector3(0, yAt(0, -hd), -hd);
    const bFR = new THREE.Vector3(hw, yAt(hw, -hd), -hd);
    const bRR = new THREE.Vector3(hw, yAt(hw, hd), hd);
    const bMidR = new THREE.Vector3(0, yAt(0, hd), hd);
    const bRL = new THREE.Vector3(-hw, yAt(-hw, hd), hd);
    const tFL = bFL.clone().add(up);
    const tMidF = bMidF.clone().add(up);
    const tFR = bFR.clone().add(up);
    const tRR = bRR.clone().add(up);
    const tMidR = bMidR.clone().add(up);
    const tRL = bRL.clone().add(up);

    pushQuad(positions, indices, bFL, bMidF, bMidR, bRL);
    pushQuad(positions, indices, bMidF, bFR, bRR, bMidR);
    pushQuad(positions, indices, tFL, tRL, tMidR, tMidF);
    pushQuad(positions, indices, tMidF, tMidR, tRR, tFR);

    pushQuad(positions, indices, bFL, tFL, tMidF, bMidF);
    pushQuad(positions, indices, bMidF, tMidF, tFR, bFR);
    pushQuad(positions, indices, bFR, tFR, tRR, bRR);
    pushQuad(positions, indices, bRR, tRR, tMidR, bMidR);
    pushQuad(positions, indices, bMidR, tMidR, tRL, bRL);
    pushQuad(positions, indices, bRL, tRL, tFL, bFL);
    pushQuad(positions, indices, bMidF, bMidR, tMidR, tMidF);
  } else if (room.ceilingRidgeAxis === "z") {
    const bBL = new THREE.Vector3(-hw, yAt(-hw, -hd), -hd);
    const bBR = new THREE.Vector3(hw, yAt(hw, -hd), -hd);
    const bMR = new THREE.Vector3(hw, yAt(hw, 0), 0);
    const bML = new THREE.Vector3(-hw, yAt(-hw, 0), 0);
    const bTR = new THREE.Vector3(hw, yAt(hw, hd), hd);
    const bTL = new THREE.Vector3(-hw, yAt(-hw, hd), hd);
    const tBL = bBL.clone().add(up);
    const tBR = bBR.clone().add(up);
    const tMR = bMR.clone().add(up);
    const tML = bML.clone().add(up);
    const tTR = bTR.clone().add(up);
    const tTL = bTL.clone().add(up);

    pushQuad(positions, indices, bBL, bBR, bMR, bML);
    pushQuad(positions, indices, bML, bMR, bTR, bTL);
    pushQuad(positions, indices, tBL, tML, tMR, tBR);
    pushQuad(positions, indices, tML, tTL, tTR, tMR);

    pushQuad(positions, indices, bBL, tBL, tBR, bBR);
    pushQuad(positions, indices, bBR, tBR, tMR, bMR);
    pushQuad(positions, indices, bMR, tMR, tTR, bTR);
    pushQuad(positions, indices, bTR, tTR, tTL, bTL);
    pushQuad(positions, indices, bTL, tTL, tML, bML);
    pushQuad(positions, indices, bML, tML, tBL, bBL);
    pushQuad(positions, indices, bML, bMR, tMR, tML);
  } else {
    const bFL = new THREE.Vector3(-hw, yAt(-hw, -hd), -hd);
    const bFR = new THREE.Vector3(hw, yAt(hw, -hd), -hd);
    const bRR = new THREE.Vector3(hw, yAt(hw, hd), hd);
    const bRL = new THREE.Vector3(-hw, yAt(-hw, hd), hd);

    const tFL = bFL.clone().add(up);
    const tFR = bFR.clone().add(up);
    const tRR = bRR.clone().add(up);
    const tRL = bRL.clone().add(up);

    pushQuad(positions, indices, bFL, bFR, bRR, bRL);
    pushQuad(positions, indices, tFL, tRL, tRR, tFR);
    pushQuad(positions, indices, bFL, tFL, tFR, bFR);
    pushQuad(positions, indices, bRR, tRR, tRL, bRL);
    pushQuad(positions, indices, bFL, bRL, tRL, tFL);
    pushQuad(positions, indices, bFR, tFR, tRR, bRR);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}
