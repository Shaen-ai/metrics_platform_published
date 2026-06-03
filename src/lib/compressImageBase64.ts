/**
 * Resize oversized images and optionally re-encode as JPEG for smaller payloads (API / email).
 */

export function resolveImageMimeType(file: File): string | null {
  if (file.type.startsWith("image/avif")) return "image/avif";
  if (file.type.startsWith("image/")) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "avif") return "image/avif";
  return null;
}

function canvasToJpegBase64(canvas: HTMLCanvasElement, quality: number): string {
  return canvas.toDataURL("image/jpeg", quality).split(",")[1]!;
}

async function drawToCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

async function decodeFileToCanvas(file: File): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  if (typeof createImageBitmap !== "undefined") {
    try {
      const bitmap = await createImageBitmap(file);
      const width = bitmap.width;
      const height = bitmap.height;
      const canvas = await drawToCanvas(bitmap, width, height);
      bitmap.close();
      return { canvas, width, height };
    } catch {
      // Fall back to data-URL + Image (older browsers / odd encodings).
    }
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new window.Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Failed to decode image"));
    el.src = dataUrl;
  });

  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) throw new Error("Invalid image dimensions");
  const canvas = await drawToCanvas(img, width, height);
  return { canvas, width, height };
}

/** Decode any supported room photo (incl. AVIF) and compress for upload. */
export async function compressImageFile(
  file: File,
  options?: { maxDimension?: number; jpegQuality?: number },
): Promise<{ base64: string; mimeType: string } | null> {
  if (!resolveImageMimeType(file)) return null;

  const maxDimension = options?.maxDimension ?? 2048;
  const jpegQuality = options?.jpegQuality ?? 0.85;

  try {
    const { canvas, width, height } = await decodeFileToCanvas(file);
    const scale = Math.min(maxDimension / width, maxDimension / height, 1);
    if (scale < 1) {
      const tw = Math.max(1, Math.round(width * scale));
      const th = Math.max(1, Math.round(height * scale));
      const scaled = await drawToCanvas(canvas, tw, th);
      return { base64: canvasToJpegBase64(scaled, jpegQuality), mimeType: "image/jpeg" };
    }
    return { base64: canvasToJpegBase64(canvas, jpegQuality), mimeType: "image/jpeg" };
  } catch {
    return null;
  }
}

export async function compressImageBase64(
  base64: string,
  mimeType: string,
  options?: { maxDimension?: number; jpegQuality?: number },
): Promise<{ base64: string; mimeType: string }> {
  const maxDimension = options?.maxDimension ?? 2048;
  const jpegQuality = options?.jpegQuality ?? 0.85;

  const shouldReencodeAsJpeg =
    mimeType === "image/avif" || mimeType === "image/heic" || mimeType === "image/heif";

  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ base64, mimeType }), 15000);
    const img = new window.Image();
    img.onload = () => {
      clearTimeout(timeout);
      let { width, height } = img;
      if (width <= maxDimension && height <= maxDimension && !shouldReencodeAsJpeg) {
        resolve({ base64, mimeType });
        return;
      }
      const scale = Math.min(maxDimension / width, maxDimension / height, 1);
      width = Math.round(width * scale);
      height = Math.round(height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve({ base64: canvasToJpegBase64(canvas, jpegQuality), mimeType: "image/jpeg" });
    };
    img.onerror = () => {
      clearTimeout(timeout);
      resolve({ base64, mimeType });
    };
    img.src = `data:${mimeType};base64,${base64}`;
  });
}

/** Smaller file for planner inquiry emails (attachment size / JSON limits). */
export function compressForPlannerInquiryPreview(
  base64: string,
  mimeType: string,
): Promise<{ base64: string; mimeType: string }> {
  return compressImageBase64(base64, mimeType, { maxDimension: 1280, jpegQuality: 0.72 });
}
