"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Menu,
  Save,
  Undo2,
  Redo2,
  Download,
  ChevronRight,
  LayoutTemplate,
  Shapes,
} from "lucide-react";
import { useKitchenStore } from "./store";
import { calculatePrice } from "./data";
import { useStore } from "@/lib/store";
import { useResolvedAdmin } from "@/contexts/PublishedTenantProvider";
import { formatPrice } from "@/lib/utils";

export default function KitchenHeaderToolbar() {
  const admin = useResolvedAdmin();
  const currency = admin?.currency ?? "USD";
  const config = useKitchenStore((s) => s.config);
  const canUndo = useKitchenStore((s) => s.canUndo);
  const canRedo = useKitchenStore((s) => s.canRedo);
  const undo = useKitchenStore((s) => s.undo);
  const redo = useKitchenStore((s) => s.redo);
  const setShowTemplates = useKitchenStore((s) => s.setShowTemplates);
  const setKitchenDesignSetupComplete = useKitchenStore((s) => s.setKitchenDesignSetupComplete);
  const availableMaterials = useKitchenStore((s) => s.availableMaterials);
  const availableDoorMaterials = useKitchenStore((s) => s.availableDoorMaterials);
  const availableWorktopMaterials = useKitchenStore((s) => s.availableWorktopMaterials);
  const availableHandleMaterials = useKitchenStore((s) => s.availableHandleMaterials);

  const allMats = useMemo(() => {
    const map = new Map<string, (typeof availableMaterials)[0]>();
    for (const m of availableMaterials) map.set(m.id, m);
    for (const m of availableDoorMaterials) map.set(m.id, m);
    return [...map.values()];
  }, [availableMaterials, availableDoorMaterials]);

  const price = useMemo(
    () => calculatePrice(config, allMats, availableWorktopMaterials, availableHandleMaterials),
    [config, allMats, availableWorktopMaterials, availableHandleMaterials],
  );

  const totalWidth = config.baseModules.reduce((sum, m) => sum + m.width, 0);

  return (
    <header className="planner-header">
      <div className="header-left">
        <Link href="/planners" className="header-menu-btn" title="Back to planners">
          <Menu size={20} />
        </Link>
        <button className="header-save-btn">
          <Save size={16} />
          <span>Save</span>
        </button>
        <div className="header-undo-group">
          <button
            className="header-icon-btn"
            onClick={undo}
            disabled={!canUndo}
            title="Undo (⌘Z / Ctrl+Z)"
          >
            <Undo2 size={16} />
          </button>
          <button
            className="header-icon-btn"
            onClick={redo}
            disabled={!canRedo}
            title="Redo (⌘⇧Z / Ctrl+Shift+Z or Ctrl+Y)"
          >
            <Redo2 size={16} />
          </button>
          <button
            className="header-icon-btn"
            title="Download screenshot"
            onClick={() => {
              const canvas = document.querySelector(
                ".kitchen-canvas-wrapper canvas",
              ) as HTMLCanvasElement | null;
              if (!canvas) return;
              const link = document.createElement("a");
              link.download = "kitchen-design.png";
              link.href = canvas.toDataURL("image/png");
              link.click();
            }}
          >
            <Download size={16} />
          </button>
        </div>
        <button
          className="header-icon-btn"
          onClick={() => setShowTemplates(true)}
          title="Browse templates"
        >
          <LayoutTemplate size={16} />
          <span style={{ fontSize: 13, marginLeft: 4 }}>Templates</span>
        </button>
        <button
          className="header-icon-btn"
          onClick={() => setKitchenDesignSetupComplete(false)}
          title="Change room shape and footprint size"
        >
          <Shapes size={16} />
          <span style={{ fontSize: 13, marginLeft: 4 }}>Shape</span>
        </button>
      </div>

      <div className="header-center">
        <div className="header-price-pill">
          <div className="header-kitchen-info">
            <span className="header-kitchen-width">{totalWidth} cm run</span>
            <span className="header-divider">·</span>
            <span className="header-price-amount">{formatPrice(price.total, currency)}</span>
          </div>
          <button className="header-summary-btn">
            Summary
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="header-right" />
    </header>
  );
}
