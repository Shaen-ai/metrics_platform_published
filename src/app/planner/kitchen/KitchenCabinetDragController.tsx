"use client";

import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useKitchenStore } from "./store";
import type { KitchenCabinetDragRun, KitchenModule, WallAlignGuide, FloorAlignGuide } from "./types";
import { getEffectiveBaseDims, getEffectiveWallDims, WALL_MOUNT_Y, WALL_CABINET_HEIGHT } from "./data";

const CM = 0.01;
const ROOM_HEIGHT_CM = 300;
const MIN_ROOM_WIDTH_M = 3.5;

/** Compute the interior wall width in cm (same formula as KitchenRoom). */
function getWallWidthCm(st: ReturnType<typeof useKitchenStore.getState>): number {
  const { config, room } = st;
  const totalBase = config.baseModules.reduce((s, m) => s + m.width, 0);
  const islandW = config.island.enabled
    ? config.island.baseModules.reduce((s, m) => s + m.width, 0)
    : 0;
  const spanCm = Math.max(totalBase, islandW + Math.abs(config.island.offsetXCm));
  let fpW = room.footprintWidthM;
  if (room.floorOutline && room.floorOutline.length >= 3) {
    let minX = Infinity, maxX = -Infinity;
    for (const p of room.floorOutline) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); }
    fpW = maxX - minX;
  }
  const rwM = Math.max(spanCm * CM + 1.6, fpW, MIN_ROOM_WIDTH_M);
  return rwM / CM;
}

/** Clamp position so the module stays fully inside the wall rectangle. */
function clampToWall(
  x: number,
  y: number,
  hw: number,
  hh: number,
  wallWidthCm: number,
): { xCm: number; yCm: number } {
  return {
    xCm: Math.max(hw, Math.min(wallWidthCm - hw, x)),
    yCm: Math.max(hh, Math.min(ROOM_HEIGHT_CM - hh, y)),
  };
}

export type KitchenDragUserData = {
  kitchenDrag: {
    run: KitchenCabinetDragRun;
    moduleId: string;
    index: number;
  };
};

function reorderWidths(widths: number[], from: number, to: number): number[] {
  const w = [...widths];
  const [item] = w.splice(from, 1);
  w.splice(to, 0, item);
  return w;
}

function centerCmAfterReorder(widths: number[], from: number, to: number): number {
  const w = reorderWidths(widths, from, to);
  let cum = 0;
  for (let i = 0; i < to; i++) cum += w[i];
  return cum + w[to] / 2;
}

function bestTargetIndex(xCm: number, widths: number[], fromIdx: number): number {
  const n = widths.length;
  if (n <= 1) return fromIdx;
  let best = fromIdx;
  let bestD = Infinity;
  for (let to = 0; to < n; to++) {
    if (to === fromIdx) continue;
    const c = centerCmAfterReorder(widths, fromIdx, to);
    const d = Math.abs(c - xCm);
    if (d < bestD) {
      bestD = d;
      best = to;
    }
  }
  return best;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/** Corner base units stay in the run order; free X-drag along the floor would fight layout — selection only. */
function baseModuleForDragHit(
  run: KitchenCabinetDragRun,
  moduleId: string,
  st: ReturnType<typeof useKitchenStore.getState>,
): KitchenModule | undefined {
  const { config } = st;
  switch (run) {
    case "main-base":
      return config.baseModules.find((m) => m.id === moduleId);
    case "island-base":
      return config.island.baseModules.find((m) => m.id === moduleId);
    case "left-base":
      return config.leftWall.baseModules.find((m) => m.id === moduleId);
    default:
      return undefined;
  }
}

function hitKitchenDrag(
  raycaster: THREE.Raycaster,
  scene: THREE.Scene,
): KitchenDragUserData["kitchenDrag"] | null {
  const hits = raycaster.intersectObject(scene, true);
  for (const h of hits) {
    let o: THREE.Object3D | null = h.object;
    while (o) {
      const kd = o.userData?.kitchenDrag as KitchenDragUserData["kitchenDrag"] | undefined;
      if (kd) return kd;
      o = o.parent;
    }
  }
  return null;
}

function distToAxisAlignedRect(
  px: number,
  pz: number,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
): number {
  const dx = px < x0 ? x0 - px : px > x1 ? px - x1 : 0;
  const dz = pz < z0 ? z0 - pz : pz > z1 ? pz - z1 : 0;
  return Math.hypot(dx, dz);
}

function distToSegment2D(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const ab2 = abx * abx + abz * abz;
  if (ab2 < 1e-12) return Math.hypot(apx, apz);
  const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / ab2));
  const cx = ax + t * abx;
  const cz = az + t * abz;
  return Math.hypot(px - cx, pz - cz);
}

function islandLocalXCmToWorldXZ(
  localXCm: number,
  mainCenterXM: number,
  offsetXCm: number,
  offsetZCm: number,
  rotationYRad: number,
): [number, number] {
  const ox = mainCenterXM + offsetXCm * CM;
  const oz = offsetZCm * CM;
  const xm = localXCm * CM;
  return [ox + Math.cos(rotationYRad) * xm, oz + Math.sin(rotationYRad) * xm];
}

function indexContainingX(xCm: number, modules: { width: number }[]): number {
  if (modules.length === 0) return -1;
  let cum = 0;
  for (let i = 0; i < modules.length; i++) {
    const w = modules[i].width;
    if (xCm >= cum && xCm <= cum + w) return i;
    cum += w;
  }
  cum = 0;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < modules.length; i++) {
    const c = cum + modules[i].width / 2;
    const d = Math.abs(xCm - c);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
    cum += modules[i].width;
  }
  return best;
}

type Cand = { kind: KitchenDragUserData["kitchenDrag"]; dist: number };

