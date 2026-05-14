"use client";

import type { PlannerInteriorSurfaceMode, PlannerWallCeilingSurfacePatch } from "../types";
import { CatalogSurfacePicker } from "./CatalogSurfacePicker";

type Prefix = "wall" | "ceiling";

type Props = {
  title: string;
  prefix: Prefix;
  mode?: PlannerInteriorSurfaceMode;
  textureUrl?: string;
  uvRepeatX?: number;
  uvRepeatY?: number;
  uvRotationDeg?: number;
  tileWcm?: number;
  tileHcm?: number;
  groutCm?: number;
  groutColor?: string;
  onPatch: (patch: PlannerWallCeilingSurfacePatch) => void;
};

function patchKey(prefix: Prefix, suffix: string) {
  return `${prefix}${suffix}` as keyof PlannerWallCeilingSurfacePatch;
}

function makePatch(prefix: Prefix, suffix: string, value: string | number): PlannerWallCeilingSurfacePatch {
  return { [patchKey(prefix, suffix)]: value } as PlannerWallCeilingSurfacePatch;
}

function makeSurfaceSelectionPatch(
  prefix: Prefix,
  selection: {
    textureUrl: string;
    textureWidthCm?: number;
    textureHeightCm?: number;
    productWidthCm?: number;
    productHeightCm?: number;
    name: string;
    unit?: string;
    pricePerUnit?: number;
  },
): PlannerWallCeilingSurfacePatch {
  return {
    [patchKey(prefix, "MaterialMode")]: "customImage",
    [patchKey(prefix, "CustomTextureUrl")]: selection.textureUrl,
    [patchKey(prefix, "TextureWidthCm")]: selection.textureWidthCm,
    [patchKey(prefix, "TextureHeightCm")]: selection.textureHeightCm,
    [patchKey(prefix, "MaterialProductWidthCm")]: selection.productWidthCm,
    [patchKey(prefix, "MaterialProductHeightCm")]: selection.productHeightCm,
    [patchKey(prefix, "MaterialName")]: selection.name,
    [patchKey(prefix, "MaterialUnit")]: selection.unit,
    [patchKey(prefix, "MaterialPricePerUnit")]: selection.pricePerUnit,
  } as PlannerWallCeilingSurfacePatch;
}

function NumberField({
  label,
  value,
  min,
  step,
  onChange,
}: {
  label: string;
  value: number | undefined;
  min?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-[var(--muted-foreground)]">
      {label}
      <input
        type="number"
        min={min}
        step={step}
        value={value ?? ""}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-xs text-[var(--foreground)]"
      />
    </label>
  );
}

export function PlannerInteriorSurfaceControls({
  title,
  prefix,
  mode = "color",
  textureUrl,
  tileWcm,
  tileHcm,
  groutCm,
  groutColor,
  onPatch,
}: Props) {
  const modeKey = patchKey(prefix, "MaterialMode");

  return (
    <div className="space-y-2 rounded-lg border border-[var(--border)] p-2">
      <div className="text-xs font-medium text-[var(--foreground)]">{title}</div>
      <div className="grid grid-cols-3 gap-1.5">
        {(["color", "customImage", "tile"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onPatch({ [modeKey]: value } as PlannerWallCeilingSurfacePatch)}
            className={`rounded-md border px-2 py-1.5 text-xs ${
              mode === value
                ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                : "border-[var(--border)] text-[var(--muted-foreground)]"
            }`}
          >
            {value === "color" ? "Color" : value === "customImage" ? "Image" : "Tile"}
          </button>
        ))}
      </div>

      {mode !== "color" && (
        <div className="space-y-2">
          <CatalogSurfacePicker
            kind={prefix}
            selectedTextureUrl={textureUrl}
            onSelect={(selection) =>
              onPatch(makeSurfaceSelectionPatch(prefix, selection))
            }
          />
          {mode === "tile" && (
            <div className="grid grid-cols-4 gap-2">
              <NumberField label="Tile W cm" value={tileWcm} min={1} step={1} onChange={(v) => onPatch(makePatch(prefix, "TileWidthCm", v))} />
              <NumberField label="Tile H cm" value={tileHcm} min={1} step={1} onChange={(v) => onPatch(makePatch(prefix, "TileHeightCm", v))} />
              <NumberField label="Grout cm" value={groutCm} min={0} step={0.1} onChange={(v) => onPatch(makePatch(prefix, "TileGroutCm", v))} />
              <label className="flex flex-col gap-1 text-[11px] text-[var(--muted-foreground)]">
                Grout
                <input
                  type="color"
                  value={groutColor ?? "#d8d2c8"}
                  onChange={(e) => onPatch(makePatch(prefix, "TileGroutColor", e.target.value))}
                  className="h-8 w-full rounded-md border border-[var(--border)] bg-transparent"
                />
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
