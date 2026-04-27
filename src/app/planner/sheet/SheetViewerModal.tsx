"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";
import { X, AlertTriangle, RotateCw, FileOutput } from "lucide-react";
import type { PackResult, Placement, Sheet } from "./panelPacker";
import {
  wardrobePanelSectionGroup,
  wardrobePanelStrokeColor,
} from "./wardrobeSheetPanelColors";
import {
  type SheetPlacementOverride,
  clampPlacementOverrideToSheet,
  constrainPlacementOverrideNoOverlap,
  mergePlacementWithOverride,
  sheetPlacementOverrideKey,
} from "./placementSheetOverrides";
import {
  computeSheetFreeRects,
  formatCm as formatCmDim,
  type SheetFreeRect,
} from "./sheetFreeSpace";
import { getSheetSpec } from "./sheetSpec";
import type { WardrobeMaterial } from "../wardrobe/data";
import type { WardrobeSheetSizeOverrideCm } from "../wardrobe/types";
import {
  runSheetLayoutPieceExport,
  type WardrobeSheetLayoutExportFormat,
} from "./sheetLayoutExport";

/** Pixels of movement before a pointer-down counts as a drag (else: tap to select). */
const SHEET_DRAG_THRESHOLD_PX = 6;

/**
 * Minimal shared shape used by the sheet viewer. Both wardrobe and kitchen
 * layouts conform to this — the viewer only reads `material.name`,
 * `material.imageUrl`, panel labels, and packer output.
 */
export interface SheetViewablePanelMeta {
  id: string;
  label: string;
  /** When set, the viewer can render a "Front" lock chip for this panel. */
  defaultIsFront?: boolean;
}

export interface SheetViewableMaterialRef {
  name: string;
  imageUrl?: string;
}

export interface SheetViewableMaterialPacking {
  materialId: string;
  material: SheetViewableMaterialRef | null;
  sheet: Sheet;
  panels: SheetViewablePanelMeta[];
  result: PackResult;
  /**
   * Raw packer placements (wardrobe). When set, the modal merges overrides onto
   * these — `result.placements` may already include the same merge for 3D.
   */
  packerPlacementsForViewer?: Placement[];
}

export interface SheetViewableLayout {
  byMaterial: SheetViewableMaterialPacking[];
  totalSheets: number;
  totalOverflow: number;
}

interface SheetViewerModalProps {
  open: boolean;
  onClose: () => void;
  layout: SheetViewableLayout;
  /** Optional heading, e.g. "Wardrobe sheet layout". */
  title?: string;
  /**
   * Reorder placements for list + SVG (e.g. wardrobe sliding doors 1→4 before
   * other pieces on the same sheet).
   */
  sortPlacements?: (placements: Placement[]) => Placement[];
  /** Drag pieces and rotate on the sheet; when controlled, updates persist for the planner (3D UVs). */
  allowManualAdjust?: boolean;
  /**
   * Controlled sheet layout overrides (e.g. wardrobe store). If omitted, uses
   * ephemeral local state (kitchen).
   */
  placementOverrides?: Record<string, SheetPlacementOverride>;
  setPlacementOverrides?: Dispatch<SetStateAction<Record<string, SheetPlacementOverride>>>;
  /** Wardrobe: color piece borders by section/bay for readability. */
  colorizeBySection?: boolean;
  /**
   * Wardrobe: append another empty board for this material (same sheet size as
   * the active laminate / wood / worktop).
   */
  onAddManualSheet?: (materialId: string) => void;
  /**
   * Wardrobe: override sheet dimensions for packing / 3D UVs (all sheeted materials).
   */
  wardrobeSheetSizeControl?: {
    value: WardrobeSheetSizeOverrideCm | null;
    onChange: (value: WardrobeSheetSizeOverrideCm | null) => void;
  };
  /**
   * Wardrobe: offer CSV/XML/PDF export of nested piece sizes (as shown), not the abstract cut list.
   */
  enableSheetPieceExport?: boolean;
}

function SheetPieceExportMenu({
  layout,
  title,
}: {
  layout: SheetViewableLayout;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent) {
      const el = wrapRef.current;
      if (el && !el.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  function run(fmt: WardrobeSheetLayoutExportFormat) {
    runSheetLayoutPieceExport(layout.byMaterial, fmt, title);
    setOpen(false);
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--accent)] text-[var(--foreground)]"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <FileOutput className="w-4 h-4 shrink-0" />
        Export pieces
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-[530] min-w-[260px] py-1 rounded-lg border border-[var(--border)] bg-[var(--background)] shadow-xl"
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--accent)] flex flex-col gap-0.5"
            onClick={() => run("pdf")}
          >
            <span className="font-medium">PDF…</span>
            <span className="text-[11px] text-[var(--muted-foreground)]">Print or Save as PDF</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--accent)] flex flex-col gap-0.5"
            onClick={() => run("csv")}
          >
            <span className="font-medium">CSV</span>
            <span className="text-[11px] text-[var(--muted-foreground)]">Spreadsheet / Excel</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--accent)] flex flex-col gap-0.5"
            onClick={() => run("xml")}
          >
            <span className="font-medium">XML</span>
            <span className="text-[11px] text-[var(--muted-foreground)]">Nesting / CAM</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--accent)] flex flex-col gap-0.5"
            onClick={() => run("mpr")}
          >
            <span className="font-medium">MPR</span>
            <span className="text-[11px] text-[var(--muted-foreground)]">
              HOMAG woodWOP–style text (subset)
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--accent)] flex flex-col gap-0.5"
            onClick={() => run("mprx")}
          >
            <span className="font-medium">MPRX</span>
            <span className="text-[11px] text-[var(--muted-foreground)]">
              XML interchange (not native MPRXE binary)
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--accent)] flex flex-col gap-0.5"
            onClick={() => run("cix")}
          >
            <span className="font-medium">CIX</span>
            <span className="text-[11px] text-[var(--muted-foreground)]">
              Biesse — one .cix per sheet (staggered downloads)
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

