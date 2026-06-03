"use client";

import { useState, useEffect } from "react";
import FloorSwatch from "./FloorSwatch";
import {
  LAMINATE_OPTIONS,
  type FloorLayoutPattern,
  type FloorMaterialMode,
  type FloorStyle,
  type FloorTextureStartSide,
  type PlannerFloorSurfacePatch,
} from "../types";
import { CatalogSurfacePicker } from "./CatalogSurfacePicker";
import { SurfaceTextureUpload } from "./SurfaceTextureUpload";
import { isPlannerSurfaceUploadUrl } from "../utils/stripStaleRoomSurfaceTextures";

type Props = {
  presetVariant?: "swatches" | "kitchen-grid";
  floorStyle: FloorStyle;
  mode?: FloorMaterialMode;
  textureUrl?: string;
  uvRotationDeg?: number;
  textureStartSide?: FloorTextureStartSide;
  layoutPattern?: FloorLayoutPattern;
  tileWcm?: number;
  tileHcm?: number;
  groutCm?: number;
  groutColor?: string;
  textureWidthCm?: number;
  textureHeightCm?: number;
  allowUpload?: boolean;
  adminSlug?: string;
  onPresetPick: (style: FloorStyle) => void;
  onPatch: (patch: PlannerFloorSurfacePatch) => void;
};

