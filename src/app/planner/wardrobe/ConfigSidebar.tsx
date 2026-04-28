"use client";

import { useEffect, useState, useMemo } from "react";
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
import { useStore } from "@/lib/store";
import { useResolvedAdmin } from "@/contexts/PublishedTenantProvider";
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
  getMaterial,
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
  groupWardrobeMaterialsByCategory,
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
} from "./data";
import type { WardrobeMaterial } from "./data";
import type {
  DoorType,
  GrainDirection,
  HingedDoorHandleSide,
  WardrobeAddon,
  WardrobeBaseType,
  ShelfDepthPlacement,
} from "./types";
import { createLaminateThumbnailDataUrl } from "../scene/RoomMesh";
import type { FloorStyle } from "../types";

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
  { id: "doors", label: "Doors & fronts", icon: <DoorOpen size={20} /> },
  { id: "handles", label: "Handles", icon: <Grip size={20} /> },
  { id: "materials", label: "Finishes", icon: <Paintbrush size={20} /> },
  { id: "room", label: "Room", icon: <Home size={20} /> },
];

/** Stable fallback so Zustand selectors do not return a new [] each snapshot. */
const EMPTY_WARDROBE_ADDONS: WardrobeAddon[] = [];

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

function WardrobeFinishesByCategory({
  materials,
  keyPrefix,
  selectedId,
  onPick,
}: {
  materials: WardrobeMaterial[];
  keyPrefix: string;
  selectedId: string;
  onPick: (id: string) => void;
}) {
  const groups = useMemo(() => groupWardrobeMaterialsByCategory(materials), [materials]);
  return (
    <>
      {groups.map((g) => (
        <div key={g.key} className="wardrobe-finish-cat" style={{ marginBottom: 10 }}>
          <span className="cfg-sublabel" style={{ display: "block", marginBottom: "6px" }}>
            {g.label}
          </span>
          <div className="mat-grid">
            {g.items.map((mat) => (
              <button
                key={`${keyPrefix}-${g.key}-${mat.id}`}
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
        </div>
      ))}
    </>
  );
}

function DoorFinishFullScreenModal({
  doorMaterials,
  selectedId,
  onClose,
  onSelect,
}: {
  doorMaterials: WardrobeMaterial[];
  selectedId: string;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const byBrand = useMemo(() => groupWardrobeMaterialsByBrand(doorMaterials), [doorMaterials]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return byBrand;
    return byBrand
      .map((g) => ({
        ...g,
        items: g.items.filter((m) => m.name.toLowerCase().includes(q)),
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
      aria-labelledby="wardrobe-door-material-modal-title"
    >
      <div className="wardrobe-door-material-modal-backdrop" onClick={onClose} aria-hidden />
      <div className="wardrobe-door-material-modal-panel">
        <div className="wardrobe-door-material-modal-header">
          <h2 id="wardrobe-door-material-modal-title" className="wardrobe-door-material-modal-title">
            All door materials
          </h2>
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
          {filtered.length === 0 ? (
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

function DoorFinishByBrand({
  doorMaterials,
  keyPrefix,
  selectedId,
  onPick,
}: {
  doorMaterials: WardrobeMaterial[];
  keyPrefix: string;
  selectedId: string;
  onPick: (id: string) => void;
}) {
  const byBrand = useMemo(() => groupWardrobeMaterialsByBrand(doorMaterials), [doorMaterials]);
  const [activeBrand, setActiveBrand] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const g = byBrand.find((b) => b.items.some((m) => m.id === selectedId));
    if (g) {
      setActiveBrand(g.key);
      return;
    }
    if (byBrand[0]) setActiveBrand(byBrand[0].key);
  }, [selectedId, byBrand]);

  const current = byBrand.find((b) => b.key === activeBrand);
  const currentItems = current?.items ?? [];

  return (
    <>
      <div className="cfg-label-row" style={{ marginBottom: 8, width: "100%" }}>
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
            className={`cfg-chip ${activeBrand === b.key ? "active" : ""}`}
            onClick={() => setActiveBrand(b.key)}
          >
            {b.label}
            <span className="wardrobe-brand-chip-count"> {b.items.length}</span>
          </button>
        ))}
      </div>
      <div className="mat-grid" style={{ marginTop: 8 }}>
        {currentItems.map((mat) => (
          <button
            key={`${keyPrefix}-${activeBrand}-${mat.id}`}
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
        <DoorFinishFullScreenModal
          doorMaterials={doorMaterials}
          selectedId={selectedId}
          onClose={() => setModalOpen(false)}
          onSelect={(id) => {
            onPick(id);
            setModalOpen(false);
            const g = byBrand.find((b) => b.items.some((m) => m.id === id));
            if (g) setActiveBrand(g.key);
          }}
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
  const doorGrain = useWardrobeStore((s) => s.config.doorGrainDirection ?? "horizontal");
  const setDoorType = useWardrobeStore((s) => s.setDoorType);
  const setAllDoorPanelMaterials = useWardrobeStore((s) => s.setAllDoorPanelMaterials);
  const setDoorPanelMaterial = useWardrobeStore((s) => s.setDoorPanelMaterial);
  const setDoorPanelGrainDirection = useWardrobeStore((s) => s.setDoorPanelGrainDirection);
  const setSlidingMechanism = useWardrobeStore((s) => s.setSlidingMechanism);
  const setDoorGrain = useWardrobeStore((s) => s.setDoorGrainDirection);
  const toggleDoors = useWardrobeStore((s) => s.toggleDoors);
  const doorMaterials = useWardrobeStore((s) => s.availableDoorMaterials);
  const slidingMechanisms = useWardrobeStore((s) => s.availableSlidingMechanisms);
  const customizeEachDoor = useWardrobeStore((s) => s.ui.customizeEachDoor);
  const setCustomizeEachDoor = useWardrobeStore((s) => s.setCustomizeEachDoor);
  const setSectionHingedDoorCount = useWardrobeStore(
    (s) => s.setSectionHingedDoorCount,
  );

  const slidingMechanismDisplayList =
    slidingMechanisms.length > 0 ? slidingMechanisms : [INTERNAL_RENDER_FALLBACK];
  const slidingMechanismPickerReadOnly = slidingMechanisms.length === 0;

  const panelIds = doors.doorPanelMaterialIds;
  const allPanelsSameFinish = useMemo(
    () => panelIds.length > 0 && panelIds.every((id) => id === panelIds[0]),
    [panelIds],
  );

  const activePanelMaterialId = panelIds[0] ?? "";

  const resolvedDoorMat = useMemo(
    () => getMaterial(activePanelMaterialId, doorMaterials),
    [activePanelMaterialId, doorMaterials],
  );
  const isGlassDoorSurface =
    resolvedDoorMat.surfaceType === "mirror" ||
    resolvedDoorMat.surfaceType === "frosted-glass" ||
    resolvedDoorMat.surfaceType === "smoked-glass";
  const showGrainToggle = doors.type !== "none" && !isGlassDoorSurface;

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
            <button className="cfg-toggle" onClick={toggleDoors}>
              {showDoors ? "Hide" : "Show"}
            </button>
          )}
        </div>
        <div className="door-cards">
          {doorTypes.map((dt) => (
            <button
              key={dt.id}
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

      {doors.type !== "none" && (
        <>
          <div className="cfg-divider" />
          <div className="cfg-group">
            <span className="cfg-label">Door finish</span>
            {!customizeEachDoor && (
              <DoorFinishByBrand
                doorMaterials={doorMaterials}
                keyPrefix="door-all"
                selectedId={allPanelsSameFinish && panelIds[0] ? panelIds[0] : ""}
                onPick={(id) => {
                  setAllDoorPanelMaterials(id);
                  setCustomizeEachDoor(false);
                }}
              />
            )}
            <label className="cfg-toggle-row" style={{ marginTop: "10px", display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={customizeEachDoor}
                onChange={(e) => {
                  const on = e.target.checked;
                  setCustomizeEachDoor(on);
                  if (!on && panelIds.length > 0) {
                    setAllDoorPanelMaterials(panelIds[0]!);
                    const g = doors.doorPanelGrainDirections[0] ?? doorGrain;
                    setDoorGrain(g);
                  }
                }}
              />
              <span className="cfg-sublabel" style={{ margin: 0 }}>
                Customize each door
              </span>
            </label>
            {customizeEachDoor &&
              panelIds.map((panelMatId, idx) => {
                const panelMat = getMaterial(panelMatId, doorMaterials);
                const panelIsGlass =
                  panelMat.surfaceType === "mirror" ||
                  panelMat.surfaceType === "frosted-glass" ||
                  panelMat.surfaceType === "smoked-glass";
                return (
                  <div key={idx} className="cfg-group" style={{ marginTop: "12px" }}>
                    <span className="cfg-sublabel" style={{ display: "block", marginBottom: "6px" }}>
                      {doors.type === "hinged" ? `Door — section ${idx + 1}` : `Door panel ${idx + 1}`}
                    </span>
                    <DoorFinishByBrand
                      doorMaterials={doorMaterials}
                      keyPrefix={`door-p${idx}`}
                      selectedId={panelMatId}
                      onPick={(id) => setDoorPanelMaterial(idx, id)}
                    />
                    {showGrainToggle && !panelIsGlass && (
                      <GrainToggle
                        value={doors.doorPanelGrainDirections[idx] ?? doorGrain}
                        onChange={(d) => setDoorPanelGrainDirection(idx, d)}
                      />
                    )}
                  </div>
                );
              })}
            {showGrainToggle && !customizeEachDoor && (
              <GrainToggle value={doorGrain} onChange={setDoorGrain} />
            )}
          </div>
          {doors.type === "sliding" && (
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
          )}
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

function MaterialsPanel() {
  const frameMaterial = useWardrobeStore((s) => s.config.frameMaterial);
  const interiorMaterial = useWardrobeStore((s) => s.config.interiorMaterial);
  const frameGrain = useWardrobeStore((s) => s.config.frameGrainDirection ?? "horizontal");
  const interiorGrain = useWardrobeStore((s) => s.config.interiorGrainDirection ?? "horizontal");
  const setFrameMaterial = useWardrobeStore((s) => s.setFrameMaterial);
  const setInteriorMaterial = useWardrobeStore((s) => s.setInteriorMaterial);
  const setFrameGrain = useWardrobeStore((s) => s.setFrameGrainDirection);
  const setInteriorGrain = useWardrobeStore((s) => s.setInteriorGrainDirection);
  const materials = useWardrobeStore((s) => s.availableMaterials);

  return (
    <div className="panel-content">
      {materials.length === 0 && (
        <p className="cfg-sublabel" style={{ marginBottom: "12px" }}>
          No materials in your account yet. Add finishes in the admin, or run the API seed so the default
          decor library loads automatically when your catalog is empty.
        </p>
      )}
      <div className="cfg-group">
        <span className="cfg-label">Frame (carcass) exterior</span>
        <span className="cfg-sublabel">Visible sides of the wardrobe box</span>
        <WardrobeFinishesByCategory
          materials={materials}
          keyPrefix="frame"
          selectedId={frameMaterial}
          onPick={setFrameMaterial}
        />
        <GrainToggle value={frameGrain} onChange={setFrameGrain} />
      </div>

      <div className="cfg-divider" />

      <div className="cfg-group">
        <span className="cfg-label">Interior (shelves &amp; sides)</span>
        <span className="cfg-sublabel">Inside finish — often lighter than the frame</span>
        <WardrobeFinishesByCategory
          materials={materials}
          keyPrefix="int"
          selectedId={interiorMaterial}
          onPick={setInteriorMaterial}
        />
        <GrainToggle value={interiorGrain} onChange={setInteriorGrain} />
      </div>
    </div>
  );
}

/* ── Room Panel ──────────────────────────────────────────────────── */

const WALL_PRESETS = [
  { color: "#fafafa", label: "White" },
  { color: "#e8e6e2", label: "Warm Gray" },
  { color: "#d5d0c8", label: "Greige" },
  { color: "#c8c0b4", label: "Linen" },
  { color: "#b8c4c8", label: "Cool Blue" },
  { color: "#c8d0c4", label: "Sage" },
  { color: "#e0d4c8", label: "Sand" },
  { color: "#d8d0d8", label: "Lavender" },
];

function RoomPanel() {
  const wallColor = useWardrobeStore((s) => s.room.wallColor);
  const floorStyle = useWardrobeStore((s) => s.room.floorStyle);
  const setWallColor = useWardrobeStore((s) => s.setWallColor);
  const setFloorStyle = useWardrobeStore((s) => s.setFloorStyle);

  return (
    <div className="panel-content">
      <div className="cfg-group">
        <span className="cfg-label">Wall Color</span>
        <div className="room-wall-picker">
          <input
            type="color"
            value={wallColor}
            onChange={(e) => setWallColor(e.target.value)}
            className="room-color-input"
          />
          <input
            type="text"
            value={wallColor}
            onChange={(e) => {
              const v = e.target.value;
              if (/^#[0-9a-fA-F]{6}$/.test(v)) setWallColor(v);
            }}
            className="room-color-hex"
            spellCheck={false}
          />
        </div>
        <div className="room-wall-presets">
          {WALL_PRESETS.map((p) => (
            <button
              key={p.color}
              className={`room-wall-swatch ${wallColor === p.color ? "active" : ""}`}
              style={{ backgroundColor: p.color }}
              onClick={() => setWallColor(p.color)}
              title={p.label}
            />
          ))}
        </div>
      </div>

      <div className="cfg-divider" />

      <div className="cfg-group">
        <span className="cfg-label">Floor</span>
        <span className="cfg-sublabel">
          Neutral preview — no preset wood/laminate catalog here. Wardrobe finishes come from the Finishes tab
          (admin materials).
        </span>
        <div className="room-floor-grid">
          <FloorStyleSwatch
            style="laminate-soft-beige"
            label="Neutral"
            selected={floorStyle === "laminate-soft-beige"}
            onClick={() => setFloorStyle("laminate-soft-beige")}
          />
        </div>
      </div>
    </div>
  );
}

function FloorStyleSwatch({
  style,
  label,
  selected,
  onClick,
}: {
  style: FloorStyle;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  const dataUrl = useMemo(() => createLaminateThumbnailDataUrl(style, 88, 56), [style]);
  return (
    <button
      className={`room-floor-swatch ${selected ? "selected" : ""}`}
      onClick={onClick}
      title={label}
    >
      <img src={dataUrl} alt={label} className="room-floor-swatch-preview" />
      <span className="room-floor-swatch-label">{label}</span>
    </button>
  );
}

/* ── Shared ───────────────────────────────────────────────────────── */

function GrainToggle({ value, onChange }: { value: GrainDirection; onChange: (d: GrainDirection) => void }) {
  const next: GrainDirection = value === "horizontal" ? "vertical" : "horizontal";
  return (
    <button
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
