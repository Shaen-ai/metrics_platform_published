"use client";

import { Html } from "@react-three/drei";
import { usePlannerStore } from "../store/usePlannerStore";
import { ROOM_CORNER_IDS, cornerFloorPosition } from "../utils/roomCorners";

/** CSS z-index from distance; stay below Room Designer (z-50). Drei default range maps to very large z-index. */
function CornerPill({
  position,
  letter,
}: {
  position: [number, number, number];
  letter: string;
}) {
  return (
    <Html
      position={position}
      center
      pointerEvents="none"
      zIndexRange={[1, 40]}
      style={{ pointerEvents: "none" }}
    >
      <div
        style={{
          background: "rgba(232, 119, 46, 0.95)",
          color: "#fff",
          width: 28,
          height: 28,
          borderRadius: "50%",
          fontSize: 14,
          fontWeight: 800,
          fontFamily: "'Inter', -apple-system, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1,
          boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
          border: "2px solid rgba(255,255,255,0.9)",
        }}
      >
        {letter}
      </div>
    </Html>
  );
}

/** A–D at interior floor corners when Room Designer is open (matches roomCorners.ts). */
export default function RoomCornerLabels() {
  const showRoomDesigner = usePlannerStore((s) => s.showRoomDesigner);
  const room = usePlannerStore((s) => s.room);

  if (!showRoomDesigner) return null;

  return (
    <group name="room-corner-labels">
      {ROOM_CORNER_IDS.map((id) => (
        <CornerPill key={id} position={cornerFloorPosition(id, room)} letter={id} />
      ))}
    </group>
  );
}
