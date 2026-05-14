import * as THREE from "three";
import { createPlannerFloorMaterial, type PlannerFloorMaterialOptions } from "./laminateFloor";
import type {
  FloorLayoutPattern,
  FloorMaterialMode,
  FloorTextureStartSide,
  PlannerCeilingSurfaceFields,
  PlannerFloorSurfaceFields,
  PlannerInteriorSurfaceMode,
  PlannerWallSurfaceFields,
} from "./types";
import { normalizeFloorStyle } from "./types";
import { proxyTextureUrl } from "./shared/buildPhysicalMaterialFromSwatch";

type TextureUpdateOptions = {
  onTextureUpdate?: () => void;
  roughness?: number;
  metalness?: number;
};

type RoomBBox = {
  widthM: number;
  depthM: number;
  heightM: number;
};

type PlannerSurfaceRoom = PlannerFloorSurfaceFields &
  PlannerWallSurfaceFields &
  PlannerCeilingSurfaceFields & {
    floorStyle?: string;
    wallColor?: string;
  };

const DEFAULT_FLOOR_REPEAT: [number, number] = [2.25, 2.25];
const CUSTOM_LAMINATE_IMAGE_BRIGHTNESS = 1.04;
const ROOM_SURFACE_TEXTURE_PX_PER_M = 640;
const ROOM_SURFACE_TEXTURE_MAX_SIDE = 4096;
const ROOM_SURFACE_TEXTURE_MIN_SIDE = 1024;
const DEFAULT_WALLPAPER_REPEAT_WIDTH_M = 0.53;
const DEFAULT_WALLPAPER_REPEAT_HEIGHT_M = 1;
const DEFAULT_CEILING_TEXTURE_REPEAT_M = 1;

function positiveNumber(value: unknown, fallback: number, min = 0.01, max = 100): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

function optionalPositiveNumber(value: unknown, min = 0.01, max = 10000): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, value));
}

function repeatFromPhysicalSize(
  spanXM: number | undefined,
  spanYM: number | undefined,
  textureWidthCm: number | undefined,
  textureHeightCm: number | undefined,
  rotationDeg: number | undefined,
  fallback: [number, number],
): [number, number] {
  const normalizedRotation = (((rotationDeg ?? 0) % 180) + 180) % 180;
  const swapTextureAxes = Math.abs(normalizedRotation - 90) < 0.001;
  const textureWidthM = (swapTextureAxes ? textureHeightCm : textureWidthCm)
    ? (swapTextureAxes ? textureHeightCm! : textureWidthCm!) / 100
    : undefined;
  const textureHeightM = (swapTextureAxes ? textureWidthCm : textureHeightCm)
    ? (swapTextureAxes ? textureWidthCm! : textureHeightCm!) / 100
    : undefined;
  if (!spanXM || !spanYM || !textureWidthM || !textureHeightM) return fallback;

  return [
    positiveNumber(spanXM / textureWidthM, fallback[0], 0.01, 1000),
    positiveNumber(spanYM / textureHeightM, fallback[1], 0.01, 1000),
  ];
}

function degreesToRadians(deg: number | undefined): number {
  return ((deg ?? 0) * Math.PI) / 180;
}

function normalizeMode<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function normalizeFloorStartSide(value: unknown): FloorTextureStartSide {
  return normalizeMode<FloorTextureStartSide>(value, ["left", "right", "back", "front"], "left");
}

function normalizeFloorLayoutPattern(value: unknown, mode: FloorMaterialMode): FloorLayoutPattern {
  return normalizeMode<FloorLayoutPattern>(
    value,
    ["aligned", "staggered"],
    mode === "tile" ? "aligned" : "staggered",
  );
}

