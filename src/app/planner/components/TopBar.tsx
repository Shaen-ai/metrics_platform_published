"use client";

import { useMemo, useCallback } from "react";
import { useStore } from "@/lib/store";
import { useResolvedAdmin } from "@/contexts/PublishedTenantProvider";
import { usePlannerStore } from "../store/usePlannerStore";
import { formatPrice } from "../utils/math";
import { DraftDimInput } from "./DraftNumberFields";
import {
  Grid3X3,
  Eye,
  Trash2,
  RotateCw,
  RotateCcw,
  Crosshair,
  Palette,
  Home,
  Ruler,
  LayoutTemplate,
  Lock,
  Unlock,
  ShoppingCart,
} from "lucide-react";
import { usePlannerType } from "../context";
import { formatLengthLabel } from "../utils/units";

export default function TopBar() {
  const admin = useResolvedAdmin();
  const currency = admin?.currency ?? "USD";
  const addWardrobeToCart = useStore((s) => s.addWardrobeToCart);
  const plannerConfig = usePlannerType();
  const placedItems = usePlannerStore((s) => s.placedItems);
  const setShowRoomDesigner = usePlannerStore((s) => s.setShowRoomDesigner);
  const setKitchenSetupComplete = usePlannerStore((s) => s.setKitchenSetupComplete);
  const catalog = usePlannerStore((s) => s.catalog);
  const selectedItemId = usePlannerStore((s) => s.selectedItemId);
  const deleteSelected = usePlannerStore((s) => s.deleteSelected);
  const rotateItem = usePlannerStore((s) => s.rotateItem);
  const updateItemColor = usePlannerStore((s) => s.updateItemColor);
  const updateItemDimensions = usePlannerStore((s) => s.updateItemDimensions);
  const toggleItemMovable = usePlannerStore((s) => s.toggleItemMovable);
  const ui = usePlannerStore((s) => s.ui);
  const toggleSnapToGrid = usePlannerStore((s) => s.toggleSnapToGrid);
  const toggleShowGrid = usePlannerStore((s) => s.toggleShowGrid);
  const setTopView = usePlannerStore((s) => s.setTopView);

  const DEG15 = (15 * Math.PI) / 180;

  const summary = useMemo(() => {
    let totalPrice = 0;
    for (const p of placedItems) {
      const cat = catalog.find((c) => c.id === p.catalogId);
      if (cat) totalPrice += cat.price;
    }
    return { count: placedItems.length, totalPrice };
  }, [placedItems, catalog]);

  const selectedPlaced = useMemo(() => {
    if (!selectedItemId) return null;
    return placedItems.find((p) => p.id === selectedItemId) ?? null;
  }, [selectedItemId, placedItems]);

  const selectedCatalog = useMemo(() => {
    if (!selectedPlaced) return null;
    return catalog.find((c) => c.id === selectedPlaced.catalogId) ?? null;
  }, [selectedPlaced, catalog]);

  const selectedColor = selectedPlaced?.color ?? selectedCatalog?.color ?? "#888888";

  const effectiveWidth = selectedPlaced?.width ?? selectedCatalog?.width ?? 0;
  const effectiveDepth = selectedPlaced?.depth ?? selectedCatalog?.depth ?? 0;
  const effectiveHeight = selectedPlaced?.height ?? selectedCatalog?.height ?? 0;

  const handleColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (selectedItemId) updateItemColor(selectedItemId, e.target.value);
    },
    [selectedItemId, updateItemColor]
  );

  const lengthUnit = ui.lengthUnit;

  return (
    <div className="planner-topbar">
      {/* Left: Summary */}
      <div className="topbar-section">
        <span className="topbar-stat">
          <strong>{summary.count}</strong> item{summary.count !== 1 ? "s" : ""}
        </span>
        <span className="topbar-divider">|</span>
        <span className="topbar-stat">
          Total: <strong>{formatPrice(summary.totalPrice, currency)}</strong>
        </span>
      </div>

      {/* Center: Selected item controls */}
      <div className="topbar-section topbar-center">
        {selectedCatalog && (
          <>
            <span className="topbar-selected-name">{selectedCatalog.name}</span>
            <button
              className="btn-icon"
              onClick={() => rotateItem(selectedItemId!, -DEG15)}
              title="Rotate left 15° (Q)"
            >
              <RotateCcw size={16} />
            </button>
            <button
              className="btn-icon"
              onClick={() => rotateItem(selectedItemId!, DEG15)}
              title="Rotate right 15° (E)"
            >
              <RotateCw size={16} />
            </button>
            {!selectedPlaced?.wardrobeConfig && (
              <span className="topbar-color-picker" title="Item color">
                <Palette size={14} />
                <input
                  type="color"
                  value={selectedColor}
                  onChange={handleColorChange}
                  className="color-input"
                />
              </span>
            )}
            <span className="topbar-divider">|</span>
            {selectedPlaced?.wardrobeConfig ? (
              <span className="topbar-dims" title={`Wardrobe footprint (${lengthUnit})`}>
                <Ruler size={14} />
                <span className="dim-readonly">
                  {formatLengthLabel(effectiveWidth, lengthUnit)} ×{" "}
                  {formatLengthLabel(effectiveDepth, lengthUnit)} ×{" "}
                  {formatLengthLabel(effectiveHeight, lengthUnit)}
                </span>
              </span>
            ) : (
              <span
                className="topbar-dims"
                title={`Dimensions (${lengthUnit})`}
              >
                <Ruler size={14} />
                <DraftDimInput
                  key={`${selectedItemId}-iw`}
                  meters={effectiveWidth}
                  lengthUnit={lengthUnit}
                  className="dim-input"
                  onCommitMeters={(m) => {
                    if (!selectedItemId) return;
                    const rounded = Math.round(m * 10000) / 10000;
                    updateItemDimensions(selectedItemId, { width: rounded });
                  }}
                  title={`Width (${lengthUnit})`}
                />
                <span className="dim-x">×</span>
                <DraftDimInput
                  key={`${selectedItemId}-id`}
                  meters={effectiveDepth}
                  lengthUnit={lengthUnit}
                  className="dim-input"
                  onCommitMeters={(m) => {
                    if (!selectedItemId) return;
                    const rounded = Math.round(m * 10000) / 10000;
                    updateItemDimensions(selectedItemId, { depth: rounded });
                  }}
                  title={`Depth (${lengthUnit})`}
                />
                <span className="dim-x">×</span>
                <DraftDimInput
                  key={`${selectedItemId}-ih`}
                  meters={effectiveHeight}
                  lengthUnit={lengthUnit}
                  className="dim-input"
                  onCommitMeters={(m) => {
                    if (!selectedItemId) return;
                    const rounded = Math.round(m * 10000) / 10000;
                    updateItemDimensions(selectedItemId, { height: rounded });
                  }}
                  title={`Height (${lengthUnit})`}
                />
                <span className="dim-unit">{lengthUnit}</span>
              </span>
            )}
            {selectedPlaced?.wardrobeConfig && selectedCatalog && (
              <button
                type="button"
                className="btn-icon"
                title="Add this wardrobe to cart"
                onClick={() =>
                  addWardrobeToCart({
                    name: selectedCatalog.name,
                    price: selectedCatalog.price,
                    config: structuredClone(selectedPlaced.wardrobeConfig!),
                  })
                }
              >
                <ShoppingCart size={16} />
              </button>
            )}
            <button
              className={`btn-icon${selectedPlaced?.movable === false ? " active" : ""}`}
              onClick={() => selectedItemId && toggleItemMovable(selectedItemId)}
              title={selectedPlaced?.movable === false ? "Unlock position" : "Lock position"}
            >
              {selectedPlaced?.movable === false ? <Lock size={16} /> : <Unlock size={16} />}
            </button>
            <button
              className="btn-icon btn-danger"
              onClick={deleteSelected}
              title="Delete (Del)"
            >
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>

      {/* Right: View controls */}
      <div className="topbar-section topbar-right">
        <button
          className="btn-toggle"
          onClick={() => setShowRoomDesigner(true)}
          title="Edit room"
        >
          <Home size={14} />
          <span>Room</span>
        </button>
        {plannerConfig?.id === "kitchen" && (
          <button
            className="btn-toggle"
            type="button"
            onClick={() => setKitchenSetupComplete(false)}
            title="Change kitchen shape and 2D layout"
          >
            <LayoutTemplate size={14} />
            <span>Shape</span>
          </button>
        )}
        <button
          className={`btn-toggle ${ui.snapToGrid ? "active" : ""}`}
          onClick={toggleSnapToGrid}
          title="Snap to grid"
        >
          <Crosshair size={14} />
          <span>Snap</span>
        </button>
        <button
          className={`btn-toggle ${ui.showGrid ? "active" : ""}`}
          onClick={toggleShowGrid}
          title="Show grid"
        >
          <Grid3X3 size={14} />
          <span>Grid</span>
        </button>
        <button
          className={`btn-toggle ${ui.topView ? "active" : ""}`}
          onClick={() => setTopView(!ui.topView)}
          title="Top view (T)"
        >
          <Eye size={14} />
          <span>Top</span>
        </button>
      </div>

      {/* Keyboard hints */}
      <div className="topbar-hints">
        <span>Q/E: Rotate</span>
        <span>L: Lock/Unlock</span>
        <span>Del: Delete</span>
        <span>T: Top view</span>
        <span>G: Toggle grid</span>
        <span>S: Toggle snap</span>
        <span>Esc: Deselect</span>
      </div>
    </div>
  );
}