const SHEET_DIM_MIN = 1;
const SHEET_DIM_MAX = 600;

function clampSheetDimCm(n: number): number {
  if (!Number.isFinite(n)) return SHEET_DIM_MIN;
  return Math.min(SHEET_DIM_MAX, Math.max(SHEET_DIM_MIN, Math.round(n * 10) / 10));
}

function WardrobeSheetSizeControlRow({
  layout,
  control,
}: {
  layout: SheetViewableLayout;
  control: NonNullable<SheetViewerModalProps["wardrobeSheetSizeControl"]>;
}) {
  return (
    <div className="px-5 py-2 border-b border-[var(--border)] flex flex-wrap items-center gap-3 text-sm">
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          className="rounded"
          checked={control.value !== null}
          onChange={(e) => {
            if (e.target.checked) {
              const first = layout.byMaterial[0];
              const spec = getSheetSpec(
                (first?.material as WardrobeMaterial | null | undefined) ?? undefined,
              );
              control.onChange({ widthCm: spec.widthCm, heightCm: spec.heightCm });
            } else {
              control.onChange(null);
            }
          }}
        />
        <span>Override sheet size for packing (all materials)</span>
      </label>
      {control.value && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[var(--muted-foreground)]">W</span>
          <input
            type="number"
            min={SHEET_DIM_MIN}
            max={SHEET_DIM_MAX}
            step={0.1}
            className="w-24 px-2 py-1 rounded border border-[var(--border)] bg-[var(--background)] text-sm"
            value={control.value.widthCm}
            onChange={(e) => {
              const w = clampSheetDimCm(parseFloat(e.target.value));
              if (!Number.isFinite(w)) return;
              control.onChange({ widthCm: w, heightCm: control.value!.heightCm });
            }}
          />
          <span className="text-[var(--muted-foreground)]">×</span>
          <span className="text-[var(--muted-foreground)]">H</span>
          <input
            type="number"
            min={SHEET_DIM_MIN}
            max={SHEET_DIM_MAX}
            step={0.1}
            className="w-24 px-2 py-1 rounded border border-[var(--border)] bg-[var(--background)] text-sm"
            value={control.value.heightCm}
            onChange={(e) => {
              const h = clampSheetDimCm(parseFloat(e.target.value));
              if (!Number.isFinite(h)) return;
              control.onChange({ widthCm: control.value!.widthCm, heightCm: h });
            }}
          />
          <span className="text-[var(--muted-foreground)]">cm</span>
        </div>
      )}
    </div>
  );
}

