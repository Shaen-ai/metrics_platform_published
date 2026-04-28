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
import { filterMaterialsForPlanner } from "@/lib/plannerMaterials";
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
    const storeMaterials = filterMaterialsForPlanner(rawMaterials, admin?.plannerMaterialIds);
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

  useEffect(() => {
    /**
     * Block planner undo/redo only where native text undo should win (long text, selects).
     * Draft numeric fields use type="text" + inputMode=decimal — those must NOT block Ctrl+Z.
     */
    function blocksPlannerUndoRedo(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      if (target.isContentEditable) return true;
      if (target instanceof HTMLTextAreaElement) return true;
      if (target instanceof HTMLSelectElement) return true;
      if (target instanceof HTMLInputElement) {
        if (target.inputMode === "decimal" || target.inputMode === "numeric") return false;
        const t = target.type;
        if (
          t === "checkbox" ||
          t === "radio" ||
          t === "button" ||
          t === "submit" ||
          t === "reset" ||
          t === "file" ||
          t === "hidden"
        ) {
          return false;
        }
        if (t === "number" || t === "range" || t === "color" || t === "date" || t === "time") {
          return false;
        }
        return true;
      }
      return false;
    }

    /**
     * Backspace/Delete must keep editing in text fields; don't remove a cabinet while typing.
     * Range sliders (W/H/D in ModuleSizeEditor) are not text — blocking delete there made "corner" /
     * corner-base units feel undeletable after adjusting a slider.
     */
    function blocksDeleteShortcut(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      if (target.isContentEditable) return true;
      if (target instanceof HTMLTextAreaElement) return true;
      if (target instanceof HTMLSelectElement) return true;
      if (target instanceof HTMLInputElement) {
        if (target.inputMode === "decimal" || target.inputMode === "numeric") return true;
        const t = target.type;
        if (
          t === "checkbox" ||
          t === "radio" ||
          t === "button" ||
          t === "submit" ||
          t === "reset" ||
          t === "file" ||
          t === "hidden"
        ) {
          return false;
        }
        if (t === "range" || t === "color" || t === "date" || t === "time") {
          return false;
        }
        return true;
      }
      return false;
    }

    function deleteSelectedModule() {
      const st = useKitchenStore.getState();
      const { ui } = st;
      if (ui.selectedCornerUnit && st.config.cornerUnit.enabled) {
        st.setCornerUnitEnabled(false);
        return;
      }
      if (ui.selectedBaseModuleId) {
        st.removeBaseModule(ui.selectedBaseModuleId);
        return;
      }
      if (ui.selectedWallModuleId) {
        st.removeWallModule(ui.selectedWallModuleId);
        return;
      }
      if (ui.selectedIslandBaseModuleId) {
        st.removeIslandBaseModule(ui.selectedIslandBaseModuleId);
        return;
      }
      if (ui.selectedIslandWallModuleId) {
        st.removeIslandWallModule(ui.selectedIslandWallModuleId);
        return;
      }
      if (ui.selectedLeftBaseModuleId) {
        st.removeLeftBaseModule(ui.selectedLeftBaseModuleId);
        return;
      }
      if (ui.selectedLeftWallModuleId) {
        st.removeLeftWallModule(ui.selectedLeftWallModuleId);
        return;
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      const isMeta = e.metaKey || e.ctrlKey;
      const keyLower = e.key.toLowerCase();

      // Undo / redo / Ctrl+Y
      if (isMeta && !blocksPlannerUndoRedo(e.target)) {
        if (keyLower === "z") {
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey) useKitchenStore.getState().redo();
          else useKitchenStore.getState().undo();
          return;
        }
        if (keyLower === "y") {
          e.preventDefault();
          e.stopPropagation();
          useKitchenStore.getState().redo();
          return;
        }
      }

      // Delete / Backspace: remove selected run module (not while editing a field)
      if (!isMeta && (e.key === "Delete" || e.key === "Backspace") && !blocksDeleteShortcut(e.target)) {
        e.preventDefault();
        e.stopPropagation();
        deleteSelectedModule();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

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
