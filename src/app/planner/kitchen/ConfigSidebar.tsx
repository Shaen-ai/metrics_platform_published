"use client";

import { useState, useMemo, useCallback } from "react";
import {
  ChevronRight,
  ChevronLeft,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  LayoutGrid,
  Paintbrush,
  Box,
  Home,
  Grip,
  Square,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Anchor,
  Sparkles,
} from "lucide-react";
import { useKitchenStore } from "./store";
import {
  BASE_MODULE_CATALOG,
  WALL_MODULE_CATALOG,
  KITCHEN_BASE_MODULE_PRESETS,
  KITCHEN_WALL_MODULE_PRESETS,
  KITCHEN_HIGH_MODULE_PRESETS,
  NEUTRAL_KITCHEN_MATERIAL,
  COUNTERTOP_OPTIONS,
  HANDLES,
  MODULE_WIDTHS,
  DESIGN_REF_PRESETS,
  getEffectiveBaseDims,
  getEffectiveWallDims,
  getBaseModuleLimits,
  getWallModuleLimits,
  getCountertopPricePerLinearMeter,
  resolveCountertopKitchenMaterial,
} from "./data";
import type { KitchenModulePresetBase, KitchenModulePresetWall } from "./data";
import type { KitchenMaterial } from "./data";
import type { Module } from "@/lib/types";
import { useStore } from "@/lib/store";
import { formatPrice } from "@/lib/utils";
import type { ModuleDimensionLimits } from "./data";
import type { BaseModuleType, WallModuleType, DesignRefKind, GrainDirection } from "./types";
import { LAMINATE_OPTIONS } from "../types";
import { createLaminateThumbnailDataUrl } from "../scene/RoomMesh";
import type { FloorStyle } from "../types";
import { DraftScalarInput } from "../components/DraftNumberFields";

/** HTML5 drag payload for reordering modules within one list (main wall base/wall, island base/wall). */
const KITCHEN_MODULE_DND_MIME = "application/x-kitchen-module-order";

const DND_LIST_MAIN_BASE = "main-base";
const DND_LIST_MAIN_WALL = "main-wall";
const DND_LIST_ISLAND_BASE = "island-base";
const DND_LIST_ISLAND_WALL = "island-wall";
const DND_LIST_LEFT_BASE = "left-base";
const DND_LIST_LEFT_WALL = "left-wall";

/** HTML5 drag payload for admin catalog modules (floor → base run, wall → wall run). */
const KITCHEN_CATALOG_FLOOR_MIME = "application/x-kitchen-catalog-floor";
const KITCHEN_CATALOG_WALL_MIME = "application/x-kitchen-catalog-wall";

/** Browsers often omit custom MIME types from `types` during dragover — accept text/plain fallback (set alongside custom mime in dragstart). */
function kitchenDragTypesAllowCatalog(e: React.DragEvent, mime: string): boolean {
  const types = [...e.dataTransfer.types];
  if (types.includes(mime)) return true;
  return types.includes("text/plain") || types.includes("Text");
}

/** Plain text from drop: module id, or reorder JSON — ignore JSON reorder payloads. */
function catalogIdFromTextPlain(e: React.DragEvent): string {
  const raw = e.dataTransfer.getData("text/plain").trim();
  if (!raw) return "";
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as { listId?: string };
      if (parsed && typeof parsed === "object" && "listId" in parsed) return "";
    } catch {
      /* treat as id string */
    }
  }
  return raw;
}

