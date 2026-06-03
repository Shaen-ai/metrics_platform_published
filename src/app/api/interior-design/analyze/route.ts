import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildAnalysisSystemPrompt, type RoomAnalysis } from "@/lib/interiorDesignPrompts";
import { withRetry } from "@/lib/aiRetry";
import { PUBLIC_AI_GENERIC_ERROR, PUBLIC_AI_UNAVAILABLE } from "@/lib/tunzoneAi";
import { optimizeImageBufferForAi } from "@/lib/optimizeImageForAi";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const adminSlug = (formData.get("adminSlug") as string) || "demo";

    const roomImages = formData.getAll("roomImages") as File[];
    const legacySingle = formData.get("roomImage") as File | null;
    if (legacySingle && roomImages.length === 0) {
      roomImages.push(legacySingle);
    }

    if (roomImages.length === 0) {
      return NextResponse.json({ error: "At least one room image is required." }, { status: 400 });
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return NextResponse.json({ error: PUBLIC_AI_UNAVAILABLE }, { status: 503 });
    }

    const imageBlocks: Anthropic.ImageBlockParam[] = [];
    for (const img of roomImages) {
      const bytes = await img.arrayBuffer();
      const optimized = await optimizeImageBufferForAi(Buffer.from(bytes));
      imageBlocks.push({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: optimized.base64 },
      });
    }

    const isMulti = imageBlocks.length > 1;

    const client = new Anthropic({ apiKey: anthropicKey });

    const content: Anthropic.ContentBlockParam[] = [
      ...imageBlocks,
      {
        type: "text",
        text: buildAnalysisSystemPrompt(isMulti),
      },
    ];

    const response = await withRetry(
      () => client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        messages: [{ role: "user", content }],
      }),
      "Room Analysis",
    );

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No analysis returned." }, { status: 500 });
    }

    let analysis: RoomAnalysis;
    try {
      let rawText = textBlock.text;
      const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        rawText = codeBlockMatch[1];
      }
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      analysis = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch {
      console.error("Interior design analyze: failed to parse room analysis payload");
      return NextResponse.json({ error: "Failed to parse room analysis." }, { status: 500 });
    }

    return NextResponse.json({ data: analysis, adminSlug });
  } catch (error: any) {
    console.error("Interior design analyze error:", error);
    const isOverloaded =
      error?.status === 529 || error?.error?.type === "overloaded_error" ||
      (typeof error?.message === "string" && /overloaded/i.test(error.message));
    if (isOverloaded) {
      return NextResponse.json(
        { error: "The service is temporarily overloaded. Please wait a moment and try again." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: PUBLIC_AI_GENERIC_ERROR }, { status: 500 });
  }
}
