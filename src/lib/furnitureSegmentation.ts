import { GoogleGenerativeAI } from "@google/generative-ai";
import sharp from "sharp";

interface SegmentationMask {
  label: string;
  box_2d: [number, number, number, number]; // [y1, x1, y2, x2] in 0-1000 coords
  mask: string; // base64 PNG prefixed with data:image/png;base64, or raw base64
}

export interface FurnitureMaskResult {
  maskBase64: string;
  labels: string[];
}

const FURNITURE_SEGMENTATION_PROMPT = `Identify ALL freestanding furniture items in this room photo and return segmentation masks for each one.

Furniture includes: sofas, armchairs, chairs, tables (coffee, dining, side, desk, console), beds, nightstands, dressers, wardrobes, bookshelves, cabinets, TV stands, benches, stools, ottomans, plant stands, coat racks, and any other freestanding movable furniture.

Do NOT include: walls, floors, ceilings, curtains, doors, windows, built-in cabinetry, built-in shelving, ceiling lights, wall sconces, baseboards, molding, or any architectural element.

Output a JSON list of segmentation masks where each entry contains:
- "label": furniture item name (e.g. "sofa", "coffee table")
- "box_2d": bounding box as [y1, x1, y2, x2] in 0-1000 normalized coordinates
- "mask": segmentation mask as a base64 PNG`;

function extractBase64(raw: string): string {
  const prefix = "data:image/png;base64,";
  return raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
}

async function compositeMasks(
  masks: SegmentationMask[],
  imageWidth: number,
  imageHeight: number,
): Promise<Buffer> {
  let canvas = sharp({
    create: {
      width: imageWidth,
      height: imageHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 255 },
    },
  }).png();

  const overlays: sharp.OverlayOptions[] = [];

  for (const m of masks) {
    const [y1Norm, x1Norm, y2Norm, x2Norm] = m.box_2d;
    const x1 = Math.round((x1Norm / 1000) * imageWidth);
    const y1 = Math.round((y1Norm / 1000) * imageHeight);
    const x2 = Math.round((x2Norm / 1000) * imageWidth);
    const y2 = Math.round((y2Norm / 1000) * imageHeight);

    const boxW = Math.max(1, x2 - x1);
    const boxH = Math.max(1, y2 - y1);

    try {
      const maskBuf = Buffer.from(extractBase64(m.mask), "base64");
      const resized = await sharp(maskBuf)
        .resize(boxW, boxH, { fit: "fill" })
        .toBuffer();

      overlays.push({
        input: resized,
        left: Math.max(0, x1),
        top: Math.max(0, y1),
        blend: "add" as const,
      });
    } catch (e) {
      console.warn(`Furniture segmentation: failed to process mask for "${m.label}":`, e);
    }
  }

  if (overlays.length === 0) {
    return canvas.toBuffer();
  }

  return sharp({
    create: {
      width: imageWidth,
      height: imageHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 255 },
    },
  })
    .composite(overlays)
    .png()
    .toBuffer();
}

export async function segmentFurniture(
  imageBase64: string,
  mimeType: string,
  googleApiKey: string,
): Promise<FurnitureMaskResult | null> {
  try {
    const imgBuf = Buffer.from(imageBase64, "base64");
    const meta = await sharp(imgBuf).metadata();
    if (!meta.width || !meta.height) {
      console.warn("Furniture segmentation: could not read image dimensions");
      return null;
    }

    const genai = new GoogleGenerativeAI(googleApiKey);
    const model = genai.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent([
      { inlineData: { mimeType, data: imageBase64 } },
      { text: FURNITURE_SEGMENTATION_PROMPT },
    ]);

    const text = result.response?.text?.() ?? "";
    if (!text) {
      console.warn("Furniture segmentation: empty response from Gemini");
      return null;
    }

    let parsed: { masks?: SegmentationMask[] };
    try {
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const raw = jsonMatch ? jsonMatch[1] : text;
      const objMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(objMatch ? objMatch[0] : raw);
    } catch {
      const arrMatch = text.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        parsed = { masks: JSON.parse(arrMatch[0]) };
      } else {
        console.warn("Furniture segmentation: failed to parse response JSON");
        return null;
      }
    }

    const masks = parsed.masks;
    if (!Array.isArray(masks) || masks.length === 0) {
      console.warn("Furniture segmentation: no furniture masks returned");
      return null;
    }

    const valid = masks.filter(
      (m) =>
        m.mask &&
        Array.isArray(m.box_2d) &&
        m.box_2d.length === 4 &&
        m.box_2d.every((n) => typeof n === "number"),
    );

    if (valid.length === 0) {
      console.warn("Furniture segmentation: no valid masks after filtering");
      return null;
    }

    const compositeBuf = await compositeMasks(valid, meta.width, meta.height);
    const maskBase64 = compositeBuf.toString("base64");
    const labels = valid.map((m) => m.label || "furniture");

    console.log(`Furniture segmentation: composited ${valid.length} mask(s) for [${labels.join(", ")}]`);

    return { maskBase64, labels };
  } catch (err) {
    console.error("Furniture segmentation failed (non-fatal, will fall back):", err);
    return null;
  }
}
