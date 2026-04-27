"use client";

import { useMemo } from "react";
import type { FloorStyle } from "../types";
import { createLaminateThumbnailDataUrl } from "../scene/RoomMesh";

interface FloorSwatchProps {
  style: FloorStyle;
  label: string;
  selected: boolean;
  onClick: () => void;
}

/** Swatch showing large rectangular laminate planks (not square tiles) */
export default function FloorSwatch({ style, label, selected, onClick }: FloorSwatchProps) {
  const dataUrl = useMemo(
    () => createLaminateThumbnailDataUrl(style, 88, 56),
    [style]
  );

  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="floor-swatch"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 6,
        padding: 6,
        border: selected ? "2px solid var(--primary)" : "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--background)",
        cursor: "pointer",
        minWidth: 0,
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: selected ? "0 0 0 1px var(--primary)" : undefined,
      }}
    >
      <div
        style={{
          width: "100%",
          aspectRatio: "88/56",
          borderRadius: 6,
          overflow: "hidden",
          background: "var(--muted)",
          flexShrink: 0,
        }}
      >
        <img
          src={dataUrl}
          alt={label}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      </div>
      <span
        style={{
          fontSize: 10,
          fontWeight: 500,
          color: "var(--foreground)",
          textAlign: "center",
          lineHeight: 1.2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          width: "100%",
          display: "block",
        }}
        title={label}
      >
        {label}
      </span>
    </button>
  );
}
