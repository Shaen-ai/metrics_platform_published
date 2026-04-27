import { NextRequest, NextResponse } from "next/server";

const MESHY_BASE_URL = "https://api.meshy.ai/openapi/v1";

export async function POST(request: NextRequest) {
  const apiKey = process.env.MESHY_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "MESHY_API_KEY is not configured" },
      { status: 500 },
    );
  }

  try {
    const body = await request.json();
    const { imageBase64, mimeType, texturePrompt } = body as {
      imageBase64: string;
      mimeType: string;
      texturePrompt?: string;
    };

    if (!imageBase64 || !mimeType) {
      return NextResponse.json(
        { error: "imageBase64 and mimeType are required" },
        { status: 400 },
      );
    }

    const imageUrl = `data:${mimeType};base64,${imageBase64}`;

    const payload: Record<string, unknown> = {
      image_url: imageUrl,
      should_texture: true,
      enable_pbr: false,
      should_remesh: true,
      topology: "triangle",
      target_polycount: 5000,
      target_formats: ["glb"],
    };

    if (texturePrompt && texturePrompt.trim()) {
      payload.texture_prompt = texturePrompt.slice(0, 600);
    }

    const response = await fetch(`${MESHY_BASE_URL}/image-to-3d`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Meshy API error: ${response.status} - ${errorText}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    const jobId = data.result;

    return NextResponse.json({ jobId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
