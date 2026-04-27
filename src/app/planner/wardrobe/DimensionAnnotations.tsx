"use client";

import { useMemo } from "react";
import { Html } from "@react-three/drei";
import { useWardrobeStore } from "./store";
import { PANEL_THICKNESS, clampWardrobeBase, totalWardrobeHeightCm, wardrobeBaseLiftCm } from "./data";

const CM = 0.01;
const PT = PANEL_THICKNESS * CM;

function DimPill({
  position,
  label,
}: {
  position: [number, number, number];
  label: string;
}) {
  return (
    <Html
      position={position}
      center
      zIndexRange={[92, 78]}
      style={{ pointerEvents: "none" }}
    >
      <div
        style={{
          background: "#111",
          color: "#fff",
          padding: "3px 10px",
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 700,
          fontFamily: "'Inter', -apple-system, sans-serif",
          whiteSpace: "nowrap",
          letterSpacing: "0.01em",
          lineHeight: 1.4,
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        }}
      >
        {label}
      </div>
    </Html>
  );
}

export default function DimensionAnnotations() {
  const frame = useWardrobeStore((s) => s.config.frame);
  const base = useWardrobeStore((s) => s.config.base);
  const sections = useWardrobeStore((s) => s.config.sections);
  const showDimensions = useWardrobeStore((s) => s.ui.showDimensions);

  const b = clampWardrobeBase(base);
  const liftCm = wardrobeBaseLiftCm(b);

  const W = frame.width * CM;
  const H = frame.height * CM;
  const D = frame.depth * CM;

  const heightLabel =
    liftCm > 0
      ? `${totalWardrobeHeightCm(frame.height, b)} cm (${frame.height} body + ${liftCm} base)`
      : `${frame.height} cm`;

  const sectionDims = useMemo(() => {
    const dims: { x: number; width: number; label: string }[] = [];
    let x = PT;
    for (const section of sections) {
      const sw = section.width * CM;
      dims.push({ x, width: sw, label: `${Math.round(section.width)}` });
      x += sw + PT;
    }
    return dims;
  }, [sections]);

  if (!showDimensions) return null;

  return (
    <group>
      {/* Total width — top of wardrobe */}
      <DimPill
        position={[W / 2, H + 0.06, D / 2]}
        label={`${frame.width} cm`}
      />

      {/* Height — left side */}
      <DimPill
        position={[-0.06, H / 2, D / 2]}
        label={heightLabel}
      />

      {/* Depth — bottom right */}
      <DimPill
        position={[W + 0.06, 0.03, 0]}
        label={`${frame.depth} cm`}
      />

      {/* Per-section widths — bottom edge */}
      {sections.length > 1 &&
        sectionDims.map((dim, i) => (
          <DimPill
            key={i}
            position={[dim.x + dim.width / 2, -0.05, D / 2]}
            label={`${dim.label} cm`}
          />
        ))}
    </group>
  );
}
