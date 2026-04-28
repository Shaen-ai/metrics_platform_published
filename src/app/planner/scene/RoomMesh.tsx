"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { usePlannerStore } from "../store/usePlannerStore";
import type { FloorStyle, Room, RoomBeam } from "../types";
import { createPlannerFloorMaterial } from "../laminateFloor";
import { maxCeilingY, ceilingYAtWall, ceilingY } from "../utils/roomCeiling";
import { createWallPrismGeometry, createSlopedCeilingGeometry, type WallName as PrismWallName } from "../utils/wallPrism";
import { createWallPrismWithHoles, wallHoleCutsForSegment } from "../utils/wallWithHolesCsg";
import { getWallBeamBox, getCeilingBeamBox } from "../utils/beams";
import { ROOM_WALL_THICKNESS_M as WALL_THICKNESS } from "../constants/roomGeometry";
import { roomUsesFloorOutline } from "../utils/floorOutline";
import PolygonRoomMesh from "./PolygonRoomMesh";

type WallName = "front" | "back" | "left" | "right";

/** Pull door/window trim & glass slightly into the room so edges don’t z-fight the CSG wall. */
const OPENING_TRIM_BIAS = 0.005;

function openingTrimWorldPos(
  wallName: WallName,
  info: { center: [number, number, number] },
  along: number,
  y: number
): [number, number, number] {
  const e = OPENING_TRIM_BIAS;
  if (wallName === "front") return [along, y, info.center[2] - e];
  if (wallName === "back") return [along, y, info.center[2] + e];
  if (wallName === "left") return [info.center[0] + e, y, along];
  return [info.center[0] - e, y, along];
}

/** Dollhouse cutaway: which walls to hide from camera azimuth (inside room only). */
function getDollhouseCutawayWalls(angle: number): WallName[] {
  const t = Math.PI / 8;
  if (angle >= -t && angle < t) return ["front"];
  if (angle >= t && angle < 3 * t) return ["front", "right"];
  if (angle >= 3 * t && angle < 5 * t) return ["right"];
  if (angle >= 5 * t && angle < 7 * t) return ["right", "back"];
  if (angle >= 7 * t || angle < -7 * t) return ["back"];
  if (angle >= -7 * t && angle < -5 * t) return ["back", "left"];
  if (angle >= -5 * t && angle < -3 * t) return ["left"];
  return ["left", "front"];
}

/** Compute which walls to hide based on camera position.
 * - When camera is OUTSIDE the room: hide any wall we're on the exterior of.
 * - When camera is INSIDE: also hide walls for dollhouse cutaway using `stableInsideAngle`
 *   (hysteresis-smoothed) so cutaway does not flip every frame at sector boundaries. */
function getWallsToHideFromCamera(
  camera: THREE.Camera,
  roomWidth: number,
  roomDepth: number,
  stableInsideAngle: number | null
): WallName[] {
  const cx = camera.position.x;
  const cz = camera.position.z;
  const hw = roomWidth / 2;
  const hd = roomDepth / 2;

  const wallsToHide: WallName[] = [];

  // Outside: hide walls we're on the exterior of (never show wall backs from outside)
  if (cz > hd) wallsToHide.push("front");
  if (cz < -hd) wallsToHide.push("back");
  if (cx < -hw) wallsToHide.push("left");
  if (cx > hw) wallsToHide.push("right");

  // Inside: add dollhouse cutaway (hide walls that block our view)
  const isInside = cx >= -hw && cx <= hw && cz >= -hd && cz <= hd;
  if (isInside && stableInsideAngle !== null) {
    const angleWalls = getDollhouseCutawayWalls(stableInsideAngle);
    for (const w of angleWalls) {
      if (!wallsToHide.includes(w)) wallsToHide.push(w);
    }
  }

  wallsToHide.sort();
  return wallsToHide;
}

