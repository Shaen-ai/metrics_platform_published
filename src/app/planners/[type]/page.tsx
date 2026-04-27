"use client";

import { useState, useEffect } from "react";
import { useParams, notFound } from "next/navigation";
import dynamic from "next/dynamic";
import { getPlannerConfig } from "../config";
import { PlannerTypeProvider } from "../../planner/context";
import { usePlannerStore } from "../../planner/store/usePlannerStore";
import { useStore } from "@/lib/store";
import Sidebar from "../../planner/components/Sidebar";
import TopBar from "../../planner/components/TopBar";
import RoomDesigner from "../../planner/components/RoomDesigner";
import KitchenSetupWizard from "../../planner/components/KitchenSetupWizard";
import AIPlannerShell from "../../planner/ai-room/AIPlannerShell";
import "../../planner/planner.css";

const CanvasScene = dynamic(
  () => import("../../planner/components/CanvasScene"),
  {
    ssr: false,
    loading: () => (
      <div
        className="planner-canvas-wrapper"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#999",
          fontSize: 14,
        }}
      >
        Loading 3D scene...
      </div>
    ),
  }
);

const WardrobeLayout = dynamic(
  () => import("../../planner/wardrobe/WardrobeLayout"),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          color: "#999",
          fontSize: 14,
        }}
      >
        Loading Wardrobe Planner...
      </div>
    ),
  }
);

const KitchenLayout = dynamic(
  () => import("../../planner/kitchen/KitchenLayout"),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          color: "#999",
          fontSize: 14,
        }}
      >
        Loading Kitchen Planner...
      </div>
    ),
  }
);

const ModulePlannerLayout = dynamic(
  () => import("../../planner/module-planner/ModulePlannerLayout"),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          color: "#999",
          fontSize: 14,
        }}
      >
        Loading Module Planner...
      </div>
    ),
  }
);

const CustomDesignPlannerLayout = dynamic(
  () => import("../../planner/custom-design/CustomDesignPlannerLayout"),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          color: "#999",
          fontSize: 14,
        }}
      >
        Loading Custom planner...
      </div>
    ),
  }
);


export default function DynamicPlannerPage() {
  const params = useParams();
  const type = params.type as string;
  const config = getPlannerConfig(type);
  const initPlanner = usePlannerStore((s) => s.initPlanner);
  const fetchCatalog = usePlannerStore((s) => s.fetchCatalog);
  const kitchenSetupComplete = usePlannerStore((s) => s.kitchenSetupComplete);
  const { admin, initializeStore, initialized } = useStore();

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    initializeStore();
  }, [initializeStore]);

  const adminSlug = admin?.slug || "demo";

  useEffect(() => {
    if (config && !config.customLayout) {
      initPlanner(config.id, config.defaultRoom, adminSlug);
    }
    setMounted(true);
  }, [config, initPlanner, adminSlug]);

  useEffect(() => {
    if (!config || config.customLayout) return;
    if (!initialized) return;
    const slug = admin?.slug || "demo";
    fetchCatalog(slug, config.id);
  }, [
    config?.id,
    config?.customLayout,
    initialized,
    admin?.slug,
    admin?.useCustomPlannerCatalog,
    fetchCatalog,
  ]);

  if (!config) {
    notFound();
  }

  if (config.customLayout && type === "wardrobe") {
    return <WardrobeLayout />;
  }

  if (config.customLayout && type === "kitchen-design") {
    return <KitchenLayout />;
  }

  if (config.customLayout && type === "module-planner") {
    return <ModulePlannerLayout />;
  }

  if (config.customLayout && type === "custom-design") {
    return <CustomDesignPlannerLayout />;
  }

  if (!mounted) {
    return (
      <div className="planner-layout">
        <aside className="planner-sidebar" />
        <div className="planner-main">
          <div className="planner-topbar" />
          <div
            className="planner-canvas-wrapper"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#999",
              fontSize: 14,
            }}
          >
            Loading {config.name}...
          </div>
        </div>
      </div>
    );
  }

  if (type === "kitchen" && !kitchenSetupComplete) {
    return (
      <PlannerTypeProvider config={config}>
        <KitchenSetupWizard />
      </PlannerTypeProvider>
    );
  }

  if (type === "ai-room") {
    return (
      <PlannerTypeProvider config={config}>
        <AIPlannerShell>
          <Sidebar />
          <div className="planner-ai-main">
            <TopBar />
            <CanvasScene />
          </div>
        </AIPlannerShell>
        <RoomDesigner />
      </PlannerTypeProvider>
    );
  }

  return (
    <PlannerTypeProvider config={config}>
      <div className="planner-layout">
        <Sidebar />
        <div className="planner-main">
          <TopBar />
          <CanvasScene />
        </div>
        <RoomDesigner />
      </div>
    </PlannerTypeProvider>
  );
}
