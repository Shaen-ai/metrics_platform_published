"use client";

import type { PlannerSwatchMaterial } from "@/lib/plannerMaterials";

interface FabricPart {
  id: string;
  name: string;
  allowedMaterialIds: string[] | null;
}

interface FabricPartsPanelProps {
  itemId: string;
  fabricParts: FabricPart[];
  fabricPartMaterialIds: Record<string, string> | undefined;
  upholSwatches: PlannerSwatchMaterial[];
  onSetPartMaterial: (itemId: string, partId: string, materialId: string) => void;
}

function swatchesForPart(
  part: FabricPart,
  allSwatches: PlannerSwatchMaterial[],
): PlannerSwatchMaterial[] {
  if (part.allowedMaterialIds === null) return allSwatches;
  const allowed = new Set(part.allowedMaterialIds);
  return allSwatches.filter((s) => allowed.has(s.id));
}

export default function FabricPartsPanel({
  itemId,
  fabricParts,
  fabricPartMaterialIds,
  upholSwatches,
  onSetPartMaterial,
}: FabricPartsPanelProps) {
  if (fabricParts.length === 0) return null;

  return (
    <div className="topbar-fabric-parts-wrap">
      {fabricParts.map((part) => {
        const swatches = swatchesForPart(part, upholSwatches);
        const activeMaterialId = fabricPartMaterialIds?.[part.id];

        return (
          <div key={part.id} className="topbar-finish-strip" title={part.name}>
            <span className="topbar-finish-label">{part.name}</span>
            <div className="topbar-finish-swatches">
              {swatches.length === 0 ? (
                <span
                  className="topbar-finish-label"
                  style={{ opacity: 0.5, fontStyle: "italic" }}
                >
                  No fabrics
                </span>
              ) : (
                swatches.map((m) => {
                  const picked = activeMaterialId === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`topbar-finish-swatch${picked ? " selected" : ""}`}
                      title={m.name}
                      onClick={() => onSetPartMaterial(itemId, part.id, m.id)}
                    >
                      {m.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.imageUrl} alt="" className="topbar-finish-swatch-img" />
                      ) : (
                        <span
                          className="topbar-finish-swatch-color"
                          style={{ background: m.color }}
                        />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