export function normalizePlannerFloorSurfaceFields(
  fields: PlannerFloorSurfaceFields,
): Required<Pick<PlannerFloorSurfaceFields, "floorMaterialMode">> & PlannerFloorSurfaceFields {
  const mode = normalizeMode<FloorMaterialMode>(fields.floorMaterialMode, ["preset", "customImage", "tile"], "preset");
  return {
    floorMaterialMode: mode,
    floorCustomTextureUrl: typeof fields.floorCustomTextureUrl === "string" ? fields.floorCustomTextureUrl : undefined,
    floorUvRepeatX: positiveNumber(fields.floorUvRepeatX, mode === "tile" ? 6 : 2.25),
    floorUvRepeatY: positiveNumber(fields.floorUvRepeatY, mode === "tile" ? 6 : 2.25),
    floorTextureWidthCm: optionalPositiveNumber(fields.floorTextureWidthCm),
    floorTextureHeightCm: optionalPositiveNumber(fields.floorTextureHeightCm),
    floorMaterialProductWidthCm: optionalPositiveNumber(fields.floorMaterialProductWidthCm),
    floorMaterialProductHeightCm: optionalPositiveNumber(fields.floorMaterialProductHeightCm),
    floorTextureStartSide: normalizeFloorStartSide(fields.floorTextureStartSide),
    floorLayoutPattern: normalizeFloorLayoutPattern(fields.floorLayoutPattern, mode),
    floorUvRotationDeg: typeof fields.floorUvRotationDeg === "number" ? fields.floorUvRotationDeg : 0,
    floorTileWidthCm: positiveNumber(fields.floorTileWidthCm, 60, 1, 500),
    floorTileHeightCm: positiveNumber(fields.floorTileHeightCm, 60, 1, 500),
    floorTileGroutCm: Math.max(0, Math.min(10, fields.floorTileGroutCm ?? 0.3)),
    floorTileGroutColor: fields.floorTileGroutColor || "#d8d2c8",
  };
}

export function normalizePlannerWallCeilingSurfaceFields(
  fields: PlannerWallSurfaceFields & PlannerCeilingSurfaceFields,
): PlannerWallSurfaceFields & PlannerCeilingSurfaceFields {
  const wallMode = normalizeMode<PlannerInteriorSurfaceMode>(
    fields.wallMaterialMode,
    ["color", "customImage", "tile"],
    "color",
  );
  const ceilingMode = normalizeMode<PlannerInteriorSurfaceMode>(
    fields.ceilingMaterialMode,
    ["color", "customImage", "tile"],
    "color",
  );
  return {
    wallMaterialMode: wallMode,
    wallCustomTextureUrl: typeof fields.wallCustomTextureUrl === "string" ? fields.wallCustomTextureUrl : undefined,
    wallUvRepeatX: positiveNumber(fields.wallUvRepeatX, wallMode === "tile" ? 6 : 2),
    wallUvRepeatY: positiveNumber(fields.wallUvRepeatY, wallMode === "tile" ? 3 : 1.5),
    wallTextureWidthCm: optionalPositiveNumber(fields.wallTextureWidthCm),
    wallTextureHeightCm: optionalPositiveNumber(fields.wallTextureHeightCm),
    wallMaterialProductWidthCm: optionalPositiveNumber(fields.wallMaterialProductWidthCm),
    wallMaterialProductHeightCm: optionalPositiveNumber(fields.wallMaterialProductHeightCm),
    wallUvRotationDeg: typeof fields.wallUvRotationDeg === "number" ? fields.wallUvRotationDeg : 0,
    wallTileWidthCm: positiveNumber(fields.wallTileWidthCm, 30, 1, 500),
    wallTileHeightCm: positiveNumber(fields.wallTileHeightCm, 60, 1, 500),
    wallTileGroutCm: Math.max(0, Math.min(10, fields.wallTileGroutCm ?? 0.25)),
    wallTileGroutColor: fields.wallTileGroutColor || "#d8d2c8",
    ceilingMaterialMode: ceilingMode,
    ceilingCustomTextureUrl: typeof fields.ceilingCustomTextureUrl === "string" ? fields.ceilingCustomTextureUrl : undefined,
    ceilingUvRepeatX: positiveNumber(fields.ceilingUvRepeatX, ceilingMode === "tile" ? 6 : 2),
    ceilingUvRepeatY: positiveNumber(fields.ceilingUvRepeatY, ceilingMode === "tile" ? 4 : 2),
    ceilingTextureWidthCm: optionalPositiveNumber(fields.ceilingTextureWidthCm),
    ceilingTextureHeightCm: optionalPositiveNumber(fields.ceilingTextureHeightCm),
    ceilingMaterialProductWidthCm: optionalPositiveNumber(fields.ceilingMaterialProductWidthCm),
    ceilingMaterialProductHeightCm: optionalPositiveNumber(fields.ceilingMaterialProductHeightCm),
    ceilingUvRotationDeg: typeof fields.ceilingUvRotationDeg === "number" ? fields.ceilingUvRotationDeg : 0,
    ceilingTileWidthCm: positiveNumber(fields.ceilingTileWidthCm, 60, 1, 500),
    ceilingTileHeightCm: positiveNumber(fields.ceilingTileHeightCm, 60, 1, 500),
    ceilingTileGroutCm: Math.max(0, Math.min(10, fields.ceilingTileGroutCm ?? 0.25)),
    ceilingTileGroutColor: fields.ceilingTileGroutColor || "#d8d2c8",
  };
}

