import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  type Part,
} from "@google/generative-ai";
import {
  buildCreativeDirectorPrompt,
  normalizeParsedDesignBrief,
  type DesignStyleId,
  type RoomAnalysis,
  type DesignBrief,
} from "@/lib/interiorDesignPrompts";
import {
  buildInteriorDesignCatalogContext,
  buildPinsOnlyCoverageInstructions,
  catalogSummaryToPromptText,
  type CatalogItemSummary,
} from "@/lib/catalogForPrompts";
import { withRetry } from "@/lib/aiRetry";
import { assertInteriorDesignAllowed } from "@/lib/laravelPlan";
import { PUBLIC_AI_GENERIC_ERROR, PUBLIC_AI_UNAVAILABLE } from "@/lib/tunzoneAi";
import {
  collectAnthropicTextBlocks,
  parseDesignBriefJsonFromAssistantText,
} from "@/lib/creativeDirectorJson";
import { resolveMerchantCatalogSlots, type RequiredSlot } from "@/lib/resolveMerchantCatalogSlots";
import {
  buildProductCollages,
  buildCollageManifestText,
  type ProductCollageInput,
  type ProductCollageResult,
} from "@/lib/merchantProductCollage";
import { filterCatalogIdsForRoom } from "@/lib/catalogRoomFilter";

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

function deriveRequiredSlots(roomAnalysis?: RoomAnalysis | null, _brief?: DesignBrief): RequiredSlot[] {
  const roomType = (roomAnalysis?.room_type ?? "").toLowerCase();
  if (/living|lounge/.test(roomType)) {
    return [
      { family: "furniture", subtype: "sofa", quantity: 1 },
      { family: "furniture", subtype: "coffee_table", quantity: 1 },
      { family: "furniture", subtype: "armchair", quantity: 1 },
    ];
  }
  if (/bedroom/.test(roomType)) {
    return [
      { family: "furniture", subtype: "bed", quantity: 1 },
      { family: "furniture", subtype: "nightstand", quantity: 1 },
      { family: "furniture", subtype: "dresser", quantity: 1 },
    ];
  }
  if (/kitchen|dining/.test(roomType)) {
    return [
      { family: "furniture", subtype: "table", quantity: 1 },
      { family: "furniture", subtype: "chair", quantity: 4 },
    ];
  }
  if (/office|study/.test(roomType)) {
    return [
      { family: "furniture", subtype: "desk", quantity: 1 },
      { family: "furniture", subtype: "chair", quantity: 1 },
      { family: "furniture", subtype: "bookshelf", quantity: 1 },
    ];
  }
  return [
    { family: "furniture", subtype: "sofa", quantity: 1 },
    { family: "furniture", subtype: "coffee_table", quantity: 1 },
    { family: "furniture", subtype: "armchair", quantity: 1 },
  ];
}

