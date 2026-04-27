"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
} from "lucide-react";
import { ActiveSelection, Rect } from "fabric";
import { KITCHEN_PRESETS, WARDROBE_PRESETS } from "./furniturePresets";
import type { SheetLengthUnit, SheetTool } from "./sheetTypes";
import { SHEET_STORAGE_KEY, loadSheetState, saveSheetState } from "./sheetTypes";

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

export default function SheetDraftCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<import("fabric").Canvas | null>(null);
  const previewRef = useRef<import("fabric").Line | import("fabric").Rect | import("fabric").Circle | null>(null);
  const lineAwaitRef = useRef<{ x: number; y: number } | null>(null);
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
  const selectAllRef = useRef<(() => void) | null>(null);
  const deleteSelectionRef = useRef<() => void>(() => {});
  /** After a shape is finished, switch to select so the next drag moves the new object, not a new draw. */
  const afterDrawToSelectRef = useRef<() => void>(() => {});
  const pushHistoryRef = useRef<(() => void) | null>(null);
  const historyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_HISTORY = 50;
  const HISTORY_PROPS = ["layerId", "isSheetGuide"] as const;

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
  const presetStaggerRef = useRef(0);

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

  useEffect(() => {
    const c = fabricRef.current;
    if (c) c.selection = tool === "select";
  }, [tool]);

  const scheduleSave = useCallback((canvas: import("fabric").Canvas) => {
    if (saveT.current) clearTimeout(saveT.current);
    saveT.current = setTimeout(() => {
      const j = canvas.toObject(["layerId", "isSheetGuide"]);
      saveSheetState({
        version: 1,
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
    const isTypingTarget = (el: EventTarget | null) => {
      if (!el || !(el instanceof HTMLElement)) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    };

    const onWinKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        deleteSelectionRef.current();
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod) {
        if (e.key === "z" || e.key === "Z") {
          e.preventDefault();
          if (e.shiftKey) {
            redoRef.current?.();
          } else {
            undoRef.current?.();
          }
          return;
        }
        if (e.key === "y" || e.key === "Y") {
          e.preventDefault();
          redoRef.current?.();
          return;
        }
        if (e.key === "a" || e.key === "A") {
          e.preventDefault();
          selectAllRef.current?.();
          return;
        }
      }
      if (mod) return;
      if (e.key === "v" || e.key === "V") setTool("select");
      if (e.key === "l" || e.key === "L") {
        setTool("line");
        setHint("Two-click line (Esc cancels)");
      }
      if (e.key === "r" || e.key === "R") {
        setTool("rect");
        setHint("Click and drag");
      }
      if (e.key === "c" || e.key === "C") {
        setTool("circle");
        setHint("Drag from center");
      }
    };
    window.addEventListener("keydown", onWinKey, { capture: true });
    return () => window.removeEventListener("keydown", onWinKey, { capture: true });
  }, []);

  useEffect(() => {
    let alive = true;
    let disposeCanvas: (() => void) | null = null;
    (async () => {
      const { Canvas, Line, Rect, Circle, ActiveSelection } = await import("fabric");
      if (!alive || !canvasRef.current) return;
      const w = 1200;
      const h = 800;
      const canvas = new Canvas(canvasRef.current, {
        width: w,
        height: h,
        backgroundColor: "rgba(255,255,255,0.85)",
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
      selectAllRef.current = () => {
        const objs = canvas
          .getObjects()
          .filter((o) => !(o as { isSheetGuide?: boolean }).isSheetGuide);
        if (objs.length === 0) return;
        canvas.discardActiveObject();
        if (objs.length === 1) {
          canvas.setActiveObject(objs[0]!);
        } else {
          const sel = new ActiveSelection(objs, { canvas });
          canvas.setActiveObject(sel);
        }
        canvas.requestRenderAll();
      };

      const onObjectHistory = (e: { target?: import("fabric").FabricObject | undefined }) => {
        if (restoringHistoryRef.current) return;
        const tgt = e.target;
        if (tgt && (tgt as { isSheetGuide?: boolean }).isSheetGuide) return;
        queueHistoryPush();
      };

      canvas.on("object:added", onObjectHistory);
      canvas.on("object:modified", onObjectHistory);
      const onObjectRemoved = (e: { target?: unknown }) => {
        if (restoringHistoryRef.current) return;
        const tgt = (e as { target?: import("fabric").FabricObject }).target;
        if (tgt && (tgt as { isSheetGuide?: boolean }).isSheetGuide) return;
        queueHistoryPush();
      };
      canvas.on("object:removed", onObjectRemoved);

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
          (line as { layerId?: string }).layerId = layerRef.current;
          line.setCoords();
          canvas.add(line);
          lineAwaitRef.current = null;
          removePreview();
          scheduleSave(canvas);
          canvas.setActiveObject(line);
          afterDrawToSelectRef.current();
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
        previewRef.current = null;
        dragRef.current = null;
        (obj as import("fabric").FabricObject).setCoords();
        canvas.setActiveObject(obj as import("fabric").FabricObject);
        canvas.requestRenderAll();
        scheduleSave(canvas);
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
  }, []);

  const handleDelete = useCallback(() => {
    const c = fabricRef.current;
    if (!c) return;
    const active = c.getActiveObject();
    if (!active) return;
    // getActiveObjects() for ActiveSelection are children; they are not top-level on the canvas, so
    // canvas.remove(child) is a no-op until selection is discarded and objects are ungrouped.
    const toRemove: import("fabric").FabricObject[] = active instanceof ActiveSelection ? active.getObjects() : [active];
    c.discardActiveObject();
    for (const o of toRemove) {
      c.remove(o);
    }
    c.requestRenderAll();
    scheduleSave(c);
  }, [scheduleSave]);

  deleteSelectionRef.current = handleDelete;

  const applyEasyLayout = useCallback(() => {
    setGridMm(50);
    setSnap(true);
    setOrtho(true);
    setTool("rect");
    setHint("50 mm grid, snap, and ortho on — use Insert blocks or draw rectangles. Switch to Select (V) to move things.");
  }, []);

  const addPresetBox = useCallback(
    (wMm: number, hMm: number) => {
      const c = fabricRef.current;
      if (!c) return;
      const w = Math.max(1, wMm);
      const h = Math.max(1, hMm);
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
        fill: "rgba(15, 23, 42, 0.12)",
        stroke: strokeColorRef.current,
        strokeWidth: 2,
        strokeUniform: true,
        objectCaching: false,
      } as object);
      (r as { layerId?: string }).layerId = layerRef.current;
      c.add(r);
      r.setCoords();
      c.setActiveObject(r);
      c.requestRenderAll();
      scheduleSave(c);
      setTool("select");
      setHint("Drag to position · use corner handles to resize");
    },
    [scheduleSave]
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-slate-50/40">
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
              title="Select (V)"
            >
              <MousePointer2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={tool === "line" ? "rounded-lg bg-amber-500/15 px-2.5 py-2 text-amber-950 ring-1 ring-amber-500/25" : "rounded-lg px-2.5 py-2 text-slate-600 hover:bg-slate-100"}
              onClick={() => { setTool("line"); setHint("Two-click line · Esc to cancel"); }}
              title="Line (L)"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={tool === "rect" ? "rounded-lg bg-amber-500/15 px-2.5 py-2 text-amber-950 ring-1 ring-amber-500/25" : "rounded-lg px-2.5 py-2 text-slate-600 hover:bg-slate-100"}
              onClick={() => { setTool("rect"); setHint("Click and drag"); }}
              title="Rectangle (R)"
            >
              <Square className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={tool === "circle" ? "rounded-lg bg-amber-500/15 px-2.5 py-2 text-amber-950 ring-1 ring-amber-500/25" : "rounded-lg px-2.5 py-2 text-slate-600 hover:bg-slate-100"}
              onClick={() => { setTool("circle"); setHint("Drag from center"); }}
              title="Circle (C)"
            >
              <Circle className="h-4 w-4" />
            </button>
          </div>


          <div className="flex items-center gap-0.5 rounded-xl border border-slate-200/90 bg-white p-0.5 shadow-sm">
            <button
              type="button"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              title="Undo (Ctrl+Z / ⌘Z)"
              onClick={() => undoRef.current?.()}
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              title="Redo (Ctrl+Shift+Z / Ctrl+Y / ⌘⇧Z)"
              onClick={() => redoRef.current?.()}
            >
              <Redo2 className="h-4 w-4" />
            </button>
          </div>

          <div className="h-6 w-px bg-slate-200" aria-hidden />

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
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase text-slate-500">Kitchen</span>
            {KITCHEN_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                title={p.title}
                onClick={() => addPresetBox(p.wMm, p.hMm)}
                className="rounded-lg border border-slate-200/90 bg-white px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:border-emerald-300 hover:bg-emerald-50/60"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase text-slate-500">Wardrobe</span>
            {WARDROBE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                title={p.title}
                onClick={() => addPresetBox(p.wMm, p.hMm)}
                className="rounded-lg border border-slate-200/90 bg-white px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:border-violet-300 hover:bg-violet-50/60"
              >
                {p.label}
              </button>
            ))}
          </div>
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
              onClick={() => addPresetBox(customWmm, customHmm)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
            >
              <Box className="h-3.5 w-3.5" />
              Place
            </button>
          </div>
        </div>
        <p className="text-[11px] text-slate-500">
          <kbd className="rounded border border-slate-200 bg-white px-1 font-sans">V</kbd> select ·
          <kbd className="ml-1 rounded border border-slate-200 bg-white px-1 font-sans">L</kbd> line ·
          <kbd className="ml-1 rounded border border-slate-200 bg-white px-1 font-sans">R</kbd> rect ·
          <kbd className="ml-1 rounded border border-slate-200 bg-white px-1 font-sans">C</kbd> circle ·{" "}
          <span className="text-slate-400">·</span>{" "}
          <kbd className="ml-1 rounded border border-slate-200 bg-white px-1 font-sans">⌘Z</kbd> undo ·{" "}
          <kbd className="ml-1 rounded border border-slate-200 bg-white px-1 font-sans">⌘⇧Z</kbd> redo ·{" "}
          <kbd className="ml-1 rounded border border-slate-200 bg-white px-1 font-sans">⌘A</kbd> all ·{" "}
          <kbd className="ml-1 rounded border border-slate-200 bg-white px-1 font-sans">⌫</kbd> delete
        </p>
      </div>
      {hint ? <p className="border-b border-amber-200/60 bg-amber-50/90 px-3 py-1.5 text-xs text-amber-950">{hint}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/50 bg-slate-100/40 px-3 py-1 text-xs text-slate-600">
        <span>Pointer position uses canvas space (1px ≈ 1 {unit} at 100% zoom for reference).</span>
        {pointer ? <span className="font-mono text-slate-800">x {pointer.x} · y {pointer.y}</span> : null}
      </div>
      <div
        className="relative min-h-0 flex-1 overflow-auto p-4"
        style={
          showGrid
            ? {
                backgroundSize: `${Math.min(40, Math.max(8, gridMm))}px ${Math.min(40, Math.max(8, gridMm))}px`,
                backgroundImage:
                  "linear-gradient(to right, rgb(15 23 42 / 5%) 1px, transparent 1px), linear-gradient(to bottom, rgb(15 23 42 / 5%) 1px, transparent 1px)",
                backgroundColor: "rgb(241 245 249)",
              }
            : { backgroundColor: "rgb(241 245 249)" }
        }
      >
        <div className="inline-block overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-lg shadow-slate-300/20 ring-1 ring-slate-900/5">
          <canvas ref={canvasRef} width={1200} height={800} />
        </div>
      </div>
    </div>
  );
}