function textureOffsetForStartSide(repeat: [number, number], side?: FloorTextureStartSide): [number, number] {
  // alignEnd: shift so the tile boundary lands exactly on the far UV edge (U=1 or V=1).
  // center:   shift so equal-sized cut tiles appear on both sides of the axis.
  const alignEnd = (value: number) => Math.ceil(value) - value;
  const center = (value: number) => alignEnd(value) / 2;
  // UV axes for BoxGeometry top face: U=0→left wall, U=1→right wall, V=0→front wall, V=1→back wall.
  // "start side" = which wall has uncut tiles; the perpendicular axis is centred for symmetry.
  if (side === "left")  return [0,              center(repeat[1])];
  if (side === "right") return [alignEnd(repeat[0]), center(repeat[1])];
  if (side === "back")  return [center(repeat[0]), alignEnd(repeat[1])];
  if (side === "front") return [center(repeat[0]), 0];
  return [0, 0];
}

function applyTextureSettings(
  texture: THREE.Texture,
  repeat: [number, number],
  rotationDeg?: number,
  startSide?: FloorTextureStartSide,
) {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  const [offsetX, offsetY] = textureOffsetForStartSide(repeat, startSide);
  texture.offset.set(offsetX, offsetY);
  texture.center.set(0.5, 0.5);
  texture.rotation = degreesToRadians(rotationDeg);
  texture.anisotropy = 16;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
}

function configureCanvasImageQuality(ctx: CanvasRenderingContext2D) {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
}

function makeRoomSurfaceCanvas(roomWidthM: number, roomDepthM: number) {
  const canvas = document.createElement("canvas");
  const roomW = Math.max(roomWidthM, 0.01);
  const roomD = Math.max(roomDepthM, 0.01);
  const scale = Math.min(
    ROOM_SURFACE_TEXTURE_PX_PER_M,
    ROOM_SURFACE_TEXTURE_MAX_SIDE / Math.max(roomW, roomD),
  );

  canvas.width = Math.max(ROOM_SURFACE_TEXTURE_MIN_SIDE, Math.round(roomW * scale));
  canvas.height = Math.max(ROOM_SURFACE_TEXTURE_MIN_SIDE, Math.round(roomD * scale));

  const maxCanvasSide = Math.max(canvas.width, canvas.height);
  if (maxCanvasSide > ROOM_SURFACE_TEXTURE_MAX_SIDE) {
    const clampScale = ROOM_SURFACE_TEXTURE_MAX_SIDE / maxCanvasSide;
    canvas.width = Math.max(1, Math.round(canvas.width * clampScale));
    canvas.height = Math.max(1, Math.round(canvas.height * clampScale));
  }

  return canvas;
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih || w <= 0 || h <= 0) return;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function drawImageCoverOriented(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih || w <= 0 || h <= 0) return;

  const sourceLandscape = iw >= ih;
  const targetLandscape = w >= h;
  const shouldRotate = sourceLandscape !== targetLandscape;
  ctx.save();
  if (shouldRotate) {
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(Math.PI / 2);
    drawImageCover(ctx, img, -h / 2, -w / 2, h, w);
  } else {
    drawImageCover(ctx, img, x, y, w, h);
  }
  ctx.restore();
}

