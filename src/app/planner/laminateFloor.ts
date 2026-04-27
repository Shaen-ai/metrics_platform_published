/**
 * Laminate wooden floor texture generation.
 * 120cm × 20cm planks in half-bond layout — shared by RoomMesh and WardrobeCanvas.
 */
import * as THREE from "three";
import type { FloorStyle } from "./types";

/** Seeded RNG returning [0, 1) — avoids overflow that can produce negative values */
function seededRandom(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s * 1103515245 + 12345) >>> 0;
    return (s >>> 0) / 0x100000000;
  };
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function clamp255(v: number) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

interface FloorPalette {
  planks: string[];
  grain: string;
  gap: string;
  knot: string;
  grainAlpha: number;
}

const FLOOR_PALETTES: Record<string, FloorPalette> = {
  "laminate-light-oak": {
    planks: ["#e8dcc8", "#dfd3bf", "#ede1d1", "#d8cdb9", "#e3d9c5", "#f0e4d6"],
    grain: "#c0b496",
    gap: "#c8bda5",
    knot: "#c9ba9e",
    grainAlpha: 0.12,
  },
  "laminate-natural-oak": {
    planks: ["#d4b896", "#cea87e", "#d8c09a", "#c8a068", "#d0b088", "#ccac78"],
    grain: "#b08c58",
    gap: "#c0a880",
    knot: "#c0a878",
    grainAlpha: 0.14,
  },
  "laminate-honey-oak": {
    planks: ["#d8a854", "#d4a04a", "#e0b060", "#cc9840", "#dcac58", "#d0a048"],
    grain: "#b07e2c",
    gap: "#b89040",
    knot: "#c09048",
    grainAlpha: 0.14,
  },
  "laminate-walnut": {
    planks: ["#6b4e3d", "#5a4032", "#7a5845", "#523a2a", "#734d38", "#5e4335"],
    grain: "#42281a",
    gap: "#48301e",
    knot: "#523828",
    grainAlpha: 0.16,
  },
  "laminate-dark-brown": {
    planks: ["#5c3d28", "#4e3220", "#6a472e", "#5a3a24", "#63412a", "#523622"],
    grain: "#321a0c",
    gap: "#38200e",
    knot: "#3f2616",
    grainAlpha: 0.16,
  },
  "laminate-gray-ash": {
    planks: ["#a09890", "#989088", "#a89c94", "#908880", "#a09a92", "#9a928a"],
    grain: "#686058",
    gap: "#706860",
    knot: "#787068",
    grainAlpha: 0.12,
  },
  "laminate-whitewashed": {
    planks: ["#f5f0e8", "#efeae2", "#f8f4ec", "#e8e3da", "#f2ede5", "#faf6ee"],
    grain: "#d0c8ba",
    gap: "#dcd4c8",
    knot: "#e0d8cc",
    grainAlpha: 0.1,
  },
  "laminate-cherry": {
    planks: ["#8b3a2a", "#7e3425", "#964030", "#733028", "#8a3828", "#7a3222"],
    grain: "#5a1e12",
    gap: "#602418",
    knot: "#6e2c1e",
    grainAlpha: 0.15,
  },
  "laminate-maple": {
    planks: ["#f0dcc0", "#e8d4b8", "#f4e0c8", "#e2ceb0", "#eed8bc", "#f2dcc4"],
    grain: "#c8b498",
    gap: "#d4c0a8",
    knot: "#d8c4a8",
    grainAlpha: 0.10,
  },
  "laminate-ebony": {
    planks: ["#2e2218", "#261c12", "#342620", "#221a10", "#2c2016", "#281e14"],
    grain: "#181008",
    gap: "#1c140a",
    knot: "#201810",
    grainAlpha: 0.18,
  },
  "laminate-slate": {
    planks: ["#686870", "#606068", "#707078", "#585860", "#6c6c74", "#626268"],
    grain: "#484850",
    gap: "#505058",
    knot: "#585860",
    grainAlpha: 0.12,
  },
  "laminate-bamboo": {
    planks: ["#e8d088", "#e0c878", "#ecd890", "#dcc070", "#e4cc80", "#d8c068"],
    grain: "#b8a050",
    gap: "#c4a858",
    knot: "#c8ac60",
    grainAlpha: 0.11,
  },
  "laminate-light-gray": {
    planks: ["#c8c8cc", "#c0c0c4", "#d0d0d4", "#b8b8bc", "#ccccd0", "#c4c4c8"],
    grain: "#a0a0a4",
    gap: "#a8a8ac",
    knot: "#b0b0b4",
    grainAlpha: 0.10,
  },
  "laminate-charcoal": {
    planks: ["#454550", "#3e3e48", "#4c4c56", "#383842", "#48484e", "#424248"],
    grain: "#2a2a30",
    gap: "#303038",
    knot: "#363640",
    grainAlpha: 0.14,
  },
};

