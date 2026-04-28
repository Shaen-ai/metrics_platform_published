"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import RoomDesigner from "./components/RoomDesigner";
import { PlannerTypeProvider } from "./context";
import { getPlannerConfig } from "../planners/config";
import { usePlannerStore } from "./store/usePlannerStore";
import { useStore } from "@/lib/store";
import { useResolvedAdmin } from "@/contexts/PublishedTenantProvider";
import "./planner.css";

const CanvasScene = dynamic(() => import("./components/CanvasScene"), {
  ssr: false,
  loading: () => (
    <div className="planner-canvas-wrapper" style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#999",
      fontSize: 14,
    }}>
      Loading 3D scene...
    </div>
  ),
});

const roomConfig = getPlannerConfig("room")!;

export default function PlannerPage() {
  const initPlanner = usePlannerStore((s) => s.initPlanner);
  const fetchCatalog = usePlannerStore((s) => s.fetchCatalog);
  const { initializeStore, initialized } = useStore();
  const admin = useResolvedAdmin();
  const [mounted, setMounted] = useState(false);

  const adminSlug = admin?.slug || "demo";

  useEffect(() => {
    initializeStore().catch(() => {});
  }, [initializeStore]);

  useEffect(() => {
    initPlanner("room", roomConfig.defaultRoom, adminSlug);
    setMounted(true);
  }, [initPlanner, adminSlug]);

  useEffect(() => {
    if (!initialized) return;
    fetchCatalog(admin?.slug || "demo", "room");
  }, [initialized, admin?.slug, admin?.useCustomPlannerCatalog, fetchCatalog]);

  if (!mounted) {
    return (
      <div className="planner-layout">
        <aside className="planner-sidebar" />
        <div className="planner-main">
          <div className="planner-topbar" />
          <div className="planner-canvas-wrapper" style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#999",
            fontSize: 14,
          }}>
            Loading 3D scene...
          </div>
        </div>
      </div>
    );
  }

  return (
    <PlannerTypeProvider config={roomConfig}>
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
