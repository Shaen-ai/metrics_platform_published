"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { usePlannerStore } from "../store/usePlannerStore";
import { useStore, useHydration } from "@/lib/store";
import { useResolvedAdmin } from "@/contexts/PublishedTenantProvider";
import { usePlannerType } from "../context";
import { formatPrice } from "../utils/math";
import { clampOpeningsForRoom, defaultOpeningHeight } from "../utils/openings";
import {
  displayToMeters,
  formatLengthLabel,
  metersToDisplay,
  ROOM_HEIGHT_MAX_M,
  ROOM_HEIGHT_MIN_M,
  ROOM_PLAN_MAX_M,
  ROOM_PLAN_MIN_M,
} from "../utils/units";
import LengthUnitToggle from "./LengthUnitToggle";
import ModelThumbnail from "./ModelThumbnail";
import {
  Search,
  Plus,
  RotateCcw,
  Home,
  Palette,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Ruler,
  Armchair,
  UtensilsCrossed,
  Bed,
  Bath,
  Tv,
  Lightbulb,
  WashingMachine,
  Flower2,
  BookOpen,
  Landmark,
  Package,
  Trash2,
  Shirt,
} from "lucide-react";

const ROOM_SETUP_EXPANDED_KEY = "planner-sidebar-room-setup-expanded";
import type { PlannerCatalogItem } from "../types";
import { PlannerFloorSurfaceControls } from "./PlannerFloorSurfaceControls";
import { PlannerInteriorSurfaceControls } from "./PlannerInteriorSurfaceControls";
import { PlannerPlinthControls } from "./PlannerPlinthControls";
import { wardrobeFootprintMeters, isYourWardrobesCategory } from "../wardrobe/plannerWardrobeCatalog";
import { catalogItemAllCategoryLabels } from "@/lib/catalogItemCategories";
import { estimateSurfaceMaterial, type SurfaceMaterialEstimate } from "../utils/surfaceMaterialEstimate";

const categoryIcons: Record<string, React.ReactNode> = {
  Seating: <Armchair size={14} />,
  Tables: <UtensilsCrossed size={14} />,
  Storage: <BookOpen size={14} />,
  Beds: <Bed size={14} />,
  Kitchen: <UtensilsCrossed size={14} />,
  Bathroom: <Bath size={14} />,
  Electronics: <Tv size={14} />,
  Lighting: <Lightbulb size={14} />,
  Appliances: <WashingMachine size={14} />,
  Decor: <Flower2 size={14} />,
  Structure: <Landmark size={14} />,
  "Your wardrobes": <Shirt size={14} />,
};

type RoomSurfaceCatalogTarget = "floor" | "wall" | "ceiling";

function normalizeCatalogLabel(value: string | undefined | null) {
  return (value ?? "").trim().toLowerCase();
}

function catalogSurfaceTarget(item: PlannerCatalogItem): RoomSurfaceCatalogTarget | null {
  const categoryParts = [
    item.category,
    item.subCategory,
    ...(item.additionalCategories ?? []),
    ...(item.allCategories ?? []),
  ].map(normalizeCatalogLabel);

  if (categoryParts.some((part) => part.includes("building-flooring") || part.includes("flooring"))) {
    return "floor";
  }
  if (categoryParts.some((part) => part.includes("building-wall-finishes") || part.includes("wallpaper") || part.includes("wall finish"))) {
    return "wall";
  }
  if (categoryParts.some((part) => part.includes("building-ceiling-materials") || part.includes("ceiling"))) {
    return "ceiling";
  }

  return null;
}

function catalogItemVisibleTextureSizeCm(item: PlannerCatalogItem): {
  textureWidthCm?: number;
  textureHeightCm?: number;
} {
  const dims = [item.width, item.height, item.depth]
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => value * 100)
    .sort((a, b) => b - a)
    .slice(0, 2)
    .sort((a, b) => a - b);

  return {
    textureWidthCm: dims[0],
    textureHeightCm: dims[1],
  };
}

function formatSurfaceQuantity(estimate: SurfaceMaterialEstimate) {
  const quantity =
    estimate.unit === "sqm"
      ? `${estimate.quantity.toFixed(2)} m²`
      : `${Math.ceil(estimate.quantity)} ${estimate.unit}`;
  return `${quantity} from ${estimate.areaSqm.toFixed(2)} m²`;
}