function brightenCanvasImage(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, amount: number) {
  if (w <= 0 || h <= 0) return;
  ctx.save();
  if (amount > 1) {
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = Math.min(0.35, amount - 1);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, w, h);
  } else if (amount < 1) {
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = Math.min(0.35, 1 - amount);
    ctx.fillStyle = "#000000";
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

function alignedDrawRange(
  min: number,
  max: number,
  piecePx: number,
  alignment: "start" | "end" | "center",
  paddingPx: number,
) {
  const span = Math.max(0, max - min);
  const safePiece = Math.max(1, piecePx);
  const totalGrid = Math.ceil(span / safePiece) * safePiece;
  let edgeAlignedStart: number;
  if (alignment === "end") {
    edgeAlignedStart = max - totalGrid;
  } else if (alignment === "center") {
    edgeAlignedStart = min - (totalGrid - span) / 2;
  } else {
    edgeAlignedStart = min;
  }
  const extraPieces = Math.ceil(Math.max(0, paddingPx) / safePiece) + 1;
  return {
    start: edgeAlignedStart - extraPieces * safePiece,
    end: max + extraPieces * safePiece,
  };
}

function drawFloorBoardCell(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  _texWPx?: number,
  _texHPx?: number,
  brightnessBias?: number,
) {
  if (img) {
    // Always scale the texture to cover the full board cell — no tiling within a plank.
    // This produces a continuous, realistic wood-grain look across the full plank length.
    drawImageCoverOriented(ctx, img, x, y, w, h);
    const brightness = CUSTOM_LAMINATE_IMAGE_BRIGHTNESS + (brightnessBias ?? 0);
    brightenCanvasImage(ctx, x, y, w, h, brightness);
  } else {
    ctx.fillStyle = "#c8a87a";
    ctx.fillRect(x, y, w, h);
  }

  // Very thin, low-opacity shadow on all 4 edges to suggest natural plank joints
  // without creating a cartoon-like grid outline.
  const jt = 1; // joint thickness in px
  ctx.save();
  ctx.fillStyle = "#2a1a08";
  ctx.globalAlpha = 0.18;
  ctx.fillRect(x, y, w, jt);           // top
  ctx.fillRect(x, y + h - jt, w, jt); // bottom
  ctx.fillRect(x, y, jt, h);           // left
  ctx.fillRect(x + w - jt, y, jt, h); // right
  ctx.restore();
}

function drawFloorBoardLayout(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | undefined,
  canvasW: number,
  canvasH: number,
  roomWidthM: number,
  roomDepthM: number,
  boardWidthCm: number,
  boardHeightCm: number,
  rotationDeg: number | undefined,
  startSide: FloorTextureStartSide | undefined,
  layoutPattern: FloorLayoutPattern,
  texWidthCm?: number,
  texHeightCm?: number,
) {
  const boardWM = Math.max(0.01, boardWidthCm / 100);
  const boardDM = Math.max(0.01, boardHeightCm / 100);
  const pxPerM = Math.min(canvasW / Math.max(roomWidthM, 0.01), canvasH / Math.max(roomDepthM, 0.01));
  const boardWPx = Math.max(1, boardWM * pxPerM);
  const boardDPx = Math.max(1, boardDM * pxPerM);
  const texWPx = texWidthCm ? Math.max(1, (texWidthCm / 100) * pxPerM) : undefined;
  const texHPx = texHeightCm ? Math.max(1, (texHeightCm / 100) * pxPerM) : undefined;

  const usedW = roomWidthM * pxPerM;
  const usedH = roomDepthM * pxPerM;
  const originX = (canvasW - usedW) / 2;
  const originY = (canvasH - usedH) / 2;
  const centerX = originX + usedW / 2;
  const centerY = originY + usedH / 2;
  const rotationRad = degreesToRadians(rotationDeg);
  const diagonal = Math.hypot(usedW, usedH);

  ctx.clearRect(0, 0, canvasW, canvasH);
  // Background color matches the laminate joint/gap tone
  ctx.fillStyle = "#2a1a08";
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.save();
  ctx.beginPath();
  ctx.rect(originX, originY, usedW, usedH);
  ctx.clip();
  ctx.translate(centerX, centerY);
  ctx.rotate(rotationRad);

  const xMin = -usedW / 2;
  const xMax = usedW / 2;
  const yMin = -usedH / 2;
  const yMax = usedH / 2;
  const padding = diagonal / 2;
  // "start side" = which wall has full (uncut) boards; the perpendicular axis is centred.
  const xAlign = startSide === "right" ? "end" : startSide === "left" ? "start" : "center";
  const yAlign = startSide === "front" ? "end" : startSide === "back" ? "start" : "center";
  const xRange = alignedDrawRange(xMin, xMax, boardWPx, xAlign, padding);
  // Local Y=min is the visual back edge; Y=max is the visual front edge of the floor texture.
  const yRange = alignedDrawRange(yMin, yMax, boardDPx, yAlign, padding);
  const startX = xRange.start;
  const startY = yRange.start;
  const endX = xRange.end;
  const endY = yRange.end;

  // Deterministic per-plank brightness variation so adjacent planks look distinct.
  const plankBias = (col: number, row: number): number => {
    const h = Math.sin(col * 127.1 + row * 311.7) * 43758.5453;
    return (h - Math.floor(h) - 0.5) * 0.08;
  };

  if (boardDPx >= boardWPx) {
    let col = 0;
    for (let x = startX; x < endX; x += boardWPx) {
      const drawW = Math.min(boardWPx, endX - x);
      if (drawW <= 0) continue;
      const stagger = layoutPattern === "staggered" ? ([0, boardDPx * (2 / 3), boardDPx * (1 / 3)][col % 3] ?? 0) : 0;
      let row = 0;
      for (let y = startY - stagger; y < endY; y += boardDPx) {
        const drawY = Math.max(y, startY);
        const drawH = Math.min(y + boardDPx, endY) - drawY;
        if (drawH <= 0) { row += 1; continue; }
        drawFloorBoardCell(ctx, img, x, drawY, drawW, drawH, texWPx, texHPx, plankBias(col, row));
        row += 1;
      }
      col += 1;
    }
  } else {
    let row = 0;
    for (let y = startY; y < endY; y += boardDPx) {
      const drawH = Math.min(boardDPx, endY - y);
      if (drawH <= 0) continue;
      const stagger = layoutPattern === "staggered" ? ([0, boardWPx * (2 / 3), boardWPx * (1 / 3)][row % 3] ?? 0) : 0;
      let col = 0;
      for (let x = startX - stagger; x < endX; x += boardWPx) {
        const drawX = Math.max(x, startX);
        const drawW = Math.min(x + boardWPx, endX) - drawX;
        if (drawW <= 0) { col += 1; continue; }
        drawFloorBoardCell(ctx, img, drawX, y, drawW, drawH, texWPx, texHPx, plankBias(col, row));
        col += 1;
      }
      row += 1;
    }
  }
  ctx.restore();
}

function makeFloorBoardLayoutTexture(
  colorUrl: string,
  roomWidthM: number | undefined,
  roomDepthM: number | undefined,
  boardWidthCm: number | undefined,
  boardHeightCm: number | undefined,
  rotationDeg: number | undefined,
  startSide: FloorTextureStartSide | undefined,
  layoutPattern: FloorLayoutPattern,
  onUpdate?: () => void,
  texWidthCm?: number,
  texHeightCm?: number,
) {
  if (!roomWidthM || !roomDepthM || !boardWidthCm || !boardHeightCm || typeof document === "undefined") {
    return undefined;
  }

  const canvas = makeRoomSurfaceCanvas(roomWidthM, roomDepthM);
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  configureCanvasImageQuality(ctx);

  drawFloorBoardLayout(
    ctx,
    undefined,
    canvas.width,
    canvas.height,
    roomWidthM,
    roomDepthM,
    boardWidthCm,
    boardHeightCm,
    rotationDeg,
    startSide,
    layoutPattern,
    texWidthCm,
    texHeightCm,
  );

  const texture = new THREE.CanvasTexture(canvas);
  applyTextureSettings(texture, [1, 1], 0);
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    drawFloorBoardLayout(
      ctx,
      img,
      canvas.width,
      canvas.height,
      roomWidthM,
      roomDepthM,
      boardWidthCm,
      boardHeightCm,
      rotationDeg,
      startSide,
      layoutPattern,
      texWidthCm,
      texHeightCm,
    );
    texture.needsUpdate = true;
    onUpdate?.();
  };
  img.src = proxyTextureUrl(colorUrl);

  return texture;
}

