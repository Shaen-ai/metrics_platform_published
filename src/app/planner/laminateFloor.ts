/**
 * Laminate wooden floor texture generation.
 * 120cm × 20cm planks in half-bond layout — shared by RoomMesh and WardrobeCanvas.
 */
import * as THREE from "three";
import { FLOOR_STYLE_TINTS, type FloorStyle } from "./types";

const WOOD_TEXTURE_PATHS = {
  color: "/textures/wood/color.jpg",
  normal: "/textures/wood/normal.jpg",
  roughness: "/textures/wood/roughness.jpg",
} as const;

let woodBaseImage: HTMLImageElement | null = null;
let woodNormalImage: HTMLImageElement | null = null;
let woodRoughnessImage: HTMLImageElement | null = null;

if (typeof window !== "undefined") {
  woodBaseImage = new Image();
  woodBaseImage.crossOrigin = "anonymous";
  woodBaseImage.src = WOOD_TEXTURE_PATHS.color;

  woodNormalImage = new Image();
  woodNormalImage.crossOrigin = "anonymous";
  woodNormalImage.src = WOOD_TEXTURE_PATHS.normal;

  woodRoughnessImage = new Image();
  woodRoughnessImage.crossOrigin = "anonymous";
  woodRoughnessImage.src = WOOD_TEXTURE_PATHS.roughness;
}

function textureFromLoadedImage(img: HTMLImageElement | null): THREE.Texture | null {
  if (!img?.complete || img.naturalWidth <= 0) return null;
  const tex = new THREE.Texture(img);
  tex.needsUpdate = true;
  return tex;
}

function loadTextureWithFallback(
  img: HTMLImageElement | null,
  path: string,
  loader: THREE.TextureLoader,
  fallback: () => THREE.Texture,
  onUpdate?: () => void,
): THREE.Texture {
  const loaded = textureFromLoadedImage(img);
  if (loaded) return loaded;

  const tex = loader.load(path, onUpdate, undefined, () => {
    const fallbackTex = fallback();
    Object.assign(tex, { image: fallbackTex.image });
    tex.needsUpdate = true;
    onUpdate?.();
  });
  return tex;
}

function tintWoodTextureFromImage(
  img: HTMLImageElement,
  hue: string,
  lift: number,
  mode: "color" | "multiply",
): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  if (mode === "multiply") {
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = hue;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
  } else {
    ctx.globalCompositeOperation = "color";
    ctx.fillStyle = hue;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.globalCompositeOperation = "source-over";
  const liftAmount = mode === "multiply" ? lift * 0.5 : lift;
  if (liftAmount > 0) {
    ctx.fillStyle = `rgba(255,255,255,${liftAmount})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else if (liftAmount < 0) {
    ctx.fillStyle = `rgba(0,0,0,${-liftAmount})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  return new THREE.CanvasTexture(canvas);
}

function setTextureRepeat(tex: THREE.Texture, repeat: [number, number]) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
}

export type PlannerFloorMaterialOptions = {
  floorStyle: FloorStyle;
  repeat?: [number, number];
  onTextureUpdate?: () => void;
  toneMode?: "color" | "multiply";
  tintLerp?: { color: THREE.ColorRepresentation; alpha: number };
  roughness?: number;
  metalness?: number;
  envMapIntensity?: number;
  side?: THREE.Side;
};

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

export function createPlannerFloorMaterial({
  floorStyle,
  repeat = [2.25, 2.25],
  onTextureUpdate,
  toneMode = "color",
  tintLerp,
  roughness = 0.7,
  metalness = 0,
  envMapIntensity,
  side = THREE.DoubleSide,
}: PlannerFloorMaterialOptions): THREE.MeshStandardMaterial {
  const loader = new THREE.TextureLoader();
  const { hue, lift, tint } =
    FLOOR_STYLE_TINTS[floorStyle] ?? { hue: "#c8a070", lift: 0, tint: "#ffffff" };

  let map: THREE.Texture;
  if (woodBaseImage?.complete && woodBaseImage.naturalWidth > 0) {
    map = tintWoodTextureFromImage(woodBaseImage, hue, lift, toneMode);
  } else {
    map = loadTextureWithFallback(
      woodBaseImage,
      WOOD_TEXTURE_PATHS.color,
      loader,
      () => createLaminateFloorTexture(floorStyle),
      onTextureUpdate,
    );
  }

  const normalMap = loadTextureWithFallback(
    woodNormalImage,
    WOOD_TEXTURE_PATHS.normal,
    loader,
    () => createLaminateFloorNormalMap(floorStyle),
    onTextureUpdate,
  );
  const roughnessMap = loadTextureWithFallback(
    woodRoughnessImage,
    WOOD_TEXTURE_PATHS.roughness,
    loader,
    () => createLaminateFloorRoughnessMap(floorStyle),
    onTextureUpdate,
  );

  [map, normalMap, roughnessMap].forEach((tex) => setTextureRepeat(tex, repeat));
  map.colorSpace = THREE.SRGBColorSpace;

  const materialColor = new THREE.Color(tint);
  if (tintLerp) {
    materialColor.lerp(new THREE.Color(tintLerp.color), tintLerp.alpha);
  }

  const material = new THREE.MeshStandardMaterial({
    map,
    normalMap,
    roughnessMap,
    color: materialColor,
    side,
    roughness,
    metalness,
  });

  if (envMapIntensity !== undefined) {
    material.envMapIntensity = envMapIntensity;
  }

  return material;
}
