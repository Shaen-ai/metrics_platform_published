/**
 * Stable bay/section hues for wardrobe sheet viewer — makes pieces from the
 * same section easier to spot without affecting packing.
 */

/** -1 = frame / plinth / sides not tied to a numbered bay. */
export function wardrobePanelSectionGroup(panelId: string): number {
  const base = (panelId.split("#")[0] ?? panelId).split(".addon.")[0] ?? "";
  const mShelf = /^interior\.(?:shelf|drawer)\.(\d+)\./.exec(base);
  if (mShelf) return parseInt(mShelf[1]!, 10);
  const mHinged = /^door\.hinged\.(\d+)\./.exec(base);
  if (mHinged) return parseInt(mHinged[1]!, 10);
  const mSlide = /^door\.sliding\.(\d+)/.exec(base);
  if (mSlide) return parseInt(mSlide[1]!, 10);
  const mDiv = /^frame\.divider\.(\d+)/.exec(base);
  if (mDiv) return parseInt(mDiv[1]!, 10);
  return -1;
}

export function wardrobePanelStrokeColor(sectionGroup: number, enabled: boolean): string {
  if (!enabled) return "rgba(0,0,0,0.55)";
  if (sectionGroup < 0) return "rgba(55, 65, 85, 0.88)";
  const hue = (sectionGroup * 47 + 18) % 360;
  return `hsl(${hue} 58% 38% / 0.9)`;
}
