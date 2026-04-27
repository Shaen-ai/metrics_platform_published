"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePlannerStore, roomTemplates } from "../store/usePlannerStore";
import { usePlannerType } from "../context";
import type { RoomTemplate } from "../data/roomTemplates";
import type { Opening, Room, RoomBeam } from "../types";
import {
  type CeilingHeightAnchor,
  type CeilingSlopeAxis,
  type CeilingTripleM,
  inferSlopeAxis,
  roomFromTriple,
  tripleFromRoom,
  tripleIsCoplanarAlongAxis,
} from "../utils/ceilingSlopeFromHeights";
import { maxCeilingY } from "../utils/roomCeiling";
import { X, Trash2, DoorOpen, Square, Edit2, ChevronDown } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import {
  clampOpeningsForRoom,
  clampOpeningsToCeilingCap,
  clampPositionValue,
  computeWindowClearance,
  defaultOpeningHeight,
  distanceAlongWallFromCornerToCenterM,
  distanceAlongWallFromCornerToNearestEdgeM,
  getOpeningWallLengthM,
  getWallLength,
  leftEdgeFromCornerM,
  OPENING_HEIGHT_MIN_M,
  OPENING_WIDTH_MAX_M,
  OPENING_WIDTH_MIN_M,
  positionFromDistanceAlongWallToCenterM,
  positionFromDistanceAlongWallToNearestEdgeM,
  positionFromLeftEdgeM,
  positionFromRightEdgeM,
  rightEdgeFromCornerM,
} from "../utils/openings";
import { edgeLength, roomUsesFloorOutline } from "../utils/floorOutline";
import {
  ceilingAlongRunLabels,
  ceilingPerpLabels,
  fromCornerAlongEdge,
  wallBeamEdgeLabel,
  wallBeamReferenceCorner,
  wallOpeningCornerLeft,
  wallOpeningCornerRight,
} from "../utils/roomCorners";
import {
  formatLengthLabel,
  roomFootprintLabel,
  ROOM_HEIGHT_MAX_M,
  ROOM_HEIGHT_MIN_M,
  ROOM_PLAN_MAX_M,
  ROOM_PLAN_MIN_M,
} from "../utils/units";
import LengthUnitToggle from "./LengthUnitToggle";
import { DraftLengthInput } from "./DraftNumberFields";

const ROOM_STYLE_PRESETS: { label: string; tags: string[] }[] = [
  { label: "Scandinavian", tags: ["Scandinavian", "Light", "Natural wood"] },
  { label: "Industrial", tags: ["Industrial", "Raw", "Metal accents"] },
  { label: "Modern", tags: ["Modern", "Minimalist", "Clean lines"] },
  { label: "Traditional", tags: ["Traditional", "Warm", "Classic"] },
  { label: "Bohemian", tags: ["Bohemian", "Eclectic", "Textured"] },
];