/** Seeded pseudo-random for repeatable textures */
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Parse hex color to [r,g,b] */
function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/** Clamp a value 0–255 */
function clamp255(v: number) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** Floor style palettes — each has multiple plank colors for natural variation */
interface FloorPalette {
  planks: string[];      // 4-6 plank base colors
  grain: string;         // grain line color (with alpha)
  gap: string;           // gap/joint color
  knot: string;          // knot color
  grainAlpha: number;    // grain opacity multiplier
}
const FLOOR_PALETTES: Record<string, FloorPalette> = {
  "laminate-blonde-oak": {
    planks: ["#f2e5cd", "#eadcc4", "#f7ead3", "#e2d3ba", "#eee0c8", "#f8ecd8"],
    grain: "#cdbb9f",
    gap: "#dccdb8",
    knot: "#d8c6a8",
    grainAlpha: 0.08,
  },
  "laminate-whitewashed-wood": {
    planks: ["#f4eee6", "#ebe4dc", "#f8f2ea", "#e1dad1", "#f0e9e0", "#faf5ed"],
    grain: "#cfc6b9",
    gap: "#ddd5ca",
    knot: "#ded3c6",
    grainAlpha: 0.08,
  },
  "laminate-light-oak": {
    planks: ["#e8dcc8", "#dfd3bf", "#ede1d1", "#d8cdb9", "#e3d9c5", "#f0e4d6"],
    grain: "#c0b496",
    gap: "#c8bda5",
    knot: "#c9ba9e",
    grainAlpha: 0.12,
  },
  "laminate-soft-beige": {
    planks: ["#eadfce", "#e2d6c5", "#efe4d3", "#d9cebd", "#e7dbc9", "#f0e6d7"],
    grain: "#c5b59e",
    gap: "#d2c4b1",
    knot: "#d5c6b0",
    grainAlpha: 0.09,
  },
  "laminate-sand-oak": {
    planks: ["#ead7b8", "#e2cca9", "#efdcbc", "#dac39f", "#e6d0ae", "#f2dfc3"],
    grain: "#c5a87f",
    gap: "#d1b891",
    knot: "#d3b58c",
    grainAlpha: 0.10,
  },
  "laminate-raw-oak": {
    planks: ["#d9be98", "#cfb28a", "#dfc7a0", "#c8aa80", "#d4b88f", "#e2caa6"],
    grain: "#ad8d60",
    gap: "#bea279",
    knot: "#c1a076",
    grainAlpha: 0.12,
  },
  "laminate-natural-oak": {
    planks: ["#d4b896", "#cea87e", "#d8c09a", "#c8a068", "#d0b088", "#ccac78"],
    grain: "#b08c58",
    gap: "#c0a880",
    knot: "#c0a878",
    grainAlpha: 0.14,
  },
  "laminate-natural-pine": {
    planks: ["#ead690", "#e2cc82", "#efdca0", "#d9c074", "#e6d18c", "#f1dda6"],
    grain: "#b99d55",
    gap: "#c8ad68",
    knot: "#c3a05a",
    grainAlpha: 0.11,
  },
  "laminate-warm-honey-oak": {
    planks: ["#dca44f", "#d19843", "#e3ae5b", "#c98d38", "#d7a04b", "#e6b869"],
    grain: "#a8752d",
    gap: "#bc8840",
    knot: "#be8438",
    grainAlpha: 0.13,
  },
  "laminate-caramel": {
    planks: ["#c98845", "#bd7b3a", "#d0934f", "#b37032", "#c48340", "#d59b5b"],
    grain: "#8f5728",
    gap: "#a66c38",
    knot: "#9f622f",
    grainAlpha: 0.14,
  },
  "laminate-chestnut": {
    planks: ["#9e6339", "#925731", "#aa6f42", "#854d2c", "#9a5d35", "#b07848"],
    grain: "#65361d",
    gap: "#7a482a",
    knot: "#754225",
    grainAlpha: 0.15,
  },
  "laminate-weathered-oak": {
    planks: ["#b8aa98", "#aea08e", "#c1b3a0", "#a59684", "#b3a592", "#c8baa8"],
    grain: "#887866",
    gap: "#9a8b7b",
    knot: "#94836f",
    grainAlpha: 0.12,
  },
  "laminate-light-gray": {
    planks: ["#d5d6d5", "#cbcaca", "#dedfdd", "#c3c4c3", "#d1d2d0", "#e2e3e1"],
    grain: "#a9aba9",
    gap: "#bfc0be",
    knot: "#c3c4c2",
    grainAlpha: 0.09,
  },
  "laminate-pearl-gray": {
    planks: ["#ececea", "#e2e2df", "#f2f2ef", "#d9d9d5", "#e8e8e5", "#f5f5f2"],
    grain: "#bfc0bb",
    gap: "#d0d0cc",
    knot: "#d2d2ce",
    grainAlpha: 0.08,
  },
  "laminate-silver-ash": {
    planks: ["#d6dada", "#ccd1d1", "#e0e4e3", "#c3c8c8", "#d2d7d6", "#e5e8e7"],
    grain: "#a8adad",
    gap: "#bcc1c0",
    knot: "#c1c5c4",
    grainAlpha: 0.09,
  },
  "laminate-mist-gray": {
    planks: ["#eeeeea", "#e5e5e0", "#f4f4ef", "#dcddd8", "#e9e9e4", "#f7f7f2"],
    grain: "#c5c5bf",
    gap: "#d6d6d0",
    knot: "#d8d8d2",
    grainAlpha: 0.07,
  },
  "laminate-warm-gray": {
    planks: ["#d6cec4", "#ccc4ba", "#ded7cd", "#c4bbb1", "#d2c9bf", "#e2dacf"],
    grain: "#ada297",
    gap: "#beb4a9",
    knot: "#c3b8ab",
    grainAlpha: 0.09,
  },
  "laminate-coastal-oak": {
    planks: ["#dacbb7", "#d0c0ab", "#e2d3bf", "#c8b8a3", "#d6c6b1", "#e7dac8"],
    grain: "#b09f88",
    gap: "#c0af9a",
    knot: "#c0ad94",
    grainAlpha: 0.09,
  },
  "laminate-light-elm": {
    planks: ["#e6d2ad", "#ddc79d", "#ead8b8", "#d4bd91", "#e1cca6", "#efddbf"],
    grain: "#b99e6f",
    gap: "#c9b080",
    knot: "#c4a873",
    grainAlpha: 0.10,
  },
  "laminate-toasted-almond": {
    planks: ["#d1aa78", "#c99f6c", "#dab581", "#bf935f", "#cfa572", "#dfbd8c"],
    grain: "#9b7145",
    gap: "#b0875a",
    knot: "#a97b4f",
    grainAlpha: 0.12,
  },
  "laminate-golden-oak": {
    planks: ["#d9a654", "#ce9948", "#e2b260", "#c38c3c", "#d4a04f", "#e5b96d"],
    grain: "#a36f27",
    gap: "#ba8438",
    knot: "#b67b30",
    grainAlpha: 0.13,
  },
  "laminate-smoked-beige": {
    planks: ["#baa68f", "#af9a83", "#c3af98", "#a58f78", "#b5a088", "#c9b59e"],
    grain: "#88725d",
    gap: "#9d8873",
    knot: "#967d66",
    grainAlpha: 0.11,
  },
  "laminate-natural-hickory": {
    planks: ["#c49363", "#b98757", "#ce9e6e", "#ad7b4d", "#bf8f5e", "#d3a879"],
    grain: "#865a34",
    gap: "#9d6e45",
    knot: "#956239",
    grainAlpha: 0.14,
  },
  "laminate-desert-oak": {
    planks: ["#d9bb8f", "#cfb083", "#e0c49a", "#c6a678", "#d4b589", "#e5cca5"],
    grain: "#aa8757",
    gap: "#bd9d6f",
    knot: "#b79061",
    grainAlpha: 0.11,
  },
  "laminate-brushed-oak": {
    planks: ["#b69062", "#aa8358", "#c09a6d", "#9f784e", "#b58b5e", "#c49f74"],
    grain: "#7f5d3a",
    gap: "#94734f",
    knot: "#8f6844",
    grainAlpha: 0.14,
  },
  "laminate-aged-oak": {
    planks: ["#9f7e5c", "#927250", "#a98864", "#876847", "#9a7652", "#ad8d6a"],
    grain: "#67472d",
    gap: "#7a5a3a",
    knot: "#755235",
    grainAlpha: 0.15,
  },
  "laminate-maple": {
    planks: ["#f0dcc0", "#e8d4b8", "#f4e0c8", "#e2ceb0", "#eed8bc", "#f2dcc4"],
    grain: "#c8b498",
    gap: "#d4c0a8",
    knot: "#d8c4a8",
    grainAlpha: 0.10,
  },
  "laminate-bamboo": {
    planks: ["#e8d088", "#e0c878", "#ecd890", "#dcc070", "#e4cc80", "#d8c068"],
    grain: "#b8a050",
    gap: "#c4a858",
    knot: "#c8ac60",
    grainAlpha: 0.11,
  },
  "laminate-walnut": {
    planks: ["#7d583d", "#704d35", "#8a6346", "#65442e", "#78543a", "#906a4d"],
    grain: "#4c2f1d",
    gap: "#5d3d29",
    knot: "#5d3924",
    grainAlpha: 0.15,
  },
  "laminate-charcoal": {
    planks: ["#5d6066", "#53565c", "#676a70", "#4c4f55", "#595c62", "#6b6e74"],
    grain: "#383b40",
    gap: "#46494f",
    knot: "#484b51",
    grainAlpha: 0.12,
  },
  "laminate-rich-espresso": {
    planks: ["#44291a", "#3a2115", "#4f3020", "#321c11", "#412718", "#563725"],
    grain: "#221108",
    gap: "#2c180d",
    knot: "#2f1a0f",
    grainAlpha: 0.17,
  },
};

