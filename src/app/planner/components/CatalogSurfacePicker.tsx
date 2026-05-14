"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useStore } from "@/lib/store";
import { catalogItemIsSoftFurnitureMode } from "@/lib/catalogItemCategories";
import { isUpholsteryFabricMaterial } from "@/lib/plannerMaterials";
import type { CatalogItem, Material } from "@/lib/types";
import { materialThumbnailSrc } from "@/lib/materialDisplayImage";
import type { FloorLayoutPattern } from "../types";

export type SurfaceCatalogKind = "floor" | "wall" | "ceiling" | "plinth";

export type SurfaceCatalogSelection = {
  id: string;
  source: "material" | "catalog";
  name: string;
  textureUrl: string;
  textureWidthCm?: number;
  textureHeightCm?: number;
  productWidthCm?: number;
  productHeightCm?: number;
  layoutPattern?: FloorLayoutPattern;
  pricePerUnit?: number;
  unit?: string;
  color?: string;
};

type CatalogSurfaceOption = SurfaceCatalogSelection & {
  subtitle: string;
  thumbnailUrl?: string;
  sectionKey: string;
  sectionLabel: string;
  sectionOrder: number;
};

type Props = {
  kind: SurfaceCatalogKind;
  selectedTextureUrl?: string;
  onSelect: (selection: SurfaceCatalogSelection) => void;
};

const INITIAL_VISIBLE_COUNT = 60;
const VISIBLE_COUNT_STEP = 60;

type SectionDefinition = {
  key: string;
  label: string;
  values: string[];
};

const SECTION_DEFS: Record<SurfaceCatalogKind, SectionDefinition[]> = {
  floor: [
    {
      key: "floor-laminate",
      label: "Laminate",
      values: ["building-flooring-laminate"],
    },
    {
      key: "floor-parquet-hardwood",
      label: "Parquet / Hardwood",
      values: ["building-flooring-parquet-hardwood"],
    },
    {
      key: "floor-vinyl",
      label: "Vinyl (LVT/SPC)",
      values: ["building-flooring-vinyl-lvt", "building-flooring-vinyl-spc"],
    },
    {
      key: "floor-tiles",
      label: "Tiles (floor)",
      values: ["building-flooring-ceramic", "building-flooring-porcelain"],
    },
  ],
  wall: [
    {
      key: "wall-paint",
      label: "Paint colors",
      values: ["building-wall-paint"],
    },
    {
      key: "wall-wallpaper",
      label: "Wallpapers",
      values: ["building-wall-wallpaper"],
    },
    {
      key: "wall-panels",
      label: "Wall panels (wood, PVC, acoustic)",
      values: ["building-wall-panels-wood", "building-wall-panels-pvc", "building-wall-panels-3d"],
    },
    {
      key: "wall-tiles",
      label: "Tiles (wall)",
      values: ["building-wall-tiles"],
    },
  ],
  ceiling: [
    {
      key: "ceiling-stretch",
      label: "Stretch ceiling",
      values: ["building-ceiling-stretch"],
    },
    {
      key: "ceiling-gypsum",
      label: "Gypsum / plasterboard",
      values: ["building-ceiling-gypsum"],
    },
    {
      key: "ceiling-panels",
      label: "Ceiling panels",
      values: ["building-ceiling-panels"],
    },
    {
      key: "ceiling-suspended",
      label: "Suspended ceiling",
      values: ["building-ceiling-suspended"],
    },
  ],
  plinth: [
    {
      key: "plinth-general",
      label: "Plinth / Skirting",
      values: [
        "building-plinth",
        "sub-building-plinth",
        "building-skirting",
        "sub-building-skirting",
        "building-baseboard",
      ],
    },
    {
      key: "plinth-mdf",
      label: "MDF / Wood plinth",
      values: ["building-plinth-mdf", "building-skirting-mdf", "building-baseboard-mdf"],
    },
    {
      key: "plinth-pvc",
      label: "PVC / Plastic plinth",
      values: ["building-plinth-pvc", "building-skirting-pvc", "building-baseboard-pvc"],
    },
    {
      key: "plinth-metal",
      label: "Metal / Aluminium plinth",
      values: ["building-plinth-metal", "building-skirting-metal", "building-baseboard-metal"],
    },
    {
      key: "plinth-stone",
      label: "Stone / Ceramic plinth",
      values: ["building-plinth-stone", "building-skirting-stone", "building-baseboard-stone"],
    },
  ],
};

