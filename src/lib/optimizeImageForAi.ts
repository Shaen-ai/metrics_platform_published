import sharp from "sharp";

export interface OptimizeImageOptions {
  maxEdge?: number;
  quality?: number;
}

export interface OptimizedImageResult {
  base64: string;
  mimeType: string;
  byteLength: number;
  width: number;
  height: number;
}

const DEFAULT_MAX_EDGE = 1200;
const DEFAULT_QUALITY = 75;

export async function optimizeImageBufferForAi(
  input: Buffer,
  options?: OptimizeImageOptions,
): Promise<OptimizedImageResult> {
  const maxEdge = options?.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = options?.quality ?? DEFAULT_QUALITY;

  const run = async (q: number) => {
    const pipeline = sharp(input, { failOn: "none" })
      .rotate()
      .resize(maxEdge, maxEdge, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: q, mozjpeg: true });

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    return {
      base64: data.toString("base64"),
      mimeType: "image/jpeg" as const,
      byteLength: data.byteLength,
      width: info.width,
      height: info.height,
    };
  };

  try {
    let result = await run(quality);
    if (result.byteLength > 250_000 && quality > 60) {
      result = await run(60);
    }
    return result;
  } catch (err) {
    console.warn("optimizeImageBufferForAi: sharp failed, using raw bytes", err);
    return {
      base64: input.toString("base64"),
      mimeType: "image/jpeg",
      byteLength: input.byteLength,
      width: maxEdge,
      height: maxEdge,
    };
  }
}
