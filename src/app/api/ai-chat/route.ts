import { NextRequest, NextResponse } from "next/server";
import { assertAiChatAllowed } from "@/lib/laravelPlan";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface AIResponse {
  action?: "create" | "modify" | "delete" | "clear" | "info";
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

    // Get API key from environment or use a default
    const apiKey = process.env.OPENAI_API_KEY || process.env.CURSOR_API_KEY;
    const apiUrl = process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions";
    const model = process.env.AI_MODEL || "gpt-4o-mini";

    // Debug logging (remove in production or use proper logging)
    if (process.env.NODE_ENV === "development") {
      console.log("API Config:", {
        hasApiKey: !!apiKey,
        apiUrl,
        model,
        keyPrefix: apiKey ? `${apiKey.substring(0, 10)}...` : "none",
      });
    }

    if (!apiKey) {
      // Fallback to a simple rule-based system if no API key
      return NextResponse.json({
        message: "AI API key not configured. Please set OPENAI_API_KEY or CURSOR_API_KEY in your environment variables. Make sure to restart your dev server after adding the key.",
        action: "info",
      });
    }

    // Prepare system prompt
    const systemPrompt = `You are an AI assistant helping users design furniture in a 2D/3D editor. 
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
      ...(messages as ChatMessage[]),
    ];

    // Call AI API
    const requestBody: any = {
      model,
      messages: chatMessages,
      temperature: 0.7,
    };

    // Only add response_format if using OpenAI (it supports JSON mode)
    if (apiUrl.includes("openai.com")) {
      requestBody.response_format = { type: "json_object" };
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
      let errorMessage = "Failed to get AI response.";
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorData.message || errorMessage;
        console.error("AI API Error:", errorData);
      } catch (e) {
        const errorText = await response.text();
        console.error("AI API Error (text):", errorText);
        errorMessage = `API Error: ${response.status} ${response.statusText}. ${errorText.substring(0, 200)}`;
      }
      
      return NextResponse.json(
        {
          message: errorMessage,
          action: "info",
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    const aiMessage = data.choices?.[0]?.message?.content;

    if (!aiMessage) {
      return NextResponse.json(
        {
          message: "No response from AI.",
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
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json(
      {
        message: `An error occurred: ${errorMessage}. Please check your API key and try again.`,
        action: "info",
      },
      { status: 500 }
    );
  }
}
