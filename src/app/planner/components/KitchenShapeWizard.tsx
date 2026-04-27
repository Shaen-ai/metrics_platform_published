"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { X, ChevronLeft, Check } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import type { FloorOutlinePoint, LengthUnit, Opening, Room } from "../types";
import {
  buildKitchenOutline,
  bboxSizeFromOutline,
  DEFAULT_KITCHEN_SHAPE_PARAMS,
  resizeKitchenParamsFromEdgeDrag,
  type KitchenShapeId,
} from "../utils/kitchenFloorTemplates";
import {
  chamferFloorVertex,
  deleteFloorVertex,
  edgeLength,
  floorOutlineAreaSqM,
  mergeFloorVertexIfNearby,
  splitFloorEdgeAt,
  tryMoveFloorVertex,
} from "../utils/floorOutline";
import {
  formatLengthLabel,
  lengthUnitSuffix,
  ROOM_HEIGHT_MAX_M,
} from "../utils/units";
import {
  OPENING_HEIGHT_MIN_M,
  OPENING_WIDTH_MAX_M,
  OPENING_WIDTH_MIN_M,
  clampPositionValue,
  defaultOpeningHeight,
  getOpeningWallLengthM,
  leftEdgeFromCornerM,
  positionFromLeftEdgeM,
  positionFromRightEdgeM,
  rightEdgeFromCornerM,
} from "../utils/openings";
import { DraftLengthInput } from "./DraftNumberFields";
import KitchenFloorPlanSvg from "./KitchenFloorPlanSvg";
import LengthUnitToggle from "./LengthUnitToggle";

export interface KitchenShapeWizardPayload {
  outline: FloorOutlinePoint[];
  openEdgeIndices: number[];
  bbox: { width: number; depth: number };
  shapeId: KitchenShapeId;
  openings: Opening[];
}

const SHAPES_ENCLOSED: { id: KitchenShapeId; label: string; hint: string }[] = [
  { id: "square", label: "Square", hint: "Square space" },
  { id: "l_in", label: "L-shape", hint: "Inward corner" },
  { id: "chamfer", label: "Chamfered", hint: "Angled corner" },
];

const SHAPES_OPEN: { id: KitchenShapeId; label: string; hint: string }[] = [
  { id: "open_divided", label: "Open — divided", hint: "Transition on one side" },
  { id: "open_corner", label: "Open — corner", hint: "Corner opening" },
  { id: "open_l", label: "Open — L", hint: "L with open side" },
];

function ShapeIcon({ shapeId }: { shapeId: KitchenShapeId }) {
  const stroke = "#1a1a1a";
  const fillOpen = "#ffffff";
  const dash = "6 4";
  const common = { strokeWidth: 2, fill: "none" as const };

  switch (shapeId) {
    case "square":
      return (
        <svg viewBox="0 0 48 48" className="kitchen-wizard-shape-svg">
          <rect x="8" y="8" width="32" height="32" {...common} fill={fillOpen} stroke={stroke} />
        </svg>
      );
    case "l_in":
      return (
        <svg viewBox="0 0 48 48" className="kitchen-wizard-shape-svg">
          <path
            d="M8 8 L40 8 L40 28 L28 28 L28 40 L8 40 Z"
            stroke={stroke}
            strokeWidth={2}
            fill={fillOpen}
          />
        </svg>
      );
    case "chamfer":
      return (
        <svg viewBox="0 0 48 48" className="kitchen-wizard-shape-svg">
          <path
            d="M8 8 L40 8 L40 28 L32 40 L8 40 Z"
            stroke={stroke}
            strokeWidth={2}
            fill={fillOpen}
          />
        </svg>
      );
    case "open_divided":
      return (
        <svg viewBox="0 0 48 48" className="kitchen-wizard-shape-svg">
          <rect x="8" y="8" width="32" height="32" {...common} fill={fillOpen} stroke={stroke} />
          <line x1="8" y1="24" x2="40" y2="24" stroke={stroke} strokeWidth={1.5} strokeDasharray={dash} />
        </svg>
      );
    case "open_corner":
      return (
        <svg viewBox="0 0 48 48" className="kitchen-wizard-shape-svg">
          <rect x="8" y="8" width="32" height="32" {...common} fill={fillOpen} stroke={stroke} />
          <polyline
            points="40,8 40,18 30,18 30,40"
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
            strokeDasharray={dash}
          />
        </svg>
      );
    case "open_l":
      return (
        <svg viewBox="0 0 48 48" className="kitchen-wizard-shape-svg">
          <path
            d="M8 8 L40 8 L40 28 L28 28 L28 40 L8 40 Z"
            stroke={stroke}
            strokeWidth={2}
            fill={fillOpen}
          />
          <line x1="8" y1="28" x2="28" y2="28" stroke={stroke} strokeWidth={1.5} strokeDasharray={dash} />
        </svg>
      );
    default:
      return null;
  }
}