function drawWoodGrain(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  grainColor: string, alpha: number, rng: () => number
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  const numGrains = 12 + Math.floor(rng() * 10);
  for (let g = 0; g < numGrains; g++) {
    const gy = y + (g / numGrains) * h + (rng() - 0.5) * (h * 0.12);
    ctx.strokeStyle = grainColor;
    ctx.globalAlpha = alpha * (0.5 + rng() * 0.5);
    ctx.lineWidth = 0.3 + rng() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, gy);
    const segments = 8 + Math.floor(rng() * 6);
    for (let s = 1; s <= segments; s++) {
      const sx = x + (s / segments) * w;
      const sy = gy + (rng() - 0.5) * h * 0.1;
      ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }

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

  const numArcs = rng() > 0.3 ? 1 + Math.floor(rng() * 3) : 0;
  for (let a = 0; a < numArcs; a++) {
    const arcX = x + w * 0.1 + rng() * w * 0.8;
    const arcY = y + rng() * h;
    const arcR = Math.max(1, 6 + rng() * 20);
    ctx.globalAlpha = alpha * (0.15 + rng() * 0.2);
    ctx.strokeStyle = grainColor;
    ctx.lineWidth = 0.4 + rng() * 0.6;
    ctx.beginPath();
    ctx.arc(arcX, arcY, arcR, 0, Math.PI * (0.4 + rng() * 0.8));
    ctx.stroke();
  }

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

const laminateCache = new Map<string, THREE.CanvasTexture>();

/** Laminate 120×20cm planks, half-bond layout. Tile = 240×120cm. */
export function createLaminateFloorTexture(style: FloorStyle): THREE.CanvasTexture {
  const key = `laminate-tex-${style}`;
  if (laminateCache.has(key)) return laminateCache.get(key)!;

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
  const palette = FLOOR_PALETTES[style] ?? FLOOR_PALETTES["laminate-natural-oak"];

  const drawPlank = (x: number, y: number, pw: number, ph: number, colorIdx: number) => {
    const baseColor = palette.planks[colorIdx % palette.planks.length];
    const [br, bg, bb] = hexToRgb(baseColor);
    const pv = (rng() - 0.5) * 18;
    const warmShift = (rng() - 0.5) * 6;
    ctx.fillStyle = `rgb(${clamp255(br + pv + warmShift)},${clamp255(bg + pv)},${clamp255(bb + pv - warmShift)})`;
    ctx.fillRect(x, y, pw, ph);

    const plankGrad = ctx.createLinearGradient(x, y, x + pw, y + ph);
    const gradSign = rng() > 0.5 ? 1 : -1;
    plankGrad.addColorStop(0, `rgba(${gradSign > 0 ? 255 : 0},${gradSign > 0 ? 255 : 0},${gradSign > 0 ? 255 : 0},0.02)`);
    plankGrad.addColorStop(1, `rgba(${gradSign > 0 ? 0 : 255},${gradSign > 0 ? 0 : 255},${gradSign > 0 ? 0 : 255},0.02)`);
    ctx.fillStyle = plankGrad;
    ctx.fillRect(x, y, pw, ph);

    drawWoodGrain(ctx, x, y, pw, ph, palette.grain, palette.grainAlpha, rng);

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
      for (let p = 0; p < 2; p++) {
        drawPlank(p * PLANK_LEN, y, PLANK_LEN, PLANK_H, row * 2 + p);
      }
      ctx.strokeStyle = palette.gap;
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(PLANK_LEN, y + 0.5);
      ctx.lineTo(PLANK_LEN, y + PLANK_H - 0.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      drawPlank(0, y, HALF_LEN, PLANK_H, row * 2);
      drawPlank(W - HALF_LEN, y, HALF_LEN, PLANK_H, row * 2);
      drawPlank(HALF_LEN, y, PLANK_LEN, PLANK_H, row * 2 + 1);
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
  tex.colorSpace = THREE.SRGBColorSpace;
  laminateCache.set(key, tex);
  return tex;
}

/** Roughness map for laminate floor */
export function createLaminateFloorRoughnessMap(style: FloorStyle): THREE.CanvasTexture {
  const key = `laminate-rough-${style}`;
  if (laminateCache.has(key)) return laminateCache.get(key)!;

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
  const baseSmooth = 30;

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
      }
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
      ctx.fillStyle = "rgb(100,100,100)";
      ctx.fillRect(HALF_LEN - 1, y, 2, PLANK_H);
      ctx.fillRect(W - HALF_LEN - 1, y, 2, PLANK_H);
    }
    if (row > 0) {
      ctx.fillStyle = "rgb(100,100,100)";
      ctx.fillRect(0, y - 1, W, 2);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  laminateCache.set(key, tex);
  return tex;
}

/** Normal map for laminate floor — beveled plank edges */
export function createLaminateFloorNormalMap(style: FloorStyle): THREE.CanvasTexture {
  const key = `laminate-normal-${style}`;
  if (laminateCache.has(key)) return laminateCache.get(key)!;

  const W = 2048;
  const H = 1024;
  const PLANK_LEN = 1024;
  const PLANK_H = H / 6;
  const HALF_LEN = PLANK_LEN / 2;
  const NUM_ROWS = 6;
  const BEVEL = 3;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "rgb(128,128,255)";
  ctx.fillRect(0, 0, W, H);

  const drawVerticalBevel = (x: number, y: number, bh: number) => {
    const leftGrad = ctx.createLinearGradient(x - BEVEL, 0, x, 0);
    leftGrad.addColorStop(0, "rgb(128,128,255)");
    leftGrad.addColorStop(1, "rgb(100,128,235)");
    ctx.fillStyle = leftGrad;
    ctx.fillRect(x - BEVEL, y, BEVEL, bh);
    const rightGrad = ctx.createLinearGradient(x, 0, x + BEVEL, 0);
    rightGrad.addColorStop(0, "rgb(156,128,235)");
    rightGrad.addColorStop(1, "rgb(128,128,255)");
    ctx.fillStyle = rightGrad;
    ctx.fillRect(x, y, BEVEL, bh);
    ctx.fillStyle = "rgb(128,128,220)";
    ctx.fillRect(x, y, 1, bh);
  };

  const drawHorizontalBevel = (y: number) => {
    const topGrad = ctx.createLinearGradient(0, y - BEVEL, 0, y);
    topGrad.addColorStop(0, "rgb(128,128,255)");
    topGrad.addColorStop(1, "rgb(128,100,235)");
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, y - BEVEL, W, BEVEL);
    const botGrad = ctx.createLinearGradient(0, y, 0, y + BEVEL);
    botGrad.addColorStop(0, "rgb(128,156,235)");
    botGrad.addColorStop(1, "rgb(128,128,255)");
    ctx.fillStyle = botGrad;
    ctx.fillRect(0, y, W, BEVEL);
    ctx.fillStyle = "rgb(128,128,220)";
    ctx.fillRect(0, y, W, 1);
  };

  for (let row = 0; row < NUM_ROWS; row++) {
    const y = row * PLANK_H;
    const isOdd = row % 2 === 1;
    if (row > 0) drawHorizontalBevel(y);
    if (!isOdd) {
      drawVerticalBevel(PLANK_LEN, y, PLANK_H);
    } else {
      drawVerticalBevel(HALF_LEN, y, PLANK_H);
      drawVerticalBevel(W - HALF_LEN, y, PLANK_H);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  laminateCache.set(key, tex);
  return tex;
}
