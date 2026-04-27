"use client";

import KitchenShapeWizard from "./KitchenShapeWizard";
import { usePlannerStore } from "../store/usePlannerStore";
import { usePlannerType } from "../context";
import {
  buildKitchenOutline,
  bboxSizeFromOutline,
  DEFAULT_KITCHEN_SHAPE_PARAMS,
} from "../utils/kitchenFloorTemplates";

export default function KitchenSetupWizard() {
  const plannerConfig = usePlannerType();
  const room = usePlannerStore((s) => s.room);
  const setRoom = usePlannerStore((s) => s.setRoom);
  const setKitchenSetupComplete = usePlannerStore((s) => s.setKitchenSetupComplete);
  const lengthUnit = usePlannerStore((s) => s.ui.lengthUnit);

  return (
    <KitchenShapeWizard
      lengthUnit={lengthUnit}
      showOpeningsUi
      shapeStepSubtitle="Select a shape to start your floor plan. You can adjust dimensions and openings next, then design in 3D."
      layoutStepSubtitle="Set overall size, pick a wall segment, then add doors and windows. Dashed edges are open to adjoining spaces."
      continueButtonLabel="Continue to 3D planner"
      onFinish={({ outline, openEdgeIndices, bbox, openings }) => {
        setRoom({
          ...room,
          width: bbox.width,
          depth: bbox.depth,
          height: room.height || plannerConfig?.defaultRoom?.height || 2.8,
          floorOutline: outline,
          openEdgeIndices,
          openings,
          floorStyle: room.floorStyle ?? plannerConfig?.defaultRoom?.floorStyle ?? "laminate-light-oak",
        });
        setKitchenSetupComplete(true);
      }}
      onSkip={() => {
        const { outline: o, openEdgeIndices: oe } = buildKitchenOutline("square", {
          spanM: DEFAULT_KITCHEN_SHAPE_PARAMS.spanM,
        });
        const { width, depth } = bboxSizeFromOutline(o);
        setRoom({
          ...room,
          width,
          depth,
          height: room.height || plannerConfig?.defaultRoom?.height || 2.8,
          floorOutline: o,
          openEdgeIndices: oe,
          openings: [],
          floorStyle: room.floorStyle ?? "laminate-light-oak",
        });
        setKitchenSetupComplete(true);
      }}
    />
  );
}
