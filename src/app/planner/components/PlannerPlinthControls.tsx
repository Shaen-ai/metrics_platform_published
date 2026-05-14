"use client";

import { CatalogSurfacePicker } from "./CatalogSurfacePicker";
import type { PlannerPlinthSurfacePatch } from "../types";

type Props = {
  enabled?: boolean;
  heightCm?: number;
  depthCm?: number;
  color?: string;
  mode?: "color" | "catalog";
  textureUrl?: string;
  materialName?: string;
  onPatch: (patch: PlannerPlinthSurfacePatch) => void;
};

export function PlannerPlinthControls({
  enabled = true,
  heightCm = 8,
  depthCm = 1.2,
  color = "#f0eeec",
  mode = "color",
  textureUrl,
  materialName,
  onPatch,
}: Props) {
  return (
    <div className="space-y-3">
      {/* Enable / disable toggle */}
      <div className="flex items-center justify-between gap-3 cursor-pointer select-none">
        <span className="text-xs text-[var(--foreground)]">Show plinth</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => onPatch({ plinthEnabled: !enabled })}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            enabled ? "bg-[var(--primary)]" : "bg-[var(--muted)]"
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-4" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {enabled && (
        <>
          {/* Dimensions */}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[11px] text-[var(--muted-foreground)]">
              Height (cm)
              <input
                type="number"
                min={2}
                max={30}
                step={0.5}
                value={heightCm}
                onChange={(e) => onPatch({ plinthHeightCm: Number(e.target.value) })}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-xs text-[var(--foreground)]"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-[var(--muted-foreground)]">
              Depth (cm)
              <input
                type="number"
                min={0.5}
                max={5}
                step={0.1}
                value={depthCm}
                onChange={(e) => onPatch({ plinthDepthCm: Number(e.target.value) })}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-xs text-[var(--foreground)]"
              />
            </label>
          </div>

          {/* Mode selector */}
          <div className="grid grid-cols-2 gap-1.5">
            {(["color", "catalog"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onPatch({ plinthMaterialMode: value })}
                className={`rounded-md border px-2 py-1.5 text-xs ${
                  mode === value
                    ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                    : "border-[var(--border)] text-[var(--muted-foreground)]"
                }`}
              >
                {value === "color" ? "Solid color" : "From catalog"}
              </button>
            ))}
          </div>

          {mode === "color" ? (
            <label className="flex flex-col gap-1 text-[11px] text-[var(--muted-foreground)]">
              Plinth color
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => onPatch({ plinthColor: e.target.value })}
                  className="h-8 w-10 rounded-md border border-[var(--border)] bg-transparent cursor-pointer"
                />
                <input
                  type="text"
                  value={color}
                  onChange={(e) => onPatch({ plinthColor: e.target.value })}
                  className="flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-xs text-[var(--foreground)]"
                />
              </div>
            </label>
          ) : (
            <div className="space-y-1.5">
              {materialName && (
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  Selected:{" "}
                  <span className="font-medium text-[var(--foreground)]">{materialName}</span>
                </p>
              )}
              <CatalogSurfacePicker
                kind="plinth"
                selectedTextureUrl={textureUrl}
                onSelect={(selection) =>
                  onPatch({
                    plinthMaterialMode: "catalog",
                    plinthCustomTextureUrl: selection.textureUrl,
                    plinthMaterialName: selection.name,
                    plinthMaterialUnit: selection.unit,
                    plinthMaterialPricePerUnit: selection.pricePerUnit,
                    plinthMaterialProductWidthCm: selection.productWidthCm,
                    plinthMaterialProductHeightCm: selection.productHeightCm,
                  })
                }
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