function dedupeIds(...sources: (string[] | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const arr of sources) {
    if (!arr) continue;
    for (const id of arr) {
      const k = id.trim();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

function buildStrictMerchantAppendix(
  collages: ProductCollageResult[],
  summaryById: Map<string, CatalogItemSummary>,
  pinsOnly = false,
): string {
  if (!collages.length) return "";

  const header = pinsOnly
    ? `USER-SELECTED PRODUCTS — PINS-ONLY MODE:
The user chose exactly ${collages.length} product(s). Place ONLY these in the room.
Do NOT add, invent, imagine, or generate ANY other furniture, seating, tables, or storage.
If the room needs more furniture types than provided, leave those areas EMPTY — show only the room surfaces.
Match the exact appearance of each product from its reference sheet — shape, color, upholstery, wood tone, metal finish.
CRITICAL: Do NOT change walls, floors, ceiling, curtains, or any room surface — ONLY place these products.`
    : `MERCHANT FURNITURE CATALOG — ABSOLUTE STRICT MODE:
EVERY piece of furniture in the output image MUST be one of the catalog products shown in the reference sheets above.
Do NOT add, invent, imagine, or generate ANY furniture, seating, tables, or storage that is NOT in the provided product sheets.
If a furniture type is needed but no matching product was provided, LEAVE THAT SPOT EMPTY — keep the room as-is in that area.
The room with fewer furniture pieces (all from the provided catalog) is ALWAYS better than a room with invented or generic furniture.
The product reference sheets show multiple views of each product — match the exact appearance, proportions, upholstery, wood tones, and metal finishes.
CRITICAL: Do NOT change walls, floors, ceiling, curtains, or any room surface — ONLY place these furniture products into the existing room.`;

  const productLines = collages.map((c, i) => {
    const row = summaryById.get(c.productId);
    const dims = row ? `~${row.width_cm}×${row.depth_cm}×${row.height_cm} cm` : "";
    const cat = row?.category ?? "";
    return `- "${c.productName}" [${c.productId}] (${cat}${dims ? `, ${dims}` : ""}) — see Sheet ${i + 1}`;
  });

  return `${header}\n\nProducts to use:\n${productLines.join("\n")}`;
}

/**
 * Build placement instructions mapping pinned products to existing furniture
 * positions from room analysis and segmentation labels.
 */
function buildPinnedPlacementBlock(
  collages: ProductCollageResult[],
  summaryById: Map<string, CatalogItemSummary>,
  roomAnalysis?: RoomAnalysis | null,
  segLabels?: string[],
): string {
  if (collages.length === 0) return "";

  const existingFurniture = roomAnalysis?.existing_furniture ?? [];
  const segSet = new Set((segLabels ?? []).map((l) => l.toLowerCase()));

  const lines: string[] = [];
  lines.push(`PLACEMENT INSTRUCTIONS (${collages.length} product(s) to place):`);

  for (let i = 0; i < collages.length; i++) {
    const c = collages[i]!;
    const row = summaryById.get(c.productId);
    const cat = (row?.category ?? "").toLowerCase();
    const name = c.productName.toLowerCase();
    const productLabel = `Sheet ${i + 1}: "${c.productName}"`;

    let matched: { name: string; position: string } | null = null;
    for (const ef of existingFurniture) {
      const efName = ef.name.toLowerCase();
      if (
        efName.includes(cat) || cat.includes(efName) ||
        efName.includes(name) || name.includes(efName) ||
        (cat.includes("chair") && efName.includes("chair")) ||
        (cat.includes("sofa") && (efName.includes("sofa") || efName.includes("couch"))) ||
        (cat.includes("table") && efName.includes("table"))
      ) {
        matched = ef;
        break;
      }
    }

    if (matched) {
      lines.push(`- ${productLabel}: Replace the existing "${matched.name}" at "${matched.position}" with this product.`);
    } else if (segSet.size > 0) {
      lines.push(`- ${productLabel}: Place in a natural, functional position where a ${cat || "furniture piece"} would fit.`);
    } else {
      lines.push(`- ${productLabel}: Place in an appropriate open area for a ${cat || "furniture piece"}.`);
    }
  }

  lines.push("Do NOT add any furniture that is not listed above. Leave other areas unchanged or empty.");
  return lines.join("\n");
}

function buildGeminiRedesignPrompt(brief: DesignBrief, roomAnalysis?: RoomAnalysis | null, merchantAppendix?: string, hasMask = false, placementBlock?: string): string {
  const appendix = merchantAppendix?.trim() ?? "";

  const placementText = placementBlock?.trim() ? `\n${placementBlock.slice(0, 1500)}` : "";

  if (hasMask) {
    return `You are given the following images:
- PRODUCT REFERENCE SHEETS (if any) — catalog furniture products to use as replacements
- ROOM PHOTO — the original room photograph
- FURNITURE MASK — a black-and-white mask image (the last image before this text) where WHITE pixels mark furniture to replace, BLACK pixels mark everything to keep untouched

INPAINTING TASK: Edit ONLY the WHITE-masked areas of the room photo. Replace the furniture in those areas with new furniture from the catalog. Every BLACK pixel must remain PIXEL-PERFECT identical to the original photo — do not alter walls, floor, ceiling, curtains, lighting, or any room surface.

STRICT RULES:
- ONLY modify pixels that are WHITE in the mask — these are furniture areas
- Every BLACK pixel must be preserved exactly — walls, floor, ceiling, curtains, doors, windows, lighting fixtures
- Place new furniture naturally in the masked areas with correct perspective and lighting
- Match the room's existing lighting, shadows, and color temperature
- Furniture style & selection: ${brief.arrangement.slice(0, 600)}
- Style direction: ${brief.style.slice(0, 300)}${appendix ? `\n${appendix.slice(0, 2500)}` : ""}${placementText}

The output must be the SAME room with ONLY the furniture changed. Photorealistic interior photography, 8K quality.`;
  }

  const structuralAnchor = roomAnalysis
    ? `
ROOM FACTS (from analysis — preserve ALL of these EXACTLY):
- Room shape: ${roomAnalysis.room_shape}
- Dimensions: ${roomAnalysis.estimated_dimensions.width}m × ${roomAnalysis.estimated_dimensions.depth}m, ceiling ${roomAnalysis.estimated_dimensions.height}m
- Exactly ${roomAnalysis.window_count} window(s)${roomAnalysis.window_positions.length ? ` at: ${roomAnalysis.window_positions.join("; ")}` : ""}
- Exactly ${roomAnalysis.door_count} door(s)${roomAnalysis.door_positions.length ? ` at: ${roomAnalysis.door_positions.join("; ")}` : ""}
- Camera viewpoint: ${roomAnalysis.camera_angle}
- Ceiling: ${roomAnalysis.ceiling_type}${roomAnalysis.structural_elements.length ? `\n- Structural elements: ${roomAnalysis.structural_elements.join(", ")}` : ""}${roomAnalysis.has_staircase ? `\n- Staircase: ${roomAnalysis.staircase_description || "present"} — keep exactly as-is` : ""}
`
    : "";

  return `Edit this photo of a room. This is a FURNITURE REPLACEMENT task — you are swapping out furniture items in the photo while keeping the room itself EXACTLY as-is.

TASK: Remove the existing furniture from the room and place NEW furniture products in their place. The room itself (every non-furniture element) must remain PIXEL-PERFECT identical to the input photo.

ABSOLUTE RULES — PRESERVE THESE EXACTLY AS IN THE ORIGINAL PHOTO:
- Camera angle, perspective, and viewpoint — IDENTICAL
- Walls: same color, same paint, same texture, same wallpaper — DO NOT REPAINT OR REFINISH
- Floor: same material, same color, same pattern — DO NOT CHANGE THE FLOORING
- Ceiling: same finish, same color, same fixtures — DO NOT CHANGE
- Windows: same position, size, shape, count — IDENTICAL
- Curtains/drapes/blinds: keep the EXACT SAME window treatments — DO NOT CHANGE
- Doors: same position, size, style — IDENTICAL
- View visible outside windows — IDENTICAL
- Room proportions and dimensions — IDENTICAL
- All architectural features (columns, beams, molding, built-ins) — IDENTICAL
- Existing lighting fixtures (ceiling lights, wall sconces) — KEEP AS-IS
- Any staircase, floor opening, or multi-level feature — IDENTICAL
${structuralAnchor}
WHAT TO CHANGE — ONLY FURNITURE:
- Remove existing freestanding furniture (sofas, chairs, tables, shelving units, desks, beds, dressers, etc.)
- Place new furniture products from the catalog in natural, functional positions
- Furniture style & selection: ${brief.arrangement.slice(0, 600)}
- Style direction for furniture choices: ${brief.style.slice(0, 300)}${appendix ? `\n${appendix.slice(0, 2500)}` : ""}${placementText}

WHAT COUNTS AS "FURNITURE" (only these change):
- Seating: sofas, armchairs, dining chairs, stools, benches
- Tables: coffee tables, dining tables, side tables, desks, console tables
- Storage: bookshelves, cabinets, TV stands, dressers, wardrobes (freestanding only)
- Beds and bedside tables
- Decorative furniture: plant stands, coat racks, room dividers
- Small decor ON furniture: throw pillows, table lamps, small vases (these follow the new furniture)

WHAT IS NOT FURNITURE (do NOT change these):
- Walls, wall color, wall texture, wallpaper
- Floor material, floor color, floor tiles, carpet
- Ceiling, ceiling lights, ceiling fans
- Curtains, drapes, blinds, window treatments
- Doors, door frames, door handles
- Built-in cabinetry, built-in shelving
- Baseboards, crown molding, trim

The output must look like the SAME room photographed from the SAME position, with only the furniture items swapped. A viewer should recognize it as the exact same room — same walls, same floor, same curtains — just with different furniture. Photorealistic interior photography, 8K quality.`;
}

async function generateGeminiInteriorImage(opts: {
  fullPromptFallback: string;
  googleApiKey: string;
  referenceImageBase64?: string;
  referenceImageMimeType?: string;
  brief?: DesignBrief;
  roomAnalysis?: RoomAnalysis | null;
  merchantAppendix?: string;
  collageParts?: Array<{ inlineData: { mimeType: string; data: string } }>;
  collageManifest?: string;
  furnitureMaskBase64?: string;
  placementBlock?: string;
}): Promise<Array<{ base64: string; mimeType: string }>> {
  const {
    fullPromptFallback,
    googleApiKey,
    referenceImageBase64,
    referenceImageMimeType,
    brief,
    roomAnalysis,
    merchantAppendix,
    collageParts = [],
    collageManifest = "",
    furnitureMaskBase64,
    placementBlock,
  } = opts;

  const genai = new GoogleGenerativeAI(googleApiKey);
  const model = genai.getGenerativeModel({
    model: "gemini-2.5-flash-image",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    generationConfig: { responseModalities: ["TEXT", "IMAGE"] } as any,
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ],
  });

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

  if (referenceImageBase64 && brief) {
    for (const p of collageParts) {
      parts.push(p);
    }
    if (collageManifest) {
      parts.push({ text: collageManifest });
    }

    parts.push({
      inlineData: {
        mimeType: referenceImageMimeType || "image/jpeg",
        data: referenceImageBase64,
      },
    });

    if (furnitureMaskBase64) {
      parts.push({
        inlineData: {
          mimeType: "image/png",
          data: furnitureMaskBase64,
        },
      });
    }

    const hasMask = !!furnitureMaskBase64;
    parts.push({
      text: buildGeminiRedesignPrompt(brief, roomAnalysis, merchantAppendix, hasMask, placementBlock),
    });
  } else {
    for (const p of collageParts) {
      parts.push(p);
    }
    const preamble = collageManifest ? `${collageManifest}\n\n` : "";
    const merchTxt = merchantAppendix?.trim() ?? "";
    parts.push({
      text: `Generate a photorealistic interior design image based on this description:\n\n${fullPromptFallback}${preamble ? `\n\n${preamble}` : ""}${merchTxt ? `\n\n${merchTxt.slice(0, 3800)}` : ""}`,
    });
  }

  const result = await model.generateContent(parts as Part[]);
  type GenPart = { inlineData?: { data?: unknown; mimeType?: unknown }; text?: string };
  const images: Array<{ base64: string; mimeType: string }> = [];
  const textParts: string[] = [];
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
      } else if (typeof pdata.text === "string" && pdata.text) {
        textParts.push(pdata.text);
      }
    }
  }

  if (images.length === 0) {
    const blockReason = result.response?.promptFeedback?.blockReason;
    const finishReason = result.response?.candidates?.[0]?.finishReason;
    console.error("[generateGeminiInteriorImage] No images returned", {
      blockReason,
      finishReason,
      candidateCount: result.response?.candidates?.length ?? 0,
      textResponse: textParts.join(" ").slice(0, 500),
    });
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

    const hasUserPins = preferredCatalogIds.length > 0;

    /* ── Step 3: Catalog context for Claude ── */
    const catalogCtx = await buildInteriorDesignCatalogContext({
      adminSlug,
      textPrompt,
      roomAnalysis,
      preferredCatalogIds,
    });

    /* ── Step 4: Build Claude director block (pins-only vs full coverage) ── */
    const pinnedSummaries = hasUserPins
      ? preferredCatalogIds
          .map((id) => catalogCtx.summaryById.get(id))
          .filter((x): x is CatalogItemSummary => Boolean(x))
      : [];

    const merchantCatalogDirectorBlock = hasUserPins
      ? [
          buildPinsOnlyCoverageInstructions(pinnedSummaries),
          pinnedSummaries.length > 0
            ? `AVAILABLE PRODUCT CATALOG (pins only — use ONLY these):\n${catalogSummaryToPromptText(pinnedSummaries)}`
            : "",
        ].filter(Boolean).join("\n\n")
      : [
          catalogCtx.coverageInstructions,
          catalogCtx.catalogTextForClaude
            ? `AVAILABLE PRODUCT CATALOG — authoritative merchant SKUs surfaced for relevance ranking (reuse EXACT NAMES in prompts; NEVER invent unrecognized furniture):
${catalogCtx.catalogTextForClaude}`
            : "",
          catalogCtx.catalogTextForClaude
            ? `STRUCTURED FIELD CONSTRAINT: Populate "selected_catalog_ids" honoring distinct coverage target ≥ ${catalogCtx.distinctRequired} UNIQUE ids whenever catalog has enough rows (otherwise ALL rows). Anchored placements target ≈${catalogCtx.anchoredPieces} / ${catalogCtx.estimatedPieces} placements.`
            : "",
        ].filter(Boolean).join("\n\n");

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

    const assistantPlainText = collectAnthropicTextBlocks(claudeResponse.content);
    if (!assistantPlainText) {
      return NextResponse.json({ error: "Design brief step returned no response." }, { status: 500 });
    }

    /* ── Step 5: Parse design brief ── */
    let brief: DesignBrief;
    try {
      const parsedJson = parseDesignBriefJsonFromAssistantText(assistantPlainText);
      brief = normalizeParsedDesignBrief(parsedJson);
    } catch (parseErr: unknown) {
      const detail = parseErr instanceof Error ? parseErr.message : String(parseErr);
      console.error("Interior design generate: failed to parse design brief payload:", detail);
      const userMsg =
        /HTML instead of JSON|proxy or API error page/i.test(detail)
          ? "Design brief step received an invalid response. Check Anthropic API keys and connectivity."
          : "Failed to parse design brief.";
      return NextResponse.json({ error: userMsg }, { status: 500 });
    }

    /* ── Step 6: Resolve product IDs (pins-only vs vector pipeline) ── */
    let mergedProductIds: string[];
    if (hasUserPins) {
      mergedProductIds = dedupeIds(preferredCatalogIds, brief.selectedCatalogIds)
        .filter((id) => catalogCtx.summaryById.has(id));
    } else {
      const slots = deriveRequiredSlots(roomAnalysis, brief);
      const designIntent = brief.fullPrompt || textPrompt;
      const resolved = await resolveMerchantCatalogSlots({
        adminSlug,
        designIntent,
        slots,
        pinnedProductIds: preferredCatalogIds,
        roomAnalysis,
        roomType: roomAnalysis?.room_type,
      });
      mergedProductIds = dedupeIds(
        resolved.ids,
        brief.selectedCatalogIds,
        preferredCatalogIds,
      );
    }

    /* ── Step 6b: Room-appropriate filter ── */
    const roomFilterResult = filterCatalogIdsForRoom(
      mergedProductIds,
      roomAnalysis?.room_type,
      catalogCtx.summaryById,
    );
    mergedProductIds = roomFilterResult.kept;
    if (roomFilterResult.dropped.length > 0) {
      console.log(`Room filter dropped ${roomFilterResult.dropped.length} id(s) for room type "${roomAnalysis?.room_type}":`, roomFilterResult.dropped);
    }

    /* ── Step 7: Build collage inputs from summaryById ── */
    const collageInputs: ProductCollageInput[] = [];
    for (const id of mergedProductIds) {
      const row = catalogCtx.summaryById.get(id);
      if (!row?.primaryImageUrl) continue;
      collageInputs.push({
        id: row.id,
        name: row.name,
        category: row.category,
        imageUrls: [row.primaryImageUrl],
      });
    }

    /* ── Step 8: Build product collages ── */
    const collages = await buildProductCollages(collageInputs);

    /* ── Step 9: Build strict catalog block + collage manifest ── */
    const collageManifest = buildCollageManifestText(collages);
    const strictAppendix = buildStrictMerchantAppendix(collages, catalogCtx.summaryById, hasUserPins);

    const collageParts = collages.map((c) => ({
      inlineData: { mimeType: c.mimeType, data: c.base64 },
    }));

    /* ── Prepare room reference image ── */
    let referenceBase64: string | undefined;
    let referenceImageMimeType: string | undefined;
    if (roomImage) {
      const imageBytes = await roomImage.arrayBuffer();
      referenceBase64 = Buffer.from(imageBytes).toString("base64");
      referenceImageMimeType = roomImage.type || "image/jpeg";
    }

    /* ── Step 10: Build placement block for pinned products ── */
    const placementBlock = hasUserPins
      ? buildPinnedPlacementBlock(collages, catalogCtx.summaryById, roomAnalysis, [])
      : undefined;

    /* ── Step 11: Gemini image generation ── */
    const images = await generateGeminiInteriorImage({
      fullPromptFallback: brief.fullPrompt,
      googleApiKey: googleKey,
      referenceImageBase64: referenceBase64,
      referenceImageMimeType,
      brief: referenceBase64 ? brief : undefined,
      roomAnalysis: referenceBase64 ? roomAnalysis : undefined,
      merchantAppendix: strictAppendix || undefined,
      collageParts,
      collageManifest: collageManifest || undefined,
      furnitureMaskBase64: undefined,
      placementBlock,
    });

    if (images.length === 0) {
      return NextResponse.json(
        { error: "Image generation returned no results. Try rephrasing your request." },
        { status: 500 },
      );
    }

    const sessionId = `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const collageIncludedIds = collages.map((c) => c.productId);

    /* ── Step 12: Return result with resolved product IDs + debug ── */
    return NextResponse.json({
      data: {
        sessionId,
        designBrief: brief,
        resolvedProductIds: mergedProductIds,
        collageIncludedIds,
        droppedCatalogIds: roomFilterResult.dropped,
        geminiProductCount: collages.length,
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