export interface KitchenShapeWizardProps {
  lengthUnit: LengthUnit;
  /** Kitchen Designer: doors/windows are not used in 3D; hide add/list UI. */
  showOpeningsUi: boolean;
  shapeStepSubtitle: string;
  layoutStepSubtitle: string;
  continueButtonLabel: string;
  onFinish: (payload: KitchenShapeWizardPayload) => void;
  onSkip: () => void;
}

export default function KitchenShapeWizard({
  lengthUnit,
  showOpeningsUi,
  shapeStepSubtitle,
  layoutStepSubtitle,
  continueButtonLabel,
  onFinish,
  onSkip,
}: KitchenShapeWizardProps) {
  const [phase, setPhase] = useState<"shape" | "layout">("shape");
  const [selectedShape, setSelectedShape] = useState<KitchenShapeId | null>(null);
  const [spanM, setSpanM] = useState(DEFAULT_KITCHEN_SHAPE_PARAMS.spanM);
  const [legCutM, setLegCutM] = useState(DEFAULT_KITCHEN_SHAPE_PARAMS.legCutM);
  const [chamferM, setChamferM] = useState(DEFAULT_KITCHEN_SHAPE_PARAMS.chamferM);
  const [outline, setOutline] = useState<FloorOutlinePoint[]>([]);
  const [openEdgeIndices, setOpenEdgeIndices] = useState<number[]>([]);
  const [selectedEdge, setSelectedEdge] = useState(0);
  const [draftOpenings, setDraftOpenings] = useState<Opening[]>([]);
  const [openingEditorExpandedId, setOpeningEditorExpandedId] = useState<string | null>(
    null,
  );
  /** When true, outline is edited by corner drag; sliders / template rebuild are frozen until reset. */
  const [outlineFreeform, setOutlineFreeform] = useState(false);
  /** White diamond handles on the 2D plan; turn off for a cleaner view while placing doors/windows. */
  const [showCornerHandles, setShowCornerHandles] = useState(true);
  /** Depth (m) for “Cut corner” along each wall meeting the selected vertex. */
  const [chamferCutDepthM, setChamferCutDepthM] = useState(0.35);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);

  const openingRoomStub = useMemo((): Pick<Room, "width" | "depth" | "floorOutline"> => {
    const bb = outline.length >= 3 ? bboxSizeFromOutline(outline) : { width: spanM, depth: spanM };
    return {
      width: bb.width,
      depth: bb.depth,
      floorOutline: outline.length >= 3 ? outline : undefined,
    };
  }, [outline, spanM]);

  useEffect(() => {
    if (selectedOpeningId && !draftOpenings.some((o) => o.id === selectedOpeningId)) {
      setSelectedOpeningId(null);
    }
  }, [draftOpenings, selectedOpeningId]);

  useEffect(() => {
    if (outline.length < 3) return;
    setDraftOpenings((prev) => {
      if (prev.length === 0) return prev;
      let changed = false;
      const next = prev.map((o) => {
        const len = getOpeningWallLengthM(o, openingRoomStub);
        const pos = clampPositionValue(o.position, len, o.width);
        if (pos !== o.position) changed = true;
        return pos === o.position ? o : { ...o, position: pos };
      });
      return changed ? next : prev;
    });
  }, [outline, openingRoomStub]);

  const resizeParamsRef = useRef({ spanM, legCutM, chamferM });
  resizeParamsRef.current = { spanM, legCutM, chamferM };

  const outlineRef = useRef(outline);
  outlineRef.current = outline;
  const openEdgesRef = useRef(openEdgeIndices);
  openEdgesRef.current = openEdgeIndices;
  const openingsRef = useRef(draftOpenings);
  openingsRef.current = draftOpenings;

  const handleResizeDragDelta = useCallback(
    (ei: number, perpDeltaWorld: number) => {
      if (!selectedShape || outlineFreeform) return;
      const p = resizeParamsRef.current;
      const { outline: ol } = buildKitchenOutline(selectedShape, p);
      const next = resizeKitchenParamsFromEdgeDrag(selectedShape, ol, ei, perpDeltaWorld, {
        spanM: p.spanM,
        legCutM: p.legCutM,
        chamferM: p.chamferM,
      });
      setSpanM(next.spanM);
      setLegCutM(next.legCutM);
      setChamferM(next.chamferM);
    },
    [selectedShape, outlineFreeform],
  );

  const handleCornerDragDelta = useCallback((vi: number, dwx: number, dwz: number) => {
    setOutlineFreeform(true);
    setOutline((prev) => {
      if (prev.length < 3) return prev;
      const next = tryMoveFloorVertex(prev, vi, dwx, dwz);
      return next ?? prev;
    });
  }, []);

  const handleCornerDragEnd = useCallback((vi: number) => {
    const r = mergeFloorVertexIfNearby(
      outlineRef.current,
      vi,
      openEdgesRef.current,
      openingsRef.current,
    );
    if (!r) return;
    setOutline(r.outline);
    setOpenEdgeIndices(r.openEdgeIndices);
    setDraftOpenings(r.openings);
    setSelectedEdge((s) => Math.min(s, Math.max(0, r.outline.length - 1)));
  }, []);

  const rebuildFromShape = useCallback(
    (shape: KitchenShapeId) => {
      const { outline: o, openEdgeIndices: oe } = buildKitchenOutline(shape, {
        spanM,
        legCutM,
        chamferM,
      });
      setOutline(o);
      setOpenEdgeIndices(oe);
    },
    [spanM, legCutM, chamferM]
  );

  useEffect(() => {
    if (!selectedShape || outlineFreeform) return;
    rebuildFromShape(selectedShape);
  }, [selectedShape, spanM, legCutM, chamferM, outlineFreeform, rebuildFromShape]);

  const areaLabel = useMemo(() => {
    if (outline.length < 3) return "—";
    const ft2 = floorOutlineAreaSqM(outline) * 10.76391041671;
    return `${ft2.toFixed(1)} ft²`;
  }, [outline]);

  const handlePickShape = (id: KitchenShapeId) => {
    setOutlineFreeform(false);
    setSelectedShape(id);
    setPhase("layout");
    setSelectedEdge(0);
    setDraftOpenings([]);
  };

  const handleAddOpening = (type: "door" | "window") => {
    const w = type === "door" ? 0.9 : 1.2;
    const len = outline.length >= 3 ? edgeLength(outline, selectedEdge) : 0;
    const position = len > 0 ? clampPositionValue(0, len, w) : 0;
    const o: Opening = {
      id: uuidv4(),
      type,
      wall: "back",
      position,
      edgeIndex: selectedEdge,
      width: w,
      height: type === "door" ? 2.1 : 1.2,
    };
    setDraftOpenings((prev) => [...prev, o]);
  };

  const handleContinue = () => {
    if (!selectedShape || outline.length < 3) return;
    const bbox = bboxSizeFromOutline(outline);
    onFinish({
      outline,
      openEdgeIndices,
      bbox,
      shapeId: selectedShape,
      openings: draftOpenings,
    });
  };

  const handleSplitSelectedWall = useCallback(() => {
    if (outline.length < 3) return;
    const r = splitFloorEdgeAt(
      outline,
      selectedEdge,
      0.5,
      openEdgeIndices,
      draftOpenings,
    );
    if (!r) return;
    setOutline(r.outline);
    setOpenEdgeIndices(r.openEdgeIndices);
    setDraftOpenings(r.openings);
    setOutlineFreeform(true);
    setSelectedOpeningId(null);
  }, [outline, selectedEdge, openEdgeIndices, draftOpenings]);

  const handleRemoveSelectedCorner = useCallback(() => {
    if (outline.length < 4) return;
    const r = deleteFloorVertex(
      outline,
      selectedEdge,
      openEdgeIndices,
      draftOpenings,
    );
    if (!r) return;
    setOutline(r.outline);
    setOpenEdgeIndices(r.openEdgeIndices);
    setDraftOpenings(r.openings);
    setOutlineFreeform(true);
    setSelectedOpeningId(null);
    setSelectedEdge((s) => Math.min(s, Math.max(0, r.outline.length - 1)));
  }, [outline, selectedEdge, openEdgeIndices, draftOpenings]);

  const handleRemoveSelectedOpening = useCallback(() => {
    if (!selectedOpeningId) return;
    setDraftOpenings((p) => p.filter((o) => o.id !== selectedOpeningId));
    setSelectedOpeningId(null);
  }, [selectedOpeningId]);

  const handleChamferSelectedCorner = useCallback(() => {
    if (outline.length < 3) return;
    const r = chamferFloorVertex(
      outline,
      selectedEdge,
      chamferCutDepthM,
      openEdgeIndices,
      draftOpenings,
    );
    if (!r) return;
    setOutline(r.outline);
    setOpenEdgeIndices(r.openEdgeIndices);
    setDraftOpenings(r.openings);
    setOutlineFreeform(true);
    setSelectedEdge((s) => Math.min(s, Math.max(0, r.outline.length - 1)));
  }, [
    outline,
    selectedEdge,
    chamferCutDepthM,
    openEdgeIndices,
    draftOpenings,
  ]);

  const showLeg = selectedShape === "l_in" || selectedShape === "open_l";
  const showChamfer = selectedShape === "chamfer";

  return (
    <div className="kitchen-setup-wizard">
      <div className="kitchen-setup-panel">
        {phase === "shape" && (
          <>
            <header className="kitchen-setup-header">
              <div>
                <h1 className="kitchen-setup-title">Change your shape</h1>
                <p className="kitchen-setup-sub">{shapeStepSubtitle}</p>
              </div>
              <div className="kitchen-setup-header__actions">
                <LengthUnitToggle className="kitchen-wizard-unit-toggle" />
                <button type="button" className="kitchen-setup-close" onClick={onSkip} aria-label="Close">
                  <X size={22} />
                </button>
              </div>
            </header>

            <section className="kitchen-setup-section">
              <h2 className="kitchen-setup-section-title">Enclosed kitchen space</h2>
              <div className="kitchen-shape-grid">
                {SHAPES_ENCLOSED.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`kitchen-shape-card ${selectedShape === s.id ? "selected" : ""}`}
                    onClick={() => handlePickShape(s.id)}
                    title={s.hint}
                  >
                    <ShapeIcon shapeId={s.id} />
                    <span className="kitchen-shape-label">{s.label}</span>
                    {selectedShape === s.id && (
                      <span className="kitchen-shape-check">
                        <Check size={14} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>

            <section className="kitchen-setup-section">
              <h2 className="kitchen-setup-section-title">Open kitchen space</h2>
              <div className="kitchen-shape-grid">
                {SHAPES_OPEN.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`kitchen-shape-card ${selectedShape === s.id ? "selected" : ""}`}
                    onClick={() => handlePickShape(s.id)}
                    title={s.hint}
                  >
                    <ShapeIcon shapeId={s.id} />
                    <span className="kitchen-shape-label">{s.label}</span>
                    {selectedShape === s.id && (
                      <span className="kitchen-shape-check">
                        <Check size={14} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        {phase === "layout" && selectedShape && (
          <>
            <div className="kitchen-plan-shell">
              <header className="kitchen-plan-topbar">
                <button type="button" className="kitchen-setup-back kitchen-plan-back" onClick={() => setPhase("shape")}>
                  <ChevronLeft size={18} />
                  <span>Room shape</span>
                </button>
                <div className="kitchen-plan-topbar__center">
                  <p className="kitchen-plan-breadcrumb">
                    <span>1. Shape</span>
                    <span aria-hidden className="kitchen-plan-breadcrumb__sep">
                      /
                    </span>
                    <span className="kitchen-plan-breadcrumb--current">2. Floor plan</span>
                  </p>
                  <h1 className="kitchen-plan-heading">Draw your room</h1>
                  <p className="kitchen-plan-lede">{layoutStepSubtitle}</p>
                </div>
                <div className="kitchen-plan-topbar__end">
                  <LengthUnitToggle className="kitchen-wizard-unit-toggle" />
                  <button
                    type="button"
                    className="kitchen-setup-close kitchen-plan-close"
                    onClick={onSkip}
                    aria-label="Close"
                  >
                    <X size={22} />
                  </button>
                </div>
              </header>

              <div className="kitchen-layout-body kitchen-layout-body--plan">
                <div className="kitchen-plan-board">
                  <div className="kitchen-plan-board__label">
                    <span className="kitchen-plan-board__label-text">Top view · 2D</span>
                  </div>
                  <div className="kitchen-plan-board__sheet">
                    {outline.length >= 3 ? (
                      <KitchenFloorPlanSvg
                        outline={outline}
                        openEdgeIndices={openEdgeIndices}
                        openings={draftOpenings}
                        selectedEdge={selectedEdge}
                        onSelectEdge={setSelectedEdge}
                        lengthUnit={lengthUnit}
                        areaSqFtLabel={areaLabel}
                        roomTitle="Area 1"
                        enableResizeDrag={!outlineFreeform}
                        onResizeDragDelta={handleResizeDragDelta}
                        enableCornerDrag={showCornerHandles}
                        onCornerDragDelta={
                          showCornerHandles ? handleCornerDragDelta : undefined
                        }
                        onCornerDragEnd={
                          showCornerHandles ? handleCornerDragEnd : undefined
                        }
                        interactiveOpenings={showOpeningsUi}
                        selectedOpeningId={selectedOpeningId}
                        onSelectOpening={setSelectedOpeningId}
                        onOpeningPositionChange={
                          showOpeningsUi
                            ? (id, pos) => {
                                setDraftOpenings((prev) =>
                                  prev.map((o) => {
                                    if (o.id !== id) return o;
                                    const len = getOpeningWallLengthM(o, openingRoomStub);
                                    const clamped = clampPositionValue(
                                      pos,
                                      len,
                                      o.width,
                                    );
                                    return { ...o, position: clamped };
                                  }),
                                );
                              }
                            : undefined
                        }
                      />
                    ) : null}
                  </div>
                  <details className="kitchen-plan-help">
                    <summary>How to edit the plan</summary>
                    <ul>
                      <li>
                        Turn <strong>Show corner handles</strong> on to drag <strong>white diamonds</strong>{" "}
                        and move walls. Drop a corner on another to merge (fewer corners).
                      </li>
                      <li>
                        <strong>Cut corner</strong> chamfers the vertex at the <strong>start</strong> of the wall
                        you selected (adds a short angled wall).
                      </li>
                      <li>
                        Click a wall to select it, then add a <strong>door</strong> or <strong>window</strong>.
                        Drag the opening on the plan to slide it along the wall; select it to remove from the list.
                      </li>
                      <li>
                        <strong>Add corner</strong> splits the selected wall in the middle.{" "}
                        <strong>Remove corner</strong> deletes the vertex at the start of that wall (needs 4+
                        corners).
                      </li>
                      <li>
                        Use <strong>blue dots</strong> on dimensions to resize by the template (hidden while the
                        outline is custom).
                      </li>
                      <li>
                        <strong>Reset to template</strong> or move a slider to snap back to the chosen room shape.
                      </li>
                    </ul>
                  </details>
                </div>

                <aside className="kitchen-plan-sidebar" aria-label="Room settings">
                  <h2 className="kitchen-plan-sidebar__title">Settings</h2>

                  <div className="kitchen-freeform-actions kitchen-plan-reset-row">
                    <button
                      type="button"
                      className="btn-kitchen-reset-outline"
                      disabled={!outlineFreeform}
                      onClick={() => setOutlineFreeform(false)}
                    >
                      Reset to template
                    </button>
                    {outlineFreeform && <span className="kitchen-freeform-badge">Custom outline</span>}
                  </div>

                  <div className="kitchen-plan-section">
                    <h3 className="kitchen-plan-section__label">Room size</h3>
                <label className="kitchen-field">
                  <span>Main span ({lengthUnitSuffix(lengthUnit)})</span>
                  <input
                    type="range"
                    min={2.5}
                    max={8}
                    step={0.05}
                    value={spanM}
                    onChange={(e) => {
                      setOutlineFreeform(false);
                      setSpanM(Number(e.target.value));
                    }}
                  />
                  <span className="kitchen-field-val">{formatLengthLabel(spanM, lengthUnit)}</span>
                </label>
                {showLeg && (
                  <label className="kitchen-field">
                    <span>Leg / notch depth</span>
                    <input
                      type="range"
                      min={0.5}
                      max={Math.max(0.6, spanM * 0.45)}
                      step={0.05}
                      value={legCutM}
                      onChange={(e) => {
                        setOutlineFreeform(false);
                        setLegCutM(Number(e.target.value));
                      }}
                    />
                    <span className="kitchen-field-val">{formatLengthLabel(legCutM, lengthUnit)}</span>
                  </label>
                )}
                {showChamfer && (
                  <label className="kitchen-field">
                    <span>Chamfer size</span>
                    <input
                      type="range"
                      min={0.3}
                      max={Math.max(0.4, spanM * 0.35)}
                      step={0.05}
                      value={chamferM}
                      onChange={(e) => {
                        setOutlineFreeform(false);
                        setChamferM(Number(e.target.value));
                      }}
                    />
                    <span className="kitchen-field-val">{formatLengthLabel(chamferM, lengthUnit)}</span>
                  </label>
                )}
                  </div>

                <div className="kitchen-plan-section">
                  <h3 className="kitchen-plan-section__label">Corners</h3>
                  <label className="kitchen-field kitchen-field--checkbox">
                    <input
                      type="checkbox"
                      checked={showCornerHandles}
                      onChange={(e) => setShowCornerHandles(e.target.checked)}
                    />
                    <span>Show corner handles on plan</span>
                  </label>
                  <p className="kitchen-corner-hint">
                    Uses the wall you pick under <strong>Walls</strong>: the cut is at vertex V
                    {outline.length >= 3 ? selectedEdge + 1 : "—"} (start of that wall, CCW).
                  </p>
                  <label className="kitchen-field">
                    <span>Chamfer / cut depth</span>
                    <DraftLengthInput
                      key={`chamfer-cut-${lengthUnit}`}
                      meters={chamferCutDepthM}
                      lengthUnit={lengthUnit}
                      minM={0.12}
                      maxM={1.5}
                      onCommit={(m) => setChamferCutDepthM(m)}
                      onLiveChange={(m) => setChamferCutDepthM(m)}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn-kitchen-cut-corner"
                    disabled={outline.length < 3}
                    onClick={handleChamferSelectedCorner}
                  >
                    Cut selected corner
                  </button>
                  <div className="kitchen-floor-shape-tools">
                    <button
                      type="button"
                      className="btn-kitchen-shape-tool"
                      disabled={outline.length < 3}
                      onClick={handleSplitSelectedWall}
                    >
                      Add corner (split wall)
                    </button>
                    <button
                      type="button"
                      className="btn-kitchen-shape-tool btn-kitchen-shape-tool--danger"
                      disabled={outline.length < 4}
                      onClick={handleRemoveSelectedCorner}
                      title="Removes vertex V at the start of the selected wall"
                    >
                      Remove corner
                    </button>
                  </div>
                  {showOpeningsUi && selectedOpeningId ? (
                    <button
                      type="button"
                      className="btn-kitchen-remove-opening"
                      onClick={handleRemoveSelectedOpening}
                    >
                      Remove selected door / window
                    </button>
                  ) : null}
                </div>

                <div className="kitchen-plan-section">
                  <h3 className="kitchen-plan-section__label">Walls</h3>
                <div className="kitchen-edge-list">
                  <span className="kitchen-edge-list-title">Select a wall</span>
                  <ul>
                    {outline.map((_, ei) => {
                      const len = edgeLength(outline, ei);
                      const open = openEdgeIndices.includes(ei);
                      return (
                        <li key={ei}>
                          <button
                            type="button"
                            className={selectedEdge === ei ? "active" : ""}
                            onClick={() => setSelectedEdge(ei)}
                          >
                            Edge {ei + 1}: {formatLengthLabel(len, lengthUnit)}
                            {open ? " (open)" : ""}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                </div>

                {showOpeningsUi && (
                  <>
                    <div className="kitchen-plan-section">
                      <h3 className="kitchen-plan-section__label">Doors &amp; windows</h3>
                    <div className="kitchen-open-actions">
                      <button
                        type="button"
                        className="btn-kitchen-door"
                        onClick={() => handleAddOpening("door")}
                      >
                        + Door on selected edge
                      </button>
                      <button
                        type="button"
                        className="btn-kitchen-window"
                        onClick={() => handleAddOpening("window")}
                      >
                        + Window on selected edge
                      </button>
                    </div>

                    {draftOpenings.length > 0 && (
                      <ul className="kitchen-openings-list">
                        {draftOpenings.map((o) => {
                          const wallLen = getOpeningWallLengthM(o, openingRoomStub);
                          const h = o.height ?? defaultOpeningHeight(o.type);
                          const nV = outline.length;
                          const ei = o.edgeIndex ?? 0;
                          const v0 = nV > 0 ? `V${ei + 1}` : "V0";
                          const v1 = nV > 0 ? `V${((ei + 1) % nV) + 1}` : "V1";
                          const dLeftM = leftEdgeFromCornerM(o.position, wallLen, o.width);
                          const dRightM = rightEdgeFromCornerM(o.position, wallLen, o.width);
                          const expanded = openingEditorExpandedId === o.id;
                          return (
                            <li key={o.id} className="kitchen-opening-item">
                              <div className="kitchen-opening-item__head">
                                <button
                                  type="button"
                                  className="kitchen-opening-item__toggle"
                                  onClick={() =>
                                    setOpeningEditorExpandedId(expanded ? null : o.id)
                                  }
                                >
                                  {o.type} on edge {ei + 1} · {formatLengthLabel(o.width, lengthUnit)}{" "}
                                  × {formatLengthLabel(h, lengthUnit)}
                                </button>
                                <button
                                  type="button"
                                  className="link-remove"
                                  onClick={() => {
                                    setDraftOpenings((p) => p.filter((x) => x.id !== o.id));
                                    if (openingEditorExpandedId === o.id) {
                                      setOpeningEditorExpandedId(null);
                                    }
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                              {expanded && outline.length >= 3 && (
                                <div className="kitchen-opening-item__fields">
                                  <label className="kitchen-field kitchen-field--compact">
                                    <span>Edge</span>
                                    <select
                                      value={ei}
                                      onChange={(e) => {
                                        const edgeIndex = Number(e.target.value);
                                        const lenE = edgeLength(outline, edgeIndex);
                                        setDraftOpenings((p) =>
                                          p.map((x) => {
                                            if (x.id !== o.id) return x;
                                            const pos = clampPositionValue(
                                              x.position,
                                              lenE,
                                              x.width,
                                            );
                                            return { ...x, edgeIndex, position: pos };
                                          }),
                                        );
                                      }}
                                      className="kitchen-opening-edge-select"
                                    >
                                      {outline.map((_, ge) => {
                                        const lenGe = edgeLength(outline, ge);
                                        return (
                                          <option key={ge} value={ge}>
                                            Edge {ge + 1} · {formatLengthLabel(lenGe, lengthUnit)}
                                          </option>
                                        );
                                      })}
                                    </select>
                                  </label>
                                  <div className="kitchen-opening-grid">
                                    <label className="kitchen-field kitchen-field--compact">
                                      <span>Width ({lengthUnitSuffix(lengthUnit)})</span>
                                      <DraftLengthInput
                                        key={`${o.id}-w-${lengthUnit}`}
                                        meters={o.width}
                                        lengthUnit={lengthUnit}
                                        minM={OPENING_WIDTH_MIN_M}
                                        maxM={OPENING_WIDTH_MAX_M}
                                        onCommit={(newW) => {
                                          setDraftOpenings((p) =>
                                            p.map((x) => {
                                              if (x.id !== o.id) return x;
                                              const lenE = getOpeningWallLengthM(x, openingRoomStub);
                                              const pos = clampPositionValue(x.position, lenE, newW);
                                              return { ...x, width: newW, position: pos };
                                            }),
                                          );
                                        }}
                                        onLiveChange={(newW) => {
                                          setDraftOpenings((p) =>
                                            p.map((x) => {
                                              if (x.id !== o.id) return x;
                                              const lenE = getOpeningWallLengthM(x, openingRoomStub);
                                              const pos = clampPositionValue(x.position, lenE, newW);
                                              return { ...x, width: newW, position: pos };
                                            }),
                                          );
                                        }}
                                      />
                                    </label>
                                    <label className="kitchen-field kitchen-field--compact">
                                      <span>Height ({lengthUnitSuffix(lengthUnit)})</span>
                                      <DraftLengthInput
                                        key={`${o.id}-h-${lengthUnit}`}
                                        meters={h}
                                        lengthUnit={lengthUnit}
                                        minM={OPENING_HEIGHT_MIN_M}
                                        maxM={ROOM_HEIGHT_MAX_M}
                                        onCommit={(m) => {
                                          setDraftOpenings((p) =>
                                            p.map((x) =>
                                              x.id === o.id ? { ...x, height: m } : x,
                                            ),
                                          );
                                        }}
                                        onLiveChange={(m) => {
                                          setDraftOpenings((p) =>
                                            p.map((x) =>
                                              x.id === o.id ? { ...x, height: m } : x,
                                            ),
                                          );
                                        }}
                                      />
                                    </label>
                                    <label className="kitchen-field kitchen-field--compact">
                                      <span>
                                        From {v0} ({lengthUnitSuffix(lengthUnit)})
                                      </span>
                                      <DraftLengthInput
                                        key={`${o.id}-dl-${lengthUnit}`}
                                        meters={dLeftM}
                                        lengthUnit={lengthUnit}
                                        minM={0}
                                        maxM={Math.max(0, wallLen - o.width)}
                                        onCommit={(dLeft) => {
                                          const pos = positionFromLeftEdgeM(dLeft, wallLen, o.width);
                                          setDraftOpenings((p) =>
                                            p.map((x) =>
                                              x.id === o.id ? { ...x, position: pos } : x,
                                            ),
                                          );
                                        }}
                                        onLiveChange={(dLeft) => {
                                          const pos = positionFromLeftEdgeM(dLeft, wallLen, o.width);
                                          setDraftOpenings((p) =>
                                            p.map((x) =>
                                              x.id === o.id ? { ...x, position: pos } : x,
                                            ),
                                          );
                                        }}
                                      />
                                    </label>
                                    <label className="kitchen-field kitchen-field--compact">
                                      <span>
                                        From {v1} ({lengthUnitSuffix(lengthUnit)})
                                      </span>
                                      <DraftLengthInput
                                        key={`${o.id}-dr-${lengthUnit}`}
                                        meters={dRightM}
                                        lengthUnit={lengthUnit}
                                        minM={0}
                                        maxM={Math.max(0, wallLen - o.width)}
                                        onCommit={(dRight) => {
                                          const pos = positionFromRightEdgeM(dRight, wallLen, o.width);
                                          setDraftOpenings((p) =>
                                            p.map((x) =>
                                              x.id === o.id ? { ...x, position: pos } : x,
                                            ),
                                          );
                                        }}
                                        onLiveChange={(dRight) => {
                                          const pos = positionFromRightEdgeM(dRight, wallLen, o.width);
                                          setDraftOpenings((p) =>
                                            p.map((x) =>
                                              x.id === o.id ? { ...x, position: pos } : x,
                                            ),
                                          );
                                        }}
                                      />
                                    </label>
                                  </div>
                                  <label className="kitchen-field kitchen-field--compact">
                                    <span>
                                      Position along edge ({v0} → {v1})
                                    </span>
                                    <input
                                      type="range"
                                      min={-1}
                                      max={1}
                                      step={0.05}
                                      value={o.position}
                                      onChange={(e) => {
                                        const raw = parseFloat(e.target.value);
                                        const pos = clampPositionValue(raw, wallLen, o.width);
                                        setDraftOpenings((p) =>
                                          p.map((x) =>
                                            x.id === o.id ? { ...x, position: pos } : x,
                                          ),
                                        );
                                      }}
                                      className="kitchen-opening-slider"
                                    />
                                  </label>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    </div>
                  </>
                )}

                <button type="button" className="kitchen-continue-btn" onClick={handleContinue}>
                  {continueButtonLabel}
                </button>
              </aside>
            </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
