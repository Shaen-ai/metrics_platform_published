/**
 * Wardrobe laminate sheet packing: shared via providers so one optimized pack
 * run feeds Sheets UI, addons overflow, and all 3D UV lookups.
 */

export type {
  MaterialPacking,
  WardrobeSheetLayout,
} from "./wardrobeSheetLayoutCore";
export type { WardrobeSheetLayoutBundle } from "./WardrobeSheetLayoutProviders";
export {
  WardrobeEmbedSheetLayoutProvider,
  WardrobeStandaloneSheetLayoutProvider,
  useWardrobeSheetLayout,
  useWardrobeSheetLayoutBundle,
} from "./WardrobeSheetLayoutProviders";
export type { WardrobeSheetLayoutComputationDeps } from "./wardrobeSheetLayoutCore";
export { computeWardrobeSheetLayout } from "./wardrobeSheetLayoutCore";
