"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MousePointer2,
  Minus,
  Square,
  Circle,
  ZoomIn,
  ZoomOut,
  Grid3X3,
  Magnet,
  MoveHorizontal,
  Trash2,
  RotateCcw,
  Maximize2,
  Undo2,
  Redo2,
  Wand2,
  Box,
  Save,
  Download,
  Send,
  Layers,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Copy,
  RotateCw,
  Ruler,
  FileText,
} from "lucide-react";
import { ActiveSelection, Rect } from "fabric";
import { FURNITURE_PRESET_GROUPS, type FurnitureIconKey, type FurniturePreset } from "./furniturePresets";
import type { SheetLengthUnit, SheetTool } from "./sheetTypes";
import { SHEET_HISTORY_PROPS, SHEET_STORAGE_KEY, loadSheetState, saveSheetState } from "./sheetTypes";
import { SHEET_MATERIALS, groupedSheetMaterials, getSheetMaterial, sheetMaterialsFromPlannerSwatches } from "./sheetMaterials";
import { distanceMm, makeSheetId, mmToCanvas, objectBounds, objectCenter, objectDimensionsMm, readableTextColor, snapRotation } from "./sheetGeometry";
import { buildSheetDesignPayload } from "./sheetSerialization";
import { canvasToPngDataUrl, exportSheetPdf, exportSheetPng } from "./sheetExport";
import { createFurnitureIcon } from "./sheetFurnitureIcons";
import { api } from "@/lib/api";
import {
  filterMaterialsForPlanner,
  materialsFromStore,
  upholsteryMaterialsFromStore,
  isBoardFinishMaterial,
  mergeDefaultBoardMaterialsWhenMissing,
} from "@/lib/plannerMaterials";
import { useStore } from "@/lib/store";
import { useResolvedAdmin } from "@/contexts/PublishedTenantProvider";

function snapVal(v: number, grid: number) {
  if (grid <= 0) return v;
  return Math.round(v / grid) * grid;
}

function applyOrtho(x0: number, y0: number, x1: number, y1: number, ortho: boolean) {
  if (!ortho) return { x: x1, y: y1 };
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (Math.abs(dx) >= Math.abs(dy)) return { x: x1, y: y0 };
  return { x: x0, y: y1 };
}

function fabricTypeLower(obj: { type?: string } | null | undefined): string {
  return (obj?.type ?? "").toLowerCase();
}

type SheetFabricObject = import("fabric").FabricObject & {
  layerId?: string;
  isSheetGuide?: boolean;
  isSheetAnnotation?: boolean;
  isSheetDimension?: boolean;
  sheetId?: string;
  sheetLabel?: string;
  sheetLocked?: boolean;
  sheetVisible?: boolean;
  sheetMaterialKey?: string | null;
  sheetIconKey?: FurnitureIconKey | null;
  sheetObjectKind?: string;
  sheetParentId?: string;
  sheetRole?: string;
};

interface SelectedSheetObject {
  id: string;
  label: string;
  width: number;
  height: number;
  rotation: number;
  color: string;
  locked: boolean;
  visible: boolean;
  materialKey: string | null;
  multiple: boolean;
}

const selectableSheetObject = (obj: import("fabric").FabricObject): obj is SheetFabricObject => {
  const o = obj as SheetFabricObject;
  return !o.isSheetGuide && !o.isSheetAnnotation && !o.isSheetDimension && !!o.sheetId;
};

const paletteButtonClass = "rounded-lg border border-slate-200/90 bg-white px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:border-amber-300 hover:bg-amber-50/60";