/** Draw realistic wood grain lines on a single plank region */
function drawWoodGrain(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  grainColor: string, alpha: number, rng: () => number
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  // Primary grain lines — dense, wavy, running along plank length
  const numGrains = 12 + Math.floor(rng() * 10);
  for (let g = 0; g < numGrains; g++) {
    const gy = y + (g / numGrains) * h + (rng() - 0.5) * (h * 0.12);
    ctx.strokeStyle = grainColor;
    ctx.globalAlpha = alpha * (0.5 + rng() * 0.5);
    ctx.lineWidth = 0.3 + rng() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, gy);
    // More segments for smoother wavy curves
    const segments = 8 + Math.floor(rng() * 6);
    for (let s = 1; s <= segments; s++) {
      const sx = x + (s / segments) * w;
      const sy = gy + (rng() - 0.5) * h * 0.1;
      ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }

  // Fine micro-grain between major lines for depth
  const microGrains = 6 + Math.floor(rng() * 8);
  for (let g = 0; g < microGrains; g++) {
    const gy = y + rng() * h;
    ctx.strokeStyle = grainColor;
    ctx.globalAlpha = alpha * 0.25;
    ctx.lineWidth = 0.2 + rng() * 0.3;
    ctx.beginPath();
    const startX = x + rng() * w * 0.3;
    const endX = startX + w * (0.2 + rng() * 0.5);
    ctx.moveTo(startX, gy);
    const segs = 3 + Math.floor(rng() * 3);
    for (let s = 1; s <= segs; s++) {
      const sx = startX + (s / segs) * (endX - startX);
      const sy = gy + (rng() - 0.5) * h * 0.06;
      ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }

  // Annual ring arcs — more frequent and varied
  const numArcs = rng() > 0.3 ? 1 + Math.floor(rng() * 3) : 0;
  for (let a = 0; a < numArcs; a++) {
    const arcX = x + w * 0.1 + rng() * w * 0.8;
    const arcY = y + rng() * h;
    const arcR = 6 + rng() * 20;
    ctx.globalAlpha = alpha * (0.15 + rng() * 0.2);
    ctx.strokeStyle = grainColor;
    ctx.lineWidth = 0.4 + rng() * 0.6;
    ctx.beginPath();
    ctx.arc(arcX, arcY, arcR, 0, Math.PI * (0.4 + rng() * 0.8));
    ctx.stroke();
  }

  // Subtle color variation streaks for natural wood look
  const numStreaks = 2 + Math.floor(rng() * 3);
  for (let s = 0; s < numStreaks; s++) {
    const sy = y + rng() * h;
    const sw = w * (0.3 + rng() * 0.5);
    const sx = x + rng() * (w - sw);
    const sh = h * (0.05 + rng() * 0.1);
    ctx.globalAlpha = 0.03 + rng() * 0.04;
    ctx.fillStyle = rng() > 0.5 ? "rgba(255,255,255,1)" : "rgba(0,0,0,1)";
    ctx.fillRect(sx, sy, sw, sh);
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Draw a wood knot */
function drawKnot(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  knotColor: string, alpha: number
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, knotColor);
  grad.addColorStop(0.6, knotColor);
  grad.addColorStop(1, "transparent");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Ring lines
  for (let ring = 0; ring < 3; ring++) {
    const rr = r * (0.3 + ring * 0.25);
    ctx.strokeStyle = knotColor;
    ctx.globalAlpha = alpha * 0.4;
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rr, rr * 0.7, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Generate floor texture — laminate 120cm × 20cm planks in half-bond layout.
 *  Tile represents 240cm × 120cm on a 2048×1024 canvas (8.533 px/cm).
 *  Even rows: two full 120cm planks.  Odd rows: one centre plank + wrapping
 *  half-planks at the edges for seamless tiling.
 *  Caller sets texture repeat based on room dimensions. */
function createFloorTexture(
  style: FloorStyle
): THREE.CanvasTexture {
  const W = 2048;
  const H = 1024;
  const PLANK_LEN = 1024;          // 120 cm = 1024 px
  const PLANK_H = H / 6;           // 20 cm ≈ 170.67 px
  const HALF_LEN = PLANK_LEN / 2;  // 60 cm = 512 px
  const NUM_ROWS = 6;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const rng = seededRandom(42 + [...style].reduce((a, c) => a + c.charCodeAt(0), 0));

  const palette = FLOOR_PALETTES[style] ?? FLOOR_PALETTES["laminate-natural-oak"];

  // Helper: draw a single plank with base color, grain, and occasional knots
  const drawPlank = (x: number, y: number, pw: number, ph: number, colorIdx: number) => {
    const baseColor = palette.planks[colorIdx % palette.planks.length];
    const [br, bg, bb] = hexToRgb(baseColor);
    // Wider color variation between planks for natural look
    const pv = (rng() - 0.5) * 18;
    const warmShift = (rng() - 0.5) * 6; // slight warm/cool shift
    ctx.fillStyle = `rgb(${clamp255(br + pv + warmShift)},${clamp255(bg + pv)},${clamp255(bb + pv - warmShift)})`;
    ctx.fillRect(x, y, pw, ph);

    // Subtle per-plank brightness gradient (wood is never perfectly flat)
    const plankGrad = ctx.createLinearGradient(x, y, x + pw, y + ph);
    const gradSign = rng() > 0.5 ? 1 : -1;
    plankGrad.addColorStop(0, `rgba(${gradSign > 0 ? 255 : 0},${gradSign > 0 ? 255 : 0},${gradSign > 0 ? 255 : 0},0.02)`);
    plankGrad.addColorStop(1, `rgba(${gradSign > 0 ? 0 : 255},${gradSign > 0 ? 0 : 255},${gradSign > 0 ? 0 : 255},0.02)`);
    ctx.fillStyle = plankGrad;
    ctx.fillRect(x, y, pw, ph);

    drawWoodGrain(ctx, x, y, pw, ph, palette.grain, palette.grainAlpha, rng);

    // Knots — occasional, with size variation
    if (rng() > 0.7) {
      const kx = x + pw * 0.15 + rng() * pw * 0.7;
      const ky = y + ph * 0.25 + rng() * ph * 0.5;
      drawKnot(ctx, kx, ky, 4 + rng() * 8, palette.knot, 0.12 + rng() * 0.08);
    }
  };

  for (let row = 0; row < NUM_ROWS; row++) {
    const y = row * PLANK_H;
    const isOdd = row % 2 === 1;

    if (!isOdd) {
      // ── Even row: two full-length planks ──
      for (let p = 0; p < 2; p++) {
        const x = p * PLANK_LEN;
        drawPlank(x, y, PLANK_LEN, PLANK_H, row * 2 + p);
      }
      // Subtle vertical gap at mid-tile joint (thin dark line, not a wide bar)
      ctx.strokeStyle = palette.gap;
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(PLANK_LEN, y + 0.5);
      ctx.lineTo(PLANK_LEN, y + PLANK_H - 0.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      // ── Odd row: wrapping plank halves at edges + full centre plank ──
      const wrapColorIdx = row * 2;

      // Right half of wrapping plank (x = 0 → HALF_LEN)
      drawPlank(0, y, HALF_LEN, PLANK_H, wrapColorIdx);

      // Left half of wrapping plank (x = W − HALF_LEN → W)
      drawPlank(W - HALF_LEN, y, HALF_LEN, PLANK_H, wrapColorIdx);

      // Centre plank (x = HALF_LEN → HALF_LEN + PLANK_LEN)
      drawPlank(HALF_LEN, y, PLANK_LEN, PLANK_H, row * 2 + 1);

      // Subtle vertical gaps at the two joints within this row
      ctx.strokeStyle = palette.gap;
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(HALF_LEN, y + 0.5);
      ctx.lineTo(HALF_LEN, y + PLANK_H - 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(W - HALF_LEN, y + 0.5);
      ctx.lineTo(W - HALF_LEN, y + PLANK_H - 0.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Thin horizontal gap between rows — very subtle
    if (row > 0) {
      ctx.strokeStyle = palette.gap;
      ctx.globalAlpha = 0.15;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // Lacquer sheen gradient per row — slightly more pronounced for realism
  for (let row = 0; row < NUM_ROWS; row++) {
    const y2 = row * PLANK_H;
    const grad = ctx.createLinearGradient(0, y2, 0, y2 + PLANK_H);
    grad.addColorStop(0, "rgba(255,255,255,0.04)");
    grad.addColorStop(0.2, "rgba(255,255,255,0.015)");
    grad.addColorStop(0.5, "rgba(0,0,0,0.005)");
    grad.addColorStop(0.8, "rgba(0,0,0,0.015)");
    grad.addColorStop(1, "rgba(0,0,0,0.02)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, y2, W, PLANK_H);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Generate a roughness map for the floor.
 * Dark = smooth/glossy (plank surface), Light = rough/matte (gaps, edges).
 * Layout matches createFloorTexture (240cm × 120cm tile, 2048 × 1024).
 * Caller sets texture repeat based on room dimensions. */
function createFloorRoughnessMap(
  style: FloorStyle
): THREE.CanvasTexture {
  const W = 2048;
  const H = 1024;
  const PLANK_LEN = 1024;
  const PLANK_H = H / 6;
  const HALF_LEN = PLANK_LEN / 2;
  const NUM_ROWS = 6;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const rng = seededRandom(42 + [...style].reduce((a, c) => a + c.charCodeAt(0), 0));

  const baseSmooth = 30; // hardwood base roughness (lower = glossier)
  ctx.fillStyle = `rgb(${baseSmooth},${baseSmooth},${baseSmooth})`;
  ctx.fillRect(0, 0, W, H);

  for (let row = 0; row < NUM_ROWS; row++) {
    const y = row * PLANK_H;
    const isOdd = row % 2 === 1;

    if (!isOdd) {
      for (let p = 0; p < 2; p++) {
        const x = p * PLANK_LEN;
        const rv = baseSmooth + Math.floor((rng() - 0.5) * 16);
        ctx.fillStyle = `rgb(${rv},${rv},${rv})`;
        ctx.fillRect(x, y, PLANK_LEN, PLANK_H);
        // Add subtle grain-direction roughness variation
        for (let g = 0; g < 4; g++) {
          const gy = y + rng() * PLANK_H;
          const gh = 1 + rng() * 3;
          const gv = rv + Math.floor((rng() - 0.5) * 8);
          ctx.fillStyle = `rgb(${gv},${gv},${gv})`;
          ctx.globalAlpha = 0.3;
          ctx.fillRect(x, gy, PLANK_LEN, gh);
        }
        ctx.globalAlpha = 1;
      }
      // Gap at mid joint — rougher
      ctx.fillStyle = "rgb(100,100,100)";
      ctx.fillRect(PLANK_LEN - 1, y, 2, PLANK_H);
    } else {
      const rv1 = baseSmooth + Math.floor((rng() - 0.5) * 16);
      ctx.fillStyle = `rgb(${rv1},${rv1},${rv1})`;
      ctx.fillRect(0, y, HALF_LEN, PLANK_H);
      ctx.fillRect(W - HALF_LEN, y, HALF_LEN, PLANK_H);
      const rv2 = baseSmooth + Math.floor((rng() - 0.5) * 16);
      ctx.fillStyle = `rgb(${rv2},${rv2},${rv2})`;
      ctx.fillRect(HALF_LEN, y, PLANK_LEN, PLANK_H);
      // Gaps at joints — rougher
      ctx.fillStyle = "rgb(100,100,100)";
      ctx.fillRect(HALF_LEN - 1, y, 2, PLANK_H);
      ctx.fillRect(W - HALF_LEN - 1, y, 2, PLANK_H);
    }

    // Horizontal gaps between rows — rougher
    if (row > 0) {
      ctx.fillStyle = "rgb(100,100,100)";
      ctx.fillRect(0, y - 1, W, 2);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Generate a normal map for the floor to give 3D depth to plank edges.
 * Beveled edges at plank joints create the look of real hardwood planks.
 * Layout matches createFloorTexture (240cm × 120cm tile, 2048 × 1024). */
function createFloorNormalMap(
  style: FloorStyle
): THREE.CanvasTexture {
  const W = 2048;
  const H = 1024;
  const PLANK_LEN = 1024;
  const PLANK_H = H / 6;
  const HALF_LEN = PLANK_LEN / 2;
  const NUM_ROWS = 6;
  const BEVEL = 3; // bevel width in pixels

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Flat normal: (0.5, 0.5, 1.0) in RGB = (128, 128, 255) — pointing straight up
  ctx.fillStyle = "rgb(128,128,255)";
  ctx.fillRect(0, 0, W, H);

  // Draw beveled edges at every plank joint
  // Vertical bevels: left edge tilts normal left (r<128), right edge tilts right (r>128)
  const drawVerticalBevel = (x: number, y: number, bh: number) => {
    // Left bevel (normal tilted left)
    const leftGrad = ctx.createLinearGradient(x - BEVEL, 0, x, 0);
    leftGrad.addColorStop(0, "rgb(128,128,255)");
    leftGrad.addColorStop(1, "rgb(100,128,235)");
    ctx.fillStyle = leftGrad;
    ctx.fillRect(x - BEVEL, y, BEVEL, bh);
    // Right bevel (normal tilted right)
    const rightGrad = ctx.createLinearGradient(x, 0, x + BEVEL, 0);
    rightGrad.addColorStop(0, "rgb(156,128,235)");
    rightGrad.addColorStop(1, "rgb(128,128,255)");
    ctx.fillStyle = rightGrad;
    ctx.fillRect(x, y, BEVEL, bh);
    // Dark crease at joint
    ctx.fillStyle = "rgb(128,128,220)";
    ctx.fillRect(x, y, 1, bh);
  };

  // Horizontal bevels: top edge tilts normal up (g>128), bottom tilts down (g<128)
  const drawHorizontalBevel = (y: number) => {
    // Top bevel (normal tilted up)
    const topGrad = ctx.createLinearGradient(0, y - BEVEL, 0, y);
    topGrad.addColorStop(0, "rgb(128,128,255)");
    topGrad.addColorStop(1, "rgb(128,100,235)");
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, y - BEVEL, W, BEVEL);
    // Bottom bevel (normal tilted down)
    const botGrad = ctx.createLinearGradient(0, y, 0, y + BEVEL);
    botGrad.addColorStop(0, "rgb(128,156,235)");
    botGrad.addColorStop(1, "rgb(128,128,255)");
    ctx.fillStyle = botGrad;
    ctx.fillRect(0, y, W, BEVEL);
    // Dark crease
    ctx.fillStyle = "rgb(128,128,220)";
    ctx.fillRect(0, y, W, 1);
  };

  for (let row = 0; row < NUM_ROWS; row++) {
    const y = row * PLANK_H;
    const isOdd = row % 2 === 1;

    // Horizontal bevel at row boundary
    if (row > 0) {
      drawHorizontalBevel(y);
    }

    // Vertical bevels at plank joints
    if (!isOdd) {
      drawVerticalBevel(PLANK_LEN, y, PLANK_H);
    } else {
      drawVerticalBevel(HALF_LEN, y, PLANK_H);
      drawVerticalBevel(W - HALF_LEN, y, PLANK_H);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Generate a thumbnail data URL for laminate floor swatch — shows large rectangular planks */
export function createLaminateThumbnailDataUrl(style: FloorStyle, width = 88, height = 56): string {
  const palette = FLOOR_PALETTES[style] ?? FLOOR_PALETTES["laminate-natural-oak"];
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const rng = seededRandom(42 + [...style].reduce((a, c) => a + c.charCodeAt(0), 0));
  const plankH = Math.round(height / 3); // 3 rows of planks — rectangular, not square
  const gap = palette.gap;
  for (let row = 0; row < 3; row++) {
    const y = row * plankH;
    // 2 long planks per row, staggered
    const seg1 = width * (0.55 + rng() * 0.2);
    const seg2 = width - seg1;
    const segs = row % 2 === 1 ? [seg2, seg1] : [seg1, seg2];
    let x = 0;
    for (let s = 0; s < segs.length && x < width; s++) {
      const w = Math.min(segs[s], width - x);
      const baseColor = palette.planks[(row * 2 + s) % palette.planks.length];
      const [br, bg, bb] = hexToRgb(baseColor);
      const pv = (rng() - 0.5) * 8;
      ctx.fillStyle = `rgb(${clamp255(br + pv)},${clamp255(bg + pv)},${clamp255(bb + pv)})`;
      ctx.fillRect(x, y, w, plankH);
      drawWoodGrain(ctx, x, y, w, plankH, palette.grain, palette.grainAlpha, rng);
      if (s > 0 && x > 0) {
        ctx.strokeStyle = gap;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + plankH);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      x += w;
    }
    if (row > 0) {
      ctx.strokeStyle = gap;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  // Lacquer gradient
  for (let row = 0; row < 3; row++) {
    const y = row * plankH;
    const grad = ctx.createLinearGradient(0, y, 0, y + plankH);
    grad.addColorStop(0, "rgba(255,255,255,0.06)");
    grad.addColorStop(0.5, "transparent");
    grad.addColorStop(1, "rgba(0,0,0,0.03)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, width, plankH);
  }
  return canvas.toDataURL("image/png");
}

const RIDGE_WALL_SUBDIV_EPS = 1e-4;

/**
 * Ridge ceilings are piecewise-linear with a kink at room center on the ridge axis.
 * A single wall quad only has corners at segment ends, so its top edge is a straight chord —
 * it misses the peak and leaves a triangular hole (ceiling color shows through). Split segments
 * that cross the kink so each prism has a planar top.
 */
function ridgeKinkAlongWall(wall: PrismWallName, room: Room): number | null {
  if (room.ceilingRidgeAxis === "x") {
    if (wall === "back" || wall === "front") return 0;
    return null;
  }
  if (room.ceilingRidgeAxis === "z") {
    if (wall === "left" || wall === "right") return 0;
    return null;
  }
  return null;
}

function subdivideWallAlongForRidge(
  along0: number,
  along1: number,
  kink: number | null
): Array<[number, number]> {
  if (kink === null) return [[along0, along1]];
  const lo = Math.min(along0, along1);
  const hi = Math.max(along0, along1);
  if (kink <= lo + RIDGE_WALL_SUBDIV_EPS || kink >= hi - RIDGE_WALL_SUBDIV_EPS) {
    return [[along0, along1]];
  }
  return [
    [along0, kink],
    [kink, along1],
  ];
}

function wallPrismSubsegments(
  wall: PrismWallName,
  room: Room,
  along0: number,
  along1: number
): Array<[number, number]> {
  return subdivideWallAlongForRidge(along0, along1, ridgeKinkAlongWall(wall, room)).filter(
    ([a, b]) => Math.abs(b - a) > RIDGE_WALL_SUBDIV_EPS
  );
}

function WallPrismMesh({
  wall,
  along0,
  along1,
  yBottom,
  room,
  material,
  castShadow,
  receiveShadow,
}: {
  wall: PrismWallName;
  along0: number;
  along1: number;
  yBottom: number;
  room: Room;
  material: THREE.Material;
  castShadow: boolean;
  receiveShadow: boolean;
}) {
  const geom = useMemo(
    () =>
      createWallPrismGeometry(wall, along0, along1, room, WALL_THICKNESS, yBottom),
    [
      wall,
      along0,
      along1,
      room.width,
      room.depth,
      room.height,
      room.ceilingSlopeX ?? 0,
      room.ceilingSlopeZ ?? 0,
      room.ceilingRidgeAxis,
      room.ceilingRidgeD,
      room.ceilingRidgeA,
      yBottom,
    ]
  );
  useEffect(() => () => geom.dispose(), [geom]);
  return (
    <mesh geometry={geom} material={material} castShadow={castShadow} receiveShadow={receiveShadow} />
  );
}

/** One ridge subsegment of a wall with doors/windows: solid prism minus opening boxes (CSG). */
function WallPrismWithHolesMesh({
  wall,
  segAlong0,
  segAlong1,
  room,
  halfWidth,
  material,
  castShadow,
  receiveShadow,
}: {
  wall: PrismWallName;
  segAlong0: number;
  segAlong1: number;
  room: Room;
  halfWidth: number;
  material: THREE.Material;
  castShadow: boolean;
  receiveShadow: boolean;
}) {
  const openingsDigest = useMemo(
    () =>
      (room.openings ?? [])
        .filter((o) => o.wall === wall)
        .map((o) => `${o.id}:${o.type}:${o.position}:${o.width}:${o.height ?? ""}`)
        .join("|"),
    [room.openings, wall]
  );

  const geom = useMemo(() => {
    const wo = (room.openings ?? []).filter((o) => o.wall === wall);
    const cuts = wallHoleCutsForSegment(wall, room, halfWidth, segAlong0, segAlong1, wo);
    return createWallPrismWithHoles(wall, segAlong0, segAlong1, room, WALL_THICKNESS, cuts);
  }, [
    wall,
    segAlong0,
    segAlong1,
    halfWidth,
    openingsDigest,
    room.width,
    room.depth,
    room.height,
    room.ceilingSlopeX ?? 0,
    room.ceilingSlopeZ ?? 0,
    room.ceilingRidgeAxis,
    room.ceilingRidgeD,
    room.ceilingRidgeA,
  ]);

  useEffect(() => () => geom.dispose(), [geom]);
  return (
    <mesh geometry={geom} material={material} castShadow={castShadow} receiveShadow={receiveShadow} />
  );
}

function SlopedCeilingMesh({
  room,
  margin,
  material,
  invisibleMaterial,
  hideVisual,
}: {
  room: Room;
  margin: number;
  material: THREE.Material;
  invisibleMaterial: THREE.Material;
  hideVisual: boolean;
}) {
  const geom = useMemo(
    () => createSlopedCeilingGeometry(room, WALL_THICKNESS, margin),
    [
      room.width,
      room.depth,
      room.height,
      room.ceilingSlopeX ?? 0,
      room.ceilingSlopeZ ?? 0,
      room.ceilingRidgeAxis,
      room.ceilingRidgeD,
      room.ceilingRidgeA,
      margin,
    ]
  );
  useEffect(() => () => geom.dispose(), [geom]);
  const mat = hideVisual ? invisibleMaterial : material;
  return (
    <mesh
      name={hideVisual ? "ceiling-shadow-blocker" : "ceiling"}
      geometry={geom}
      material={mat}
      castShadow
      receiveShadow={!hideVisual}
    />
  );
}

/** Renders floor + ceiling + 4 walls with doors, windows, baseboards (floor only), and recessed lights */
function RectangularRoomMesh() {
  const room = usePlannerStore((s) => s.room);
  const topView = usePlannerStore((s) => s.ui.topView);
  const { camera, invalidate } = useThree();

  const { width: w, depth: d, height: h } = room;
  const maxH = maxCeilingY(room);
  // Dynamic walls to hide + ceiling visibility (single state to avoid duplicate re-renders)
  const [viewState, setViewState] = useState<{
    wallsToHide: WallName[];
    hideCeiling: boolean;
  }>(() => {
    if (topView) return { wallsToHide: [], hideCeiling: true };
    // Match the initial camera position from CameraController so walls
    // that would be hidden are already hidden on the very first frame.
    const initialCx = w * 0.7;
    const initialCz = d * 1.1;
    const hw = w / 2;
    const hd = d / 2;
    const initialWalls: WallName[] = [];
    if (initialCz > hd) initialWalls.push("front");
    if (initialCz < -hd) initialWalls.push("back");
    if (initialCx < -hw) initialWalls.push("left");
    if (initialCx > hw) initialWalls.push("right");
    return { wallsToHide: initialWalls, hideCeiling: true };
  });
  const { wallsToHide, hideCeiling } = viewState;

  /** Smoothed azimuth for dollhouse cutaway — avoids rapid wall/floor toggles at sector boundaries. */
  const stableInsideAngleRef = useRef<number | null>(null);
  const DOLLHOUSE_ANGLE_HYST = 0.2; // radians (~11°) before cutaway sector changes

  useFrame(() => {
    const cx = camera.position.x;
    const cz = camera.position.z;
    const hw = w / 2;
    const hd = d / 2;
    const isInside = cx >= -hw && cx <= hw && cz >= -hd && cz <= hd;
    const rawAngle = Math.atan2(cx, cz);

    if (!isInside) {
      stableInsideAngleRef.current = null;
    } else if (stableInsideAngleRef.current === null) {
      stableInsideAngleRef.current = rawAngle;
    } else {
      let diff = rawAngle - stableInsideAngleRef.current;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      if (Math.abs(diff) > DOLLHOUSE_ANGLE_HYST) {
        stableInsideAngleRef.current = rawAngle;
      }
    }

    const cameraAboveCeiling = camera.position.y > maxH;
    const nextHideCeiling = topView || cameraAboveCeiling;
    const nextWalls = topView
      ? []
      : getWallsToHideFromCamera(camera, w, d, stableInsideAngleRef.current);

    setViewState((prev) => {
      const wallsChanged =
        nextWalls.length !== prev.wallsToHide.length ||
        nextWalls.some((wall, i) => prev.wallsToHide[i] !== wall);
      const ceilingChanged = prev.hideCeiling !== nextHideCeiling;
      if (!wallsChanged && !ceilingChanged) return prev;
      return {
        wallsToHide: nextWalls,
        hideCeiling: nextHideCeiling,
      };
    });
  });

  // ── Neutral edge material (visible on thickness/cross-section of walls, floor, ceiling) ──
  const T = WALL_THICKNESS;
  const edgeMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#f4f2ef",
        roughness: 0.9,
        metalness: 0.0,
      }),
    []
  );

  // Corner columns share faces with wall prisms — slight depth offset stops z-fighting when orbiting.
  const cornerSealMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#f4f2ef",
        roughness: 0.9,
        metalness: 0.0,
        polygonOffset: true,
        polygonOffsetFactor: 2,
        polygonOffsetUnits: 2,
      }),
    []
  );

  // ── Wall material (uses user-selectable color) ──
  // Use emissive so all 4 walls display the chosen color evenly, regardless of light angle.
  // Wall mesh normals: see createWallPrismGeometry (per-face normals, no corner smoothing).
  const wallColor = room.wallColor ?? "#fafafa";
  const wallMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: wallColor,
        emissive: wallColor,
        emissiveIntensity: 0.3,
        roughness: 0.85,
        metalness: 0.0,
      }),
    []
  );
  useEffect(() => {
    wallMaterial.color.set(wallColor);
    wallMaterial.emissive.set(wallColor);
  }, [wallColor, wallMaterial]);

  // ── Floor material: file-backed wood textures with generated laminate fallback ──
  const floorStyle = room.floorStyle ?? "laminate-natural-oak";

  const floorMaterial = useMemo(
    () =>
      createPlannerFloorMaterial({
        floorStyle,
        repeat: [2.25, 2.25],
        onTextureUpdate: invalidate,
        toneMode: "color",
        roughness: 0.7,
        metalness: 0,
      }),
    [floorStyle, invalidate]
  );

  useEffect(() => {
    invalidate();
  }, [floorMaterial, invalidate]);

  // ── Door slab: neutral matte (no wood grain) ──
  const doorSlabMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#e2e0dc",
        roughness: 0.62,
        metalness: 0,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 2,
        polygonOffsetUnits: 4,
      }),
    []
  );

  // Floor material array: top face (+Y) = parquet, all edges = neutral
  const floorMaterials = useMemo(
    () => [edgeMaterial, edgeMaterial, floorMaterial, edgeMaterial, edgeMaterial, edgeMaterial],
    [floorMaterial, edgeMaterial]
  );

  // ── Ceiling material (wall color lightened ~30 % towards white) ──
  const ceilingColor = useMemo(() => {
    const [r, g, b] = hexToRgb(wallColor);
    const factor = 0.5; // blend 50 % towards white
    return `rgb(${clamp255(r + (255 - r) * factor)},${clamp255(g + (255 - g) * factor)},${clamp255(b + (255 - b) * factor)})`;
  }, [wallColor]);

  const ceilingMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: ceilingColor,
        emissive: ceilingColor,
        emissiveIntensity: 0.35,
        roughness: 0.95,
        metalness: 0.0,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 2,
      }),
    []
  );
  useEffect(() => {
    ceilingMaterial.color.set(ceilingColor);
    ceilingMaterial.emissive.set(ceilingColor);
  }, [ceilingColor, ceilingMaterial]);

  // ── Door frame (painted trim — contrasts with wood slab) ──
  const doorFrameMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#f4f1ec",
        side: THREE.DoubleSide,
        roughness: 0.5,
        metalness: 0.0,
        polygonOffset: true,
        polygonOffsetFactor: 3,
        polygonOffsetUnits: 5,
      }),
    []
  );

  // ── Door handle material (brushed brass — warm modern accent) ──
  const doorHandleMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#c9a96e",
        roughness: 0.18,
        metalness: 0.88,
      }),
    []
  );

  // ── Invisible shadow-caster material ──
  // Used for hidden walls: doesn't write color or depth to the main camera
  // but Three.js still renders it into the shadow map (using its own depth
  // material) because the mesh has visible=true & castShadow=true.
  // DoubleSide is critical: when a wall is hidden the light is often behind
  // it (hitting the back face), and the shadow depth pass inherits the
  // material's `side` — FrontSide would skip the back face and let light
  // leak through.
  const invisibleShadowMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        colorWrite: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    []
  );

  // ── Window frame material ──
  const windowFrameMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#f8f9fa",
        side: THREE.DoubleSide,
        roughness: 0.45,
        metalness: 0.0,
        polygonOffset: true,
        polygonOffsetFactor: 3,
        polygonOffsetUnits: 5,
      }),
    []
  );

  // ── Window glass material (plain neutral glass; zero self-glow) ──
  const windowGlassMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#a8c4dd",
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.24,
        roughness: 0.22,
        metalness: 0.0,
        emissive: "#000000",
        emissiveIntensity: 0,
        polygonOffset: true,
        polygonOffsetFactor: 2,
        polygonOffsetUnits: 3,
      }),
    []
  );

  // ── Baseboard material ──
  const baseboardMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#f0eeec",
        roughness: 0.6,
        metalness: 0.0,
      }),
    []
  );

  const floorJunctionAoMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#000000",
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      }),
    []
  );

  // ── Recessed light materials ──
  // Outer housing ring — brushed metal look
  const lightHousingMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#d8d8d8",
        roughness: 0.5,
        metalness: 0.3,
      }),
    []
  );

  // Inner reflective cone — shiny chrome interior
  const lightReflectorMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#e8e8e8",
        roughness: 0.15,
        metalness: 0.7,
      }),
    []
  );

  // LED surface — bright emissive
  const lightBulbMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#fffdf0",
      }),
    []
  );

  // Warm halo glow on ceiling around each light
  const lightGlowMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#fff8e8",
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    []
  );

  const openings = room.openings || [];

  // ── Recessed grid (6) + corner fill (4, no shadow) — all on the ceiling plane ──
  const { lightPositions, cornerFillPositions } = useMemo(() => {
    const grid: [number, number, number][] = [];
    const numX = 3;
    const numZ = 2;
    const marginX = w * 0.12;
    const marginZ = d * 0.12;
    const spanX = w - 2 * marginX;
    const spanZ = d - 2 * marginZ;
    const spacingX = numX > 1 ? spanX / (numX - 1) : 0;
    const spacingZ = numZ > 1 ? spanZ / (numZ - 1) : 0;
    for (let i = 0; i < numX; i++) {
      for (let j = 0; j < numZ; j++) {
        const lx = -w / 2 + marginX + i * spacingX;
        const lz = -d / 2 + marginZ + j * spacingZ;
        grid.push([lx, ceilingY(room, lx, lz), lz]);
      }
    }
    const inset = Math.min(w, d) * 0.14;
    const corners: [number, number, number][] = [
      [-w / 2 + inset, ceilingY(room, -w / 2 + inset, -d / 2 + inset), -d / 2 + inset],
      [w / 2 - inset, ceilingY(room, w / 2 - inset, -d / 2 + inset), -d / 2 + inset],
      [-w / 2 + inset, ceilingY(room, -w / 2 + inset, d / 2 - inset), d / 2 - inset],
      [w / 2 - inset, ceilingY(room, w / 2 - inset, d / 2 - inset), d / 2 - inset],
    ];
    return { lightPositions: grid, cornerFillPositions: corners };
  }, [w, d, room]);

  const getWallInfo = (wallName: "front" | "back" | "left" | "right") => {
    // Center is at the middle of the thick wall (offset outward by T/2 from room boundary)
    if (wallName === "front" || wallName === "back") {
      const zCenter = wallName === "front" ? d / 2 + T / 2 : -d / 2 - T / 2;
      return { width: w, depth: d, center: [0, h / 2, zCenter] as [number, number, number] };
    } else {
      const xCenter = wallName === "left" ? -w / 2 - T / 2 : w / 2 + T / 2;
      return { width: d, depth: w, center: [xCenter, h / 2, 0] as [number, number, number] };
    }
  };

  const renderOpening = (
    opening: { id: string; type: string; wall: string; position: number; width: number; height?: number },
    wallName: "front" | "back" | "left" | "right",
    info: { width: number; center: [number, number, number] },
    rotation: [number, number, number],
    ceilingCap: number
  ) => {
    const openingWidth = opening.width;
    const openingHeight = Math.min(
      opening.height || (opening.type === "door" ? 2.1 : 1.2),
      Math.max(0.5, ceilingCap - 0.04)
    );
    const halfWidth = info.width / 2;
    const openingCenterX = opening.position * halfWidth;

    if (opening.type === "door") {
      const frameWidth = 0.06;
      const jambH = Math.max(0.05, openingHeight - frameWidth);
      const jambCy = jambH / 2;
      const doorW = openingWidth - frameWidth * 2;
      const doorH = openingHeight - frameWidth;
      const doorThick = 0.045;
      const reveal = 0.008;
      const slabW = Math.max(0.2, doorW - reveal * 2);
      const slabH = Math.max(0.4, doorH - reveal * 2);

      // Lever + round rose (both sides)
      const handleX = slabW * 0.36;
      const handleY = -slabH * 0.02;
      const hFaceZ = doorThick / 2 + 0.002;
      const roseR = 0.028;
      const leverLen = 0.1;
      const leverR = 0.009;
      const openingPos = openingTrimWorldPos(wallName, info, openingCenterX, openingHeight / 2);

      return (
        <group key={`${wallName}-opening-${opening.id}`}>
          {/* Single flush slab; wall opening is CSG-cut */}
          <group position={openingPos} rotation={rotation}>
            <mesh material={doorSlabMaterial} castShadow receiveShadow={false}>
              <boxGeometry args={[slabW, slabH, doorThick]} />
            </mesh>
            {/* Front: rose + horizontal lever (disk in XY, slight Z offset) */}
            <mesh position={[handleX, handleY, hFaceZ]} rotation={[Math.PI / 2, 0, 0]} material={doorHandleMaterial} castShadow>
              <cylinderGeometry args={[roseR, roseR, 0.006, 32]} />
            </mesh>
            <mesh
              position={[handleX - leverLen / 2 + roseR * 0.2, handleY, hFaceZ + 0.025]}
              rotation={[0, 0, Math.PI / 2]}
              material={doorHandleMaterial}
              castShadow
            >
              <cylinderGeometry args={[leverR, leverR, leverLen, 16]} />
            </mesh>
            {/* Back */}
            <mesh position={[handleX, handleY, -hFaceZ]} rotation={[Math.PI / 2, 0, 0]} material={doorHandleMaterial} castShadow>
              <cylinderGeometry args={[roseR, roseR, 0.006, 32]} />
            </mesh>
            <mesh
              position={[handleX - leverLen / 2 + roseR * 0.2, handleY, -hFaceZ - 0.025]}
              rotation={[0, 0, Math.PI / 2]}
              material={doorHandleMaterial}
              castShadow
            >
              <cylinderGeometry args={[leverR, leverR, leverLen, 16]} />
            </mesh>
          </group>

          {/* ── Door frame — flush inside CSG hole (exact openingWidth × openingHeight) ── */}
          {/* Header */}
          <mesh
            position={openingTrimWorldPos(wallName, info, openingCenterX, openingHeight - frameWidth / 2)}
            rotation={rotation}
            material={doorFrameMaterial}
            castShadow
            receiveShadow={false}
          >
            <boxGeometry args={[openingWidth, frameWidth, T]} />
          </mesh>

          {/* Jambs: floor → underside of header (meets head without corner doubling) */}
          <mesh
            position={openingTrimWorldPos(
              wallName,
              info,
              openingCenterX - openingWidth / 2 + frameWidth / 2,
              jambCy
            )}
            rotation={rotation}
            material={doorFrameMaterial}
            castShadow
            receiveShadow={false}
          >
            <boxGeometry args={[frameWidth, jambH, T]} />
          </mesh>
          <mesh
            position={openingTrimWorldPos(
              wallName,
              info,
              openingCenterX + openingWidth / 2 - frameWidth / 2,
              jambCy
            )}
            rotation={rotation}
            material={doorFrameMaterial}
            castShadow
            receiveShadow={false}
          >
            <boxGeometry args={[frameWidth, jambH, T]} />
          </mesh>

          {/* Threshold strip */}
          <mesh position={openingTrimWorldPos(wallName, info, openingCenterX, 0.005)} rotation={rotation}>
            <boxGeometry args={[openingWidth, 0.01, T]} />
            <meshStandardMaterial
              color="#c0b8a8"
              roughness={0.35}
              metalness={0.25}
              polygonOffset
              polygonOffsetFactor={3}
              polygonOffsetUnits={5}
            />
          </mesh>
        </group>
      );
    }

    // Window: white frame + glass panes (frame depth = wall thickness)
    const frameThickness = 0.05;
    const paneWidth = (openingWidth - frameThickness * 3) / 2;
    const paneHeight = openingHeight - frameThickness * 2;
    const stileH = Math.max(0.05, openingHeight - frameThickness * 2);

    // Window sill height (bottom of window)
    const sillHeight = opening.type === "window" ? (openingHeight > 1.5 ? 0 : 0.8) : 0;
    const windowBaseY = sillHeight + openingHeight / 2;

    const pane1Pos = openingTrimWorldPos(
      wallName,
      info,
      openingCenterX - paneWidth / 2 - frameThickness / 2,
      windowBaseY
    );
    const pane2Pos = openingTrimWorldPos(
      wallName,
      info,
      openingCenterX + paneWidth / 2 + frameThickness / 2,
      windowBaseY
    );

    return (
      <group key={`${wallName}-opening-${opening.id}`}>
        {/* Two glass panes */}
        <mesh position={pane1Pos} rotation={rotation} material={windowGlassMaterial} receiveShadow={false}>
          <boxGeometry args={[paneWidth, paneHeight, 0.006]} />
        </mesh>
        <mesh position={pane2Pos} rotation={rotation} material={windowGlassMaterial} receiveShadow={false}>
          <boxGeometry args={[paneWidth, paneHeight, 0.006]} />
        </mesh>

        {/* Frame: head & sill — width matches CSG hole exactly */}
        <mesh
          position={openingTrimWorldPos(
            wallName,
            info,
            openingCenterX,
            windowBaseY + openingHeight / 2 - frameThickness / 2
          )}
          rotation={rotation}
          material={windowFrameMaterial}
          castShadow
          receiveShadow={false}
        >
          <boxGeometry args={[openingWidth, frameThickness, T]} />
        </mesh>

        <mesh
          position={openingTrimWorldPos(
            wallName,
            info,
            openingCenterX,
            windowBaseY - openingHeight / 2 + frameThickness / 2
          )}
          rotation={rotation}
          material={windowFrameMaterial}
          castShadow
          receiveShadow={false}
        >
          <boxGeometry args={[openingWidth, frameThickness, T]} />
        </mesh>

        {/* Jambs + mullion: between head & sill (same vertical span as glass) */}
        <mesh
          position={openingTrimWorldPos(
            wallName,
            info,
            openingCenterX - openingWidth / 2 + frameThickness / 2,
            windowBaseY
          )}
          rotation={rotation}
          material={windowFrameMaterial}
          castShadow
          receiveShadow={false}
        >
          <boxGeometry args={[frameThickness, stileH, T]} />
        </mesh>
        <mesh
          position={openingTrimWorldPos(
            wallName,
            info,
            openingCenterX + openingWidth / 2 - frameThickness / 2,
            windowBaseY
          )}
          rotation={rotation}
          material={windowFrameMaterial}
          castShadow
          receiveShadow={false}
        >
          <boxGeometry args={[frameThickness, stileH, T]} />
        </mesh>
        <mesh
          position={openingTrimWorldPos(wallName, info, openingCenterX, windowBaseY)}
          rotation={rotation}
          material={windowFrameMaterial}
          castShadow
          receiveShadow={false}
        >
          <boxGeometry args={[frameThickness, stileH, T]} />
        </mesh>
      </group>
    );
  };

  const renderWall = (wallName: PrismWallName) => {
    const isHidden = wallsToHide.includes(wallName);
    const segMat = isHidden ? invisibleShadowMaterial : wallMaterial;

    const wallOpenings = openings.filter((o: { wall: string }) => o.wall === wallName);
    const info = getWallInfo(wallName);
    const wallWidth = info.width;
    const halfWidth = wallWidth / 2;

    let rotation: [number, number, number] = [0, 0, 0];
    if (wallName === "front") rotation = [0, Math.PI, 0];
    else if (wallName === "left") rotation = [0, Math.PI / 2, 0];
    else if (wallName === "right") rotation = [0, -Math.PI / 2, 0];

    if (wallOpenings.length === 0) {
      return (
        <group key={wallName}>
          {wallPrismSubsegments(wallName, room, -halfWidth, halfWidth).map(([p0, p1], si) => (
            <WallPrismMesh
              key={`${wallName}-full-${si}`}
              wall={wallName}
              along0={p0}
              along1={p1}
              yBottom={0}
              room={room}
              material={segMat}
              castShadow
              receiveShadow={!isHidden}
            />
          ))}
        </group>
      );
    }

    const elements: React.JSX.Element[] = [];
    const sorted = [...wallOpenings].sort((a: { position: number }, b: { position: number }) => a.position - b.position);

    wallPrismSubsegments(wallName, room, -halfWidth, halfWidth).forEach(([p0, p1], si) => {
      elements.push(
        <WallPrismWithHolesMesh
          key={`${wallName}-csg-${si}`}
          wall={wallName}
          segAlong0={p0}
          segAlong1={p1}
          room={room}
          halfWidth={halfWidth}
          material={segMat}
          castShadow
          receiveShadow={!isHidden}
        />
      );
    });

    sorted.forEach((opening: { id: string; type: string; wall: string; position: number; width: number; height?: number }) => {
      const openingCenterAlong = opening.position * halfWidth;
      const openCeil = ceilingYAtWall(room, wallName, openingCenterAlong);

      if (isHidden && opening.type === "door") {
        const openingHeight = Math.min(
          opening.height || 2.1,
          Math.max(0.5, openCeil - 0.04)
        );
        const openingWidth = opening.width;
        const doorBlockerPos = openingTrimWorldPos(wallName, info, openingCenterAlong, openingHeight / 2);
        elements.push(
          <mesh key={`${wallName}-door-blocker-${opening.id}`} position={doorBlockerPos} rotation={rotation} material={invisibleShadowMaterial} castShadow>
            <boxGeometry args={[openingWidth, openingHeight, T]} />
          </mesh>
        );
      }

      if (!isHidden) {
        elements.push(renderOpening(opening, wallName, info, rotation, openCeil));
      }
    });

    return <group key={wallName}>{elements}</group>;
  };

  // ── Baseboard rendering (floor line only; inset at corners so runs do not overlap) ──
  const renderBaseboards = () => {
    const bh = 0.08;
    const bd = 0.012;
    const inset = bd;
    const runW = Math.max(0.1, w - 2 * inset);
    const runD = Math.max(0.1, d - 2 * inset);
    return (
      <group name="baseboards">
        {!wallsToHide.includes("back") && (
          <mesh position={[0, bh / 2, -d / 2 + bd / 2]} material={baseboardMaterial}>
            <boxGeometry args={[runW, bh, bd]} />
          </mesh>
        )}
        {!wallsToHide.includes("front") && (
          <mesh position={[0, bh / 2, d / 2 - bd / 2]} material={baseboardMaterial}>
            <boxGeometry args={[runW, bh, bd]} />
          </mesh>
        )}
        {!wallsToHide.includes("left") && (
          <mesh position={[-w / 2 + bd / 2, bh / 2, 0]} material={baseboardMaterial}>
            <boxGeometry args={[bd, bh, runD]} />
          </mesh>
        )}
        {!wallsToHide.includes("right") && (
          <mesh position={[w / 2 - bd / 2, bh / 2, 0]} material={baseboardMaterial}>
            <boxGeometry args={[bd, bh, runD]} />
          </mesh>
        )}
      </group>
    );
  };

  const wallBeamMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#fafafa",
        emissive: "#fafafa",
        emissiveIntensity: 0.25,
        roughness: 0.85,
        metalness: 0.0,
      }),
    []
  );
  const ceilingBeamMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        emissive: "#ffffff",
        emissiveIntensity: 0.35,
        roughness: 0.95,
        metalness: 0.0,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 2,
      }),
    []
  );
  useEffect(() => {
    wallBeamMaterial.color.set(wallColor);
    wallBeamMaterial.emissive.set(wallColor);
    ceilingBeamMaterial.color.set(ceilingColor);
    ceilingBeamMaterial.emissive.set(ceilingColor);
    invalidate();
  }, [wallColor, ceilingColor, wallBeamMaterial, ceilingBeamMaterial, invalidate]);

  const renderBeams = () => {
    const beams = room.beams;
    if (!beams?.length) return null;
    return (
      <group name="room-beams">
        {beams.map((b: RoomBeam) => {
          if (b.surface === "ceiling") {
            if (hideCeiling) return null;
            const cbox = getCeilingBeamBox(b, room);
            if (!cbox) return null;
            return (
              <mesh
                key={b.id}
                position={cbox.position}
                material={ceilingBeamMaterial}
                castShadow
                receiveShadow
              >
                <boxGeometry args={cbox.args} />
              </mesh>
            );
          }
          if (b.wall && wallsToHide.includes(b.wall)) return null;
          const box = getWallBeamBox(b, room);
          if (!box) return null;
          return (
            <mesh
              key={b.id}
              position={box.position}
              material={wallBeamMaterial}
              castShadow
              receiveShadow
            >
              <boxGeometry args={box.args} />
            </mesh>
          );
        })}
      </group>
    );
  };

  // ── Recessed ceiling lights ──
  // Visual fixtures (housing, reflector, trim, LED disc, glow halo) — only shown with ceiling
  const renderCeilingLightFixtures = () => {
    const housingRadius = 0.1;    // outer radius of the fixture
    const housingDepth = 0.06;    // how far it recesses into the ceiling
    const ledRadius = 0.055;      // inner LED disc radius
    const glowRadius = 0.35;      // warm halo radius on ceiling

    return (
      <group name="ceiling-light-fixtures">
        {lightPositions.map((pos, idx) => (
          <group key={`ceiling-fixture-${idx}`} position={[pos[0], pos[1], pos[2]]}>

            {/* Outer housing cylinder — recessed into ceiling */}
            <mesh
              position={[0, -housingDepth / 2, 0]}
              material={lightHousingMaterial}
            >
              <cylinderGeometry args={[housingRadius, housingRadius, housingDepth, 32, 1, true]} />
            </mesh>

            {/* Inner reflective cone — tapers inward, gives depth */}
            <mesh
              position={[0, -housingDepth / 2, 0]}
              material={lightReflectorMaterial}
            >
              <cylinderGeometry args={[ledRadius + 0.01, housingRadius - 0.01, housingDepth * 0.8, 32, 1, true]} />
            </mesh>

            {/* Trim ring — visible metal rim flush with ceiling */}
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, -0.001, 0]}
              material={lightHousingMaterial}
            >
              <ringGeometry args={[housingRadius - 0.008, housingRadius + 0.015, 32]} />
            </mesh>

            {/* LED disc — bright emissive surface at the top of the recess */}
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, -housingDepth + 0.002, 0]}
              material={lightBulbMaterial}
            >
              <circleGeometry args={[ledRadius, 24]} />
            </mesh>

            {/* Warm glow halo on ceiling surface */}
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, -0.003, 0]}
              material={lightGlowMaterial}
              renderOrder={-1}
            >
              <circleGeometry args={[glowRadius, 32]} />
            </mesh>
          </group>
        ))}
      </group>
    );
  };

  // Point lights — ceiling-only; grid casts soft shadows, corners add even floor fill (no sun).
  const renderCeilingPointLights = () => {
    const housingDepth = 0.06;
    const reach = Math.max(maxH, w, d) * 3.2;

    return (
      <group name="ceiling-lights">
        {lightPositions.map((pos, idx) => (
          <group key={`ceiling-light-${idx}`} position={[pos[0], pos[1], pos[2]]}>
            {/* Main downlight — brighter, longer reach to the floor */}
            <pointLight
              position={[0, -housingDepth - 0.02, 0]}
              intensity={2.65}
              distance={reach}
              decay={2}
              color="#fff8ee"
              castShadow
              shadow-mapSize={[1024, 1024]}
              shadow-bias={-0.00002}
              shadow-normalBias={0.035}
            />
            {/* Wider soft pool from same fixture */}
            <pointLight
              position={[0, -0.12, 0]}
              intensity={0.85}
              distance={reach * 0.92}
              decay={2}
              color="#fffaf0"
            />
          </group>
        ))}
        {cornerFillPositions.map((pos, idx) => (
          <group key={`ceiling-corner-fill-${idx}`} position={[pos[0], pos[1], pos[2]]}>
            <pointLight
              position={[0, -0.08, 0]}
              intensity={0.72}
              distance={reach}
              decay={2}
              color="#fff6ea"
            />
          </group>
        ))}
      </group>
    );
  };

  // Floor slab: always span the full wall footprint (inner room + shell thickness). Clipping to
  // the inner rectangle left the outer bottom of each wall shell with no slab under it — it read as
  // a gap / walls floating above the floor.
  const floorMinX = -w / 2 - T;
  const floorMaxX = w / 2 + T;
  const floorMinZ = -d / 2 - T;
  const floorMaxZ = d / 2 + T;
  const floorW = floorMaxX - floorMinX;
  const floorD = floorMaxZ - floorMinZ;
  const floorCx = (floorMinX + floorMaxX) / 2;
  const floorCz = (floorMinZ + floorMaxZ) / 2;

  const aoT = 0.015;
  const aoY = 0.02;
  const aoRunW = Math.max(0.05, w - 2 * aoT);
  const aoRunD = Math.max(0.05, d - 2 * aoT);

  return (
    <group>
      {/* ── Hardwood plank floor (thick slab — top=parquet, edges=neutral) ── */}
      <mesh position={[floorCx, -T / 2, floorCz]} receiveShadow name="floor" material={floorMaterials}>
        <boxGeometry args={[floorW, T, floorD]} />
      </mesh>

      {/* ── Ambient occlusion strips at floor-wall junctions (inset like baseboards — no double-dark corners) ── */}
      {!wallsToHide.includes("back") && (
        <mesh position={[0, 0.01, -d / 2]} renderOrder={1} material={floorJunctionAoMaterial}>
          <boxGeometry args={[aoRunW, aoY, aoT]} />
        </mesh>
      )}
      {!wallsToHide.includes("front") && (
        <mesh position={[0, 0.01, d / 2]} renderOrder={1} material={floorJunctionAoMaterial}>
          <boxGeometry args={[aoRunW, aoY, aoT]} />
        </mesh>
      )}
      {!wallsToHide.includes("left") && (
        <mesh position={[-w / 2, 0.01, 0]} renderOrder={1} material={floorJunctionAoMaterial}>
          <boxGeometry args={[aoT, aoY, aoRunD]} />
        </mesh>
      )}
      {!wallsToHide.includes("right") && (
        <mesh position={[w / 2, 0.01, 0]} renderOrder={1} material={floorJunctionAoMaterial}>
          <boxGeometry args={[aoT, aoY, aoRunD]} />
        </mesh>
      )}

      {/* ── Ceiling (sloped plane + thickness; bottom follows ceilingY(x,z)) ── */}
      {!hideCeiling && (
        <SlopedCeilingMesh
          room={room}
          margin={T}
          material={ceilingMaterial}
          invisibleMaterial={invisibleShadowMaterial}
          hideVisual={false}
        />
      )}
      {hideCeiling && (
        <SlopedCeilingMesh
          room={room}
          margin={T}
          material={ceilingMaterial}
          invisibleMaterial={invisibleShadowMaterial}
          hideVisual
        />
      )}

      {/* ── Walls ── */}
      {renderWall("back")}
      {renderWall("front")}
      {renderWall("left")}
      {renderWall("right")}

      {/* ── Corner columns to seal wall joints (hidden when both adjacent walls are hidden) ── */}
      {!wallsToHide.includes("back") || !wallsToHide.includes("left") ? (
        <mesh position={[-w / 2 - T / 2, ceilingY(room, -w / 2, -d / 2) / 2, -d / 2 - T / 2]} material={cornerSealMaterial}>
          <boxGeometry args={[T, ceilingY(room, -w / 2, -d / 2), T]} />
        </mesh>
      ) : null}
      {!wallsToHide.includes("back") || !wallsToHide.includes("right") ? (
        <mesh position={[w / 2 + T / 2, ceilingY(room, w / 2, -d / 2) / 2, -d / 2 - T / 2]} material={cornerSealMaterial}>
          <boxGeometry args={[T, ceilingY(room, w / 2, -d / 2), T]} />
        </mesh>
      ) : null}
      {!wallsToHide.includes("front") || !wallsToHide.includes("left") ? (
        <mesh position={[-w / 2 - T / 2, ceilingY(room, -w / 2, d / 2) / 2, d / 2 + T / 2]} material={cornerSealMaterial}>
          <boxGeometry args={[T, ceilingY(room, -w / 2, d / 2), T]} />
        </mesh>
      ) : null}
      {!wallsToHide.includes("front") || !wallsToHide.includes("right") ? (
        <mesh position={[w / 2 + T / 2, ceilingY(room, w / 2, d / 2) / 2, d / 2 + T / 2]} material={cornerSealMaterial}>
          <boxGeometry args={[T, ceilingY(room, w / 2, d / 2), T]} />
        </mesh>
      ) : null}

      {/* ── Baseboards ── */}
      {renderBaseboards()}

      {/* ── Ceiling point lights (always on so room stays lit) ── */}
      {renderCeilingPointLights()}

      {/* ── Recessed ceiling light fixtures (visual only — hidden with ceiling) ── */}
      {!hideCeiling && renderCeilingLightFixtures()}

      {renderBeams()}
    </group>
  );
}

export default function RoomMesh() {
  const room = usePlannerStore((s) => s.room);
  if (roomUsesFloorOutline(room)) {
    return <PolygonRoomMesh />;
  }
  return <RectangularRoomMesh />;
}