function optionSection(kind: SurfaceCatalogKind, parts: Array<string | undefined | null>) {
  const normalizedParts = parts
    .filter((part): part is string => typeof part === "string" && part.trim() !== "")
    .map((part) => part.trim().toLowerCase());
  const defs = SECTION_DEFS[kind];
  const index = defs.findIndex(
    (def) => def.values.some((value) => normalizedParts.includes(value)),
  );

  if (index >= 0) {
    const def = defs[index]!;
    return { sectionKey: def.key, sectionLabel: def.label, sectionOrder: index };
  }

  return {
    sectionKey: `${kind}-other`,
    sectionLabel:
      kind === "floor"
        ? "Other floor textures"
        : kind === "ceiling"
          ? "Other ceiling textures"
          : kind === "plinth"
            ? "Other plinth textures"
            : "Other wall textures",
    sectionOrder: defs.length,
  };
}


const GROUP_TAGS: Record<SurfaceCatalogKind, string[]> = {
  /** `floor` covers admin rows that only set legacy category slug `floor` (see Materials admin `hasFloorMaterialCategory`). */
  floor: ["sub-building-flooring", "building-flooring", "floor"],
  wall: ["sub-building-wall-finishes", "building-wall-finishes"],
  ceiling: ["sub-building-ceiling-materials", "building-ceiling-materials"],
  plinth: ["sub-building-plinth", "building-plinth", "sub-building-skirting", "building-skirting", "building-baseboard"],
};

const CATEGORY_VALUES: Record<SurfaceCatalogKind, Set<string>> = {
  floor: new Set(SECTION_DEFS.floor.flatMap((def) => def.values)),
  wall: new Set(SECTION_DEFS.wall.flatMap((def) => def.values)),
  ceiling: new Set(SECTION_DEFS.ceiling.flatMap((def) => def.values)),
  plinth: new Set(SECTION_DEFS.plinth.flatMap((def) => def.values)),
};

function normalizedPart(value: string | undefined | null) {
  return (value ?? "").trim().toLowerCase();
}

function normalizedParts(parts: Array<string | undefined | null>) {
  return parts
    .map(normalizedPart)
    .filter((part) => part !== "");
}



function matchesStructuredSurfaceTags(parts: string[], kind: SurfaceCatalogKind) {
  const categoryValues = CATEGORY_VALUES[kind];
  return parts.some((part) => categoryValues.has(part) || GROUP_TAGS[kind].includes(part));
}


function materialFieldParts(m: Material): Array<string | undefined | null> {
  const typeList = m.types?.length ? m.types : [m.type];
  return [
    m.name,
    m.subModeId,
    m.modeId,
    m.category,
    ...(m.categories ?? []),
    ...typeList,
  ];
}

