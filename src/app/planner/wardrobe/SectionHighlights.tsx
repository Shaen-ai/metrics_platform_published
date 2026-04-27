"use client";

import { useMemo, useState } from "react";
import * as THREE from "three";
import { useWardrobeStore } from "./store";
import { PANEL_THICKNESS } from "./data";

const CM = 0.01;
const PT = PANEL_THICKNESS * CM;

function SectionPlane({
  id,
  x,
  w,
  h,
  z,
  isSelected,
  onSelect,
}: {
  id: string;
  x: number;
  w: number;
  h: number;
  z: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  const opacity = isSelected ? 0.1 : hovered ? 0.06 : 0;
  const color = isSelected ? "#4488ff" : "#6699ff";

  return (
    <mesh
      position={[x + w / 2, h / 2, z]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(id);
      }}
      onPointerEnter={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerLeave={() => {
        setHovered(false);
        document.body.style.cursor = "";
      }}
    >
      <planeGeometry args={[w - 0.002, h - 0.002]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

export default function SectionHighlights() {
  const frame = useWardrobeStore((s) => s.config.frame);
  const sections = useWardrobeStore((s) => s.config.sections);
  const selectedSectionId = useWardrobeStore((s) => s.ui.selectedSectionId);
  const selectSection = useWardrobeStore((s) => s.selectSection);

  const H = frame.height * CM;
  const D = frame.depth * CM;

  const sectionRects = useMemo(() => {
    const rects: { id: string; x: number; w: number }[] = [];
    let x = PT;
    for (const section of sections) {
      const sw = section.width * CM;
      rects.push({ id: section.id, x, w: sw });
      x += sw + PT;
    }
    return rects;
  }, [sections]);

  return (
    <group>
      {sectionRects.map((rect) => (
        <SectionPlane
          key={rect.id}
          id={rect.id}
          x={rect.x}
          w={rect.w}
          h={H - PT * 2}
          z={D / 2 + 0.001}
          isSelected={rect.id === selectedSectionId}
          onSelect={selectSection}
        />
      ))}
    </group>
  );
}
