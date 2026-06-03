import { publicApiUrl } from "@/lib/publicEnv";

export interface RequiredSlot {
  family: string;
  subtype?: string;
  quantity?: number;
  placement?: string;
}

export interface DesignConstraints {
  materials?: string[];
  colors?: string[];
  style_keywords?: string[];
  max_price?: number;
}

export interface ResolvedCatalogSlot {
  slot: string;
  family: string;
  subtype?: string | null;
  quantity: number;
  product_ids: string[];
  scores: number[];
  fallback_stage: number | null;
  top_score: number;
  qdrant_candidates?: number;
  rerank_drop_rate?: number;
}

export interface ResolveMerchantSlotsResult {
  ids: string[];
  slots: ResolvedCatalogSlot[];
  metrics?: {
    slot_success_rate?: number;
    fallback_usage?: number;
    rerank_drop_rate?: number;
  };
}

export async function resolveMerchantCatalogSlots(opts: {
  adminSlug: string;
  designIntent: string;
  slots: RequiredSlot[];
  pinnedProductIds?: string[];
  roomAnalysis?: {
    estimated_dimensions?: { width?: number; depth?: number; height?: number };
  } | null;
  constraints?: DesignConstraints;
  roomType?: string;
}): Promise<ResolveMerchantSlotsResult> {
  const empty: ResolveMerchantSlotsResult = { ids: [], slots: [] };

  let designIntent = opts.designIntent.trim();
  if (designIntent.length < 8) {
    designIntent = `${designIntent} interior design`.trim();
  }

  const body: Record<string, unknown> = {
    design_intent: designIntent,
    slots: opts.slots.map((s) => ({
      family: s.family,
      subtype: s.subtype,
      quantity: s.quantity ?? 1,
      placement: s.placement,
    })),
    pinnedIds: opts.pinnedProductIds ?? [],
    constraints: opts.constraints ?? {},
  };

  if (opts.roomType) {
    body.room_type = opts.roomType;
  }

  const room = opts.roomAnalysis?.estimated_dimensions;
  if (room) {
    body.room_dimensions = {
      width_m: room.width,
      depth_m: room.depth,
      height_m: room.height,
    };
  }

  try {
    const slug = encodeURIComponent(opts.adminSlug);
    const res = await fetch(
      `${publicApiUrl}/public/${slug}/catalog/resolve-slots`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      },
    );

    if (!res.ok) {
      console.warn(
        "resolveMerchantCatalogSlots failed:",
        res.status,
        await res.text().catch(() => ""),
      );
      return empty;
    }

    const json = (await res.json()) as {
      data?: {
        ids?: string[];
        slots?: ResolvedCatalogSlot[];
        metrics?: ResolveMerchantSlotsResult["metrics"];
      };
    };

    return {
      ids: Array.isArray(json.data?.ids) ? json.data!.ids! : [],
      slots: Array.isArray(json.data?.slots) ? json.data!.slots! : [],
      metrics: json.data?.metrics,
    };
  } catch (e) {
    console.warn("resolveMerchantCatalogSlots error:", e);
    return empty;
  }
}
