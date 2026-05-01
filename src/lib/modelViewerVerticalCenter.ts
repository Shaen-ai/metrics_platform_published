import type { ModelViewerElement } from "@google/model-viewer";

/** Full `<model-viewer>` element type (callbacks use the same refs as framing helpers). */
export type ModelViewerFramingSubset = ModelViewerElement;

/**
 * Catalog listings use different tiles; tweak how far the orbit focal point shifts
 * below the bbox center so the mesh reads vertically centered per layout.
 */
export type CatalogListingFraming = "compact" | "card" | "wideRow";

/** Fraction of model height — lower camera target ⇒ mesh sits higher in the frame. */
const LISTING_VERTICAL_NUDGE: Record<CatalogListingFraming, number> = {
  /** Masonry / reels / gallery (and PDP when unset). */
  compact: 0.09,
  /** Grid + magazine tiles / hero bands. */
  card: 0.2,
  /** List-layout row thumbnails (wide left strip). */
  wideRow: 0.29,
};

const MIN_LAYOUT_PX = 12;

async function layoutReadyForFraming(mv: ModelViewerFramingSubset): Promise<boolean> {
  await mv.updateComplete;
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
  const rect = mv.getBoundingClientRect();
  return rect.width >= MIN_LAYOUT_PX && rect.height >= MIN_LAYOUT_PX;
}

/**
 * Tall tiles and shallow rows often frame the mesh low.
 * Shifting the orbit focal point slightly below the bounding-box center lifts the bulk,
 * then framing is recomputed.
 *
 * model-viewer's framing reads `<model-viewer>` box size — if layout is still 0×0 or unstable,
 * the default camera survives. Prefer calling after resize/settle (`layoutReadyForFraming`)
 * inside this helper plus a ResizeObserver from the embedding surface.
 */
export async function tuneModelViewerVerticalCenter(
  mv: ModelViewerFramingSubset,
  listingFraming: CatalogListingFraming = "compact",
): Promise<void> {
  if (!mv.loaded) return;

  try {
    if (!(await layoutReadyForFraming(mv))) return;

    const center = mv.getBoundingBoxCenter();
    const dims = mv.getDimensions();
    const h = Math.max(dims.y, Number.EPSILON);
    const frac =
      LISTING_VERTICAL_NUDGE[listingFraming] ?? LISTING_VERTICAL_NUDGE.compact;
    const yNudge = h * frac;

    mv.cameraTarget = `${center.x}m ${center.y - yNudge}m ${center.z}m`;
    await mv.updateFraming();
    mv.jumpCameraToGoal();
  } catch {
    // Framing helpers can fail on malformed or degenerate meshes; UI still shows the scene.
  }
}
