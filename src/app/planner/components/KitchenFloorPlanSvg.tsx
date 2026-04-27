"use client";

import { useMemo, useId, useRef, type ReactNode } from "react";
import type { FloorOutlinePoint, Opening, LengthUnit } from "../types";
import { edgeLength } from "../utils/floorOutline";
import { formatPlanSegmentDimension } from "../utils/planDimensionsFormat";
import {
  distanceAlongWallFromCornerToCenterM,
  positionFromDistanceAlongWallToCenterM,
} from "../utils/openings";

const INNER_TARGET = 340;
const PAD = 92;
/** Wall thickness in meters for 2D preview scale (~14 cm). */
const WALL_THICKNESS_M = 0.14;

function worldToSvg(
  p: FloorOutlinePoint,
  minX: number,
  maxZ: number,
  scale: number,
  pad: number,
): { x: number; y: number } {
  return {
    x: pad + (p.x - minX) * scale,
    y: pad + (maxZ - p.z) * scale,
  };
}

function unit2(x: number, y: number): { x: number; y: number } {
  const L = Math.hypot(x, y);
  if (L < 1e-9) return { x: 1, y: 0 };
  return { x: x / L, y: y / L };
}

function centroidOutline(outline: FloorOutlinePoint[]): FloorOutlinePoint {
  let sx = 0,
    sz = 0;
  for (const p of outline) {
    sx += p.x;
    sz += p.z;
  }
  const n = outline.length;
  return { x: sx / n, z: sz / n };
}

export interface KitchenFloorPlanSvgProps {
  outline: FloorOutlinePoint[];
  openEdgeIndices: number[];
  openings: Opening[];
  selectedEdge: number;
  onSelectEdge: (edgeIndex: number) => void;
  lengthUnit: LengthUnit;
  /** e.g. "161.5 ft²" */
  areaSqFtLabel: string;
  roomTitle?: string;
  /** Show grips on dimension lines; drag perpendicular to the wall to resize (template params). */
  enableResizeDrag?: boolean;
  /** Cumulative per-move Δ in world meters along the outward normal (positive grows outer spans). */
  onResizeDragDelta?: (edgeIndex: number, perpDeltaWorld: number) => void;
  /** Drag any polygon corner in world XZ (IKEA-style freeform outline). */
  enableCornerDrag?: boolean;
  onCornerDragDelta?: (vertexIndex: number, deltaWorldX: number, deltaWorldZ: number) => void;
  /** After releasing a corner: merge with another vertex if they overlap (fewer corners). */
  onCornerDragEnd?: (vertexIndex: number) => void;
  /** Drag doors/windows along their wall in plan view (IKEA-style). */
  interactiveOpenings?: boolean;
  selectedOpeningId?: string | null;
  onSelectOpening?: (id: string | null) => void;
  onOpeningPositionChange?: (id: string, position: number) => void;
}