function loadTexture(
  url: string,
  repeat: [number, number],
  rotationDeg: number | undefined,
  onUpdate?: () => void,
  startSide?: FloorTextureStartSide,
) {
  const texture = new THREE.TextureLoader().load(proxyTextureUrl(url), onUpdate, undefined, onUpdate);
  applyTextureSettings(texture, repeat, rotationDeg, startSide);
  return texture;
}

function drawFloorTileLayout(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | undefined,
  canvasW: number,
  canvasH: number,
  roomWidthM: number,
  roomDepthM: number,
  tileWidthCm: number,
  tileHeightCm: number,
  groutCm: number,
  tileColor: string,
  groutColor: string,
  rotationDeg: number | undefined,
  startSide: FloorTextureStartSide | undefined,
  layoutPattern: FloorLayoutPattern,
) {
  const tileWM = Math.max(0.01, tileWidthCm / 100);
  const tileDM = Math.max(0.01, tileHeightCm / 100);
  const pxPerM = Math.min(canvasW / Math.max(roomWidthM, 0.01), canvasH / Math.max(roomDepthM, 0.01));
  const tileWPx = Math.max(1, tileWM * pxPerM);
  const tileDPx = Math.max(1, tileDM * pxPerM);
  const groutPx = Math.max(0, (groutCm / 100) * pxPerM);

  const usedW = roomWidthM * pxPerM;
  const usedH = roomDepthM * pxPerM;
  const originX = (canvasW - usedW) / 2;
  const originY = (canvasH - usedH) / 2;
  const centerX = originX + usedW / 2;
  const centerY = originY + usedH / 2;
  const rotationRad = degreesToRadians(rotationDeg);
  const diagonal = Math.hypot(usedW, usedH);

  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = groutColor;
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.save();
  ctx.beginPath();
  ctx.rect(originX, originY, usedW, usedH);
  ctx.clip();
  ctx.translate(centerX, centerY);
  ctx.rotate(rotationRad);

  const xMin = -usedW / 2;
  const xMax = usedW / 2;
  const yMin = -usedH / 2;
  const yMax = usedH / 2;
  const padding = diagonal / 2;
  const xAlign = startSide === "right" ? "end" : startSide === "left" ? "start" : "center";
  const yAlign = startSide === "front" ? "end" : startSide === "back" ? "start" : "center";
  const xRange = alignedDrawRange(xMin, xMax, tileWPx, xAlign, padding);
  const yRange = alignedDrawRange(yMin, yMax, tileDPx, yAlign, padding);
  const startX = xRange.start;
  const startY = yRange.start;
  const endX = xRange.end;
  const endY = yRange.end;
  const drawTile = (x: number, y: number, w: number, h: number) => {
    const inset = Math.min(groutPx / 2, w / 3, h / 3);
    const innerX = x + inset;
    const innerY = y + inset;
    const innerW = Math.max(0, w - inset * 2);
    const innerH = Math.max(0, h - inset * 2);
    if (innerW <= 0 || innerH <= 0) return;
    if (img) {
      drawImageCover(ctx, img, innerX, innerY, innerW, innerH);
    } else {
      ctx.fillStyle = tileColor;
      ctx.fillRect(innerX, innerY, innerW, innerH);
    }
  };

  if (tileDPx >= tileWPx) {
    let col = 0;
    for (let x = startX; x < endX; x += tileWPx) {
      const drawW = Math.min(tileWPx, endX - x);
      if (drawW <= 0) continue;
      const stagger = layoutPattern === "staggered" ? ([0, tileDPx / 2][col % 2] ?? 0) : 0;
      for (let y = startY - stagger; y < endY; y += tileDPx) {
        const drawY = Math.max(y, startY);
        const drawH = Math.min(y + tileDPx, endY) - drawY;
        if (drawH <= 0) continue;
        drawTile(x, drawY, drawW, drawH);
      }
      col += 1;
    }
  } else {
    let row = 0;
    for (let y = startY; y < endY; y += tileDPx) {
      const drawH = Math.min(tileDPx, endY - y);
      if (drawH <= 0) continue;
      const stagger = layoutPattern === "staggered" ? ([0, tileWPx / 2][row % 2] ?? 0) : 0;
      for (let x = startX - stagger; x < endX; x += tileWPx) {
        const drawX = Math.max(x, startX);
        const drawW = Math.min(x + tileWPx, endX) - drawX;
        if (drawW <= 0) continue;
        drawTile(drawX, y, drawW, drawH);
      }
      row += 1;
    }
  }
  ctx.restore();
}

