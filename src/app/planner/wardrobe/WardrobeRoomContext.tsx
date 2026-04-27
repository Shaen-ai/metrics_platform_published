"use client";

import { createContext, useContext } from "react";
import type { WardrobeConfig } from "./types";
import type { WardrobeMaterial } from "./data";

export type WardrobeRoomEmbedValue = {
  config: WardrobeConfig;
  availableMaterials: WardrobeMaterial[];
  availableDoorMaterials: WardrobeMaterial[];
  availableSlidingMechanisms: WardrobeMaterial[];
  availableHandleMaterials: WardrobeMaterial[];
};

export const WardrobeRoomContext = createContext<WardrobeRoomEmbedValue | null>(null);

export function useWardrobeRoomContextValue(): WardrobeRoomEmbedValue | null {
  return useContext(WardrobeRoomContext);
}
