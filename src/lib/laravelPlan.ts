/** Server-side plan checks against Laravel API. */

import { getPublicApiUrl } from "./publicEnv";

export type PublicEntitlements = {
  planTier: string;
  aiChatMonthlyLimit: number | null;
  aiChatRemaining: number | null;
  image3dMonthlyLimit: number;
  image3dRemaining: number;
  inFirstImage3dBonusWindow: boolean;
  interiorDesignMonthlyLimit?: number | null;
  interiorDesignRemaining?: number | null;
};

function laravelApiBase(): string {
  const raw = process.env.LARAVEL_API_URL || getPublicApiUrl();
  return raw.replace(/\/$/, "");
}

type LoadEntitlementsResult = {
  ent: PublicEntitlements | null;
  httpStatus: number;
  laravelMessage?: string;
};

async function loadPublicEntitlements(slug: string): Promise<LoadEntitlementsResult> {
  try {
    const res = await fetch(`${laravelApiBase()}/public/${encodeURIComponent(slug)}/entitlements`, {
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: PublicEntitlements;
      message?: string;
    };
    const laravelMessage = typeof json.message === "string" ? json.message : undefined;
    if (!res.ok) {
      return { ent: null, httpStatus: res.status, laravelMessage };
    }
    return { ent: json.data ?? null, httpStatus: res.status, laravelMessage };
  } catch (err) {
    console.warn("[laravelPlan] fetchPublicEntitlements failed:", err);
    return { ent: null, httpStatus: 0, laravelMessage: undefined };
  }
}

export async function fetchPublicEntitlements(slug: string): Promise<PublicEntitlements | null> {
  const r = await loadPublicEntitlements(slug);
  return r.ent;
}

function httpStatusForGate(r: LoadEntitlementsResult): number {
  if (r.httpStatus === 403 || r.httpStatus === 404) return r.httpStatus;
  return 503;
}

function messageWhenNoEntitlements(
  slug: string,
  r: LoadEntitlementsResult,
  kind: "assistant" | "interior",
): string {
  const generic =
    kind === "interior"
      ? "This feature isn’t configured for this storefront yet."
      : "This assistant isn’t configured for this storefront yet.";

  if (r.httpStatus === 0) {
    return "Cannot reach Tunzone API to verify usage. Check LARAVEL_API_URL / NEXT_PUBLIC_API_URL and server network.";
  }

  if (r.laravelMessage && r.laravelMessage !== "Not found.") {
    return r.laravelMessage;
  }

  if (r.httpStatus === 404 || r.laravelMessage === "Not found.") {
    const slugHint =
      kind === "interior"
        ? "Set INTERIOR_DESIGN_ADMIN_SLUG or NEXT_PUBLIC_INTERIOR_ADMIN_SLUG to your merchant slug"
        : "Set NEXT_PUBLIC_INTERIOR_ADMIN_SLUG (or INTERIOR_DESIGN_ADMIN_SLUG for Vista) to your merchant slug";
    return `No published storefront “${slug}”. ${slugHint} (published + subscribed in Tunzone).`;
  }

  return generic;
}

export async function internalConsumeFeature(
  slug: string,
  feature: "image3d" | "ai_chat" | "interior_design",
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
    const loaded = await loadPublicEntitlements(slug);
    const ent = loaded.ent;
    if (!ent) {
      return {
        ok: false,
        status: httpStatusForGate(loaded),
        message: messageWhenNoEntitlements(slug, loaded, "assistant"),
      };
    }
    if (ent.aiChatMonthlyLimit != null && (ent.aiChatRemaining ?? 0) <= 0) {
      return {
        ok: false,
        status: 429,
        message: "Tunzone chat monthly limit reached for this store. Upgrade your plan or wait for the next billing month.",
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
      message: c.message || "Tunzone chat isn’t available right now.",
      entitlements: c.entitlements,
    };
  }
  return { ok: true };
}

/** Reserve one interior-design generation for this storefront. */
export async function assertInteriorDesignAllowed(slug: string): Promise<
  | { ok: true }
  | { ok: false; status: number; message: string; entitlements?: PublicEntitlements }
> {
  const key = process.env.INTERNAL_API_KEY ?? "";
  if (!key) {
    const loaded = await loadPublicEntitlements(slug);
    const ent = loaded.ent;
    if (!ent) {
      return {
        ok: false,
        status: httpStatusForGate(loaded),
        message: messageWhenNoEntitlements(slug, loaded, "interior"),
      };
    }
    if (ent.interiorDesignMonthlyLimit != null && (ent.interiorDesignRemaining ?? 0) <= 0) {
      return {
        ok: false,
        status: 429,
        message: "Interior design monthly limit reached. Upgrade your plan or wait for the next billing month.",
        entitlements: ent,
      };
    }
    return { ok: true };
  }

  const c = await internalConsumeFeature(slug, "interior_design");
  if (!c.ok) {
    return {
      ok: false,
      status: c.status,
      message: c.message || "Interior preview isn’t available right now.",
      entitlements: c.entitlements,
    };
  }
  return { ok: true };
}