export default function SheetViewerModal({
  open,
  onClose,
  layout,
  title = "Sheet layout",
  sortPlacements,
  allowManualAdjust = false,
  placementOverrides: controlledPlacementOverrides,
  setPlacementOverrides: controlledSetPlacementOverrides,
  colorizeBySection = false,
  onAddManualSheet,
  wardrobeSheetSizeControl,
  enableSheetPieceExport = false,
}: SheetViewerModalProps) {
  const [activeMaterialId, setActiveMaterialId] = useState<string | null>(null);
  const [localPlacementOverrides, setLocalPlacementOverrides] = useState<
    Record<string, SheetPlacementOverride>
  >({});
  const placementOverrides =
    controlledPlacementOverrides !== undefined
      ? controlledPlacementOverrides
      : localPlacementOverrides;
  const setPlacementOverrides =
    controlledSetPlacementOverrides ?? setLocalPlacementOverrides;
  /** Piece selected on the sheet (tap); shows sizes + rotate control on the board. */
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedPanelId(null);
      if (controlledSetPlacementOverrides === undefined) {
        setLocalPlacementOverrides({});
      }
    }
  }, [open, controlledSetPlacementOverrides]);

  useEffect(() => {
    setSelectedPanelId(null);
  }, [activeMaterialId]);

  const activeMaterial = useMemo(() => {
    if (layout.byMaterial.length === 0) return null;
    return (
      layout.byMaterial.find((m) => m.materialId === activeMaterialId) ??
      layout.byMaterial[0]
    );
  }, [layout.byMaterial, activeMaterialId]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[520] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-xs text-[var(--muted-foreground)]">
              {layout.byMaterial.length} material{layout.byMaterial.length === 1 ? "" : "s"} ·{" "}
              {layout.totalSheets} sheet{layout.totalSheets === 1 ? "" : "s"}
              {layout.totalOverflow > 0 &&
                ` · ${layout.totalOverflow} piece${
                  layout.totalOverflow === 1 ? "" : "s"
                } do not fit`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {enableSheetPieceExport && layout.byMaterial.length > 0 && (
              <SheetPieceExportMenu layout={layout} title={title} />
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[var(--accent)]"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {layout.byMaterial.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--muted-foreground)]">
            No sheeted materials are currently in use. Sheet metadata only
            applies to laminate, wood, and worktop materials.
          </div>
        ) : (
          <>
            {layout.byMaterial.length > 1 && (
              <div className="flex gap-1 px-5 pt-3 overflow-x-auto">
                {layout.byMaterial.map((m) => {
                  const active = activeMaterial?.materialId === m.materialId;
                  return (
                    <button
                      key={m.materialId}
                      type="button"
                      onClick={() => setActiveMaterialId(m.materialId)}
                      className={`px-3 py-1.5 text-sm rounded-lg border whitespace-nowrap ${
                        active
                          ? "bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]"
                          : "bg-[var(--background)] border-[var(--border)] hover:bg-[var(--accent)]"
                      }`}
                    >
                      {m.material?.name ?? m.materialId}
                      <span className="ml-1.5 text-[11px] opacity-75">
                        ({m.result.sheets.length})
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {wardrobeSheetSizeControl && (
              <WardrobeSheetSizeControlRow
                layout={layout}
                control={wardrobeSheetSizeControl}
              />
            )}

            {activeMaterial && (
              <MaterialPackingView
                packing={activeMaterial}
                sortPlacements={sortPlacements}
                allowManualAdjust={allowManualAdjust}
                placementOverrides={placementOverrides}
                setPlacementOverrides={setPlacementOverrides}
                colorizeBySection={colorizeBySection}
                onAddManualSheet={onAddManualSheet}
                selectedPanelId={selectedPanelId}
                setSelectedPanelId={setSelectedPanelId}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Sheet index whose **card** (header + board + list) contains the pointer.
 * Using the full card makes cross-sheet drags reliable when moving between boards.
 */
function sheetIndexUnderPointer(
  clientX: number,
  clientY: number,
  containerRefs: Map<number, HTMLElement | null>,
  sheetIndices: readonly number[],
): number | null {
  for (const idx of sheetIndices) {
    const el = containerRefs.get(idx);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (
      clientX >= r.left &&
      clientX <= r.right &&
      clientY >= r.top &&
      clientY <= r.bottom
    ) {
      return idx;
    }
  }
  return null;
}

/** Pointer position in sheet space (cm), clamped to the board. */
function clientPxToSheetCm(
  svg: SVGSVGElement,
  sheetW: number,
  sheetH: number,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const r = svg.getBoundingClientRect();
  if (r.width <= 1e-6 || r.height <= 1e-6) {
    return { x: 0, y: 0 };
  }
  let x = ((clientX - r.left) / r.width) * sheetW;
  let y = ((clientY - r.top) / r.height) * sheetH;
  x = Math.min(Math.max(x, 0), sheetW);
  y = Math.min(Math.max(y, 0), sheetH);
  return { x, y };
}

function MaterialPackingView({
  packing,
  sortPlacements,
  allowManualAdjust,
  placementOverrides,
  setPlacementOverrides,
  colorizeBySection = false,
  onAddManualSheet,
  selectedPanelId,
  setSelectedPanelId,
}: {
  packing: SheetViewableMaterialPacking;
  sortPlacements?: (placements: Placement[]) => Placement[];
  allowManualAdjust?: boolean;
  placementOverrides: Record<string, SheetPlacementOverride>;
  setPlacementOverrides: Dispatch<SetStateAction<Record<string, SheetPlacementOverride>>>;
  colorizeBySection?: boolean;
  onAddManualSheet?: (materialId: string) => void;
  selectedPanelId: string | null;
  setSelectedPanelId: Dispatch<SetStateAction<string | null>>;
}) {
  const { sheet, result, material, panels } = packing;
  /** Raw packer positions — drag/clamp stay relative to these rows. */
  const packerRaw = packing.packerPlacementsForViewer ?? result.placements;
  const rawPlacementByPanelId = useMemo(
    () => new Map(packerRaw.map((p) => [p.panelId, p])),
    [packerRaw],
  );
  const mergedPlacements = useMemo(
    () =>
      packerRaw.map((raw) => {
        const k = sheetPlacementOverrideKey(packing.materialId, raw.sheetIndex, raw.panelId);
        const o = placementOverrides[k];
        return o ? mergePlacementWithOverride(raw, o) : raw;
      }),
    [packerRaw, packing.materialId, placementOverrides],
  );

  const textureUrl = material?.imageUrl;
  const totalArea = result.sheets.reduce((s, x) => s + x.sheetAreaCm2, 0);
  const usedArea = result.sheets.reduce((s, x) => s + x.usedAreaCm2, 0);
  const wastePct =
    totalArea > 0 ? (1 - usedArea / totalArea) * 100 : 0;
  const labelById = useMemo(() => {
    const m = new Map<string, SheetViewablePanelMeta>();
    for (const p of panels) m.set(p.id, p);
    return m;
  }, [panels]);

  const sheetSvgRefs = useRef<Map<number, SVGSVGElement | null>>(new Map());
  const registerSheetSvgRef = useCallback((sheetIdx: number, el: SVGSVGElement | null) => {
    if (el) sheetSvgRefs.current.set(sheetIdx, el);
    else sheetSvgRefs.current.delete(sheetIdx);
  }, []);

  /** Offcut (empty) region the user tapped; cleared when a panel is selected. */
  const [selectedOffcut, setSelectedOffcut] = useState<{
    sheetIndex: number;
    rect: SheetFreeRect;
  } | null>(null);

  useEffect(() => {
    setSelectedOffcut(null);
  }, [selectedPanelId]);

  useEffect(() => {
    setSelectedOffcut(null);
  }, [packing.materialId]);

  const sheetContainerRefs = useRef<Map<number, HTMLElement | null>>(new Map());
  const registerSheetContainerRef = useCallback((sheetIdx: number, el: HTMLElement | null) => {
    if (el) sheetContainerRefs.current.set(sheetIdx, el);
    else sheetContainerRefs.current.delete(sheetIdx);
  }, []);

  const crossSheetDragRef = useRef<{
    panelId: string;
    grabOffX: number;
    grabOffY: number;
    baseP: Placement;
    startClientX: number;
    startClientY: number;
    hasDragged: boolean;
    pointerId: number;
    captureEl: Element | null;
    /** Last sheet the pointer was over — keeps drag alive in gaps between cards. */
    lastTargetSheet: number | null;
  } | null>(null);

  const sheetIndices = useMemo(() => result.sheets.map((s) => s.index), [result.sheets]);

  const initCrossSheetDrag = useCallback(
    (
      panelId: string,
      clientX: number,
      clientY: number,
      captureEl: Element | null,
      pointerId: number,
    ): boolean => {
      if (!allowManualAdjust) return false;
      const baseP = rawPlacementByPanelId.get(panelId);
      if (!baseP) return false;

      const k = sheetPlacementOverrideKey(packing.materialId, baseP.sheetIndex, panelId);
      const cur = placementOverrides[k] ?? {};

      let effectiveCur: SheetPlacementOverride = { ...cur };
      const fixed = clampPlacementOverrideToSheet(
        baseP,
        cur,
        sheet.widthCm,
        sheet.heightCm,
      );
      const rotDirty = (fixed.rot90 === true) !== (cur.rot90 === true);
      if (
        Math.abs(fixed.dx - (cur.dx ?? 0)) > 1e-6 ||
        Math.abs(fixed.dy - (cur.dy ?? 0)) > 1e-6 ||
        rotDirty
      ) {
        const patched: SheetPlacementOverride = { ...fixed };
        if (cur.rot90 === true) patched.rot90 = true;
        if (cur.assignSheetIndex !== undefined) patched.assignSheetIndex = cur.assignSheetIndex;
        setPlacementOverrides((prev) => ({ ...prev, [k]: patched }));
        effectiveCur = patched;
      }

      const merged = mergePlacementWithOverride(baseP, effectiveCur);
      const displaySheet = merged.sheetIndex;
      const svg = sheetSvgRefs.current.get(displaySheet);
      if (!svg) return false;

      const { x: ptrX, y: ptrY } = clientPxToSheetCm(
        svg,
        sheet.widthCm,
        sheet.heightCm,
        clientX,
        clientY,
      );
      const grabOffX = ptrX - merged.xCm;
      const grabOffY = ptrY - merged.yCm;

      crossSheetDragRef.current = {
        panelId,
        grabOffX,
        grabOffY,
        baseP,
        startClientX: clientX,
        startClientY: clientY,
        hasDragged: false,
        pointerId,
        captureEl,
        lastTargetSheet: displaySheet,
      };
      return true;
    },
    [
      allowManualAdjust,
      packing.materialId,
      placementOverrides,
      rawPlacementByPanelId,
      sheet.widthCm,
      sheet.heightCm,
      setPlacementOverrides,
    ],
  );

  const onBeginPieceDrag = useCallback(
    (panelId: string, e: ReactPointerEvent<SVGGElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      initCrossSheetDrag(panelId, e.clientX, e.clientY, e.currentTarget, e.pointerId);
    },
    [initCrossSheetDrag],
  );

  useEffect(() => {
    if (!allowManualAdjust) return;
    const onMove = (e: PointerEvent) => {
      const d = crossSheetDragRef.current;
      if (!d) return;

      const dist = Math.hypot(e.clientX - d.startClientX, e.clientY - d.startClientY);
      if (!d.hasDragged) {
        if (dist < SHEET_DRAG_THRESHOLD_PX) return;
        d.hasDragged = true;
        setSelectedPanelId(d.panelId);
        d.captureEl?.setPointerCapture?.(d.pointerId);
      }

      let targetSheet = sheetIndexUnderPointer(
        e.clientX,
        e.clientY,
        sheetContainerRefs.current,
        sheetIndices,
      );
      if (targetSheet === null) {
        targetSheet = d.lastTargetSheet;
      }
      if (targetSheet === null) return;

      const svg = sheetSvgRefs.current.get(targetSheet);
      if (!svg) return;

      const { x: ptrX, y: ptrY } = clientPxToSheetCm(
        svg,
        sheet.widthCm,
        sheet.heightCm,
        e.clientX,
        e.clientY,
      );
      const nx = ptrX - d.grabOffX;
      const ny = ptrY - d.grabOffY;
      d.lastTargetSheet = targetSheet;

      const k = sheetPlacementOverrideKey(packing.materialId, d.baseP.sheetIndex, d.panelId);
      setPlacementOverrides((prev) => {
        const cur = prev[k] ?? {};
        const hasRot = cur.rot90 === true;
        const tentative: SheetPlacementOverride = {
          ...cur,
          dx: nx - d.baseP.xCm,
          dy: ny - d.baseP.yCm,
        };
        if (targetSheet !== d.baseP.sheetIndex) {
          tentative.assignSheetIndex = targetSheet;
        } else {
          delete tentative.assignSheetIndex;
        }

        const obstacles: { x: number; y: number; w: number; h: number }[] = [];
        for (const raw of packerRaw) {
          if (raw.panelId === d.panelId) continue;
          const k2 = sheetPlacementOverrideKey(packing.materialId, raw.sheetIndex, raw.panelId);
          const mergedOb = mergePlacementWithOverride(raw, prev[k2]);
          if (mergedOb.sheetIndex !== targetSheet) continue;
          obstacles.push({
            x: mergedOb.xCm,
            y: mergedOb.yCm,
            w: mergedOb.widthCm,
            h: mergedOb.heightCm,
          });
        }

        const out = constrainPlacementOverrideNoOverlap(
          d.baseP,
          tentative,
          sheet.widthCm,
          sheet.heightCm,
          obstacles,
          sheet.kerfCm,
        );
        if (hasRot) out.rot90 = true;
        if (targetSheet !== d.baseP.sheetIndex) {
          out.assignSheetIndex = targetSheet;
        } else {
          delete out.assignSheetIndex;
        }

        const next = { ...prev };
        const noSpatial =
          Math.abs(out.dx ?? 0) < 1e-9 &&
          Math.abs(out.dy ?? 0) < 1e-9 &&
          out.rot90 !== true &&
          out.assignSheetIndex === undefined;
        if (noSpatial) {
          delete next[k];
        } else {
          next[k] = out;
        }
        return next;
      });
    };
    const onUp = () => {
      const d = crossSheetDragRef.current;
      crossSheetDragRef.current = null;
      if (!d) return;
      try {
        d.captureEl?.releasePointerCapture?.(d.pointerId);
      } catch {
        /* already released */
      }
      if (!d.hasDragged) {
        setSelectedPanelId((cur) => (cur === d.panelId ? null : d.panelId));
        return;
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [
    allowManualAdjust,
    packerRaw,
    packing.materialId,
    sheet.widthCm,
    sheet.heightCm,
    sheet.kerfCm,
    sheetIndices,
    setPlacementOverrides,
    setSelectedPanelId,
  ]);

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
      <div className="flex items-center gap-6 text-xs text-[var(--muted-foreground)]">
        <div>
          <span className="text-[var(--foreground)] font-medium">Sheet:</span>{" "}
          {sheet.widthCm} × {sheet.heightCm} cm · kerf {sheet.kerfCm.toFixed(1)} cm
        </div>
        <div>
          <span className="text-[var(--foreground)] font-medium">Pieces:</span>{" "}
          {mergedPlacements.length}
        </div>
        <div>
          <span className="text-[var(--foreground)] font-medium">Waste:</span>{" "}
          {wastePct.toFixed(1)}%
        </div>
        {allowManualAdjust && onAddManualSheet && (
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <button
              type="button"
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1 text-[11px] font-medium hover:bg-[var(--accent)]"
              onClick={() => onAddManualSheet(packing.materialId)}
              title="Add another board of this material (same sheet size)"
            >
              Add sheet
            </button>
          </div>
        )}
      </div>

      {result.overflow.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3">
          <div className="flex items-center gap-2 mb-2 text-amber-900 dark:text-amber-200 font-medium text-sm">
            <AlertTriangle className="w-4 h-4" />
            {result.overflow.length} piece{result.overflow.length === 1 ? "" : "s"} exceeds
            the sheet size
          </div>
          <ul className="text-xs text-amber-900 dark:text-amber-300 list-disc ml-5 space-y-0.5">
            {result.overflow.map((o) => (
              <li key={o.panelId}>
                {o.label} — {o.widthCm} × {o.heightCm} cm
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.continuityGroupBreaks.length > 0 && (
        <div className="rounded-lg border border-sky-300 bg-sky-50 dark:bg-sky-950/25 dark:border-sky-800 p-3">
          <div className="flex items-center gap-2 mb-1 text-sky-900 dark:text-sky-200 font-medium text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Continuity groups split on the sheet
          </div>
          <p className="text-xs text-sky-900/90 dark:text-sky-200/90 leading-snug">
            Some laminate strips could not stay in one block; those pieces were
            packed individually. Grain pattern may not line up between them
            like a single continuous strip.
          </p>
          <ul className="mt-2 text-[11px] text-sky-900 dark:text-sky-300 list-disc ml-5 space-y-0.5 font-mono">
            {result.continuityGroupBreaks.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </div>
      )}

      {result.sheets.map((sheetUsage) => {
        const onSheet = mergedPlacements.filter((p) => p.sheetIndex === sheetUsage.index);
        const placements = sortPlacements ? sortPlacements(onSheet) : onSheet;
        return (
          <SheetSvgView
            key={sheetUsage.index}
            materialId={packing.materialId}
            sheetIndex={sheetUsage.index}
            sheet={sheet}
            packerRaw={packerRaw}
            placements={placements}
            rawPlacementByPanelId={rawPlacementByPanelId}
            registerSheetSvgRef={registerSheetSvgRef}
            registerSheetContainerRef={registerSheetContainerRef}
            onBeginPieceDrag={onBeginPieceDrag}
            labelById={labelById}
            textureUrl={textureUrl}
            usedRatio={1 - sheetUsage.wasteRatio}
            allowManualAdjust={allowManualAdjust}
            placementOverrides={placementOverrides}
            setPlacementOverrides={setPlacementOverrides}
            colorizeBySection={colorizeBySection}
            selectedPanelId={selectedPanelId}
            setSelectedPanelId={setSelectedPanelId}
            selectedOffcutRect={
              selectedOffcut?.sheetIndex === sheetUsage.index ? selectedOffcut.rect : null
            }
            onSelectOffcutRect={(rect) =>
              setSelectedOffcut(
                rect ? { sheetIndex: sheetUsage.index, rect } : null,
              )
            }
          />
        );
      })}
    </div>
  );
}

function SheetSvgView({
  materialId,
  sheetIndex,
  sheet,
  packerRaw,
  placements,
  rawPlacementByPanelId,
  registerSheetSvgRef,
  registerSheetContainerRef,
  onBeginPieceDrag,
  labelById,
  textureUrl,
  usedRatio,
  allowManualAdjust,
  placementOverrides,
  setPlacementOverrides,
  colorizeBySection = false,
  selectedPanelId,
  setSelectedPanelId,
  selectedOffcutRect,
  onSelectOffcutRect,
}: {
  materialId: string;
  sheetIndex: number;
  sheet: Sheet;
  packerRaw: Placement[];
  placements: Placement[];
  rawPlacementByPanelId: Map<string, Placement>;
  registerSheetSvgRef: (sheetIdx: number, el: SVGSVGElement | null) => void;
  registerSheetContainerRef: (sheetIdx: number, el: HTMLElement | null) => void;
  onBeginPieceDrag: (panelId: string, e: ReactPointerEvent<SVGGElement>) => void;
  labelById: Map<string, SheetViewablePanelMeta>;
  textureUrl?: string;
  usedRatio: number;
  allowManualAdjust?: boolean;
  placementOverrides: Record<string, SheetPlacementOverride>;
  setPlacementOverrides: Dispatch<SetStateAction<Record<string, SheetPlacementOverride>>>;
  colorizeBySection?: boolean;
  selectedPanelId: string | null;
  setSelectedPanelId: Dispatch<SetStateAction<string | null>>;
  selectedOffcutRect: SheetFreeRect | null;
  onSelectOffcutRect: (rect: SheetFreeRect | null) => void;
}) {
  const texPatternId = `sheet-tex-${materialId.replace(/[^a-zA-Z0-9]/g, "_")}_${sheetIndex}`;

  const overrideKeyForPanel = useCallback(
    (panelId: string) => {
      const raw = rawPlacementByPanelId.get(panelId);
      if (!raw) return sheetPlacementOverrideKey(materialId, sheetIndex, panelId);
      return sheetPlacementOverrideKey(materialId, raw.sheetIndex, panelId);
    },
    [materialId, sheetIndex, rawPlacementByPanelId],
  );

  // Fit the sheet into 900px wide max, maintaining aspect ratio.
  const maxWidthPx = 880;
  const scale = maxWidthPx / sheet.widthCm;
  const wPx = sheet.widthCm * scale;
  const hPx = sheet.heightCm * scale;
  /** ~36px control on screen; raw 1–2cm in user space is only a few px on wide sheets. */
  const rotateChipTargetCm = Math.max(
    10,
    Math.min(26, (36 * sheet.widthCm) / maxWidthPx),
  );

  const freeRects = useMemo(
    () =>
      computeSheetFreeRects(sheet.widthCm, sheet.heightCm, placements, sheet.kerfCm),
    [sheet.widthCm, sheet.heightCm, sheet.kerfCm, placements],
  );

  const offcutRectsEqual = useCallback((a: SheetFreeRect, b: SheetFreeRect) => {
    const ε = 1e-3;
    return (
      Math.abs(a.x - b.x) < ε &&
      Math.abs(a.y - b.y) < ε &&
      Math.abs(a.w - b.w) < ε &&
      Math.abs(a.h - b.h) < ε
    );
  }, []);

  const onSheetBackgroundPointerDown = useCallback(
    (e: ReactPointerEvent<SVGRectElement>) => {
      if (e.button !== 0) return;
      onSelectOffcutRect(null);
      if (allowManualAdjust) setSelectedPanelId(null);
    },
    [allowManualAdjust, onSelectOffcutRect, setSelectedPanelId],
  );

  const onOffcutPointerDown = useCallback(
    (e: ReactPointerEvent<SVGRectElement>, r: SheetFreeRect) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      onSelectOffcutRect(r);
      setSelectedPanelId(null);
    },
    [onSelectOffcutRect, setSelectedPanelId],
  );

  const clearSheetOverrides = useCallback(() => {
    setPlacementOverrides((prev) => {
      const next = { ...prev };
      for (const p of placements) {
        const k = overrideKeyForPanel(p.panelId);
        delete next[k];
      }
      return next;
    });
  }, [placements, overrideKeyForPanel, setPlacementOverrides]);

  const toggleRot = useCallback(
    (panelId: string) => {
      const k = overrideKeyForPanel(panelId);
      const baseP = rawPlacementByPanelId.get(panelId);
      setPlacementOverrides((prev) => {
        const cur = prev[k] ?? {};
        const next = { ...cur, rot90: !cur.rot90 };
        if (!baseP) {
          return { ...prev, [k]: next };
        }
        const obstacles: { x: number; y: number; w: number; h: number }[] = [];
        for (const raw of packerRaw) {
          if (raw.panelId === panelId) continue;
          const sk = sheetPlacementOverrideKey(materialId, raw.sheetIndex, raw.panelId);
          const mergedOb = mergePlacementWithOverride(raw, prev[sk]);
          if (mergedOb.sheetIndex !== sheetIndex) continue;
          obstacles.push({
            x: mergedOb.xCm,
            y: mergedOb.yCm,
            w: mergedOb.widthCm,
            h: mergedOb.heightCm,
          });
        }
        const constrained = constrainPlacementOverrideNoOverlap(
          baseP,
          next,
          sheet.widthCm,
          sheet.heightCm,
          obstacles,
          sheet.kerfCm,
        );
        return { ...prev, [k]: constrained };
      });
    },
    [
      overrideKeyForPanel,
      rawPlacementByPanelId,
      packerRaw,
      materialId,
      sheetIndex,
      sheet.widthCm,
      sheet.heightCm,
      sheet.kerfCm,
      setPlacementOverrides,
    ],
  );

  return (
    <div
      ref={(el) => registerSheetContainerRef(sheetIndex, el)}
      className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--muted)]"
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)] bg-[var(--card)] text-xs gap-2 flex-wrap">
        <span className="font-medium leading-snug">
          Board {formatCmDim(sheet.widthCm)} × {formatCmDim(sheet.heightCm)} cm · Sheet{" "}
          {sheetIndex + 1} · {placements.length} piece{placements.length === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2 min-w-0">
          {allowManualAdjust && placements.length > 0 && (
            <button
              type="button"
              className="shrink-0 rounded border border-[var(--border)] px-2 py-0.5 hover:bg-[var(--accent)] text-[11px]"
              onClick={clearSheetOverrides}
            >
              Reset moves / rotations
            </button>
          )}
          <span className="text-[var(--muted-foreground)] shrink-0">
            {(usedRatio * 100).toFixed(1)}% used
          </span>
        </div>
      </div>
      <div className="p-3">
        <svg
          ref={(el) => registerSheetSvgRef(sheetIndex, el)}
          width={wPx}
          height={hPx}
          viewBox={`0 0 ${sheet.widthCm} ${sheet.heightCm}`}
          className={`block bg-[var(--background)] rounded border border-[var(--border)] ${allowManualAdjust ? "touch-none select-none" : ""}`}
          preserveAspectRatio="none"
        >
          <defs>
            {textureUrl && (
              <pattern
                id={texPatternId}
                patternUnits="userSpaceOnUse"
                x="0"
                y="0"
                width={sheet.widthCm}
                height={sheet.heightCm}
              >
                <image
                  href={textureUrl}
                  x="0"
                  y="0"
                  width={sheet.widthCm}
                  height={sheet.heightCm}
                  preserveAspectRatio="none"
                />
              </pattern>
            )}
          </defs>

          {/* Sheet background (full texture, faded to signal unused area). */}
          {textureUrl ? (
            <rect
              x={0}
              y={0}
              width={sheet.widthCm}
              height={sheet.heightCm}
              fill={`url(#${texPatternId})`}
              opacity={0.2}
              className="cursor-crosshair"
              onPointerDown={onSheetBackgroundPointerDown}
            >
              <title>Tap the board to clear offcut selection</title>
            </rect>
          ) : (
            <rect
              x={0}
              y={0}
              width={sheet.widthCm}
              height={sheet.heightCm}
              fill="var(--muted)"
              className="cursor-crosshair"
              onPointerDown={onSheetBackgroundPointerDown}
            >
              <title>Tap the board to clear offcut selection</title>
            </rect>
          )}

          {/* Unused pockets on the sheet — sizes appear only after tapping one. */}
          {freeRects.map((r) => {
            const key = `offcut-${r.x}-${r.y}-${r.w}-${r.h}`;
            const isSel =
              selectedOffcutRect !== null && offcutRectsEqual(selectedOffcutRect, r);
            const offcutDimTitle = `${formatCmDim(r.w)} × ${formatCmDim(r.h)} cm`;
            return (
              <rect
                key={key}
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                fill={isSel ? "rgba(16, 185, 129, 0.14)" : "rgba(16, 185, 129, 0.07)"}
                stroke={isSel ? "rgb(5 150 105)" : "rgba(5, 150, 105, 0.42)"}
                strokeWidth={isSel ? 0.45 : 0.28}
                strokeDasharray={isSel ? "3 2" : "2.2 1.6"}
                className="cursor-pointer"
                onPointerDown={(ev) => onOffcutPointerDown(ev, r)}
              >
                <title>
                  {isSel
                    ? `Unused offcut — ${offcutDimTitle}`
                    : "Tap to show this offcut’s width × height"}
                </title>
              </rect>
            );
          })}

          {/* Each placed piece: textured if possible, with a dashed border + label. */}
          {placements.map((p) => {
            const ep = p;
            const isSelected = selectedPanelId === p.panelId;
            const strokeCol = wardrobePanelStrokeColor(
              wardrobePanelSectionGroup(p.panelId),
              colorizeBySection,
            );
            const baseId = p.panelId.split(".addon.")[0];
            const meta =
              labelById.get(baseId) ?? labelById.get(p.panelId.split("#")[0]);
            const displayName = meta?.label ?? p.label;
            const midX = ep.xCm + ep.widthCm / 2;
            const clipId = `clip-${materialId.replace(/[^a-zA-Z0-9]/g, "_")}-${sheetIndex}-${p.panelId.replace(/[^a-zA-Z0-9]/g, "_")}`;
            const m = Math.min(ep.widthCm, ep.heightCm);
            const labelFs = Math.min(3.2, Math.max(0.85, m * 0.11));
            const yLabel = ep.yCm + ep.heightCm * 0.42;
            const dimLine = `${formatCmDim(ep.widthCm)} × ${formatCmDim(ep.heightCm)} cm${
              ep.rotated ? " · rot." : ""
            }`;
            /** Large when selected so sizes stay readable on small cuts. */
            let dimFs = Math.max(6, Math.min(14, m * 0.48));
            let nameFsSel = Math.max(5, Math.min(10, m * 0.22));
            if (isSelected) {
              const longest = Math.max(displayName.length, dimLine.length);
              if (longest * dimFs * 0.48 > ep.widthCm * 0.92) {
                dimFs = (ep.widthCm * 0.92) / longest / 0.48;
                dimFs = Math.max(5, dimFs);
                nameFsSel = Math.max(4.5, dimFs * 0.68);
              }
            }
            const insideBlockH = nameFsSel * 0.85 + dimFs * 0.85 + 1.2;
            const putLabelsBelow = isSelected && ep.heightCm < insideBlockH;
            const midBlock = ep.yCm + ep.heightCm / 2;
            const yNameSel = putLabelsBelow
              ? Math.min(
                  sheet.heightCm - dimFs - nameFsSel - 0.8,
                  ep.yCm + ep.heightCm + 1.0 + nameFsSel * 0.35,
                )
              : midBlock - dimFs * 0.38 - nameFsSel * 0.2;
            const yDim = putLabelsBelow
              ? yNameSel + nameFsSel * 0.82 + 0.35
              : midBlock + dimFs * 0.38;
            const dimText = dimLine;
            const pieceTooltip = `${displayName} — ${dimText}`;
            const pieceMin = Math.min(ep.widthCm, ep.heightCm);
            const rotBox = Math.min(
              rotateChipTargetCm,
              Math.max(6, pieceMin * 0.52 - 0.1),
            );
            const rotFx = Math.max(ep.xCm, ep.xCm + ep.widthCm - rotBox - 0.05);
            const rotFy = ep.yCm + 0.05;
            return (
              <g key={p.panelId} aria-label={pieceTooltip}>
                <title>{pieceTooltip}</title>
                <g
                  style={allowManualAdjust ? { cursor: "grab" } : undefined}
                  onPointerDown={(e) => onBeginPieceDrag(p.panelId, e)}
                >
                  {textureUrl && (
                    <>
                      <defs>
                        <clipPath id={clipId}>
                          <rect
                            x={ep.xCm}
                            y={ep.yCm}
                            width={ep.widthCm}
                            height={ep.heightCm}
                          />
                        </clipPath>
                      </defs>
                      <rect
                        x={ep.xCm}
                        y={ep.yCm}
                        width={ep.widthCm}
                        height={ep.heightCm}
                        fill={`url(#${texPatternId})`}
                        clipPath={`url(#${clipId})`}
                      />
                    </>
                  )}
                  <rect
                    x={ep.xCm}
                    y={ep.yCm}
                    width={ep.widthCm}
                    height={ep.heightCm}
                    fill={textureUrl ? "none" : "rgba(56, 130, 220, 0.18)"}
                    stroke={isSelected ? "rgb(37 99 235)" : strokeCol}
                    strokeWidth={
                      isSelected ? 0.75 : colorizeBySection ? 0.42 : 0.3
                    }
                    strokeDasharray="2 1.4"
                  />
                  {!isSelected && (
                    <text
                      x={midX}
                      y={yLabel}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="rgba(0,0,0,0.82)"
                      fontSize={labelFs}
                      opacity={0.82}
                      style={
                        {
                          paintOrder: "stroke",
                          stroke: "rgba(255,255,255,0.85)",
                          strokeWidth: 0.45,
                        } as React.CSSProperties
                      }
                    >
                      {displayName}
                    </text>
                  )}
                  {isSelected && (
                    <>
                      <text
                        x={midX}
                        y={yNameSel}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="rgba(0,0,0,0.88)"
                        fontSize={nameFsSel}
                        fontWeight={600}
                        style={
                          {
                            paintOrder: "stroke",
                            stroke: "rgba(255,255,255,0.92)",
                            strokeWidth: 0.55,
                          } as React.CSSProperties
                        }
                      >
                        {displayName}
                      </text>
                      <text
                        x={midX}
                        y={yDim}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="rgb(30 64 175)"
                        fontSize={dimFs}
                        fontWeight={700}
                        style={
                          {
                            paintOrder: "stroke",
                            stroke: "rgba(255,255,255,0.95)",
                            strokeWidth: 0.65,
                          } as React.CSSProperties
                        }
                      >
                        {dimText}
                      </text>
                    </>
                  )}
                </g>
                {allowManualAdjust && isSelected && (
                  <foreignObject
                    x={rotFx}
                    y={rotFy}
                    width={rotBox}
                    height={rotBox}
                    className="overflow-visible pointer-events-none"
                  >
                    <div className="box-border flex h-full w-full items-start justify-end p-[0.5px] pointer-events-auto">
                      <button
                        type="button"
                        className="flex h-full w-full min-h-0 min-w-0 items-center justify-center rounded-[3px] border border-black/14 bg-[var(--background)]/94 text-[var(--foreground)] shadow-[0_1px_3px_rgba(0,0,0,0.08)] backdrop-blur-[2px] hover:border-black/22 hover:bg-[var(--accent)] active:scale-[0.97]"
                        title="Rotate 90° on sheet"
                        aria-label="Rotate piece on sheet"
                        onPointerDown={(ev) => ev.stopPropagation()}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          toggleRot(p.panelId);
                        }}
                      >
                        <RotateCw
                          className="h-[76%] w-[76%] max-h-5 max-w-5 shrink-0 opacity-90"
                          strokeWidth={2.4}
                        />
                      </button>
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          })}

          {selectedOffcutRect && (() => {
            const r = selectedOffcutRect;
            const midX = r.x + r.w / 2;
            const midY = r.y + r.h / 2;
            const m = Math.min(r.w, r.h);
            const offcutName = "Unused offcut";
            const dimLine = `${formatCmDim(r.w)} × ${formatCmDim(r.h)} cm`;
            let fsDim = Math.max(8, Math.min(18, m * 0.55));
            let fsName = Math.max(5, fsDim * 0.72);
            const lineGap = fsDim * 0.22;
            const longest = Math.max(offcutName.length, dimLine.length);
            if (longest * fsDim * 0.48 > r.w * 0.9) {
              fsDim = (r.w * 0.9) / longest / 0.48;
              fsDim = Math.max(5.5, fsDim);
              fsName = Math.max(4.5, fsDim * 0.72);
            }
            const blockH = fsName * 0.85 + lineGap + fsDim * 0.85;
            const placeInside = r.h >= blockH * 1.15;
            let yName: number;
            let yDim: number;
            if (placeInside) {
              const top = midY - blockH / 2;
              yName = top + fsName * 0.42;
              yDim = yName + fsName * 0.78 + lineGap;
            } else {
              yDim = Math.max(fsDim * 0.55, r.y - fsName * 0.5 - lineGap);
              yName = yDim - fsName * 0.78 - lineGap;
            }
            yName = Math.min(Math.max(yName, fsName * 0.5), sheet.heightCm - blockH);
            yDim = Math.min(Math.max(yDim, yName + fsName * 0.5), sheet.heightCm - fsDim * 0.35);
            return (
              <g pointerEvents="none" aria-hidden>
                <text
                  x={midX}
                  y={yName}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="rgb(4 120 87)"
                  fontSize={fsName}
                  fontWeight={600}
                  pointerEvents="none"
                  style={
                    {
                      paintOrder: "stroke",
                      stroke: "rgba(255,255,255,0.95)",
                      strokeWidth: 0.65,
                      pointerEvents: "none",
                    } as React.CSSProperties
                  }
                >
                  {offcutName}
                </text>
                <text
                  x={midX}
                  y={yDim}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="rgb(4 120 87)"
                  fontSize={fsDim}
                  fontWeight={700}
                  pointerEvents="none"
                  style={
                    {
                      paintOrder: "stroke",
                      stroke: "rgba(255,255,255,0.95)",
                      strokeWidth: 0.75,
                      pointerEvents: "none",
                    } as React.CSSProperties
                  }
                >
                  {dimLine}
                </text>
              </g>
            );
          })()}
        </svg>
      </div>

      {freeRects.length > 0 && (
        <p className="px-3 pb-2 pt-0.5 text-[10px] text-[var(--muted-foreground)] border-t border-[var(--border)]">
          Shaded areas are unused (kerf margin around cuts). Tap one for label and width × height
          on the board; hover for a tooltip. Tap the board to clear.
        </p>
      )}
    </div>
  );
}
