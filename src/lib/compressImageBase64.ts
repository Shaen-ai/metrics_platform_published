/**
 * Resize oversized images and optionally re-encode as JPEG for smaller payloads (API / email).
 */
export async function compressImageBase64(
  base64: string,
  mimeType: string,
  options?: { maxDimension?: number; jpegQuality?: number },
): Promise<{ base64: string; mimeType: string }> {
  const maxDimension = options?.maxDimension ?? 2048;
  const jpegQuality = options?.jpegQuality ?? 0.85;

  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ base64, mimeType }), 15000);
    const img = new window.Image();
    img.onload = () => {
      clearTimeout(timeout);
      let { width, height } = img;
      if (width <= maxDimension && height <= maxDimension) {
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
      const dataUrl = canvas.toDataURL("image/jpeg", jpegQuality);
      resolve({ base64: dataUrl.split(",")[1]!, mimeType: "image/jpeg" });
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
