"use client";

import { useContext, useMemo } from "react";
import { WardrobeRoomContext } from "./WardrobeRoomContext";
import { useWardrobeStore } from "./store";
import { wardrobeConfigWithFrameWidth } from "./data";
import { useWardrobeLegLayout } from "./WardrobeLegLayoutContext";
import type { WardrobeConfig } from "./types";

/** Resolved module dimensions for the active layout leg (scaled runs vs configured width). */
export function useWardrobeRenderedConfig(): WardrobeConfig {
  const embed = useContext(WardrobeRoomContext);
  const storeConfig = useWardrobeStore((s) => s.config);
  const base = embed?.config ?? storeConfig;
  const leg = useWardrobeLegLayout();

  return useMemo(() => {
    if (!leg) return base;
    if (Math.abs(leg.frameWidthCm - base.frame.width) < 0.05) return base;
    return wardrobeConfigWithFrameWidth(base, leg.frameWidthCm);
  }, [base, leg?.frameWidthCm]);
}
