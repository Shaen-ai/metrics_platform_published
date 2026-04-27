"use client";

import { useContext } from "react";
import { WardrobeRoomContext, type WardrobeRoomEmbedValue } from "./WardrobeRoomContext";
import WardrobeBase3D from "./WardrobeBase3D";
import WardrobeFrame3D from "./WardrobeFrame3D";
import WardrobeInterior3D from "./WardrobeInterior3D";
import WardrobeDoors3D from "./WardrobeDoors3D";
import { clampWardrobeBase, wardrobeBaseLiftCm } from "./data";

const CM = 0.01;
const EMPTY_ADDONS: { id: string; position: "right" | "top" }[] = [];

function WardrobeSingleModule3D({ liftM }: { liftM: number }) {
  return (
    <>
      <WardrobeBase3D />
      <group position={[0, liftM, 0]}>
        <WardrobeFrame3D />
        <WardrobeInterior3D />
        <WardrobeDoors3D />
      </group>
    </>
  );
}

function WardrobeModulesGroupInner() {
  const ctx = useContext(WardrobeRoomContext);
  if (!ctx) return null;

  const config = ctx.config;
  const frame = config.frame;
  const base = config.base;
  const W = frame.width * CM;
  const H = frame.height * CM;
  const b = clampWardrobeBase(base);
  const liftM = wardrobeBaseLiftCm(b) * CM;
  const addons = config.addons ?? EMPTY_ADDONS;
  const seamStyle = config.seamStyle ?? "independent";
  const seamOffsetM = seamStyle === "shared" ? -0.018 : 0;

  let rightCount = 0;
  let topCount = 0;
  const addonTransforms = addons.map((addon) => {
    if (addon.position === "right") {
      rightCount += 1;
      return { id: addon.id, xM: (W + seamOffsetM) * rightCount, yM: 0 };
    }
    topCount += 1;
    return { id: addon.id, xM: 0, yM: (H + seamOffsetM) * topCount };
  });
  const totalRightM = rightCount * (W + seamOffsetM);
  const baseX = -(W + totalRightM) / 2;

  return (
    <group position={[baseX, 0, 0]}>
      <WardrobeSingleModule3D liftM={liftM} />
      {addonTransforms.map((t) => (
        <group key={t.id} position={[t.xM, 0, 0]}>
          <WardrobeBase3D />
          <group position={[0, liftM + t.yM, 0]}>
            <WardrobeFrame3D />
            <WardrobeInterior3D />
            <WardrobeDoors3D />
          </group>
        </group>
      ))}
    </group>
  );
}

/** Full procedural wardrobe for room planner; requires provider value with materials resolved from admin catalog. */
export function WardrobeModulesInRoom({ value }: { value: WardrobeRoomEmbedValue }) {
  return (
    <WardrobeRoomContext.Provider value={value}>
      <WardrobeModulesGroupInner />
    </WardrobeRoomContext.Provider>
  );
}