function NumberField({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number | undefined;
  min?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const [local, setLocal] = useState(value != null ? String(value) : "");

  useEffect(() => {
    setLocal(value != null ? String(value) : "");
  }, [value]);

  const commit = () => {
    const parsed = parseFloat(local);
    if (!Number.isFinite(parsed) || (min != null && parsed < min)) {
      setLocal(value != null ? String(value) : "");
      return;
    }
    onChange(parsed);
  };

  return (
    <label className="flex flex-col gap-1 text-[11px] text-[var(--muted-foreground)]">
      {label}
      <input
        type="text"
        inputMode="decimal"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
        className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-xs text-[var(--foreground)]"
      />
    </label>
  );
}

export function PlannerFloorSurfaceControls({
  presetVariant = "swatches",
  floorStyle,
  mode = "preset",
  textureUrl,
  uvRotationDeg,
  textureStartSide = "left",
  layoutPattern,
  tileWcm,
  tileHcm,
  groutCm,
  groutColor,
  textureWidthCm,
  textureHeightCm,
  allowUpload,
  adminSlug,
  onPresetPick,
  onPatch,
}: Props) {
  const swatchLimit = presetVariant === "kitchen-grid" ? 12 : LAMINATE_OPTIONS.length;
  const swatches = LAMINATE_OPTIONS.slice(0, swatchLimit);
  const isUserUpload = !!textureUrl && isPlannerSurfaceUploadUrl(textureUrl);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5">
        {(["preset", "customImage", "tile"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onPatch({ floorMaterialMode: value })}
            className={`rounded-md border px-2 py-1.5 text-xs ${
              mode === value
                ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                : "border-[var(--border)] text-[var(--muted-foreground)]"
            }`}
          >
            {value === "preset" ? "Preset" : value === "customImage" ? "Image" : "Tile"}
          </button>
        ))}
      </div>

      {mode === "preset" ? (
        <div className={presetVariant === "swatches" ? "grid grid-cols-2 gap-2" : "grid grid-cols-3 gap-2"}>
          {swatches.map((option) => (
            <FloorSwatch
              key={option.value}
              style={option.value}
              label={option.label}
              selected={floorStyle === option.value}
              onClick={() => onPresetPick(option.value)}
            />
          ))}
        </div>
      ) : null}

      <div className="space-y-2">
        {allowUpload && (
          <SurfaceTextureUpload
            adminSlug={adminSlug}
            textureUrl={isUserUpload ? textureUrl : undefined}
            onUploaded={(url) =>
              onPatch({
                floorMaterialMode: mode === "preset" ? "customImage" : mode,
                floorCustomTextureUrl: url,
                floorTextureWidthCm: 120,
                floorTextureHeightCm: 20,
                floorMaterialName: undefined,
                floorMaterialPricePerUnit: undefined,
              })
            }
            onRemove={() =>
              onPatch({
                floorMaterialMode: "preset",
                floorCustomTextureUrl: undefined,
                floorTextureWidthCm: undefined,
                floorTextureHeightCm: undefined,
                floorMaterialName: undefined,
                floorMaterialPricePerUnit: undefined,
                floorMaterialProductWidthCm: undefined,
                floorMaterialProductHeightCm: undefined,
              })
            }
          />
        )}
        <CatalogSurfacePicker
          kind="floor"
          selectedTextureUrl={!isUserUpload ? textureUrl : undefined}
          onSelect={(selection) =>
            onPatch({
              floorMaterialMode: "customImage",
              floorCustomTextureUrl: selection.textureUrl,
              floorTextureWidthCm: selection.textureWidthCm,
              floorTextureHeightCm: selection.textureHeightCm,
              floorMaterialProductWidthCm: selection.productWidthCm,
              floorMaterialProductHeightCm: selection.productHeightCm,
              floorLayoutPattern: selection.layoutPattern,
              floorMaterialName: selection.name,
              floorMaterialUnit: selection.unit,
              floorMaterialPricePerUnit: selection.pricePerUnit,
            })
          }
        />
        {mode !== "preset" ? (
          <>
            {isUserUpload && (
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Texture W cm" value={textureWidthCm} min={1} step={1} onChange={(v) => onPatch({ floorTextureWidthCm: v })} />
                <NumberField label="Texture H cm" value={textureHeightCm} min={1} step={1} onChange={(v) => onPatch({ floorTextureHeightCm: v })} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[11px] text-[var(--muted-foreground)]">
                Rotation
                <select
                  value={uvRotationDeg ?? 0}
                  onChange={(e) => onPatch({ floorUvRotationDeg: Number(e.target.value) })}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-xs text-[var(--foreground)]"
                >
                  <option value={0}>0°</option>
                  <option value={45}>45°</option>
                  <option value={90}>90°</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-[var(--muted-foreground)]">
                Layout
                <select
                  value={layoutPattern ?? (mode === "tile" ? "aligned" : "staggered")}
                  onChange={(e) => onPatch({ floorLayoutPattern: e.target.value as FloorLayoutPattern })}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-xs text-[var(--foreground)]"
                >
                  <option value="aligned">Aligned grid</option>
                  <option value="staggered">Staggered joints</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-[var(--muted-foreground)]">
                Start side
                <select
                  value={textureStartSide}
                  onChange={(e) =>
                    onPatch({ floorTextureStartSide: e.target.value as FloorTextureStartSide })
                  }
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-xs text-[var(--foreground)]"
                >
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                  <option value="back">Back</option>
                  <option value="front">Front</option>
                </select>
              </label>
            </div>
            {mode === "tile" && (
              <div className="grid grid-cols-4 gap-2">
                <NumberField label="Tile W cm" value={tileWcm} min={1} step={1} onChange={(v) => onPatch({ floorTileWidthCm: v })} />
                <NumberField label="Tile H cm" value={tileHcm} min={1} step={1} onChange={(v) => onPatch({ floorTileHeightCm: v })} />
                <NumberField label="Grout cm" value={groutCm} min={0} step={0.1} onChange={(v) => onPatch({ floorTileGroutCm: v })} />
                <label className="flex flex-col gap-1 text-[11px] text-[var(--muted-foreground)]">
                  Grout
                  <input
                    type="color"
                    value={groutColor ?? "#d8d2c8"}
                    onChange={(e) => onPatch({ floorTileGroutColor: e.target.value })}
                    className="h-8 w-full rounded-md border border-[var(--border)] bg-transparent"
                  />
                </label>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
