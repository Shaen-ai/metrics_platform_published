import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side fetch of a Meshy-hosted GLB URL (avoids browser CORS issues).
 * Restricts target URLs to known CDNs used by Meshy.
 */
function isAllowedGlbUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    return (
      h.includes("meshy") ||
      h.includes("amazonaws") ||
      h.includes("cloudfront") ||
      h.endsWith(".blob.core.windows.net")
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const url = typeof body.url === "string" ? body.url : "";
    if (!url || !isAllowedGlbUrl(url)) {
      return NextResponse.json({ error: "Invalid or disallowed URL" }, { status: 400 });
    }

    const res = await fetch(url, {
      signal: AbortSignal.timeout(120000),
      headers: { Accept: "model/gltf-binary,*/*" },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to download GLB (${res.status})` },
        { status: 502 },
      );
    }

    const buf = await res.arrayBuffer();
    const maxBytes = 80 * 1024 * 1024;
    if (buf.byteLength > maxBytes) {
      return NextResponse.json({ error: "GLB file too large" }, { status: 413 });
    }

    return new Response(buf, {
      headers: {
        "Content-Type": "model/gltf-binary",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Download failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
