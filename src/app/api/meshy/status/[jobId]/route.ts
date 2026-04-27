import { NextRequest, NextResponse } from "next/server";

const MESHY_BASE_URL = "https://api.meshy.ai/openapi/v1";

const STATUS_MAP: Record<string, string> = {
  PENDING: "queued",
  IN_PROGRESS: "processing",
  SUCCEEDED: "done",
  FAILED: "failed",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const apiKey = process.env.MESHY_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "MESHY_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const { jobId } = await params;

  try {
    const response = await fetch(`${MESHY_BASE_URL}/image-to-3d/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Meshy API error: ${response.status} - ${errorText}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    const providerStatus = data.status ?? "unknown";
    const status = STATUS_MAP[providerStatus] ?? "processing";
    const glbUrl = data.model_urls?.glb ?? data.model_url ?? null;

    const errorMessage =
      status === "failed"
        ? data.task_error?.message || data.error || "Generation failed"
        : undefined;

    return NextResponse.json({ status, glbUrl, error: errorMessage });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
