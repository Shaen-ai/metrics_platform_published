"use client";

import { useEffect, useState, useMemo, useId } from "react";
import { createPortal } from "react-dom";
import {
  ChevronRight,
  ChevronLeft,
  Columns3,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  LayoutGrid,
  DoorOpen,
  Grip,
  Paintbrush,
  Box,
  Home,
  RefreshCw,
  Copy,
  Search,
  X,
} from "lucide-react";
import { useWardrobeStore } from "./store";
import { useResolvedAdmin } from "@/contexts/PublishedTenantProvider";
import { api } from "@/lib/api";
import { mapTemplateRowToMaterial, type PublicMaterialTemplateRow } from "@/lib/materialTemplateToMaterial";
import {
  isWardrobeBoardFinishMaterial,
  isWardrobeDoorFinishMaterial,
} from "@/lib/plannerMaterials";
import { formatPrice } from "@/lib/utils";
import { useWardrobeSheetLayout } from "../sheet/useWardrobeSheetLayout";
import {
  FRAME_MIN_WIDTH,
  FRAME_MAX_WIDTH,
  FRAME_MIN_HEIGHT,
  FRAME_MAX_HEIGHT,
  FRAME_MIN_DEPTH,
  FRAME_MAX_DEPTH,
  COMPONENT_CATALOG,
  HANDLES,
  SHELF_PIN_SPACING,
  SECTION_MIN_WIDTH_CM,
  totalInteriorSectionWidthsCm,
  LEG_HEIGHT_MIN,
  LEG_HEIGHT_MAX,
  PLINTH_HEIGHT_MIN,
  PLINTH_HEIGHT_MAX,
  clampWardrobeBase,
  totalWardrobeHeightCm,
  wardrobeBaseLiftCm,
  INTERNAL_RENDER_FALLBACK,
  groupWardrobeMaterialsByBrand,
  getComponentDef,
  PANEL_THICKNESS,
  wardrobeInteriorStackGapCm,
  MIN_SHELF_WIDTH_CM,
  MIN_SHELF_DEPTH_CM,
  shelfEffectiveWidthCm,
  shelfMaxWidthCm,
  shelfMaxDepthCm,
  shelfPanelDepthCm,
  wardrobeDoorPanelMaterialIdsLength,
  hingedDoorCountForSection,
  materialsFromStore,
  wardrobeManufacturerRowForDoorPool,
  wardrobeManufacturerRowForFramePool,
} from "./data";
import type { WardrobeMaterial } from "./data";
import type {
  DoorType,
  GrainDirection,
  HingedDoorHandleSide,
  WardrobeAddon,
  WardrobeBaseType,
  ShelfDepthPlacement,
  WardrobeSpaceLayoutPreset,
  WardrobeWalkInVariant,
  WardrobeCornerAttachment,
  WardrobePrimaryRun,
} from "./types";
import { PlannerFloorSurfaceControls } from "../components/PlannerFloorSurfaceControls";
import { PlannerInteriorSurfaceControls } from "../components/PlannerInteriorSurfaceControls";
import {
  WARDROBE_BRIDGE_LIFT_DEFAULT_CM,
  WARDROBE_BRIDGE_LIFT_MIN_CM,
  WARDROBE_BRIDGE_LIFT_MAX_CM,
  maxBackWallWidthCm,
  wardrobeRoomHalfExtents,
} from "./wardrobeSpaceLayout";
import { LengthUnitToggleButtons } from "../components/LengthUnitToggle";
import {
  ROOM_PLAN_MIN_M,
  ROOM_PLAN_MAX_M,
  ROOM_HEIGHT_MIN_M,
  ROOM_HEIGHT_MAX_M,
  metersToDisplay,
  displayToMeters,
  formatLengthLabel,
} from "../utils/units";
import type { LengthUnit } from "../types";

type SidebarPanel =
  | "home"
  | "frames"
  | "interiors"
  | "doors"
  | "handles"
  | "materials"
  | "room";

const CATEGORIES: {
  id: SidebarPanel;
  label: string;
  icon: React.ReactNode;
}[] = [
  { id: "frames", label: "Wardrobe frame", icon: <Box size={20} /> },
  { id: "interiors", label: "Interiors", icon: <LayoutGrid size={20} /> },
  { id: "doors", label: "Doors", icon: <DoorOpen size={20} /> },
  { id: "handles", label: "Handles", icon: <Grip size={20} /> },
  { id: "materials", label: "Materials", icon: <Paintbrush size={20} /> },
  { id: "room", label: "Room", icon: <Home size={20} /> },
];

/** Stable fallback so Zustand selectors do not return a new [] each snapshot. */
const EMPTY_WARDROBE_ADDONS: WardrobeAddon[] = [];

/** Avoid `browseCatalogMaterials = []` defaults (new identity each render). */
const EMPTY_MANUFACTURER_CATALOG_MATERIALS: WardrobeMaterial[] = [];

const WARDROBE_BROWSE_CATALOG_SUBTITLE =
  "Full manufacturer template library — the same catalog as Admin → Materials → Import from manufacturer catalog.";

export default function ConfigSidebar() {
  const [panel, setPanel] = useState<SidebarPanel>("home");

  if (panel === "home") {
    return (
      <div className="sidebar-inner">
        <div className="sidebar-home-header">
          <h2 className="sidebar-home-title">Design your Wardrobe</h2>
        </div>
        <nav className="sidebar-category-list">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              className="sidebar-category-row"
              onClick={() => setPanel(cat.id)}
            >
              <span className="sidebar-cat-icon">{cat.icon}</span>
              <span className="sidebar-cat-label">{cat.label}</span>
              <ChevronRight size={18} className="sidebar-cat-arrow" />
            </button>
          ))}
        </nav>
      </div>
    );
  }

  const currentCat = CATEGORIES.find((c) => c.id === panel);

  return (
    <div className="sidebar-inner">
      <button className="sidebar-back-row" onClick={() => setPanel("home")}>
        <ChevronLeft size={18} />
        <span>{currentCat?.label ?? "Back"}</span>
      </button>
      <div className="sidebar-panel-scroll">
        {panel === "frames" && <FramesPanel />}
        {panel === "interiors" && <InteriorsPanel />}
        {panel === "doors" && <DoorsPanel />}
        {panel === "handles" && <HandlesPanel />}
        {panel === "materials" && <MaterialsPanel />}
        {panel === "room" && <RoomPanel />}
      </div>
    </div>
  );
}

/* ── Frames Panel ────────────────────────────────────────────────── */

function clampCm(v: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, v)));
}

/**
 * Number input that keeps a local draft string while the user types so they can
 * freely clear/edit the field. The external `value` is only updated on blur or
 * Enter (via `onCommit`), at which point the value is clamped to [min, max].
 * External changes to `value` (e.g. from a linked slider) are reflected back
 * into the draft automatically.
 */