function KitchenDraggableModuleBlock({
  listId,
  index,
  onReorder,
  onCatalogDropId,
  children,
}: {
  listId: string;
  index: number;
  onReorder: (fromIndex: number, toIndex: number) => void;
  /** When set, drops of matching admin catalog modules on this row append to the run (same as click-to-add). */
  onCatalogDropId?: (moduleId: string) => void;
  children: React.ReactNode;
}) {
  const handleDragOver = (e: React.DragEvent) => {
    const types = [...e.dataTransfer.types];
    if (types.includes(KITCHEN_MODULE_DND_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      return;
    }
    const catalogFloor = kitchenDragTypesAllowCatalog(e, KITCHEN_CATALOG_FLOOR_MIME);
    const catalogWall = kitchenDragTypesAllowCatalog(e, KITCHEN_CATALOG_WALL_MIME);
    if (catalogFloor && listId === DND_LIST_MAIN_BASE && onCatalogDropId) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      return;
    }
    if (catalogWall && listId === DND_LIST_MAIN_WALL && onCatalogDropId) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent) => {
    let floorId = e.dataTransfer.getData(KITCHEN_CATALOG_FLOOR_MIME);
    if (!floorId && listId === DND_LIST_MAIN_BASE && onCatalogDropId) {
      floorId = catalogIdFromTextPlain(e);
    }
    if (floorId && listId === DND_LIST_MAIN_BASE && onCatalogDropId) {
      e.preventDefault();
      e.stopPropagation();
      onCatalogDropId(floorId);
      return;
    }
    let wallId = e.dataTransfer.getData(KITCHEN_CATALOG_WALL_MIME);
    if (!wallId && listId === DND_LIST_MAIN_WALL && onCatalogDropId) {
      wallId = catalogIdFromTextPlain(e);
    }
    if (wallId && listId === DND_LIST_MAIN_WALL && onCatalogDropId) {
      e.preventDefault();
      e.stopPropagation();
      onCatalogDropId(wallId);
      return;
    }
    e.preventDefault();
    try {
      const raw =
        e.dataTransfer.getData(KITCHEN_MODULE_DND_MIME) ||
        e.dataTransfer.getData("text/plain");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { listId: string; index: number };
      if (parsed.listId !== listId || parsed.index === index) return;
      onReorder(parsed.index, index);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="module-block" onDragOver={handleDragOver} onDrop={handleDrop}>
      {children}
    </div>
  );
}

function KitchenDragHandle({
  listId,
  index,
  dragDisabled,
}: {
  listId: string;
  index: number;
  /** Corner base units are fixed in the run — drag to reorder is disabled; use arrow buttons. */
  dragDisabled?: boolean;
}) {
  if (dragDisabled) {
    return (
      <span
        className="module-drag-handle module-drag-handle--disabled"
        title="Corner unit — use arrows to reorder"
        aria-hidden
      >
        <Grip size={14} strokeWidth={2} className="opacity-40" />
      </span>
    );
  }
  return (
    <button
      type="button"
      className="module-drag-handle"
      draggable
      title="Drag to reorder"
      aria-label="Drag to reorder"
      onDragStart={(e) => {
        e.stopPropagation();
        const payload = JSON.stringify({ listId, index });
        e.dataTransfer.setData(KITCHEN_MODULE_DND_MIME, payload);
        e.dataTransfer.setData("text/plain", payload);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <Grip size={14} strokeWidth={2} />
    </button>
  );
}

type SidebarPanel =
  | "home"
  | "layout"
  | "left-wall"
  | "island"
  | "placeholders"
  | "cabinets"
  | "countertop"
  | "fronts"
  | "handles"
  | "room";

const CATEGORIES: { id: SidebarPanel; label: string; icon: React.ReactNode }[] = [
  { id: "layout",        label: "Main wall",   icon: <LayoutGrid size={20} /> },
  { id: "left-wall",     label: "Left wall / Corner", icon: <Box size={20} /> },
  { id: "island",        label: "Island",      icon: <Anchor size={20} /> },
  { id: "placeholders",  label: "Layout aids", icon: <Sparkles size={20} /> },
  { id: "cabinets",      label: "Frames",      icon: <Box size={20} /> },
  { id: "countertop",    label: "Worktop",     icon: <Square size={20} /> },
  { id: "fronts",        label: "Doors & fronts", icon: <Paintbrush size={20} /> },
  { id: "handles",       label: "Handles",     icon: <Grip size={20} /> },
  { id: "room",          label: "Room",        icon: <Home size={20} /> },
];

function isKitchenCatalogModule(m: Module): boolean {
  if (!m.compatibleWith?.length) return true;
  return m.compatibleWith.some((c) => c.toLowerCase().includes("kitchen"));
}

function useFindCatalogModuleById() {
  const yourModules = useStore((s) => s.plannerCustomModules);
  const catalogModules = useStore((s) => s.modules);
  return useCallback(
    (id: string): Module | undefined => {
      const y = yourModules.filter(isKitchenCatalogModule).find((m) => m.id === id);
      if (y) return y;
      return catalogModules.filter(isKitchenCatalogModule).find((m) => m.id === id);
    },
    [yourModules, catalogModules],
  );
}

function useKitchenCatalogDropHandlers(placement: "floor" | "wall") {
  const mime = placement === "floor" ? KITCHEN_CATALOG_FLOOR_MIME : KITCHEN_CATALOG_WALL_MIME;
  const addModuleFromAdminCatalog = useKitchenStore((s) => s.addModuleFromAdminCatalog);
  const findModule = useFindCatalogModuleById();
  const [isOver, setIsOver] = useState(false);

  const onDragEnter = (e: React.DragEvent) => {
    if (!kitchenDragTypesAllowCatalog(e, mime)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const onDragOver = (e: React.DragEvent) => {
    if (!kitchenDragTypesAllowCatalog(e, mime)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsOver(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    let id = e.dataTransfer.getData(mime);
    if (!id) id = catalogIdFromTextPlain(e);
    if (!id) return;
    const m = findModule(id);
    if (!m) return;
    if (m.placementType !== (placement === "floor" ? "floor" : "wall")) return;
    addModuleFromAdminCatalog(m);
  };

  return { onDragEnter, onDragOver, onDragLeave, onDrop, isOver };
}

function KitchenCatalogDraggableTile({
  m,
  onAdd,
}: {
  m: Module;
  onAdd: () => void;
}) {
  const mime = m.placementType === "floor" ? KITCHEN_CATALOG_FLOOR_MIME : KITCHEN_CATALOG_WALL_MIME;
  return (
    <div
      role="button"
      tabIndex={0}
      className="admin-catalog-btn admin-catalog-btn--draggable"
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.setData(mime, m.id);
        e.dataTransfer.setData("text/plain", m.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={onAdd}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAdd();
        }
      }}
      title={m.description || m.name}
    >
      <span className="admin-catalog-btn-name">{m.name}</span>
      <span className="admin-catalog-btn-meta">
        {m.placementType === "floor" ? "Floor" : "Wall"} · {m.dimensions.width}×{m.dimensions.height}×
        {m.dimensions.depth} {m.dimensions.unit}
      </span>
      <span className="admin-catalog-btn-price">
        {m.currency} {m.price.toLocaleString()}
      </span>
    </div>
  );
}

function KitchenCatalogDropRow() {
  const floor = useKitchenCatalogDropHandlers("floor");
  const wall = useKitchenCatalogDropHandlers("wall");
  return (
    <div className="kitchen-catalog-drop-row">
      <div
        className={`kitchen-catalog-drop-zone${floor.isOver ? " kitchen-catalog-drop-zone--active" : ""}`}
        onDragEnter={floor.onDragEnter}
        onDragOver={floor.onDragOver}
        onDragLeave={floor.onDragLeave}
        onDrop={floor.onDrop}
      >
        <span className="kitchen-catalog-drop-zone-label">Drop floor modules → base run</span>
      </div>
      <div
        className={`kitchen-catalog-drop-zone${wall.isOver ? " kitchen-catalog-drop-zone--active" : ""}`}
        onDragEnter={wall.onDragEnter}
        onDragOver={wall.onDragOver}
        onDragLeave={wall.onDragLeave}
        onDrop={wall.onDrop}
      >
        <span className="kitchen-catalog-drop-zone-label">Drop wall modules → wall run</span>
      </div>
    </div>
  );
}

/** Cycle material selection by index (wraps). */
function shiftMaterialSelection(
  materials: KitchenMaterial[],
  selectedId: string,
  delta: -1 | 1,
): string {
  const n = materials.length;
  if (n === 0) return selectedId;
  let idx = materials.findIndex((m) => m.id === selectedId);
  if (idx < 0) idx = 0;
  const nextIdx = (idx + delta + n) % n;
  return materials[nextIdx]!.id;
}

function KitchenGrainToggle({
  value,
  onChange,
}: {
  value: GrainDirection;
  onChange: (d: GrainDirection) => void;
}) {
  const next: GrainDirection = value === "horizontal" ? "vertical" : "horizontal";
  return (
    <button
      type="button"
      className="cfg-chip"
      onClick={() => onChange(next)}
      title="Change grain direction"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: "4px 10px",
        marginTop: "6px",
        fontSize: "12px",
      }}
    >
      <RefreshCw size={13} />
      Change direction
    </button>
  );
}

function DesignKitchenHomePanel({
  setPanel,
}: {
  setPanel: (p: SidebarPanel) => void;
}) {
  const resetConfig = useKitchenStore((s) => s.resetConfig);
  const cabinetMaterial = useKitchenStore((s) => s.config.cabinetMaterial);
  const doorMaterial = useKitchenStore((s) => s.config.doors.material);
  const setCabinetMaterial = useKitchenStore((s) => s.setCabinetMaterial);
  const cabinetGrain = useKitchenStore((s) => s.config.cabinetGrainDirection ?? "horizontal");
  const setCabinetGrainDirection = useKitchenStore((s) => s.setCabinetGrainDirection);
  const setDoorMaterial = useKitchenStore((s) => s.setDoorMaterial);
  const doorGrain = useKitchenStore((s) => s.config.doorGrainDirection ?? "horizontal");
  const setDoorGrainDirection = useKitchenStore((s) => s.setDoorGrainDirection);
  const availableMaterials = useKitchenStore((s) => s.availableMaterials);
  const availableDoorMaterials = useKitchenStore((s) => s.availableDoorMaterials);
  const addModuleFromAdminCatalog = useKitchenStore((s) => s.addModuleFromAdminCatalog);
  const adminModules = useStore((s) => s.modules);
  const plannerCustomModules = useStore((s) => s.plannerCustomModules);
  const storeInitialized = useStore((s) => s.initialized);

  const yourModules = useMemo(
    () => plannerCustomModules.filter(isKitchenCatalogModule),
    [plannerCustomModules],
  );
  const catalogModules = useMemo(
    () => adminModules.filter(isKitchenCatalogModule),
    [adminModules],
  );
  const hasAnyCatalog = yourModules.length > 0 || catalogModules.length > 0;

  const bodyMats =
    availableMaterials.length > 0 ? availableMaterials : [NEUTRAL_KITCHEN_MATERIAL];
  const doorMats =
    availableDoorMaterials.length > 0
      ? availableDoorMaterials
      : [NEUTRAL_KITCHEN_MATERIAL];

  return (
    <div className="sidebar-inner">
      <div className="sidebar-panel-scroll sidebar-home-scroll">
        <div className="sidebar-home-header">
          <h2 className="sidebar-home-title">Design your Kitchen</h2>
          <p className="sidebar-home-sub">
            Configure cabinets and worktops. Blue blocks in 3D are layout helpers only (not priced).
            Use your admin finishes below; catalog modules append to the main or wall cabinet run.
          </p>
        </div>

        <div className="sidebar-home-finishes">
          <div className="sidebar-home-section-title">Finishes</div>
          <div className="sidebar-home-mat-label-row">
            <span className="cfg-sublabel sidebar-home-mat-label">Cabinet frame (carcass)</span>
            <div className="sidebar-home-mat-dir">
              <button
                type="button"
                className="sidebar-home-mat-dir-btn"
                onClick={() =>
                  setCabinetMaterial(
                    shiftMaterialSelection(bodyMats, cabinetMaterial, -1),
                  )
                }
                aria-label="Previous cabinet body material"
                disabled={bodyMats.length <= 1}
              >
                <ChevronLeft size={18} strokeWidth={2.25} />
              </button>
              <button
                type="button"
                className="sidebar-home-mat-dir-btn"
                onClick={() =>
                  setCabinetMaterial(
                    shiftMaterialSelection(bodyMats, cabinetMaterial, 1),
                  )
                }
                aria-label="Next cabinet body material"
                disabled={bodyMats.length <= 1}
              >
                <ChevronRight size={18} strokeWidth={2.25} />
              </button>
            </div>
          </div>
          <div className="sidebar-home-mat-scroll">
            <MaterialGrid
              materials={bodyMats}
              selected={cabinetMaterial}
              onSelect={setCabinetMaterial}
            />
          </div>
          <KitchenGrainToggle value={cabinetGrain} onChange={setCabinetGrainDirection} />
          <div className="sidebar-home-mat-label-row">
            <span className="cfg-sublabel sidebar-home-mat-label">
              Doors &amp; drawer fronts
            </span>
            <div className="sidebar-home-mat-dir">
              <button
                type="button"
                className="sidebar-home-mat-dir-btn"
                onClick={() =>
                  setDoorMaterial(shiftMaterialSelection(doorMats, doorMaterial, -1))
                }
                aria-label="Previous door or drawer front material"
                disabled={doorMats.length <= 1}
              >
                <ChevronLeft size={18} strokeWidth={2.25} />
              </button>
              <button
                type="button"
                className="sidebar-home-mat-dir-btn"
                onClick={() =>
                  setDoorMaterial(shiftMaterialSelection(doorMats, doorMaterial, 1))
                }
                aria-label="Next door or drawer front material"
                disabled={doorMats.length <= 1}
              >
                <ChevronRight size={18} strokeWidth={2.25} />
              </button>
            </div>
          </div>
          <div className="sidebar-home-mat-scroll">
            <MaterialGrid
              materials={doorMats}
              selected={doorMaterial}
              onSelect={setDoorMaterial}
            />
          </div>
          <KitchenGrainToggle value={doorGrain} onChange={setDoorGrainDirection} />
          <div className="sidebar-home-quick-links">
            <button type="button" className="sidebar-quick-chip" onClick={() => setPanel("left-wall")}>
              Left wall / Corner
            </button>
            <button type="button" className="sidebar-quick-chip" onClick={() => setPanel("countertop")}>
              Worktop
            </button>
            <button type="button" className="sidebar-quick-chip" onClick={() => setPanel("handles")}>
              Handles
            </button>
            <button type="button" className="sidebar-quick-chip" onClick={() => setPanel("room")}>
              Room
            </button>
            <button type="button" className="sidebar-quick-chip" onClick={() => setPanel("cabinets")}>
              Body detail
            </button>
            <button type="button" className="sidebar-quick-chip" onClick={() => setPanel("fronts")}>
              Fronts detail
            </button>
          </div>
        </div>

        {storeInitialized &&
          adminModules.length > 0 &&
          catalogModules.length === 0 &&
          yourModules.length === 0 && (
          <div className="sidebar-home-catalog sidebar-home-catalog--hintonly">
            <p className="cfg-hint layout-hint">
              Admin modules need <strong>kitchen</strong> in compatibility (or leave compatibility empty) to
              appear here.
            </p>
          </div>
        )}

        {storeInitialized && hasAnyCatalog && (
          <div className="sidebar-home-catalog">
            <p className="cfg-hint layout-hint sidebar-home-catalog-hint">
              Click or drag tiles onto the targets below (or onto the base / wall lists under Main wall). Floor
              items append to the base run; wall items to the wall run. Type is inferred from the name (e.g.
              Drawer, Sink, Hood).
            </p>
            <KitchenCatalogDropRow />
            {yourModules.length > 0 && (
              <>
                <div className="sidebar-home-section-title">Your modules</div>
                <div className="admin-catalog-grid">
                  {yourModules.map((m) => (
                    <KitchenCatalogDraggableTile
                      key={m.id}
                      m={m}
                      onAdd={() => addModuleFromAdminCatalog(m)}
                    />
                  ))}
                </div>
              </>
            )}
            {catalogModules.length > 0 && (
              <>
                <div className="sidebar-home-section-title">Catalog modules</div>
                <div className="admin-catalog-grid">
                  {catalogModules.map((m) => (
                    <KitchenCatalogDraggableTile
                      key={m.id}
                      m={m}
                      onAdd={() => addModuleFromAdminCatalog(m)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

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
        <button className="sidebar-reset-btn" onClick={resetConfig}>
          <RefreshCw size={14} />
          <span>Reset to default</span>
        </button>
      </div>
    </div>
  );
}

export default function KitchenConfigSidebar() {
  const [panel, setPanel] = useState<SidebarPanel>("home");

  if (panel === "home") {
    return <DesignKitchenHomePanel setPanel={setPanel} />;
  }

  const currentCat = CATEGORIES.find((c) => c.id === panel);

  return (
    <div className="sidebar-inner">
      <button className="sidebar-back-row" onClick={() => setPanel("home")}>
        <ChevronLeft size={18} />
        <span>{currentCat?.label ?? "Back"}</span>
      </button>
      <div className="sidebar-panel-scroll">
        {panel === "layout"        && <LayoutPanel />}
        {panel === "left-wall"     && <LeftWallPanel />}
        {panel === "island"        && <IslandPanel />}
        {panel === "placeholders"  && <PlaceholdersPanel />}
        {panel === "cabinets"      && <CabinetsPanel />}
        {panel === "countertop" && <CountertopPanel />}
        {panel === "fronts"     && <FrontsPanel />}
        {panel === "handles"    && <HandlesPanel />}
        {panel === "room"       && <RoomPanel />}
      </div>
    </div>
  );
}

function ModuleSizeEditor({
  dims,
  limits,
  onPatch,
}: {
  dims: { w: number; h: number; d: number };
  limits: ModuleDimensionLimits;
  onPatch: (p: { width?: number; heightCm?: number; depthCm?: number }) => void;
}) {
  return (
    <div className="module-size-editor" onClick={(e) => e.stopPropagation()}>
      <div className="dim-field">
        <span className="dim-field-label">Width</span>
        <div className="dim-field-row">
          <DraftScalarInput
            value={dims.w}
            min={limits.minW}
            max={limits.maxW}
            format={(n) => String(Math.round(n))}
            onCommit={(v) => onPatch({ width: Math.round(v) })}
            className="dim-number"
          />
          <span className="dim-unit">cm</span>
        </div>
        <input
          type="range"
          className="dim-range"
          min={limits.minW}
          max={limits.maxW}
          step={1}
          value={dims.w}
          onChange={(e) => onPatch({ width: Number(e.target.value) })}
        />
      </div>
      <div className="dim-field">
        <span className="dim-field-label">Height</span>
        <div className="dim-field-row">
          <DraftScalarInput
            value={dims.h}
            min={limits.minH}
            max={limits.maxH}
            format={(n) => String(Math.round(n))}
            onCommit={(v) => onPatch({ heightCm: Math.round(v) })}
            className="dim-number"
          />
          <span className="dim-unit">cm</span>
        </div>
        <input
          type="range"
          className="dim-range"
          min={limits.minH}
          max={limits.maxH}
          step={1}
          value={dims.h}
          onChange={(e) => onPatch({ heightCm: Number(e.target.value) })}
        />
      </div>
      <div className="dim-field">
        <span className="dim-field-label">Depth</span>
        <div className="dim-field-row">
          <DraftScalarInput
            value={dims.d}
            min={limits.minD}
            max={limits.maxD}
            format={(n) => String(Math.round(n))}
            onCommit={(v) => onPatch({ depthCm: Math.round(v) })}
            className="dim-number"
          />
          <span className="dim-unit">cm</span>
        </div>
        <input
          type="range"
          className="dim-range"
          min={limits.minD}
          max={limits.maxD}
          step={1}
          value={dims.d}
          onChange={(e) => onPatch({ depthCm: Number(e.target.value) })}
        />
      </div>
    </div>
  );
}

/** Grouped default modules (base / wall / high) for Kitchen Designer add buttons. */
function KitchenDesignerModulePresets({
  onBasePreset,
  onWallPreset,
  onHighPreset,
}: {
  onBasePreset: (p: KitchenModulePresetBase) => void;
  onWallPreset: (p: KitchenModulePresetWall) => void;
  onHighPreset: (p: KitchenModulePresetBase) => void;
}) {
  return (
    <>
      <div className="module-preset-category module-preset-category--accent">Base cabinets</div>
      <div className="module-add-grid">
        {KITCHEN_BASE_MODULE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="module-add-btn"
            onClick={() => onBasePreset(p)}
            title={p.description ?? p.label}
          >
            <span className="module-add-btn-icon" aria-hidden>
              <Plus size={16} strokeWidth={2} />
            </span>
            <span className="module-add-btn-label">{p.label}</span>
          </button>
        ))}
      </div>

      <div className="module-preset-category">Wall cabinets</div>
      <div className="module-add-grid">
        {KITCHEN_WALL_MODULE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="module-add-btn"
            onClick={() => onWallPreset(p)}
            title={p.description ?? p.label}
          >
            <span className="module-add-btn-icon" aria-hidden>
              <Plus size={16} strokeWidth={2} />
            </span>
            <span className="module-add-btn-label">{p.label}</span>
          </button>
        ))}
      </div>

      <div className="module-preset-category">High cabinets</div>
      <div className="module-add-grid">
        {KITCHEN_HIGH_MODULE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="module-add-btn"
            onClick={() => onHighPreset(p)}
            title={p.description ?? p.label}
          >
            <span className="module-add-btn-icon" aria-hidden>
              <Plus size={16} strokeWidth={2} />
            </span>
            <span className="module-add-btn-label">{p.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}

// ── Layout Panel ──────────────────────────────────────────────────────

function LayoutPanel() {
  const config = useKitchenStore((s) => s.config);
  const ui = useKitchenStore((s) => s.ui);
  const addBaseModule = useKitchenStore((s) => s.addBaseModule);
  const removeBaseModule = useKitchenStore((s) => s.removeBaseModule);
  const setBaseModuleWidth = useKitchenStore((s) => s.setBaseModuleWidth);
  const setBaseModuleDimensions = useKitchenStore((s) => s.setBaseModuleDimensions);
  const reorderBaseModules = useKitchenStore((s) => s.reorderBaseModules);
  const addWallModule = useKitchenStore((s) => s.addWallModule);
  const removeWallModule = useKitchenStore((s) => s.removeWallModule);
  const setWallModuleWidth = useKitchenStore((s) => s.setWallModuleWidth);
  const setWallModuleDimensions = useKitchenStore((s) => s.setWallModuleDimensions);
  const reorderWallModules = useKitchenStore((s) => s.reorderWallModules);
  const toggleWallCabinets = useKitchenStore((s) => s.toggleWallCabinets);
  const selectBaseModule = useKitchenStore((s) => s.selectBaseModule);
  const selectWallModule = useKitchenStore((s) => s.selectWallModule);
  const addModuleFromAdminCatalog = useKitchenStore((s) => s.addModuleFromAdminCatalog);
  const findCatalogModule = useFindCatalogModuleById();
  const catalogDropBase = useKitchenCatalogDropHandlers("floor");
  const catalogDropWall = useKitchenCatalogDropHandlers("wall");

  const onCatalogDropId = useCallback(
    (id: string) => {
      const mod = findCatalogModule(id);
      if (mod) addModuleFromAdminCatalog(mod);
    },
    [findCatalogModule, addModuleFromAdminCatalog],
  );

  const totalBaseW = config.baseModules.reduce((s, m) => s + m.width, 0);

  return (
    <div className="panel-content">
      {/* Base cabinet run */}
      <div className="cfg-section-title">Base run</div>
      <p className="cfg-hint layout-hint">
        Tap a unit to select it. In the 3D view, drag a cabinet along the wall to change its place in the run, or
        use the grip icon / arrows in this list. You can also drag admin catalog modules from the home screen
        onto this list. Edit W×H×D for each appliance or cabinet.
      </p>

      <div className="cfg-info-card">
        <span>Total run: <strong>{totalBaseW} cm</strong></span>
        <span>{config.baseModules.length} module{config.baseModules.length !== 1 ? "s" : ""}</span>
      </div>

      <div
        className={`module-list${catalogDropBase.isOver ? " module-list--catalog-drop-active" : ""}`}
        onDragEnter={catalogDropBase.onDragEnter}
        onDragOver={catalogDropBase.onDragOver}
        onDragLeave={catalogDropBase.onDragLeave}
        onDrop={catalogDropBase.onDrop}
      >
        {config.baseModules.map((m, i) => {
          const def = BASE_MODULE_CATALOG.find((d) => d.type === m.type);
          const isSelected = ui.selectedBaseModuleId === m.id;
          const dims = getEffectiveBaseDims(m);
          const lim = getBaseModuleLimits(m.type as BaseModuleType);
          return (
            <KitchenDraggableModuleBlock
              key={m.id}
              listId={DND_LIST_MAIN_BASE}
              index={i}
              onReorder={reorderBaseModules}
              onCatalogDropId={onCatalogDropId}
            >
              <div
                className={`module-row${isSelected ? " selected" : ""}`}
                onClick={() => selectBaseModule(m.id)}
              >
                <KitchenDragHandle
                  listId={DND_LIST_MAIN_BASE}
                  index={i}
                  dragDisabled={m.type === "corner-base"}
                />
                <div className="module-name-col">
                  <span className="module-name">{def?.name ?? m.type}</span>
                  <span className="module-dims-badge">
                    {dims.w} × {dims.h} × {dims.d} cm
                  </span>
                </div>
                <div className="module-row-controls">
                  <select
                    className="module-width-select"
                    value={m.width}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setBaseModuleWidth(m.id, Number(e.target.value))}
                  >
                    {![...MODULE_WIDTHS].includes(m.width as (typeof MODULE_WIDTHS)[number]) && (
                      <option value={m.width}>{m.width}</option>
                    )}
                    {MODULE_WIDTHS.filter((w) => w >= lim.minW && w <= lim.maxW).map((w) => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="module-icon-btn"
                    disabled={i === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      reorderBaseModules(i, i - 1);
                    }}
                    title="Move earlier (left)"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="module-icon-btn"
                    disabled={i === config.baseModules.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      reorderBaseModules(i, i + 1);
                    }}
                    title="Move later (right)"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    className="module-icon-btn danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeBaseModule(m.id);
                    }}
                    title="Remove"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {isSelected && (
                <ModuleSizeEditor
                  dims={dims}
                  limits={lim}
                  onPatch={(p) => setBaseModuleDimensions(m.id, p)}
                />
              )}
            </KitchenDraggableModuleBlock>
          );
        })}
      </div>

      <div className="cfg-label cfg-label--add-modules">Add modules</div>
      <KitchenDesignerModulePresets
        onBasePreset={(p) => addBaseModule(p.type, { width: p.defaultWidth })}
        onWallPreset={(p) => {
          if (!config.hasWallCabinets) toggleWallCabinets();
          addWallModule(p.type, { width: p.defaultWidth });
        }}
        onHighPreset={(p) => addBaseModule(p.type, { width: p.defaultWidth })}
      />

      <div className="cfg-divider" />

      {/* Wall cabinet run toggle */}
      <div className="cfg-label-row">
        <span className="cfg-label">Wall Cabinets</span>
        <button
          className={`toggle-btn${config.hasWallCabinets ? " active" : ""}`}
          onClick={toggleWallCabinets}
          title={config.hasWallCabinets ? "Hide wall cabinets" : "Show wall cabinets"}
        >
          {config.hasWallCabinets ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
        </button>
      </div>

      {config.hasWallCabinets && (
        <>
          <div
            className={`module-list${catalogDropWall.isOver ? " module-list--catalog-drop-active" : ""}`}
            style={{ marginTop: 8 }}
            onDragEnter={catalogDropWall.onDragEnter}
            onDragOver={catalogDropWall.onDragOver}
            onDragLeave={catalogDropWall.onDragLeave}
            onDrop={catalogDropWall.onDrop}
          >
            {config.wallModules.map((m, i) => {
              const def = WALL_MODULE_CATALOG.find((d) => d.type === m.type);
              const isSelected = ui.selectedWallModuleId === m.id;
              const wdims = getEffectiveWallDims(m);
              const wlim = getWallModuleLimits(m.type as WallModuleType);
              return (
                <KitchenDraggableModuleBlock
                  key={m.id}
                  listId={DND_LIST_MAIN_WALL}
                  index={i}
                  onReorder={reorderWallModules}
                  onCatalogDropId={onCatalogDropId}
                >
                  <div
                    className={`module-row${isSelected ? " selected" : ""}`}
                    onClick={() => selectWallModule(m.id)}
                  >
                    <KitchenDragHandle listId={DND_LIST_MAIN_WALL} index={i} />
                    <div className="module-name-col">
                      <span className="module-name">{def?.name ?? m.type}</span>
                      <span className="module-dims-badge">
                        {wdims.w} × {wdims.h} × {wdims.d} cm
                      </span>
                    </div>
                    <div className="module-row-controls">
                      <select
                        className="module-width-select"
                        value={m.width}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setWallModuleWidth(m.id, Number(e.target.value))}
                      >
                        {![...MODULE_WIDTHS].includes(m.width as (typeof MODULE_WIDTHS)[number]) && (
                          <option value={m.width}>{m.width}</option>
                        )}
                        {MODULE_WIDTHS.filter((w) => w >= wlim.minW && w <= wlim.maxW).map((w) => (
                          <option key={w} value={w}>{w}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="module-icon-btn"
                        disabled={i === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          reorderWallModules(i, i - 1);
                        }}
                        title="Move earlier (left)"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        className="module-icon-btn"
                        disabled={i === config.wallModules.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          reorderWallModules(i, i + 1);
                        }}
                        title="Move later (right)"
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        type="button"
                        className="module-icon-btn danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeWallModule(m.id);
                        }}
                        title="Remove"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {isSelected && (
                    <ModuleSizeEditor
                      dims={{ w: wdims.w, h: wdims.h, d: wdims.d }}
                      limits={wlim}
                      onPatch={(p) => setWallModuleDimensions(m.id, p)}
                    />
                  )}
                </KitchenDraggableModuleBlock>
              );
            })}
          </div>

        </>
      )}
    </div>
  );
}

// ── Island Panel ──────────────────────────────────────────────────────

function IslandPanel() {
  const config = useKitchenStore((s) => s.config);
  const ui = useKitchenStore((s) => s.ui);
  const island = config.island;
  const setIslandEnabled = useKitchenStore((s) => s.setIslandEnabled);
  const setIslandPose = useKitchenStore((s) => s.setIslandPose);
  const addIslandBaseModule = useKitchenStore((s) => s.addIslandBaseModule);
  const removeIslandBaseModule = useKitchenStore((s) => s.removeIslandBaseModule);
  const setIslandBaseModuleWidth = useKitchenStore((s) => s.setIslandBaseModuleWidth);
  const setIslandBaseModuleDimensions = useKitchenStore((s) => s.setIslandBaseModuleDimensions);
  const reorderIslandBaseModules = useKitchenStore((s) => s.reorderIslandBaseModules);
  const addIslandWallModule = useKitchenStore((s) => s.addIslandWallModule);
  const removeIslandWallModule = useKitchenStore((s) => s.removeIslandWallModule);
  const setIslandWallModuleWidth = useKitchenStore((s) => s.setIslandWallModuleWidth);
  const setIslandWallModuleDimensions = useKitchenStore((s) => s.setIslandWallModuleDimensions);
  const reorderIslandWallModules = useKitchenStore((s) => s.reorderIslandWallModules);
  const toggleIslandWallCabinets = useKitchenStore((s) => s.toggleIslandWallCabinets);
  const selectIslandBaseModule = useKitchenStore((s) => s.selectIslandBaseModule);
  const selectIslandWallModule = useKitchenStore((s) => s.selectIslandWallModule);

  const totalIslandBaseW = island.baseModules.reduce((s, m) => s + m.width, 0);

  return (
    <div className="panel-content">
      <p className="cfg-hint layout-hint">
        Optional second run — same units as the main wall. Drag the grip on each row or use arrows to reorder.
        Positioned in the room with the sliders below.
      </p>

      <div className="cfg-label-row">
        <span className="cfg-label">Island</span>
        <button
          type="button"
          className={`toggle-btn${island.enabled ? " active" : ""}`}
          onClick={() => setIslandEnabled(!island.enabled)}
        >
          {island.enabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
        </button>
      </div>

      {island.enabled && (
        <>
          <div className="cfg-group" style={{ marginTop: 12 }}>
            <span className="cfg-label">Position (cm / deg)</span>
            <div className="dim-field-row" style={{ marginBottom: 8 }}>
              <span className="dim-field-label">Side offset</span>
              <DraftScalarInput
                value={island.offsetXCm}
                min={-500}
                max={500}
                format={(n) => String(Math.round(n))}
                onCommit={(v) => setIslandPose({ offsetXCm: Math.round(v) })}
                className="dim-number"
              />
            </div>
            <div className="dim-field-row" style={{ marginBottom: 8 }}>
              <span className="dim-field-label">Into room</span>
              <DraftScalarInput
                value={island.offsetZCm}
                min={-500}
                max={500}
                format={(n) => String(Math.round(n))}
                onCommit={(v) => setIslandPose({ offsetZCm: Math.round(v) })}
                className="dim-number"
              />
            </div>
            <div className="dim-field-row">
              <span className="dim-field-label">Rotation °</span>
              <DraftScalarInput
                value={Math.round((island.rotationYRad * 180) / Math.PI)}
                min={-180}
                max={180}
                format={(n) => String(Math.round(n))}
                onCommit={(v) =>
                  setIslandPose({ rotationYRad: (Math.round(v) * Math.PI) / 180 })
                }
                className="dim-number"
              />
            </div>
          </div>

          <div className="cfg-section-title" style={{ marginTop: 16 }}>
            Island base run
          </div>
          <div className="cfg-info-card">
            <span>
              Total: <strong>{totalIslandBaseW} cm</strong>
            </span>
            <span>
              {island.baseModules.length} module{island.baseModules.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="module-list">
            {island.baseModules.map((m, i) => {
              const def = BASE_MODULE_CATALOG.find((d) => d.type === m.type);
              const isSelected = ui.selectedIslandBaseModuleId === m.id;
              const dims = getEffectiveBaseDims(m);
              const lim = getBaseModuleLimits(m.type as BaseModuleType);
              return (
                <KitchenDraggableModuleBlock
                  key={m.id}
                  listId={DND_LIST_ISLAND_BASE}
                  index={i}
                  onReorder={reorderIslandBaseModules}
                >
                  <div
                    className={`module-row${isSelected ? " selected" : ""}`}
                    onClick={() => selectIslandBaseModule(m.id)}
                  >
                    <KitchenDragHandle
                      listId={DND_LIST_ISLAND_BASE}
                      index={i}
                      dragDisabled={m.type === "corner-base"}
                    />
                    <div className="module-name-col">
                      <span className="module-name">{def?.name ?? m.type}</span>
                      <span className="module-dims-badge">
                        {dims.w} × {dims.h} × {dims.d} cm
                      </span>
                    </div>
                    <div className="module-row-controls">
                      <select
                        className="module-width-select"
                        value={m.width}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setIslandBaseModuleWidth(m.id, Number(e.target.value))}
                      >
                        {![...MODULE_WIDTHS].includes(m.width as (typeof MODULE_WIDTHS)[number]) && (
                          <option value={m.width}>{m.width}</option>
                        )}
                        {MODULE_WIDTHS.filter((w) => w >= lim.minW && w <= lim.maxW).map((w) => (
                          <option key={w} value={w}>
                            {w}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="module-icon-btn"
                        disabled={i === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          reorderIslandBaseModules(i, i - 1);
                        }}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        className="module-icon-btn"
                        disabled={i === island.baseModules.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          reorderIslandBaseModules(i, i + 1);
                        }}
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        type="button"
                        className="module-icon-btn danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeIslandBaseModule(m.id);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {isSelected && (
                    <ModuleSizeEditor
                      dims={dims}
                      limits={lim}
                      onPatch={(p) => setIslandBaseModuleDimensions(m.id, p)}
                    />
                  )}
                </KitchenDraggableModuleBlock>
              );
            })}
          </div>

          <div className="cfg-label cfg-label--add-modules">Add modules</div>
          <KitchenDesignerModulePresets
            onBasePreset={(p) => addIslandBaseModule(p.type, { width: p.defaultWidth })}
            onWallPreset={(p) => {
              if (!island.hasWallCabinets) toggleIslandWallCabinets();
              addIslandWallModule(p.type, { width: p.defaultWidth });
            }}
            onHighPreset={(p) => addIslandBaseModule(p.type, { width: p.defaultWidth })}
          />

          <div className="cfg-divider" />

          <div className="cfg-label-row">
            <span className="cfg-label">Island wall cabinets</span>
            <button
              type="button"
              className={`toggle-btn${island.hasWallCabinets ? " active" : ""}`}
              onClick={toggleIslandWallCabinets}
            >
              {island.hasWallCabinets ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
            </button>
          </div>

          {island.hasWallCabinets && (
            <>
              <div className="module-list" style={{ marginTop: 8 }}>
                {island.wallModules.map((m, i) => {
                  const def = WALL_MODULE_CATALOG.find((d) => d.type === m.type);
                  const isSelected = ui.selectedIslandWallModuleId === m.id;
                  const wdims = getEffectiveWallDims(m);
                  const wlim = getWallModuleLimits(m.type as WallModuleType);
                  return (
                    <KitchenDraggableModuleBlock
                      key={m.id}
                      listId={DND_LIST_ISLAND_WALL}
                      index={i}
                      onReorder={reorderIslandWallModules}
                    >
                      <div
                        className={`module-row${isSelected ? " selected" : ""}`}
                        onClick={() => selectIslandWallModule(m.id)}
                      >
                        <KitchenDragHandle listId={DND_LIST_ISLAND_WALL} index={i} />
                        <div className="module-name-col">
                          <span className="module-name">{def?.name ?? m.type}</span>
                          <span className="module-dims-badge">
                            {wdims.w} × {wdims.h} × {wdims.d} cm
                          </span>
                        </div>
                        <div className="module-row-controls">
                          <select
                            className="module-width-select"
                            value={m.width}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setIslandWallModuleWidth(m.id, Number(e.target.value))}
                          >
                            {![...MODULE_WIDTHS].includes(m.width as (typeof MODULE_WIDTHS)[number]) && (
                              <option value={m.width}>{m.width}</option>
                            )}
                            {MODULE_WIDTHS.filter((w) => w >= wlim.minW && w <= wlim.maxW).map((w) => (
                              <option key={w} value={w}>
                                {w}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="module-icon-btn"
                            disabled={i === 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              reorderIslandWallModules(i, i - 1);
                            }}
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            className="module-icon-btn"
                            disabled={i === island.wallModules.length - 1}
                            onClick={(e) => {
                              e.stopPropagation();
                              reorderIslandWallModules(i, i + 1);
                            }}
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            className="module-icon-btn danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeIslandWallModule(m.id);
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      {isSelected && (
                        <ModuleSizeEditor
                          dims={{ w: wdims.w, h: wdims.h, d: wdims.d }}
                          limits={wlim}
                          onPatch={(p) => setIslandWallModuleDimensions(m.id, p)}
                        />
                      )}
                    </KitchenDraggableModuleBlock>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Left wall / corner unit ───────────────────────────────────────────

function LeftWallPanel() {
  const config = useKitchenStore((s) => s.config);
  const ui = useKitchenStore((s) => s.ui);
  const cu = config.cornerUnit;
  const lw = config.leftWall;

  const setCornerUnitEnabled = useKitchenStore((s) => s.setCornerUnitEnabled);
  const setCornerUnitDimensions = useKitchenStore((s) => s.setCornerUnitDimensions);
  const setLeftWallEnabled = useKitchenStore((s) => s.setLeftWallEnabled);
  const addLeftBaseModule = useKitchenStore((s) => s.addLeftBaseModule);
  const removeLeftBaseModule = useKitchenStore((s) => s.removeLeftBaseModule);
  const setLeftBaseModuleWidth = useKitchenStore((s) => s.setLeftBaseModuleWidth);
  const setLeftBaseModuleDimensions = useKitchenStore((s) => s.setLeftBaseModuleDimensions);
  const reorderLeftBaseModules = useKitchenStore((s) => s.reorderLeftBaseModules);
  const addLeftWallModule = useKitchenStore((s) => s.addLeftWallModule);
  const removeLeftWallModule = useKitchenStore((s) => s.removeLeftWallModule);
  const setLeftWallModuleWidth = useKitchenStore((s) => s.setLeftWallModuleWidth);
  const setLeftWallModuleDimensions = useKitchenStore((s) => s.setLeftWallModuleDimensions);
  const reorderLeftWallModules = useKitchenStore((s) => s.reorderLeftWallModules);
  const toggleLeftWallCabinets = useKitchenStore((s) => s.toggleLeftWallCabinets);
  const selectLeftBaseModule = useKitchenStore((s) => s.selectLeftBaseModule);
  const selectLeftWallModule = useKitchenStore((s) => s.selectLeftWallModule);
  const selectCornerUnit = useKitchenStore((s) => s.selectCornerUnit);

  const totalLeftBaseW = lw.baseModules.reduce((s, m) => s + m.width, 0);

  return (
    <div className="panel-content">
      <p className="cfg-hint layout-hint">
        L-shaped corner unit + left wall run. Enabling the corner adds an L-shaped cabinet at the
        back/left wall junction and activates the left wall run.
      </p>

      {/* Corner unit toggle */}
      <div className="cfg-label-row">
        <span className="cfg-label">Corner unit</span>
        <button
          type="button"
          className={`toggle-btn${cu.enabled ? " active" : ""}`}
          onClick={() => setCornerUnitEnabled(!cu.enabled)}
        >
          {cu.enabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
        </button>
      </div>

      {cu.enabled && (
        <>
          <div
            className={`kitchen-corner-block${ui.selectedCornerUnit ? " kitchen-corner-block--selected" : ""}`}
            style={{ marginTop: 12 }}
            role="presentation"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("input, button, .dim-number, .toggle-btn")) return;
              selectCornerUnit();
            }}
          >
            <span className="cfg-label">Corner dimensions (cm)</span>
            <div className="dim-field-row" style={{ marginBottom: 8 }}>
              <span className="dim-field-label">Back wing W</span>
              <DraftScalarInput
                value={cu.backWingWidthCm}
                min={60}
                max={120}
                format={(n) => String(Math.round(n))}
                onCommit={(v) => setCornerUnitDimensions({ backWingWidthCm: Math.round(v) })}
                className="dim-number"
              />
            </div>
            <div className="dim-field-row" style={{ marginBottom: 8 }}>
              <span className="dim-field-label">Left wing W</span>
              <DraftScalarInput
                value={cu.leftWingWidthCm}
                min={60}
                max={120}
                format={(n) => String(Math.round(n))}
                onCommit={(v) => setCornerUnitDimensions({ leftWingWidthCm: Math.round(v) })}
                className="dim-number"
              />
            </div>
            <div className="dim-field-row" style={{ marginBottom: 8 }}>
              <span className="dim-field-label">Depth</span>
              <DraftScalarInput
                value={cu.depthCm}
                min={50}
                max={70}
                format={(n) => String(Math.round(n))}
                onCommit={(v) => setCornerUnitDimensions({ depthCm: Math.round(v) })}
                className="dim-number"
              />
            </div>
          </div>

          {/* Wall corner toggle */}
          <div className="cfg-label-row" style={{ marginTop: 12 }}>
            <span className="cfg-label">Wall corner unit</span>
            <button
              type="button"
              className={`toggle-btn${cu.hasWallCorner ? " active" : ""}`}
              onClick={() => setCornerUnitDimensions({ hasWallCorner: !cu.hasWallCorner })}
            >
              {cu.hasWallCorner ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
            </button>
          </div>

          {cu.hasWallCorner && (
            <div className="cfg-group" style={{ marginTop: 8 }}>
              <span className="cfg-label">Wall corner dimensions (cm)</span>
              <div className="dim-field-row" style={{ marginBottom: 8 }}>
                <span className="dim-field-label">Height</span>
                <DraftScalarInput
                  value={cu.wallCornerHeightCm}
                  min={40}
                  max={100}
                  format={(n) => String(Math.round(n))}
                  onCommit={(v) => setCornerUnitDimensions({ wallCornerHeightCm: Math.round(v) })}
                  className="dim-number"
                />
              </div>
              <div className="dim-field-row" style={{ marginBottom: 8 }}>
                <span className="dim-field-label">Depth</span>
                <DraftScalarInput
                  value={cu.wallCornerDepthCm}
                  min={25}
                  max={42}
                  format={(n) => String(Math.round(n))}
                  onCommit={(v) => setCornerUnitDimensions({ wallCornerDepthCm: Math.round(v) })}
                  className="dim-number"
                />
              </div>
            </div>
          )}

          <div className="cfg-divider" />

          {/* Left wall toggle */}
          <div className="cfg-label-row">
            <span className="cfg-label">Left wall run</span>
            <button
              type="button"
              className={`toggle-btn${lw.enabled ? " active" : ""}`}
              onClick={() => setLeftWallEnabled(!lw.enabled)}
            >
              {lw.enabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
            </button>
          </div>

          {lw.enabled && (
            <>
              <div className="cfg-section-title" style={{ marginTop: 16 }}>
                Left wall base run
              </div>
              <div className="cfg-info-card">
                <span>
                  Total: <strong>{totalLeftBaseW} cm</strong>
                </span>
                <span>
                  {lw.baseModules.length} module{lw.baseModules.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="module-list">
                {lw.baseModules.map((m, i) => {
                  const def = BASE_MODULE_CATALOG.find((d) => d.type === m.type);
                  const isSelected = ui.selectedLeftBaseModuleId === m.id;
                  const dims = getEffectiveBaseDims(m);
                  const lim = getBaseModuleLimits(m.type as BaseModuleType);
                  return (
                    <KitchenDraggableModuleBlock
                      key={m.id}
                      listId={DND_LIST_LEFT_BASE}
                      index={i}
                      onReorder={reorderLeftBaseModules}
                    >
                      <div
                        className={`module-row${isSelected ? " selected" : ""}`}
                        onClick={() => selectLeftBaseModule(m.id)}
                      >
                        <KitchenDragHandle
                          listId={DND_LIST_LEFT_BASE}
                          index={i}
                          dragDisabled={m.type === "corner-base"}
                        />
                        <div className="module-name-col">
                          <span className="module-name">{def?.name ?? m.type}</span>
                          <span className="module-dims-badge">
                            {dims.w} × {dims.h} × {dims.d} cm
                          </span>
                        </div>
                        <div className="module-row-controls">
                          <select
                            className="module-width-select"
                            value={m.width}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setLeftBaseModuleWidth(m.id, Number(e.target.value))}
                          >
                            {![...MODULE_WIDTHS].includes(m.width as (typeof MODULE_WIDTHS)[number]) && (
                              <option value={m.width}>{m.width}</option>
                            )}
                            {MODULE_WIDTHS.filter((w) => w >= lim.minW && w <= lim.maxW).map((w) => (
                              <option key={w} value={w}>
                                {w}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="module-icon-btn"
                            disabled={i === 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              reorderLeftBaseModules(i, i - 1);
                            }}
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            className="module-icon-btn"
                            disabled={i === lw.baseModules.length - 1}
                            onClick={(e) => {
                              e.stopPropagation();
                              reorderLeftBaseModules(i, i + 1);
                            }}
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            className="module-icon-btn danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeLeftBaseModule(m.id);
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      {isSelected && (
                        <ModuleSizeEditor
                          dims={dims}
                          limits={lim}
                          onPatch={(p) => setLeftBaseModuleDimensions(m.id, p)}
                        />
                      )}
                    </KitchenDraggableModuleBlock>
                  );
                })}
              </div>

              <div className="cfg-label cfg-label--add-modules">Add modules</div>
              <KitchenDesignerModulePresets
                onBasePreset={(p) => addLeftBaseModule(p.type, { width: p.defaultWidth })}
                onWallPreset={(p) => {
                  if (!lw.hasWallCabinets) toggleLeftWallCabinets();
                  addLeftWallModule(p.type, { width: p.defaultWidth });
                }}
                onHighPreset={(p) => addLeftBaseModule(p.type, { width: p.defaultWidth })}
              />

              <div className="cfg-divider" />

              <div className="cfg-label-row">
                <span className="cfg-label">Left wall cabinets</span>
                <button
                  type="button"
                  className={`toggle-btn${lw.hasWallCabinets ? " active" : ""}`}
                  onClick={toggleLeftWallCabinets}
                >
                  {lw.hasWallCabinets ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                </button>
              </div>

              {lw.hasWallCabinets && (
                <>
                  <div className="module-list" style={{ marginTop: 8 }}>
                    {lw.wallModules.map((m, i) => {
                      const def = WALL_MODULE_CATALOG.find((d) => d.type === m.type);
                      const isSelected = ui.selectedLeftWallModuleId === m.id;
                      const wdims = getEffectiveWallDims(m);
                      const wlim = getWallModuleLimits(m.type as WallModuleType);
                      return (
                        <KitchenDraggableModuleBlock
                          key={m.id}
                          listId={DND_LIST_LEFT_WALL}
                          index={i}
                          onReorder={reorderLeftWallModules}
                        >
                          <div
                            className={`module-row${isSelected ? " selected" : ""}`}
                            onClick={() => selectLeftWallModule(m.id)}
                          >
                            <KitchenDragHandle listId={DND_LIST_LEFT_WALL} index={i} />
                            <div className="module-name-col">
                              <span className="module-name">{def?.name ?? m.type}</span>
                              <span className="module-dims-badge">
                                {wdims.w} × {wdims.h} × {wdims.d} cm
                              </span>
                            </div>
                            <div className="module-row-controls">
                              <select
                                className="module-width-select"
                                value={m.width}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setLeftWallModuleWidth(m.id, Number(e.target.value))}
                              >
                                {![...MODULE_WIDTHS].includes(m.width as (typeof MODULE_WIDTHS)[number]) && (
                                  <option value={m.width}>{m.width}</option>
                                )}
                                {MODULE_WIDTHS.filter((w) => w >= wlim.minW && w <= wlim.maxW).map((w) => (
                                  <option key={w} value={w}>
                                    {w}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="module-icon-btn"
                                disabled={i === 0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  reorderLeftWallModules(i, i - 1);
                                }}
                              >
                                <ArrowUp size={14} />
                              </button>
                              <button
                                type="button"
                                className="module-icon-btn"
                                disabled={i === lw.wallModules.length - 1}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  reorderLeftWallModules(i, i + 1);
                                }}
                              >
                                <ArrowDown size={14} />
                              </button>
                              <button
                                type="button"
                                className="module-icon-btn danger"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeLeftWallModule(m.id);
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          {isSelected && (
                            <ModuleSizeEditor
                              dims={{ w: wdims.w, h: wdims.h, d: wdims.d }}
                              limits={wlim}
                              onPatch={(p) => setLeftWallModuleDimensions(m.id, p)}
                            />
                          )}
                        </KitchenDraggableModuleBlock>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Layout placeholders (not furniture) ─────────────────────────────

function PlaceholdersPanel() {
  const designPlacements = useKitchenStore((s) => s.config.designPlacements);
  const addDesignPlacement = useKitchenStore((s) => s.addDesignPlacement);
  const removeDesignPlacement = useKitchenStore((s) => s.removeDesignPlacement);
  const setDesignPlacementPose = useKitchenStore((s) => s.setDesignPlacementPose);

  const kinds: DesignRefKind[] = ["fridge", "sink", "range", "dishwasher"];

  return (
    <div className="panel-content">
      <p className="cfg-hint layout-hint">
        Semi-transparent blocks for planning clearance only. They are not included in price or cart.
      </p>
      <div className="cfg-label cfg-label--add-modules cfg-label--flush-top">
        Add reference
      </div>
      <div className="module-add-grid">
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            className="module-add-btn"
            onClick={() => addDesignPlacement(k)}
            title={DESIGN_REF_PRESETS[k].label}
          >
            <span className="module-add-btn-icon" aria-hidden>
              <Plus size={16} strokeWidth={2} />
            </span>
            <span className="module-add-btn-label">{DESIGN_REF_PRESETS[k].label}</span>
          </button>
        ))}
      </div>
      {designPlacements.length > 0 && (
        <div className="module-list" style={{ marginTop: 16 }}>
          {designPlacements.map((p) => {
            const preset = DESIGN_REF_PRESETS[p.kind];
            return (
              <div key={p.id} className="module-block">
                <div className="module-row">
                  <div className="module-name-col">
                    <span className="module-name">{preset.label}</span>
                    <span className="module-dims-badge">
                      {preset.widthCm}×{preset.depthCm}×{preset.heightCm} cm
                    </span>
                  </div>
                  <button
                    type="button"
                    className="module-icon-btn danger"
                    onClick={() => removeDesignPlacement(p.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="module-size-editor">
                  <div className="dim-field-row">
                    <span className="dim-field-label">X cm</span>
                    <DraftScalarInput
                      value={Math.round(p.xCm)}
                      min={-500}
                      max={500}
                      format={(n) => String(Math.round(n))}
                      onCommit={(v) =>
                        setDesignPlacementPose(p.id, { xCm: Math.round(v) })
                      }
                      className="dim-number"
                    />
                  </div>
                  <div className="dim-field-row">
                    <span className="dim-field-label">Z cm</span>
                    <DraftScalarInput
                      value={Math.round(p.zCm)}
                      min={-500}
                      max={500}
                      format={(n) => String(Math.round(n))}
                      onCommit={(v) =>
                        setDesignPlacementPose(p.id, { zCm: Math.round(v) })
                      }
                      className="dim-number"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Cabinets Material Panel ───────────────────────────────────────────

function CabinetsPanel() {
  const cabinetMaterial = useKitchenStore((s) => s.config.cabinetMaterial);
  const setCabinetMaterial = useKitchenStore((s) => s.setCabinetMaterial);
  const cabinetGrain = useKitchenStore((s) => s.config.cabinetGrainDirection ?? "horizontal");
  const setCabinetGrainDirection = useKitchenStore((s) => s.setCabinetGrainDirection);
  const availableMaterials = useKitchenStore((s) => s.availableMaterials);

  const materials =
    availableMaterials.length > 0 ? availableMaterials : [NEUTRAL_KITCHEN_MATERIAL];

  return (
    <div className="panel-content">
      <div className="cfg-group">
        <span className="cfg-label">Frame / carcass</span>
        <span className="cfg-sublabel">Cabinet bodies (units) — not door fronts</span>
        <MaterialGrid
          materials={materials}
          selected={cabinetMaterial}
          onSelect={setCabinetMaterial}
        />
        <KitchenGrainToggle value={cabinetGrain} onChange={setCabinetGrainDirection} />
      </div>
    </div>
  );
}

// ── Countertop Panel ──────────────────────────────────────────────────

function CountertopPanel() {
  const currency = useStore((s) => s.admin?.currency ?? "USD");
  const countertop = useKitchenStore((s) => s.config.countertop);
  const setCountertopMaterial = useKitchenStore((s) => s.setCountertopMaterial);
  const setAdminCountertopMaterial = useKitchenStore((s) => s.setAdminCountertopMaterial);
  const worktops = useKitchenStore((s) => s.availableWorktopMaterials);
  const counterId = countertop.material;
  const adminId = countertop.adminMaterialId;
  const resolved = resolveCountertopKitchenMaterial(countertop, worktops);
  const pricePerM = getCountertopPricePerLinearMeter(countertop, worktops);

  return (
    <div className="panel-content">
      <div className="cfg-group">
        <span className="cfg-label">Worktop</span>
        <span className="cfg-sublabel">
          {worktops.length > 0
            ? "3 cm slab — choose from worktop materials in your admin catalog."
            : "3 cm slab — suggested presets. Add materials tagged as worktops in admin to replace this list with your catalog."}
        </span>
        {worktops.length === 0 ? (
          <>
            <div className="cfg-sublabel text-[11px] mb-2 font-medium">Suggested</div>
            <div className="mat-grid">
              {COUNTERTOP_OPTIONS.map((opt) => (
                <button
                  key={opt.material}
                  type="button"
                  className={`mat-swatch${!adminId && counterId === opt.material ? " selected" : ""}`}
                  onClick={() => setCountertopMaterial(opt.material)}
                  title={opt.name}
                >
                  <span
                    className="mat-swatch-color"
                    style={{ background: opt.color }}
                  />
                  <span className="mat-swatch-name">{opt.name}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="cfg-sublabel text-[11px] mb-2 font-medium mt-2">Your catalog</div>
            <div className="mat-grid">
              {worktops.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  className={`mat-swatch${adminId === w.id ? " selected" : ""}`}
                  onClick={() => setAdminCountertopMaterial(w.id)}
                  title={w.name}
                >
                  {w.imageUrl ? (
                    <img
                      src={w.imageUrl}
                      alt=""
                      className="mat-swatch-color object-cover rounded-sm"
                    />
                  ) : (
                    <span
                      className="mat-swatch-color"
                      style={{ background: w.color }}
                    />
                  )}
                  <span className="mat-swatch-name">{w.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="cfg-info-card">
        <span>{resolved.name}</span>
        <span>
          {formatPrice(Math.round(pricePerM), currency)}/m
        </span>
      </div>
    </div>
  );
}

// ── Door Fronts Panel ─────────────────────────────────────────────────

function FrontsPanel() {
  const doorMaterial = useKitchenStore((s) => s.config.doors.material);
  const setDoorMaterial = useKitchenStore((s) => s.setDoorMaterial);
  const doorGrain = useKitchenStore((s) => s.config.doorGrainDirection ?? "horizontal");
  const setDoorGrainDirection = useKitchenStore((s) => s.setDoorGrainDirection);
  const availableDoorMaterials = useKitchenStore((s) => s.availableDoorMaterials);

  const materials =
    availableDoorMaterials.length > 0 ? availableDoorMaterials : [NEUTRAL_KITCHEN_MATERIAL];

  return (
    <div className="panel-content">
      <div className="cfg-group">
        <span className="cfg-label">Doors &amp; drawer fronts</span>
        <span className="cfg-sublabel">Visible fronts — separate from cabinet frame</span>
        <MaterialGrid
          materials={materials}
          selected={doorMaterial}
          onSelect={setDoorMaterial}
        />
        <KitchenGrainToggle value={doorGrain} onChange={setDoorGrainDirection} />
      </div>
    </div>
  );
}

// ── Handles Panel ─────────────────────────────────────────────────────

function HandlesPanel() {
  const currency = useStore((s) => s.admin?.currency ?? "USD");
  const handle = useKitchenStore((s) => s.config.doors.handle);
  const handleMaterialId = useKitchenStore((s) => s.config.doors.handleMaterialId);
  const availableHandleMaterials = useKitchenStore((s) => s.availableHandleMaterials);
  const setDoorHandle = useKitchenStore((s) => s.setDoorHandle);
  const setDoorHandleMaterial = useKitchenStore((s) => s.setDoorHandleMaterial);

  const HANDLE_COLORS_MAP: Record<string, string> = {
    "bar-steel":  "#a8a8a8",
    "bar-black":  "#1a1a1a",
    "bar-brass":  "#c5a55a",
    "knob-steel": "#b0b0b0",
    "knob-black": "#1a1a1a",
    "recessed":   "#e0ddd8",
  };

  return (
    <div className="panel-content">
      <div className="cfg-group">
        <span className="cfg-label">Hardware Style</span>
        <div className="handle-list">
          {HANDLES.map((h) => (
            <button
              key={h.id}
              className={`handle-row${handle === h.id ? " selected" : ""}`}
              onClick={() => setDoorHandle(h.id)}
            >
              <span
                className="handle-swatch"
                style={{ background: HANDLE_COLORS_MAP[h.id] ?? "#888" }}
              />
              <span className="handle-name">{h.name}</span>
              <span className="handle-price">
                +{formatPrice(h.price, currency)}/unit
              </span>
            </button>
          ))}
        </div>
      </div>
      {handle !== "recessed" && availableHandleMaterials.length > 0 && (
        <div className="cfg-group" style={{ marginTop: "16px" }}>
          <span className="cfg-label">Handle finish (catalog)</span>
          <span className="cfg-sublabel">Optional — overrides default color and price when selected</span>
          <button
            type="button"
            className={`handle-row${!handleMaterialId ? " selected" : ""}`}
            onClick={() => setDoorHandleMaterial(undefined)}
            style={{ marginBottom: "10px", width: "100%" }}
          >
            <span className="handle-name">Default finish</span>
            <span className="handle-price">Preset look</span>
          </button>
          <MaterialGrid
            materials={availableHandleMaterials}
            selected={handleMaterialId ?? ""}
            onSelect={(id) => setDoorHandleMaterial(id)}
          />
        </div>
      )}
    </div>
  );
}

// ── Room Panel ────────────────────────────────────────────────────────

function RoomPanel() {
  const wallColor = useKitchenStore((s) => s.room.wallColor);
  const floorStyle = useKitchenStore((s) => s.room.floorStyle);
  const setWallColor = useKitchenStore((s) => s.setWallColor);
  const setFloorStyle = useKitchenStore((s) => s.setFloorStyle);

  const WALL_PRESETS = [
    { color: "#e8e6e2", name: "Warm White" },
    { color: "#f0f0f0", name: "Cool White" },
    { color: "#dde4dd", name: "Sage" },
    { color: "#e4ddd4", name: "Sand" },
    { color: "#d4dce4", name: "Sky Blue" },
    { color: "#e8e0d4", name: "Linen" },
    { color: "#2c2c2c", name: "Charcoal" },
    { color: "#f5f0e8", name: "Cream" },
  ];

  return (
    <div className="panel-content">
      <div className="cfg-group">
        <span className="cfg-label">Wall Color</span>
        <div className="color-presets">
          {WALL_PRESETS.map((p) => (
            <button
              key={p.color}
              className={`color-preset${wallColor === p.color ? " selected" : ""}`}
              style={{ background: p.color }}
              title={p.name}
              onClick={() => setWallColor(p.color)}
            />
          ))}
        </div>
        <div className="cfg-label-row" style={{ marginTop: 8 }}>
          <span className="cfg-sublabel">Custom:</span>
          <input
            type="color"
            className="color-input"
            value={wallColor}
            onChange={(e) => setWallColor(e.target.value)}
          />
        </div>
      </div>

      <div className="cfg-divider" />

      <div className="cfg-group">
        <span className="cfg-label">Floor Style</span>
        <div className="floor-grid">
          {LAMINATE_OPTIONS.map((opt) => {
            const thumb = createLaminateThumbnailDataUrl(opt.value);
            return (
              <button
                key={opt.value}
                className={`floor-swatch${floorStyle === opt.value ? " selected" : ""}`}
                onClick={() => setFloorStyle(opt.value as FloorStyle)}
                title={opt.label}
              >
                <img src={thumb} alt={opt.label} className="floor-thumb" />
                <span className="floor-label">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Shared MaterialGrid ───────────────────────────────────────────────

function MaterialGrid({
  materials,
  selected,
  onSelect,
}: {
  materials: KitchenMaterial[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mat-grid">
      {materials.map((m) => (
        <button
          key={m.id}
          className={`mat-swatch${selected === m.id ? " selected" : ""}`}
          onClick={() => onSelect(m.id)}
          title={`${m.name}${m.manufacturer ? ` · ${m.manufacturer}` : ""}`}
        >
          {m.imageUrl ? (
            <img src={m.imageUrl} alt={m.name} className="mat-swatch-img" />
          ) : (
            <span className="mat-swatch-color" style={{ background: m.color }} />
          )}
          <span className="mat-swatch-name">{m.name}</span>
        </button>
      ))}
    </div>
  );
}
