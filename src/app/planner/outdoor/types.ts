/**
 * Outdoor bench/chair cushion layout for a placed GLB instance (outdoor planner).
 * Stored on PlacedItem; seeded from catalog `outdoorCushionDefaults` when present.
 */
export type OutdoorSeatLayout = "continuous" | "segmented";

export type OutdoorBackMode = "single" | "perColumn";

export interface OutdoorCushionConfig {
  enabled: boolean;
  seatLayout: OutdoorSeatLayout;
  /** When segmented: widths in meters along seat length; sum should not exceed item width minus gaps. */
  seatSegmentWidthsM: number[];
  gapBetweenSegmentsM: number;
  backMode: OutdoorBackMode;
  seatThicknessM: number;
  backThicknessM: number;
  /** One id for continuous seat or per-segment when segmented. */
  seatMaterialIds: string[];
  /** One id for single back or per column when perColumn. */
  backMaterialIds: string[];
  /** Optional tuning for cushion placement vs GLB bbox (meters). */
  seatSurfaceOffsetM?: number;
  backDepthOffsetM?: number;
  backHeightM?: number;
}

export function defaultOutdoorCushionConfig(partial?: Partial<OutdoorCushionConfig>): OutdoorCushionConfig {
  return {
    enabled: partial?.enabled ?? false,
    seatLayout: partial?.seatLayout ?? "continuous",
    seatSegmentWidthsM: partial?.seatSegmentWidthsM?.length ? [...partial.seatSegmentWidthsM] : [],
    gapBetweenSegmentsM: partial?.gapBetweenSegmentsM ?? 0.01,
    backMode: partial?.backMode ?? "single",
    seatThicknessM: partial?.seatThicknessM ?? 0.06,
    backThicknessM: partial?.backThicknessM ?? 0.05,
    seatMaterialIds: partial?.seatMaterialIds?.length ? [...partial.seatMaterialIds] : [],
    backMaterialIds: partial?.backMaterialIds?.length ? [...partial.backMaterialIds] : [],
    seatSurfaceOffsetM: partial?.seatSurfaceOffsetM,
    backDepthOffsetM: partial?.backDepthOffsetM,
    backHeightM: partial?.backHeightM,
  };
}

/** Merge API JSON from catalog into a full config with sane defaults. */
export function outdoorCushionConfigFromDefaultsJson(
  raw: unknown,
  widthM: number,
  firstUpholsteryId?: string | null,
): OutdoorCushionConfig {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const seatLay = o.seatLayout === "segmented" ? "segmented" : "continuous";
  const widthsRaw = o.seatSegmentWidthsM;
  const widths =
    Array.isArray(widthsRaw) && widthsRaw.every((x) => typeof x === "number")
      ? (widthsRaw as number[])
      : seatLay === "continuous"
        ? [Math.max(0.01, widthM)]
        : [];
  const seatIds = Array.isArray(o.seatMaterialIds)
    ? (o.seatMaterialIds as unknown[]).filter((x): x is string => typeof x === "string")
    : firstUpholsteryId
      ? [firstUpholsteryId]
      : [];
  const backIds = Array.isArray(o.backMaterialIds)
    ? (o.backMaterialIds as unknown[]).filter((x): x is string => typeof x === "string")
    : firstUpholsteryId
      ? [firstUpholsteryId]
      : [];
  const gapDef = typeof o.gapBetweenSegmentsM === "number" ? o.gapBetweenSegmentsM : 0.01;
  const fallbackTwo = (): number[] => {
    const half = (widthM - gapDef) / 2;
    return [Math.max(0.02, half), Math.max(0.02, half)];
  };
  return defaultOutdoorCushionConfig({
    enabled: o.enabled === true,
    seatLayout: seatLay,
    seatSegmentWidthsM:
      seatLay === "continuous"
        ? widths.length
          ? widths
          : [Math.max(0.01, widthM)]
        : widths.length > 0
          ? widths
          : fallbackTwo(),
    gapBetweenSegmentsM: gapDef,
    backMode: o.backMode === "perColumn" ? "perColumn" : "single",
    seatThicknessM: typeof o.seatThicknessM === "number" ? o.seatThicknessM : 0.06,
    backThicknessM: typeof o.backThicknessM === "number" ? o.backThicknessM : 0.05,
    seatMaterialIds: seatIds,
    backMaterialIds: backIds.length ? backIds : [...seatIds],
    seatSurfaceOffsetM: typeof o.seatSurfaceOffsetM === "number" ? o.seatSurfaceOffsetM : undefined,
    backDepthOffsetM: typeof o.backDepthOffsetM === "number" ? o.backDepthOffsetM : undefined,
    backHeightM: typeof o.backHeightM === "number" ? o.backHeightM : undefined,
  });
}