function makeFloorTileLayoutTexture(
  colorUrl: string | undefined,
  roomWidthM: number | undefined,
  roomDepthM: number | undefined,
  tileColor: string,
  groutColor: string,
  groutCm: number,
  tileWidthCm: number,
  tileHeightCm: number,
  rotationDeg: number | undefined,
  startSide: FloorTextureStartSide | undefined,
  layoutPattern: FloorLayoutPattern,
  onUpdate?: () => void,
) {
  if (!roomWidthM || !roomDepthM || typeof document === "undefined") return undefined;

  const canvas = makeRoomSurfaceCanvas(roomWidthM, roomDepthM);
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  configureCanvasImageQuality(ctx);

  drawFloorTileLayout(
    ctx,
    undefined,
    canvas.width,
    canvas.height,
    roomWidthM,
    roomDepthM,
    tileWidthCm,
    tileHeightCm,
    groutCm,
    tileColor,
    groutColor,
    rotationDeg,
    startSide,
    layoutPattern,
  );

  const texture = new THREE.CanvasTexture(canvas);
  applyTextureSettings(texture, [1, 1], 0);
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;

  if (colorUrl) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      drawFloorTileLayout(
        ctx,
        img,
        canvas.width,
        canvas.height,
        roomWidthM,
        roomDepthM,
        tileWidthCm,
        tileHeightCm,
        groutCm,
        tileColor,
        groutColor,
        rotationDeg,
        startSide,
        layoutPattern,
      );
      texture.needsUpdate = true;
      onUpdate?.();
    };
    img.src = proxyTextureUrl(colorUrl);
  }

  return texture;
}