export default function SheetDraftCanvas() {
  const admin = useResolvedAdmin();
  const rawMaterials = useStore((s) => s.materials);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<import("fabric").Canvas | null>(null);
  const previewRef = useRef<import("fabric").Line | import("fabric").Rect | import("fabric").Circle | null>(null);
  const lineAwaitRef = useRef<{ x: number; y: number } | null>(null);
  const measureAwaitRef = useRef<{ x: number; y: number } | null>(null);
  const updatingAnnotationsRef = useRef(false);
  const smartGuidesRef = useRef<import("fabric").Line[]>([]);
  const dragRef = useRef<{ kind: "rect" | "circle"; x: number; y: number } | null>(null);
  const isDrawingRef = useRef(false);
  const saveT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toolRef = useRef<SheetTool>("select");
  const snapRef = useRef(true);
  const orthoRef = useRef(false);
  const gridRef = useRef(10);
  const layerRef = useRef("layer-1");
  const strokeColorRef = useRef("#0f172a");
  const pointerRaf = useRef<{ x: number; y: number } | null>(null);
  const restoringHistoryRef = useRef(false);
  const historyStackRef = useRef<{ doc: Record<string, unknown>; zoom: number }[]>([]);
  const historyIndexRef = useRef(-1);
  const undoRef = useRef<(() => void) | null>(null);
  const redoRef = useRef<(() => void) | null>(null);
  /** After a shape is finished, switch to select so the next drag moves the new object, not a new draw. */
  const afterDrawToSelectRef = useRef<() => void>(() => {});
  const pushHistoryRef = useRef<(() => void) | null>(null);
  const historyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_HISTORY = 50;
  const HISTORY_PROPS = SHEET_HISTORY_PROPS;

  const [tool, setTool] = useState<SheetTool>("select");
  const [unit, setUnit] = useState<SheetLengthUnit>("mm");
  const [gridMm, setGridMm] = useState(10);
  const [snap, setSnap] = useState(true);
  const [ortho, setOrtho] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [hint, setHint] = useState("");
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [strokeColor, setStrokeColor] = useState("#0f172a");
  const [customWmm, setCustomWmm] = useState(600);
  const [customHmm, setCustomHmm] = useState(720);
  const [selected, setSelected] = useState<SelectedSheetObject | null>(null);
  const [layersOpen, setLayersOpen] = useState(true);
  const [layers, setLayers] = useState<SelectedSheetObject[]>([]);
  const [materialTab, setMaterialTab] = useState<"solid" | "materials">("solid");
  const [autoSave, setAutoSave] = useState(false);
  const [toast, setToast] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [measureVisible, setMeasureVisible] = useState(true);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitNotes, setSubmitNotes] = useState("");
  const [submitRoomName, setSubmitRoomName] = useState("");
  const [submitPreview, setSubmitPreview] = useState<string | null>(null);
  const presetStaggerRef = useRef(0);
  const sheetMaterials = useMemo(() => {
    const storeMaterials = mergeDefaultBoardMaterialsWhenMissing(
      filterMaterialsForPlanner(rawMaterials, admin?.plannerMaterialIds),
      admin?.id,
      isBoardFinishMaterial,
      admin?.plannerMaterialIds,
    );
    const plannerSwatches = [
      ...materialsFromStore(storeMaterials, admin?.companyName),
      ...upholsteryMaterialsFromStore(storeMaterials, admin?.companyName),
    ];
    const uniqueSwatches = [...new Map(plannerSwatches.map((material) => [material.id, material])).values()];
    const adminMaterials = sheetMaterialsFromPlannerSwatches(
      uniqueSwatches
    );
    return adminMaterials.length > 0 ? adminMaterials : SHEET_MATERIALS;
  }, [admin?.companyName, admin?.plannerMaterialIds, admin?.id, rawMaterials]);
  const groupedMaterials = useMemo(() => groupedSheetMaterials(sheetMaterials), [sheetMaterials]);

  toolRef.current = tool;
  snapRef.current = snap;
  orthoRef.current = ortho;
  gridRef.current = gridMm;
  strokeColorRef.current = strokeColor;

  afterDrawToSelectRef.current = () => {
    toolRef.current = "select";
    setTool("select");
    setHint("Selection active — drag to move. Pick a draw tool to add another shape.");
  };

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }, []);

  const ensureSheetObject = useCallback((obj: SheetFabricObject, label = "Custom", kind = "custom") => {
    if (!obj.sheetId) obj.sheetId = makeSheetId();
    if (!obj.sheetLabel) obj.sheetLabel = label;
    if (!obj.sheetObjectKind) obj.sheetObjectKind = kind;
    if (obj.sheetVisible === undefined) obj.sheetVisible = obj.visible !== false;
    obj.lockMovementX = obj.sheetLocked === true;
    obj.lockMovementY = obj.sheetLocked === true;
    obj.lockScalingX = obj.sheetLocked === true;
    obj.lockScalingY = obj.sheetLocked === true;
    obj.lockRotation = obj.sheetLocked === true;
    obj.hasControls = obj.sheetLocked !== true;
    obj.selectable = obj.sheetLocked !== true;
    obj.evented = obj.sheetVisible !== false;
    obj.visible = obj.sheetVisible !== false;
    return obj;
  }, []);

  const clearSmartGuides = useCallback((canvas: import("fabric").Canvas) => {
    for (const guide of smartGuidesRef.current) canvas.remove(guide);
    smartGuidesRef.current = [];
  }, []);

  const refreshLayers = useCallback(() => {
    const c = fabricRef.current;
    if (!c) return;
    const next = c
      .getObjects()
      .filter(selectableSheetObject)
      .map((obj) => {
        const dims = objectDimensionsMm(obj);
        return {
          id: obj.sheetId!,
          label: obj.sheetLabel || "Custom",
          width: dims.width,
          height: dims.height,
          rotation: Math.round(obj.angle ?? 0),
          color: obj.sheetIconKey && typeof obj.fill === "string" ? obj.fill : typeof obj.stroke === "string" ? obj.stroke : strokeColorRef.current,
          locked: obj.sheetLocked === true,
          visible: obj.visible !== false && obj.sheetVisible !== false,
          materialKey: obj.sheetMaterialKey ?? null,
          multiple: false,
        };
      })
      .reverse();
    setLayers(next);
  }, []);

  const refreshSelection = useCallback(() => {
    const c = fabricRef.current;
    if (!c) {
      setSelected(null);
      return;
    }
    const activeObjects = c.getActiveObjects().filter(selectableSheetObject);
    if (activeObjects.length === 0) {
      setSelected(null);
      refreshLayers();
      return;
    }
    const obj = activeObjects[0]!;
    const dims = objectDimensionsMm(obj);
    setSelected({
      id: obj.sheetId!,
      label: activeObjects.length > 1 ? `${activeObjects.length} objects` : obj.sheetLabel || "Custom",
      width: dims.width,
      height: dims.height,
      rotation: Math.round(obj.angle ?? 0),
      color: obj.sheetIconKey && typeof obj.fill === "string" ? obj.fill : typeof obj.stroke === "string" ? obj.stroke : strokeColorRef.current,
      locked: activeObjects.every((o) => o.sheetLocked === true),
      visible: activeObjects.every((o) => o.visible !== false && o.sheetVisible !== false),
      materialKey: activeObjects.length === 1 ? obj.sheetMaterialKey ?? null : null,
      multiple: activeObjects.length > 1,
    });
    refreshLayers();
  }, [refreshLayers]);

  const syncObjectAnnotations = useCallback(async () => {
    const c = fabricRef.current;
    if (!c || updatingAnnotationsRef.current) return;
    updatingAnnotationsRef.current = true;
    const fabric = await import("fabric");
    const { Text } = fabric;
    const existing = c.getObjects().filter((o) => (o as SheetFabricObject).isSheetAnnotation);
    for (const obj of existing) c.remove(obj);
    for (const obj of c.getObjects().filter(selectableSheetObject)) {
      if (obj.visible === false || obj.sheetVisible === false) continue;
      const dims = objectDimensionsMm(obj);
      const canvasWidth = obj.getScaledWidth();
      const canvasHeight = obj.getScaledHeight();
      const center = objectCenter(obj);
      const color = obj.sheetIconKey && typeof obj.fill === "string" ? obj.fill : typeof obj.stroke === "string" ? obj.stroke : typeof obj.fill === "string" ? obj.fill : "#f8fafc";
      const textFill = readableTextColor(color);
      const base = {
        selectable: false,
        evented: false,
        excludeFromExport: false,
        originX: "center" as const,
        originY: "center" as const,
        fontFamily: "var(--font-sans)",
        objectCaching: false,
        sheetParentId: obj.sheetId,
        isSheetAnnotation: true,
      };
      if (obj.sheetIconKey) {
        const icon = createFurnitureIcon({
          fabric,
          iconKey: obj.sheetIconKey,
          parentId: obj.sheetId!,
          left: center.x,
          top: center.y,
          width: canvasWidth,
          height: canvasHeight,
          angle: obj.angle ?? 0,
          color,
        });
        if (icon) c.add(icon);
      }
      const name = new Text(obj.sheetLabel || "Custom", {
        ...base,
        left: center.x,
        top: center.y,
        fontSize: 11,
        fontWeight: "normal",
        fill: textFill,
      } as object);
      const dim = new Text(`${dims.width}×${dims.height} mm`, {
        ...base,
        left: center.x,
        top: center.y + Math.min(dims.height / 2 + 10, 20),
        fontSize: 11,
        fill: textFill,
      } as object);
      c.add(name, dim);
    }
    c.requestRenderAll();
    updatingAnnotationsRef.current = false;
    refreshLayers();
  }, [refreshLayers]);

  useEffect(() => {
    const c = fabricRef.current;
    if (c) c.selection = tool === "select";
  }, [tool]);

  const scheduleSave = useCallback((canvas: import("fabric").Canvas) => {
    if (saveT.current) clearTimeout(saveT.current);
    saveT.current = setTimeout(() => {
      const j = canvas.toObject([...SHEET_HISTORY_PROPS] as unknown as string[]);
      saveSheetState({
        version: 2,
        unit,
        gridMm,
        snap,
        ortho,
        showGrid,
        layers: [
          { id: "layer-1", name: "Furniture", visible: true, locked: false },
        ],
        activeLayerId: layerRef.current,
        fabric: j as unknown as Record<string, unknown>,
        zoom: canvas.getZoom(),
      });
    }, 400);
  }, [gridMm, ortho, showGrid, snap, unit]);

  const mutateActiveObjects = useCallback((mutator: (obj: SheetFabricObject) => void, push = true) => {
    const c = fabricRef.current;
    if (!c) return;
    const objects = c.getActiveObjects().filter(selectableSheetObject);
    for (const obj of objects) {
      if (obj.sheetLocked) continue;
      mutator(obj);
      obj.setCoords();
    }
    void syncObjectAnnotations();
    refreshSelection();
    c.requestRenderAll();
    scheduleSave(c);
    if (push) pushHistoryRef.current?.();
  }, [refreshSelection, scheduleSave, syncObjectAnnotations]);

  const duplicateActiveObjects = useCallback(async (offset = 10) => {
    const c = fabricRef.current;
    if (!c) return;
    const objects = c.getActiveObjects().filter(selectableSheetObject);
    if (objects.length === 0) return;
    c.discardActiveObject();
    const clones: import("fabric").FabricObject[] = [];
    for (const obj of objects) {
      const clone = await obj.clone([...SHEET_HISTORY_PROPS] as unknown as string[]);
      const sheetClone = clone as SheetFabricObject;
      sheetClone.sheetId = makeSheetId();
      sheetClone.sheetLabel = obj.sheetLabel || "Custom";
      sheetClone.left = (obj.left ?? 0) + offset;
      sheetClone.top = (obj.top ?? 0) + offset;
      ensureSheetObject(sheetClone, sheetClone.sheetLabel, obj.sheetObjectKind ?? "custom");
      c.add(clone);
      clones.push(clone);
    }
    if (clones.length === 1) c.setActiveObject(clones[0]!);
    if (clones.length > 1) c.setActiveObject(new ActiveSelection(clones, { canvas: c }));
    void syncObjectAnnotations();
    refreshSelection();
    c.requestRenderAll();
    scheduleSave(c);
    pushHistoryRef.current?.();
  }, [ensureSheetObject, refreshSelection, scheduleSave, syncObjectAnnotations]);

  const applyZoom = (z: number) => {
    const c = fabricRef.current;
    if (!c) return;
    const nz = Math.min(4, Math.max(0.25, z));
    c.setZoom(nz);
    c.requestRenderAll();
    setZoom(nz);
    scheduleSave(c);
  };

  const fitZoom = () => applyZoom(1);

  useEffect(() => {
    let alive = true;
    let disposeCanvas: (() => void) | null = null;
    (async () => {
      const { Canvas, Line, Rect, Circle, Text } = await import("fabric");
      if (!alive || !canvasRef.current) return;
      const w = 1200;
      const h = 800;
      const canvas = new Canvas(canvasRef.current, {
        width: w,
        height: h,
        backgroundColor: "#ffffff",
        preserveObjectStacking: true,
      });
      if (!alive) {
        canvas.dispose();
        return;
      }
      fabricRef.current = canvas;

      const loaded = loadSheetState();
      if (loaded?.fabric) {
        try {
          await canvas.loadFromJSON(loaded.fabric);
        } catch {
          // ignore
        }
        if (typeof loaded.zoom === "number") {
          canvas.setZoom(loaded.zoom);
          setZoom(loaded.zoom);
        }
        if (loaded.unit) setUnit(loaded.unit);
        if (typeof loaded.gridMm === "number") setGridMm(loaded.gridMm);
        if (typeof loaded.snap === "boolean") setSnap(loaded.snap);
        if (typeof loaded.ortho === "boolean") setOrtho(loaded.ortho);
        if (typeof loaded.showGrid === "boolean") setShowGrid(loaded.showGrid);
      }
      try {
        const remote = await api.loadCustomDesign();
        const design = remote.data?.design as { fabric?: Record<string, unknown>; zoom?: number } | null;
        if (design?.fabric) {
          await canvas.loadFromJSON(design.fabric);
          if (typeof design.zoom === "number") {
            canvas.setZoom(design.zoom);
            setZoom(design.zoom);
          }
        }
      } catch {
        // Public visitors and logged-out users continue with local drafts.
      }
      for (const obj of canvas.getObjects()) {
        const sheetObj = obj as SheetFabricObject;
        if ((sheetObj as SheetFabricObject & { isSheetRoom?: boolean }).isSheetRoom || sheetObj.sheetObjectKind === "room") {
          canvas.remove(obj);
          continue;
        }
        if (!sheetObj.isSheetGuide && !sheetObj.isSheetAnnotation && !sheetObj.isSheetDimension) {
          ensureSheetObject(sheetObj);
        }
      }
      void syncObjectAnnotations();
      refreshLayers();

      const removePreview = () => {
        if (previewRef.current) {
          canvas.remove(previewRef.current);
          previewRef.current = null;
        }
      };

      const takeSnapshot = () => ({
        doc: JSON.parse(
          JSON.stringify(canvas.toObject([...HISTORY_PROPS] as unknown as string[]))
        ) as Record<string, unknown>,
        zoom: canvas.getZoom(),
      });

      const pushHistory = () => {
        if (restoringHistoryRef.current) return;
        const snap = takeSnapshot();
        const stack = historyStackRef.current;
        const idx = historyIndexRef.current;
        stack.length = idx + 1;
        stack.push(snap);
        if (stack.length > MAX_HISTORY) {
          stack.shift();
        }
        historyIndexRef.current = stack.length - 1;
      };

      const queueHistoryPush = () => {
        if (restoringHistoryRef.current) return;
        if (historyDebounceRef.current) clearTimeout(historyDebounceRef.current);
        historyDebounceRef.current = setTimeout(() => {
          historyDebounceRef.current = null;
          pushHistory();
        }, 100);
      };

      const applyHistoryIndex = async (newIdx: number) => {
        const stack = historyStackRef.current;
        if (newIdx < 0 || newIdx >= stack.length) return;
        restoringHistoryRef.current = true;
        lineAwaitRef.current = null;
        removePreview();
        dragRef.current = null;
        isDrawingRef.current = false;
        const entry = stack[newIdx]!;
        await canvas.loadFromJSON(entry.doc);
        canvas.setZoom(entry.zoom);
        setZoom(entry.zoom);
        historyIndexRef.current = newIdx;
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        restoringHistoryRef.current = false;
        scheduleSave(canvas);
      };

      pushHistoryRef.current = () => {
        pushHistory();
      };
      undoRef.current = () => {
        const i = historyIndexRef.current;
        if (i <= 0) return;
        void applyHistoryIndex(i - 1);
      };
      redoRef.current = () => {
        const i = historyIndexRef.current;
        const stack = historyStackRef.current;
        if (i >= stack.length - 1) return;
        void applyHistoryIndex(i + 1);
      };

      const onObjectHistory = (e: { target?: import("fabric").FabricObject | undefined }) => {
        if (restoringHistoryRef.current) return;
        if (updatingAnnotationsRef.current) return;
        const tgt = e.target;
        if (tgt && ((tgt as SheetFabricObject).isSheetGuide || (tgt as SheetFabricObject).isSheetAnnotation)) return;
        queueHistoryPush();
      };

      canvas.on("object:added", onObjectHistory);
      canvas.on("object:modified", onObjectHistory);
      const onObjectRemoved = (e: { target?: unknown }) => {
        if (restoringHistoryRef.current) return;
        if (updatingAnnotationsRef.current) return;
        const tgt = (e as { target?: import("fabric").FabricObject }).target;
        if (tgt && ((tgt as SheetFabricObject).isSheetGuide || (tgt as SheetFabricObject).isSheetAnnotation)) return;
        queueHistoryPush();
      };
      canvas.on("object:removed", onObjectRemoved);
      const onObjectChanging = (e: { target?: import("fabric").FabricObject }) => {
        const target = e.target as SheetFabricObject | undefined;
        if (!target || target.isSheetGuide || target.isSheetAnnotation) return;
        if (target.sheetLocked) return;
        if (!target.sheetId) ensureSheetObject(target);
        if (snapRef.current && fabricTypeLower(target) !== "activeselection") {
          clearSmartGuides(canvas);
          const tb = objectBounds(target);
          const candidates = canvas.getObjects().filter(selectableSheetObject).filter((o) => o.sheetId !== target.sheetId);
          let dx = 0;
          let dy = 0;
          const threshold = 6;
          for (const other of candidates) {
            const ob = objectBounds(other);
            for (const [a, b] of [[tb.left, ob.left], [tb.right, ob.right], [tb.centerX, ob.centerX]]) {
              if (Math.abs(a - b) <= threshold) dx = b - a;
            }
            for (const [a, b] of [[tb.top, ob.top], [tb.bottom, ob.bottom], [tb.centerY, ob.centerY]]) {
              if (Math.abs(a - b) <= threshold) dy = b - a;
            }
            if (dx !== 0 || dy !== 0) {
              if (dx !== 0) {
                const guide = new Line([tb.left + dx, 0, tb.left + dx, canvas.getHeight()], { stroke: "#60a5fa", strokeWidth: 1, selectable: false, evented: false, isSheetGuide: true } as object);
                smartGuidesRef.current.push(guide);
                canvas.add(guide);
              }
              if (dy !== 0) {
                const guide = new Line([0, tb.top + dy, canvas.getWidth(), tb.top + dy], { stroke: "#60a5fa", strokeWidth: 1, selectable: false, evented: false, isSheetGuide: true } as object);
                smartGuidesRef.current.push(guide);
                canvas.add(guide);
              }
              break;
            }
          }
          if (dx !== 0 || dy !== 0) {
            target.set({ left: (target.left ?? 0) + dx, top: (target.top ?? 0) + dy });
          }
        }
        if (target.angle !== undefined) target.set({ angle: snapRotation(target.angle) });
        void syncObjectAnnotations();
        refreshSelection();
      };
      const onObjectDoneChanging = () => {
        clearSmartGuides(canvas);
        void syncObjectAnnotations();
        refreshSelection();
        scheduleSave(canvas);
      };
      const onSelectionEvent = () => refreshSelection();
      canvas.on("object:moving", onObjectChanging);
      canvas.on("object:scaling", onObjectChanging);
      canvas.on("object:rotating", onObjectChanging);
      canvas.on("object:modified", onObjectDoneChanging);
      canvas.on("selection:created", onSelectionEvent);
      canvas.on("selection:updated", onSelectionEvent);
      canvas.on("selection:cleared", onSelectionEvent);

      historyStackRef.current = [];
      historyIndexRef.current = -1;
      pushHistory();

      const onDown = (opt: { e: Event; target?: unknown }) => {
        const t = toolRef.current;
        const e = opt.e;
        if ("button" in e && (e as MouseEvent).button !== 0) return;
        if (t === "select") return;
        const p = canvas.getScenePoint(e as never);
        let x = p.x;
        let y = p.y;
        if (snapRef.current) {
          const g = gridRef.current;
          x = snapVal(x, g);
          y = snapVal(y, g);
        }

        if (t === "line") {
          if (!lineAwaitRef.current) {
            lineAwaitRef.current = { x, y };
            setHint("Click again to finish the line (Esc to cancel)");
            return;
          }
          const a = lineAwaitRef.current;
          let x2 = x;
          let y2 = y;
          const o = applyOrtho(a.x, a.y, x2, y2, orthoRef.current);
          x2 = o.x;
          y2 = o.y;
          const line = new Line([a.x, a.y, x2, y2], {
            stroke: strokeColorRef.current,
            strokeWidth: 2,
            strokeUniform: true,
            objectCaching: false,
          });
          (line as SheetFabricObject).layerId = layerRef.current;
          ensureSheetObject(line as SheetFabricObject, "Custom", "line");
          line.setCoords();
          canvas.add(line);
          lineAwaitRef.current = null;
          removePreview();
          scheduleSave(canvas);
          canvas.setActiveObject(line);
          void syncObjectAnnotations();
          refreshSelection();
          afterDrawToSelectRef.current();
          return;
        }

        if (t === "measure") {
          if (!measureAwaitRef.current) {
            measureAwaitRef.current = { x, y };
            setHint("Click the second point to place the dimension line");
            return;
          }
          const a = measureAwaitRef.current;
          const measureId = makeSheetId("measure");
          const line = new Line([a.x, a.y, x, y], {
            stroke: "#2563eb",
            strokeWidth: 1.5,
            strokeUniform: true,
            selectable: false,
            evented: false,
            visible: measureVisible,
            objectCaching: false,
          } as object);
          (line as SheetFabricObject).isSheetDimension = true;
          (line as SheetFabricObject).sheetId = measureId;
          const label = new Text(`${distanceMm(a, { x, y })} mm`, {
            left: (a.x + x) / 2,
            top: (a.y + y) / 2 - 10,
            originX: "center",
            originY: "center",
            fontSize: 11,
            fill: "#1d4ed8",
            selectable: false,
            evented: false,
            visible: measureVisible,
            objectCaching: false,
          } as object);
          (label as SheetFabricObject).isSheetDimension = true;
          (label as SheetFabricObject).sheetParentId = measureId;
          canvas.add(line, label);
          measureAwaitRef.current = null;
          scheduleSave(canvas);
          pushHistoryRef.current?.();
          setHint("Measurement added");
          return;
        }

        if (t === "rect" || t === "circle") {
          isDrawingRef.current = true;
          dragRef.current = { kind: t, x, y };
        }
      };

      const onMove = (opt: { e: Event }) => {
        const t = toolRef.current;
        const e = opt.e as MouseEvent;
        const p = canvas.getScenePoint(e as never);
        const px = Math.round(p.x);
        const py = Math.round(p.y);
        if (!pointerRaf.current || pointerRaf.current.x !== px || pointerRaf.current.y !== py) {
          pointerRaf.current = { x: px, y: py };
          setPointer({ x: px, y: py });
        }
        let x = p.x;
        let y = p.y;
        if (snapRef.current) {
          const g = gridRef.current;
          x = snapVal(x, g);
          y = snapVal(y, g);
        }

        if (t === "line" && lineAwaitRef.current) {
          const a = lineAwaitRef.current;
          const o = applyOrtho(a.x, a.y, x, y, orthoRef.current);
          const pl = previewRef.current as { isSheetGuide?: boolean; type?: string; set: (a: object) => void; setCoords: () => void } | null;
          if (pl && pl.isSheetGuide && fabricTypeLower(pl) === "line") {
            pl.set({ x1: a.x, y1: a.y, x2: o.x, y2: o.y });
            pl.setCoords();
          } else {
            removePreview();
            const line = new Line([a.x, a.y, o.x, o.y], {
              stroke: "#94a3b8",
              strokeWidth: 1.5,
              strokeUniform: true,
              strokeDashArray: [6, 4],
              selectable: false,
              evented: false,
              isSheetGuide: true,
            } as object);
            previewRef.current = line;
            canvas.add(line);
          }
          canvas.requestRenderAll();
        }

        if ((t === "rect" || t === "circle") && dragRef.current) {
          if (!isDrawingRef.current) {
            return;
          }
          if (e.buttons !== undefined && e.buttons === 0) {
            return;
          }
          const d = dragRef.current;
          const pr = previewRef.current as
            | (import("fabric").Rect & { isSheetGuide?: boolean })
            | (import("fabric").Circle & { isSheetGuide?: boolean })
            | null;
          if (d.kind === "rect") {
            const left = Math.min(d.x, x);
            const top = Math.min(d.y, y);
            const rw = Math.abs(x - d.x);
            const rh = Math.abs(y - d.y);
            if (pr && pr.isSheetGuide && fabricTypeLower(pr) === "rect") {
              pr.set({ left, top, width: Math.max(0, rw), height: Math.max(0, rh) });
              pr.setCoords();
            } else {
              removePreview();
              const r = new Rect({
                left,
                top,
                width: Math.max(0, rw),
                height: Math.max(0, rh),
                fill: "rgba(15, 23, 42, 0.12)",
                stroke: "#0f172a",
                strokeWidth: 2,
                strokeUniform: true,
                selectable: false,
                evented: false,
                isSheetGuide: true,
              } as object);
              previewRef.current = r;
              canvas.add(r);
            }
          } else {
            const rad = Math.sqrt((x - d.x) ** 2 + (y - d.y) ** 2);
            if (pr && pr.isSheetGuide && fabricTypeLower(pr) === "circle") {
              (pr as import("fabric").Circle).set({
                left: d.x,
                top: d.y,
                radius: Math.max(0, rad),
                originX: "center",
                originY: "center",
              });
              pr.setCoords();
            } else {
              removePreview();
              const c = new Circle({
                left: d.x,
                top: d.y,
                radius: Math.max(0, rad),
                originX: "center",
                originY: "center",
                fill: "rgba(15, 23, 42, 0.12)",
                stroke: "#0f172a",
                strokeWidth: 2,
                strokeUniform: true,
                selectable: false,
                evented: false,
                isSheetGuide: true,
              } as object);
              previewRef.current = c;
              canvas.add(c);
            }
          }
          canvas.requestRenderAll();
        }
      };

      const onUp = (opt: { e: Event }) => {
        isDrawingRef.current = false;
        const t = toolRef.current;
        if (t !== "rect" && t !== "circle") return;
        if (!dragRef.current) return;
        if ("button" in opt.e && (opt.e as MouseEvent).button !== 0) return;
        if (!previewRef.current) {
          dragRef.current = null;
          return;
        }
        const obj = previewRef.current;
        (obj as { set: (a: object) => void; layerId?: string; isSheetGuide?: boolean }).set({
          selectable: true,
          evented: true,
          stroke: strokeColorRef.current,
        });
        (obj as { isSheetGuide?: boolean }).isSheetGuide = false;
        (obj as { layerId?: string }).layerId = layerRef.current;
        ensureSheetObject(obj as SheetFabricObject, "Custom", t);
        previewRef.current = null;
        dragRef.current = null;
        (obj as import("fabric").FabricObject).setCoords();
        canvas.setActiveObject(obj as import("fabric").FabricObject);
        canvas.requestRenderAll();
        scheduleSave(canvas);
        void syncObjectAnnotations();
        refreshSelection();
        afterDrawToSelectRef.current();
      };

      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape" && lineAwaitRef.current) {
          lineAwaitRef.current = null;
          removePreview();
          setHint("");
        }
      };

      canvas.on("mouse:down", onDown);
      canvas.on("mouse:move", onMove);
      canvas.on("mouse:up", onUp);
      canvas.on("object:modified", () => scheduleSave(canvas));
      window.addEventListener("keydown", onKey);

      canvas.requestRenderAll();

      disposeCanvas = () => {
        window.removeEventListener("keydown", onKey);
        if (historyDebounceRef.current) {
          clearTimeout(historyDebounceRef.current);
          historyDebounceRef.current = null;
        }
        try {
          canvas.off("object:added", onObjectHistory);
          canvas.off("object:modified", onObjectHistory);
          canvas.off("object:removed", onObjectRemoved);
          canvas.off("object:moving", onObjectChanging);
          canvas.off("object:scaling", onObjectChanging);
          canvas.off("object:rotating", onObjectChanging);
          canvas.off("object:modified", onObjectDoneChanging);
          canvas.off("selection:created", onSelectionEvent);
          canvas.off("selection:updated", onSelectionEvent);
          canvas.off("selection:cleared", onSelectionEvent);
        } catch {
          // ignore
        }
        try {
          canvas.dispose();
        } catch {
          // ignore
        }
        if (fabricRef.current === canvas) {
          fabricRef.current = null;
        }
      };
      if (!alive) {
        disposeCanvas();
      }
    })();
    return () => {
      alive = false;
      if (disposeCanvas) disposeCanvas();
    };
    // Fabric canvas must be initialized once; refs above keep live toolbar state in sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = useCallback(() => {
    const c = fabricRef.current;
    if (!c) return;
    const active = c.getActiveObject();
    if (!active) return;
    // getActiveObjects() for ActiveSelection are children; they are not top-level on the canvas, so
    // canvas.remove(child) is a no-op until selection is discarded and objects are ungrouped.
    const toRemove: import("fabric").FabricObject[] = (active instanceof ActiveSelection ? active.getObjects() : [active])
      .filter(selectableSheetObject)
      .filter((o) => !o.sheetLocked);
    c.discardActiveObject();
    for (const o of toRemove) {
      c.remove(o);
    }
    c.requestRenderAll();
    scheduleSave(c);
    void syncObjectAnnotations();
    refreshSelection();
  }, [refreshSelection, scheduleSave, syncObjectAnnotations]);

  const applyEasyLayout = useCallback(() => {
    setGridMm(10);
    setSnap(true);
    setOrtho(true);
    setTool("rect");
    setHint("100 mm grid, snap, and ortho on — use Insert blocks or draw rectangles. Switch to Select to move things.");
  }, []);

  const addPresetBox = useCallback(
    (wMm: number, hMm: number, label = "Custom", iconKey?: FurnitureIconKey) => {
      const c = fabricRef.current;
      if (!c) return;
      const w = Math.max(1, mmToCanvas(wMm));
      const h = Math.max(1, mmToCanvas(hMm));
      const center = c.getVpCenter();
      const step = presetStaggerRef.current++;
      const n = (step % 20) * 16;
      const g = gridRef.current;
      const doSnap = snapRef.current;
      const pad = 2;
      const cw = c.getWidth();
      const ch = c.getHeight();
      let left = center.x - w / 2 + n;
      let top = center.y - h / 2 + n;
      if (doSnap) {
        left = snapVal(left, g);
        top = snapVal(top, g);
      }
      left = Math.max(pad, Math.min(left, cw - w - pad));
      top = Math.max(pad, Math.min(top, ch - h - pad));
      const r = new Rect({
        left,
        top,
        width: w,
        height: h,
        fill: iconKey ? "#e0e0e0" : "rgba(15, 23, 42, 0.12)",
        stroke: iconKey ? "#444444" : strokeColorRef.current,
        strokeWidth: iconKey ? 0 : 2,
        strokeUniform: true,
        objectCaching: false,
      } as object);
      (r as SheetFabricObject).layerId = layerRef.current;
      ensureSheetObject(r as SheetFabricObject, label, "furniture");
      (r as SheetFabricObject).sheetIconKey = iconKey ?? null;
      c.add(r);
      r.setCoords();
      c.setActiveObject(r);
      c.requestRenderAll();
      scheduleSave(c);
      void syncObjectAnnotations();
      refreshSelection();
      setTool("select");
      setHint("Drag to position · use corner handles to resize");
    },
    [ensureSheetObject, refreshSelection, scheduleSave, syncObjectAnnotations]
  );

  const activePayload = useCallback(() => {
    const c = fabricRef.current;
    if (!c) return null;
    return buildSheetDesignPayload(c, { unit, gridMm, snap, ortho, showGrid });
  }, [gridMm, ortho, showGrid, snap, unit]);

  const handlePropertyChange = useCallback((patch: Partial<SelectedSheetObject>) => {
    mutateActiveObjects((obj) => {
      if (patch.label !== undefined && !patch.multiple) obj.sheetLabel = patch.label;
      if (patch.color) {
        if (fabricTypeLower(obj) === "rect" || fabricTypeLower(obj) === "circle") {
          obj.set(obj.sheetIconKey ? { fill: patch.color, stroke: "#444444", strokeWidth: 0 } : { fill: `${patch.color}22`, stroke: patch.color });
        } else {
          obj.set({ stroke: patch.color });
        }
        obj.sheetMaterialKey = null;
      }
      if (patch.width) obj.set({ scaleX: 1, width: mmToCanvas(patch.width) });
      if (patch.height) obj.set({ scaleY: 1, height: mmToCanvas(patch.height) });
      if (patch.rotation !== undefined) obj.set({ angle: snapRotation(patch.rotation) });
      if (patch.materialKey !== undefined) {
        const material = getSheetMaterial(patch.materialKey, sheetMaterials);
        obj.sheetMaterialKey = patch.materialKey;
        if (material) {
          obj.set(obj.sheetIconKey ? { fill: material.color, stroke: "#444444", strokeWidth: 0 } : { fill: material.color, stroke: material.color });
        }
      }
      if (patch.locked !== undefined) {
        obj.sheetLocked = patch.locked;
        ensureSheetObject(obj, obj.sheetLabel || "Custom", obj.sheetObjectKind ?? "custom");
      }
      if (patch.visible !== undefined) {
        obj.sheetVisible = patch.visible;
        obj.visible = patch.visible;
        obj.evented = patch.visible;
      }
    });
  }, [ensureSheetObject, mutateActiveObjects, sheetMaterials]);

  const selectLayer = useCallback((id: string) => {
    const c = fabricRef.current;
    const obj = c?.getObjects().find((o) => (o as SheetFabricObject).sheetId === id) as SheetFabricObject | undefined;
    if (!c || !obj) return;
    c.discardActiveObject();
    c.setActiveObject(obj);
    c.requestRenderAll();
    refreshSelection();
  }, [refreshSelection]);

  const moveLayer = useCallback((id: string, dir: "up" | "down") => {
    const c = fabricRef.current;
    const obj = c?.getObjects().find((o) => (o as SheetFabricObject).sheetId === id) as SheetFabricObject | undefined;
    if (!c || !obj) return;
    if (dir === "up") {
      (c as unknown as { bringObjectForward?: (object: import("fabric").FabricObject) => void }).bringObjectForward?.(obj);
    } else {
      (c as unknown as { sendObjectBackwards?: (object: import("fabric").FabricObject) => void }).sendObjectBackwards?.(obj);
    }
    void syncObjectAnnotations();
    refreshLayers();
    scheduleSave(c);
    pushHistoryRef.current?.();
  }, [refreshLayers, scheduleSave, syncObjectAnnotations]);

  const handleSave = useCallback(async () => {
    const payload = activePayload();
    if (!payload) return;
    try {
      await api.saveCustomDesign({ design: payload as unknown as Record<string, unknown> });
      showToast("Design saved");
    } catch {
      showToast("Save failed");
    }
  }, [activePayload, showToast]);

  const handleExportPng = useCallback(() => {
    const c = fabricRef.current;
    if (!c) return;
    exportSheetPng(c);
  }, []);

  const handleExportPdf = useCallback(async () => {
    const c = fabricRef.current;
    const payload = activePayload();
    if (!c || !payload) return;
    await exportSheetPdf({ canvas: c, payload, customerName: admin?.companyName ?? null });
  }, [activePayload, admin]);

  const openSubmit = useCallback(() => {
    const c = fabricRef.current;
    if (!c) return;
    setSubmitPreview(canvasToPngDataUrl(c));
    setSubmitOpen(true);
  }, []);

  const confirmSubmit = useCallback(async () => {
    const c = fabricRef.current;
    const payload = activePayload();
    if (!c || !payload) return;
    try {
      const snapshot = canvasToPngDataUrl(c);
      await api.submitCustomDesignPublic(admin?.slug ?? "", {
        design: payload as unknown as Record<string, unknown>,
        snapshot,
        notes: submitNotes,
        room_name: submitRoomName,
      });
      setSubmitSuccess(true);
      setSubmitOpen(false);
    } catch {
      showToast("Save failed");
    }
  }, [activePayload, admin?.slug, showToast, submitNotes, submitRoomName]);

  const addAutoDimensions = useCallback(async () => {
    const c = fabricRef.current;
    if (!c) return;
    const objects = c.getObjects().filter(selectableSheetObject);
    if (objects.length === 0) return;
    const { Line, Text } = await import("fabric");
    const bounds = objects.map(objectBounds);
    const left = Math.min(...bounds.map((b) => b.left));
    const top = Math.min(...bounds.map((b) => b.top));
    const right = Math.max(...bounds.map((b) => b.right));
    const bottom = Math.max(...bounds.map((b) => b.bottom));
    const addLine = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const id = makeSheetId("measure");
      const line = new Line([a.x, a.y, b.x, b.y], { stroke: "#2563eb", strokeWidth: 1.5, selectable: false, evented: false, visible: measureVisible } as object);
      (line as SheetFabricObject).isSheetDimension = true;
      (line as SheetFabricObject).sheetId = id;
      const text = new Text(`${distanceMm(a, b)} mm`, { left: (a.x + b.x) / 2, top: (a.y + b.y) / 2 - 8, fontSize: 11, fill: "#1d4ed8", selectable: false, evented: false, visible: measureVisible, originX: "center", originY: "center" } as object);
      (text as SheetFabricObject).isSheetDimension = true;
      (text as SheetFabricObject).sheetParentId = id;
      c.add(line, text);
    };
    addLine({ x: left, y: top - 30 }, { x: right, y: top - 30 });
    addLine({ x: right + 30, y: top }, { x: right + 30, y: bottom });
    scheduleSave(c);
    pushHistoryRef.current?.();
  }, [measureVisible, scheduleSave]);

  useEffect(() => {
    if (!autoSave) return;
    const t = window.setInterval(() => {
      void handleSave();
    }, 60000);
    return () => window.clearInterval(t);
  }, [autoSave, handleSave]);

  return (
    <div className="flex min-h-[calc(100dvh-58px)] min-w-0 flex-1 flex-col bg-white">
      <div className="flex flex-col gap-1.5 border-b border-slate-200/80 bg-gradient-to-b from-white to-slate-50/90 px-3 py-2.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Draw</span>
          <div className="flex items-center gap-0.5 rounded-xl border border-slate-200/90 bg-white p-1 shadow-sm">
            <button
              type="button"
              className={
                tool === "select" ? "rounded-lg bg-amber-500/15 px-2.5 py-2 text-amber-950 ring-1 ring-amber-500/25" : "rounded-lg px-2.5 py-2 text-slate-600 hover:bg-slate-100"
              }
              onClick={() => { setTool("select"); setHint(""); }}
              title="Select"
            >
              <MousePointer2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={tool === "line" ? "rounded-lg bg-amber-500/15 px-2.5 py-2 text-amber-950 ring-1 ring-amber-500/25" : "rounded-lg px-2.5 py-2 text-slate-600 hover:bg-slate-100"}
              onClick={() => { setTool("line"); setHint("Two-click line · Esc to cancel"); }}
              title="Line"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={tool === "rect" ? "rounded-lg bg-amber-500/15 px-2.5 py-2 text-amber-950 ring-1 ring-amber-500/25" : "rounded-lg px-2.5 py-2 text-slate-600 hover:bg-slate-100"}
              onClick={() => { setTool("rect"); setHint("Click and drag"); }}
              title="Rectangle"
            >
              <Square className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={tool === "circle" ? "rounded-lg bg-amber-500/15 px-2.5 py-2 text-amber-950 ring-1 ring-amber-500/25" : "rounded-lg px-2.5 py-2 text-slate-600 hover:bg-slate-100"}
              onClick={() => { setTool("circle"); setHint("Drag from center"); }}
              title="Circle"
            >
              <Circle className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={tool === "measure" ? "rounded-lg bg-amber-500/15 px-2.5 py-2 text-amber-950 ring-1 ring-amber-500/25" : "rounded-lg px-2.5 py-2 text-slate-600 hover:bg-slate-100"}
              onClick={() => { setTool("measure"); setHint("Measure: click two points"); }}
              title="Measure"
            >
              <Ruler className="h-4 w-4" />
            </button>
          </div>


          <div className="flex items-center gap-0.5 rounded-xl border border-slate-200/90 bg-white p-0.5 shadow-sm">
            <button
              type="button"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              title="Undo"
              onClick={() => undoRef.current?.()}
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              title="Redo"
              onClick={() => redoRef.current?.()}
            >
              <Redo2 className="h-4 w-4" />
            </button>
          </div>

          <div className="h-6 w-px bg-slate-200" aria-hidden />

          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 shadow-sm hover:bg-slate-50"
            onClick={handleSave}
            title="Save design"
          >
            <Save className="h-4 w-4" />
            Save
          </button>
          <label className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-xs text-slate-600 hover:bg-slate-100/80" title="Auto-save every 60 seconds">
            <input type="checkbox" checked={autoSave} onChange={(e) => setAutoSave(e.target.checked)} />
            Auto-save
          </label>
          <div className="relative">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 shadow-sm hover:bg-slate-50"
              onClick={() => setExportOpen((v) => !v)}
              title="Export PNG/PDF"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
            {exportOpen ? (
              <div className="absolute left-0 top-9 z-30 w-40 rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-lg">
                <button type="button" className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50" onClick={() => { setExportOpen(false); handleExportPng(); }}>Export PNG</button>
                <button type="button" className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50" onClick={() => { setExportOpen(false); void handleExportPdf(); }}>Export PDF</button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-700"
            onClick={openSubmit}
            title="Submit design to team"
          >
            <Send className="h-4 w-4" />
            Submit design
          </button>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Color</span>
            <input
              type="color"
              value={strokeColor}
              onChange={(e) => setStrokeColor(e.target.value)}
              className="h-8 w-10 cursor-pointer rounded-md border border-slate-200 bg-white"
            />
          </div>

          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-xs text-slate-500">Unit</span>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as SheetLengthUnit)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 shadow-sm"
            >
              <option value="mm">mm</option>
              <option value="cm">cm</option>
              <option value="in">in</option>
            </select>
            <span className="text-xs text-slate-500">Grid</span>
            <input
              type="number"
              min={1}
              className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm shadow-sm"
              value={gridMm}
              onChange={(e) => setGridMm(Math.max(1, Number(e.target.value) || 10))}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-xs text-slate-600 hover:bg-slate-100/80">
            <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
            <Grid3X3 className="h-3.5 w-3.5" />
            <span>Grid</span>
          </label>
          <label className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-xs text-slate-600 hover:bg-slate-100/80">
            <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
            <Magnet className="h-3.5 w-3.5" />
            <span>Snap</span>
          </label>
          <label className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-xs text-slate-600 hover:bg-slate-100/80">
            <input type="checkbox" checked={ortho} onChange={(e) => setOrtho(e.target.checked)} />
            <MoveHorizontal className="h-3.5 w-3.5" />
            <span>Ortho</span>
          </label>
          <label className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-xs text-slate-600 hover:bg-slate-100/80" title="Toggle dimension lines">
            <input
              type="checkbox"
              checked={measureVisible}
              onChange={(e) => {
                const checked = e.target.checked;
                setMeasureVisible(checked);
                const c = fabricRef.current;
                if (!c) return;
                c.getObjects().forEach((o) => {
                  if ((o as SheetFabricObject).isSheetDimension) o.set({ visible: checked });
                });
                c.requestRenderAll();
                scheduleSave(c);
              }}
            />
            <Ruler className="h-3.5 w-3.5" />
            <span>Dims</span>
          </label>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={() => void addAutoDimensions()}
            title="Auto-dimension object extents"
          >
            Auto-dimension
          </button>

          <div className="ml-auto flex items-center gap-0.5 rounded-xl border border-slate-200/90 bg-white p-0.5 shadow-sm">
            <button type="button" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" onClick={() => applyZoom(zoom * 0.9)} title="Zoom out">
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="min-w-[2.75rem] text-center text-xs font-medium text-slate-600">{Math.round(zoom * 100)}%</span>
            <button type="button" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" onClick={() => applyZoom(zoom * 1.1)} title="Zoom in">
              <ZoomIn className="h-4 w-4" />
            </button>
            <button type="button" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" onClick={fitZoom} title="100% zoom">
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 shadow-sm hover:bg-slate-50"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 shadow-sm hover:bg-slate-50"
            onClick={() => {
              if (typeof window === "undefined") return;
              if (!window.confirm("Clear the entire sheet?")) return;
              localStorage.removeItem(SHEET_STORAGE_KEY);
              window.location.reload();
            }}
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
        </div>
        <div className="flex flex-col gap-2 border-t border-slate-200/70 bg-slate-50/50 px-1 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">Furniture</span>
            <button
              type="button"
              onClick={applyEasyLayout}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200/90 bg-white px-2.5 py-1.5 text-sm font-medium text-emerald-900 shadow-sm hover:bg-emerald-50/90"
              title="50 mm grid, snap and ortho on, then you can draw or place blocks"
            >
              <Wand2 className="h-4 w-4 text-emerald-700" />
              Easy layout
            </button>
            <span className="text-xs text-slate-500">Inserts a rectangle at the view centre (1 unit ≈ 1 mm at 100% zoom).</span>
          </div>
          {FURNITURE_PRESET_GROUPS.map((group) => (
            <div key={group.id} className="flex flex-wrap items-center gap-1.5">
              <span className="min-w-20 text-[10px] font-medium uppercase text-slate-500">{group.label}</span>
              {group.presets.map((p: FurniturePreset) => (
                <button
                  key={p.id}
                  type="button"
                  title={p.title}
                  onClick={() => addPresetBox(p.wMm, p.hMm, p.label, p.icon)}
                  className={paletteButtonClass}
                >
                  <span className="mr-1 inline-block h-2.5 w-3 rounded-sm border border-slate-300 bg-slate-100 align-middle" />
                  {p.label}
                </button>
              ))}
            </div>
          ))}
          <div className="flex flex-wrap items-end gap-2">
            <span className="text-[10px] font-medium uppercase text-slate-500">Custom</span>
            <label className="flex items-center gap-1 text-xs text-slate-600">
              W
              <input
                type="number"
                min={1}
                className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm shadow-sm"
                value={customWmm}
                onChange={(e) => setCustomWmm(Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
            <span className="text-xs text-slate-400">×</span>
            <label className="flex items-center gap-1 text-xs text-slate-600">
              H
              <input
                type="number"
                min={1}
                className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm shadow-sm"
                value={customHmm}
                onChange={(e) => setCustomHmm(Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
            <span className="text-xs text-slate-500">mm</span>
            <button
              type="button"
              onClick={() => addPresetBox(customWmm, customHmm, "Custom")}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
            >
              <Box className="h-3.5 w-3.5" />
              Place
            </button>
          </div>
        </div>
      </div>
      {hint ? <p className="border-b border-amber-200/60 bg-amber-50/90 px-3 py-1.5 text-xs text-amber-950">{hint}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/50 bg-slate-100/40 px-3 py-1 text-xs text-slate-600">
        <span>Pointer position uses canvas space (1px ≈ 10mm at 100% zoom).</span>
        {pointer ? <span className="font-mono text-slate-800">x {pointer.x} · y {pointer.y}</span> : null}
      </div>
      <div className="flex min-h-[720px] flex-1">
        <aside className="w-64 shrink-0 overflow-auto border-r border-slate-200 bg-white/85 p-3">
          <button type="button" className="mb-2 flex w-full items-center justify-between text-sm font-semibold text-slate-800" onClick={() => setLayersOpen((v) => !v)}>
            <span className="inline-flex items-center gap-1.5"><Layers className="h-4 w-4" /> Layers</span>
            <span className="text-xs text-slate-500">{layers.length}</span>
          </button>
          {layersOpen ? (
            <div className="space-y-1">
              {layers.map((layer) => (
                <div key={layer.id} className="group flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs shadow-sm" onClick={() => selectLayer(layer.id)}>
                  <span className="h-3 w-3 rounded-sm border border-slate-300" style={{ background: layer.color }} />
                  <input
                    value={layer.label}
                    onChange={(e) => {
                      selectLayer(layer.id);
                      handlePropertyChange({ label: e.target.value });
                    }}
                    onDoubleClick={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 bg-transparent outline-none"
                  />
                  <button type="button" title="Move layer up" onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, "up"); }}>↑</button>
                  <button type="button" title="Move layer down" onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, "down"); }}>↓</button>
                  <button type="button" title="Toggle visibility" onClick={(e) => { e.stopPropagation(); selectLayer(layer.id); handlePropertyChange({ visible: !layer.visible }); }}>
                    {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </button>
                  <button type="button" title="Toggle lock" onClick={(e) => { e.stopPropagation(); selectLayer(layer.id); handlePropertyChange({ locked: !layer.locked }); }}>
                    {layer.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                  </button>
                </div>
              ))}
              {layers.length === 0 ? <p className="text-xs text-slate-500">No objects yet.</p> : null}
            </div>
          ) : null}
        </aside>
        <div
          className="relative min-h-0 flex-1 overflow-auto p-4"
          style={
            showGrid
              ? {
                  backgroundSize: `${Math.min(40, Math.max(8, gridMm))}px ${Math.min(40, Math.max(8, gridMm))}px`,
                  backgroundImage:
                    "linear-gradient(to right, rgb(15 23 42 / 5%) 1px, transparent 1px), linear-gradient(to bottom, rgb(15 23 42 / 5%) 1px, transparent 1px)",
                  backgroundColor: "#ffffff",
                }
              : { backgroundColor: "#ffffff" }
          }
        >
          <div className="inline-block overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-lg shadow-slate-300/20 ring-1 ring-slate-900/5">
            <canvas ref={canvasRef} width={1200} height={800} />
          </div>
        </div>
        <aside className="w-72 shrink-0 overflow-auto border-l border-slate-200 bg-white/90 p-3">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Properties</h2>
          {selected ? (
            <div className="space-y-3 text-sm">
              <label className="block text-xs text-slate-600">Label
                <input disabled={selected.multiple} value={selected.label} onChange={(e) => handlePropertyChange({ label: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-slate-600">W mm<input type="number" value={selected.width} onChange={(e) => handlePropertyChange({ width: Math.max(1, Number(e.target.value) || 1) })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5" /></label>
                <label className="text-xs text-slate-600">H mm<input type="number" value={selected.height} onChange={(e) => handlePropertyChange({ height: Math.max(1, Number(e.target.value) || 1) })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5" /></label>
              </div>
              <label className="block text-xs text-slate-600">Rotation
                <input type="range" min={0} max={360} value={selected.rotation} onChange={(e) => handlePropertyChange({ rotation: Number(e.target.value) })} className="mt-1 w-full" />
                <input type="number" min={0} max={360} value={selected.rotation} onChange={(e) => handlePropertyChange({ rotation: Number(e.target.value) })} className="mt-1 w-24 rounded-lg border border-slate-200 px-2 py-1" />
              </label>
              <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs">
                <button type="button" className={materialTab === "solid" ? "flex-1 rounded-lg bg-white px-2 py-1 shadow-sm" : "flex-1 rounded-lg px-2 py-1"} onClick={() => setMaterialTab("solid")}>Solid</button>
                <button type="button" className={materialTab === "materials" ? "flex-1 rounded-lg bg-white px-2 py-1 shadow-sm" : "flex-1 rounded-lg px-2 py-1"} onClick={() => setMaterialTab("materials")}>Materials</button>
              </div>
              {materialTab === "solid" ? (
                <input type="color" value={selected.color} onChange={(e) => handlePropertyChange({ color: e.target.value })} className="h-9 w-full rounded-lg border border-slate-200" />
              ) : (
                <div className="space-y-2">
                  {Object.entries(groupedMaterials).map(([group, mats]) => (
                    <div key={group}>
                      <p className="mb-1 text-[10px] font-semibold uppercase text-slate-500">{group}</p>
                      <div className="grid grid-cols-4 gap-1">
                        {mats.map((m) => (
                          <button
                            key={m.key}
                            type="button"
                            title={m.label}
                            aria-label={`Apply ${m.label}`}
                            aria-pressed={selected.materialKey === m.key}
                            className={
                              selected.materialKey === m.key
                                ? "h-10 rounded-lg border-2 border-amber-500 bg-cover bg-center ring-2 ring-amber-200"
                                : "h-10 rounded-lg border border-slate-200 bg-cover bg-center"
                            }
                            style={{ backgroundColor: m.color, backgroundImage: m.texture }}
                            onClick={() => handlePropertyChange({ materialKey: m.key })}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="rounded-lg border border-slate-200 px-2 py-1.5" onClick={() => mutateActiveObjects((o) => (fabricRef.current as unknown as { bringObjectForward?: (object: import("fabric").FabricObject) => void } | null)?.bringObjectForward?.(o))}>Bring forward</button>
                <button type="button" className="rounded-lg border border-slate-200 px-2 py-1.5" onClick={() => mutateActiveObjects((o) => (fabricRef.current as unknown as { sendObjectBackwards?: (object: import("fabric").FabricObject) => void } | null)?.sendObjectBackwards?.(o))}>Send back</button>
                <button type="button" className="rounded-lg border border-slate-200 px-2 py-1.5" onClick={() => handlePropertyChange({ rotation: snapRotation(selected.rotation + 90) })}><RotateCw className="mr-1 inline h-3.5 w-3.5" />Rotate 90°</button>
                <button type="button" className="rounded-lg border border-slate-200 px-2 py-1.5" onClick={() => void duplicateActiveObjects(10)}><Copy className="mr-1 inline h-3.5 w-3.5" />Duplicate</button>
                <button type="button" className="rounded-lg border border-slate-200 px-2 py-1.5" onClick={() => handlePropertyChange({ locked: !selected.locked })}>{selected.locked ? "Unlock" : "Lock"}</button>
                <button type="button" className="rounded-lg border border-red-200 px-2 py-1.5 text-red-700" onClick={handleDelete}>Delete</button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Select an object to edit size, rotation, color, material, label, layer order, lock, duplicate, or delete.</p>
          )}
        </aside>
      </div>
      {toast ? <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div> : null}
      {submitOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Submit design</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {submitPreview ? <img src={submitPreview} alt="Design preview" className="mt-3 max-h-48 w-full rounded-xl border border-slate-200 object-contain" /> : null}
            <label className="mt-3 block text-sm text-slate-600">Room name<input value={submitRoomName} onChange={(e) => setSubmitRoomName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" /></label>
            <label className="mt-3 block text-sm text-slate-600">Notes<textarea value={submitNotes} onChange={(e) => setSubmitNotes(e.target.value)} className="mt-1 h-24 w-full rounded-lg border border-slate-200 px-3 py-2" /></label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg border border-slate-200 px-3 py-2" onClick={() => setSubmitOpen(false)}>Cancel</button>
              <button type="button" className="rounded-lg bg-amber-600 px-3 py-2 font-semibold text-white" onClick={() => void confirmSubmit()}>Confirm submit</button>
            </div>
          </div>
        </div>
      ) : null}
      {submitSuccess ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 p-4">
          <div className="max-w-md rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center shadow-xl">
            <FileText className="mx-auto mb-3 h-8 w-8 text-emerald-700" />
            <h2 className="text-lg font-semibold text-emerald-950">Your design has been submitted.</h2>
            <p className="mt-2 text-sm text-emerald-900">Our team will contact you within 24 hours.</p>
            <button type="button" className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-white" onClick={() => setSubmitSuccess(false)}>Close</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}