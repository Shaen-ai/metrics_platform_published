"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useWardrobeStore } from "../wardrobe/store";
import { WardrobeRoomContext } from "../wardrobe/WardrobeRoomContext";
import {
  computeWardrobeSheetLayout,
  wardrobePanelPlacementsFromLayout,
  type WardrobePanelPlacements,
  type WardrobeSheetLayout,
} from "./wardrobeSheetLayoutCore";

export interface WardrobeSheetLayoutBundle {
  layout: WardrobeSheetLayout;
  placements: WardrobePanelPlacements;
}

const WardrobeSheetLayoutBundleContext =
  createContext<WardrobeSheetLayoutBundle | null>(null);

export function useWardrobeSheetLayoutBundle(): WardrobeSheetLayoutBundle {
  const bundle = useContext(WardrobeSheetLayoutBundleContext);
  if (!bundle) {
    throw new Error(
      "Wardrobe sheet layout hooks require WardrobeStandaloneSheetLayoutProvider or WardrobeEmbedSheetLayoutProvider",
    );
  }
  return bundle;
}

/** Used by the standalone `/planners/wardrobe` app (store config + catalogs). */
export function WardrobeStandaloneSheetLayoutProvider({
  children,
}: {
  children: ReactNode;
}) {
  const config = useWardrobeStore((s) => s.config);
  const frameMaterials = useWardrobeStore((s) => s.availableMaterials);
  const doorMaterials = useWardrobeStore((s) => s.availableDoorMaterials);
  const sheetPlacementOverrides = useWardrobeStore((s) => s.sheetPlacementOverrides);
  const sheetManualExtraSheetsByMaterial = useWardrobeStore(
    (s) => s.sheetManualExtraSheetsByMaterial,
  );
  const wardrobeSheetSizeOverrideCm = useWardrobeStore(
    (s) => s.wardrobeSheetSizeOverrideCm,
  );

  const room = useWardrobeStore((s) => s.room);
  const bundle = useMemo((): WardrobeSheetLayoutBundle => {
    const layout = computeWardrobeSheetLayout({
      config,
      frameMaterials,
      doorMaterials,
      sheetPlacementOverrides,
      sheetManualExtraSheetsByMaterial,
      wardrobeSheetSizeOverrideCm,
      room,
    });
    return {
      layout,
      placements: wardrobePanelPlacementsFromLayout(layout),
    };
  }, [
    config,
    frameMaterials,
    doorMaterials,
    sheetPlacementOverrides,
    sheetManualExtraSheetsByMaterial,
    wardrobeSheetSizeOverrideCm,
    room,
  ]);

  return (
    <WardrobeSheetLayoutBundleContext.Provider value={bundle}>
      {children}
    </WardrobeSheetLayoutBundleContext.Provider>
  );
}

/**
 * Embed (bedroom planner) tree: WardrobeRoomContext must wrap this provider.
 * Materials come from embed; overrides / manual sheets still mirror the planner store.
 */
export function WardrobeEmbedSheetLayoutProvider({
  children,
}: {
  children: ReactNode;
}) {
  const embed = useContext(WardrobeRoomContext);
  const sheetPlacementOverrides = useWardrobeStore((s) => s.sheetPlacementOverrides);
  const sheetManualExtraSheetsByMaterial = useWardrobeStore(
    (s) => s.sheetManualExtraSheetsByMaterial,
  );
  const wardrobeSheetSizeOverrideCm = useWardrobeStore(
    (s) => s.wardrobeSheetSizeOverrideCm,
  );

  if (!embed) {
    throw new Error(
      "WardrobeEmbedSheetLayoutProvider must be used under WardrobeRoomContext.Provider",
    );
  }

  const bundle = useMemo((): WardrobeSheetLayoutBundle => {
    const layout = computeWardrobeSheetLayout({
      config: embed.config,
      frameMaterials: embed.availableMaterials,
      doorMaterials: embed.availableDoorMaterials,
      sheetPlacementOverrides,
      sheetManualExtraSheetsByMaterial,
      wardrobeSheetSizeOverrideCm,
      room: embed.plannerRoom,
      layoutLegCount: embed.layoutLegCount,
    });
    return {
      layout,
      placements: wardrobePanelPlacementsFromLayout(layout),
    };
  }, [
    embed,
    sheetPlacementOverrides,
    sheetManualExtraSheetsByMaterial,
    wardrobeSheetSizeOverrideCm,
  ]);

  return (
    <WardrobeSheetLayoutBundleContext.Provider value={bundle}>
      {children}
    </WardrobeSheetLayoutBundleContext.Provider>
  );
}

export function useWardrobeSheetLayout(): WardrobeSheetLayout {
  return useWardrobeSheetLayoutBundle().layout;
}