function makeTileTexture(
  colorUrl: string | undefined,
  tileColor: string,
  groutColor: string,
  groutCm: number,
  tileWidthCm: number,
  tileHeightCm: number,
  repeat: [number, number],
  rotationDeg: number | undefined,
  onUpdate?: () => void,
  startSide?: FloorTextureStartSide,
) {
  const size = 512;
  const canvas = typeof document !== "undefined" ? document.createElement("canvas") : undefined;
  if (!canvas) return undefined;

  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;

  const groutX = Math.max(1, Math.round((groutCm / Math.max(1, tileWidthCm)) * size));
  const groutY = Math.max(1, Math.round((groutCm / Math.max(1, tileHeightCm)) * size));
  ctx.fillStyle = groutColor;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = tileColor;
  ctx.fillRect(groutX, groutY, size - groutX * 2, size - groutY * 2);

  const texture = new THREE.CanvasTexture(canvas);
  applyTextureSettings(texture, repeat, rotationDeg, startSide);

  if (colorUrl) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.drawImage(img, groutX, groutY, size - groutX * 2, size - groutY * 2);
      texture.needsUpdate = true;
      onUpdate?.();
    };
    img.src = proxyTextureUrl(colorUrl);
  }

  return texture;
}

function materialFromTexture(map: THREE.Texture | undefined, color: string, options?: TextureUpdateOptions) {
  return new THREE.MeshStandardMaterial({
    color,
    map,
    side: THREE.DoubleSide,
    roughness: options?.roughness ?? 0.82,
    metalness: options?.metalness ?? 0,
  });
}

export function buildPlannerFloorMaterialFromRoom(
  room: PlannerSurfaceRoom,
  fallbackRepeat: [number, number] = DEFAULT_FLOOR_REPEAT,
  options?: Partial<Omit<PlannerFloorMaterialOptions, "floorStyle" | "repeat">> & {
    floorWidthM?: number;
    floorDepthM?: number;
  },
): THREE.MeshStandardMaterial {
  const surface = normalizePlannerFloorSurfaceFields(room);
  const manualRepeat: [number, number] = [
    positiveNumber(surface.floorUvRepeatX, fallbackRepeat[0]),
    positiveNumber(surface.floorUvRepeatY, fallbackRepeat[1]),
  ];

  // Use item/product dimensions as the physical board size when available.
  // The texture/photo dimensions describe the repeat pattern within each board.
  const boardWidthCm = surface.floorMaterialProductWidthCm ?? surface.floorTextureWidthCm;
  const boardHeightCm = surface.floorMaterialProductHeightCm ?? surface.floorTextureHeightCm;
  // Only pass texture dims separately when they differ from the board dims (to enable tiling within the board)
  const hasProductDims = surface.floorMaterialProductWidthCm != null || surface.floorMaterialProductHeightCm != null;
  const texWidthCm = hasProductDims ? surface.floorTextureWidthCm : undefined;
  const texHeightCm = hasProductDims ? surface.floorTextureHeightCm : undefined;

  const repeat =
    surface.floorMaterialMode === "customImage"
      ? repeatFromPhysicalSize(
          options?.floorWidthM,
          options?.floorDepthM,
          boardWidthCm,
          boardHeightCm,
          surface.floorUvRotationDeg,
          manualRepeat,
        )
      : manualRepeat;

  if (surface.floorMaterialMode === "customImage" && surface.floorCustomTextureUrl) {
    const boardLayoutTexture = makeFloorBoardLayoutTexture(
      surface.floorCustomTextureUrl,
      options?.floorWidthM,
      options?.floorDepthM,
      boardWidthCm,
      boardHeightCm,
      surface.floorUvRotationDeg,
      surface.floorTextureStartSide,
      surface.floorLayoutPattern ?? "staggered",
      options?.onTextureUpdate,
      texWidthCm,
      texHeightCm,
    );

    return materialFromTexture(
      boardLayoutTexture ??
        loadTexture(
          surface.floorCustomTextureUrl,
          repeat,
          surface.floorUvRotationDeg,
          options?.onTextureUpdate,
          surface.floorTextureStartSide,
        ),
      "#ffffff",
      options,
    );
  }

  if (surface.floorMaterialMode === "tile") {
    return materialFromTexture(
      makeFloorTileLayoutTexture(
        surface.floorCustomTextureUrl,
        options?.floorWidthM,
        options?.floorDepthM,
        "#e9e5dc",
        surface.floorTileGroutColor ?? "#d8d2c8",
        surface.floorTileGroutCm ?? 0.3,
        surface.floorTileWidthCm ?? 60,
        surface.floorTileHeightCm ?? 60,
        surface.floorUvRotationDeg,
        surface.floorTextureStartSide,
        surface.floorLayoutPattern ?? "aligned",
        options?.onTextureUpdate,
      ) ??
        makeTileTexture(
          surface.floorCustomTextureUrl,
          "#e9e5dc",
          surface.floorTileGroutColor ?? "#d8d2c8",
          surface.floorTileGroutCm ?? 0.3,
          surface.floorTileWidthCm ?? 60,
          surface.floorTileHeightCm ?? 60,
          repeat,
          surface.floorUvRotationDeg,
          options?.onTextureUpdate,
          surface.floorTextureStartSide,
        ),
      "#ffffff",
      options,
    );
  }

  return createPlannerFloorMaterial({
    floorStyle: normalizeFloorStyle(room.floorStyle),
    repeat: fallbackRepeat,
    onTextureUpdate: options?.onTextureUpdate,
    toneMode: options?.toneMode,
    tintLerp: options?.tintLerp,
    roughness: options?.roughness,
    metalness: options?.metalness,
    envMapIntensity: options?.envMapIntensity,
    side: options?.side,
  });
}

