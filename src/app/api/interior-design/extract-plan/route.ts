import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildExtractPlanPrompt } from "@/lib/interiorDesignPrompts";
import { buildInteriorDesignCatalogContext, catalogSummaryToPromptText } from "@/lib/catalogForPrompts";
import { PUBLIC_AI_GENERIC_ERROR, PUBLIC_AI_UNAVAILABLE } from "@/lib/tunzoneAi";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageBase64, mimeType = "image/png", adminSlug = "demo" } = body as {
      imageBase64: string;
      mimeType?: string;
      adminSlug?: string;
    };

    if (!imageBase64) {
      return NextResponse.json({ error: "Image data is required." }, { status: 400 });
    }

    const googleKey = process.env.GOOGLE_AI_API_KEY;
    if (!googleKey) {
      return NextResponse.json({ error: PUBLIC_AI_UNAVAILABLE }, { status: 503 });
    }

    const catalogCtx = await buildInteriorDesignCatalogContext({
      adminSlug,
      textPrompt: "",
      roomAnalysis: null,
      preferredCatalogIds: [],
    });
    const catalogText = catalogSummaryToPromptText(catalogCtx.summariesForDirector);

    const genai = new GoogleGenerativeAI(googleKey);
    const model = genai.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent([
      { inlineData: { mimeType, data: imageBase64 } } as any,
      { text: buildExtractPlanPrompt(catalogText || undefined) },
    ] as any);

    const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return NextResponse.json({ error: "No extraction result returned." }, { status: 500 });
    }

    let plan: {
      room: { width: number; depth: number; height: number };
      items: Array<{
        id: string;
        name: string;
        category: string;
        width_m: number;
        depth_m: number;
        height_m: number;
        color: string;
        position: { x: number; z: number };
        catalog_id?: string | null;
      }>;
      estimated_total_price_usd: number;
    };

    try {
      let rawText = text;
      const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        rawText = codeBlockMatch[1];
      }
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      plan = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch {
      console.error("Interior design extract-plan: failed to parse furniture plan payload");
      return NextResponse.json({ error: "Failed to parse furniture plan." }, { status: 500 });
    }

    return NextResponse.json({
      data: {
        request_id: `extract-${Date.now()}`,
        intent: { source: "interior-design-image" },
        furniture_plan: {
          room: plan.room,
          items: plan.items,
        },
        modules: [],
        estimated_price: plan.estimated_total_price_usd,
      },
      adminSlug,
    });
  } catch (error) {
    console.error("Interior design extract-plan error:", error);
    return NextResponse.json({ error: PUBLIC_AI_GENERIC_ERROR }, { status: 500 });
  }
}