function materialToOption(m: Material, kind: SurfaceCatalogKind): CatalogSurfaceOption | null {
  const rawTextureUrl = m.imageUrl?.trim();
  if (!rawTextureUrl) return null;
  if (isUpholsteryFabricMaterial(m)) return null;

  const parts = materialFieldParts(m);
  const normalized = normalizedParts(parts);

  if (kind === "floor" && matchesStructuredSurfaceTags(normalized, "plinth")) return null;

  if (!matchesStructuredSurfaceTags(normalized, kind)) return null;

  const textureWidthCm = m.textureWidthCm ?? undefined;
  const textureHeightCm = m.textureHeightCm ?? undefined;
  const productWidthCm = m.productWidthCm ?? undefined;
  const productHeightCm = m.productHeightCm ?? undefined;
  const layoutPattern = (m.floorLayoutPattern as FloorLayoutPattern | undefined) ?? undefined;
  const subtitle =
    (m.categories?.find((c) => c.trim() !== "") ?? m.category)?.trim() || "Material";

  const hex =
    typeof m.colorCode === "string" && m.colorCode.trim() !== ""
      ? m.colorCode.trim()
      : typeof m.color === "string" && m.color.trim() !== ""
        ? m.color.trim()
        : undefined;
  const color =
    hex && /^#?[0-9a-fA-F]{6}$/.test(hex) ? (hex.startsWith("#") ? hex : `#${hex}`) : undefined;

  const section = optionSection(kind, parts);
  return {
    id: m.id,
    source: "material",
    name: m.name,
    subtitle,
    textureUrl: rawTextureUrl,
    textureWidthCm,
    textureHeightCm,
    productWidthCm,
    productHeightCm,
    layoutPattern,
    pricePerUnit: m.pricePerUnit,
    unit: m.unit,
    color,
    thumbnailUrl: materialThumbnailSrc(rawTextureUrl),
    ...section,
  };
}

function catalogItemToOption(item: CatalogItem, kind: SurfaceCatalogKind): CatalogSurfaceOption | null {
  const rawTextureUrl = item.images?.[0];
  if (!rawTextureUrl) return null;

  if (catalogItemIsSoftFurnitureMode(item)) return null;

  const parts = [
    item.name,
    item.model,
    item.subModeId,
    item.category,
    item.plannerSubcategory,
    ...(item.additionalCategories ?? []),
    ...(item.allCategories ?? []),
  ];
  const normalized = normalizedParts(parts);

  // Plinth items must not appear in the floor catalog even if they carry a
  // "sub-building-flooring" subModeId (they were added via the flooring sub-mode).
  if (kind === "floor" && matchesStructuredSurfaceTags(normalized, "plinth")) return null;

  const matches = matchesStructuredSurfaceTags(normalized, kind);
  if (!matches) return null;

  const textureWidthCm = item.surfaceTextureWidthCm ?? undefined;
  const textureHeightCm = item.surfaceTextureHeightCm ?? undefined;
  const productWidthCm = item.surfaceItemWidthCm ?? undefined;
  const productHeightCm = item.surfaceItemHeightCm ?? undefined;
  const layoutPattern = (item.surfaceLayoutPattern as FloorLayoutPattern | undefined) ?? undefined;

  const section = optionSection(kind, parts);
  return {
    id: item.id,
    source: "catalog",
    name: item.name,
    subtitle: item.category || "Catalog item",
    textureUrl: rawTextureUrl,
    textureWidthCm,
    textureHeightCm,
    productWidthCm,
    productHeightCm,
    layoutPattern,
    pricePerUnit: item.price,
    unit: "piece",
    thumbnailUrl: materialThumbnailSrc(rawTextureUrl),
    ...section,
  };
}

