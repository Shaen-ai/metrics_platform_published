"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import ConfigSidebar from "./ConfigSidebar";
import HeaderToolbar from "./HeaderToolbar";
import TemplatesOverlay from "./TemplatesOverlay";
import { useWardrobeStore } from "./store";
import { useStore } from "@/lib/store";
import { useResolvedAdmin } from "@/contexts/PublishedTenantProvider";
import { filterMaterialsForPlanner } from "@/lib/plannerMaterials";
import {
  materialsFromStore,
  doorFrontMaterialsFromStore,
  slidingMechanismsFromStore,
  handleMaterialsFromStore,
  withDefaultWardrobeDoorFinishes,
  INTERNAL_RENDER_FALLBACK,
} from "./data";
import "./wardrobe.css";

const WardrobeCanvas = dynamic(() => import("./WardrobeCanvas"), {
  ssr: false,
  loading: () => (
    <div className="wardrobe-canvas-wrapper wardrobe-canvas-loading">
      <div className="canvas-loading-spinner" />
      <span>Loading 3D scene...</span>
    </div>
  ),
});

export default function WardrobeLayout() {
  const rawMaterials = useStore((s) => s.materials);
  const admin = useResolvedAdmin();
  const setAvailableMaterials = useWardrobeStore((s) => s.setAvailableMaterials);

  useEffect(() => {
    const storeMaterials = filterMaterialsForPlanner(rawMaterials, admin?.plannerMaterialIds);
    const frameMats = materialsFromStore(storeMaterials, admin?.companyName);
    const doorMats = withDefaultWardrobeDoorFinishes(
      doorFrontMaterialsFromStore(storeMaterials, admin?.companyName),
    );
    const slideMats = slidingMechanismsFromStore(storeMaterials, admin?.companyName);
    const handleMats = handleMaterialsFromStore(storeMaterials, admin?.companyName);
    setAvailableMaterials(frameMats, doorMats, slideMats, handleMats);

    const st = useWardrobeStore.getState();
    if (slideMats.length > 0) {
      const mechIds = new Set(slideMats.map((m) => m.id));
      if (!mechIds.has(st.config.doors.slidingMechanismId)) {
        st.setSlidingMechanism(slideMats[0]!.id);
      }
    } else if (st.config.doors.slidingMechanismId !== INTERNAL_RENDER_FALLBACK.id) {
      st.setSlidingMechanism(INTERNAL_RENDER_FALLBACK.id);
    }

    const handleIds = new Set(handleMats.map((m) => m.id));
    if (st.config.doors.handleMaterialId && !handleIds.has(st.config.doors.handleMaterialId)) {
      st.setDoorHandleMaterial(undefined);
    }

    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const preselect = params.get("material");
    const ids = new Set(frameMats.map((m) => m.id));
    if (preselect && ids.has(preselect)) {
      st.setFrameMaterial(preselect);
      st.setInteriorMaterial(preselect);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [rawMaterials, admin, setAvailableMaterials]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        useWardrobeStore.getState().undo();
      }
      if (isMeta && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        useWardrobeStore.getState().redo();
      }
      if (isMeta && e.key === "y") {
        e.preventDefault();
        useWardrobeStore.getState().redo();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="wardrobe-layout">
      <HeaderToolbar />
      <div className="wardrobe-body">
        <div className="wardrobe-main">
          <WardrobeCanvas />
        </div>
        <aside className="wardrobe-sidebar">
          <ConfigSidebar />
        </aside>
      </div>
      <TemplatesOverlay />
    </div>
  );
}
