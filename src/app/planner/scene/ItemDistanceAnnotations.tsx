"use client";

import { useMemo } from "react";
import { Html, Line } from "@react-three/drei";
import { usePlannerStore } from "../store/usePlannerStore";
import { formatLengthLabel } from "../utils/units";
import type { PlacedItem, PlannerCatalogItem, Room } from "../types";

const MIN_DISPLAY_M = 0.02;

function DimPill({
  position,
  label,
}: {
  position: [number, number, number];
  label: string;
}) {
  return (
    <Html position={position} center style={{ pointerEvents: "none" }}>
      <div
        style={{
          background: "rgba(17,17,17,0.88)",
          color: "#fff",
          padding: "2px 8px",
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 700,
          fontFamily: "'Inter', -apple-system, sans-serif",
          whiteSpace: "nowrap",
          letterSpacing: "0.01em",
          lineHeight: 1.4,
          boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
        }}
      >
        {label}
      </div>
    </Html>
  );
}

function DashedGuide({
  from,
  to,
  color = "#1a73e8",
}: {
  from: [number, number, number];
  to: [number, number, number];
  color?: string;
}) {
  return (
    <Line
      points={[from, to]}
      color={color}
      lineWidth={1.5}
      dashed
      dashSize={0.04}
      gapSize={0.03}
      transparent
      opacity={0.7}
      depthTest={false}
      renderOrder={998}
    />
  );
}

interface AnnotationProps {
  item: PlacedItem;
  catalogItem: PlannerCatalogItem;
  room: Room;
  allItems: PlacedItem[];
  catalog: PlannerCatalogItem[];
}

function computeRotatedHalfExtents(
  width: number,
  depth: number,
  rotationY: number,
) {
  const cos = Math.abs(Math.cos(rotationY));
  const sin = Math.abs(Math.sin(rotationY));
  return {
    halfW: (width * cos + depth * sin) / 2,
    halfD: (width * sin + depth * cos) / 2,
  };
}

export default function ItemDistanceAnnotations({
  item,
  catalogItem,
  room,
  allItems,
  catalog,
}: AnnotationProps) {
  const lengthUnit = usePlannerStore((s) => s.ui.lengthUnit);

  const width = item.width ?? catalogItem.width;
  const depth = item.depth ?? catalogItem.depth;
  const height = item.height ?? catalogItem.height;
  const posY = item.positionY ?? 0;
  const { x, z } = item.position;

  const { halfW, halfD } = computeRotatedHalfExtents(width, depth, item.rotationY);

  const halfRoomW = room.width / 2;
  const halfRoomD = room.depth / 2;

  const distLeft = x - (-halfRoomW) - halfW;
  const distRight = halfRoomW - x - halfW;
  const distFront = z - (-halfRoomD) - halfD;
  const distBack = halfRoomD - z - halfD;
  const distFloor = posY;

  const itemLeft = x - halfW;
  const itemRight = x + halfW;
  const itemFront = z - halfD;
  const itemBack = z + halfD;

  const floorY = 0.005;
  const sideX = itemLeft - 0.06;

  // Find highest floor item directly below this wall-mounted item
  const gapToFloorItem = useMemo(() => {
    if (posY <= MIN_DISPLAY_M) return null;

    let highestTop = 0;
    let found = false;
    for (const other of allItems) {
      if (other.id === item.id) continue;
      const otherPosY = other.positionY ?? 0;
      if (otherPosY > 0.01) continue; // skip other wall-mounted items

      const cat = catalog.find((c) => c.id === other.catalogId);
      if (!cat) continue;

      const ow = other.width ?? cat.width;
      const od = other.depth ?? cat.depth;
      const oh = other.height ?? cat.height;
      const { halfW: oHalfW, halfD: oHalfD } = computeRotatedHalfExtents(ow, od, other.rotationY);

      const overlapX = Math.min(itemRight, other.position.x + oHalfW) - Math.max(itemLeft, other.position.x - oHalfW);
      const overlapZ = Math.min(itemBack, other.position.z + oHalfD) - Math.max(itemFront, other.position.z - oHalfD);

      if (overlapX > 0.01 && overlapZ > 0.01) {
        const top = otherPosY + oh;
        if (top > highestTop) {
          highestTop = top;
          found = true;
        }
      }
    }

    if (!found) return null;
    const gap = posY - highestTop;
    return gap > MIN_DISPLAY_M ? { gap, topY: highestTop } : null;
  }, [item, posY, allItems, catalog, itemLeft, itemRight, itemFront, itemBack]);

  return (
    <group>
      {/* ── Distance from left wall ── */}
      {distLeft > MIN_DISPLAY_M && (
        <>
          <DashedGuide
            from={[-halfRoomW, floorY, z]}
            to={[itemLeft, floorY, z]}
          />
          <DimPill
            position={[(-halfRoomW + itemLeft) / 2, floorY, z]}
            label={formatLengthLabel(distLeft, lengthUnit)}
          />
        </>
      )}

      {/* ── Distance from right wall ── */}
      {distRight > MIN_DISPLAY_M && (
        <>
          <DashedGuide
            from={[itemRight, floorY, z]}
            to={[halfRoomW, floorY, z]}
          />
          <DimPill
            position={[(itemRight + halfRoomW) / 2, floorY, z]}
            label={formatLengthLabel(distRight, lengthUnit)}
          />
        </>
      )}

      {/* ── Distance from front wall ── */}
      {distFront > MIN_DISPLAY_M && (
        <>
          <DashedGuide
            from={[x, floorY, -halfRoomD]}
            to={[x, floorY, itemFront]}
          />
          <DimPill
            position={[x, floorY, (-halfRoomD + itemFront) / 2]}
            label={formatLengthLabel(distFront, lengthUnit)}
          />
        </>
      )}

      {/* ── Distance from back wall ── */}
      {distBack > MIN_DISPLAY_M && (
        <>
          <DashedGuide
            from={[x, floorY, itemBack]}
            to={[x, floorY, halfRoomD]}
          />
          <DimPill
            position={[x, floorY, (itemBack + halfRoomD) / 2]}
            label={formatLengthLabel(distBack, lengthUnit)}
          />
        </>
      )}

      {/* ── Distance from floor (wall-mounted items) ── */}
      {distFloor > MIN_DISPLAY_M && (
        <>
          <DashedGuide
            from={[sideX, 0, z]}
            to={[sideX, posY, z]}
            color="#e67e22"
          />
          <DimPill
            position={[sideX, posY / 2, z]}
            label={formatLengthLabel(distFloor, lengthUnit)}
          />
        </>
      )}

      {/* ── Gap to floor item below (wall-mounted items with furniture underneath) ── */}
      {gapToFloorItem && (
        <>
          <DashedGuide
            from={[sideX + 0.08, gapToFloorItem.topY, z]}
            to={[sideX + 0.08, posY, z]}
            color="#27ae60"
          />
          <DimPill
            position={[sideX + 0.08, (gapToFloorItem.topY + posY) / 2, z]}
            label={formatLengthLabel(gapToFloorItem.gap, lengthUnit)}
          />
        </>
      )}
    </group>
  );
}
