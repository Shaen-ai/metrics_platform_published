import "server-only";

import sharp from "sharp";
import { optimizeImageBufferForAi } from "@/lib/optimizeImageForAi";

export interface ProductCollageInput {
  id: string;
  name: string;
  category: string;
  imageUrls: string[];
}

export interface ProductCollageResult {
  productId: string;
  productName: string;
  base64: string;
  mimeType: string;
}

const CELL_SIZE = 320;
const SINGLE_MAX = 640;
const GUTTER = 6;
const BG: sharp.RGBA = { r: 255, g: 255, b: 255, alpha: 1 };
const FETCH_TIMEOUT_MS = 8_000;
const JPEG_QUALITY = 85;
const DEFAULT_MAX_PRODUCTS = 15;
const MAX_IMAGES_PER_PRODUCT = 4;

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(timer);
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    if (arr.byteLength > 5_000_000) return null;
    const raw = Buffer.from(arr);
    const optimized = await optimizeImageBufferForAi(raw, { maxEdge: 1024, quality: 82 });
    return Buffer.from(optimized.base64, "base64");
  } catch {
    return null;
  }
}

async function resizeCell(buf: Buffer, size: number): Promise<Buffer> {
  return sharp(buf, { failOn: "none" })
    .rotate()
    .resize(size, size, { fit: "contain", background: BG })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

async function buildSingleImageCollage(buf: Buffer): Promise<Buffer> {
  return sharp(buf, { failOn: "none" })
    .rotate()
    .resize(SINGLE_MAX, SINGLE_MAX, { fit: "inside" })
    .flatten({ background: BG })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

async function buildGridCollage(cells: Buffer[]): Promise<Buffer> {
  const count = cells.length;
  const cols = count <= 2 ? count : 2;
  const rows = Math.ceil(count / cols);

  const width = cols * CELL_SIZE + (cols + 1) * GUTTER;
  const height = rows * CELL_SIZE + (rows + 1) * GUTTER;

  const composites: sharp.OverlayOptions[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const left = GUTTER + col * (CELL_SIZE + GUTTER);
    const top = GUTTER + row * (CELL_SIZE + GUTTER);
    const resized = await resizeCell(cells[i]!, CELL_SIZE);
    composites.push({ input: resized, left, top });
  }

  return sharp({
    create: { width, height, channels: 3, background: BG },
  })
    .composite(composites)
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

async function buildCollageForProduct(
  product: ProductCollageInput,
): Promise<ProductCollageResult | null> {
  const urls = product.imageUrls.slice(0, MAX_IMAGES_PER_PRODUCT);
  if (!urls.length) return null;

  const buffers: Buffer[] = [];
  for (const url of urls) {
    const buf = await fetchImageBuffer(url);
    if (buf) buffers.push(buf);
  }
  if (!buffers.length) return null;

  const jpeg =
    buffers.length === 1
      ? await buildSingleImageCollage(buffers[0]!)
      : await buildGridCollage(buffers);

  return {
    productId: product.id,
    productName: product.name,
    base64: jpeg.toString("base64"),
    mimeType: "image/jpeg",
  };
}

export async function buildProductCollages(
  products: ProductCollageInput[],
  maxProducts: number = DEFAULT_MAX_PRODUCTS,
): Promise<ProductCollageResult[]> {
  const subset = products.slice(0, maxProducts);
  const results: ProductCollageResult[] = [];

  for (const product of subset) {
    const collage = await buildCollageForProduct(product);
    if (collage) results.push(collage);
  }

  return results;
}

export function buildCollageManifestText(
  collages: ProductCollageResult[],
): string {
  if (!collages.length) return "";

  const lines = collages.map((c, i) => {
    const buf = Buffer.from(c.base64, "base64");
    const kb = Math.round(buf.byteLength / 1024);
    const viewCount = kb > 100 ? 4 : kb > 50 ? 2 : 1;
    const views = viewCount === 1 ? "1 view" : `${viewCount} views`;
    return `Sheet ${i + 1}: "${c.productName}" [${c.productId}] — ${views} of this product`;
  });

  return `PRODUCT REFERENCE IMAGES:\n${lines.join("\n")}`;
}
