"use client";

import { useContext, useMemo } from "react";
import { WardrobeEmbedSheetLayoutProvider } from "../sheet/useWardrobeSheetLayout";
import { WardrobeRoomContext, type WardrobeRoomEmbedValue } from "./WardrobeRoomContext";
import WardrobeBase3D from "./WardrobeBase3D";
import WardrobeFrame3D from "./WardrobeFrame3D";
import WardrobeInterior3D from "./WardrobeInterior3D";
import WardrobeDoors3D from "./WardrobeDoors3D";
import {
  clampWardrobeBase,
  wardrobeBaseLiftCm,
  wardrobeConfigWithFrameWidth,
  wardrobeEmbedRowLayoutFromConfig,
} from "./data";
import {
  WARDROBE_LEG_GROUP_Z_BUMP_M,
  wardrobeBridgeLiftMeters,
  wardrobeCompositionWidthMeters,
  wardrobeLayoutGeometry,
  wardrobeLayoutLegItems,
} from "./wardrobeSpaceLayout";
import { WardrobeLegLayoutProvider } from "./WardrobeLegLayoutContext";
import { wardrobePlacementFootprintBounds } from "./plannerWardrobeCatalog";

const CM = 0.01;
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

function WardrobeEmbeddedComposition({ ctx }: { ctx: WardrobeRoomEmbedValue }) {
  const config = ctx.config;
  const frame = config.frame;
  const base = config.base;
  const b = clampWardrobeBase(base);
  const liftM = wardrobeBaseLiftCm(b) * CM;

  const plannerRoom = ctx.plannerRoom;
  const legItems = useMemo(() => {
    const Wtot = wardrobeCompositionWidthMeters(config);
    const D_m = config.frame.depth * CM;
    if (plannerRoom) {
      return wardrobeLayoutLegItems(plannerRoom, Wtot, D_m);
    }
    return [
      {
        xM: 0,
        zM: 0,
        rotationY: 0,
        label: "Run A",
        frameWidthCm: config.frame.width,
        legRole: "back" as const,
      },
    ];
  }, [plannerRoom, config]);

  const bridgeExtraY =
    plannerRoom && wardrobeLayoutGeometry(plannerRoom) === "bridge"
      ? wardrobeBridgeLiftMeters(plannerRoom)
      : 0;

  const originShift = useMemo(
    () => wardrobePlacementFootprintBounds(config, plannerRoom),
    [config, plannerRoom],
  );

  return (
    <group position={[-originShift.centerX, 0, -originShift.centerZ]}>
      {legItems.map((leg, legIdx) => {
        const legCfg = wardrobeConfigWithFrameWidth(config, leg.frameWidthCm);
        const row = wardrobeEmbedRowLayoutFromConfig(legCfg);
        return (
          <group
            key={`${leg.label}-${legIdx}`}
            position={[leg.xM, bridgeExtraY, leg.zM]}
            rotation={[0, leg.rotationY, 0]}
          >
            <WardrobeLegLayoutProvider frameWidthCm={leg.frameWidthCm}>
              <group position={[row.baseX, 0, WARDROBE_LEG_GROUP_Z_BUMP_M]}>
                <WardrobeSingleModule3D liftM={liftM} />
                {row.addonTransforms.map((t) => (
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
            </WardrobeLegLayoutProvider>
          </group>
        );
      })}
    </group>
  );
}

function WardrobeModulesGroupInner() {
  const ctx = useContext(WardrobeRoomContext);
  if (!ctx) return null;
  return <WardrobeEmbeddedComposition ctx={ctx} />;
}

/** Full procedural wardrobe for room planner; requires provider value with materials resolved from admin catalog. */
export function WardrobeModulesInRoom({ value }: { value: WardrobeRoomEmbedValue }) {
  return (
    <WardrobeRoomContext.Provider value={value}>
      <WardrobeEmbedSheetLayoutProvider>
        <WardrobeModulesGroupInner />
      </WardrobeEmbedSheetLayoutProvider>
    </WardrobeRoomContext.Provider>
  );
}
