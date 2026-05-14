import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI, type Part } from "@google/generative-ai";
import {
  buildCreativeDirectorPrompt,
  normalizeParsedDesignBrief,
  type DesignStyleId,
  type RoomAnalysis,
  type DesignBrief,
} from "@/lib/interiorDesignPrompts";
import {
  buildInteriorDesignCatalogContext,
  buildGeminiMerchantFurnitureCatalogBlock,
  fetchProductImagePartsForGemini,
} from "@/lib/catalogForPrompts";
import { withRetry } from "@/lib/aiRetry";
import { assertInteriorDesignAllowed } from "@/lib/laravelPlan";
import { PUBLIC_AI_GENERIC_ERROR, PUBLIC_AI_UNAVAILABLE } from "@/lib/tunzoneAi";

export const maxDuration = 120;

function parsePreferredCatalogIdsFromForm(formData: FormData): string[] {
  const raw = formData.get("preferredCatalogIds");
  if (!raw || typeof raw !== "string") return [];
  const t = raw.trim();
  if (!t) return [];
  try {
    const arr = JSON.parse(t);
    if (Array.isArray(arr)) {
      return arr.map((x) => String(x).trim()).filter(Boolean);
    }
  } catch {
    /* comma-separated fallback */
    return t
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function buildGeminiRedesignPrompt(brief: DesignBrief, roomAnalysis?: RoomAnalysis | null, merchantAppendix?: string): string {
  const appendix = merchantAppendix?.trim() ?? "";

  const structuralAnchor = roomAnalysis
    ? `
STRUCTURAL GROUND TRUTH (from room analysis — these are the EXACT facts to preserve):
- Room shape: ${roomAnalysis.room_shape}
- Dimensions: ${roomAnalysis.estimated_dimensions.width}m × ${roomAnalysis.estimated_dimensions.depth}m, ceiling ${roomAnalysis.estimated_dimensions.height}m
- Exactly ${roomAnalysis.window_count} window(s)${roomAnalysis.window_positions.length ? ` at: ${roomAnalysis.window_positions.join("; ")}` : ""}
- Exactly ${roomAnalysis.door_count} door(s)${roomAnalysis.door_positions.length ? ` at: ${roomAnalysis.door_positions.join("; ")}` : ""}
- Camera viewpoint: ${roomAnalysis.camera_angle}
- Ceiling: ${roomAnalysis.ceiling_type}${roomAnalysis.structural_elements.length ? `\n- Structural elements: ${roomAnalysis.structural_elements.join(", ")}` : ""}${roomAnalysis.has_staircase ? `\n- Staircase: ${roomAnalysis.staircase_description || "present"} — keep exactly as-is` : ""}
The output MUST match every structural fact above. Do NOT add or remove windows/doors. Do NOT alter room geometry.
`
    : "";

  return `Edit this photo of a room. This is an IMAGE EDITING task — you are modifying the provided photo, NOT generating a new image from scratch.

TASK: Apply interior design to THIS EXACT ROOM in the photo. The output must show the SAME physical space with new finishes, furniture, and decor.

ABSOLUTE RULES — DO NOT CHANGE ANY OF THESE:
- Camera angle, perspective, and viewpoint — IDENTICAL to the input photo
- Room shape, walls, corners, columns, structural openings — IDENTICAL
- Window and door positions, sizes, shapes, and count — IDENTICAL
- View visible outside windows — keep EXACTLY as-is (do not replace with different scenery)
- Room proportions and overall dimensions — IDENTICAL
- Ceiling structure (beams, vaults, ribbing, height) — keep the SAME geometry
- Any staircase, floor opening, or multi-level feature — keep EXACTLY as-is
- The number of walls and their angles — IDENTICAL
- Floor plan layout and room boundaries — IDENTICAL
${structuralAnchor}
IMPORTANT: The design descriptions below may inadvertently mention architectural elements (window counts, room shapes, ceiling types, etc.). IGNORE any such structural descriptions in the design text — use ONLY the input photo as the structural reference. Apply ONLY the decorative and finish changes.

WHAT TO CHANGE (decoration & finishes only):
- Wall finishes: ${brief.subject.slice(0, 400)}
- Style, colors & mood: ${brief.style.slice(0, 400)}
- Furniture layout & decor: ${brief.arrangement.slice(0, 400)}
- Add appropriate flooring finish, lighting fixtures, textiles, art, and plants${appendix ? `\n${appendix.slice(0, 2500)}` : ""}

COMPLETENESS — the output must be a FULLY FINISHED, magazine-quality interior (NOT a work-in-progress):
- EVERY visible wall must have a complete finish (paint, wallpaper, panels, texture) — no bare drywall, no unfinished patches
- The ENTIRE visible floor must be fully designed (hardwood, tile, carpet, or rugs covering the full area) — no half-finished or patchy flooring
- The ENTIRE visible ceiling must be designed (painted, with appropriate fixtures, molding, or beams) — no raw/unfinished ceiling areas
- ALL surface transitions (wall-to-floor, wall-to-ceiling, corners) must be clean and complete
- Every part of the room visible in the frame must look professionally finished and cohesive

The output must be recognizably the SAME room from the SAME camera position, with a COMPLETE interior design applied to every surface. Photorealistic interior photography, 8K, architectural digest quality.`;
}

async function generateGeminiInteriorImage(opts: {
  fullPromptFallback: string;
  googleApiKey: string;
  referenceImageBase64?: string;
  referenceImageMimeType?: string;
  brief?: DesignBrief;
  roomAnalysis?: RoomAnalysis | null;
  merchantAppendix?: string;
  productImageParts?: Array<{ inlineData: { mimeType: string; data: string } }>;
}): Promise<Array<{ base64: string; mimeType: string }>> {
  const {
    fullPromptFallback,
    googleApiKey,
    referenceImageBase64,
    referenceImageMimeType,
    brief,
    roomAnalysis,
    merchantAppendix,
    productImageParts = [],
  } = opts;

  const genai = new GoogleGenerativeAI(googleApiKey);
  const model = genai.getGenerativeModel({
    model: "gemini-2.5-flash-image",
    // SDK typings lag image response modalities — matches official samples.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    generationConfig: { responseModalities: ["TEXT", "IMAGE"] } as any,
  });

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

  const merchTxt = merchantAppendix?.trim() ?? "";
  const refVisualNote =
    productImageParts.length > 0
      ? `\nREFERENCE PRODUCT IMAGES inserted below illustrate merchant SKU appearance — prioritize their silhouettes, proportions, upholstery, wood tones, metal finishes whenever those products appear.\n`
      : "";

  if (referenceImageBase64 && brief) {
    parts.push({
      inlineData: {
        mimeType: referenceImageMimeType || "image/jpeg",
        data: referenceImageBase64,
      },
    });

    for (const p of productImageParts) {
      parts.push(p);
    }

    parts.push({
      text: `${buildGeminiRedesignPrompt(brief, roomAnalysis, `${merchTxt}${refVisualNote}`)}`,
    });
  } else {
    /** Text-only synthesis — thumbnails first when present. */
    for (const p of productImageParts) {
      parts.push(p);
    }
    const prepend = productImageParts.length ? refVisualNote : "";
    parts.push({
      text: `Generate a photorealistic interior design image based on this description:\n\n${fullPromptFallback}${prepend}${merchTxt ? `\n\n${merchTxt.slice(0, 3800)}` : ""}`,
    });
  }

  const result = await model.generateContent(parts as Part[]);
  type GenPart = { inlineData?: { data?: unknown; mimeType?: unknown }; text?: string };
  const images: Array<{ base64: string; mimeType: string }> = [];
  for (const candidate of result.response?.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      const pdata = part as GenPart;
      const raw = pdata.inlineData?.data;
      if (typeof raw === "string" && raw) {
        const mtUnknown = pdata.inlineData?.mimeType;
        images.push({
          base64: raw,
          mimeType: typeof mtUnknown === "string" && mtUnknown ? mtUnknown : "image/png",
        });
      }
    }
  }

  return images;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const textPrompt = (formData.get("textPrompt") as string) || "";
    const styleId = (formData.get("style") as DesignStyleId) || "modern";
    const roomImage = formData.get("roomImage") as File | null;
    const roomAnalysisRaw = formData.get("roomAnalysis") as string | null;
    const adminSlug = ((formData.get("adminSlug") as string) || "demo").trim();
    const preferredCatalogIds = parsePreferredCatalogIdsFromForm(formData);

    if (!textPrompt.trim()) {
      return NextResponse.json({ error: "Text prompt is required." }, { status: 400 });
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const googleKey = process.env.GOOGLE_AI_API_KEY;

    if (!anthropicKey) {
      return NextResponse.json({ error: PUBLIC_AI_UNAVAILABLE }, { status: 503 });
    }
    if (!googleKey) {
      return NextResponse.json({ error: PUBLIC_AI_UNAVAILABLE }, { status: 503 });
    }

    const usageGate = await assertInteriorDesignAllowed(adminSlug);
    if (!usageGate.ok) {
      return NextResponse.json(
        { error: usageGate.message || "Interior design usage limit reached." },
        { status: usageGate.status },
      );
    }

    let roomAnalysis: RoomAnalysis | null = null;
    if (roomAnalysisRaw) {
      try {
        roomAnalysis = JSON.parse(roomAnalysisRaw);
      } catch {}
    }

    const catalogCtx = await buildInteriorDesignCatalogContext({
      adminSlug,
      textPrompt,
      roomAnalysis,
      preferredCatalogIds,
    });

    const merchantCatalogDirectorBlock = [
      catalogCtx.coverageInstructions,
      catalogCtx.catalogTextForClaude
        ? `AVAILABLE PRODUCT CATALOG — authoritative merchant SKUs surfaced for relevance ranking (reuse EXACT NAMES in prompts; NEVER invent unrecognized furniture):
${catalogCtx.catalogTextForClaude}`
        : "",
      catalogCtx.catalogTextForClaude
        ? `STRUCTURED FIELD CONSTRAINT: Populate "selected_catalog_ids" honoring distinct coverage target ≥ ${catalogCtx.distinctRequired} UNIQUE ids whenever catalog has enough rows (otherwise ALL rows). Anchored placements target ≈${catalogCtx.anchoredPieces} / ${catalogCtx.estimatedPieces} placements.`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const claudeClient = new Anthropic({ apiKey: anthropicKey });
    const directorPrompt = buildCreativeDirectorPrompt(
      textPrompt,
      styleId,
      roomAnalysis,
      undefined,
      !!roomImage,
      merchantCatalogDirectorBlock || undefined,
    );

    const claudeResponse = await withRetry(
      () =>
        claudeClient.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 2048,
          messages: [{ role: "user", content: directorPrompt }],
        }),
      "Design brief",
    );

    const claudeText = claudeResponse.content.find((b) => b.type === "text");
    if (!claudeText || claudeText.type !== "text") {
      return NextResponse.json({ error: "Design brief step returned no response." }, { status: 500 });
    }

    let brief: DesignBrief;
    try {
      let rawText = claudeText.text;
      const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        rawText = codeBlockMatch[1];
      }
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      const parsedJson = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
      brief = normalizeParsedDesignBrief(parsedJson);
    } catch {
      console.error("Interior design generate: failed to parse design brief payload");
      return NextResponse.json({ error: "Failed to parse design brief." }, { status: 500 });
    }

    const geminiMerchantAppendix =
      catalogCtx.catalogTextForClaude.trim().length === 0
        ? ""
        : buildGeminiMerchantFurnitureCatalogBlock(
            brief.selectedCatalogIds?.length ? brief.selectedCatalogIds : preferredCatalogIds,
            catalogCtx.summaryById,
            catalogCtx.coverage,
          );

    /** Prepare reference image if provided */
    let referenceBase64: string | undefined;
    let referenceImageMimeType: string | undefined;
    if (roomImage) {
      const imageBytes = await roomImage.arrayBuffer();
      referenceBase64 = Buffer.from(imageBytes).toString("base64");
      referenceImageMimeType = roomImage.type || "image/jpeg";
    }

    /** Fetch optional merchant thumbnail references for SKU grounding (works with / without room photo). */
    let productRefs: Array<{ inlineData: { mimeType: string; data: string } }> = [];
    const idsForImages =
      brief.selectedCatalogIds?.length ? brief.selectedCatalogIds : preferredCatalogIds;
    if (idsForImages?.length && catalogCtx.summaryById.size > 0) {
      productRefs = await fetchProductImagePartsForGemini(idsForImages, catalogCtx.summaryById);
    }

    const images = await generateGeminiInteriorImage({
      fullPromptFallback: brief.fullPrompt,
      googleApiKey: googleKey,
      referenceImageBase64: referenceBase64,
      referenceImageMimeType,
      brief: referenceBase64 ? brief : undefined,
      roomAnalysis: referenceBase64 ? roomAnalysis : undefined,
      merchantAppendix: geminiMerchantAppendix || undefined,
      productImageParts: productRefs,
    });

    if (images.length === 0) {
      return NextResponse.json(
        { error: "Image generation returned no results. Try rephrasing your request." },
        { status: 500 },
      );
    }

    const sessionId = `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return NextResponse.json({
      data: {
        sessionId,
        designBrief: brief,
        images: images.map((img, i) => ({
          id: `${sessionId}-img-${i}`,
          base64: img.base64,
          mimeType: img.mimeType,
          prompt: brief.fullPrompt,
        })),
      },
      adminSlug,
    });
  } catch (error: unknown) {
    console.error("Interior design generate error:", error);
    const err = error as { status?: number; error?: { type?: string }; message?: string };
    const isOverloaded =
      err?.status === 529 ||
      err?.error?.type === "overloaded_error" ||
      (typeof err?.message === "string" && /overloaded/i.test(err.message));
    if (isOverloaded) {
      return NextResponse.json(
        { error: "The service is temporarily overloaded. Please wait a moment and try again." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: PUBLIC_AI_GENERIC_ERROR }, { status: 500 });
  }
}
