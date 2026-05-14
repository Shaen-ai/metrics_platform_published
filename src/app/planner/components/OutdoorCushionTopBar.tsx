"use client";

import { useCallback, useState } from "react";
import type { PlannerSwatchMaterial } from "@/lib/plannerMaterials";
import type { OutdoorCushionConfig } from "../outdoor/types";
import { outdoorCushionConfigFromDefaultsJson } from "../outdoor/types";
import { equalSegmentWidths } from "../outdoor/cushionLayout";

function replicateIds(primary: string | undefined, count: number): string[] {
  const id = primary ?? "";
  if (!id) return [];
  return Array.from({ length: Math.max(1, count) }, () => id);
}

function cushionFabricSummary(
  materialIds: string[],
  swatches: PlannerSwatchMaterial[],
): { primaryLabel: string; hint?: string } {
  if (swatches.length === 0) {
    return { primaryLabel: "No fabrics", hint: "Add upholstery in catalog settings." };
  }
  if (materialIds.length === 0) {
    return { primaryLabel: "Choose fabric", hint: "Tap a swatch below." };
  }
  const first = materialIds[0];
  if (!first) return { primaryLabel: "Choose fabric" };
  const uniform = materialIds.every((id) => id === first);
  const sw = swatches.find((s) => s.id === first);
  const name = sw?.name?.trim() || "Fabric";
  if (!uniform) {
    return { primaryLabel: "Mixed fabrics", hint: "Segments or columns use different fabrics." };
  }
  return { primaryLabel: name };
}