export function buildPlannerWallSurfaceMaterial(
  room: PlannerSurfaceRoom,
  _bbox: RoomBBox,
  wallWidthM: number,
  wallHeightM: number,
  options?: TextureUpdateOptions,
): THREE.MeshStandardMaterial {
  const surface = normalizePlannerWallCeilingSurfaceFields(room);

  if (surface.wallMaterialMode === "customImage" && surface.wallCustomTextureUrl) {
    const fallbackRepeat: [number, number] = [
      positiveNumber(wallWidthM / DEFAULT_WALLPAPER_REPEAT_WIDTH_M, 1, 1, 1000),
      positiveNumber(wallHeightM / DEFAULT_WALLPAPER_REPEAT_HEIGHT_M, 1, 1, 1000),
    ];
    const repeat = repeatFromPhysicalSize(
      wallWidthM,
      wallHeightM,
      surface.wallTextureWidthCm,
      surface.wallTextureHeightCm,
      0,
      fallbackRepeat,
    );
    return materialFromTexture(
      loadTexture(surface.wallCustomTextureUrl, repeat, 0, options?.onTextureUpdate),
      "#ffffff",
      options,
    );
  }

  if (surface.wallMaterialMode === "tile") {
    const repeat = repeatFromPhysicalSize(
      wallWidthM,
      wallHeightM,
      surface.wallTileWidthCm,
      surface.wallTileHeightCm,
      0,
      [1, 1],
    );
    return materialFromTexture(
      makeTileTexture(
        surface.wallCustomTextureUrl,
        "#ece8df",
        surface.wallTileGroutColor ?? "#d8d2c8",
        surface.wallTileGroutCm ?? 0.25,
        surface.wallTileWidthCm ?? 30,
        surface.wallTileHeightCm ?? 60,
        repeat,
        0,
        options?.onTextureUpdate,
      ),
      "#ffffff",
      options,
    );
  }

  return materialFromTexture(undefined, room.wallColor ?? "#fafafa", options);
}

export function buildPlannerCeilingSurfaceMaterial(
  room: PlannerSurfaceRoom,
  bbox: RoomBBox,
  options?: TextureUpdateOptions,
): THREE.MeshStandardMaterial {
  const surface = normalizePlannerWallCeilingSurfaceFields(room);

  if (surface.ceilingMaterialMode === "customImage" && surface.ceilingCustomTextureUrl) {
    const fallbackRepeat: [number, number] = [
      positiveNumber(bbox.widthM / DEFAULT_CEILING_TEXTURE_REPEAT_M, 1, 1, 1000),
      positiveNumber(bbox.depthM / DEFAULT_CEILING_TEXTURE_REPEAT_M, 1, 1, 1000),
    ];
    const repeat = repeatFromPhysicalSize(
      bbox.widthM,
      bbox.depthM,
      surface.ceilingTextureWidthCm,
      surface.ceilingTextureHeightCm,
      0,
      fallbackRepeat,
    );
    return materialFromTexture(
      loadTexture(surface.ceilingCustomTextureUrl, repeat, 0, options?.onTextureUpdate),
      "#ffffff",
      options,
    );
  }

  if (surface.ceilingMaterialMode === "tile") {
    const repeat = repeatFromPhysicalSize(
      bbox.widthM,
      bbox.depthM,
      surface.ceilingTileWidthCm,
      surface.ceilingTileHeightCm,
      0,
      [1, 1],
    );
    return materialFromTexture(
      makeTileTexture(
        surface.ceilingCustomTextureUrl,
        "#f1efe8",
        surface.ceilingTileGroutColor ?? "#d8d2c8",
        surface.ceilingTileGroutCm ?? 0.25,
        surface.ceilingTileWidthCm ?? 60,
        surface.ceilingTileHeightCm ?? 60,
        repeat,
        0,
        options?.onTextureUpdate,
      ),
      "#ffffff",
      options,
    );
  }

  return materialFromTexture(undefined, room.wallColor ?? "#fafafa", options);
}