export default function RoomDesigner() {
  const plannerConfig = usePlannerType();
  const showRoomDesigner = usePlannerStore((s) => s.showRoomDesigner);
  const setShowRoomDesigner = usePlannerStore((s) => s.setShowRoomDesigner);
  const room = usePlannerStore((s) => s.room);
  const setRoom = usePlannerStore((s) => s.setRoom);
  const addOpening = usePlannerStore((s) => s.addOpening);
  const removeOpening = usePlannerStore((s) => s.removeOpening);
  const addBeam = usePlannerStore((s) => s.addBeam);
  const updateBeam = usePlannerStore((s) => s.updateBeam);
  const removeBeam = usePlannerStore((s) => s.removeBeam);
  const setRoomStyleTags = usePlannerStore((s) => s.setRoomStyleTags);
  const lengthUnit = usePlannerStore((s) => s.ui.lengthUnit);

  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [editingOpening, setEditingOpening] = useState<string | null>(null);
  const [addDoorWall, setAddDoorWall] = useState<Opening["wall"]>("front");
  const [addWindowWall, setAddWindowWall] = useState<Opening["wall"]>("back");
  const [addDoorEdgeIndex, setAddDoorEdgeIndex] = useState(0);
  const [addWindowEdgeIndex, setAddWindowEdgeIndex] = useState(0);
  const [advancedPositionId, setAdvancedPositionId] = useState<string | null>(null);
  const [editingBeamId, setEditingBeamId] = useState<string | null>(null);
  const [templatesSectionOpen, setTemplatesSectionOpen] = useState(false);
  const hasCeilingSlope = useMemo(() => {
    const sx = room.ceilingSlopeX ?? 0;
    const sz = room.ceilingSlopeZ ?? 0;
    return (
      Math.abs(sx) > 1e-8 || Math.abs(sz) > 1e-8 || room.ceilingRidgeAxis !== undefined
    );
  }, [room.ceilingSlopeX, room.ceilingSlopeZ, room.ceilingRidgeAxis]);

  const inferredSlopeDirection = useMemo(
    () =>
      inferSlopeAxis({
        ceilingSlopeX: room.ceilingSlopeX,
        ceilingSlopeZ: room.ceilingSlopeZ,
        ceilingRidgeAxis: room.ceilingRidgeAxis,
      }),
    [room.ceilingSlopeX, room.ceilingSlopeZ, room.ceilingRidgeAxis]
  );

  const [userWantsSlopedUi, setUserWantsSlopedUi] = useState(false);
  const slopedCeilingUi = hasCeilingSlope || userWantsSlopedUi;

  const [userSlopeDirection, setUserSlopeDirection] = useState<CeilingSlopeAxis>("x");
  const slopeDirection = hasCeilingSlope ? inferredSlopeDirection : userSlopeDirection;

  const [heightAnchor, setHeightAnchor] = useState<CeilingHeightAnchor>("middle");
  const [slopeClampWarning, setSlopeClampWarning] = useState(false);

  useEffect(() => {
    if (!slopeClampWarning) return;
    const t = setTimeout(() => setSlopeClampWarning(false), 4500);
    return () => clearTimeout(t);
  }, [slopeClampWarning]);

  const filteredTemplates = useMemo(() => {
    if (!plannerConfig || plannerConfig.id === "room") return roomTemplates;
    return roomTemplates.filter(
      (t) => !t.plannerTypes || t.plannerTypes.includes(plannerConfig.id)
    );
  }, [plannerConfig]);

  const handleSelectTemplate = (template: RoomTemplate) => {
    setSelectedTemplate(template.id);
    setRoom({ ...template.room });
  };

  const handleAddOpening = (type: "door" | "window", wall: Opening["wall"], edgeIndex?: number) => {
    const newOpening: Opening = {
      id: uuidv4(),
      type,
      wall,
      position: 0,
      width: type === "door" ? 0.9 : 1.5,
      height: type === "door" ? 2.1 : 1.2,
      ...(edgeIndex !== undefined ? { edgeIndex } : {}),
    };
    addOpening(newOpening);
  };

  const setRoomWidthClamped = (w: number) => {
    const next = { ...room, width: w };
    setRoom({ ...next, openings: clampOpeningsForRoom(next) });
  };

  const setRoomDepthClamped = (d: number) => {
    const next = { ...room, depth: d };
    setRoom({ ...next, openings: clampOpeningsForRoom(next) });
  };

  const applyRoomHeight = useCallback(
    (nextH: number) => {
      if (!slopedCeilingUi) {
        const openings = clampOpeningsToCeilingCap(room.openings, nextH);
        setRoom({ ...room, height: nextH, openings });
        return;
      }
      const t = tripleFromRoom(room, slopeDirection);
      const merged: CeilingTripleM = {
        d: heightAnchor === "d" ? nextH : t.d,
        middle: heightAnchor === "middle" ? nextH : t.middle,
        a: heightAnchor === "a" ? nextH : t.a,
      };
      const { room: next, slopeClamped } = roomFromTriple(room, merged, slopeDirection);
      setSlopeClampWarning(slopeClamped);
      const cap = maxCeilingY(next);
      const openings = clampOpeningsToCeilingCap(next.openings, cap);
      setRoom({ ...next, openings });
    },
    [
      slopedCeilingUi,
      room,
      slopeDirection,
      heightAnchor,
      setRoom,
    ]
  );

  const applySlopedTripleSlot = useCallback(
    (slot: CeilingHeightAnchor, valueM: number) => {
      const t = tripleFromRoom(room, slopeDirection);
      const merged: CeilingTripleM = { ...t, [slot]: valueM };
      const { room: next, slopeClamped } = roomFromTriple(room, merged, slopeDirection);
      setSlopeClampWarning(slopeClamped);
      const cap = maxCeilingY(next);
      const openings = clampOpeningsToCeilingCap(next.openings, cap);
      setRoom({ ...next, openings });
    },
    [room, slopeDirection, setRoom]
  );

  const tripleM = useMemo(
    () => tripleFromRoom(room, slopeDirection),
    [room, slopeDirection]
  );

  const slopedProfileIsSinglePlane = useMemo(
    () => tripleIsCoplanarAlongAxis(tripleM),
    [tripleM]
  );

  const mainHeightMeters = slopedCeilingUi ? tripleM[heightAnchor] : room.height;

  const anchorHeightLabel = useMemo(() => {
    if (!slopedCeilingUi) return `Height (${lengthUnit})`;
    const point =
      heightAnchor === "middle"
        ? "room center"
        : heightAnchor === "d"
          ? "D"
          : "A";
    return `Height (${lengthUnit}) at ${point}`;
  }, [slopedCeilingUi, lengthUnit, heightAnchor]);

  const otherHeightSlots = useMemo(() => {
    return (["d", "middle", "a"] as const).filter((s) => s !== heightAnchor);
  }, [heightAnchor]);

  const slotLabel = useCallback(
    (slot: CeilingHeightAnchor) => {
      if (slopeDirection === "x") {
        if (slot === "d") return "D (vertical) — left wall center";
        if (slot === "a") return "A (vertical) — right wall center";
        return "Middle (vertical) — room center";
      }
      if (slot === "d") return "D (vertical) — back wall center";
      if (slot === "a") return "A (vertical) — front wall center";
      return "Middle (vertical) — room center";
    },
    [slopeDirection]
  );

  if (!showRoomDesigner) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex justify-end pointer-events-none">
      <div className="pointer-events-auto flex h-full w-[min(100%,22rem)] max-w-[22rem] flex-col border-l border-[#F0E6D8] bg-white shadow-[-8px_0_24px_rgba(0,0,0,0.08)] sm:w-[min(100%,26rem)] sm:max-w-[26rem]">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#F0E6D8] px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-tight">Room Designer</h2>
            <p className="mt-0.5 text-[11px] leading-snug text-[#6B7280] sm:text-xs">
              3D view stays visible; edits apply live.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <LengthUnitToggle />
            <button
              type="button"
              onClick={() => setShowRoomDesigner(false)}
              className="rounded-xl p-2 transition-colors hover:bg-[#FEF3E7]"
              title="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4">
          <section className="mb-5 rounded-xl border border-[#F0E6D8] overflow-hidden">
            <button
              type="button"
              onClick={() => setTemplatesSectionOpen((o) => !o)}
              aria-expanded={templatesSectionOpen}
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[#FEF3E7]"
            >
              <span className="text-sm font-semibold text-[#1A1A1A]">Room Templates</span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-[#6B7280] transition-transform ${
                  templatesSectionOpen ? "rotate-180" : ""
                }`}
                aria-hidden
              />
            </button>
            {templatesSectionOpen && (
              <div className="space-y-2 border-t border-[#F0E6D8] bg-[#FFFCF8] p-2.5">
                {filteredTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => handleSelectTemplate(template)}
                    className={`w-full rounded-lg border-2 p-2.5 text-left text-sm transition-all ${
                      selectedTemplate === template.id
                        ? "border-[#E8772E] bg-[#FEF3E7]"
                        : "border-[#F0E6D8] hover:border-[#E8772E]/40"
                    }`}
                  >
                    <div className="font-semibold leading-snug">{template.name}</div>
                    <p className="mt-0.5 text-xs leading-snug text-[#6B7280]">
                      {template.description}
                    </p>
                    <div className="mt-1 text-[11px] text-[#9CA3AF]">
                      {roomFootprintLabel(template.room.width, template.room.depth, lengthUnit)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="mb-6">
            <h3 className="mb-2 text-sm font-semibold">Room style</h3>
            <p className="mb-2 text-[11px] leading-relaxed text-[#6B7280]">
              Labels are saved with your planner session. Choosing a <strong>room template</strong> above replaces
              the whole room and clears these tags.
            </p>
            {room.roomStyleTags && room.roomStyleTags.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-1">
                {room.roomStyleTags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-[#FEF3E7] px-2 py-0.5 text-xs font-medium text-[#92400e]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mb-2 text-xs text-[#9CA3AF]">No style tags — choose a preset if needed.</p>
            )}
            <div className="mb-2 flex flex-wrap gap-1.5">
              {ROOM_STYLE_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setRoomStyleTags(p.tags)}
                  className="rounded-full border border-[#F0E6D8] bg-white px-2.5 py-1 text-xs font-medium text-[#374151] transition-colors hover:border-[#E8772E]/50 hover:bg-[#FEF3E7]"
                >
                  {p.label}
                </button>
              ))}
            </div>
            {room.roomStyleTags && room.roomStyleTags.length > 0 ? (
              <button
                type="button"
                onClick={() => setRoomStyleTags(undefined)}
                className="text-xs font-medium text-[#E8772E] underline-offset-2 hover:underline"
              >
                Clear style
              </button>
            ) : null}
          </section>

          <section className="mb-6">
            <h3 className="mb-2 text-sm font-semibold">Room Dimensions</h3>
            <p className="mb-3 text-xs leading-relaxed text-[#6B7280]">
              <strong>A–D</strong> on the floor match this panel: A back-left, B back-right, C front-right,
              D front-left. Distances follow those corners and update if the room size changes.
            </p>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Width ({lengthUnit})
                </label>
                <DraftLengthInput
                  key={`rw-${lengthUnit}`}
                  meters={room.width}
                  lengthUnit={lengthUnit}
                  minM={ROOM_PLAN_MIN_M}
                  maxM={ROOM_PLAN_MAX_M}
                  onCommit={setRoomWidthClamped}
                  onLiveChange={setRoomWidthClamped}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Depth ({lengthUnit})
                </label>
                <DraftLengthInput
                  key={`rd-${lengthUnit}`}
                  meters={room.depth}
                  lengthUnit={lengthUnit}
                  minM={ROOM_PLAN_MIN_M}
                  maxM={ROOM_PLAN_MAX_M}
                  onCommit={setRoomDepthClamped}
                  onLiveChange={setRoomDepthClamped}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{anchorHeightLabel}</label>
                {slopedCeilingUi && (
                  <p className="mb-2 text-[11px] leading-snug text-[#6B7280]">
                    {slopeDirection === "x"
                      ? "D = left wall center, A = right wall center (along width)."
                      : "D = back wall center, A = front wall center (along depth)."}
                  </p>
                )}
                <DraftLengthInput
                  key={`rh-${lengthUnit}-${slopedCeilingUi ? heightAnchor : "flat"}`}
                  meters={mainHeightMeters}
                  lengthUnit={lengthUnit}
                  minM={ROOM_HEIGHT_MIN_M}
                  maxM={ROOM_HEIGHT_MAX_M}
                  onCommit={applyRoomHeight}
                  onLiveChange={applyRoomHeight}
                />
              </div>
            </div>
          </section>

          <section className="mb-6">
            <h3 className="mb-2 text-sm font-semibold">Ceiling slope</h3>
            <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-[#F0E6D8] text-[#E8772E] focus:ring-[#E8772E]"
                checked={slopedCeilingUi}
                onChange={(e) => {
                  const on = e.target.checked;
                  setUserWantsSlopedUi(on);
                  if (!on) {
                    setRoom({
                      ...room,
                      ceilingSlopeX: 0,
                      ceilingSlopeZ: 0,
                      ceilingRidgeAxis: undefined,
                      ceilingRidgeD: undefined,
                      ceilingRidgeA: undefined,
                    });
                  }
                }}
              />
              <span>Sloped ceiling</span>
            </label>
            {slopedCeilingUi && (
              <>
                <p className="mb-3 text-xs leading-relaxed text-[#6B7280]">
                  Enter ceiling height at three points along the chosen axis: <strong>D</strong>,{" "}
                  <strong>middle</strong> (room center), and <strong>A</strong>. The main{" "}
                  <strong>Height</strong> field is one of them — pick which below — then set the other two
                  here. If middle equals the average of D and A, the ceiling is one{" "}
                  <strong>tilted plane</strong>. If not, it becomes a <strong>two-slope profile</strong>{" "}
                  (peak or valley at the center) automatically.
                </p>
                <div className="mb-3 space-y-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium">Slope runs along</label>
                    <select
                      className="w-full rounded-xl border border-[#F0E6D8] px-3 py-2 text-sm focus:border-[#E8772E] focus:outline-none focus:ring-1 focus:ring-[#E8772E]"
                      value={slopeDirection}
                      onChange={(e) => {
                        const next = e.target.value as CeilingSlopeAxis;
                        setUserSlopeDirection(next);
                        setRoom({
                          ...room,
                          ceilingSlopeX: 0,
                          ceilingSlopeZ: 0,
                          ceilingRidgeAxis: undefined,
                          ceilingRidgeD: undefined,
                          ceilingRidgeA: undefined,
                        });
                      }}
                    >
                      <option value="x">Width (left ↔ right)</option>
                      <option value="z">Depth (back ↔ front)</option>
                    </select>
                    <p className="mt-1 text-[11px] text-[#9CA3AF]">
                      Changing direction resets the ceiling profile; re-enter heights if needed.
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      Main Height field measures
                    </label>
                    <select
                      className="w-full rounded-xl border border-[#F0E6D8] px-3 py-2 text-sm focus:border-[#E8772E] focus:outline-none focus:ring-1 focus:ring-[#E8772E]"
                      value={heightAnchor}
                      onChange={(e) =>
                        setHeightAnchor(e.target.value as CeilingHeightAnchor)
                      }
                    >
                      <option value="middle">Middle (room center)</option>
                      <option value="d">D</option>
                      <option value="a">A</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-3">
                  {otherHeightSlots.map((slot) => (
                    <div key={slot}>
                      <label className="mb-2 block text-sm font-medium">{slotLabel(slot)}</label>
                      <DraftLengthInput
                        key={`ceiling-${slot}-${lengthUnit}-${slopeDirection}-${slopedProfileIsSinglePlane ? "plane" : "ridge"}`}
                        meters={tripleM[slot]}
                        lengthUnit={lengthUnit}
                        minM={ROOM_HEIGHT_MIN_M}
                        maxM={ROOM_HEIGHT_MAX_M}
                        onCommit={(m) => applySlopedTripleSlot(slot, m)}
                        onLiveChange={(m) => applySlopedTripleSlot(slot, m)}
                      />
                    </div>
                  ))}
                </div>
                {slopeClampWarning && (
                  <p className="mt-3 text-xs text-amber-800">
                    Slope was limited to the maximum allowed for beams and geometry. Ease the height
                    difference or widen the room.
                  </p>
                )}
              </>
            )}
          </section>

          <section className="mb-6">
            <div className="mb-3 flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Beams</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const t = 0.2;
                    const L = Math.min(2.2, room.width * 0.4);
                    addBeam({
                      id: uuidv4(),
                      surface: "wall",
                      wall: "back",
                      wallRun: "horizontal",
                      position: 0,
                      lengthM: L,
                      widthM: t,
                      depthM: t,
                    });
                  }}
                  className="px-4 py-1.5 text-sm bg-[#E8772E] text-white rounded-full hover:brightness-110 transition-all"
                >
                  Add wall beam
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const t = 0.2;
                    const L = Math.min(2.2, room.width * 0.4);
                    addBeam({
                      id: uuidv4(),
                      surface: "ceiling",
                      position: 0,
                      ceilingAxis: "x",
                      ceilingPerpPosition: 0,
                      lengthM: L,
                      widthM: t,
                      depthM: t,
                    });
                  }}
                  className="px-4 py-1.5 text-sm bg-[#6B7280] text-white rounded-full hover:brightness-110 transition-all"
                >
                  Add ceiling beam
                </button>
              </div>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-[#6B7280]">
              <strong>Wall:</strong> From that wall’s labeled corner along its edge (see wall options) to the beam{" "}
              <strong>center</strong>. <strong>Ceiling:</strong> Two offsets from <strong>A</strong>—along the
              beam’s <strong>run</strong> (A–B or A–D, per direction) and along the <strong>perpendicular</strong>{" "}
              edge—each to the <strong>nearest face</strong> of the beam; then set length, width, and depth.
            </p>
            {room.beams && room.beams.length > 0 ? (
              <div className="space-y-2">
                {room.beams.map((beam) => (
                  <div
                    key={beam.id}
                    className={`p-3 rounded-xl border-2 ${
                      editingBeamId === beam.id
                        ? "border-[#E8772E] bg-[#FEF3E7]"
                        : "bg-[#FFF8F0] border-[#F0E6D8]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium capitalize">
                        {beam.surface} beam
                        {beam.surface === "wall" && beam.wall
                          ? ` · ${beam.wall} · ${beam.wallRun === "vertical" ? "vertical" : "horizontal"}`
                          : ""}
                        {beam.surface === "ceiling" ? ` · ${beam.ceilingAxis ?? "x"}` : ""}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setEditingBeamId(editingBeamId === beam.id ? null : beam.id)
                          }
                          className="p-2 hover:bg-[#FEF3E7] rounded-xl text-[#E8772E] transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeBeam(beam.id)}
                          className="p-2 hover:bg-red-50 rounded-xl text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {editingBeamId === beam.id && (
                      <div className="mt-3 pt-3 border-t border-[#F0E6D8] grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {beam.surface === "wall" && beam.wall && (
                          <>
                            <div>
                              <label className="block text-sm font-medium mb-1">Wall</label>
                              <select
                                value={beam.wall}
                                onChange={(e) =>
                                  updateBeam(beam.id, {
                                    wall: e.target.value as RoomBeam["wall"],
                                  })
                                }
                                className="w-full px-3 py-2 border border-[#F0E6D8] rounded-xl"
                              >
                                <option value="front">Front · D–C</option>
                                <option value="back">Back · A–B</option>
                                <option value="left">Left · A–D</option>
                                <option value="right">Right · B–C</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-medium mb-1">Type</label>
                              <select
                                value={beam.wallRun ?? "horizontal"}
                                onChange={(e) => {
                                  const wallRun = e.target.value as "horizontal" | "vertical";
                                  if (wallRun === "horizontal") {
                                    updateBeam(beam.id, {
                                      wallRun,
                                      verticalBaseAboveFloorM: undefined,
                                    });
                                  } else {
                                    updateBeam(beam.id, {
                                      wallRun,
                                      horizontalBottomAboveFloorM: undefined,
                                    });
                                  }
                                }}
                                className="w-full px-3 py-2 border border-[#F0E6D8] rounded-xl"
                              >
                                <option value="horizontal">Horizontal beam</option>
                                <option value="vertical">Column</option>
                              </select>
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-sm font-medium mb-1">
                                {fromCornerAlongEdge(
                                  wallBeamReferenceCorner(beam.wall!),
                                  wallBeamEdgeLabel(beam.wall!)
                                )}{" "}
                                ({lengthUnit})
                              </label>
                              <DraftLengthInput
                                key={`${beam.id}-wdist-${lengthUnit}`}
                                meters={distanceAlongWallFromCornerToCenterM(
                                  beam.position,
                                  getWallLength(beam.wall!, room)
                                )}
                                lengthUnit={lengthUnit}
                                minM={0}
                                maxM={getWallLength(beam.wall!, room)}
                                onCommit={(distM) => {
                                  const wallLen = getWallLength(beam.wall!, room);
                                  const span =
                                    (beam.wallRun ?? "horizontal") === "vertical"
                                      ? beam.widthM
                                      : beam.lengthM;
                                  updateBeam(beam.id, {
                                    position: positionFromDistanceAlongWallToCenterM(
                                      distM,
                                      wallLen,
                                      span
                                    ),
                                  });
                                }}
                                onLiveChange={(distM) => {
                                  const wallLen = getWallLength(beam.wall!, room);
                                  const span =
                                    (beam.wallRun ?? "horizontal") === "vertical"
                                      ? beam.widthM
                                      : beam.lengthM;
                                  updateBeam(beam.id, {
                                    position: positionFromDistanceAlongWallToCenterM(
                                      distM,
                                      wallLen,
                                      span
                                    ),
                                  });
                                }}
                              />
                            </div>
                            {(beam.wallRun ?? "horizontal") === "horizontal" && (
                              <div className="sm:col-span-2 space-y-2 rounded-lg border border-[#F0E6D8] bg-[#FFFCF8] p-2.5">
                                <label className="flex cursor-pointer items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={beam.horizontalBottomAboveFloorM === undefined}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        updateBeam(beam.id, {
                                          horizontalBottomAboveFloorM: undefined,
                                        });
                                      } else {
                                        updateBeam(beam.id, {
                                          horizontalBottomAboveFloorM: 0.15,
                                        });
                                      }
                                    }}
                                    className="rounded border-[#F0E6D8]"
                                  />
                                  <span>Snap under ceiling</span>
                                </label>
                                {beam.horizontalBottomAboveFloorM !== undefined && (
                                  <div>
                                    <label className="mb-1 block text-xs font-medium text-[#374151]">
                                      Beam bottom above floor ({lengthUnit})
                                    </label>
                                    <DraftLengthInput
                                      key={`${beam.id}-hbf-${lengthUnit}`}
                                      meters={beam.horizontalBottomAboveFloorM}
                                      lengthUnit={lengthUnit}
                                      minM={0.02}
                                      maxM={room.height}
                                      onCommit={(m) =>
                                        updateBeam(beam.id, { horizontalBottomAboveFloorM: m })
                                      }
                                      onLiveChange={(m) =>
                                        updateBeam(beam.id, { horizontalBottomAboveFloorM: m })
                                      }
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                            {(beam.wallRun ?? "horizontal") === "vertical" && (
                              <div className="sm:col-span-2">
                                <label className="block text-sm font-medium mb-1">
                                  Column base above floor ({lengthUnit})
                                </label>
                                <DraftLengthInput
                                  key={`${beam.id}-vbase-${lengthUnit}`}
                                  meters={beam.verticalBaseAboveFloorM ?? 0}
                                  lengthUnit={lengthUnit}
                                  minM={0}
                                  maxM={room.height * 0.5}
                                  onCommit={(m) =>
                                    updateBeam(beam.id, {
                                      verticalBaseAboveFloorM: m <= 0.001 ? undefined : m,
                                    })
                                  }
                                  onLiveChange={(m) =>
                                    updateBeam(beam.id, {
                                      verticalBaseAboveFloorM: m <= 0.001 ? undefined : m,
                                    })
                                  }
                                />
                              </div>
                            )}
                            <div>
                              <label className="block text-sm font-medium mb-1">
                                {(beam.wallRun ?? "horizontal") === "vertical"
                                  ? `Height (${lengthUnit})`
                                  : `Length on wall (${lengthUnit})`}
                              </label>
                              <DraftLengthInput
                                key={`${beam.id}-wlen-${lengthUnit}`}
                                meters={beam.lengthM}
                                lengthUnit={lengthUnit}
                                minM={0.2}
                                maxM={50}
                                onCommit={(m) => updateBeam(beam.id, { lengthM: m })}
                                onLiveChange={(m) => updateBeam(beam.id, { lengthM: m })}
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium mb-1">
                                {(beam.wallRun ?? "horizontal") === "vertical"
                                  ? `Footprint width (${lengthUnit})`
                                  : `Thickness up (${lengthUnit})`}
                              </label>
                              <DraftLengthInput
                                key={`${beam.id}-ww-${lengthUnit}`}
                                meters={beam.widthM}
                                lengthUnit={lengthUnit}
                                minM={0.04}
                                maxM={2}
                                onCommit={(m) => updateBeam(beam.id, { widthM: m })}
                                onLiveChange={(m) => updateBeam(beam.id, { widthM: m })}
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium mb-1">
                                {`Depth (${lengthUnit})`}
                              </label>
                              <DraftLengthInput
                                key={`${beam.id}-wd-${lengthUnit}`}
                                meters={beam.depthM}
                                lengthUnit={lengthUnit}
                                minM={0.04}
                                maxM={2}
                                onCommit={(m) => updateBeam(beam.id, { depthM: m })}
                                onLiveChange={(m) => updateBeam(beam.id, { depthM: m })}
                              />
                            </div>
                          </>
                        )}
                        {beam.surface === "ceiling" &&
                          (() => {
                            const axis = beam.ceilingAxis ?? "x";
                            const run = ceilingAlongRunLabels(axis);
                            const cross = ceilingPerpLabels(axis);
                            const runLen = axis === "x" ? room.width : room.depth;
                            const perpLen = axis === "x" ? room.depth : room.width;
                            return (
                              <>
                                <div>
                                  <label className="block text-sm font-medium mb-1">
                                    Direction
                                  </label>
                                  <select
                                    value={axis}
                                    onChange={(e) =>
                                      updateBeam(beam.id, {
                                        ceilingAxis: e.target.value as "x" | "z",
                                        ceilingPerpPosition: 0,
                                      })
                                    }
                                    className="w-full px-3 py-2 border border-[#F0E6D8] rounded-xl"
                                  >
                                    <option value="x">Along A–B (room width)</option>
                                    <option value="z">Along A–D (room depth)</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-sm font-medium mb-1">
                                    {fromCornerAlongEdge(run.from, run.edge)} ({lengthUnit})
                                  </label>
                                  <DraftLengthInput
                                    key={`${beam.id}-cdist-${lengthUnit}`}
                                    meters={distanceAlongWallFromCornerToNearestEdgeM(
                                      beam.position,
                                      runLen,
                                      beam.lengthM
                                    )}
                                    lengthUnit={lengthUnit}
                                    minM={0}
                                    maxM={runLen}
                                    onCommit={(distM) => {
                                      updateBeam(beam.id, {
                                        position: positionFromDistanceAlongWallToNearestEdgeM(
                                          distM,
                                          runLen,
                                          beam.lengthM
                                        ),
                                      });
                                    }}
                                    onLiveChange={(distM) => {
                                      updateBeam(beam.id, {
                                        position: positionFromDistanceAlongWallToNearestEdgeM(
                                          distM,
                                          runLen,
                                          beam.lengthM
                                        ),
                                      });
                                    }}
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium mb-1">
                                    {fromCornerAlongEdge(cross.from, cross.edge)} ({lengthUnit})
                                  </label>
                                  <DraftLengthInput
                                    key={`${beam.id}-cperp-${lengthUnit}`}
                                    meters={distanceAlongWallFromCornerToNearestEdgeM(
                                      beam.ceilingPerpPosition ?? 0,
                                      perpLen,
                                      beam.widthM
                                    )}
                                    lengthUnit={lengthUnit}
                                    minM={0}
                                    maxM={perpLen}
                                    onCommit={(distM) => {
                                      updateBeam(beam.id, {
                                        ceilingPerpPosition:
                                          positionFromDistanceAlongWallToNearestEdgeM(
                                            distM,
                                            perpLen,
                                            beam.widthM
                                          ),
                                      });
                                    }}
                                    onLiveChange={(distM) => {
                                      updateBeam(beam.id, {
                                        ceilingPerpPosition:
                                          positionFromDistanceAlongWallToNearestEdgeM(
                                            distM,
                                            perpLen,
                                            beam.widthM
                                          ),
                                      });
                                    }}
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium mb-1">
                                    Beam length ({lengthUnit})
                                  </label>
                                  <DraftLengthInput
                                    key={`${beam.id}-clen-${lengthUnit}`}
                                    meters={beam.lengthM}
                                    lengthUnit={lengthUnit}
                                    minM={0.2}
                                    maxM={50}
                                    onCommit={(m) => updateBeam(beam.id, { lengthM: m })}
                                    onLiveChange={(m) => updateBeam(beam.id, { lengthM: m })}
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium mb-1">
                                    Width ({lengthUnit})
                                  </label>
                                  <DraftLengthInput
                                    key={`${beam.id}-cw-${lengthUnit}`}
                                    meters={beam.widthM}
                                    lengthUnit={lengthUnit}
                                    minM={0.04}
                                    maxM={2}
                                    onCommit={(m) => updateBeam(beam.id, { widthM: m })}
                                    onLiveChange={(m) => updateBeam(beam.id, { widthM: m })}
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium mb-1">
                                    Depth ({lengthUnit})
                                  </label>
                                  <DraftLengthInput
                                    key={`${beam.id}-cd-${lengthUnit}`}
                                    meters={beam.depthM}
                                    lengthUnit={lengthUnit}
                                    minM={0.04}
                                    maxM={2}
                                    onCommit={(m) => updateBeam(beam.id, { depthM: m })}
                                    onLiveChange={(m) => updateBeam(beam.id, { depthM: m })}
                                  />
                                </div>
                              </>
                            );
                          })()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#9CA3AF]">No beams yet.</p>
            )}
          </section>

          <section>
            <div className="mb-3 flex flex-col gap-3">
              <h3 className="text-sm font-semibold">Doors & Windows</h3>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-sm text-[#6B7280] whitespace-nowrap">
                    {roomUsesFloorOutline(room) ? "Wall edge" : "Wall"}
                  </label>
                  {roomUsesFloorOutline(room) && room.floorOutline ? (
                    <select
                      value={addDoorEdgeIndex}
                      onChange={(e) => setAddDoorEdgeIndex(Number(e.target.value))}
                      className="px-2 py-1.5 text-sm border border-[#F0E6D8] rounded-lg focus:border-[#E8772E] focus:outline-none min-w-[10rem]"
                    >
                      {room.floorOutline.map((_, ei) => {
                        const len = edgeLength(room.floorOutline!, ei);
                        return (
                          <option key={ei} value={ei}>
                            Edge {ei + 1} · {formatLengthLabel(len, lengthUnit)}
                          </option>
                        );
                      })}
                    </select>
                  ) : (
                    <select
                      value={addDoorWall}
                      onChange={(e) => setAddDoorWall(e.target.value as Opening["wall"])}
                      className="px-2 py-1.5 text-sm border border-[#F0E6D8] rounded-lg focus:border-[#E8772E] focus:outline-none"
                    >
                      <option value="front">Front · D–C</option>
                      <option value="back">Back · A–B</option>
                      <option value="left">Left · A–D</option>
                      <option value="right">Right · B–C</option>
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      roomUsesFloorOutline(room)
                        ? handleAddOpening("door", "back", addDoorEdgeIndex)
                        : handleAddOpening("door", addDoorWall)
                    }
                    className="px-4 py-1.5 text-sm bg-[#E8772E] text-white rounded-full hover:brightness-110 flex items-center gap-2 transition-all"
                  >
                    <DoorOpen className="w-4 h-4" />
                    Add Door
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-sm text-[#6B7280] whitespace-nowrap">
                    {roomUsesFloorOutline(room) ? "Wall edge" : "Wall"}
                  </label>
                  {roomUsesFloorOutline(room) && room.floorOutline ? (
                    <select
                      value={addWindowEdgeIndex}
                      onChange={(e) => setAddWindowEdgeIndex(Number(e.target.value))}
                      className="px-2 py-1.5 text-sm border border-[#F0E6D8] rounded-lg focus:border-[#E8772E] focus:outline-none min-w-[10rem]"
                    >
                      {room.floorOutline.map((_, ei) => {
                        const len = edgeLength(room.floorOutline!, ei);
                        return (
                          <option key={ei} value={ei}>
                            Edge {ei + 1} · {formatLengthLabel(len, lengthUnit)}
                          </option>
                        );
                      })}
                    </select>
                  ) : (
                    <select
                      value={addWindowWall}
                      onChange={(e) => setAddWindowWall(e.target.value as Opening["wall"])}
                      className="px-2 py-1.5 text-sm border border-[#F0E6D8] rounded-lg focus:border-[#E8772E] focus:outline-none"
                    >
                      <option value="front">Front · D–C</option>
                      <option value="back">Back · A–B</option>
                      <option value="left">Left · A–D</option>
                      <option value="right">Right · B–C</option>
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      roomUsesFloorOutline(room)
                        ? handleAddOpening("window", "back", addWindowEdgeIndex)
                        : handleAddOpening("window", addWindowWall)
                    }
                    className="px-4 py-1.5 text-sm bg-[#6B7280] text-white rounded-full hover:brightness-110 flex items-center gap-2 transition-all"
                  >
                    <Square className="w-4 h-4" />
                    Add Window
                  </button>
                </div>
              </div>
            </div>

            {room.openings && room.openings.length > 0 ? (
              <div className="space-y-2">
                {room.openings.map((opening) => {
                  const wallLen = getOpeningWallLengthM(opening, room);
                  const n = room.floorOutline?.length ?? 0;
                  const ei = opening.edgeIndex;
                  const isPolygonOpening =
                    roomUsesFloorOutline(room) && ei != null && n > 0;
                  const oCL = isPolygonOpening
                    ? `V${ei! + 1}`
                    : wallOpeningCornerLeft(opening.wall);
                  const oCR = isPolygonOpening
                    ? `V${((ei! + 1) % n) + 1}`
                    : wallOpeningCornerRight(opening.wall);
                  const h =
                    opening.height ?? defaultOpeningHeight(opening.type);
                  const dLeftM = leftEdgeFromCornerM(
                    opening.position,
                    wallLen,
                    opening.width
                  );
                  const dRightM = rightEdgeFromCornerM(
                    opening.position,
                    wallLen,
                    opening.width
                  );
                  const clearance =
                    opening.type === "window"
                      ? computeWindowClearance(
                          opening.id,
                          opening.wall,
                          room.openings || [],
                          wallLen,
                          isPolygonOpening ? ei! : null
                        )
                      : null;

                  return (
                    <div
                      key={opening.id}
                      className={`p-3 rounded-xl border-2 ${
                        editingOpening === opening.id
                          ? "border-[#E8772E] bg-[#FEF3E7]"
                          : "bg-[#FFF8F0] border-[#F0E6D8]"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3 min-w-0">
                          {opening.type === "door" ? (
                            <DoorOpen className="w-5 h-5 shrink-0 text-[#E8772E]" />
                          ) : (
                            <Square className="w-5 h-5 shrink-0 text-[#6B7280]" />
                          )}
                          <div className="min-w-0">
                            <div className="font-medium capitalize">
                              {opening.type} on{" "}
                              {isPolygonOpening
                                ? `edge ${ei! + 1} (${formatLengthLabel(wallLen, lengthUnit)})`
                                : `${opening.wall} wall`}
                            </div>
                            <div className="text-sm text-[#6B7280]">
                              {formatLengthLabel(opening.width, lengthUnit)} ×{" "}
                              {formatLengthLabel(h, lengthUnit)} · {oCL}:{" "}
                              {formatLengthLabel(dLeftM, lengthUnit)} · {oCR}:{" "}
                              {formatLengthLabel(dRightM, lengthUnit)}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setEditingOpening(
                                editingOpening === opening.id ? null : opening.id
                              )
                            }
                            className="p-2 hover:bg-[#FEF3E7] rounded-xl text-[#E8772E] transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeOpening(opening.id)}
                            className="p-2 hover:bg-red-50 rounded-xl text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      {editingOpening === opening.id && (
                        <div className="mt-3 pt-3 border-t border-[#F0E6D8] space-y-3">
                          <div>
                            <label className="block text-sm font-medium mb-1">
                              {roomUsesFloorOutline(room) ? "Wall edge" : "Wall"}
                            </label>
                            {roomUsesFloorOutline(room) && room.floorOutline ? (
                              <select
                                value={opening.edgeIndex ?? 0}
                                onChange={(e) => {
                                  const edgeIndex = Number(e.target.value);
                                  const updated = room.openings?.map((o) =>
                                    o.id === opening.id ? { ...o, edgeIndex } : o
                                  );
                                  const next = { ...room, openings: updated } as Room;
                                  setRoom({
                                    ...next,
                                    openings: clampOpeningsForRoom(next),
                                  });
                                }}
                                className="w-full px-3 py-2 border border-[#F0E6D8] rounded-xl focus:border-[#E8772E] focus:outline-none"
                              >
                                {room.floorOutline.map((_, ge) => {
                                  const len = edgeLength(room.floorOutline!, ge);
                                  return (
                                    <option key={ge} value={ge}>
                                      Edge {ge + 1} · {formatLengthLabel(len, lengthUnit)}
                                    </option>
                                  );
                                })}
                              </select>
                            ) : (
                              <select
                                value={opening.wall}
                                onChange={(e) => {
                                  const wall = e.target.value as Opening["wall"];
                                  const updated = room.openings?.map((o) =>
                                    o.id === opening.id ? { ...o, wall } : o
                                  );
                                  const next = { ...room, openings: updated } as Room;
                                  setRoom({
                                    ...next,
                                    openings: clampOpeningsForRoom(next),
                                  });
                                }}
                                className="w-full px-3 py-2 border border-[#F0E6D8] rounded-xl focus:border-[#E8772E] focus:outline-none"
                              >
                                <option value="front">Front · D–C</option>
                                <option value="back">Back · A–B</option>
                                <option value="left">Left · A–D</option>
                                <option value="right">Right · B–C</option>
                              </select>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm font-medium mb-1">
                                From {oCL} ({lengthUnit})
                              </label>
                              <DraftLengthInput
                                key={`${opening.id}-dl-${lengthUnit}`}
                                meters={dLeftM}
                                lengthUnit={lengthUnit}
                                minM={0}
                                maxM={Math.max(0, wallLen - opening.width)}
                                onCommit={(dLeft) => {
                                  const pos = positionFromLeftEdgeM(dLeft, wallLen, opening.width);
                                  const updated = room.openings?.map((o) =>
                                    o.id === opening.id ? { ...o, position: pos } : o
                                  );
                                  setRoom({ ...room, openings: updated });
                                }}
                                onLiveChange={(dLeft) => {
                                  const pos = positionFromLeftEdgeM(dLeft, wallLen, opening.width);
                                  const updated = room.openings?.map((o) =>
                                    o.id === opening.id ? { ...o, position: pos } : o
                                  );
                                  setRoom({ ...room, openings: updated });
                                }}
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium mb-1">
                                From {oCR} ({lengthUnit})
                              </label>
                              <DraftLengthInput
                                key={`${opening.id}-dr-${lengthUnit}`}
                                meters={dRightM}
                                lengthUnit={lengthUnit}
                                minM={0}
                                maxM={Math.max(0, wallLen - opening.width)}
                                onCommit={(dRight) => {
                                  const pos = positionFromRightEdgeM(dRight, wallLen, opening.width);
                                  const updated = room.openings?.map((o) =>
                                    o.id === opening.id ? { ...o, position: pos } : o
                                  );
                                  setRoom({ ...room, openings: updated });
                                }}
                                onLiveChange={(dRight) => {
                                  const pos = positionFromRightEdgeM(dRight, wallLen, opening.width);
                                  const updated = room.openings?.map((o) =>
                                    o.id === opening.id ? { ...o, position: pos } : o
                                  );
                                  setRoom({ ...room, openings: updated });
                                }}
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1">
                              Height ({lengthUnit})
                            </label>
                            <DraftLengthInput
                              key={`${opening.id}-oh-${lengthUnit}`}
                              meters={h}
                              lengthUnit={lengthUnit}
                              minM={OPENING_HEIGHT_MIN_M}
                              maxM={room.height}
                              onCommit={(m) => {
                                const updated = room.openings?.map((o) =>
                                  o.id === opening.id ? { ...o, height: m } : o
                                );
                                setRoom({ ...room, openings: updated });
                              }}
                              onLiveChange={(m) => {
                                const updated = room.openings?.map((o) =>
                                  o.id === opening.id ? { ...o, height: m } : o
                                );
                                setRoom({ ...room, openings: updated });
                              }}
                            />
                            <p className="text-xs text-[#9CA3AF] mt-1">
                              Defaults: door {formatLengthLabel(defaultOpeningHeight("door"), lengthUnit)}, window{" "}
                              {formatLengthLabel(defaultOpeningHeight("window"), lengthUnit)}. Ceiling:{" "}
                              {formatLengthLabel(room.height, lengthUnit)}.
                            </p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1">
                              Width ({lengthUnit})
                            </label>
                            <DraftLengthInput
                              key={`${opening.id}-ow-${lengthUnit}`}
                              meters={opening.width}
                              lengthUnit={lengthUnit}
                              minM={OPENING_WIDTH_MIN_M}
                              maxM={OPENING_WIDTH_MAX_M}
                              onCommit={(newW) => {
                                const updated = room.openings?.map((o) => {
                                  if (o.id !== opening.id) return o;
                                  const len = getOpeningWallLengthM(o, room);
                                  const pos = clampPositionValue(o.position, len, newW);
                                  return { ...o, width: newW, position: pos };
                                });
                                setRoom({ ...room, openings: updated });
                              }}
                              onLiveChange={(newW) => {
                                const updated = room.openings?.map((o) => {
                                  if (o.id !== opening.id) return o;
                                  const len = getOpeningWallLengthM(o, room);
                                  const pos = clampPositionValue(o.position, len, newW);
                                  return { ...o, width: newW, position: pos };
                                });
                                setRoom({ ...room, openings: updated });
                              }}
                            />
                          </div>

                          <div>
                            <button
                              type="button"
                              onClick={() =>
                                setAdvancedPositionId(
                                  advancedPositionId === opening.id ? null : opening.id
                                )
                              }
                              className="flex items-center gap-1 text-sm text-[#6B7280] hover:text-[#E8772E]"
                            >
                              <ChevronDown
                                className={`w-4 h-4 transition-transform ${
                                  advancedPositionId === opening.id ? "rotate-180" : ""
                                }`}
                              />
                              Fine-tune (slider)
                            </button>
                            {advancedPositionId === opening.id && (
                              <div className="mt-2">
                                <label className="block text-sm font-medium mb-1">
                                  Position −1…1 ({oCL} … {oCR})
                                </label>
                                <input
                                  type="range"
                                  min="-1"
                                  max="1"
                                  step="0.05"
                                  value={opening.position}
                                  onChange={(e) => {
                                    const raw = parseFloat(e.target.value);
                                    const pos = clampPositionValue(
                                      raw,
                                      wallLen,
                                      opening.width
                                    );
                                    const updated = room.openings?.map((o) =>
                                      o.id === opening.id ? { ...o, position: pos } : o
                                    );
                                    setRoom({ ...room, openings: updated });
                                  }}
                                  className="w-full"
                                />
                                <div className="text-xs text-[#9CA3AF] mt-1">
                                  {opening.position.toFixed(2)}
                                </div>
                              </div>
                            )}
                          </div>

                          {opening.type === "window" && clearance && (
                            <div className="text-sm text-[#6B7280] bg-white/60 rounded-lg px-3 py-2 border border-[#F0E6D8]">
                              <div className="font-medium text-[#374151] mb-1">Spacing on this wall</div>
                              <ul className="space-y-0.5 list-disc list-inside">
                                <li>
                                  {oCL} → left:{" "}
                                  {formatLengthLabel(
                                    clearance.leftCornerToWindowLeftCm / 100,
                                    lengthUnit
                                  )}
                                </li>
                                <li>
                                  {oCR} → right:{" "}
                                  {formatLengthLabel(
                                    clearance.rightCornerToWindowRightCm / 100,
                                    lengthUnit
                                  )}
                                </li>
                                {clearance.minGapToAnyDoorCm !== null && (
                                  <li>
                                    To nearest door:{" "}
                                    {formatLengthLabel(
                                      clearance.minGapToAnyDoorCm / 100,
                                      lengthUnit
                                    )}
                                  </li>
                                )}
                                {clearance.gapToPrevWindowCm !== null && (
                                  <li>
                                    To previous window:{" "}
                                    {formatLengthLabel(
                                      clearance.gapToPrevWindowCm / 100,
                                      lengthUnit
                                    )}
                                  </li>
                                )}
                                {clearance.gapToNextWindowCm !== null && (
                                  <li>
                                    To next window:{" "}
                                    {formatLengthLabel(
                                      clearance.gapToNextWindowCm / 100,
                                      lengthUnit
                                    )}
                                  </li>
                                )}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[#9CA3AF] text-center py-8">
                No openings yet — pick a wall, then Add Door or Add Window.
              </p>
            )}
          </section>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setShowRoomDesigner(false)}
              className="rounded-full border border-[#F0E6D8] px-4 py-2 text-sm transition-colors hover:bg-[#FEF3E7]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setShowRoomDesigner(false)}
              className="rounded-full bg-[#E8772E] px-4 py-2 text-sm text-white shadow-sm transition-all hover:brightness-110"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
