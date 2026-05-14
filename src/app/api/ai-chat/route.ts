import { NextRequest, NextResponse } from "next/server";
import { assertAiChatAllowed } from "@/lib/laravelPlan";
import {
  isIdentityOrMetaQuestion,
  PUBLIC_AI_GENERIC_ERROR,
  PUBLIC_AI_UNAVAILABLE,
  TUNZONE_CHAT_IDENTITY_MESSAGE,
} from "@/lib/tunzoneAi";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface AIResponse {
  action?: "create" | "modify" | "delete" | "clear" | "info";
  code?: string;
  objects?: Array<{
    type: "rect" | "circle";
    name: string;
    width?: number;
    height?: number;
    depth?: number;
    color?: string;
    x?: number;
    y?: number;
  }>;
  message: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, currentObjects, adminSlug = "demo" } = body as {
      messages?: unknown;
      currentObjects?: unknown;
      adminSlug?: string;
    };

    const gate = await assertAiChatAllowed(adminSlug);
    if (!gate.ok) {
      return NextResponse.json(
        { message: gate.message, action: "info" },
        { status: gate.status },
      );
    }

    if (!Array.isArray(messages)) {
      return NextResponse.json(
        { message: "Invalid messages.", action: "info" },
        { status: 400 },
      );
    }

    const normalizedMsgs = messages as ChatMessage[];
    const lastUser = [...normalizedMsgs].reverse().find((m) => m.role === "user");
    if (lastUser?.content && isIdentityOrMetaQuestion(lastUser.content)) {
      return NextResponse.json({
        action: "info",
        message: TUNZONE_CHAT_IDENTITY_MESSAGE,
      });
    }

    const apiKey = process.env.OPENAI_API_KEY || process.env.CURSOR_API_KEY;
    const apiUrl = process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions";
    const model = process.env.AI_MODEL || "gpt-4o-mini";

    if (process.env.NODE_ENV === "development") {
      console.log("[ai-chat] configured:", !!apiKey);
    }

    if (!apiKey) {
      return NextResponse.json({
        action: "info",
        code: "SERVICE_UNAVAILABLE",
        message: PUBLIC_AI_UNAVAILABLE,
      });
    }

    const systemPrompt = `You are Tunzone's chat — the in-app assistant for this furniture design editor (2D/3D canvas).

IDENTITY (mandatory): If the user asks who you are, what model you are, what company built you, or any similar question, your reply in the "message" field must briefly say you are Tunzone's chat for this workspace. Never name or allude to external AI vendors, products, or base models. Never quote environment variable names or API details.

You can create, modify, and delete objects on a canvas.

Available actions:
- create: Add new objects (rectangles or circles) with dimensions
- modify: Change properties of existing objects
- delete: Remove objects
- clear: Clear all objects
- info: Provide information

Current objects on canvas: ${JSON.stringify((currentObjects as unknown) || [])}

When creating objects, use these defaults:
- Dimensions should be in centimeters (cm)
- Colors should be hex codes (e.g., #3b82f6 for blue)
- Position coordinates are in pixels (0-800 for x, 0-600 for y)

Respond ONLY with valid JSON in this format:
{
  "action": "create" | "modify" | "delete" | "clear" | "info",
  "objects": [{
    "type": "rect" | "circle",
    "name": "string",
    "width": number (in cm),
    "height": number (in cm),
    "depth": number (in cm),
    "color": "hex color",
    "x": number (pixels),
    "y": number (pixels)
  }],
  "message": "explanation of what you did"
}

If the user asks to create something, generate appropriate dimensions and colors.`;

    const chatMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...normalizedMsgs,
    ];

    // Call AI API
    const requestBody: any = {
      model,
      messages: chatMessages,
      temperature: 0.7,
    };

    try {
      const host = new URL(apiUrl).hostname;
      if (host.endsWith("openai.com")) {
        requestBody.response_format = { type: "json_object" };
      }
    } catch {
      /* ignore invalid AI_API_URL */
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      try {
        const errorData = await response.json();
        console.error("AI API Error:", errorData);
      } catch {
        const errorText = await response.text();
        console.error("AI API Error (text):", errorText.slice(0, 500));
      }

      return NextResponse.json(
        {
          message: PUBLIC_AI_GENERIC_ERROR,
          action: "info",
          code: "UPSTREAM_ERROR",
        },
        { status: response.status },
      );
    }

    const data = await response.json();
    const aiMessage = data.choices?.[0]?.message?.content;

    if (!aiMessage) {
      return NextResponse.json(
        {
          message: "No response from the assistant.",
          action: "info",
        },
        { status: 500 }
      );
    }

    // Parse AI response
    let aiResponse: AIResponse;
    try {
      aiResponse = JSON.parse(aiMessage);
    } catch (e) {
      // If not JSON, try to extract JSON from the response
      const jsonMatch = aiMessage.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiResponse = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: create a simple response
        aiResponse = {
          action: "info",
          message: aiMessage,
        };
      }
    }

    return NextResponse.json(aiResponse);
  } catch (error) {
    console.error("Error in AI chat:", error);
    return NextResponse.json(
      {
        message: PUBLIC_AI_GENERIC_ERROR,
        action: "info",
        code: "INTERNAL_ERROR",
      },
      { status: 500 },
    );
  }
}
