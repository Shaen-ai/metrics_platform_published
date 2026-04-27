import * as THREE from "three";

const cache = new Map<string, THREE.CanvasTexture>();

const FALLBACK_HEX = "#cccccc";

function normalizeHex(hex: string | null | undefined): string {
  if (typeof hex !== "string") return FALLBACK_HEX;
  const h = hex.trim();
  if (h === "") return FALLBACK_HEX;
  if (/^#[0-9a-fA-F]{6}$/.test(h)) return h;
  if (/^[0-9a-fA-F]{6}$/.test(h)) return `#${h}`;
  return FALLBACK_HEX;
}

function hexToRgb(hex: string | null | undefined): [number, number, number] {
  const c = parseInt(normalizeHex(hex).replace("#", ""), 16);
  if (Number.isNaN(c)) return [204, 204, 204];
  return [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
}

/* Integer hash → [0, 1) */
function hash(x: number, y: number): number {
  let h = ((x | 0) * 374761393 + (y | 0) * 668265263) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

/* Bilinear value noise */
function vnoise(x: number, y: number): number {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  const fx = x - ix,
    fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy),
    b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1),
    d = hash(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/* Fractal Brownian Motion */
function fbm(x: number, y: number, oct = 4): number {
  let v = 0,
    a = 0.5,
    f = 1;
  for (let i = 0; i < oct; i++) {
    v += a * vnoise(x * f, y * f);
    a *= 0.5;
    f *= 2;
  }
  return v;
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Seeded pseudo-random [0,1) for repeatable textures — robust to overflow */
function seededRandom(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s * 1103515245 + 12345) >>> 0;
    return (s >>> 0) / 0x100000000;
  };
}

function clamp255(v: number) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

// ── Wood grain texture ──────────────────────────────────────────────────────

export interface WoodOptions {
  width?: number;
  height?: number;
  grainCount?: number;
  grainContrast?: number;
  warpStrength?: number;
  seed?: number;
}

export function generateWoodTexture(
  baseColor: string,
  opts: WoodOptions = {},
): THREE.CanvasTexture {
  const key = `w:${baseColor}:${JSON.stringify(opts)}`;
  if (cache.has(key)) return cache.get(key)!;

  const {
    width = 1024,
    height = 1024,
    grainCount = 30,
    grainContrast = 0.22,
    warpStrength = 0.15,
    seed = 0,
  } = opts;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(width, height);
  const px = img.data;

  const base = hexToRgb(baseColor);
  const gc = grainContrast;

  const dark: [number, number, number] = [
    Math.max(0, base[0] - gc * 65),
    Math.max(0, base[1] - gc * 60),
    Math.max(0, base[2] - gc * 55),
  ];
  const light: [number, number, number] = [
    Math.min(255, base[0] + gc * 28),
    Math.min(255, base[1] + gc * 24),
    Math.min(255, base[2] + gc * 20),
  ];

  for (let py = 0; py < height; py++) {
    for (let ppx = 0; ppx < width; ppx++) {
      const u = ppx / width;
      const v = py / height;

      const wu = fbm(u * 4 + seed, v * 4 + seed, 3) * warpStrength;
      const wv =
        fbm(u * 4 + seed + 5.3, v * 4 + seed + 8.7, 3) *
        warpStrength *
        0.3;

      const g = Math.sin(
        (u + wu) * grainCount * Math.PI * 2 + wv * grainCount * 2,
      );
      const gs = Math.sign(g) * Math.pow(Math.abs(g), 0.7);
      const t = gs * 0.5 + 0.5;

      let r = dark[0] + (light[0] - dark[0]) * t;
      let gr = dark[1] + (light[1] - dark[1]) * t;
      let b = dark[2] + (light[2] - dark[2]) * t;

      const n1 = (vnoise(ppx * 0.5 + seed, py * 0.5 + seed) - 0.5) * 8;
      const n2 =
        (fbm(u * 2 + seed + 3.1, v * 1.5 + seed + 7.2, 2) - 0.5) * gc * 45;

      r = clamp(r + n1 + n2);
      gr = clamp(gr + n1 + n2);
      b = clamp(b + n1 + n2 * 0.85);

      const i = (py * width + ppx) * 4;
      px[i] = r;
      px[i + 1] = gr;
      px[i + 2] = b;
      px[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 16;
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

// ── Wood bump texture (matches grain pattern for physical depth) ─────────────

export function generateWoodBumpTexture(
  baseColor: string,
  opts: WoodOptions = {},
): THREE.CanvasTexture {
  const key = `wb:${baseColor}:${JSON.stringify(opts)}`;
  if (cache.has(key)) return cache.get(key)!;

  const {
    width = 512,
    height = 512,
    grainCount = 30,
    warpStrength = 0.15,
    seed = 0,
  } = opts;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(width, height);
  const px = img.data;

  for (let py = 0; py < height; py++) {
    for (let ppx = 0; ppx < width; ppx++) {
      const u = ppx / width;
      const v = py / height;

      const wu = fbm(u * 4 + seed, v * 4 + seed, 3) * warpStrength;
      const wv = fbm(u * 4 + seed + 5.3, v * 4 + seed + 8.7, 3) * warpStrength * 0.3;

      const g = Math.sin((u + wu) * grainCount * Math.PI * 2 + wv * grainCount * 2);
      const gs = Math.sign(g) * Math.pow(Math.abs(g), 0.7);
      const t = gs * 0.5 + 0.5;

      const micro = (vnoise(ppx * 0.8 + seed, py * 0.8 + seed) - 0.5) * 12;
      const lum = clamp(128 + (t - 0.5) * 100 + micro);
      const i = (py * width + ppx) * 4;
      px[i] = lum;
      px[i + 1] = lum;
      px[i + 2] = lum;
      px[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 16;
  cache.set(key, tex);
  return tex;
}

// ── Subtle noise texture (for matte/gloss solids) ───────────────────────────

export function generateSubtleTexture(
  baseColor: string,
  opts: { width?: number; height?: number; amount?: number; seed?: number } = {},
): THREE.CanvasTexture {
  const key = `s:${baseColor}:${JSON.stringify(opts)}`;
  if (cache.has(key)) return cache.get(key)!;

  const { width = 256, height = 256, amount = 0.015, seed = 0 } = opts;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(width, height);
  const px = img.data;
  const base = hexToRgb(baseColor);

  for (let py = 0; py < height; py++) {
    for (let ppx = 0; ppx < width; ppx++) {
      const n =
        (vnoise(ppx * 0.3 + seed, py * 0.3 + seed) - 0.5) * amount * 255;
      const ln =
        (fbm(ppx / width * 3 + seed, py / height * 3 + seed, 2) - 0.5) *
        amount *
        200;
      const i = (py * width + ppx) * 4;
      px[i] = clamp(base[0] + n + ln);
      px[i + 1] = clamp(base[1] + n + ln);
      px[i + 2] = clamp(base[2] + n + ln);
      px[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 16;
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

// ── Parquet (herringbone) floor texture ─────────────────────────────────────
// IKEA-style: light oak, fine subtle grain, cathedral arches, tight joints, no knots

function drawParquetGrain(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  grainColor: string, alpha: number, rng: () => number
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  // Primary grain — fine linear lines with slight wave, along plank length
  const numGrains = 14 + Math.floor(rng() * 12);
  for (let g = 0; g < numGrains; g++) {
    const gx = x + (g / numGrains) * w + (rng() - 0.5) * (w * 0.06);
    ctx.strokeStyle = grainColor;
    ctx.globalAlpha = alpha * (0.35 + rng() * 0.4);
    ctx.lineWidth = 0.2 + rng() * 0.5;
    ctx.beginPath();
    ctx.moveTo(gx, y);
    const segments = 10 + Math.floor(rng() * 8);
    for (let s = 1; s <= segments; s++) {
      const t = s / segments;
      const sy = y + t * h;
      const wave = Math.sin(t * Math.PI * 2 + rng() * 2) * (h * 0.03);
      ctx.lineTo(gx + wave + (rng() - 0.5) * (w * 0.02), sy);
    }
    ctx.stroke();
  }

  // Cathedral arches — soft elongated U-shapes via quadratic curves
  const numArches = rng() > 0.5 ? 1 + Math.floor(rng() * 2) : 0;
  for (let a = 0; a < numArches; a++) {
    const archY = y + h * (0.15 + rng() * 0.7);
    const archW = w * (0.15 + rng() * 0.4);
    const archX = x + w * (0.1 + rng() * 0.7);
    const ctrlY = archY - h * (0.08 + rng() * 0.12);
    ctx.strokeStyle = grainColor;
    ctx.globalAlpha = alpha * (0.15 + rng() * 0.15);
    ctx.lineWidth = 0.25 + rng() * 0.4;
    ctx.beginPath();
    ctx.moveTo(archX, archY);
    ctx.quadraticCurveTo(archX + archW / 2, ctrlY, archX + archW, archY);
    ctx.stroke();
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

export function generateParquetTexture(): THREE.CanvasTexture {
  const CACHE_KEY = "parquet-hq-v7-natural-oak";
  if (cache.has(CACHE_KEY)) return cache.get(CACHE_KEY)!;

  const W = 2048;
  const H = 2048;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const rng = seededRandom(12345);

  // Natural medium oak — warm amber tones, visible grain contrast, realistic variation
  const palette = {
    planks: ["#c8955a", "#ba8850", "#d0a065", "#b88048", "#c59058", "#cc9862", "#b88450", "#c0905a"],
    grain: "#7a4e20",
    gap: "#8a6030",
  };

  const blockLen = PARQUET.blockLen;
  const blockWid = PARQUET.blockWid;
  const gap = PARQUET.gap;
  const cos45 = 0.7071;
  const stepX = blockLen * cos45 + gap * 2;
  const stepY = blockLen * cos45 + gap;
  const hw = (blockLen - gap) / 2;
  const hh = (blockWid - gap) / 2;

  const blocks: Array<{ cx: number; cy: number; angle: number }> = [];
  for (let row = 0; row < PARQUET.rows; row++) {
    for (let col = 0; col < PARQUET.cols; col++) {
      const cx = col * stepX + (row % 2) * (stepX / 2) + stepX / 2;
      const cy = row * stepY + stepY / 2;
      blocks.push({
        cx,
        cy,
        angle: (row % 2 === 0 ? 1 : -1) * Math.PI / 4,
      });
    }
  }

  ctx.fillStyle = "#7a5030"; // Darker gap/joint color for natural oak look
  ctx.fillRect(0, 0, W, H);

  for (let idx = 0; idx < blocks.length; idx++) {
    const b = blocks[idx];
    const plankRng = seededRandom(42 + idx * 17);

    ctx.save();
    ctx.translate(b.cx, b.cy);
    ctx.rotate(b.angle);
    ctx.translate(-hw, -hh);

    const baseColor = palette.planks[idx % palette.planks.length];
    const [br, bg, bb] = hexToRgb(baseColor);
    const pv = (plankRng() - 0.5) * 38;
    const warm = (plankRng() - 0.5) * 22;
    ctx.fillStyle = `rgb(${clamp255(br + pv + warm)},${clamp255(bg + pv * 0.9)},${clamp255(bb + pv * 0.7 - warm)})`;
    ctx.fillRect(0, 0, hw * 2, hh * 2);

    drawParquetGrain(ctx, 0, 0, hw * 2, hh * 2, palette.grain, 0.22, plankRng);

    ctx.restore();
  }

  ctx.strokeStyle = palette.gap;
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.55;
  for (let idx = 0; idx < blocks.length; idx++) {
    const b = blocks[idx];
    ctx.save();
    ctx.translate(b.cx, b.cy);
    ctx.rotate(b.angle);
    ctx.strokeRect(-hw, -hh, hw * 2, hh * 2);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // Lacquer highlight — subtle sheen per plank
  for (let idx = 0; idx < blocks.length; idx++) {
    const b = blocks[idx];
    ctx.save();
    ctx.translate(b.cx, b.cy);
    ctx.rotate(b.angle);
    const grad = ctx.createLinearGradient(0, 0, 0, hh * 2);
    grad.addColorStop(0, "rgba(255,240,200,0.06)");
    grad.addColorStop(0.3, "rgba(255,255,255,0.04)");
    grad.addColorStop(0.7, "rgba(0,0,0,0.02)");
    grad.addColorStop(1, "rgba(0,0,0,0.04)");
    ctx.fillStyle = grad;
    ctx.fillRect(-hw, -hh, hw * 2, hh * 2);
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(CACHE_KEY, tex);
  return tex;
}

/** Parquet block layout — shared for roughness/normal maps (must match texture) */
const PARQUET = {
  blockLen: 130,
  blockWid: 26,
  gap: 1,
  rows: 20,
  cols: 20,
};
function getParquetBlocks(): Array<{ cx: number; cy: number; angle: number; hw: number; hh: number }> {
  const { blockLen, blockWid, gap, rows, cols } = PARQUET;
  const cos45 = 0.7071;
  const stepX = blockLen * cos45 + gap * 2;
  const stepY = blockLen * cos45 + gap;
  const hw = (blockLen - gap) / 2;
  const hh = (blockWid - gap) / 2;

  const blocks: Array<{ cx: number; cy: number; angle: number; hw: number; hh: number }> = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = col * stepX + (row % 2) * (stepX / 2) + stepX / 2;
      const cy = row * stepY + stepY / 2;
      blocks.push({
        cx,
        cy,
        angle: (row % 2 === 0 ? 1 : -1) * Math.PI / 4,
        hw,
        hh,
      });
    }
  }
  return blocks;
}

/** Roughness map matching parquet layout — lacquered wood strips smooth, joints rougher.
 *  Uses Canvas 2D filled rectangles instead of per-pixel iteration for ~1000x speedup. */
export function generateParquetRoughnessMap(): THREE.CanvasTexture {
  const CACHE_KEY = "parquet-rough-hq-v7";
  if (cache.has(CACHE_KEY)) return cache.get(CACHE_KEY)!;

  const W = 1024;
  const H = 1024;
  const scale = W / 2048;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const jointRough = 110;
  const woodSmooth = 22;

  ctx.fillStyle = `rgb(${jointRough},${jointRough},${jointRough})`;
  ctx.fillRect(0, 0, W, H);

  const blocks = getParquetBlocks();
  ctx.fillStyle = `rgb(${woodSmooth},${woodSmooth},${woodSmooth})`;
  for (const b of blocks) {
    ctx.save();
    ctx.translate(b.cx * scale, b.cy * scale);
    ctx.rotate(b.angle);
    const insetW = b.hw * 0.9 * scale;
    const insetH = b.hh * 0.9 * scale;
    ctx.fillRect(-insetW, -insetH, insetW * 2, insetH * 2);
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  cache.set(CACHE_KEY, tex);
  return tex;
}

/** Normal map for parquet — beveled edges at joints for depth.
 *  Reduced to 512×512 with precomputed trig + spatial grid for ~50x speedup. */
export function generateParquetNormalMap(): THREE.CanvasTexture {
  const CACHE_KEY = "parquet-normal-hq-v7";
  if (cache.has(CACHE_KEY)) return cache.get(CACHE_KEY)!;

  const W = 512;
  const H = 512;
  const scale = W / 2048;
  const img = new ImageData(W, H);
  const px = img.data;

  const rawBlocks = getParquetBlocks();
  const blocks = rawBlocks.map((b) => ({
    cx: b.cx * scale,
    cy: b.cy * scale,
    hw: b.hw * scale,
    hh: b.hh * scale,
    cos: Math.cos(b.angle),
    sin: Math.sin(b.angle),
  }));

  const GRID = 32;
  const cellW = W / GRID;
  const cellH = H / GRID;
  const grid: number[][] = Array.from({ length: GRID * GRID }, () => []);
  for (let bi = 0; bi < blocks.length; bi++) {
    const b = blocks[bi];
    const corners = [
      [-b.hw, -b.hh], [b.hw, -b.hh], [-b.hw, b.hh], [b.hw, b.hh],
    ] as const;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [lx, ly] of corners) {
      const rx = b.cx + lx * b.cos - ly * b.sin;
      const ry = b.cy + lx * b.sin + ly * b.cos;
      if (rx < minX) minX = rx;
      if (rx > maxX) maxX = rx;
      if (ry < minY) minY = ry;
      if (ry > maxY) maxY = ry;
    }
    const c0 = Math.max(0, Math.floor(minX / cellW));
    const c1 = Math.min(GRID - 1, Math.floor(maxX / cellW));
    const r0 = Math.max(0, Math.floor(minY / cellH));
    const r1 = Math.min(GRID - 1, Math.floor(maxY / cellH));
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) grid[r * GRID + c].push(bi);
  }

  for (let py = 0; py < H; py++) {
    const row = Math.min(GRID - 1, (py / cellH) | 0);
    for (let ppx = 0; ppx < W; ppx++) {
      const i = (py * W + ppx) * 4;
      let r = 128, g = 128, b = 255;

      const col = Math.min(GRID - 1, (ppx / cellW) | 0);
      const candidates = grid[row * GRID + col];
      for (let ci = 0; ci < candidates.length; ci++) {
        const block = blocks[candidates[ci]];
        const dx = ppx - block.cx;
        const dy = py - block.cy;
        const lx = dx * block.cos + dy * block.sin;
        const ly = -dx * block.sin + dy * block.cos;
        const ax = Math.abs(lx);
        const ay = Math.abs(ly);
        if (ax <= block.hw && ay <= block.hh) {
          const edgeX = 1 - ax / block.hw;
          const edgeY = 1 - ay / block.hh;
          if (edgeX < 0.1 || edgeY < 0.1) {
            const t = Math.min(edgeX, edgeY) / 0.1;
            const tilt = (1 - t) * 38;
            r = 128 + (lx < 0 ? -tilt : tilt) + 0.5 | 0;
            g = 128 + (ly < 0 ? -tilt : tilt) + 0.5 | 0;
            b = 255 - Math.abs(tilt) * 0.7 + 0.5 | 0;
          }
          break;
        }
      }

      px[i] = r < 0 ? 0 : r > 255 ? 255 : r;
      px[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      px[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      px[i + 3] = 255;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  canvas.getContext("2d")!.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  cache.set(CACHE_KEY, tex);
  return tex;
}

// ── Wood-plank floor texture ────────────────────────────────────────────────

export function generateFloorTexture(): THREE.CanvasTexture {
  if (cache.has("floor")) return cache.get("floor")!;

  const W = 1024,
    H = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(W, H);
  const px = img.data;

  const plankCount = 6;
  const pH = H / plankCount;
  const gapH = 2;

  for (let py = 0; py < H; py++) {
    const pIdx = Math.floor(py / pH);
    const inY = py - pIdx * pH;
    const isGap = inY < gapH;
    const seed = pIdx * 17.3;
    const shift = (hash(pIdx, 42) - 0.5) * 22;

    for (let ppx = 0; ppx < W; ppx++) {
      const i = (py * W + ppx) * 4;

      if (isGap) {
        px[i] = 100;
        px[i + 1] = 82;
        px[i + 2] = 64;
        px[i + 3] = 255;
        continue;
      }

      const u = ppx / W;
      const v = (inY - gapH) / (pH - gapH);
      const w = fbm(u * 3 + seed, v * 3 + seed, 3) * 0.12;
      const g = Math.sin((v + w) * 22 * Math.PI * 2) * 0.5 + 0.5;
      const n = (vnoise(ppx * 0.3 + seed, py * 0.3) - 0.5) * 8;

      px[i] = clamp(190 + shift + g * 18 - 9 + n);
      px[i + 1] = clamp(165 + shift + g * 16 - 8 + n);
      px[i + 2] = clamp(132 + shift * 0.8 + g * 12 - 6 + n);
      px[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set("floor", tex);
  return tex;
}
