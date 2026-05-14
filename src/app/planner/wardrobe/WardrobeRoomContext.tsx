"use client";

import { createContext, useContext } from "react";
import type { WardrobeConfig, RoomSettings } from "./types";
import type { WardrobeMaterial } from "./data";

export type WardrobeRoomEmbedValue = {
  config: WardrobeConfig;
  availableMaterials: WardrobeMaterial[];
  availableDoorMaterials: WardrobeMaterial[];
  availableSlidingMechanisms: WardrobeMaterial[];
  availableHandleMaterials: WardrobeMaterial[];
  /** When set, multiplies sheet packing like standalone space layouts (saved wardrobes). */
  layoutLegCount?: number;
  /** Full planner room snapshot — drives multi-leg 3D in bedroom when present. */
  plannerRoom?: RoomSettings;
};

export const WardrobeRoomContext = createContext<WardrobeRoomEmbedValue | null>(null);

export function useWardrobeRoomContextValue(): WardrobeRoomEmbedValue | null {
  return useContext(WardrobeRoomContext);
}
