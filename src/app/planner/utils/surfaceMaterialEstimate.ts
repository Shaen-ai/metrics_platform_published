import type { Room } from "../types";

export type SurfaceMaterialEstimate = {
  label: string;
  areaSqm: number;
  quantity: number;
  unit: string;
  cost: number | null;
  materialName?: string;
};

type SurfaceKind = "floor" | "wall" | "ceiling";

function positive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function polygonAreaSqm(points: { x: number; z: number }[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.z - b.x * a.z;
  }
  return Math.abs(sum) / 2;
}

function floorAreaSqm(room: Room): number {
  return positive(room.floorOutline?.length ? polygonAreaSqm(room.floorOutline) : undefined) ?? room.width * room.depth;
}

function wallAreaSqm(room: Room): number {
  const gross = 2 * (room.width + room.depth) * room.height;
  const openings = (room.openings ?? []).reduce((sum, opening) => {
    const h = opening.height ?? (opening.type === "door" ? 2.1 : 1.2);
    return sum + opening.width * h;
  }, 0);
  return Math.max(0, gross - openings);
}

function surfaceAreaSqm(room: Room, kind: SurfaceKind): number {
  if (kind === "wall") return wallAreaSqm(room);
  return floorAreaSqm(room);
}

function pieceAreaSqm(widthCm?: number, heightCm?: number): number | undefined {
  const w = positive(widthCm);
  const h = positive(heightCm);
  if (!w || !h) return undefined;
  return (w / 100) * (h / 100);
}

function estimateQuantity(areaSqm: number, unit: string, pieceArea?: number): number {
  if (unit === "piece" || unit === "roll" || unit === "box") {
    return pieceArea ? Math.ceil(areaSqm / pieceArea) : 1;
  }
  return areaSqm;
}

export function estimateSurfaceMaterial(room: Room, kind: SurfaceKind): SurfaceMaterialEstimate | null {
  const areaSqm = surfaceAreaSqm(room, kind);
  const meta =
    kind === "floor"
      ? {
          materialName: room.floorMaterialName,
          unit: room.floorMaterialUnit,
          pricePerUnit: room.floorMaterialPricePerUnit,
          widthCm: room.floorMaterialProductWidthCm ?? room.floorTextureWidthCm ?? room.floorTileWidthCm,
          heightCm: room.floorMaterialProductHeightCm ?? room.floorTextureHeightCm ?? room.floorTileHeightCm,
        }
      : kind === "wall"
        ? {
            materialName: room.wallMaterialName,
            unit: room.wallMaterialUnit,
            pricePerUnit: room.wallMaterialPricePerUnit,
            widthCm: room.wallMaterialProductWidthCm ?? room.wallTextureWidthCm ?? room.wallTileWidthCm,
            heightCm: room.wallMaterialProductHeightCm ?? room.wallTextureHeightCm ?? room.wallTileHeightCm,
          }
        : {
            materialName: room.ceilingMaterialName,
            unit: room.ceilingMaterialUnit,
            pricePerUnit: room.ceilingMaterialPricePerUnit,
            widthCm: room.ceilingMaterialProductWidthCm ?? room.ceilingTextureWidthCm ?? room.ceilingTileWidthCm,
            heightCm: room.ceilingMaterialProductHeightCm ?? room.ceilingTextureHeightCm ?? room.ceilingTileHeightCm,
          };

  const unit = meta.unit || "sqm";
  const productAreaSqm = pieceAreaSqm(meta.widthCm, meta.heightCm);
  const quantity = estimateQuantity(areaSqm, unit, productAreaSqm);
  const price = positive(meta.pricePerUnit);
  const cost = price ? quantity * price : null;

  if (!meta.materialName && !price && unit === "sqm") return null;

  return {
    label: kind === "floor" ? "Flooring" : kind === "wall" ? "Wall finish" : "Ceiling finish",
    areaSqm,
    quantity,
    unit,
    cost,
    materialName: meta.materialName,
  };
}
