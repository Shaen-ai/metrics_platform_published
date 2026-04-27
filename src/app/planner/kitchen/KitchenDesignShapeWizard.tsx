"use client";

import KitchenShapeWizard from "../components/KitchenShapeWizard";
import { usePlannerStore } from "../store/usePlannerStore";
import { useKitchenStore } from "./store";

/** Persists full 2D outline + bbox so the designer room matches the wizard (corner box uses bbox). */
export default function KitchenDesignShapeWizard() {
  const lengthUnit = usePlannerStore((s) => s.ui.lengthUnit);

  return (
    <KitchenShapeWizard
      lengthUnit={lengthUnit}
      showOpeningsUi
      shapeStepSubtitle="Pick a footprint template. Designer 3D uses a rectangular corner room sized to the template’s bounding box (L-shapes still help you match real space)."
      layoutStepSubtitle={
        "Adjust the span and legs. The preview shows the full template; the 3D room uses the smallest box that fits it."
      }
      continueButtonLabel="Continue to kitchen designer"
      onFinish={(payload) => {
        useKitchenStore.getState().applyRoomFootprintFromWizard({
          footprintWidthM: payload.bbox.width,
          footprintDepthM: payload.bbox.depth,
          kitchenShapeTemplate: payload.shapeId,
          outline: payload.outline,
          openEdgeIndices: payload.openEdgeIndices,
        });
      }}
      onSkip={() => {
        useKitchenStore.getState().applyRoomFootprintFromWizard({
          footprintWidthM: 5,
          footprintDepthM: 4,
          kitchenShapeTemplate: "square",
          outline: undefined,
          openEdgeIndices: undefined,
        });
      }}
    />
  );
}
