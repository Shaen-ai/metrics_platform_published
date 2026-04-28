"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import {
  Menu,
  Save,
  Undo2,
  Redo2,
  Download,
  ChevronRight,
  BedDouble,
} from "lucide-react";
import { useWardrobeStore } from "./store";
import { calculatePrice } from "./data";
import { useStore } from "@/lib/store";
import { useResolvedAdmin } from "@/contexts/PublishedTenantProvider";
import { formatPrice } from "@/lib/utils";
import { PENDING_BEDROOM_WARDROBE_ID_KEY } from "./plannerWardrobeCatalog";

export default function HeaderToolbar() {
  const router = useRouter();
  const admin = useResolvedAdmin();
  const currency = admin?.currency ?? "USD";
  const addPlannerSavedWardrobe = useStore((s) => s.addPlannerSavedWardrobe);
  const config = useWardrobeStore((s) => s.config);
  const canUndo = useWardrobeStore((s) => s.canUndo);
  const canRedo = useWardrobeStore((s) => s.canRedo);
  const undo = useWardrobeStore((s) => s.undo);
  const redo = useWardrobeStore((s) => s.redo);
  const availableMaterials = useWardrobeStore((s) => s.availableMaterials);
  const availableDoorMaterials = useWardrobeStore((s) => s.availableDoorMaterials);
  const availableSlidingMechanisms = useWardrobeStore((s) => s.availableSlidingMechanisms);
  const availableHandleMaterials = useWardrobeStore((s) => s.availableHandleMaterials);

  const allMats = useMemo(
    () => [...availableMaterials, ...availableDoorMaterials],
    [availableMaterials, availableDoorMaterials],
  );
  const price = useMemo(
    () => calculatePrice(config, allMats, availableSlidingMechanisms, availableHandleMaterials),
    [config, allMats, availableSlidingMechanisms, availableHandleMaterials],
  );

  function sendToBedroomPlanner() {
    const id = uuidv4();
    const name = `Wardrobe · ${new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
    addPlannerSavedWardrobe({
      id,
      name,
      config: structuredClone(config),
      cachedPrice: price.total,
    });
    if (typeof window !== "undefined") {
      sessionStorage.setItem(PENDING_BEDROOM_WARDROBE_ID_KEY, id);
    }
    router.push("/planners/bedroom");
  }

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
            type="button"
            className="header-icon-btn"
            onClick={sendToBedroomPlanner}
            title="Save to Your wardrobes and open Bedroom planner"
          >
            <BedDouble size={16} />
          </button>
          <button
            className="header-icon-btn"
            onClick={undo}
            disabled={!canUndo}
            title="Undo"
          >
            <Undo2 size={16} />
          </button>
          <button
            className="header-icon-btn"
            onClick={redo}
            disabled={!canRedo}
            title="Redo"
          >
            <Redo2 size={16} />
          </button>
          <button
            className="header-icon-btn"
            title="Download screenshot"
            onClick={() => {
              const canvas = document.querySelector(
                ".wardrobe-canvas-wrapper canvas",
              ) as HTMLCanvasElement | null;
              if (!canvas) return;
              const link = document.createElement("a");
              link.download = "wardrobe-design.png";
              link.href = canvas.toDataURL("image/png");
              link.click();
            }}
          >
            <Download size={16} />
          </button>
        </div>
      </div>

      <div className="header-center">
        <div className="header-price-pill">
          <span className="header-price-amount">{formatPrice(price.total, currency)}</span>
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
