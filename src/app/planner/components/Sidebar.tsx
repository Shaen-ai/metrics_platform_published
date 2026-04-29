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
import type { FloorStyle } from "../types";
import { LAMINATE_OPTIONS } from "../types";
import FloorSwatch from "./FloorSwatch";
import { wardrobeFootprintMeters, isYourWardrobesCategory } from "../wardrobe/plannerWardrobeCatalog";
import { catalogItemAllCategoryLabels } from "@/lib/catalogItemCategories";

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
  const resetScene = usePlannerStore((s) => s.resetScene);
  const setShowRoomDesigner = usePlannerStore((s) => s.setShowRoomDesigner);
  const mergeSavedWardrobesIntoCatalog = usePlannerStore((s) => s.mergeSavedWardrobesIntoCatalog);
  const hydrated = useHydration();
  const plannerSavedWardrobes = useStore((s) => s.plannerSavedWardrobes);
  const removePlannerSavedWardrobe = useStore((s) => s.removePlannerSavedWardrobe);
  const resolvedAdmin = useResolvedAdmin();
  const currency = resolvedAdmin?.currency ?? "USD";

  useEffect(() => {
    if (!hydrated || (plannerConfig?.id !== "bedroom" && plannerConfig?.id !== "ai-room")) return;
    mergeSavedWardrobesIntoCatalog();
  }, [hydrated, plannerSavedWardrobes, mergeSavedWardrobesIntoCatalog, plannerConfig?.id]);

  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set()
  );

  const [roomSetupExpanded, setRoomSetupExpanded] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(ROOM_SETUP_EXPANDED_KEY) === "1";
    } catch {
      return false;
    }
  });

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

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const filteredCatalog = useMemo(() => {
    let items =
      plannerConfig?.id === "bedroom"
        ? catalog.filter((c) => !isYourWardrobesCategory(c.category))
        : catalog;
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter((item) => {
      const labelBlob = catalogItemAllCategoryLabels(item).join(" ").toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        labelBlob.includes(q) ||
        (item.vendor && item.vendor.toLowerCase().includes(q))
      );
    });
  }, [catalog, searchQuery, plannerConfig?.id]);

  const useSubCategories = plannerConfig?.id === "kitchen";

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filteredCatalog>();
    for (const item of filteredCatalog) {
      const key = useSubCategories && item.subCategory ? item.subCategory : item.category;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [filteredCatalog, useSubCategories]);

  const title = plannerConfig?.name ?? "Room Planner";

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
              <div>
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
              <div>
                <label className="block text-xs text-[var(--muted-foreground)] mb-1.5">
                  Floor style — Laminate planks
                </label>
                <div className="floor-style-grid">
                  {LAMINATE_OPTIONS.map(({ value, label }) => (
                    <FloorSwatch
                      key={value}
                      style={value}
                      label={label}
                      selected={(room.floorStyle ?? "laminate-natural-oak") === value}
                      onClick={() => setFloorStyle(value)}
                    />
                  ))}
                </div>
              </div>
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
            Saved from Wardrobe planner (header bed icon). Click + to place; remove only deletes the saved preset, not items already in the room.
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
        {Array.from(grouped.entries()).map(([category, items]) => {
          const isCollapsed = collapsedCategories.has(category);
          return (
            <div key={category} className="catalog-group">
              <button
                className="catalog-category"
                onClick={() => toggleCategory(category)}
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
                items.map((item) => (
                  <div key={item.id} className="catalog-item">
                    <ModelThumbnail
                      item={item}
                      className="catalog-swatch"
                    />
                    <div className="catalog-info">
                      <span className="catalog-name">{item.name}</span>
                      <span className="catalog-meta">
                        {formatLengthLabel(item.width, lengthUnit)}×
                        {formatLengthLabel(item.depth, lengthUnit)}×
                        {formatLengthLabel(item.height, lengthUnit)}
                      </span>
                      <span className="catalog-price">
                        {formatPrice(item.price, currency)}
                      </span>
                    </div>
                    <button
                      className="btn-add"
                      onClick={() => addItem(item.id)}
                      title={`Add ${item.name}`}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                ))}
            </div>
          );
        })}
        {filteredCatalog.length === 0 && (
          <p className="catalog-empty">No items match your search.</p>
        )}
      </div>
    </aside>
  );
}