function pickRunFromFloor(
  floor: THREE.Vector3,
  st: ReturnType<typeof useKitchenStore.getState>,
  mainCenterXM: number,
): KitchenDragUserData["kitchenDrag"] | null {
  const { config } = st;
  const fx = floor.x;
  const fz = floor.z;
  const candidates: Cand[] = [];

  if (config.baseModules.length > 0) {
    const cornerBackW = config.cornerUnit.enabled ? config.cornerUnit.backWingWidthCm : 0;
    const total = config.baseModules.reduce((s, m) => s + m.width, 0);
    const maxD = Math.max(
      ...config.baseModules.map((m) => getEffectiveBaseDims(m).d * CM),
    );
    const d = distToAxisAlignedRect(fx, fz, cornerBackW * CM, (cornerBackW + total) * CM, 0, maxD + 0.25);
    if (d < 1.0) {
      const xCm = clamp(fx / CM - cornerBackW, 0, total);
      const idx = indexContainingX(xCm, config.baseModules);
      candidates.push({
        kind: {
          run: "main-base",
          moduleId: config.baseModules[idx].id,
          index: idx,
        },
        dist: d,
      });
    }
  }

  if (config.hasWallCabinets && config.wallModules.length > 0 && config.baseModules.length > 0) {
    const totalBase = config.baseModules.reduce((s, m) => s + m.width, 0);
    const totalWall = config.wallModules.reduce((s, m) => s + m.width, 0);
    const wallStartCm = (totalBase - totalWall) / 2;
    const maxD = Math.max(
      ...config.wallModules.map((m) => getEffectiveWallDims(m).d * CM),
    );
    const x0 = wallStartCm * CM;
    const x1 = (wallStartCm + totalWall) * CM;
    const d = distToAxisAlignedRect(fx, fz, x0, x1, 0, maxD + 0.25);
    if (d < 1.0) {
      const xCm = clamp(fx / CM, wallStartCm, wallStartCm + totalWall);
      const xRel = xCm - wallStartCm;
      const idx = indexContainingX(xRel, config.wallModules);
      candidates.push({
        kind: {
          run: "main-wall",
          moduleId: config.wallModules[idx].id,
          index: idx,
        },
        dist: d,
      });
    }
  }

  if (config.island.enabled && config.island.baseModules.length > 0) {
    const isl = config.island;
    const total = isl.baseModules.reduce((s, m) => s + m.width, 0);
    const [x0, z0] = islandLocalXCmToWorldXZ(0, mainCenterXM, isl.offsetXCm, isl.offsetZCm, isl.rotationYRad);
    const [x1, z1] = islandLocalXCmToWorldXZ(total, mainCenterXM, isl.offsetXCm, isl.offsetZCm, isl.rotationYRad);
    const d = distToSegment2D(fx, fz, x0, z0, x1, z1);
    const t = xCmAlongIslandRun(
      fx,
      fz,
      mainCenterXM,
      isl.offsetXCm,
      isl.offsetZCm,
      isl.rotationYRad,
    );
    if (d < 1.0 && t >= 0 && t <= total) {
      const idx = indexContainingX(t, isl.baseModules);
      candidates.push({
        kind: {
          run: "island-base",
          moduleId: isl.baseModules[idx].id,
          index: idx,
        },
        dist: d,
      });
    }
  }

  if (config.island.enabled && config.island.wallModules.length > 0 && config.island.baseModules.length > 0) {
    const isl = config.island;
    const islandBaseW = isl.baseModules.reduce((s, m) => s + m.width, 0);
    const islandWallW = isl.wallModules.reduce((s, m) => s + m.width, 0);
    const islandWallStart = (islandBaseW - islandWallW) / 2;
    const [x0, z0] = islandLocalXCmToWorldXZ(
      islandWallStart,
      mainCenterXM,
      isl.offsetXCm,
      isl.offsetZCm,
      isl.rotationYRad,
    );
    const [x1, z1] = islandLocalXCmToWorldXZ(
      islandWallStart + islandWallW,
      mainCenterXM,
      isl.offsetXCm,
      isl.offsetZCm,
      isl.rotationYRad,
    );
    const d = distToSegment2D(fx, fz, x0, z0, x1, z1);
    const t = xCmAlongIslandRun(
      fx,
      fz,
      mainCenterXM,
      isl.offsetXCm,
      isl.offsetZCm,
      isl.rotationYRad,
    );
    if (d < 1.0 && t >= islandWallStart && t <= islandWallStart + islandWallW) {
      const xRel = t - islandWallStart;
      const idx = indexContainingX(xRel, isl.wallModules);
      candidates.push({
        kind: {
          run: "island-wall",
          moduleId: isl.wallModules[idx].id,
          index: idx,
        },
        dist: d,
      });
    }
  }

  // Left wall base modules (along +Z, at x≈0)
  if (config.leftWall.enabled && config.leftWall.baseModules.length > 0 && config.cornerUnit.enabled) {
    const cornerLeftW = config.cornerUnit.leftWingWidthCm;
    const total = config.leftWall.baseModules.reduce((s, m) => s + m.width, 0);
    const maxD = Math.max(
      ...config.leftWall.baseModules.map((m) => getEffectiveBaseDims(m).d * CM),
    );
    const z0 = cornerLeftW * CM;
    const z1 = (cornerLeftW + total) * CM;
    const d = distToAxisAlignedRect(fz, fx, z0, z1, 0, maxD + 0.25);
    if (d < 1.0) {
      const zCm = clamp(fz / CM - cornerLeftW, 0, total);
      const idx = indexContainingX(zCm, config.leftWall.baseModules);
      candidates.push({
        kind: {
          run: "left-base",
          moduleId: config.leftWall.baseModules[idx].id,
          index: idx,
        },
        dist: d,
      });
    }
  }

  // Left wall wall modules (along +Z, at x≈0)
  if (config.leftWall.enabled && config.leftWall.hasWallCabinets && config.leftWall.wallModules.length > 0 && config.cornerUnit.enabled) {
    const cornerLeftW = config.cornerUnit.leftWingWidthCm;
    const leftBaseW = config.leftWall.baseModules.reduce((s, m) => s + m.width, 0);
    const leftWallW = config.leftWall.wallModules.reduce((s, m) => s + m.width, 0);
    const leftWallStart = (leftBaseW - leftWallW) / 2;
    const maxD = Math.max(
      ...config.leftWall.wallModules.map((m) => getEffectiveWallDims(m).d * CM),
    );
    const z0 = (cornerLeftW + leftWallStart) * CM;
    const z1 = (cornerLeftW + leftWallStart + leftWallW) * CM;
    const d = distToAxisAlignedRect(fz, fx, z0, z1, 0, maxD + 0.25);
    if (d < 1.0) {
      const zCm = clamp(fz / CM - cornerLeftW - leftWallStart, 0, leftWallW);
      const idx = indexContainingX(zCm, config.leftWall.wallModules);
      candidates.push({
        kind: {
          run: "left-wall",
          moduleId: config.leftWall.wallModules[idx].id,
          index: idx,
        },
        dist: d,
      });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.dist - b.dist);
  return candidates[0].kind;
}

function selectModuleForRun(
  run: KitchenCabinetDragRun,
  moduleId: string,
  st: ReturnType<typeof useKitchenStore.getState>,
): void {
  switch (run) {
    case "main-base":
      st.selectBaseModule(moduleId);
      break;
    case "main-wall":
      st.selectWallModule(moduleId);
      break;
    case "island-base":
      st.selectIslandBaseModule(moduleId);
      break;
    case "island-wall":
      st.selectIslandWallModule(moduleId);
      break;
    case "left-base":
      st.selectLeftBaseModule(moduleId);
      break;
    case "left-wall":
      st.selectLeftWallModule(moduleId);
      break;
    default:
      break;
  }
}

function applyReorder(
  run: KitchenCabinetDragRun,
  from: number,
  to: number,
  st: ReturnType<typeof useKitchenStore.getState>,
): void {
  if (from === to) return;
  switch (run) {
    case "main-base":
      st.reorderBaseModules(from, to);
      break;
    case "main-wall":
      st.reorderWallModules(from, to);
      break;
    case "island-base":
      st.reorderIslandBaseModules(from, to);
      break;
    case "island-wall":
      st.reorderIslandWallModules(from, to);
      break;
    case "left-base":
      st.reorderLeftBaseModules(from, to);
      break;
    case "left-wall":
      st.reorderLeftWallModules(from, to);
      break;
    default:
      break;
  }
}

function xCmAlongMainWall(hitX: number): number {
  return hitX / CM;
}

function xCmAlongIslandRun(
  hitX: number,
  hitZ: number,
  mainCenterXM: number,
  offsetXCm: number,
  offsetZCm: number,
  rotationYRad: number,
): number {
  const px = mainCenterXM + offsetXCm * CM;
  const pz = offsetZCm * CM;
  const vx = hitX - px;
  const vz = hitZ - pz;
  const t = vx * Math.cos(rotationYRad) + vz * Math.sin(rotationYRad);
  return t / CM;
}

/** Compute the default (run-based layout) X/Y position of a wall module in cm. */
function defaultWallModulePosCm(
  moduleId: string,
  wallModules: KitchenModule[],
  baseModules: KitchenModule[],
): { xCm: number; yCm: number } | null {
  const idx = wallModules.findIndex((m) => m.id === moduleId);
  if (idx < 0) return null;
  const mod = wallModules[idx];
  const dim = getEffectiveWallDims(mod);
  const totalBase = baseModules.reduce((s, m) => s + m.width, 0);
  const totalWall = wallModules.reduce((s, m) => s + m.width, 0);
  const wallStartCm = (totalBase - totalWall) / 2;
  let cum = 0;
  for (let i = 0; i < idx; i++) cum += wallModules[i].width;
  const xCm = wallStartCm + cum + dim.w / 2;
  const isHood = mod.type === "hood-unit";
  const yCm = isHood
    ? WALL_MOUNT_Y + dim.h * 0.55 / 2
    : WALL_MOUNT_Y + dim.h / 2;
  return { xCm, yCm };
}

/** Compute the default position of an island wall module in island-local cm. */
function defaultIslandWallModulePosCm(
  moduleId: string,
  wallModules: KitchenModule[],
  islandBaseModules: KitchenModule[],
): { xCm: number; yCm: number } | null {
  const idx = wallModules.findIndex((m) => m.id === moduleId);
  if (idx < 0) return null;
  const mod = wallModules[idx];
  const dim = getEffectiveWallDims(mod);
  const islandBaseW = islandBaseModules.reduce((s, m) => s + m.width, 0);
  const islandWallW = wallModules.reduce((s, m) => s + m.width, 0);
  const wallStartCm = (islandBaseW - islandWallW) / 2;
  let cum = 0;
  for (let i = 0; i < idx; i++) cum += wallModules[i].width;
  const xCm = wallStartCm + cum + dim.w / 2;
  const isHood = mod.type === "hood-unit";
  const yCm = isHood
    ? WALL_MOUNT_Y + dim.h * 0.55 / 2
    : WALL_MOUNT_Y + dim.h / 2;
  return { xCm, yCm };
}

type WallRect = {
  id: string;
  cx: number;
  cy: number;
  hw: number;
  hh: number;
};

/** Push desired position out of all other rects so modules can touch but never overlap. */
function resolveWallCollisions(
  desiredX: number,
  desiredY: number,
  draggedHW: number,
  draggedHH: number,
  draggedId: string,
  others: WallRect[],
): { xCm: number; yCm: number } {
  let x = desiredX;
  let y = desiredY;

  for (let pass = 0; pass < 4; pass++) {
    let resolved = true;
    for (const o of others) {
      if (o.id === draggedId) continue;
      const overlapX = (draggedHW + o.hw) - Math.abs(x - o.cx);
      const overlapY = (draggedHH + o.hh) - Math.abs(y - o.cy);
      if (overlapX > 0.01 && overlapY > 0.01) {
        resolved = false;
        if (overlapX < overlapY) {
          x += x < o.cx ? -overlapX : overlapX;
        } else {
          y += y < o.cy ? -overlapY : overlapY;
        }
      }
    }
    if (resolved) break;
  }

  return { xCm: x, yCm: Math.max(0, y) };
}

const SNAP_THRESHOLD_CM = 3;
/** Same as snap: show floor↔wall vertical guides whenever alignment is within snap range (0.5 was too tight vs collision/clamp). */
const WALL_BASE_GUIDE_THRESHOLD_CM = SNAP_THRESHOLD_CM;

function dedupeWallAlignGuides(guides: WallAlignGuide[]): WallAlignGuide[] {
  const seen = new Set<string>();
  return guides.filter((g) => {
    const k = `${g.axis}:${Math.round(g.posCm * 10)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Snap X to base run edges/centers (same 1D checks as base↔wall alignment). */
function snapXToBaseSegments(
  x: number,
  hw: number,
  dragL: number,
  dragR: number,
  baseSegments: BaseSegment[],
  T: number,
  bestDx: number,
  sx: number,
): { bestDx: number; sx: number } {
  let b = bestDx;
  let out = sx;
  for (const o of baseSegments) {
    const oL = o.cx - o.hw;
    const oR = o.cx + o.hw;
    const xChecks = [
      { d: Math.abs(x - o.cx), snap: o.cx },
      { d: Math.abs(dragL - oL), snap: oL + hw },
      { d: Math.abs(dragR - oR), snap: oR - hw },
      { d: Math.abs(dragL - oR), snap: oR + hw },
      { d: Math.abs(dragR - oL), snap: oL - hw },
    ];
    for (const c of xChecks) {
      if (c.d < T && c.d < b) {
        b = c.d;
        out = c.snap;
      }
    }
  }
  return { bestDx: b, sx: out };
}

/** Detect alignment with other wall modules and with floor (base) run; optionally snap. */
function snapToAlignments(
  x: number,
  y: number,
  hw: number,
  hh: number,
  draggedId: string,
  others: WallRect[],
  baseSegments: BaseSegment[],
): { xCm: number; yCm: number } {
  let sx = x;
  let sy = y;
  const T = SNAP_THRESHOLD_CM;

  const dragL = x - hw;
  const dragR = x + hw;
  const dragT = y + hh;
  const dragB = y - hh;

  let bestDx = T + 1;
  let bestDy = T + 1;

  for (const o of others) {
    if (o.id === draggedId) continue;
    const oL = o.cx - o.hw;
    const oR = o.cx + o.hw;
    const oT = o.cy + o.hh;
    const oB = o.cy - o.hh;

    const xChecks = [
      { d: Math.abs(x - o.cx), snap: o.cx },
      { d: Math.abs(dragL - oL), snap: oL + hw },
      { d: Math.abs(dragR - oR), snap: oR - hw },
      { d: Math.abs(dragL - oR), snap: oR + hw },
      { d: Math.abs(dragR - oL), snap: oL - hw },
    ];
    for (const c of xChecks) {
      if (c.d < T && c.d < bestDx) {
        bestDx = c.d;
        sx = c.snap;
      }
    }

    const yChecks = [
      { d: Math.abs(y - o.cy), snap: o.cy },
      { d: Math.abs(dragT - oT), snap: oT - hh },
      { d: Math.abs(dragB - oB), snap: oB + hh },
      { d: Math.abs(dragT - oB), snap: oB - hh },
      { d: Math.abs(dragB - oT), snap: oT + hh },
    ];
    for (const c of yChecks) {
      if (c.d < T && c.d < bestDy) {
        bestDy = c.d;
        sy = c.snap;
      }
    }
  }

  const baseSnap = snapXToBaseSegments(x, hw, dragL, dragR, baseSegments, T, bestDx, sx);
  sx = baseSnap.sx;

  return { xCm: sx, yCm: Math.max(0, sy) };
}

/** True when wall center/edges line up with a base module in plan (same X column as floor cabinet). */
function wallAlignedWithBaseSegment(
  x: number,
  snappedL: number,
  snappedR: number,
  o: BaseSegment,
  thresholdCm: number,
): boolean {
  const oL = o.cx - o.hw;
  const oR = o.cx + o.hw;
  return (
    Math.abs(x - o.cx) < thresholdCm ||
    Math.abs(snappedL - oL) < thresholdCm ||
    Math.abs(snappedR - oR) < thresholdCm ||
    Math.abs(snappedL - oR) < thresholdCm ||
    Math.abs(snappedR - oL) < thresholdCm
  );
}

/** Guide lines for the final wall position (after collision/clamp), including vertical match with base run on main wall. */
function buildWallAlignmentGuidesForPosition(
  x: number,
  y: number,
  hw: number,
  hh: number,
  draggedId: string,
  wallRects: WallRect[],
  baseSegments: BaseSegment[],
  showMainWallBaseGuides: boolean,
): { wallGuides: WallAlignGuide[]; floorGuides: FloorAlignGuide[] } {
  const wallGuides: WallAlignGuide[] = [];
  const snappedL = x - hw;
  const snappedR = x + hw;
  const snappedT = y + hh;
  const snappedB = y - hh;

  for (const o of wallRects) {
    if (o.id === draggedId) continue;
    const oL = o.cx - o.hw;
    const oR = o.cx + o.hw;
    const oT = o.cy + o.hh;
    const oB = o.cy - o.hh;

    if (Math.abs(x - o.cx) < 0.5) wallGuides.push({ axis: "v", posCm: o.cx });
    if (Math.abs(snappedL - oL) < 0.5) wallGuides.push({ axis: "v", posCm: oL });
    if (Math.abs(snappedR - oR) < 0.5) wallGuides.push({ axis: "v", posCm: oR });
    if (Math.abs(snappedL - oR) < 0.5) wallGuides.push({ axis: "v", posCm: oR });
    if (Math.abs(snappedR - oL) < 0.5) wallGuides.push({ axis: "v", posCm: oL });

    if (Math.abs(y - o.cy) < 0.5) wallGuides.push({ axis: "h", posCm: o.cy });
    if (Math.abs(snappedT - oT) < 0.5) wallGuides.push({ axis: "h", posCm: oT });
    if (Math.abs(snappedB - oB) < 0.5) wallGuides.push({ axis: "h", posCm: oB });
    if (Math.abs(snappedT - oB) < 0.5) wallGuides.push({ axis: "h", posCm: oB });
    if (Math.abs(snappedB - oT) < 0.5) wallGuides.push({ axis: "h", posCm: oT });
  }

  const floorGuides: FloorAlignGuide[] = [];
  if (showMainWallBaseGuides) {
    const T = WALL_BASE_GUIDE_THRESHOLD_CM;
    for (const o of baseSegments) {
      if (!wallAlignedWithBaseSegment(x, snappedL, snappedR, o, T)) continue;
      const oL = o.cx - o.hw;
      const oR = o.cx + o.hw;
      if (Math.abs(x - o.cx) < T) {
        wallGuides.push({ axis: "v", posCm: o.cx });
        floorGuides.push({ xCm: o.cx });
      }
      if (Math.abs(snappedL - oL) < T) {
        wallGuides.push({ axis: "v", posCm: oL });
        floorGuides.push({ xCm: oL });
      }
      if (Math.abs(snappedR - oR) < T) {
        wallGuides.push({ axis: "v", posCm: oR });
        floorGuides.push({ xCm: oR });
      }
      if (Math.abs(snappedL - oR) < T) {
        wallGuides.push({ axis: "v", posCm: oR });
        floorGuides.push({ xCm: oR });
      }
      if (Math.abs(snappedR - oL) < T) {
        wallGuides.push({ axis: "v", posCm: oL });
        floorGuides.push({ xCm: oL });
      }
    }
    const seenF = new Set<number>();
    const uniqueF = floorGuides.filter((g) => {
      const k = Math.round(g.xCm * 10);
      if (seenF.has(k)) return false;
      seenF.add(k);
      return true;
    });
    return {
      wallGuides: dedupeWallAlignGuides(wallGuides),
      floorGuides: uniqueF,
    };
  }

  return { wallGuides: dedupeWallAlignGuides(wallGuides), floorGuides: [] };
}

function effectiveWallHW(mod: KitchenModule): number {
  const dim = getEffectiveWallDims(mod);
  return (mod.type === "hood-unit" ? dim.w * 0.9 : dim.w) / 2;
}

function effectiveWallHH(mod: KitchenModule): number {
  const dim = getEffectiveWallDims(mod);
  return (mod.type === "hood-unit" ? dim.h * 0.55 : dim.h) / 2;
}

/** Build collision rects for all wall modules in a run, using free-form pos when available or falling back to default layout. */
function buildWallRects(
  wallModules: KitchenModule[],
  baseModules: KitchenModule[],
  isIsland: boolean,
): WallRect[] {
  const totalBase = baseModules.reduce((s, m) => s + m.width, 0);
  const totalWall = wallModules.reduce((s, m) => s + m.width, 0);
  const wallStartCm = isIsland
    ? (totalBase - totalWall) / 2
    : (totalBase - totalWall) / 2;
  let cum = 0;

  return wallModules.map((mod) => {
    const hw = effectiveWallHW(mod);
    const hh = effectiveWallHH(mod);
    let cx: number;
    let cy: number;
    if (mod.xCm !== undefined && mod.yCm !== undefined) {
      cx = mod.xCm;
      cy = mod.yCm;
    } else {
      cx = wallStartCm + cum + hw;
      cy = WALL_MOUNT_Y + hh;
    }
    cum += mod.width;
    return { id: mod.id, cx, cy, hw, hh };
  });
}

/** Compute the current center X position (cm) of a base module, accounting for xCm free-form or sequential layout. */
function getBaseModuleCurrentXCm(
  run: KitchenCabinetDragRun,
  moduleId: string,
  st: ReturnType<typeof useKitchenStore.getState>,
): number | null {
  const { config } = st;
  let modules: KitchenModule[];
  let startOffset: number;

  switch (run) {
    case "main-base":
      modules = config.baseModules;
      startOffset = config.cornerUnit.enabled ? config.cornerUnit.backWingWidthCm : 0;
      break;
    case "island-base":
      modules = config.island.baseModules;
      startOffset = 0;
      break;
    case "left-base":
      // Inner run coords only — parent group is offset by cornerLeftW in world Z (see KitchenCabinets3D).
      modules = config.leftWall.baseModules;
      startOffset = 0;
      break;
    default:
      return null;
  }

  const mod = modules.find((m) => m.id === moduleId);
  if (!mod) return null;
  const dim = getEffectiveBaseDims(mod);

  if (mod.xCm !== undefined) return mod.xCm;

  let cum = startOffset;
  for (const m of modules) {
    if (m.id === moduleId) return cum + dim.w / 2;
    cum += m.width;
  }
  return null;
}

type BaseSegment = { id: string; cx: number; hw: number };

/** Build 1D segments for all base modules in a run (center X + half-width). */
function buildBaseSegments(
  modules: KitchenModule[],
  startOffset: number,
): BaseSegment[] {
  let cum = startOffset;
  return modules.map((mod) => {
    const dim = getEffectiveBaseDims(mod);
    const hw = dim.w / 2;
    const cx = mod.xCm !== undefined ? mod.xCm : cum + hw;
    cum += mod.width;
    return { id: mod.id, cx, hw };
  });
}

/** Build 1D X-axis segments from wall modules (for cross-run alignment with base modules). */
function buildWallSegmentsForAlignment(
  wallModules: KitchenModule[],
  baseModules: KitchenModule[],
  cornerBackW: number,
): BaseSegment[] {
  const totalBase = baseModules.reduce((s, m) => s + m.width, 0) + cornerBackW;
  const totalWall = wallModules.reduce((s, m) => s + m.width, 0);
  const wallStartCm = (totalBase - totalWall) / 2;
  let cum = 0;

  return wallModules.map((mod) => {
    const hw = effectiveWallHW(mod);
    let cx: number;
    if (mod.xCm !== undefined) {
      cx = mod.xCm;
    } else {
      cx = wallStartCm + cum + hw;
    }
    cum += mod.width;
    return { id: mod.id, cx, hw };
  });
}

/** Push desired X so the dragged module doesn't overlap any other module on the same run.
 *  Uses merged forbidden-interval approach so it can't oscillate between neighbours. */
function resolveBaseCollisions(
  desiredX: number,
  draggedHW: number,
  draggedId: string,
  others: BaseSegment[],
): number {
  const forbidden: [number, number][] = [];
  for (const o of others) {
    if (o.id === draggedId) continue;
    forbidden.push([o.cx - o.hw - draggedHW, o.cx + o.hw + draggedHW]);
  }
  if (forbidden.length === 0) return desiredX;

  forbidden.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [forbidden[0]];
  for (let i = 1; i < forbidden.length; i++) {
    const last = merged[merged.length - 1];
    if (forbidden[i][0] <= last[1] + 0.01) {
      last[1] = Math.max(last[1], forbidden[i][1]);
    } else {
      merged.push(forbidden[i]);
    }
  }

  for (const [lo, hi] of merged) {
    if (desiredX > lo && desiredX < hi) {
      return (desiredX - lo <= hi - desiredX) ? lo : hi;
    }
  }
  return desiredX;
}

const BASE_SNAP_THRESHOLD_CM = 3;

/** Snap dragged base module X to aligned edges/centers of other modules. Returns snapped X + guide lines. */
function snapToBaseAlignments(
  x: number,
  hw: number,
  draggedId: string,
  others: BaseSegment[],
): { xCm: number; guides: FloorAlignGuide[] } {
  const T = BASE_SNAP_THRESHOLD_CM;
  let sx = x;
  let bestD = T + 1;

  const dragL = x - hw;
  const dragR = x + hw;

  for (const o of others) {
    if (o.id === draggedId) continue;
    const oL = o.cx - o.hw;
    const oR = o.cx + o.hw;

    const checks = [
      { d: Math.abs(x - o.cx), snap: o.cx },          // center-to-center
      { d: Math.abs(dragL - oL), snap: oL + hw },      // left-to-left
      { d: Math.abs(dragR - oR), snap: oR - hw },      // right-to-right
      { d: Math.abs(dragL - oR), snap: oR + hw },      // left-to-right (touching)
      { d: Math.abs(dragR - oL), snap: oL - hw },      // right-to-left (touching)
    ];
    for (const c of checks) {
      if (c.d < T && c.d < bestD) {
        bestD = c.d;
        sx = c.snap;
      }
    }
  }

  const snappedL = sx - hw;
  const snappedR = sx + hw;
  const guides: FloorAlignGuide[] = [];

  for (const o of others) {
    if (o.id === draggedId) continue;
    const oL = o.cx - o.hw;
    const oR = o.cx + o.hw;

    if (Math.abs(sx - o.cx) < 0.5) guides.push({ xCm: o.cx });
    if (Math.abs(snappedL - oL) < 0.5) guides.push({ xCm: oL });
    if (Math.abs(snappedR - oR) < 0.5) guides.push({ xCm: oR });
    if (Math.abs(snappedL - oR) < 0.5) guides.push({ xCm: oR });
    if (Math.abs(snappedR - oL) < 0.5) guides.push({ xCm: oL });
  }

  const seen = new Set<number>();
  const unique = guides.filter((g) => {
    const k = Math.round(g.xCm * 10);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return { xCm: sx, guides: unique };
}

type KitchenCabinetDragControllerProps = {
  orbitRef: React.MutableRefObject<any>;
  mainCenterXM: number;
};

type DragState = {
  run: KitchenCabinetDragRun;
  moduleId: string;
  offsetXCm: number;
  offsetYCm: number;
};

export default function KitchenCabinetDragController({
  orbitRef,
  mainCenterXM,
}: KitchenCabinetDragControllerProps) {
  const { camera, scene, gl, invalidate } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const pointer = useRef(new THREE.Vector2());
  const floorPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const backWallPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));
  const leftWallPlane = useRef(new THREE.Plane(new THREE.Vector3(1, 0, 0), 0));
  const wallPlaneYM = (WALL_MOUNT_Y + WALL_CABINET_HEIGHT / 2) * CM;
  const wallPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), -wallPlaneYM));
  const dragRef = useRef<DragState | null>(null);
  const didDragMove = useRef(false);
  const setOrbitControlsEnabled = useKitchenStore((s) => s.setOrbitControlsEnabled);

  useEffect(() => {
    const canvas = gl.domElement;

    const getNDC = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const hitFloor = (): THREE.Vector3 | null => {
      raycaster.current.setFromCamera(pointer.current, camera);
      const target = new THREE.Vector3();
      return raycaster.current.ray.intersectPlane(floorPlane.current, target) ?? null;
    };

    const hitWallHeight = (): THREE.Vector3 | null => {
      raycaster.current.setFromCamera(pointer.current, camera);
      const target = new THREE.Vector3();
      return raycaster.current.ray.intersectPlane(wallPlane.current, target) ?? null;
    };

    const hitBackWall = (): THREE.Vector3 | null => {
      raycaster.current.setFromCamera(pointer.current, camera);
      const target = new THREE.Vector3();
      return raycaster.current.ray.intersectPlane(backWallPlane.current, target) ?? null;
    };

    const hitLeftWall = (): THREE.Vector3 | null => {
      raycaster.current.setFromCamera(pointer.current, camera);
      const target = new THREE.Vector3();
      return raycaster.current.ray.intersectPlane(leftWallPlane.current, target) ?? null;
    };

    const isWallRun = (run: KitchenCabinetDragRun) =>
      run === "main-wall" || run === "island-wall" || run === "left-wall";

    const getModuleCurrentPosCm = (
      run: KitchenCabinetDragRun,
      moduleId: string,
    ): { xCm: number; yCm: number } | null => {
      const st = useKitchenStore.getState();
      const { config } = st;

      if (run === "main-wall") {
        const mod = config.wallModules.find((m) => m.id === moduleId);
        if (!mod) return null;
        if (mod.xCm !== undefined && mod.yCm !== undefined) {
          return { xCm: mod.xCm, yCm: mod.yCm };
        }
        return defaultWallModulePosCm(moduleId, config.wallModules, config.baseModules);
      }

      if (run === "island-wall") {
        const mod = config.island.wallModules.find((m) => m.id === moduleId);
        if (!mod) return null;
        if (mod.xCm !== undefined && mod.yCm !== undefined) {
          return { xCm: mod.xCm, yCm: mod.yCm };
        }
        return defaultIslandWallModulePosCm(
          moduleId,
          config.island.wallModules,
          config.island.baseModules,
        );
      }

      if (run === "left-wall") {
        const mod = config.leftWall.wallModules.find((m) => m.id === moduleId);
        if (!mod) return null;
        if (mod.xCm !== undefined && mod.yCm !== undefined) {
          return { xCm: mod.xCm, yCm: mod.yCm };
        }
        return defaultWallModulePosCm(moduleId, config.leftWall.wallModules, config.leftWall.baseModules);
      }

      return null;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      getNDC(e);
      raycaster.current.setFromCamera(pointer.current, camera);
      const st = useKitchenStore.getState();
      let hit = hitKitchenDrag(raycaster.current, scene);
      if (!hit) {
        const floor = hitFloor();
        if (floor) hit = pickRunFromFloor(floor, st, mainCenterXM);
      }
      if (!hit) return;

      e.preventDefault();
      e.stopPropagation();

      selectModuleForRun(hit.run, hit.moduleId, st);
      setOrbitControlsEnabled(false);
      if (orbitRef.current) {
        orbitRef.current.enabled = false;
      }

      if (
        hit.run === "main-base" ||
        hit.run === "island-base" ||
        hit.run === "left-base"
      ) {
        const mod = baseModuleForDragHit(hit.run, hit.moduleId, st);
        if (mod?.type === "corner-base") {
          dragRef.current = null;
          didDragMove.current = false;
          canvas.style.cursor = "";
          return;
        }
      }

      let offsetXCm = 0;
      let offsetYCm = 0;

      if (isWallRun(hit.run)) {
        const wallHit = hit.run === "left-wall" ? hitLeftWall() : hitBackWall();
        const currentPos = getModuleCurrentPosCm(hit.run, hit.moduleId);
        if (wallHit && currentPos) {
          const clwWall =
            hit.run === "left-wall" && st.config.cornerUnit.enabled
              ? st.config.cornerUnit.leftWingWidthCm
              : 0;
          const hitPosCm =
            hit.run === "left-wall" ? wallHit.z / CM - clwWall : wallHit.x / CM;
          offsetXCm = hitPosCm - currentPos.xCm;
          offsetYCm = wallHit.y / CM - currentPos.yCm;
        }
      } else {
        const floorHit = hitFloor();
        if (floorHit) {
          const currentPos = getBaseModuleCurrentXCm(hit.run, hit.moduleId, st);
          if (currentPos !== null) {
            const clw =
              hit.run === "left-base" && st.config.cornerUnit.enabled
                ? st.config.cornerUnit.leftWingWidthCm
                : 0;
            const hitAlong =
              hit.run === "left-base" ? floorHit.z / CM - clw : floorHit.x / CM;
            offsetXCm = hitAlong - currentPos;
          }
        }
      }

      dragRef.current = {
        run: hit.run,
        moduleId: hit.moduleId,
        offsetXCm,
        offsetYCm,
      };
      didDragMove.current = false;
      canvas.style.cursor = "grabbing";
    };

    const onPointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      getNDC(e);

      if (isWallRun(drag.run)) {
        const st = useKitchenStore.getState();
        const { config } = st;
        const wallHit = drag.run === "left-wall" ? hitLeftWall() : hitBackWall();
        if (!wallHit) return;

        const clwWall =
          drag.run === "left-wall" && config.cornerUnit.enabled
            ? config.cornerUnit.leftWingWidthCm
            : 0;
        const hitPosCm =
          drag.run === "left-wall" ? wallHit.z / CM - clwWall : wallHit.x / CM;
        const rawXCm = hitPosCm - drag.offsetXCm;
        const rawYCm = wallHit.y / CM - drag.offsetYCm;

        const wallMods =
          drag.run === "main-wall" ? config.wallModules
          : drag.run === "left-wall" ? config.leftWall.wallModules
          : config.island.wallModules;
        const baseMods =
          drag.run === "main-wall" ? config.baseModules
          : drag.run === "left-wall" ? config.leftWall.baseModules
          : config.island.baseModules;
        const draggedMod = wallMods.find((m) => m.id === drag.moduleId);
        if (!draggedMod) return;

        const draggedHW = effectiveWallHW(draggedMod);
        const draggedHH = effectiveWallHH(draggedMod);
        const rects = buildWallRects(wallMods, baseMods, drag.run === "island-wall");

        const cornerBackW = config.cornerUnit.enabled ? config.cornerUnit.backWingWidthCm : 0;
        const baseStartOff = drag.run === "main-wall" ? cornerBackW : 0;
        const baseSegments = buildBaseSegments(baseMods, baseStartOff);

        const snapped = snapToAlignments(
          rawXCm,
          rawYCm,
          draggedHW,
          draggedHH,
          drag.moduleId,
          rects,
          baseSegments,
        );
        const resolved = resolveWallCollisions(snapped.xCm, snapped.yCm, draggedHW, draggedHH, drag.moduleId, rects);
        const wallW =
          drag.run === "left-wall"
            ? config.leftWall.baseModules.reduce((s, m) => s + m.width, 0)
            : getWallWidthCm(st);
        const { xCm, yCm } = clampToWall(resolved.xCm, resolved.yCm, draggedHW, draggedHH, wallW);
        const { wallGuides, floorGuides } = buildWallAlignmentGuidesForPosition(
          xCm,
          yCm,
          draggedHW,
          draggedHH,
          drag.moduleId,
          rects,
          baseSegments,
          drag.run === "main-wall",
        );
        st.setWallAlignGuides(wallGuides);
        st.setFloorAlignGuides(drag.run === "main-wall" ? floorGuides : []);

        if (drag.run === "main-wall") {
          st.setWallModulePosition(drag.moduleId, xCm, yCm);
        } else if (drag.run === "left-wall") {
          st.setLeftWallModulePosition(drag.moduleId, xCm, yCm);
        } else {
          st.setIslandWallModulePosition(drag.moduleId, xCm, yCm);
        }
        didDragMove.current = true;
        invalidate();
        return;
      }

      // Base runs: free-form X positioning
      const hitPoint = hitFloor();
      if (!hitPoint) return;

      const st = useKitchenStore.getState();
      const { config } = st;

      let rawXCm: number;
      let modules: KitchenModule[];

      switch (drag.run) {
        case "main-base": {
          modules = config.baseModules;
          rawXCm = xCmAlongMainWall(hitPoint.x) - drag.offsetXCm;
          break;
        }
        case "island-base": {
          if (!config.island.enabled) return;
          modules = config.island.baseModules;
          rawXCm = xCmAlongIslandRun(
            hitPoint.x,
            hitPoint.z,
            mainCenterXM,
            config.island.offsetXCm,
            config.island.offsetZCm,
            config.island.rotationYRad,
          ) - drag.offsetXCm;
          break;
        }
        case "left-base": {
          if (!config.leftWall.enabled) return;
          modules = config.leftWall.baseModules;
          const clw = config.cornerUnit.enabled ? config.cornerUnit.leftWingWidthCm : 0;
          // World Z minus corner wing = inner along-run coordinate (matches BaseModule xCm).
          rawXCm = hitPoint.z / CM - clw - drag.offsetXCm;
          break;
        }
        default:
          return;
      }

      const draggedMod = modules.find((m) => m.id === drag.moduleId);
      if (!draggedMod) return;
      const dim = getEffectiveBaseDims(draggedMod);
      const hw = dim.w / 2;

      let startOffset: number;
      switch (drag.run) {
        case "main-base":
          startOffset = config.cornerUnit.enabled ? config.cornerUnit.backWingWidthCm : 0;
          break;
        case "left-base":
          startOffset = 0;
          break;
        default:
          startOffset = 0;
      }

      const baseSegments = buildBaseSegments(modules, startOffset);

      // Build wall module segments for vertical alignment guides
      let wallSegments: BaseSegment[] = [];
      const cornerBackW = config.cornerUnit.enabled ? config.cornerUnit.backWingWidthCm : 0;
      switch (drag.run) {
        case "main-base":
          if (config.hasWallCabinets && config.wallModules.length > 0) {
            wallSegments = buildWallSegmentsForAlignment(config.wallModules, config.baseModules, cornerBackW);
          }
          break;
        case "island-base":
          if (config.island.hasWallCabinets && config.island.wallModules.length > 0) {
            wallSegments = buildWallSegmentsForAlignment(config.island.wallModules, config.island.baseModules, 0);
          }
          break;
        case "left-base":
          if (config.leftWall.hasWallCabinets && config.leftWall.wallModules.length > 0) {
            // Wall modules on the left run use inner coords; corner offset is on the parent group.
            wallSegments = buildWallSegmentsForAlignment(config.leftWall.wallModules, config.leftWall.baseModules, 0);
          }
          break;
      }

      const snapped = snapToBaseAlignments(rawXCm, hw, drag.moduleId, wallSegments);
      const resolved = resolveBaseCollisions(snapped.xCm, hw, drag.moduleId, baseSegments);
      const xCm = Math.max(startOffset + hw, resolved);

      st.setFloorAlignGuides(snapped.guides);

      switch (drag.run) {
        case "main-base":
          st.setBaseModulePosition(drag.moduleId, xCm);
          break;
        case "island-base":
          st.setIslandBaseModulePosition(drag.moduleId, xCm);
          break;
        case "left-base":
          st.setLeftBaseModulePosition(drag.moduleId, xCm);
          break;
      }
      didDragMove.current = true;
      invalidate();
    };

    const onPointerUp = () => {
      canvas.style.cursor = "";
      const drag = dragRef.current;
      if (!drag) {
        setOrbitControlsEnabled(true);
        if (orbitRef.current) {
          orbitRef.current.enabled = true;
        }
        return;
      }
      const wasDragWithMove = didDragMove.current;
      dragRef.current = null;
      didDragMove.current = false;
      setOrbitControlsEnabled(true);
      if (orbitRef.current) {
        orbitRef.current.enabled = true;
      }
      const st = useKitchenStore.getState();
      if (wasDragWithMove) {
        st.pushCurrentConfigToHistory();
      }
      st.setWallAlignGuides([]);
      st.setFloorAlignGuides([]);
      invalidate();
    };

    canvas.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [camera, scene, gl, invalidate, orbitRef, mainCenterXM, setOrbitControlsEnabled]);

  return null;
}
