/** Server-side plan checks against Laravel API. */

export type PublicEntitlements = {
  planTier: string;
  trialEndsAt?: string | null;
  onTrial: boolean;
  aiChatMonthlyLimit: number | null;
  aiChatRemaining: number | null;
  image3dMonthlyLimit: number;
  image3dRemaining: number;
  inFirstImage3dBonusWindow: boolean;
};

function laravelApiBase(): string {
  const raw =
    process.env.LARAVEL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://127.0.0.1:8000/api";
  return raw.replace(/\/$/, "");
}

export async function fetchPublicEntitlements(slug: string): Promise<PublicEntitlements | null> {
  const res = await fetch(`${laravelApiBase()}/public/${encodeURIComponent(slug)}/entitlements`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: PublicEntitlements };
  return json.data ?? null;
}

export async function internalConsumeFeature(
  slug: string,
  feature: "image3d" | "ai_chat",
): Promise<{
  ok: boolean;
  status: number;
  message?: string;
  entitlements?: PublicEntitlements;
}> {
  const key = process.env.INTERNAL_API_KEY ?? "";
  const res = await fetch(`${laravelApiBase()}/internal/usage/consume`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Key": key,
    },
    body: JSON.stringify({ slug, feature }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    message?: string;
    entitlements?: PublicEntitlements;
  };
  if (!res.ok) {
    return { ok: false, status: res.status, message: data.message, entitlements: data.entitlements };
  }
  return { ok: true, status: res.status, entitlements: data.entitlements };
}

/** Reserve one AI chat message for this storefront (server-side metering). */
export async function assertAiChatAllowed(slug: string): Promise<
  | { ok: true }
  | { ok: false; status: number; message: string; entitlements?: PublicEntitlements }
> {
  const key = process.env.INTERNAL_API_KEY ?? "";
  if (!key) {
    const ent = await fetchPublicEntitlements(slug);
    if (!ent) {
      return {
        ok: false,
        status: 503,
        message: "Set INTERNAL_API_KEY (same as Laravel) for AI usage metering.",
      };
    }
    if (ent.aiChatMonthlyLimit != null && (ent.aiChatRemaining ?? 0) <= 0) {
      return {
        ok: false,
        status: 429,
        message: "AI assistant monthly limit reached for this store. Upgrade your plan or wait for the next billing month.",
        entitlements: ent,
      };
    }
    return { ok: true };
  }

  const c = await internalConsumeFeature(slug, "ai_chat");
  if (!c.ok) {
    return {
      ok: false,
      status: c.status,
      message: c.message || "AI chat not available.",
      entitlements: c.entitlements,
    };
  }
  return { ok: true };
}
