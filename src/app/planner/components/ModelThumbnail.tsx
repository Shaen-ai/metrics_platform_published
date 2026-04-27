"use client";

import { useState, useEffect } from "react";
import { getModelThumbnail } from "../utils/modelThumbnail";
import { PlannerCatalogItem } from "../types";

interface ModelThumbnailProps {
  item: PlannerCatalogItem;
  className?: string;
}

/**
 * Renders a thumbnail of a furniture model. Shows a colored square placeholder
 * while the GLB is loaded and rendered, then displays the generated image.
 */
export default function ModelThumbnail({ item, className }: ModelThumbnailProps) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!item.modelPath || failed) return;

    let cancelled = false;
    getModelThumbnail(item.modelPath, item.width, item.depth, item.height)
      .then((url) => {
        if (!cancelled) setThumbnailUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [item.modelPath, item.width, item.depth, item.height, failed]);

  if (thumbnailUrl) {
    return (
      <img
        src={thumbnailUrl}
        alt={item.name}
        className={className}
      />
    );
  }

  return (
    <div
      className={className}
      style={{ backgroundColor: item.color }}
    />
  );
}
