"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import KitchenConfigSidebar from "./ConfigSidebar";
import KitchenPriceSummary from "./KitchenPriceSummary";
import KitchenHeaderToolbar from "./HeaderToolbar";
import KitchenTemplatesOverlay from "./TemplatesOverlay";
import KitchenDesignShapeWizard from "./KitchenDesignShapeWizard";
import { useKitchenStore } from "./store";
import { useStore } from "@/lib/store";
import { useResolvedAdmin } from "@/contexts/PublishedTenantProvider";
import { filterMaterialsForPlanner, isBoardFinishMaterial, mergeDefaultBoardMaterialsWhenMissing } from "@/lib/plannerMaterials";
import {
  materialsFromStore,
  worktopMaterialsFromStore,
  handleMaterialsFromStore,
  NEUTRAL_KITCHEN_MATERIAL,
  clampConfigMaterialsToAvailable,
} from "./data";
import "../planner.css";
import "./kitchen.css";

const KitchenCanvas = dynamic(() => import("./KitchenCanvas"), {
  ssr: false,
  loading: () => (
    <div className="kitchen-canvas-wrapper kitchen-canvas-loading">
      <div className="canvas-loading-spinner" />
      <span>Loading 3D scene…</span>
    </div>
  ),
});

export default function KitchenLayout() {
  const kitchenDesignSetupComplete = useKitchenStore((s) => s.kitchenDesignSetupComplete);
  const rawMaterials = useStore((s) => s.materials);
  const admin = useResolvedAdmin();
  const setAvailableMaterials = useKitchenStore((s) => s.setAvailableMaterials);
  const setAvailableWorktopMaterials = useKitchenStore((s) => s.setAvailableWorktopMaterials);
  const setConfigForHydrate = useKitchenStore((s) => s.setConfigForHydrate);

  useEffect(() => {
    const storeMaterials = mergeDefaultBoardMaterialsWhenMissing(
      filterMaterialsForPlanner(rawMaterials, admin?.plannerMaterialIds),
      admin?.id,
      isBoardFinishMaterial,
      admin?.plannerMaterialIds,
    );
    const converted = materialsFromStore(storeMaterials, admin?.companyName);
    const worktops = worktopMaterialsFromStore(storeMaterials, admin?.companyName);
    const handleMats = handleMaterialsFromStore(storeMaterials, admin?.companyName);
    const palette =
      converted.length > 0 ? converted : [NEUTRAL_KITCHEN_MATERIAL];
    setAvailableMaterials(palette, palette, handleMats);
    setAvailableWorktopMaterials(worktops);

    let st = useKitchenStore.getState();
    const clamped = clampConfigMaterialsToAvailable(
      st.config,
      palette,
      palette,
      worktops,
      handleMats,
    );
    if (JSON.stringify(clamped) !== JSON.stringify(st.config)) {
      setConfigForHydrate(clamped);
      st = useKitchenStore.getState();
    }

    const ids = new Set(palette.map((m) => m.id));
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const preselect = params.get("material");
      if (preselect && ids.has(preselect)) {
        st.setCabinetMaterial(preselect);
        st.setDoorMaterial(preselect);
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, [rawMaterials, admin, setAvailableMaterials, setAvailableWorktopMaterials, setConfigForHydrate]);

  if (!kitchenDesignSetupComplete) {
    return <KitchenDesignShapeWizard />;
  }

  return (
    <div className="kitchen-layout">
      <KitchenHeaderToolbar />
      <div className="kitchen-body">
        <div className="kitchen-main">
          <KitchenCanvas />
        </div>
        <aside className="kitchen-sidebar">
          <div className="kitchen-sidebar-stack">
            <KitchenConfigSidebar />
            <KitchenPriceSummary />
          </div>
        </aside>
      </div>
      <KitchenTemplatesOverlay />
    </div>
  );
}