export default function KitchenFloorPlanSvg({
  outline,
  openEdgeIndices,
  openings,
  selectedEdge,
  onSelectEdge,
  lengthUnit,
  areaSqFtLabel,
  roomTitle = "Area 1",
  enableResizeDrag = false,
  onResizeDragDelta,
  enableCornerDrag = false,
  onCornerDragDelta,
  onCornerDragEnd,
  interactiveOpenings = false,
  selectedOpeningId = null,
  onSelectOpening,
  onOpeningPositionChange,
}: KitchenFloorPlanSvgProps) {
  const uid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const resizeDragRef = useRef<{ lastX: number; lastY: number } | null>(null);
  const cornerDragRef = useRef<{ lastX: number; lastY: number } | null>(null);
  const openingDragRef = useRef<{
    id: string;
    lastSx: number;
    lastSy: number;
    uxW: number;
    uzW: number;
    scale: number;
    centerDist: number;
    L: number;
    width: number;
  } | null>(null);

  const plan = useMemo(() => {
    if (outline.length < 3) {
      return {
        vbW: 200,
        vbH: 200,
        floorD: "",
        centroidSvg: { x: 100, y: 100 },
        edges: [] as Array<{
          ei: number;
          ax: number;
          ay: number;
          bx: number;
          by: number;
          lenM: number;
          open: boolean;
          mx: number;
          my: number;
          ox: number;
          oy: number;
          dimPx: number;
          textAngle: number;
          label: string;
        }>,
        wallPx: 12,
        scale: 1,
        corners: [] as Array<{ vi: number; cx: number; cy: number }>,
        openingGraphics: [] as ReactNode[],
        openingDragTargets: [] as Array<{
          id: string;
          L: number;
          width: number;
          p0x: number;
          p0y: number;
          p1x: number;
          p1y: number;
          midXs: number;
          midYs: number;
          uxW: number;
          uzW: number;
        }>,
      };
    }

    const xs = outline.map((p) => p.x);
    const zs = outline.map((p) => p.z);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const bw = maxX - minX;
    const bh = maxZ - minZ;
    const scale = INNER_TARGET / Math.max(bw, bh, 0.5);

    const floorPts = outline.map((p) => worldToSvg(p, minX, maxZ, scale, PAD));
    const corners = floorPts.map((pt, vi) => ({ vi, cx: pt.x, cy: pt.y }));
    const floorD = `M ${floorPts.map((q) => `${q.x.toFixed(2)},${q.y.toFixed(2)}`).join(" L ")} Z`;

    const cWorld = centroidOutline(outline);
    const centroidSvg = worldToSvg(cWorld, minX, maxZ, scale, PAD);

    const wallPx = Math.max(10, WALL_THICKNESS_M * scale * 0.85);

    const edges: Array<{
      ei: number;
      ax: number;
      ay: number;
      bx: number;
      by: number;
      lenM: number;
      open: boolean;
      mx: number;
      my: number;
      ox: number;
      oy: number;
      dimPx: number;
      textAngle: number;
      label: string;
    }> = [];

    for (let ei = 0; ei < outline.length; ei++) {
      const a = outline[ei]!;
      const b = outline[(ei + 1) % outline.length]!;
      const As = worldToSvg(a, minX, maxZ, scale, PAD);
      const Bs = worldToSvg(b, minX, maxZ, scale, PAD);
      const mx = (As.x + Bs.x) / 2;
      const my = (As.y + Bs.y) / 2;
      const inward = unit2(centroidSvg.x - mx, centroidSvg.y - my);
      const outward = { x: -inward.x, y: -inward.y };
      const lenM = edgeLength(outline, ei);
      const open = openEdgeIndices.includes(ei);
      const stagger = (ei % 4) * 12;
      const dimPx = wallPx * 0.55 + 26 + stagger;
      const dx = Bs.x - As.x;
      const dy = Bs.y - As.y;
      const textAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const label = formatPlanSegmentDimension(lenM, lengthUnit);

      edges.push({
        ei,
        ax: As.x,
        ay: As.y,
        bx: Bs.x,
        by: Bs.y,
        lenM,
        open,
        mx,
        my,
        ox: outward.x,
        oy: outward.y,
        dimPx,
        textAngle: Math.abs(textAngle) > 90 ? textAngle + 180 : textAngle,
        label,
      });
    }

    const vbW = PAD * 2 + bw * scale + PAD * 0.35;
    const vbH = PAD * 2 + bh * scale + PAD * 0.35;

    const openingGraphics: ReactNode[] = [];
    const openingDragTargets: Array<{
      id: string;
      L: number;
      width: number;
      p0x: number;
      p0y: number;
      p1x: number;
      p1y: number;
      midXs: number;
      midYs: number;
      uxW: number;
      uzW: number;
    }> = [];
    for (const op of openings) {
      const ei = op.edgeIndex ?? 0;
      if (ei < 0 || ei >= outline.length) continue;
      const a = outline[ei]!;
      const b = outline[(ei + 1) % outline.length]!;
      const As = worldToSvg(a, minX, maxZ, scale, PAD);
      const Bs = worldToSvg(b, minX, maxZ, scale, PAD);
      const Lm = edgeLength(outline, ei);
      if (Lm < 1e-6) continue;
      const Tlen = Math.hypot(Bs.x - As.x, Bs.y - As.y);
      const twx = (Bs.x - As.x) / Tlen;
      const twy = (Bs.y - As.y) / Tlen;
      const tCenter = (op.position + 1) / 2;
      const halfW = Math.min(op.width / 2, Lm * 0.45);
      const t0 = Math.max(0.02, Math.min(0.98, tCenter - halfW / Lm));
      const t1 = Math.max(0.02, Math.min(0.98, tCenter + halfW / Lm));
      const P0w = { x: a.x + (b.x - a.x) * t0, z: a.z + (b.z - a.z) * t0 };
      const P1w = { x: a.x + (b.x - a.x) * t1, z: a.z + (b.z - a.z) * t1 };
      const P0s = worldToSvg(P0w, minX, maxZ, scale, PAD);
      const P1s = worldToSvg(P1w, minX, maxZ, scale, PAD);
      const midXs = (P0s.x + P1s.x) / 2;
      const midYs = (P0s.y + P1s.y) / 2;
      const iu = unit2(centroidSvg.x - midXs, centroidSvg.y - midYs);
      const olen = Math.hypot(P1s.x - P0s.x, P1s.y - P0s.y);
      const uxW = (b.x - a.x) / Lm;
      const uzW = (b.z - a.z) / Lm;
      openingDragTargets.push({
        id: op.id,
        L: Lm,
        width: op.width,
        p0x: P0s.x,
        p0y: P0s.y,
        p1x: P1s.x,
        p1y: P1s.y,
        midXs,
        midYs,
        uxW,
        uzW,
      });

      if (op.type === "window") {
        const gap = Math.max(3, wallPx * 0.35);
        const wx0 = P0s.x + iu.x * gap;
        const wy0 = P0s.y + iu.y * gap;
        const wx1 = P1s.x + iu.x * gap;
        const wy1 = P1s.y + iu.y * gap;
        openingGraphics.push(
          <line
            key={op.id}
            x1={wx0}
            y1={wy0}
            x2={wx1}
            y2={wy1}
            stroke="#5b7c99"
            strokeWidth={Math.max(5, wallPx * 0.45)}
            strokeLinecap="butt"
            opacity={0.92}
          />,
        );
        openingGraphics.push(
          <line
            key={`${op.id}-sash`}
            x1={wx0}
            y1={wy0}
            x2={wx1}
            y2={wy1}
            stroke="#e8eef5"
            strokeWidth={2}
            opacity={0.9}
          />,
        );
      } else {
        const r = Math.min(olen / 4, 42);
        const sweep = twx * iu.y - twy * iu.x > 0 ? 1 : 0;
        const pvtL = { x: P0s.x + twx * r * 0.05, y: P0s.y + twy * r * 0.05 };
        const pvtR = { x: P1s.x - twx * r * 0.05, y: P1s.y - twy * r * 0.05 };
        const endL = { x: pvtL.x + iu.x * r, y: pvtL.y + iu.y * r };
        const endR = { x: pvtR.x + iu.x * r, y: pvtR.y + iu.y * r };
        openingGraphics.push(
          <path
            key={`${op.id}-l`}
            d={`M ${pvtL.x.toFixed(2)} ${pvtL.y.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 ${sweep} ${endL.x.toFixed(2)} ${endL.y.toFixed(2)}`}
            fill="none"
            stroke="#6b6b6b"
            strokeWidth={1.8}
            strokeLinecap="round"
          />,
        );
        const sweepR = sweep === 1 ? 0 : 1;
        openingGraphics.push(
          <path
            key={`${op.id}-r`}
            d={`M ${pvtR.x.toFixed(2)} ${pvtR.y.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 ${sweepR} ${endR.x.toFixed(2)} ${endR.y.toFixed(2)}`}
            fill="none"
            stroke="#6b6b6b"
            strokeWidth={1.8}
            strokeLinecap="round"
          />,
        );
      }
    }

    return {
      vbW,
      vbH,
      floorD,
      centroidSvg,
      edges,
      wallPx,
      scale,
      corners,
      openingGraphics,
      openingDragTargets,
    };
  }, [outline, openEdgeIndices, openings, lengthUnit]);

  const woodPatId = `wood-${uid}`;
  const woodDeepId = `wood-deep-${uid}`;

  if (outline.length < 3) {
    return null;
  }

  function clientToSvg(clientX: number, clientY: number): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    return pt.matrixTransform(ctm.inverse());
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${plan.vbW.toFixed(0)} ${plan.vbH.toFixed(0)}`}
      className="kitchen-layout-svg kitchen-floor-plan-svg"
      role="img"
      aria-label="Floor plan with dimensions"
    >
      <defs>
        <linearGradient id={woodDeepId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#c9a882" />
          <stop offset="50%" stopColor="#d9bc9a" />
          <stop offset="100%" stopColor="#c5a27a" />
        </linearGradient>
        <pattern
          id={woodPatId}
          patternUnits="userSpaceOnUse"
          width="12"
          height="56"
          patternTransform="rotate(2)"
        >
          <rect width="12" height="56" fill={`url(#${woodDeepId})`} />
          <line x1="0" y1="0" x2="12" y2="0" stroke="#a88562" strokeWidth="0.8" opacity={0.55} />
          <line x1="0" y1="18" x2="12" y2="18" stroke="#b89270" strokeWidth="0.5" opacity={0.35} />
        </pattern>
      </defs>

      <rect
        x={0}
        y={0}
        width={plan.vbW}
        height={plan.vbH}
        fill="#fafafa"
        rx={4}
      />

      <path d={plan.floorD} fill={`url(#${woodPatId})`} stroke="none" />

      {plan.edges.map(({ ei, ax, ay, bx, by, open, mx, my, ox, oy, dimPx, label, textAngle }) => {
        const p0x = ax + ox * dimPx;
        const p0y = ay + oy * dimPx;
        const p1x = bx + ox * dimPx;
        const p1y = by + oy * dimPx;
        const tick = 6;
        const perpX = -(by - ay);
        const perpY = bx - ax;
        const pL = Math.hypot(perpX, perpY) || 1;
        const ux = (perpX / pL) * tick;
        const uy = (perpY / pL) * tick;
        const dmx = (p0x + p1x) / 2;
        const dmy = (p0y + p1y) / 2;
        const labelR = textAngle;
        return (
          <g key={`dim-${ei}`}>
            <line
              x1={ax + (p0x - ax) * 0.06}
              y1={ay + (p0y - ay) * 0.06}
              x2={p0x}
              y2={p0y}
              stroke="#9ca3af"
              strokeWidth={0.9}
              strokeDasharray="3 3"
            />
            <line
              x1={bx + (p1x - bx) * 0.06}
              y1={by + (p1y - by) * 0.06}
              x2={p1x}
              y2={p1y}
              stroke="#9ca3af"
              strokeWidth={0.9}
              strokeDasharray="3 3"
            />
            <line
              x1={p0x}
              y1={p0y}
              x2={p1x}
              y2={p1y}
              stroke="#1f2937"
              strokeWidth={1.1}
            />
            <line
              x1={p0x - ux}
              y1={p0y - uy}
              x2={p0x + ux}
              y2={p0y + uy}
              stroke="#1f2937"
              strokeWidth={1.1}
            />
            <line
              x1={p1x - ux}
              y1={p1y - uy}
              x2={p1x + ux}
              y2={p1y + uy}
              stroke="#1f2937"
              strokeWidth={1.1}
            />
            <text
              x={dmx + ox * 14}
              y={dmy + oy * 14 + 4}
              fill="#111827"
              fontSize={11}
              fontWeight={600}
              fontFamily="'Inter', system-ui, -apple-system, sans-serif"
              textAnchor="middle"
              transform={`rotate(${labelR.toFixed(2)}, ${dmx + ox * 14}, ${dmy + oy * 14})`}
            >
              {label}
            </text>
          </g>
        );
      })}

      {plan.edges.map(({ ei, ax, ay, bx, by, open }) => (
        <line
          key={`wall-${ei}`}
          x1={ax}
          y1={ay}
          x2={bx}
          y2={by}
          stroke={ei === selectedEdge ? "#0058a3" : open ? "#94a3af" : "#c5c5c5"}
          strokeWidth={ei === selectedEdge ? plan.wallPx + 4 : open ? plan.wallPx * 0.65 : plan.wallPx}
          strokeLinecap="square"
          strokeLinejoin="miter"
          strokeDasharray={open ? "10 7" : undefined}
        />
      ))}

      {plan.openingGraphics}

      {plan.edges.map(({ ei, ax, ay, bx, by }) => (
        <line
          key={`hit-${ei}`}
          x1={ax}
          y1={ay}
          x2={bx}
          y2={by}
          stroke="transparent"
          strokeWidth={28}
          style={{ cursor: "pointer" }}
          onClick={() => {
            onSelectOpening?.(null);
            onSelectEdge(ei);
          }}
        />
      ))}

      {interactiveOpenings &&
        onOpeningPositionChange &&
        plan.openingDragTargets.map((t) => {
          const sel = t.id === selectedOpeningId;
          return (
            <g
              key={`op-drag-${t.id}`}
              className={sel ? "kitchen-floor-plan-opening--selected" : undefined}
            >
              <line
                x1={t.p0x}
                y1={t.p0y}
                x2={t.p1x}
                y2={t.p1y}
                stroke={sel ? "rgba(245, 158, 11, 0.4)" : "transparent"}
                strokeWidth={sel ? 26 : 22}
                strokeLinecap="round"
                style={{ cursor: "grab", touchAction: "none" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onSelectOpening?.(t.id);
                  const p = clientToSvg(e.clientX, e.clientY);
                  const op = openings.find((o) => o.id === t.id);
                  if (!op) return;
                  const cd = distanceAlongWallFromCornerToCenterM(op.position, t.L);
                  openingDragRef.current = {
                    id: t.id,
                    lastSx: p.x,
                    lastSy: p.y,
                    uxW: t.uxW,
                    uzW: t.uzW,
                    scale: plan.scale,
                    centerDist: cd,
                    L: t.L,
                    width: t.width,
                  };
                  (e.currentTarget as SVGLineElement).setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  const r = openingDragRef.current;
                  if (!r || r.id !== t.id) return;
                  const p = clientToSvg(e.clientX, e.clientY);
                  const dWx = (p.x - r.lastSx) / r.scale;
                  const dWz = -(p.y - r.lastSy) / r.scale;
                  const along = dWx * r.uxW + dWz * r.uzW;
                  r.centerDist += along;
                  r.lastSx = p.x;
                  r.lastSy = p.y;
                  const newPos = positionFromDistanceAlongWallToCenterM(
                    r.centerDist,
                    r.L,
                    r.width,
                  );
                  onOpeningPositionChange(t.id, newPos);
                }}
                onPointerUp={(e) => {
                  if (openingDragRef.current?.id === t.id) {
                    openingDragRef.current = null;
                  }
                  try {
                    (e.currentTarget as SVGLineElement).releasePointerCapture(e.pointerId);
                  } catch {
                    /* released */
                  }
                }}
                onPointerCancel={() => {
                  if (openingDragRef.current?.id === t.id) {
                    openingDragRef.current = null;
                  }
                }}
              />
              {sel ? (
                <circle
                  cx={t.midXs}
                  cy={t.midYs}
                  r={5}
                  fill="#f59e0b"
                  stroke="#fff"
                  strokeWidth={2}
                  pointerEvents="none"
                />
              ) : null}
            </g>
          );
        })}

      <text
        x={plan.centroidSvg.x}
        y={plan.centroidSvg.y - 6}
        fill="#374151"
        fontSize={12}
        fontWeight={700}
        textAnchor="middle"
        fontFamily="'Inter', system-ui, -apple-system, sans-serif"
      >
        {roomTitle}
      </text>
      <text
        x={plan.centroidSvg.x}
        y={plan.centroidSvg.y + 12}
        fill="#4b5563"
        fontSize={11}
        fontWeight={500}
        textAnchor="middle"
        fontFamily="'Inter', system-ui, -apple-system, sans-serif"
      >
        {areaSqFtLabel}
      </text>

      {enableResizeDrag &&
        onResizeDragDelta &&
        plan.edges.map(({ ei, open, mx, my, ox, oy, dimPx }) => {
          if (open) return null;
          const hx = dmxWall(mx, ox, dimPx);
          const hy = dmyWall(my, oy, dimPx);
          return (
            <circle
              key={`resize-${ei}`}
              cx={hx}
              cy={hy}
              r={11}
              className="kitchen-floor-plan-resize-handle kitchen-floor-plan-resize-handle-outer"
              fill="#ffffff"
              stroke="#0058a3"
              strokeWidth={2.5}
              style={{ cursor: "grab", touchAction: "none" }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                const p = clientToSvg(e.clientX, e.clientY);
                resizeDragRef.current = { lastX: p.x, lastY: p.y };
                (e.currentTarget as SVGCircleElement).setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!resizeDragRef.current) return;
                const p = clientToSvg(e.clientX, e.clientY);
                const dx = p.x - resizeDragRef.current.lastX;
                const dy = p.y - resizeDragRef.current.lastY;
                resizeDragRef.current = { lastX: p.x, lastY: p.y };
                const sc = plan.scale > 1e-6 ? plan.scale : 1;
                const perp = (dx * ox + dy * oy) / sc;
                if (Math.abs(perp) > 1e-8) onResizeDragDelta(ei, perp);
              }}
              onPointerUp={(e) => {
                resizeDragRef.current = null;
                try {
                  (e.currentTarget as SVGCircleElement).releasePointerCapture(e.pointerId);
                } catch {
                  /* released */
                }
              }}
              onPointerCancel={() => {
                resizeDragRef.current = null;
              }}
            />
          );
        })}

      {enableCornerDrag &&
        onCornerDragDelta &&
        plan.corners.map(({ vi, cx, cy }) => (
          <rect
            key={`corner-${vi}`}
            x={cx - 12}
            y={cy - 12}
            width={24}
            height={24}
            rx={3}
            transform={`rotate(45, ${cx}, ${cy})`}
            className="kitchen-floor-plan-corner-handle"
            fill="#ffffff"
            stroke="#0058a3"
            strokeWidth={2}
            style={{ cursor: "move", touchAction: "none" }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const p = clientToSvg(e.clientX, e.clientY);
              cornerDragRef.current = { lastX: p.x, lastY: p.y };
              (e.currentTarget as SVGRectElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!cornerDragRef.current) return;
              const p = clientToSvg(e.clientX, e.clientY);
              const dx = p.x - cornerDragRef.current.lastX;
              const dy = p.y - cornerDragRef.current.lastY;
              cornerDragRef.current = { lastX: p.x, lastY: p.y };
              const sc = plan.scale > 1e-6 ? plan.scale : 1;
              const dWx = dx / sc;
              const dWz = -dy / sc;
              if (Math.abs(dWx) > 1e-9 || Math.abs(dWz) > 1e-9) onCornerDragDelta(vi, dWx, dWz);
            }}
            onPointerUp={(e) => {
              cornerDragRef.current = null;
              try {
                (e.currentTarget as SVGRectElement).releasePointerCapture(e.pointerId);
              } catch {
                /* released */
              }
              onCornerDragEnd?.(vi);
            }}
            onPointerCancel={() => {
              cornerDragRef.current = null;
            }}
          />
        ))}
    </svg>
  );
}

function dmxWall(mx: number, ox: number, dimPx: number) {
  return mx + ox * dimPx;
}
function dmyWall(my: number, oy: number, dimPx: number) {
  return my + oy * dimPx;
}