export function CatalogSurfacePicker({ kind, selectedTextureUrl, onSelect }: Props) {
  const catalogItems = useStore((s) => s.catalogItems);
  const materials = useStore((s) => s.materials);
  const [query, setQuery] = useState("");
  const [visibleState, setVisibleState] = useState({ filterKey: "", count: INITIAL_VISIBLE_COUNT });

  const options = useMemo(() => {
    const byTexture = new Set<string>();
    const catalogRows = catalogItems
      .map((item) => catalogItemToOption(item, kind))
      .filter((option): option is CatalogSurfaceOption => option !== null);
    const materialRows = materials
      .map((m) => materialToOption(m, kind))
      .filter((option): option is CatalogSurfaceOption => option !== null);
    /** Materials first so duplicate image URLs resolve to admin material pricing/size fields. */
    const rows = [...materialRows, ...catalogRows];

    return rows.filter((row) => {
      const key = row.textureUrl.trim();
      if (byTexture.has(key)) return false;
      byTexture.add(key);
      return true;
    });
  }, [catalogItems, materials, kind]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    const rows = options.filter((option) => {
      if (!normalizedQuery) return true;
      return [option.name, option.subtitle, option.sectionLabel]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });

    return rows.sort((a, b) => {
      const aSelected = a.textureUrl === selectedTextureUrl;
      const bSelected = b.textureUrl === selectedTextureUrl;
      if (a.sectionOrder !== b.sectionOrder) return a.sectionOrder - b.sectionOrder;
      if (aSelected !== bSelected) return aSelected ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [normalizedQuery, options, selectedTextureUrl]);

  const filterKey = `${kind}:${normalizedQuery}`;
  const visibleCount = visibleState.filterKey === filterKey ? visibleState.count : INITIAL_VISIBLE_COUNT;
  const visibleOptions = filteredOptions.slice(0, visibleCount);
  const hasMore = visibleOptions.length < filteredOptions.length;
  const visibleSections = useMemo(() => {
    const map = new Map<string, { label: string; order: number; options: CatalogSurfaceOption[] }>();
    for (const option of visibleOptions) {
      const section = map.get(option.sectionKey);
      if (section) {
        section.options.push(option);
      } else {
        map.set(option.sectionKey, {
          label: option.sectionLabel,
          order: option.sectionOrder,
          options: [option],
        });
      }
    }
    return [...map.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  }, [visibleOptions]);
  if (options.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-[var(--border)] px-2 py-2 text-[11px] text-[var(--muted-foreground)]">
        Add storefront catalog products or Materials rows tagged as{" "}
        {kind === "floor" ? "flooring" : kind === "ceiling" ? "ceiling materials" : kind === "plinth" ? "plinth / skirting" : "wall finishes"} with an image to use them
        here.
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-2">
      {kind !== "plinth" && (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-medium text-[var(--muted-foreground)]">Textures (catalog and materials)</div>
            <div className="text-[10px] text-[var(--muted-foreground)]">
              {filteredOptions.length} of {options.length}
            </div>
          </div>

          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${kind} textures...`}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-xs text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
          />
        </>
      )}

      {filteredOptions.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--border)] px-2 py-3 text-center text-[11px] text-[var(--muted-foreground)]">
          No textures match this search.
        </p>
      ) : (
        <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
          {visibleSections.map((section) => (
            <section key={section.label} className="space-y-1.5">
              <div className="sticky top-0 z-10 flex items-center justify-between rounded bg-[var(--background)]/95 py-1 text-[11px] font-semibold text-[var(--foreground)] backdrop-blur">
                <span>{section.label}</span>
                <span className="text-[10px] font-normal text-[var(--muted-foreground)]">{section.options.length}</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {section.options.map((option) => {
                  const selected = selectedTextureUrl === option.textureUrl;
                  return (
                    <button
                      key={`${option.source}:${option.id}`}
                      type="button"
                      onClick={() => onSelect(option)}
                      title={`${option.name} · ${option.subtitle}`}
                      className={`min-w-0 rounded-md border p-1 text-left transition ${
                        selected
                          ? "border-[var(--primary)] bg-[var(--primary)]/10 ring-1 ring-[var(--primary)]/30"
                          : "border-[var(--border)] hover:border-[var(--primary)]/50"
                      }`}
                    >
                      <span
                        className="relative mb-1 block aspect-[4/3] w-full overflow-hidden rounded bg-[var(--muted)]"
                        style={{ backgroundColor: option.color }}
                      >
                        {option.thumbnailUrl ? (
                          <Image src={option.thumbnailUrl} alt="" fill sizes="96px" className="object-cover" unoptimized />
                        ) : null}
                      </span>
                      <span className="block truncate text-[11px] font-medium text-[var(--foreground)]">{option.name}</span>
                      <span className="block truncate text-[10px] text-[var(--muted-foreground)]">{option.subtitle}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {hasMore ? (
        <button
          type="button"
          onClick={() =>
            setVisibleState({
              filterKey,
              count: visibleCount + VISIBLE_COUNT_STEP,
            })
          }
          className="w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-xs text-[var(--muted-foreground)] transition hover:border-[var(--primary)]/50 hover:text-[var(--foreground)]"
        >
          Show more textures
        </button>
      ) : null}
    </div>
  );
}