function DimInput({
  value,
  min,
  max,
  step = 1,
  decimals = 0,
  className = "cfg-num-input",
  ariaLabel,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  decimals?: number;
  className?: string;
  ariaLabel?: string;
  onCommit: (v: number) => void;
}) {
  const format = (n: number) =>
    decimals > 0 ? (Math.round(n * 10 ** decimals) / 10 ** decimals).toString() : String(Math.round(n));
  const [draft, setDraft] = useState<string>(() => format(value));

  useEffect(() => {
    setDraft(format(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(format(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, parsed));
    const rounded =
      decimals > 0 ? Math.round(clamped * 10 ** decimals) / 10 ** decimals : Math.round(clamped);
    onCommit(rounded);
    setDraft(format(rounded));
  };

  return (
    <input
      type="number"
      className={className}
      min={min}
      max={max}
      step={step}
      value={draft}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
    />
  );
}

const FOOTPRINT_PRESETS: {
  id: WardrobeSpaceLayoutPreset;
  title: string;
  description: string;
}[] = [
  {
    id: "linear",
    title: "Straight run",
    description: "Single wall — classic built-in along one side.",
  },
  {
    id: "l_shape",
    title: "L-shaped wardrobe",
    description: "Two perpendicular walls meet at a corner.",
  },
  {
    id: "u_shape",
    title: "U-shaped wardrobe",
    description: "Three sides wrapped — maximum hanging and storage.",
  },
  {
    id: "parallel",
    title: "Parallel / galley",
    description: "Face-to-face runs — narrow dressing corridor.",
  },
  {
    id: "walk_in",
    title: "Walk-in closet",
    description: "Pick footprint: U, L, parallel, or island-in-the-middle.",
  },
  {
    id: "island_walk_in",
    title: "Island walk-in",
    description: "U-shaped perimeter plus a center island run.",
  },
  {
    id: "bridge",
    title: "Bridge wardrobe",
    description: "Overhead cabinets — elevated span above a doorway or opening.",
  },
];

const WALK_IN_VARIANTS: { id: WardrobeWalkInVariant; label: string }[] = [
  { id: "u", label: "U layout" },
  { id: "l", label: "L layout" },
  { id: "parallel", label: "Parallel / galley" },
  { id: "island", label: "Island layout" },
];

function wardrobePrimaryRunOptions(
  preset: WardrobeSpaceLayoutPreset,
  walkInVariant: WardrobeWalkInVariant,
): { id: WardrobePrimaryRun; label: string }[] {
  if (preset === "parallel" || (preset === "walk_in" && walkInVariant === "parallel")) {
    return [
      { id: "left", label: "Wall A (first run)" },
      { id: "right", label: "Wall B (opposite)" },
    ];
  }
  if (preset === "l_shape" || (preset === "walk_in" && walkInVariant === "l")) {
    return [
      { id: "back", label: "Back wall" },
      { id: "side", label: "Return wing" },
    ];
  }
  if (
    preset === "u_shape" ||
    preset === "island_walk_in" ||
    (preset === "walk_in" && (walkInVariant === "u" || walkInVariant === "island"))
  ) {
    return [
      { id: "back", label: "Back wall" },
      { id: "left", label: "Left wing" },
      { id: "right", label: "Right wing" },
    ];
  }
  return [];
}

function WardrobeFootprintSection() {
  const room = useWardrobeStore((s) => s.room);
  const preset = useWardrobeStore((s) => s.room.spaceLayoutPreset ?? "linear");
  const walkInVariant = useWardrobeStore((s) => s.room.walkInVariant ?? "u");
  const frameDepthCm = useWardrobeStore((s) => s.config.frame.depth);
  const frameWidthCm = useWardrobeStore((s) => s.config.frame.width);
  const bridgeLiftCm = useWardrobeStore(
    (s) => s.room.bridgeLiftCm ?? WARDROBE_BRIDGE_LIFT_DEFAULT_CM,
  );
  const cornerAttachment = room.wardrobeCornerAttachment ?? "left";
  const primaryRun = room.wardrobePrimaryRun;
  const setSpaceLayoutPreset = useWardrobeStore((s) => s.setSpaceLayoutPreset);
  const setWalkInVariant = useWardrobeStore((s) => s.setWalkInVariant);
  const setBridgeLiftCm = useWardrobeStore((s) => s.setBridgeLiftCm);
  const setWardrobeCornerAttachment = useWardrobeStore((s) => s.setWardrobeCornerAttachment);
  const setWardrobePrimaryRun = useWardrobeStore((s) => s.setWardrobePrimaryRun);

  const showCornerControls =
    preset === "l_shape" ||
    preset === "u_shape" ||
    preset === "island_walk_in" ||
    (preset === "walk_in" && (walkInVariant === "u" || walkInVariant === "l" || walkInVariant === "island"));

  const primaryOpts = wardrobePrimaryRunOptions(
    preset,
    preset === "walk_in" ? walkInVariant : "u",
  );
  const showPrimaryControls = primaryOpts.length > 0;

  const { hw } = wardrobeRoomHalfExtents(room);
  const maxBackCm = maxBackWallWidthCm(hw, frameDepthCm * 0.01);
  const showBackSpanNote =
    showCornerControls &&
    (preset === "u_shape" ||
      preset === "island_walk_in" ||
      preset === "l_shape" ||
      (preset === "walk_in" && (walkInVariant === "u" || walkInVariant === "l" || walkInVariant === "island"))) &&
    frameWidthCm > maxBackCm + 0.5;

  return (
    <div className="cfg-group wardrobe-footprint-section">
      <span className="cfg-label">Wardrobe footprint</span>
      <span className="cfg-sublabel">
        How many wall runs use your design — pricing and sheet cuts scale per run. L/U back walls
        automatically fit between wing depths (no overlapping corners). Set preview room size under{" "}
        <strong>Room</strong>.
      </span>
      <div className="wardrobe-footprint-grid">
        {FOOTPRINT_PRESETS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`wardrobe-footprint-card ${preset === opt.id ? "active" : ""}`}
            onClick={() => setSpaceLayoutPreset(opt.id)}
          >
            <span className="wardrobe-footprint-card-title">{opt.title}</span>
            <span className="wardrobe-footprint-card-desc">{opt.description}</span>
          </button>
        ))}
      </div>

      {preset === "walk_in" && (
        <div className="wardrobe-footprint-walkin-sub">
          <span className="cfg-label">Walk-in footprint</span>
          <div className="wardrobe-footprint-chip-row">
            {WALK_IN_VARIANTS.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`cfg-chip ${walkInVariant === v.id ? "active" : ""}`}
                onClick={() => setWalkInVariant(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {showCornerControls && (
        <div className="wardrobe-footprint-walkin-sub">
          <span className="cfg-label">Corner</span>
          <span className="cfg-sublabel">Mirror the layout (return run on the other wall).</span>
          <div className="wardrobe-footprint-chip-row">
            <button
              type="button"
              className={`cfg-chip ${cornerAttachment === "left" ? "active" : ""}`}
              onClick={() => setWardrobeCornerAttachment("left")}
            >
              Left corner
            </button>
            <button
              type="button"
              className={`cfg-chip ${cornerAttachment === "right" ? "active" : ""}`}
              onClick={() => setWardrobeCornerAttachment("right")}
            >
              Right corner
            </button>
          </div>
        </div>
      )}

      {showPrimaryControls && (
        <div className="wardrobe-footprint-walkin-sub">
          <span className="cfg-label">Primary editable run</span>
          <span className="cfg-sublabel">
            Bays, doors, and dimensions follow this run; other runs reuse the same proportions at their real
            widths. Clear to use the automatic default.
          </span>
          <div className="wardrobe-footprint-chip-row">
            {primaryOpts.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`cfg-chip ${primaryRun === o.id ? "active" : ""}`}
                onClick={() => setWardrobePrimaryRun(o.id)}
              >
                {o.label}
              </button>
            ))}
            {primaryRun !== undefined && (
              <button type="button" className="cfg-chip" onClick={() => setWardrobePrimaryRun(undefined)}>
                Auto
              </button>
            )}
          </div>
        </div>
      )}

      {showBackSpanNote && (
        <p className="cfg-hint" style={{ marginTop: "10px" }}>
          For this room size and module depth, the back wall fits up to ~{Math.round(maxBackCm)} cm wide. Wider
          modules apply full width on wing runs; the back run stays within the clear span (panels/doors scale
          proportionally).
        </p>
      )}

      {preset === "bridge" && (
        <div className="wardrobe-footprint-bridge">
          <span className="cfg-label">Elevation above floor</span>
          <span className="cfg-sublabel">{Math.round(bridgeLiftCm)} cm</span>
          <input
            type="range"
            min={WARDROBE_BRIDGE_LIFT_MIN_CM}
            max={WARDROBE_BRIDGE_LIFT_MAX_CM}
            step={1}
            value={bridgeLiftCm}
            onChange={(e) => setBridgeLiftCm(Number(e.target.value))}
            style={{ width: "100%", marginTop: "8px" }}
          />
        </div>
      )}
    </div>
  );
}

function FramesPanel() {
  const frame = useWardrobeStore((s) => s.config.frame);
  const base = useWardrobeStore((s) => s.config.base);
  const sections = useWardrobeStore((s) => s.config.sections);
  const setFrameWidth = useWardrobeStore((s) => s.setFrameWidth);
  const setFrameHeight = useWardrobeStore((s) => s.setFrameHeight);
  const setFrameDepth = useWardrobeStore((s) => s.setFrameDepth);
  const setWardrobeBaseType = useWardrobeStore((s) => s.setWardrobeBaseType);
  const setWardrobeLegHeightCm = useWardrobeStore((s) => s.setWardrobeLegHeightCm);
  const setWardrobePlinthHeightCm = useWardrobeStore((s) => s.setWardrobePlinthHeightCm);
  const setSectionCount = useWardrobeStore((s) => s.setSectionCount);
  const setSectionWidth = useWardrobeStore((s) => s.setSectionWidth);

  const b = clampWardrobeBase(base);
  const liftCm = wardrobeBaseLiftCm(b);

  const baseTypes: { id: WardrobeBaseType; label: string; desc: string }[] = [
    { id: "floor", label: "Floor", desc: "Carcass sits on the floor" },
    { id: "legs", label: "Legs", desc: "Adjustable feet — clearance under" },
    { id: "plinth", label: "Plinth", desc: "Recessed kickboard" },
  ];

  return (
    <div className="panel-content">
      <div className="cfg-group">
        <div className="cfg-label-row">
          <span className="cfg-label">Width</span>
          <span className="cfg-dim-input-row">
            <DimInput
              min={FRAME_MIN_WIDTH}
              max={FRAME_MAX_WIDTH}
              value={frame.width}
              ariaLabel="Frame width in cm"
              onCommit={(v) => setFrameWidth(clampCm(v, FRAME_MIN_WIDTH, FRAME_MAX_WIDTH))}
            />
            <span className="cfg-dim-unit">cm</span>
          </span>
        </div>
        <div className="cfg-slider">
          <input
            type="range"
            min={FRAME_MIN_WIDTH}
            max={FRAME_MAX_WIDTH}
            step={1}
            value={frame.width}
            onChange={(e) => setFrameWidth(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="cfg-group">
        <div className="cfg-label-row">
          <span className="cfg-label">Height</span>
          <span className="cfg-dim-input-row">
            <DimInput
              min={FRAME_MIN_HEIGHT}
              max={FRAME_MAX_HEIGHT}
              value={frame.height}
              ariaLabel="Frame height in cm"
              onCommit={(v) => setFrameHeight(clampCm(v, FRAME_MIN_HEIGHT, FRAME_MAX_HEIGHT))}
            />
            <span className="cfg-dim-unit">cm</span>
          </span>
        </div>
        <div className="cfg-slider">
          <input
            type="range"
            min={FRAME_MIN_HEIGHT}
            max={FRAME_MAX_HEIGHT}
            step={1}
            value={frame.height}
            onChange={(e) => setFrameHeight(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="cfg-group">
        <div className="cfg-label-row">
          <span className="cfg-label">Depth</span>
          <span className="cfg-dim-input-row">
            <DimInput
              min={FRAME_MIN_DEPTH}
              max={FRAME_MAX_DEPTH}
              value={frame.depth}
              ariaLabel="Frame depth in cm"
              onCommit={(v) => setFrameDepth(clampCm(v, FRAME_MIN_DEPTH, FRAME_MAX_DEPTH))}
            />
            <span className="cfg-dim-unit">cm</span>
          </span>
        </div>
        <div className="cfg-slider">
          <input
            type="range"
            min={FRAME_MIN_DEPTH}
            max={FRAME_MAX_DEPTH}
            step={1}
            value={frame.depth}
            onChange={(e) => setFrameDepth(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="cfg-divider" />

      <WardrobeFootprintSection />

      <div className="cfg-divider" />

      <div className="cfg-group">
        <span className="cfg-label">Base</span>
        <p className="cfg-hint" style={{ marginTop: 0 }}>
          Body height is the field above; legs or plinth add lift below the carcass (total height updates automatically).
        </p>
        <div className="door-cards">
          {baseTypes.map((bt) => (
            <button
              key={bt.id}
              type="button"
              className={`door-card ${b.type === bt.id ? "active" : ""}`}
              onClick={() => setWardrobeBaseType(bt.id)}
            >
              <span className="door-card-title">{bt.label}</span>
              <span className="door-card-desc">{bt.desc}</span>
            </button>
          ))}
        </div>
        {b.type === "legs" && (
          <>
            <div className="cfg-label-row" style={{ marginTop: 12 }}>
              <span className="cfg-label">Leg clearance</span>
              <span className="cfg-dim-input-row">
                <DimInput
                  min={LEG_HEIGHT_MIN}
                  max={LEG_HEIGHT_MAX}
                  value={b.legHeightCm}
                  ariaLabel="Leg clearance height in cm"
                  onCommit={(v) =>
                    setWardrobeLegHeightCm(clampCm(v, LEG_HEIGHT_MIN, LEG_HEIGHT_MAX))
                  }
                />
                <span className="cfg-dim-unit">cm</span>
              </span>
            </div>
            <div className="cfg-slider">
              <input
                type="range"
                min={LEG_HEIGHT_MIN}
                max={LEG_HEIGHT_MAX}
                step={1}
                value={b.legHeightCm}
                onChange={(e) => setWardrobeLegHeightCm(Number(e.target.value))}
              />
            </div>
          </>
        )}
        {b.type === "plinth" && (
          <>
            <div className="cfg-label-row" style={{ marginTop: 12 }}>
              <span className="cfg-label">Plinth height</span>
              <span className="cfg-dim-input-row">
                <DimInput
                  min={PLINTH_HEIGHT_MIN}
                  max={PLINTH_HEIGHT_MAX}
                  value={b.plinthHeightCm}
                  ariaLabel="Plinth height in cm"
                  onCommit={(v) =>
                    setWardrobePlinthHeightCm(clampCm(v, PLINTH_HEIGHT_MIN, PLINTH_HEIGHT_MAX))
                  }
                />
                <span className="cfg-dim-unit">cm</span>
              </span>
            </div>
            <div className="cfg-slider">
              <input
                type="range"
                min={PLINTH_HEIGHT_MIN}
                max={PLINTH_HEIGHT_MAX}
                step={1}
                value={b.plinthHeightCm}
                onChange={(e) => setWardrobePlinthHeightCm(Number(e.target.value))}
              />
            </div>
          </>
        )}
      </div>

      <div className="cfg-divider" />

      <div className="cfg-group">
        <div className="cfg-label-row">
          <span className="cfg-label">Sections</span>
          <span className="cfg-value">{sections.length}</span>
        </div>
        <div className="cfg-chips">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              className={`cfg-chip ${sections.length === n ? "active" : ""}`}
              onClick={() => setSectionCount(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {sections.length > 1 && (
        <div className="cfg-group">
          <p className="cfg-hint" style={{ marginTop: 0 }}>
            Drag a vertical divider in the 3D view, or set bay widths (cm). The last bay uses whatever space is left.
          </p>
          {sections.map((sec, idx) => {
            const isLast = idx === sections.length - 1;
            return (
              <div className="cfg-label-row" key={sec.id}>
                <span className="cfg-label" style={{ textTransform: "none", letterSpacing: "normal" }}>
                  Bay {idx + 1}
                  {isLast ? " (remainder)" : ""}
                </span>
                {isLast ? (
                  <span className="cfg-value">{Math.round(sec.width * 10) / 10} cm</span>
                ) : (
                  <DimInput
                    min={SECTION_MIN_WIDTH_CM}
                    max={FRAME_MAX_WIDTH}
                    decimals={1}
                    value={Math.round(sec.width * 10) / 10}
                    ariaLabel={`Section ${idx + 1} width in cm`}
                    onCommit={(v) => setSectionWidth(sec.id, v)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {sections.length === 1 && (
        <div className="cfg-group">
          <p className="cfg-hint" style={{ marginTop: 0 }}>
            Interior width: {totalInteriorSectionWidthsCm(frame.width, 1).toFixed(1)} cm (frame width minus side panels).
          </p>
        </div>
      )}

      <div className="cfg-info-card">
        <span>
          {frame.width} × {frame.height} × {frame.depth} cm
          {liftCm > 0 ? (
            <>
              {" "}
              · {totalWardrobeHeightCm(frame.height, b)} cm total
            </>
          ) : null}
        </span>
        <span>{sections.length} section{sections.length !== 1 ? "s" : ""}</span>
      </div>

      <AddonsPanel />
    </div>
  );
}

function AddonsPanel() {
  const addons = useWardrobeStore((s) => s.config.addons ?? EMPTY_WARDROBE_ADDONS);
  const seamStyle = useWardrobeStore((s) => s.config.seamStyle ?? "independent");
  const addWardrobeAddon = useWardrobeStore((s) => s.addWardrobeAddon);
  const removeWardrobeAddon = useWardrobeStore((s) => s.removeWardrobeAddon);
  const setSeamStyle = useWardrobeStore((s) => s.setSeamStyle);
  // Pull the current sheet packing to surface overflow feedback inline —
  // when any panel doesn't fit on its material sheet, we prompt the
  // designer to add an addon right here rather than making them open the
  // sheet viewer.
  const sheetLayout = useWardrobeSheetLayout();
  const overflowCount = sheetLayout.totalOverflow;

  return (
    <div className="cfg-group" style={{ marginTop: 12 }}>
      <div className="cfg-label-row">
        <span className="cfg-label">Addon modules</span>
      </div>
      <p className="cfg-hint" style={{ marginTop: 0 }}>
        Attach additional wardrobe bodies when the design exceeds one sheet.
        Each addon is an identical copy at the chosen position.
      </p>
      {overflowCount > 0 && (
        <div
          style={{
            marginTop: 8,
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid rgba(220, 100, 50, 0.35)",
            background: "rgba(250, 200, 100, 0.12)",
            fontSize: 12,
            lineHeight: 1.35,
          }}
          role="alert"
        >
          <strong>{overflowCount} panel{overflowCount === 1 ? "" : "s"}</strong>{" "}
          exceed the material sheet size. Add a module on the right (for wider
          pieces) or on top (for taller pieces) so each panel fits within one
          sheet.
        </div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        <button
          type="button"
          className="cfg-toggle"
          onClick={() => addWardrobeAddon("right")}
          title="Add a wardrobe module to the right"
        >
          + Right
        </button>
        <button
          type="button"
          className="cfg-toggle"
          onClick={() => addWardrobeAddon("top")}
          title="Stack a wardrobe module on top"
        >
          + Top
        </button>
      </div>
      {addons.length > 0 && (
        <>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: "8px 0 0",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {addons.map((a, i) => (
              <li
                key={a.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 8px",
                  borderRadius: 6,
                  background: "var(--muted, rgba(0,0,0,0.04))",
                  fontSize: 12,
                }}
              >
                <span>
                  Addon {i + 1} · {a.position === "right" ? "Right" : "Top"}
                </span>
                <button
                  type="button"
                  onClick={() => removeWardrobeAddon(a.id)}
                  className="cfg-toggle"
                  style={{ padding: "2px 6px", fontSize: 11 }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="cfg-label-row" style={{ marginTop: 10 }}>
            <span className="cfg-label" style={{ fontSize: 12 }}>
              Seam style
            </span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className="cfg-toggle"
              onClick={() => setSeamStyle("independent")}
              style={{
                opacity: seamStyle === "independent" ? 1 : 0.6,
              }}
              title="Each module keeps its own side panels (3.6 cm seam)"
            >
              Independent
            </button>
            <button
              type="button"
              className="cfg-toggle"
              onClick={() => setSeamStyle("shared")}
              style={{ opacity: seamStyle === "shared" ? 1 : 0.6 }}
              title="Modules share middle panels (1.8 cm seam)"
            >
              Shared
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Interiors Panel ─────────────────────────────────────────────── */

function InteriorsPanel() {
  const resolvedAdmin = useResolvedAdmin();
  const currency = resolvedAdmin?.currency ?? "USD";
  const sections = useWardrobeStore((s) => s.config.sections);
  const frameHeight = useWardrobeStore((s) => s.config.frame.height);
  const frameDepth = useWardrobeStore((s) => s.config.frame.depth);
  const selectedSectionId = useWardrobeStore((s) => s.ui.selectedSectionId);
  const selectedComponentId = useWardrobeStore((s) => s.ui.selectedComponentId);
  const selectSection = useWardrobeStore((s) => s.selectSection);
  const addComponent = useWardrobeStore((s) => s.addComponent);
  const duplicateComponent = useWardrobeStore((s) => s.duplicateComponent);
  const removeComponent = useWardrobeStore((s) => s.removeComponent);
  const reorderComponents = useWardrobeStore((s) => s.reorderComponents);
  const selectComponent = useWardrobeStore((s) => s.selectComponent);
  const setComponentGrain = useWardrobeStore((s) => s.setComponentGrainDirection);
  const setComponentYPosition = useWardrobeStore((s) => s.setComponentYPosition);
  const setComponentHeight = useWardrobeStore((s) => s.setComponentHeight);
  const setShelfWidthCm = useWardrobeStore((s) => s.setShelfWidthCm);
  const setShelfDepthCm = useWardrobeStore((s) => s.setShelfDepthCm);
  const setShelfDepthPlacement = useWardrobeStore((s) => s.setShelfDepthPlacement);
  const setInteriorStackGapCm = useWardrobeStore((s) => s.setInteriorStackGapCm);
  const interiorStackGapStored = useWardrobeStore((s) => s.config.interiorStackGapCm);
  const stackGapCm = useWardrobeStore((s) => wardrobeInteriorStackGapCm(s.config));
  const doorGrain = useWardrobeStore((s) => s.config.doorGrainDirection ?? "horizontal");

  const selectedSection = sections.find((s) => s.id === selectedSectionId);
  const selectedComp =
    selectedSection && selectedComponentId
      ? selectedSection.components.find((c) => c.id === selectedComponentId)
      : undefined;

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, compId: string) => {
    setDragId(compId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", compId);
  };

  const handleDragEnd = () => {
    setDragId(null);
    setDragOverId(null);
  };

  const handleDragOver = (e: React.DragEvent, compId: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (compId !== dragId) {
      setDragOverId(compId);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    setDragOverId(null);
  };

  const handleListDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverId(null);
    const droppedId = e.dataTransfer.getData("text/plain") || dragId;
    if (droppedId && droppedId !== targetId && selectedSectionId) {
      reorderComponents(selectedSectionId, droppedId, targetId);
    }
    setDragId(null);
  };

  return (
    <div className="panel-content">
      {/* Section picker */}
      <div className="cfg-group">
        <span className="cfg-label">Select Section</span>
        <div className="section-picker">
          {sections.map((s, i) => (
            <button
              key={s.id}
              className={`section-pick-btn ${s.id === selectedSectionId ? "active" : ""}`}
              onClick={() => selectSection(s.id)}
            >
              <span className="section-pick-num">{i + 1}</span>
              <span className="section-pick-info">
                {Math.round(s.width)} cm &middot; {s.components.length} items
              </span>
            </button>
          ))}
        </div>
      </div>

      {selectedSection && (
        <>
          <div className="cfg-divider" />

          <div className="cfg-group">
            <span className="cfg-label">Stack spacing</span>
            <p className="cfg-hint" style={{ marginTop: 0 }}>
              Vertical gap between stacked interior items (default {SHELF_PIN_SPACING} cm).
            </p>
            <div className="cfg-label-row">
              <span className="cfg-label">Gap</span>
              <span className="cfg-dim-input-row">
                <DimInput
                  min={0}
                  max={15}
                  step={0.1}
                  decimals={1}
                  value={interiorStackGapStored ?? SHELF_PIN_SPACING}
                  ariaLabel="Vertical gap between stacked interior items in cm"
                  onCommit={(v) => setInteriorStackGapCm(v)}
                />
                <span className="cfg-dim-unit">cm</span>
              </span>
            </div>
          </div>

          <div className="cfg-divider" />

          <div className="cfg-group">
            <div className="cfg-label-row">
              <span className="cfg-label">Add to Section {sections.findIndex((s) => s.id === selectedSectionId) + 1}</span>
            </div>
            <div className="interior-catalog">
              {COMPONENT_CATALOG.map((def) => (
                <button
                  key={def.type}
                  className="interior-add-row"
                  onClick={() => addComponent(selectedSectionId!, def.type)}
                >
                  <Plus size={16} className="interior-add-icon" />
                  <div className="interior-add-info">
                    <span className="interior-add-name">{def.name}</span>
                    <span className="interior-add-desc">{def.description}</span>
                  </div>
                  <span className="interior-add-price">
                    {formatPrice(def.price, currency)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {selectedSection.components.length > 0 && (
            <>
              <div className="cfg-divider" />
              <div className="cfg-group">
                <span className="cfg-label">
                  Placed ({selectedSection.components.length})
                </span>
                <div
                  className="placed-list"
                  onDragOver={handleListDragOver}
                >
                  {(() => {
                    const sortedComps = [...selectedSection.components].sort(
                      (a, b) => b.yPosition - a.yPosition || a.id.localeCompare(b.id),
                    );
                    return sortedComps.map((comp, idx) => {
                      const def = COMPONENT_CATALOG.find(
                        (c) => c.type === comp.type,
                      );
                      const isSel = comp.id === selectedComponentId;
                      const isDragOver = comp.id === dragOverId && comp.id !== dragId;
                      const isDragging = comp.id === dragId;
                      const prevComp = idx > 0 ? sortedComps[idx - 1] : null;
                      const nextComp =
                        idx < sortedComps.length - 1 ? sortedComps[idx + 1] : null;
                      return (
                        <div
                          key={comp.id}
                          className={`placed-row ${isSel ? "selected" : ""} ${isDragOver ? "drag-over" : ""} ${isDragging ? "dragging" : ""}`}
                          onClick={() => selectComponent(comp.id)}
                          onDragOver={(e) => handleDragOver(e, comp.id)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, comp.id)}
                        >
                          <div
                            className="placed-row-grip"
                            title="Drag to reorder"
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation();
                              handleDragStart(e, comp.id);
                            }}
                            onDragEnd={handleDragEnd}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Grip size={14} />
                          </div>
                          <div className="placed-row-info">
                            <span className="placed-row-name">
                              {def?.name ?? comp.type}
                            </span>
                            <span className="placed-row-pos">
                              {Math.round(comp.yPosition)} cm
                            </span>
                            <span className="placed-row-height">
                              H: {comp.height} cm
                            </span>
                          </div>
                          <div className="placed-row-actions">
                            {comp.type === "drawer" && (
                            <button
                              type="button"
                              className="placed-action-btn"
                              title="Change direction"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                  e.stopPropagation();
                                  const cur = comp.grainDirection ?? doorGrain;
                                  setComponentGrain(
                                    selectedSectionId!,
                                    comp.id,
                                    cur === "horizontal" ? "vertical" : "horizontal",
                                  );
                                }}
                              >
                                <RefreshCw size={12} />
                              </button>
                            )}
                            <button
                              type="button"
                              className="placed-action-btn"
                              title="Move up"
                              disabled={!prevComp}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!prevComp) return;
                                reorderComponents(
                                  selectedSectionId!,
                                  comp.id,
                                  prevComp.id,
                                );
                              }}
                            >
                              <ArrowUp size={12} />
                            </button>
                            <button
                              type="button"
                              className="placed-action-btn"
                              title="Move down"
                              disabled={!nextComp}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!nextComp) return;
                                reorderComponents(
                                  selectedSectionId!,
                                  comp.id,
                                  nextComp.id,
                                );
                              }}
                            >
                              <ArrowDown size={12} />
                            </button>
                            <button
                              type="button"
                              className="placed-action-btn"
                              title="Duplicate"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                duplicateComponent(selectedSectionId!, comp.id);
                              }}
                            >
                              <Copy size={12} />
                            </button>
                            <button
                              type="button"
                              className="placed-action-btn danger"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                removeComponent(selectedSectionId!, comp.id);
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </>
          )}

          {selectedComp && selectedSectionId && (
            <>
              <div className="cfg-divider" />
              <div className="cfg-group">
                <span className="cfg-label">Selected item</span>
                <p className="cfg-hint" style={{ marginTop: 0 }}>
                  Bottom edge from interior floor. Stacked spacing uses a {stackGapCm} cm gap.
                </p>
                <div className="cfg-label-row">
                  <span className="cfg-label">Position</span>
                  <span className="cfg-dim-input-row">
                    <DimInput
                      min={0}
                      max={
                        Math.round(
                          (frameHeight -
                            PANEL_THICKNESS * 2 -
                            selectedComp.height) *
                            10,
                        ) / 10
                      }
                      step={0.1}
                      decimals={1}
                      value={selectedComp.yPosition}
                      ariaLabel="Component bottom position from interior floor in cm"
                      onCommit={(v) =>
                        setComponentYPosition(selectedSectionId, selectedComp.id, v)
                      }
                    />
                    <span className="cfg-dim-unit">cm</span>
                  </span>
                </div>
                <div className="cfg-label-row" style={{ marginTop: 8 }}>
                  <span className="cfg-label">Height</span>
                  <span className="cfg-dim-input-row">
                    <DimInput
                      min={getComponentDef(selectedComp.type).minHeight}
                      max={getComponentDef(selectedComp.type).maxHeight}
                      step={0.1}
                      decimals={1}
                      value={selectedComp.height}
                      ariaLabel="Component height in cm"
                      onCommit={(v) =>
                        setComponentHeight(selectedSectionId, selectedComp.id, v)
                      }
                    />
                    <span className="cfg-dim-unit">cm</span>
                  </span>
                </div>
                {selectedComp.type === "shelf" && selectedSection && (
                  <>
                    <div className="cfg-label-row" style={{ marginTop: 8 }}>
                      <span className="cfg-label">Board width</span>
                      <span className="cfg-dim-input-row">
                        <DimInput
                          min={MIN_SHELF_WIDTH_CM}
                          max={shelfMaxWidthCm(selectedSection.width)}
                          step={0.1}
                          decimals={1}
                          value={shelfEffectiveWidthCm(
                            selectedSection.width,
                            selectedComp.shelfWidthCm,
                          )}
                          ariaLabel="Shelf board width in cm"
                          onCommit={(v) =>
                            setShelfWidthCm(selectedSectionId, selectedComp.id, v)
                          }
                        />
                        <span className="cfg-dim-unit">cm</span>
                      </span>
                    </div>
                    <div className="cfg-label-row" style={{ marginTop: 8 }}>
                      <span className="cfg-label">Board depth</span>
                      <span className="cfg-dim-input-row">
                        <DimInput
                          min={MIN_SHELF_DEPTH_CM}
                          max={shelfMaxDepthCm(frameDepth)}
                          step={0.1}
                          decimals={1}
                          value={shelfPanelDepthCm(
                            frameDepth,
                            selectedComp.shelfDepthCm,
                          )}
                          ariaLabel="Shelf board depth in cm"
                          onCommit={(v) => {
                            const fullD = shelfPanelDepthCm(frameDepth, undefined);
                            if (Math.abs(v - fullD) < 0.15) {
                              setShelfDepthCm(
                                selectedSectionId,
                                selectedComp.id,
                                undefined,
                              );
                            } else {
                              setShelfDepthCm(
                                selectedSectionId,
                                selectedComp.id,
                                v,
                              );
                            }
                          }}
                        />
                        <span className="cfg-dim-unit">cm</span>
                      </span>
                    </div>
                    <p className="cfg-hint" style={{ marginTop: 4, marginBottom: 0 }}>
                      Match “board depth” to the cabinet default to use full depth; shorter boards can sit toward the front, center, or back.
                    </p>
                    <div className="cfg-label-row" style={{ marginTop: 8 }}>
                      <span className="cfg-label">Depth position</span>
                      <div className="cfg-chips">
                        {(
                          [
                            ["front", "Front"],
                            ["center", "Center"],
                            ["back", "Back"],
                          ] as const
                        ).map(([id, label]) => {
                          const active =
                            (selectedComp.shelfDepthPlacement ?? "center") === id;
                          return (
                            <button
                              key={id}
                              type="button"
                              className={`cfg-chip ${active ? "active" : ""}`}
                              onClick={() =>
                                setShelfDepthPlacement(
                                  selectedSectionId,
                                  selectedComp.id,
                                  id as ShelfDepthPlacement,
                                )
                              }
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}

      {!selectedSection && (
        <div className="panel-empty">
          <Columns3 size={28} />
          <p>Select a section above to add interior fittings</p>
        </div>
      )}
    </div>
  );
}

/** Full-screen browser: materials grouped by brand (search + scroll). */
function WardrobeMaterialsBrowseModal({
  materials,
  selectedId,
  onClose,
  onSelect,
  title,
  catalogLoading = false,
  catalogSubtitle,
}: {
  materials: WardrobeMaterial[];
  selectedId: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  title: string;
  catalogLoading?: boolean;
  catalogSubtitle?: string;
}) {
  const titleId = useId();
  const [search, setSearch] = useState("");
  const byBrand = useMemo(() => groupWardrobeMaterialsByBrand(materials), [materials]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return byBrand;
    return byBrand
      .map((g) => ({
        ...g,
        items: g.items.filter((m) => {
          const hay = [m.name, m.manufacturer ?? "", m.categoryKey ?? "", m.brandKey ?? ""]
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        }),
      }))
      .filter((g) => g.items.length > 0);
  }, [byBrand, search]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const node = (
    <div
      className="wardrobe-door-material-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="wardrobe-door-material-modal-backdrop" onClick={onClose} aria-hidden />
      <div className="wardrobe-door-material-modal-panel">
        <div className="wardrobe-door-material-modal-header">
          <div className="wardrobe-door-material-modal-heading">
            <h2 id={titleId} className="wardrobe-door-material-modal-title">
              {title}
            </h2>
            {catalogSubtitle ? (
              <p className="cfg-sublabel" style={{ margin: "6px 0 0", maxWidth: 560, lineHeight: 1.35 }}>
                {catalogSubtitle}
              </p>
            ) : null}
          </div>
          <div className="wardrobe-door-material-modal-search">
            <Search size={16} className="wardrobe-door-material-modal-search-icon" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              className="wardrobe-door-material-modal-input"
            />
          </div>
          <button
            type="button"
            className="wardrobe-door-material-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={22} />
          </button>
        </div>
        <div className="wardrobe-door-material-modal-body">
          {catalogLoading && filtered.length === 0 ? (
            <p className="cfg-sublabel" style={{ padding: "24px 16px" }}>
              Loading manufacturer catalog…
            </p>
          ) : filtered.length === 0 ? (
            <p className="cfg-sublabel" style={{ padding: "24px 16px" }}>
              No materials match your search.
            </p>
          ) : (
            filtered.map((g) => (
              <section key={g.key} className="wardrobe-door-material-modal-section">
                <h3 className="wardrobe-door-material-modal-brand">{g.label}</h3>
                <div className="wardrobe-door-material-modal-grid">
                  {g.items.map((mat) => (
                    <button
                      key={mat.id}
                      type="button"
                      className={`mat-swatch ${selectedId === mat.id ? "selected" : ""}`}
                      onClick={() => onSelect(mat.id)}
                      title={mat.name}
                    >
                      <SwatchCircle mat={mat} />
                      <span className="mat-swatch-name">{mat.name}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}

function wardrobeBrowseMergedMaterials(base: WardrobeMaterial[], extras: WardrobeMaterial[]): WardrobeMaterial[] {
  const byId = new Map<string, WardrobeMaterial>();
  for (const x of extras) {
    if (!byId.has(x.id)) byId.set(x.id, x);
  }
  for (const t of base) {
    byId.set(t.id, t);
  }
  return [...byId.values()];
}

function WardrobeFinishesByBrand({
  materials,
  keyPrefix,
  selectedId,
  onPick,
  browseModalTitle = "All materials",
  browseCatalogMaterials = EMPTY_MANUFACTURER_CATALOG_MATERIALS,
  browseCatalogLoading = false,
  browseCatalogSubtitle,
}: {
  materials: WardrobeMaterial[];
  keyPrefix: string;
  selectedId: string;
  onPick: (id: string) => void;
  /** Title for full-screen browse (grouped by brand). */
  browseModalTitle?: string;
  /** Global manufacturer library (same source as Admin → Materials → Import from manufacturer catalog). */
  browseCatalogMaterials?: WardrobeMaterial[];
  browseCatalogLoading?: boolean;
  browseCatalogSubtitle?: string;
}) {
  const mergeCatalogMaterialsIntoPools = useWardrobeStore((s) => s.mergeCatalogMaterialsIntoPools);
  const modalMaterials = useMemo(
    () => wardrobeBrowseMergedMaterials(materials, browseCatalogMaterials),
    [materials, browseCatalogMaterials],
  );
  const byBrand = useMemo(() => groupWardrobeMaterialsByBrand(materials), [materials]);
  const inferredBrandKey = useMemo(() => {
    const g = byBrand.find((b) => b.items.some((m) => m.id === selectedId));
    return g?.key ?? byBrand[0]?.key ?? "";
  }, [byBrand, selectedId]);

  /** When the user taps a brand chip without changing the selected finish, remember that brand until selection changes. */
  const [manualBrandPick, setManualBrandPick] = useState<{
    anchorSelectedId: string;
    brandKey: string;
  } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const activeBrandKey =
    manualBrandPick?.anchorSelectedId === selectedId ? manualBrandPick.brandKey : inferredBrandKey;

  const current =
    byBrand.find((b) => b.key === activeBrandKey) ?? byBrand.find((b) => b.key === inferredBrandKey);
  const currentItems = current?.items ?? [];

  return (
    <>
      <div className="cfg-label-row wardrobe-finishes-brand-header">
        <span className="cfg-sublabel" style={{ margin: 0 }}>
          Brand
        </span>
        <button
          type="button"
          className="wardrobe-browse-all-materials-btn"
          onClick={() => setModalOpen(true)}
        >
          <LayoutGrid size={14} style={{ marginRight: 5, verticalAlign: "middle" }} />
          Browse all materials
        </button>
      </div>
      <div className="wardrobe-brand-chip-row">
        {byBrand.map((b) => (
          <button
            key={b.key}
            type="button"
            className={`cfg-chip ${activeBrandKey === b.key ? "active" : ""}`}
            onClick={() => setManualBrandPick({ anchorSelectedId: selectedId, brandKey: b.key })}
          >
            {b.label}
            <span className="wardrobe-brand-chip-count"> {b.items.length}</span>
          </button>
        ))}
      </div>
      <div className="mat-grid" style={{ marginTop: 8 }}>
        {currentItems.map((mat) => (
          <button
            key={`${keyPrefix}-${activeBrandKey}-${mat.id}`}
            type="button"
            className={`mat-swatch ${selectedId === mat.id ? "selected" : ""}`}
            onClick={() => onPick(mat.id)}
            title={mat.name}
          >
            <SwatchCircle mat={mat} />
            <span className="mat-swatch-name">{mat.name}</span>
          </button>
        ))}
      </div>
      {modalOpen && (
        <WardrobeMaterialsBrowseModal
          materials={modalMaterials}
          selectedId={selectedId}
          catalogLoading={browseCatalogLoading}
          catalogSubtitle={browseCatalogSubtitle}
          onClose={() => setModalOpen(false)}
          onSelect={(id) => {
            const inTenantSidebar = materials.some((m) => m.id === id);
            if (!inTenantSidebar) {
              const picked = modalMaterials.find((m) => m.id === id);
              if (picked) mergeCatalogMaterialsIntoPools([picked]);
            }
            onPick(id);
            setModalOpen(false);
            let gBrand = groupWardrobeMaterialsByBrand(materials).find((b) =>
              b.items.some((m) => m.id === id),
            );
            if (!gBrand) {
              gBrand = groupWardrobeMaterialsByBrand(modalMaterials).find((b) =>
                b.items.some((m) => m.id === id),
              );
            }
            if (gBrand) setManualBrandPick({ anchorSelectedId: id, brandKey: gBrand.key });
          }}
          title={browseModalTitle}
        />
      )}
    </>
  );
}

/* ── Doors Panel ─────────────────────────────────────────────────── */

function DoorsPanel() {
  const doors = useWardrobeStore((s) => s.config.doors);
  const sections = useWardrobeStore((s) => s.config.sections);
  const showDoors = useWardrobeStore((s) => s.ui.showDoors);
  const setDoorType = useWardrobeStore((s) => s.setDoorType);
  const setSlidingMechanism = useWardrobeStore((s) => s.setSlidingMechanism);
  const toggleDoors = useWardrobeStore((s) => s.toggleDoors);
  const slidingMechanisms = useWardrobeStore((s) => s.availableSlidingMechanisms);
  const setSectionHingedDoorCount = useWardrobeStore(
    (s) => s.setSectionHingedDoorCount,
  );

  const slidingMechanismDisplayList =
    slidingMechanisms.length > 0 ? slidingMechanisms : [INTERNAL_RENDER_FALLBACK];
  const slidingMechanismPickerReadOnly = slidingMechanisms.length === 0;

  const doorTypes: { id: DoorType; label: string; desc: string }[] = [
    { id: "none", label: "Open", desc: "No doors" },
    { id: "hinged", label: "Hinged", desc: "Classic swing" },
    { id: "sliding", label: "Sliding", desc: "Space-saving" },
  ];

  return (
    <div className="panel-content">
      <div className="cfg-group">
        <div className="cfg-label-row">
          <span className="cfg-label">Door Type</span>
          {doors.type !== "none" && (
            <button type="button" className="cfg-toggle" onClick={toggleDoors}>
              {showDoors ? "Hide" : "Show"}
            </button>
          )}
        </div>
        <p className="cfg-hint" style={{ marginTop: 0 }}>
          Door and drawer <strong>front laminates</strong> match the exterior material in{" "}
          <strong>Materials</strong>. Open <strong>Wardrobe sheet layout</strong> from the canvas to adjust how
          panels are grouped on sheets.
        </p>
        <div className="door-cards">
          {doorTypes.map((dt) => (
            <button
              key={dt.id}
              type="button"
              className={`door-card ${doors.type === dt.id ? "active" : ""}`}
              onClick={() => setDoorType(dt.id)}
            >
              <span className="door-card-title">{dt.label}</span>
              <span className="door-card-desc">{dt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {doors.type === "hinged" && (
        <>
          <div className="cfg-divider" />
          <div className="cfg-group">
            <span className="cfg-label">Doors per bay</span>
            <p className="cfg-hint" style={{ marginTop: 0 }}>
              Choose how many hinged doors cover each bay. Pick 2 for a
              French-door look — the bay stays a single open section (no
              vertical divider), and the doors meet in the middle.
            </p>
            {sections.map((sec, idx) => {
              const count = Math.max(
                1,
                Math.min(4, Math.round(sec.hingedDoorCount ?? 1)),
              );
              return (
                <div className="cfg-label-row" key={sec.id}>
                  <span
                    className="cfg-label"
                    style={{ textTransform: "none", letterSpacing: "normal" }}
                  >
                    Bay {idx + 1}
                  </span>
                  <div className="cfg-chips">
                    {[1, 2, 3, 4].map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`cfg-chip ${count === n ? "active" : ""}`}
                        onClick={() => setSectionHingedDoorCount(sec.id, n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {doors.type === "sliding" && (
        <>
          <div className="cfg-divider" />
          <div className="cfg-group">
            <span className="cfg-label">Sliding mechanism</span>
            <p className="cfg-hint" style={{ marginTop: 0 }}>
              Track / roller system (admin: type “slide”, e.g. category “hardware”). Shown on the 3D preview.
            </p>
            {slidingMechanismPickerReadOnly && (
              <p className="cfg-hint" style={{ marginBottom: "8px" }}>
                Using the default track until you add slide-type materials to the catalog.
              </p>
            )}
            <div className="mat-grid">
              {slidingMechanismDisplayList.map((mat) => (
                <button
                  key={mat.id}
                  type="button"
                  disabled={slidingMechanismPickerReadOnly}
                  className={`mat-swatch ${doors.slidingMechanismId === mat.id ? "selected" : ""}`}
                  onClick={() => setSlidingMechanism(mat.id)}
                  title={mat.name}
                >
                  <SwatchCircle mat={mat} />
                  <span className="mat-swatch-name">{mat.name}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Handles Panel ───────────────────────────────────────────────── */

function HandlesPanel() {
  const resolvedAdmin = useResolvedAdmin();
  const currency = resolvedAdmin?.currency ?? "USD";
  const doors = useWardrobeStore((s) => s.config.doors);
  const sections = useWardrobeStore((s) => s.config.sections);
  const setDoorHandle = useWardrobeStore((s) => s.setDoorHandle);
  const setDoorHandleMaterial = useWardrobeStore((s) => s.setDoorHandleMaterial);
  const availableHandleMaterials = useWardrobeStore((s) => s.availableHandleMaterials);
  const setSectionHingedDoorHandleSide = useWardrobeStore((s) => s.setSectionHingedDoorHandleSide);

  if (doors.type === "none") {
    return (
      <div className="panel-content">
        <div className="panel-empty">
          <Grip size={28} />
          <p>Add doors first to choose handles</p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-content">
      {doors.type === "hinged" && (
        <>
          <div className="cfg-group">
            <span className="cfg-label">Handle position (per door)</span>
            <p className="cfg-hint">
              Single-door bays: pick which edge the handle sits on. French-door
              bays (2+ doors) use automatic handle placement so the doors meet
              in the middle.
            </p>
            {sections.map((sec, i) => {
              const count = Math.max(
                1,
                Math.min(4, Math.round(sec.hingedDoorCount ?? 1)),
              );
              if (count >= 2) {
                return (
                  <div key={sec.id} className="hinged-handle-door-block">
                    <span className="hinged-handle-door-label">
                      Bay {i + 1} · {count} doors
                    </span>
                    <p className="cfg-sublabel" style={{ margin: 0 }}>
                      French-door layout — handles auto-placed (outer doors on
                      the inside edges).
                    </p>
                  </div>
                );
              }
              const side: HingedDoorHandleSide =
                sec.hingedDoorHandleSide === "left" || sec.hingedDoorHandleSide === "right"
                  ? sec.hingedDoorHandleSide
                  : i % 2 === 0
                    ? "right"
                    : "left";
              return (
                <div key={sec.id} className="hinged-handle-door-block">
                  <span className="hinged-handle-door-label">Bay {i + 1}</span>
                  <div className="door-cards hinged-handle-door-cards">
                    <button
                      type="button"
                      className={`door-card ${side === "left" ? "active" : ""}`}
                      onClick={() => setSectionHingedDoorHandleSide(sec.id, "left")}
                    >
                      <span className="door-card-title">Left</span>
                      <span className="door-card-desc">Edge</span>
                    </button>
                    <button
                      type="button"
                      className={`door-card ${side === "right" ? "active" : ""}`}
                      onClick={() => setSectionHingedDoorHandleSide(sec.id, "right")}
                    >
                      <span className="door-card-title">Right</span>
                      <span className="door-card-desc">Edge</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="cfg-divider" />
        </>
      )}
      <div className="cfg-group">
        <span className="cfg-label">Handle Style</span>
        <div className="handle-rows">
          {HANDLES.map((h) => (
            <button
              key={h.id}
              className={`handle-row ${doors.handle === h.id ? "active" : ""}`}
              onClick={() => setDoorHandle(h.id)}
            >
              <span className="handle-row-name">{h.name}</span>
              <span className="handle-row-price">
                {formatPrice(h.price, currency)}/pc
              </span>
            </button>
          ))}
        </div>
      </div>
      {doors.handle !== "none" && availableHandleMaterials.length > 0 && (
        <>
          <div className="cfg-divider" />
          <div className="cfg-group">
            <span className="cfg-label">Handle finish (catalog)</span>
            <span className="cfg-sublabel">Optional — overrides default color and price when selected</span>
            <button
              type="button"
              className={`handle-row ${!doors.handleMaterialId ? "active" : ""}`}
              onClick={() => setDoorHandleMaterial(undefined)}
              style={{ marginBottom: "10px" }}
            >
              <span className="handle-row-name">Default finish</span>
              <span className="handle-row-price">Preset look</span>
            </button>
            <div className="mat-grid">
              {availableHandleMaterials.map((mat) => (
                <button
                  key={mat.id}
                  type="button"
                  className={`mat-swatch ${doors.handleMaterialId === mat.id ? "selected" : ""}`}
                  onClick={() => setDoorHandleMaterial(mat.id)}
                  title={mat.name}
                >
                  <SwatchCircle mat={mat} />
                  <span className="mat-swatch-name">{mat.name}</span>
                  {mat.pricePerSqm != null && (
                    <span className="mat-swatch-name" style={{ fontSize: "11px", opacity: 0.85 }}>
                      {formatPrice(Math.round(mat.pricePerSqm), currency)}/pc
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Materials Panel ─────────────────────────────────────────────── */

function mergeWardrobeMaterialPools(
  primary: WardrobeMaterial[],
  extra: WardrobeMaterial[],
): WardrobeMaterial[] {
  const byId = new Map<string, WardrobeMaterial>();
  for (const m of primary) byId.set(m.id, m);
  for (const m of extra) byId.set(m.id, m);
  return [...byId.values()];
}

function MaterialsPanel() {
  const admin = useResolvedAdmin();
  const frameMaterial = useWardrobeStore((s) => s.config.frameMaterial);
  const interiorMaterial = useWardrobeStore((s) => s.config.interiorMaterial);
  const frameGrain = useWardrobeStore((s) => s.config.frameGrainDirection ?? "horizontal");
  const interiorGrain = useWardrobeStore((s) => s.config.interiorGrainDirection ?? "horizontal");
  const doorGrain = useWardrobeStore((s) => s.config.doorGrainDirection ?? "horizontal");
  const doorsCfg = useWardrobeStore((s) => s.config.doors);
  const frame = useWardrobeStore((s) => s.config.frame);
  const sections = useWardrobeStore((s) => s.config.sections);
  const customizeEachDoor = useWardrobeStore((s) => s.ui.customizeEachDoor);
  const linkFinishes = useWardrobeStore((s) => s.ui.linkInteriorExteriorFinishes);

  const setExteriorMaterial = useWardrobeStore((s) => s.setExteriorMaterial);
  const setInteriorMaterial = useWardrobeStore((s) => s.setInteriorMaterial);
  const setAllDoorPanelMaterials = useWardrobeStore((s) => s.setAllDoorPanelMaterials);
  const setDoorPanelMaterial = useWardrobeStore((s) => s.setDoorPanelMaterial);
  const setDoorPanelGrainDirection = useWardrobeStore((s) => s.setDoorPanelGrainDirection);
  const setExteriorGrain = useWardrobeStore((s) => s.setExteriorGrainDirection);
  const setInteriorGrain = useWardrobeStore((s) => s.setInteriorGrainDirection);
  const setCustomizeEachDoor = useWardrobeStore((s) => s.setCustomizeEachDoor);
  const setLinkInteriorExteriorFinishes = useWardrobeStore((s) => s.setLinkInteriorExteriorFinishes);

  const frameMaterials = useWardrobeStore((s) => s.availableMaterials);
  const doorMaterials = useWardrobeStore((s) => s.availableDoorMaterials);

  const exteriorMaterials = useMemo(
    () => mergeWardrobeMaterialPools(frameMaterials, doorMaterials),
    [frameMaterials, doorMaterials],
  );

  const [finishArea, setFinishArea] = useState<"exterior" | "interior">("exterior");
  /** When per-panel customize is on: null = pick section/panel; number = edit that index. */
  const [customizePanelIndex, setCustomizePanelIndex] = useState<number | null>(null);
  const exteriorPanelId = "wardrobe-finishes-panel-exterior";
  const interiorPanelId = "wardrobe-finishes-panel-interior";

  const exteriorPanelsDifferFromBody =
    doorsCfg.type !== "none" &&
    doorsCfg.doorPanelMaterialIds.some((id) => id !== frameMaterial);

  const hasInteriorRow = frameMaterials.length > 0;
  const hasExteriorRow = exteriorMaterials.length > 0;

  const doorPanelCount =
    doorsCfg.type === "none"
      ? 0
      : wardrobeDoorPanelMaterialIdsLength(doorsCfg.type, frame.width, sections);

  const doorFrontCustomizeEntries = useMemo(() => {
    if (doorsCfg.type === "none") return [];
    if (doorsCfg.type === "sliding") {
      return Array.from({ length: doorPanelCount }, (_, i) => ({
        flatIndex: i,
        label: `Sliding panel ${i + 1}`,
      }));
    }
    const entries: { flatIndex: number; label: string }[] = [];
    let flat = 0;
    sections.forEach((sec, sIdx) => {
      const n = hingedDoorCountForSection(sec.hingedDoorCount);
      for (let d = 0; d < n; d++) {
        entries.push({
          flatIndex: flat,
          label:
            n === 1
              ? `Bay ${sIdx + 1} · ${sec.width} cm`
              : `Bay ${sIdx + 1} · door ${d + 1} of ${n}`,
        });
        flat++;
      }
    });
    return entries;
  }, [doorsCfg.type, doorPanelCount, sections]);

  const [browseCatalogExterior, setBrowseCatalogExterior] = useState<WardrobeMaterial[]>([]);
  const [browseCatalogInterior, setBrowseCatalogInterior] = useState<WardrobeMaterial[]>([]);
  const [browseCatalogLoading, setBrowseCatalogLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBrowseCatalogLoading(true);
      try {
        const res = await api.getPublicMaterialTemplates();
        const rows = (res.data ?? []) as PublicMaterialTemplateRow[];
        const adminId = admin?.id ?? "public";
        const ext: WardrobeMaterial[] = [];
        const int: WardrobeMaterial[] = [];
        const seenExt = new Set<string>();
        const seenInt = new Set<string>();
        for (const row of rows) {
          const mat = mapTemplateRowToMaterial(row, adminId);
          const exteriorMatOk =
            isWardrobeBoardFinishMaterial(mat) || isWardrobeDoorFinishMaterial(mat);
          const interiorMatOk = isWardrobeBoardFinishMaterial(mat);
          if (!exteriorMatOk && !interiorMatOk) continue;
          const swatches = materialsFromStore([mat], admin?.companyName);
          const wm = swatches[0];
          if (!wm) continue;
          if (
            exteriorMatOk &&
            (wardrobeManufacturerRowForFramePool(wm) || wardrobeManufacturerRowForDoorPool(wm))
          ) {
            if (!seenExt.has(wm.id)) {
              seenExt.add(wm.id);
              ext.push(wm);
            }
          }
          if (interiorMatOk && wardrobeManufacturerRowForFramePool(wm)) {
            if (!seenInt.has(wm.id)) {
              seenInt.add(wm.id);
              int.push(wm);
            }
          }
        }
        if (!cancelled) {
          setBrowseCatalogExterior(ext);
          setBrowseCatalogInterior(int);
        }
      } catch (e) {
        console.error("getPublicMaterialTemplates failed", e);
        if (!cancelled) {
          setBrowseCatalogExterior([]);
          setBrowseCatalogInterior([]);
        }
      } finally {
        if (!cancelled) setBrowseCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [admin?.id, admin?.companyName]);

  useEffect(() => {
    if (!customizeEachDoor || doorPanelCount === 0) {
      setCustomizePanelIndex(null);
      return;
    }
    if (customizePanelIndex !== null && customizePanelIndex >= doorPanelCount) {
      setCustomizePanelIndex(null);
    }
  }, [customizeEachDoor, doorPanelCount, customizePanelIndex]);

  const pickUniformExterior = (id: string) => {
    setExteriorMaterial(id);
    if (linkFinishes) {
      setInteriorMaterial(id);
      setInteriorGrain(frameGrain);
    }
  };

  const pickInterior = (id: string) => {
    setInteriorMaterial(id);
    if (linkFinishes) {
      setExteriorMaterial(id);
      setExteriorGrain(interiorGrain);
    }
  };

  const onExteriorGrainChange = (d: GrainDirection) => {
    setExteriorGrain(d);
    if (linkFinishes) setInteriorGrain(d);
  };

  const onInteriorGrainChange = (d: GrainDirection) => {
    setInteriorGrain(d);
    if (linkFinishes) setExteriorGrain(d);
  };

  return (
    <div className="panel-content wardrobe-finishes-panel">
      {!hasInteriorRow && !hasExteriorRow && (
        <p className="cfg-sublabel wardrobe-finishes-empty-note">
          No materials in your account yet. Add finishes in the admin, or run the API seed so the default
          decor library loads automatically when your catalog is empty.
        </p>
      )}
      {(hasInteriorRow || hasExteriorRow) && (
        <>
          <p className="wardrobe-finishes-intro">
            Choose <strong>Exterior</strong> (outside of the wardrobe, including <strong>door and drawer fronts</strong>){" "}
            and <strong>Interior</strong> (inside the bays). Use <strong>Wardrobe sheet layout</strong> on the canvas to fine-tune
            cuts and placement on boards.
          </p>

          <label className="wardrobe-finishes-link-label">
            <input
              type="checkbox"
              checked={linkFinishes}
              onChange={(e) => setLinkInteriorExteriorFinishes(e.target.checked)}
            />
            <span>Use the same finish inside and out (updates both when you pick Exterior or Interior).</span>
          </label>

          <div className="wardrobe-finishes-area-nav">
            <div className="wardrobe-finishes-tabs" role="tablist" aria-label="Wardrobe materials">
              <button
                type="button"
                role="tab"
                id="wardrobe-finishes-tab-exterior"
                aria-selected={finishArea === "exterior"}
                aria-controls={exteriorPanelId}
                className={`wardrobe-finishes-tab ${finishArea === "exterior" ? "wardrobe-finishes-tab--active" : ""}`}
                onClick={() => setFinishArea("exterior")}
              >
                Exterior
              </button>
              <button
                type="button"
                role="tab"
                id="wardrobe-finishes-tab-interior"
                aria-selected={finishArea === "interior"}
                aria-controls={interiorPanelId}
                className={`wardrobe-finishes-tab ${finishArea === "interior" ? "wardrobe-finishes-tab--active" : ""}`}
                onClick={() => setFinishArea("interior")}
              >
                Interior
              </button>
            </div>
            <div className="wardrobe-finishes-skip-row">
              {finishArea === "exterior" ? (
                <button
                  type="button"
                  className="wardrobe-finishes-skip-link"
                  onClick={() => setFinishArea("interior")}
                >
                  Skip to Interior
                </button>
              ) : (
                <button
                  type="button"
                  className="wardrobe-finishes-skip-link"
                  onClick={() => setFinishArea("exterior")}
                >
                  Skip to Exterior
                </button>
              )}
            </div>
          </div>

          <div
            id={exteriorPanelId}
            role="tabpanel"
            aria-labelledby="wardrobe-finishes-tab-exterior"
            hidden={finishArea !== "exterior"}
            className="wardrobe-finishes-tab-panel"
          >
            {!hasExteriorRow ? (
              <p className="cfg-hint wardrobe-finishes-section-desc">
                No frame or door-finish catalogs loaded — add laminates in the admin.
              </p>
            ) : (
              <section
                className="wardrobe-finishes-section"
                aria-labelledby="wardrobe-finishes-exterior-heading"
              >
                <h3 id="wardrobe-finishes-exterior-heading" className="wardrobe-finishes-section-title">
                  <Box size={18} strokeWidth={2} aria-hidden />
                  Exterior
                </h3>
                <p className="wardrobe-finishes-section-desc">
                  Applies to outer carcass (sides, top, bottom, dividers), <strong>door fronts</strong>, and visible{" "}
                  <strong>drawer fronts</strong>. Turn off per-section customization below to pick one exterior finish
                  for the whole carcass and all fronts together.
                </p>
                {doorPanelCount > 0 && (
                  <label className="wardrobe-finishes-link-label wardrobe-finishes-link-label--nested">
                    <input
                      type="checkbox"
                      checked={customizeEachDoor}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setCustomizePanelIndex(null);
                          setCustomizeEachDoor(true);
                        } else {
                          setCustomizePanelIndex(null);
                          setAllDoorPanelMaterials(frameMaterial);
                          setCustomizeEachDoor(false);
                        }
                      }}
                    />
                    <span>Customize each door / sliding panel (material and grain separately).</span>
                  </label>
                )}
                {exteriorPanelsDifferFromBody && !customizeEachDoor && (
                  <p className="cfg-hint" style={{ marginBottom: "0.75rem" }}>
                    Some door panels use a different decor than this exterior pick — choose again here, enable per-door
                    customization, or use <strong>Wardrobe sheet layout</strong> after loading a saved split.
                  </p>
                )}

                {customizeEachDoor && doorPanelCount > 0 ? (
                  customizePanelIndex === null ? (
                    <div className="wardrobe-door-customize-pick">
                      <h4 className="wardrobe-finishes-subheading">Door fronts — choose a door</h4>
                      <p className="cfg-sublabel wardrobe-finishes-section-desc">
                        {doorsCfg.type === "hinged"
                          ? "Each hinged leaf is listed separately (e.g. both doors in a French-door bay)."
                          : "Pick a sliding panel to change its finish."}{" "}
                        Carcass sides and body stay on the main exterior finish — turn this option off to edit those.
                      </p>
                      <div className="wardrobe-door-customize-section-grid" role="list">
                        {doorFrontCustomizeEntries.map(({ flatIndex, label }) => {
                          const panelId =
                            doorsCfg.doorPanelMaterialIds[flatIndex] ??
                            doorsCfg.doorPanelMaterialIds[0] ??
                            frameMaterial;
                          const mat = exteriorMaterials.find((m) => m.id === panelId);
                          return (
                            <button
                              key={flatIndex}
                              type="button"
                              role="listitem"
                              className="wardrobe-door-customize-section-card"
                              onClick={() => setCustomizePanelIndex(flatIndex)}
                            >
                              <span className="wardrobe-door-customize-section-card-title">{label}</span>
                              <span className="wardrobe-door-customize-section-card-swatch">
                                <SwatchCircle
                                  mat={
                                    mat ??
                                    ({
                                      id: panelId,
                                      name: "—",
                                      color: "#c8c4bc",
                                      roughness: 0.5,
                                      metalness: 0,
                                      priceMultiplier: 1,
                                    } as WardrobeMaterial)
                                  }
                                />
                              </span>
                              <span className="wardrobe-door-customize-section-card-finish">
                                {mat?.name ?? "Finish"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="wardrobe-door-customize-edit">
                      <button
                        type="button"
                        className="wardrobe-door-customize-back"
                        onClick={() => setCustomizePanelIndex(null)}
                      >
                        ← All doors
                      </button>
                      {(() => {
                        const i = customizePanelIndex!;
                        const heading =
                          doorFrontCustomizeEntries.find((e) => e.flatIndex === i)?.label ?? `Door ${i + 1}`;
                        const panelId =
                          doorsCfg.doorPanelMaterialIds[i] ??
                          doorsCfg.doorPanelMaterialIds[0] ??
                          frameMaterial;
                        const panelGrain =
                          doorsCfg.doorPanelGrainDirections?.[i] ?? doorGrain;
                        const browseKey = `ext-panel-${i}`;
                        return (
                          <>
                            <h4 className="wardrobe-finishes-subheading">{heading}</h4>
                            <WardrobeFinishesByBrand
                              materials={exteriorMaterials}
                              keyPrefix={browseKey}
                              selectedId={panelId}
                              onPick={(id) => {
                                setDoorPanelMaterial(i, id);
                                if (linkFinishes) {
                                  const st = useWardrobeStore.getState();
                                  const g =
                                    st.config.doors.doorPanelGrainDirections?.[i] ??
                                    st.config.doorGrainDirection ??
                                    st.config.frameGrainDirection ??
                                    "horizontal";
                                  setInteriorMaterial(id);
                                  setInteriorGrain(g);
                                }
                              }}
                              browseModalTitle={`${heading} — materials`}
                              browseCatalogMaterials={browseCatalogExterior}
                              browseCatalogLoading={browseCatalogLoading}
                              browseCatalogSubtitle={WARDROBE_BROWSE_CATALOG_SUBTITLE}
                            />
                            <div className="wardrobe-finishes-grain-block">
                              <span className="cfg-label wardrobe-finishes-sublabel">Grain (this front only)</span>
                              <GrainToggle
                                value={panelGrain}
                                onChange={(d) => {
                                  setDoorPanelGrainDirection(i, d);
                                  if (linkFinishes) setInteriorGrain(d);
                                }}
                              />
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )
                ) : (
                  <>
                    <WardrobeFinishesByBrand
                      materials={exteriorMaterials}
                      keyPrefix="ext"
                      selectedId={frameMaterial}
                      onPick={pickUniformExterior}
                      browseModalTitle="All exterior materials"
                      browseCatalogMaterials={browseCatalogExterior}
                      browseCatalogLoading={browseCatalogLoading}
                      browseCatalogSubtitle={WARDROBE_BROWSE_CATALOG_SUBTITLE}
                    />
                    <div className="wardrobe-finishes-grain-block">
                      <span className="cfg-label wardrobe-finishes-sublabel">Grain (carcass + door fronts)</span>
                      <GrainToggle value={frameGrain} onChange={onExteriorGrainChange} />
                    </div>
                  </>
                )}
              </section>
            )}
          </div>

          <div
            id={interiorPanelId}
            role="tabpanel"
            aria-labelledby="wardrobe-finishes-tab-interior"
            hidden={finishArea !== "interior"}
            className="wardrobe-finishes-tab-panel"
          >
            {!hasInteriorRow ? (
              <p className="cfg-hint wardrobe-finishes-section-desc">
                No interior catalog loaded — add materials in the admin.
              </p>
            ) : (
              <section
                className="wardrobe-finishes-section"
                aria-labelledby="wardrobe-finishes-interior-heading"
              >
                <h3 id="wardrobe-finishes-interior-heading" className="wardrobe-finishes-section-title">
                  <LayoutGrid size={18} strokeWidth={2} aria-hidden />
                  Interior
                </h3>
                <p className="wardrobe-finishes-section-desc">
                  Shelves, shoe-rack boards, drawer box parts, and other surfaces visible inside the bays — not door/drawer
                  faces (those follow Exterior unless you link finishes above).
                </p>
                <WardrobeFinishesByBrand
                  materials={frameMaterials}
                  keyPrefix="int"
                  selectedId={interiorMaterial}
                  onPick={pickInterior}
                  browseModalTitle="All interior materials"
                  browseCatalogMaterials={browseCatalogInterior}
                  browseCatalogLoading={browseCatalogLoading}
                  browseCatalogSubtitle={WARDROBE_BROWSE_CATALOG_SUBTITLE}
                />
                <div className="wardrobe-finishes-grain-block">
                  <span className="cfg-label wardrobe-finishes-sublabel">Grain direction</span>
                  <GrainToggle value={interiorGrain} onChange={onInteriorGrainChange} />
                </div>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}


/* ── Room Panel ──────────────────────────────────────────────────── */

function RoomPanel() {
  const lengthUnit = useWardrobeStore((s) => s.ui.lengthUnit);
  const setLengthUnit = useWardrobeStore((s) => s.setLengthUnit);
  const room = useWardrobeStore((s) => s.room);
  const roomWidthM = room.roomWidthM ?? 3;
  const roomDepthM = room.roomDepthM ?? 3;
  const roomHeightM = room.roomHeightM ?? 2.8;
  const setRoomWidthM = useWardrobeStore((s) => s.setRoomWidthM);
  const setRoomDepthM = useWardrobeStore((s) => s.setRoomDepthM);
  const setRoomHeightM = useWardrobeStore((s) => s.setRoomHeightM);
  const setFloorStyle = useWardrobeStore((s) => s.setFloorStyle);
  const setPlannerFloorSurface = useWardrobeStore((s) => s.setPlannerFloorSurface);
  const setPlannerWallCeilingSurface = useWardrobeStore((s) => s.setPlannerWallCeilingSurface);

  const unitForSliders: Exclude<LengthUnit, "mm"> = lengthUnit === "mm" ? "cm" : lengthUnit;

  return (
    <div className="panel-content wardrobe-preview-room-dims">
      <div className="cfg-group">
        <div className="wardrobe-room-dim-heading">
          <span className="wardrobe-room-dim-title">Dimensions</span>
          <LengthUnitToggleButtons lengthUnit={unitForSliders} onChange={(u) => setLengthUnit(u)} />
        </div>
        <span className="cfg-sublabel">
          Preview room only — scales walls and floor. Wardrobe body sizes use Footprint and Frames.
        </span>
        <div className="room-sliders">
          <label className="slider-row">
            <span className="slider-label">Width</span>
            <input
              type="range"
              min={metersToDisplay(ROOM_PLAN_MIN_M, unitForSliders)}
              max={metersToDisplay(ROOM_PLAN_MAX_M, unitForSliders)}
              step={unitForSliders === "in" ? 1 : 5}
              value={metersToDisplay(roomWidthM, unitForSliders)}
              onChange={(e) => {
                const m = displayToMeters(Number(e.target.value), unitForSliders);
                const w = Math.min(ROOM_PLAN_MAX_M, Math.max(ROOM_PLAN_MIN_M, m));
                setRoomWidthM(w);
              }}
            />
            <span className="slider-value">{formatLengthLabel(roomWidthM, unitForSliders)}</span>
          </label>
          <label className="slider-row">
            <span className="slider-label">Depth</span>
            <input
              type="range"
              min={metersToDisplay(ROOM_PLAN_MIN_M, unitForSliders)}
              max={metersToDisplay(ROOM_PLAN_MAX_M, unitForSliders)}
              step={unitForSliders === "in" ? 1 : 5}
              value={metersToDisplay(roomDepthM, unitForSliders)}
              onChange={(e) => {
                const m = displayToMeters(Number(e.target.value), unitForSliders);
                const d = Math.min(ROOM_PLAN_MAX_M, Math.max(ROOM_PLAN_MIN_M, m));
                setRoomDepthM(d);
              }}
            />
            <span className="slider-value">{formatLengthLabel(roomDepthM, unitForSliders)}</span>
          </label>
          <label className="slider-row">
            <span className="slider-label">Height</span>
            <input
              type="range"
              min={metersToDisplay(ROOM_HEIGHT_MIN_M, unitForSliders)}
              max={metersToDisplay(ROOM_HEIGHT_MAX_M, unitForSliders)}
              step={unitForSliders === "in" ? 0.5 : 2}
              value={metersToDisplay(roomHeightM, unitForSliders)}
              onChange={(e) => {
                const m = displayToMeters(Number(e.target.value), unitForSliders);
                const h = Math.min(ROOM_HEIGHT_MAX_M, Math.max(ROOM_HEIGHT_MIN_M, m));
                setRoomHeightM(h);
              }}
            />
            <span className="slider-value">{formatLengthLabel(roomHeightM, unitForSliders)}</span>
          </label>
        </div>
      </div>

      <div className="cfg-group" style={{ marginTop: 14 }}>
        <span className="cfg-label">Floor appearance</span>
        <span className="cfg-sublabel">Preview room floor in 3D</span>
        <PlannerFloorSurfaceControls
          presetVariant="kitchen-grid"
          floorStyle={room.floorStyle}
          mode={room.floorMaterialMode}
          textureUrl={room.floorCustomTextureUrl}
          uvRotationDeg={room.floorUvRotationDeg}
          textureStartSide={room.floorTextureStartSide}
          layoutPattern={room.floorLayoutPattern}
          tileWcm={room.floorTileWidthCm}
          tileHcm={room.floorTileHeightCm}
          groutCm={room.floorTileGroutCm}
          groutColor={room.floorTileGroutColor}
          onPresetPick={(style) => setFloorStyle(style)}
          onPatch={(patch) => setPlannerFloorSurface(patch)}
        />
      </div>

      <div className="cfg-group" style={{ marginTop: 14 }}>
        <span className="cfg-label">Walls & ceiling</span>
        <span className="cfg-sublabel">Room preview — textures persist with the design</span>
        <PlannerInteriorSurfaceControls
          title="Walls"
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
          onPatch={(patch) => setPlannerWallCeilingSurface(patch)}
        />
        <PlannerInteriorSurfaceControls
          title="Ceiling"
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
          onPatch={(patch) => setPlannerWallCeilingSurface(patch)}
        />
      </div>
    </div>
  );
}

/* ── Shared ───────────────────────────────────────────────────────── */

function GrainToggle({ value, onChange }: { value: GrainDirection; onChange: (d: GrainDirection) => void }) {
  const next: GrainDirection = value === "horizontal" ? "vertical" : "horizontal";
  return (
    <button
      type="button"
      className="cfg-chip"
      onClick={() => onChange(next)}
      title="Change direction"
      style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 10px", marginTop: "6px", fontSize: "12px" }}
    >
      <RefreshCw size={13} />
      Change direction
    </button>
  );
}

function SwatchCircle({ mat }: { mat: WardrobeMaterial }) {
  return (
    <div className="swatch-circle" style={{ backgroundColor: mat.color }}>
      {mat.imageUrl && (
        <img
          src={mat.imageUrl}
          alt=""
          className="swatch-circle-img"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      )}
    </div>
  );
}