export default function OutdoorCushionTopBar({
  itemId,
  catalogDefaults,
  widthM,
  upholSwatches,
  cushionCfg,
  onSetConfig,
}: {
  itemId: string;
  catalogDefaults: Record<string, unknown> | null | undefined;
  widthM: number;
  upholSwatches: PlannerSwatchMaterial[];
  cushionCfg: OutdoorCushionConfig | undefined;
  onSetConfig: (id: string, config: OutdoorCushionConfig) => void;
}) {
  const firstId = upholSwatches[0]?.id ?? "";

  const ensureConfig = useCallback((): OutdoorCushionConfig => {
    if (cushionCfg) return { ...cushionCfg };
    return outdoorCushionConfigFromDefaultsJson(catalogDefaults ?? null, widthM, firstId || null);
  }, [cushionCfg, catalogDefaults, widthM, firstId]);

  const segmentCount =
    cushionCfg?.seatLayout === "segmented" ? Math.max(2, cushionCfg.seatSegmentWidthsM.length) : 2;

  const onEnable = useCallback(
    (enabled: boolean) => {
      const base = ensureConfig();
      if (enabled) {
        const gap = base.gapBetweenSegmentsM;
        const seatW =
          base.seatLayout === "continuous"
            ? [widthM]
            : equalSegmentWidths(
                widthM,
                Math.max(2, base.seatSegmentWidthsM.length || 2),
                gap,
              );
        const nSeat = seatW.length;
        let nBack = 1;
        if (base.backMode === "perColumn") {
          nBack = base.seatLayout === "segmented" ? nSeat : Math.max(2, base.backMaterialIds.length || 3);
        }
        onSetConfig(itemId, {
          ...base,
          enabled: true,
          seatSegmentWidthsM: seatW,
          seatMaterialIds:
            base.seatMaterialIds.length >= nSeat
              ? base.seatMaterialIds.slice(0, nSeat)
              : replicateIds(base.seatMaterialIds[0] ?? firstId, nSeat),
          backMaterialIds:
            base.backMaterialIds.length >= nBack
              ? base.backMaterialIds.slice(0, nBack)
              : replicateIds(base.backMaterialIds[0] ?? base.seatMaterialIds[0] ?? firstId, nBack),
        });
      } else {
        onSetConfig(itemId, { ...base, enabled: false });
      }
    },
    [ensureConfig, itemId, onSetConfig, widthM, firstId],
  );

  const setSeatLayout = useCallback(
    (layout: OutdoorCushionConfig["seatLayout"]) => {
      const base = ensureConfig();
      const gap = base.gapBetweenSegmentsM;
      const seatW =
        layout === "continuous"
          ? [widthM]
          : equalSegmentWidths(widthM, Math.max(2, base.seatSegmentWidthsM.length || 2), gap);
      const n = seatW.length;
      const seatMat = replicateIds(base.seatMaterialIds[0] ?? firstId, n);
      let backIds = [...base.backMaterialIds];
      if (base.backMode === "perColumn") {
        const nBack = layout === "segmented" ? n : Math.max(2, backIds.length || 3);
        backIds = replicateIds(backIds[0] ?? firstId, nBack);
      }
      onSetConfig(itemId, {
        ...base,
        seatLayout: layout,
        seatSegmentWidthsM: seatW,
        seatMaterialIds: seatMat,
        backMaterialIds: backIds,
      });
    },
    [ensureConfig, itemId, onSetConfig, widthM, firstId],
  );

  const setSegmentCount = useCallback(
    (n: number) => {
      const base = ensureConfig();
      if (base.seatLayout !== "segmented") return;
      const count = Math.min(8, Math.max(2, Math.floor(n)));
      const seatW = equalSegmentWidths(widthM, count, base.gapBetweenSegmentsM);
      const seatMat = replicateIds(base.seatMaterialIds[0] ?? firstId, count);
      let backIds = [...base.backMaterialIds];
      if (base.backMode === "perColumn") {
        backIds = replicateIds(backIds[0] ?? firstId, count);
      }
      onSetConfig(itemId, {
        ...base,
        seatSegmentWidthsM: seatW,
        seatMaterialIds: seatMat,
        backMaterialIds: backIds,
      });
    },
    [ensureConfig, itemId, onSetConfig, widthM, firstId],
  );

  const setBackMode = useCallback(
    (mode: OutdoorCushionConfig["backMode"]) => {
      const base = ensureConfig();
      const nSeat = base.seatSegmentWidthsM.length || 1;
      const nBack =
        mode === "single"
          ? 1
          : base.seatLayout === "segmented"
            ? Math.max(2, nSeat)
            : Math.max(2, base.backMaterialIds.length || 3);
      const backIds = replicateIds(
        base.backMaterialIds[0] ?? base.seatMaterialIds[0] ?? firstId,
        nBack,
      );
      onSetConfig(itemId, { ...base, backMode: mode, backMaterialIds: backIds });
    },
    [ensureConfig, itemId, onSetConfig, firstId],
  );

  const applySeatMat = useCallback(
    (matId: string) => {
      const base = ensureConfig();
      const n = base.seatLayout === "continuous" ? 1 : base.seatSegmentWidthsM.length;
      onSetConfig(itemId, { ...base, seatMaterialIds: Array.from({ length: n }, () => matId) });
    },
    [ensureConfig, itemId, onSetConfig],
  );

  const applyBackMat = useCallback(
    (matId: string) => {
      const base = ensureConfig();
      const n =
        base.backMode === "single"
          ? 1
          : base.seatLayout === "segmented"
            ? base.seatSegmentWidthsM.length
            : Math.max(2, base.backMaterialIds.length || 3);
      onSetConfig(itemId, { ...base, backMaterialIds: Array.from({ length: n }, () => matId) });
    },
    [ensureConfig, itemId, onSetConfig],
  );

  const setGapCm = useCallback(
    (cm: number) => {
      const base = ensureConfig();
      const gapM = Math.max(0, cm) / 100;
      const n = base.seatLayout === "segmented" ? Math.max(2, base.seatSegmentWidthsM.length) : 1;
      const seatW =
        base.seatLayout === "continuous" ? [widthM] : equalSegmentWidths(widthM, n, gapM);
      onSetConfig(itemId, { ...base, gapBetweenSegmentsM: gapM, seatSegmentWidthsM: seatW });
    },
    [ensureConfig, itemId, onSetConfig, widthM],
  );

  const seatFabricSummary = cushionCfg
    ? cushionFabricSummary(cushionCfg.seatMaterialIds, upholSwatches)
    : null;
  const backFabricSummary = cushionCfg
    ? cushionFabricSummary(cushionCfg.backMaterialIds, upholSwatches)
    : null;

  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleEnableChange = useCallback(
    (checked: boolean) => {
      if (!checked) setSettingsOpen(false);
      onEnable(checked);
    },
    [onEnable],
  );

  const enabled = cushionCfg?.enabled ?? false;

  return (
    <div className="topbar-outdoor-cushions">
      <div className="topbar-outdoor-cushions-toolbar">
        <span className="topbar-outdoor-cushions-title-row">
          <span className="topbar-finish-label">Cushions</span>
          <span className="topbar-outdoor-cushions-emdash" aria-hidden="true">
            —
          </span>
          <label className="topbar-outdoor-toggle">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => handleEnableChange(e.target.checked)}
            />
            <span>{enabled ? "On" : "Off"}</span>
          </label>
        </span>
        {enabled && (
          <button
            type="button"
            className="topbar-outdoor-settings-btn"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((v) => !v)}
          >
            {settingsOpen ? "Hide settings" : "Settings"}
          </button>
        )}
      </div>
      {enabled && settingsOpen && cushionCfg && (
        <div className="topbar-outdoor-cushions-body">
          <div className="topbar-outdoor-block">
            <div className="topbar-outdoor-block-title">Layout</div>
            <div className="topbar-outdoor-layout-row">
              <label className="topbar-outdoor-field">
                <span>Seat</span>
                <select
                  value={cushionCfg.seatLayout}
                  onChange={(e) =>
                    setSeatLayout(e.target.value === "segmented" ? "segmented" : "continuous")
                  }
                >
                  <option value="continuous">One piece</option>
                  <option value="segmented">Segmented</option>
                </select>
              </label>
              {cushionCfg.seatLayout === "segmented" && (
                <>
                  <label className="topbar-outdoor-field">
                    <span>Parts</span>
                    <input
                      type="number"
                      min={2}
                      max={8}
                      value={segmentCount}
                      onChange={(e) => setSegmentCount(Number(e.target.value))}
                    />
                  </label>
                  <label className="topbar-outdoor-field">
                    <span>Gap (cm)</span>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      step={0.5}
                      value={Math.round((cushionCfg.gapBetweenSegmentsM ?? 0.01) * 1000) / 10}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isNaN(v)) return;
                        setGapCm(v);
                      }}
                    />
                  </label>
                </>
              )}
              <label className="topbar-outdoor-field">
                <span>Back</span>
                <select
                  value={cushionCfg.backMode}
                  onChange={(e) =>
                    setBackMode(e.target.value === "perColumn" ? "perColumn" : "single")
                  }
                >
                  <option value="single">One piece</option>
                  <option value="perColumn">Per column</option>
                </select>
              </label>
            </div>
          </div>

          <div className="topbar-outdoor-block">
            <div className="topbar-outdoor-block-title">Fabrics</div>

            <div className="topbar-outdoor-fabric-row">
              <div className="topbar-outdoor-fabric-row-head">
                <span className="topbar-finish-label">Seat fabric</span>
                <span
                  className="topbar-outdoor-fabric-name"
                  title={seatFabricSummary?.hint ?? seatFabricSummary?.primaryLabel}
                >
                  {seatFabricSummary?.primaryLabel ?? "—"}
                </span>
              </div>
              <div className="topbar-finish-swatches topbar-outdoor-fabric-swatches" role="radiogroup" aria-label="Seat fabric">
                {upholSwatches.length === 0 ? (
                  <span className="topbar-outdoor-fabric-empty">No fabrics.</span>
                ) : (
                  upholSwatches.map((m) => {
                    const active =
                      cushionCfg.seatMaterialIds.length > 0 &&
                      cushionCfg.seatMaterialIds.every((id) => id === m.id);
                    return (
                      <button
                        key={`seat-${m.id}`}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className={`topbar-finish-swatch${active ? " selected" : ""}`}
                        title={m.name}
                        aria-label={`Seat fabric: ${m.name}`}
                        onClick={() => applySeatMat(m.id)}
                      >
                        {m.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.imageUrl} alt="" className="topbar-finish-swatch-img" />
                        ) : (
                          <span className="topbar-finish-swatch-color" style={{ background: m.color }} />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="topbar-outdoor-fabric-row">
              <div className="topbar-outdoor-fabric-row-head">
                <span className="topbar-finish-label">Back fabric</span>
                <span
                  className="topbar-outdoor-fabric-name"
                  title={backFabricSummary?.hint ?? backFabricSummary?.primaryLabel}
                >
                  {backFabricSummary?.primaryLabel ?? "—"}
                </span>
              </div>
              <div className="topbar-finish-swatches topbar-outdoor-fabric-swatches" role="radiogroup" aria-label="Back fabric">
                {upholSwatches.length === 0 ? (
                  <span className="topbar-outdoor-fabric-empty">No fabrics.</span>
                ) : (
                  upholSwatches.map((m) => {
                    const active =
                      cushionCfg.backMaterialIds.length > 0 &&
                      cushionCfg.backMaterialIds.every((id) => id === m.id);
                    return (
                      <button
                        key={`back-${m.id}`}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className={`topbar-finish-swatch${active ? " selected" : ""}`}
                        title={m.name}
                        aria-label={`Back fabric: ${m.name}`}
                        onClick={() => applyBackMat(m.id)}
                      >
                        {m.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.imageUrl} alt="" className="topbar-finish-swatch-img" />
                        ) : (
                          <span className="topbar-finish-swatch-color" style={{ background: m.color }} />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