function AppearanceSection({
  title,
  description,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--background)]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-[var(--accent)]/45"
        aria-expanded={expanded}
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[var(--foreground)]">{title}</span>
          <span className="block truncate text-[11px] text-[var(--muted-foreground)]">{description}</span>
        </span>
        {expanded ? (
          <ChevronDown size={16} className="shrink-0 text-[var(--muted-foreground)]" />
        ) : (
          <ChevronRight size={16} className="shrink-0 text-[var(--muted-foreground)]" />
        )}
      </button>
      {expanded && <div className="space-y-3 border-t border-[var(--border)] p-3">{children}</div>}
    </section>
  );
}

export default function Sidebar() {
  const plannerConfig = usePlannerType();
  const catalog = usePlannerStore((s) => s.catalog);
  const searchQuery = usePlannerStore((s) => s.searchQuery);
  const setSearchQuery = usePlannerStore((s) => s.setSearchQuery);
  const addItem = usePlannerStore((s) => s.addItem);
  const room = usePlannerStore((s) => s.room);
  const setRoom = usePlannerStore((s) => s.setRoom);
  const lengthUnit = usePlannerStore((s) => s.ui.lengthUnit);
  const setWallColor = usePlannerStore((s) => s.setWallColor);
  const setFloorStyle = usePlannerStore((s) => s.setFloorStyle);
  const setPlannerFloorSurface = usePlannerStore((s) => s.setPlannerFloorSurface);
  const setPlannerWallCeilingSurface = usePlannerStore((s) => s.setPlannerWallCeilingSurface);
  const setPlannerPlinthSurface = usePlannerStore((s) => s.setPlannerPlinthSurface);
  const resetScene = usePlannerStore((s) => s.resetScene);
  const setShowRoomDesigner = usePlannerStore((s) => s.setShowRoomDesigner);
  const mergeSavedWardrobesIntoCatalog = usePlannerStore((s) => s.mergeSavedWardrobesIntoCatalog);
  const hydrated = useHydration();
  const plannerSavedWardrobes = useStore((s) => s.plannerSavedWardrobes);
  const removePlannerSavedWardrobe = useStore((s) => s.removePlannerSavedWardrobe);
  const resolvedAdmin = useResolvedAdmin();
  const currency = resolvedAdmin?.currency ?? "USD";
  const surfaceEstimates = useMemo(
    () =>
      (["floor", "wall", "ceiling"] as const)
        .map((kind) => estimateSurfaceMaterial(room, kind))
        .filter((estimate): estimate is SurfaceMaterialEstimate => estimate !== null),
    [room],
  );

  useEffect(() => {
    if (!hydrated || (plannerConfig?.id !== "bedroom" && plannerConfig?.id !== "ai-room")) return;
    mergeSavedWardrobesIntoCatalog();
  }, [hydrated, plannerSavedWardrobes, mergeSavedWardrobesIntoCatalog, plannerConfig?.id]);

  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set()
  );
  const [appearanceExpanded, setAppearanceExpanded] = useState({
    floor: false,
    plinth: false,
    walls: false,
    ceiling: false,
  });

  const toggleAppearanceSection = (section: keyof typeof appearanceExpanded) => {
    setAppearanceExpanded((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const [roomSetupExpanded, setRoomSetupExpanded] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(ROOM_SETUP_EXPANDED_KEY) === "1") {
        setRoomSetupExpanded(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const toggleRoomSetup = () => {
    setRoomSetupExpanded((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(ROOM_SETUP_EXPANDED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const toggleCategory = (navKey: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(navKey)) {
        next.delete(navKey);
      } else {
        next.add(navKey);
      }
      return next;
    });
  };

  const filteredCatalog = useMemo(() => {
    const items =
      plannerConfig?.id === "bedroom"
        ? catalog.filter((c) => !isYourWardrobesCategory(c.category))
        : catalog;
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter((item) => {
      const labelBlob = [
        ...catalogItemAllCategoryLabels(item),
        item.subCategory ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        labelBlob.includes(q) ||
        (item.vendor && item.vendor.toLowerCase().includes(q))
      );
    });
  }, [catalog, searchQuery, plannerConfig?.id]);

  const useSubCategories = plannerConfig?.id === "kitchen";

  const groupedSections = useMemo(() => {
    const rowKey = (item: PlannerCatalogItem) =>
      useSubCategories && item.subCategory ? item.subCategory : item.category;

    const useModeGrouping =
      plannerConfig?.groupCatalogByMode === true &&
      plannerConfig?.id !== "kitchen" &&
      plannerConfig?.id !== "bedroom";

    type Section = { sectionId: string; sectionTitle: string | null; groups: Map<string, PlannerCatalogItem[]> };

    const buildGroups = (list: PlannerCatalogItem[]) => {
      const map = new Map<string, PlannerCatalogItem[]>();
      for (const item of list) {
        const k = rowKey(item);
        const g = map.get(k) ?? [];
        g.push(item);
        map.set(k, g);
      }
      return map;
    };

    if (!useModeGrouping) {
      return [
        {
          sectionId: "__flat__",
          sectionTitle: null,
          groups: buildGroups(filteredCatalog),
        },
      ] satisfies Section[];
    }

    const LABEL: Record<string, string> = {
      "mode-furniture": "Furniture & rooms",
      "mode-soft-furniture": "Soft furniture",
      "mode-home-tech": "Home & tech",
    };
    const ORDER = ["mode-furniture", "mode-soft-furniture", "mode-home-tech"] as const;
    const buckets = new Map<string, PlannerCatalogItem[]>();
    const pushBucket = (key: string, item: PlannerCatalogItem) => {
      const row = buckets.get(key) ?? [];
      row.push(item);
      buckets.set(key, row);
    };
    for (const item of filteredCatalog) {
      const mid =
        typeof item.modeId === "string" && item.modeId !== "" ? item.modeId : "__other__";
      const bucketKey = mid in LABEL ? mid : "__other__";
      pushBucket(bucketKey, item);
    }

    const sections: Section[] = [];
    for (const id of ORDER) {
      const list = buckets.get(id);
      if (list?.length) {
        sections.push({ sectionId: id, sectionTitle: LABEL[id] ?? id, groups: buildGroups(list) });
      }
    }
    const otherList = buckets.get("__other__");
    if (otherList?.length) {
      sections.push({
        sectionId: "__other__",
        sectionTitle: "More",
        groups: buildGroups(otherList),
      });
    }

    return sections.length > 0
      ? sections
      : [{ sectionId: "__flat__", sectionTitle: null, groups: buildGroups(filteredCatalog) }];
  }, [filteredCatalog, useSubCategories, plannerConfig]);

  const categoryNavKey = (sectionId: string, catKey: string) =>
    sectionId === "__flat__" ? catKey : `${sectionId}::${catKey}`;

  const title = plannerConfig?.name ?? "Room Planner";

  const applyCatalogSurface = (item: PlannerCatalogItem, target: RoomSurfaceCatalogTarget) => {
    if (!item.imageUrl) return;
    // Use explicit surface texture dimensions when available; fall back to furniture footprint heuristic.
    const fallback = catalogItemVisibleTextureSizeCm(item);
    const textureWidthCm = item.surfaceTextureWidthCm ?? fallback.textureWidthCm;
    const textureHeightCm = item.surfaceTextureHeightCm ?? fallback.textureHeightCm;
    // Product (item/board) dimensions override texture dims when set separately.
    const productWidthCm = item.surfaceItemWidthCm ?? textureWidthCm;
    const productHeightCm = item.surfaceItemHeightCm ?? textureHeightCm;

    if (target === "floor") {
      setPlannerFloorSurface({
        floorMaterialMode: "customImage",
        floorCustomTextureUrl: item.imageUrl,
        floorTextureWidthCm: textureWidthCm,
        floorTextureHeightCm: textureHeightCm,
        floorMaterialProductWidthCm: productWidthCm,
        floorMaterialProductHeightCm: productHeightCm,
        floorMaterialName: item.name,
        floorMaterialUnit: "piece",
        floorMaterialPricePerUnit: item.price,
      });
      return;
    }

    setPlannerWallCeilingSurface(
      target === "wall"
        ? {
            wallMaterialMode: "customImage",
            wallCustomTextureUrl: item.imageUrl,
            wallTextureWidthCm: textureWidthCm,
            wallTextureHeightCm: textureHeightCm,
            wallMaterialProductWidthCm: productWidthCm,
            wallMaterialProductHeightCm: productHeightCm,
            wallMaterialName: item.name,
            wallMaterialUnit: "piece",
            wallMaterialPricePerUnit: item.price,
          }
        : {
            ceilingMaterialMode: "customImage",
            ceilingCustomTextureUrl: item.imageUrl,
            ceilingTextureWidthCm: textureWidthCm,
            ceilingTextureHeightCm: textureHeightCm,
            ceilingMaterialProductWidthCm: productWidthCm,
            ceilingMaterialProductHeightCm: productHeightCm,
            ceilingMaterialName: item.name,
            ceilingMaterialUnit: "piece",
            ceilingMaterialPricePerUnit: item.price,
          },
    );
  };

  return (
    <aside className="planner-sidebar">
      {/* Logo / Title */}
      <div className="sidebar-header">
        <div className="flex items-center gap-2">
          {plannerConfig && (
            <Link
              href="/planners"
              className="btn-icon"
              title="Back to planners"
            >
              <ChevronLeft size={16} />
            </Link>
          )}
          <h1 className="sidebar-title">{title}</h1>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-icon"
            onClick={() => setShowRoomDesigner(true)}
            title="Room Designer"
          >
            <Home size={16} />
          </button>
          <button
            className="btn-icon btn-danger-subtle"
            onClick={resetScene}
            title="Reset scene"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      {/* Room dimensions + appearance — collapsed by default; reopen when you need to edit */}
      <div className="sidebar-section">
        <button
          type="button"
          className="sidebar-room-setup-header"
          onClick={toggleRoomSetup}
          aria-expanded={roomSetupExpanded}
        >
          <ChevronRight
            size={16}
            className={`sidebar-room-setup-chevron${roomSetupExpanded ? " sidebar-room-setup-chevron--open" : ""}`}
            aria-hidden
          />
          <span className="section-label mb-0 flex min-w-0 items-center gap-1.5">
            <Ruler size={14} className="shrink-0 opacity-70" aria-hidden />
            Room setup
          </span>
        </button>
        {!roomSetupExpanded && (
          <p className="sidebar-room-setup-summary">
            {formatLengthLabel(room.width, lengthUnit)} × {formatLengthLabel(room.depth, lengthUnit)} ×{" "}
            {formatLengthLabel(room.height, lengthUnit)}
            <span className="text-[var(--muted-foreground)]"> — walls &amp; floor</span>
          </p>
        )}
        {roomSetupExpanded && (
          <div className="sidebar-room-setup-content">
            <div className="sidebar-room-setup-subheading flex items-center justify-between gap-2">
              <span>Dimensions</span>
              <LengthUnitToggle />
            </div>
            <div className="room-sliders">
              <label className="slider-row">
                <span className="slider-label">Width</span>
                <input
                  type="range"
                  min={metersToDisplay(ROOM_PLAN_MIN_M, lengthUnit)}
                  max={metersToDisplay(ROOM_PLAN_MAX_M, lengthUnit)}
                  step={lengthUnit === "in" ? 1 : lengthUnit === "mm" ? 50 : 5}
                  value={metersToDisplay(room.width, lengthUnit)}
                  onChange={(e) => {
                    const m = displayToMeters(Number(e.target.value), lengthUnit);
                    const w = Math.min(
                      ROOM_PLAN_MAX_M,
                      Math.max(ROOM_PLAN_MIN_M, m)
                    );
                    const next = { ...room, width: w };
                    setRoom({ ...next, openings: clampOpeningsForRoom(next) });
                  }}
                />
                <span className="slider-value">
                  {formatLengthLabel(room.width, lengthUnit)}
                </span>
              </label>
              <label className="slider-row">
                <span className="slider-label">Depth</span>
                <input
                  type="range"
                  min={metersToDisplay(ROOM_PLAN_MIN_M, lengthUnit)}
                  max={metersToDisplay(ROOM_PLAN_MAX_M, lengthUnit)}
                  step={lengthUnit === "in" ? 1 : lengthUnit === "mm" ? 50 : 5}
                  value={metersToDisplay(room.depth, lengthUnit)}
                  onChange={(e) => {
                    const m = displayToMeters(Number(e.target.value), lengthUnit);
                    const d = Math.min(
                      ROOM_PLAN_MAX_M,
                      Math.max(ROOM_PLAN_MIN_M, m)
                    );
                    const next = { ...room, depth: d };
                    setRoom({ ...next, openings: clampOpeningsForRoom(next) });
                  }}
                />
                <span className="slider-value">
                  {formatLengthLabel(room.depth, lengthUnit)}
                </span>
              </label>
              <label className="slider-row">
                <span className="slider-label">Height</span>
                <input
                  type="range"
                  min={metersToDisplay(ROOM_HEIGHT_MIN_M, lengthUnit)}
                  max={metersToDisplay(ROOM_HEIGHT_MAX_M, lengthUnit)}
                  step={lengthUnit === "in" ? 0.5 : lengthUnit === "mm" ? 20 : 2}
                  value={metersToDisplay(room.height, lengthUnit)}
                  onChange={(e) => {
                    const m = displayToMeters(Number(e.target.value), lengthUnit);
                    const h = Math.min(
                      ROOM_HEIGHT_MAX_M,
                      Math.max(ROOM_HEIGHT_MIN_M, m)
                    );
                    const openings = (room.openings || []).map((o) => {
                      const oh = o.height ?? defaultOpeningHeight(o.type);
                      if (oh <= h) return o;
                      return { ...o, height: h };
                    });
                    setRoom({ ...room, height: h, openings });
                  }}
                />
                <span className="slider-value">
                  {formatLengthLabel(room.height, lengthUnit)}
                </span>
              </label>
            </div>

            <h3 className="sidebar-room-setup-subheading flex items-center gap-2">
              <Palette size={14} />
              Appearance
            </h3>
            <div className="space-y-3">
              <AppearanceSection
                title="Floor"
                description="Presets, custom image, or tile grid"
                expanded={appearanceExpanded.floor}
                onToggle={() => toggleAppearanceSection("floor")}
              >
                <PlannerFloorSurfaceControls
                  presetVariant="swatches"
                  floorStyle={room.floorStyle ?? "laminate-natural-oak"}
                  mode={room.floorMaterialMode}
                  textureUrl={room.floorCustomTextureUrl}
                  uvRotationDeg={room.floorUvRotationDeg}
                  textureStartSide={room.floorTextureStartSide}
                  layoutPattern={room.floorLayoutPattern}
                  tileWcm={room.floorTileWidthCm}
                  tileHcm={room.floorTileHeightCm}
                  groutCm={room.floorTileGroutCm}
                  groutColor={room.floorTileGroutColor}
                  textureWidthCm={room.floorTextureWidthCm}
                  textureHeightCm={room.floorTextureHeightCm}
                  allowUpload
                  adminSlug={resolvedAdmin?.slug}
                  onPresetPick={(style) => setFloorStyle(style)}
                  onPatch={(patch) => setPlannerFloorSurface(patch)}
                />
              </AppearanceSection>

              <AppearanceSection
                title="Plinth / Skirting"
                description="Baseboard strip along floor edges"
                expanded={appearanceExpanded.plinth}
                onToggle={() => toggleAppearanceSection("plinth")}
              >
                <PlannerPlinthControls
                  enabled={room.plinthEnabled ?? true}
                  heightCm={room.plinthHeightCm ?? 8}
                  depthCm={room.plinthDepthCm ?? 1.2}
                  color={room.plinthColor ?? "#f0eeec"}
                  mode={room.plinthMaterialMode ?? "color"}
                  textureUrl={room.plinthCustomTextureUrl}
                  materialName={room.plinthMaterialName}
                  allowUpload
                  adminSlug={resolvedAdmin?.slug}
                  onPatch={(patch) => setPlannerPlinthSurface(patch)}
                />
              </AppearanceSection>

              <AppearanceSection
                title="Walls"
                description="Tint and optional wallpaper texture"
                expanded={appearanceExpanded.walls}
                onToggle={() => toggleAppearanceSection("walls")}
              >
                <PlannerInteriorSurfaceControls
                  title="Wall finish"
                  prefix="wall"
                  mode={room.wallMaterialMode}
                  textureUrl={room.wallCustomTextureUrl}
                  uvRepeatX={room.wallUvRepeatX}
                  uvRepeatY={room.wallUvRepeatY}
                  uvRotationDeg={room.wallUvRotationDeg}
                  tileWcm={room.wallTileWidthCm}
                  tileHcm={room.wallTileHeightCm}
                  groutCm={room.wallTileGroutCm}
                  groutColor={room.wallTileGroutColor}
                  textureWidthCm={room.wallTextureWidthCm}
                  textureHeightCm={room.wallTextureHeightCm}
                  allowUpload
                  adminSlug={resolvedAdmin?.slug}
                  onPatch={(patch) => setPlannerWallCeilingSurface(patch)}
                />
                {(room.wallMaterialMode ?? "color") === "color" ? (
                  <div className="mt-2">
                    <label className="block text-xs text-[var(--muted-foreground)] mb-1.5">Wall color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={room.wallColor ?? "#fafafa"}
                        onChange={(e) => setWallColor(e.target.value)}
                        className="w-10 h-10 rounded-lg border border-[var(--border)] cursor-pointer bg-transparent"
                      />
                      <input
                        type="text"
                        value={room.wallColor ?? "#fafafa"}
                        onChange={(e) => setWallColor(e.target.value)}
                        className="flex-1 px-2 py-1.5 text-sm border border-[var(--border)] rounded-md"
                      />
                    </div>
                  </div>
                ) : null}
              </AppearanceSection>

              <AppearanceSection
                title="Ceiling"
                description="Derived tint or texture"
                expanded={appearanceExpanded.ceiling}
                onToggle={() => toggleAppearanceSection("ceiling")}
              >
                <PlannerInteriorSurfaceControls
                  title="Ceiling finish"
                  prefix="ceiling"
                  mode={room.ceilingMaterialMode}
                  textureUrl={room.ceilingCustomTextureUrl}
                  uvRepeatX={room.ceilingUvRepeatX}
                  uvRepeatY={room.ceilingUvRepeatY}
                  uvRotationDeg={room.ceilingUvRotationDeg}
                  tileWcm={room.ceilingTileWidthCm}
                  tileHcm={room.ceilingTileHeightCm}
                  groutCm={room.ceilingTileGroutCm}
                  groutColor={room.ceilingTileGroutColor}
                  textureWidthCm={room.ceilingTextureWidthCm}
                  textureHeightCm={room.ceilingTextureHeightCm}
                  allowUpload
                  adminSlug={resolvedAdmin?.slug}
                  onPatch={(patch) => setPlannerWallCeilingSurface(patch)}
                />
              </AppearanceSection>
              {surfaceEstimates.length > 0 && (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--accent)]/40 p-3">
                  <div className="text-xs font-semibold text-[var(--foreground)]">
                    Material estimate
                  </div>
                  <div className="mt-2 space-y-2">
                    {surfaceEstimates.map((estimate) => (
                      <div
                        key={estimate.label}
                        className="flex items-start justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-[var(--foreground)]">
                            {estimate.label}
                          </div>
                          <div className="text-[var(--muted-foreground)]">
                            {estimate.materialName ? `${estimate.materialName} · ` : ""}
                            {formatSurfaceQuantity(estimate)}
                          </div>
                        </div>
                        {estimate.cost !== null && (
                          <div className="shrink-0 font-medium text-[var(--foreground)]">
                            {formatPrice(estimate.cost, currency)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {plannerConfig?.id === "bedroom" && plannerSavedWardrobes.length > 0 && (
        <div className="sidebar-section">
          <h3 className="section-label flex items-center gap-2">
            <Shirt size={14} />
            Your wardrobes
          </h3>
          <p className="text-xs text-[var(--muted-foreground)] mb-2">
            Saved from Wardrobe planner (Save or bed icon in the wardrobe header). Click + to place; remove only deletes the saved preset, not items already in the room.
          </p>
          <div className="space-y-2">
            {plannerSavedWardrobes.map((w) => {
              const fp = wardrobeFootprintMeters(w.config);
              return (
              <div key={w.id} className="catalog-item">
                <div
                  className="catalog-swatch flex items-center justify-center bg-[var(--muted)] text-[10px] font-medium text-center px-1"
                  title="Custom wardrobe"
                >
                  Custom
                </div>
                <div className="catalog-info">
                  <span className="catalog-name">{w.name}</span>
                  <span className="catalog-meta">
                    {formatLengthLabel(fp.width, lengthUnit)}×
                    {formatLengthLabel(fp.depth, lengthUnit)}×
                    {formatLengthLabel(fp.height, lengthUnit)}
                  </span>
                  <span className="catalog-price">
                    {formatPrice(w.cachedPrice, currency)}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-add"
                  onClick={() => addItem(w.id)}
                  title={`Add ${w.name}`}
                >
                  <Plus size={16} />
                </button>
                <button
                  type="button"
                  className="btn-icon btn-danger-subtle shrink-0"
                  onClick={() => removePlannerSavedWardrobe(w.id)}
                  title="Remove saved wardrobe"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
            })}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="sidebar-section">
        <div className="search-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search furniture..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      {/* Catalog */}
      <div className="catalog-list custom-scrollbar">
        {groupedSections.map((section) => (
          <div key={section.sectionId} className={section.sectionTitle ? "mb-4" : undefined}>
            {section.sectionTitle ? (
              <h3 className="px-1 py-2.5 mb-1 text-[13px] font-semibold leading-snug tracking-normal text-[#1A1A1A] normal-case">
                {section.sectionTitle}
              </h3>
            ) : null}
                {Array.from(section.groups.entries()).map(([category, items]) => {
              const navKey = categoryNavKey(section.sectionId, category);
              const isCollapsed = collapsedCategories.has(navKey);
              return (
                <div key={navKey} className="catalog-group">
                  <button
                    className="catalog-category"
                    onClick={() => toggleCategory(navKey)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      width: "100%",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "0",
                      font: "inherit",
                      color: "inherit",
                      textAlign: "left",
                    }}
                  >
                    {isCollapsed ? (
                      <ChevronRight size={14} />
                    ) : (
                      <ChevronDown size={14} />
                    )}
                    {categoryIcons[category] ?? <Package size={14} />}
                    <span style={{ flex: 1 }}>{category}</span>
                    <span
                      style={{
                        fontSize: "11px",
                        opacity: 0.5,
                        fontWeight: 400,
                      }}
                    >
                      {items.length}
                    </span>
                  </button>
                  {!isCollapsed &&
                    items.map((item) => {
                      const surfaceTarget = catalogSurfaceTarget(item);
                      return (
                        <div key={item.id} className="catalog-item">
                          <ModelThumbnail
                            item={item}
                            className="catalog-swatch"
                          />
                          <div className="catalog-info">
                            <span className="catalog-name">{item.name}</span>
                            <span className="catalog-meta">
                              {surfaceTarget
                                ? `${surfaceTarget[0]!.toUpperCase()}${surfaceTarget.slice(1)} texture`
                                : `${formatLengthLabel(item.width, lengthUnit)}×${formatLengthLabel(item.depth, lengthUnit)}×${formatLengthLabel(item.height, lengthUnit)}`}
                            </span>
                            <span className="catalog-price">
                              {formatPrice(item.price, currency)}
                            </span>
                          </div>
                          <button
                            className="btn-add"
                            onClick={() =>
                              surfaceTarget ? applyCatalogSurface(item, surfaceTarget) : addItem(item.id)
                            }
                            disabled={Boolean(surfaceTarget && !item.imageUrl)}
                            title={
                              surfaceTarget
                                ? item.imageUrl
                                  ? `Apply ${item.name} to ${surfaceTarget}`
                                  : `${item.name} needs an image to be used as a texture`
                                : `Add ${item.name}`
                            }
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </div>
        ))}
        {filteredCatalog.length === 0 && (
          <p className="catalog-empty">No items match your search.</p>
        )}
      </div>
    </aside>
  );
}
