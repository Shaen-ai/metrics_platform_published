import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI, type Part } from "@google/generative-ai";
import { buildEditInterpretationPrompt } from "@/lib/interiorDesignPrompts";
import {
  buildInteriorDesignCatalogContext,
  buildGeminiMerchantFurnitureCatalogBlock,
  fetchProductImagePartsForGemini,
  catalogSummaryToPromptText,
} from "@/lib/catalogForPrompts";
import { normalizeRoomAnalysisOpenings, type RoomAnalysis } from "@/lib/interiorDesignPrompts";
import { withRetry } from "@/lib/aiRetry";
import { PUBLIC_AI_GENERIC_ERROR, PUBLIC_AI_UNAVAILABLE } from "@/lib/tunzoneAi";

export const maxDuration = 120;

function dedupe(ids: Iterable<string>): string[] {
  const s = new Set<string>();
  for (const id of ids) {
    const t = String(id).trim();
    if (t) s.add(t);
  }
  return [...s];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      sessionId,
      editMessage,
      previousPrompt,
      currentImageBase64,
      annotatedImageBase64,
      annotatedImageMimeType,
      chatHistory = [],
      adminSlug = "demo",
      preferredCatalogIds: preferredRaw,
      catalogAnchorIds: anchorRaw,
      roomAnalysis: roomAnalysisMaybe,
    } = body as {
      sessionId: string;
      editMessage: string;
      previousPrompt: string;
      currentImageBase64?: string;
      annotatedImageBase64?: string;
      annotatedImageMimeType?: string;
      chatHistory?: Array<{ role: string; content: string }>;
      adminSlug?: string;
      preferredCatalogIds?: string[];
      catalogAnchorIds?: string[];
      roomAnalysis?: unknown;
    };

    if (!editMessage?.trim()) {
      return NextResponse.json({ error: "Edit message is required." }, { status: 400 });
    }
    if (!previousPrompt) {
      return NextResponse.json({ error: "Previous prompt context is required." }, { status: 400 });
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const googleKey = process.env.GOOGLE_AI_API_KEY;

    if (!anthropicKey || !googleKey) {
      return NextResponse.json({ error: PUBLIC_AI_UNAVAILABLE }, { status: 503 });
    }

    let roomAnalysis: RoomAnalysis | null = null;
    if (roomAnalysisMaybe !== undefined && roomAnalysisMaybe !== null) {
      try {
        roomAnalysis = normalizeRoomAnalysisOpenings(roomAnalysisMaybe as RoomAnalysis);
      } catch {
        roomAnalysis = null;
      }
    }

    const preferredCatalogIds = Array.isArray(preferredRaw)
      ? preferredRaw.filter((x): x is string => typeof x === "string" && !!x.trim())
      : [];

    const catalogAnchorIds = Array.isArray(anchorRaw)
      ? anchorRaw.filter((x): x is string => typeof x === "string" && !!x.trim())
      : [];

    const catalogCtx = await buildInteriorDesignCatalogContext({
      adminSlug,
      textPrompt: `${editMessage}\n\n${previousPrompt.slice(0, 1200)}`,
      roomAnalysis,
      preferredCatalogIds: dedupe([...preferredCatalogIds, ...catalogAnchorIds]),
    });

    const catalogSnippetThin = catalogCtx.summariesForDirector.length
      ? `\nPinned catalog excerpts for continuity:\n${catalogSummaryToPromptText(
          catalogCtx.summariesForDirector.slice(0, 52),
        )}`.slice(0, 7000)
      : "";

    const merchantInteriorCatalogPreserveBlock =
      `${catalogCtx.coverageInstructions}${catalogSnippetThin}`.trim();

    const claudeClient = new Anthropic({ apiKey: anthropicKey });
    const interpretPrompt = buildEditInterpretationPrompt(
      editMessage,
      previousPrompt,
      chatHistory,
      merchantInteriorCatalogPreserveBlock || undefined,
    );

    const claudeResponse = await withRetry(
      () =>
        claudeClient.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 2048,
          messages: [{ role: "user", content: interpretPrompt }],
        }),
      "Edit Interpretation",
    );

    const claudeText = claudeResponse.content.find((b) => b.type === "text");
    if (!claudeText || claudeText.type !== "text") {
      return NextResponse.json({ error: "Edit interpretation failed." }, { status: 500 });
    }

    let editResult: { interpretation: string; fullPrompt: string; message: string };
    try {
      let rawText = claudeText.text;
      const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        rawText = codeBlockMatch[1];
      }
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      editResult = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch {
      console.error("Interior design edit: failed to parse interpretation payload");
      return NextResponse.json({ error: "Failed to parse edit interpretation." }, { status: 500 });
    }

    const geminiMerchantAppendix =
      dedupe([...catalogAnchorIds, ...preferredCatalogIds]).length &&
      catalogCtx.summaryById.size > 0
        ? buildGeminiMerchantFurnitureCatalogBlock(
            dedupe([...catalogAnchorIds, ...preferredCatalogIds]),
            catalogCtx.summaryById,
            catalogCtx.coverage,
          )
        : "";

    let productRefs: Array<{ inlineData: { mimeType: string; data: string } }> = [];
    if (catalogCtx.summaryById.size > 0) {
      productRefs = await fetchProductImagePartsForGemini(
        dedupe([...catalogAnchorIds, ...preferredCatalogIds]),
        catalogCtx.summaryById,
      );
    }

    const genai = new GoogleGenerativeAI(googleKey);
    const model = genai.getGenerativeModel({
      model: "gemini-2.5-flash-image",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] } as any,
    });

    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
    const hasAnnotation = !!annotatedImageBase64;

    const merchCue = `${geminiMerchantAppendix}${productRefs.length ? "\nSKU reference thumbnails arrive after baseline/annotation frames above — echo them visually for listed merchants." : ""}`
      .trim()
      .slice(0, 2500);

    if (currentImageBase64) {
      parts.push({
        inlineData: { mimeType: "image/png", data: currentImageBase64 },
      });

      if (hasAnnotation) {
        parts.push({
          inlineData: {
            mimeType: annotatedImageMimeType || "image/png",
            data: annotatedImageBase64!,
          },
        });
      }

      for (const p of productRefs) {
        parts.push(p);
      }

      const skuRefNote =
        productRefs.length > 0
          ? hasAnnotation
            ? "\n INLINE images AFTER the SECOND chunk are MERCHANT SKU reference thumbnails — style guides only, never annotated masks.\n"
            : "\n INLINE images after the FIRST baseline frame are MERCHANT SKU reference thumbnails — prioritize their contours & finishes.\n"
          : "";

      const annotationInstructions = hasAnnotation
        ? `\n\nThe FIRST INLINE chunk is the current design; the SECOND is the user’s annotated markings. Respect ONLY those markings.${skuRefNote}`
        : skuRefNote;

      const structuralAnchorEdit = roomAnalysis
        ? `
STRUCTURAL GROUND TRUTH (preserve exactly):
- Room shape: ${roomAnalysis.room_shape} | ${roomAnalysis.estimated_dimensions.width}m × ${roomAnalysis.estimated_dimensions.depth}m
- Windows: exactly ${roomAnalysis.window_count}${roomAnalysis.window_positions.length ? ` (${roomAnalysis.window_positions.join("; ")})` : ""}
- Doors: exactly ${roomAnalysis.door_count}${roomAnalysis.door_positions.length ? ` (${roomAnalysis.door_positions.join("; ")})` : ""}
- Camera: ${roomAnalysis.camera_angle}
- Ceiling: ${roomAnalysis.ceiling_type}${roomAnalysis.has_staircase ? `\n- Staircase: ${roomAnalysis.staircase_description || "present"} — keep as-is` : ""}
`
        : "";

      parts.push({
        text: `Edit this interior design photo. This is an IMAGE EDITING task — NOT image generation.

DO NOT CHANGE (structure — these are absolute constraints):
- Room shape, walls, corners, ceiling — IDENTICAL to the photo
- Window and door positions, sizes, count — EXACTLY as-is (do NOT add or remove any)
- Camera angle and perspective — EXACTLY as-is
- View outside windows — EXACTLY as-is
- Room proportions and dimensions — EXACTLY as-is
- Floor plan layout and room boundaries — IDENTICAL
${structuralAnchorEdit}${annotationInstructions}

IMPORTANT: The design text below may inadvertently mention architectural elements. IGNORE any structural descriptions — use ONLY the input photo as the structural reference.

SPECIFIC CHANGES TO MAKE: ${editResult.interpretation}

FULL GENERATION BRIEF (merge into result): ${editResult.fullPrompt}${merchCue ? `\n\n${merchCue}` : ""}

COMPLETENESS — the output must be a FULLY FINISHED interior (not half-designed):
- Every visible wall, floor area, and ceiling area must have a complete finish — no bare/unfinished patches
- All surface transitions must be clean and professionally finished

The result must be the SAME ROOM from the SAME camera position with only the requested design changes applied. Every structural element stays identical.`,
      });
    } else {
      parts.push({
        text: `${editResult.fullPrompt}${geminiMerchantAppendix ? `\n\n${geminiMerchantAppendix}` : ""}`,
      });
    }

    const result = await model.generateContent(parts as Part[]);
    const geminiResponse = result.response;
    type GenPart = { inlineData?: { data?: unknown; mimeType?: unknown }; text?: string };

    const images: Array<{ base64: string; mimeType: string }> = [];
    for (const candidate of geminiResponse.candidates ?? []) {
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

    return NextResponse.json({
      data: {
        sessionId,
        images: images.map((img, i) => ({
          id: `${sessionId}-edit-${Date.now()}-${i}`,
          base64: img.base64,
          mimeType: img.mimeType,
          prompt: editResult.fullPrompt,
        })),
        message: editResult.message,
        updatedPrompt: editResult.fullPrompt,
      },
      adminSlug,
    });
  } catch (error: unknown) {
    console.error("Interior design edit error:", error);
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
