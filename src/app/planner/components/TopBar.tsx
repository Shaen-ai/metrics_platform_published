"use client";

import { useMemo, useCallback, type ReactNode } from "react";
import { useStore } from "@/lib/store";
import {
  filterMaterialsForPlanner,
  materialsFromStore,
  upholsteryMaterialsFromStore,
  isBoardFinishMaterial,
  isWardrobeBoardFinishMaterial,
  mergeDefaultBoardMaterialsWhenMissing,
  type PlannerSwatchMaterial,
} from "@/lib/plannerMaterials";
import { getGlbTextureMode } from "../glbTextureMode";
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
  Download,
} from "lucide-react";
import { usePlannerType } from "../context";
import { formatLengthLabel } from "../utils/units";
import SendPlannerDesignToAdminDialog from "./SendPlannerDesignToAdminDialog";
import OutdoorCushionTopBar from "./OutdoorCushionTopBar";
import FabricPartsPanel from "./FabricPartsPanel";
import { catalogItemIsSoftFurnitureMode } from "@/lib/catalogItemCategories";
import { buildRoomPlannerEmailDesign } from "../utils/plannerDesignSnapshots";
import {
  materialsFromStore as wardrobeCarcassMaterialsFromStore,
  doorFrontMaterialsFromStore,
  withDefaultWardrobeDoorFinishes,
  wardrobeDoorPanelMaterialIdsLength,
  clampWardrobeConfigMaterialsToAvailable,
} from "../wardrobe/data";
import type { WardrobeConfig } from "../wardrobe/types";

export default function TopBar({ children }: { children: ReactNode }) {
  const admin = useResolvedAdmin();
  const currency = admin?.currency ?? "USD";
  const addWardrobeToCart = useStore((s) => s.addWardrobeToCart);
  const rawMaterials = useStore((s) => s.materials);
  const plannerConfig = usePlannerType();
  const placedItems = usePlannerStore((s) => s.placedItems);
  const setShowRoomDesigner = usePlannerStore((s) => s.setShowRoomDesigner);
  const setKitchenSetupComplete = usePlannerStore((s) => s.setKitchenSetupComplete);
  const catalog = usePlannerStore((s) => s.catalog);
  const selectedItemId = usePlannerStore((s) => s.selectedItemId);
  const deleteSelected = usePlannerStore((s) => s.deleteSelected);
  const rotateItem = usePlannerStore((s) => s.rotateItem);
  const updateItemColor = usePlannerStore((s) => s.updateItemColor);
  const updateItemGltfFinishMaterial = usePlannerStore((s) => s.updateItemGltfFinishMaterial);
  const updateItemPlacement = usePlannerStore((s) => s.updateItemPlacement);
  const updateItemDimensions = usePlannerStore((s) => s.updateItemDimensions);
  const setOutdoorCushionConfig = usePlannerStore((s) => s.setOutdoorCushionConfig);
  const setFabricPartMaterial = usePlannerStore((s) => s.setFabricPartMaterial);
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

  const filteredBase = useMemo(
    () => filterMaterialsForPlanner(rawMaterials, admin?.plannerMaterialIds),
    [rawMaterials, admin?.plannerMaterialIds],
  );

  const plannerBoardMaterials = useMemo(
    () =>
      mergeDefaultBoardMaterialsWhenMissing(
        filteredBase,
        admin?.id,
        isBoardFinishMaterial,
        admin?.plannerMaterialIds,
      ),
    [filteredBase, admin?.id, admin?.plannerMaterialIds],
  );

  const wardrobeBoardMaterials = useMemo(
    () =>
      mergeDefaultBoardMaterialsWhenMissing(
        filteredBase,
        admin?.id,
        isWardrobeBoardFinishMaterial,
        admin?.plannerMaterialIds,
      ),
    [filteredBase, admin?.id, admin?.plannerMaterialIds],
  );

  const gltfFinishMode = useMemo(() => {
    if (!selectedCatalog) return "board";
    if (selectedPlaced?.outdoorCushionConfig?.enabled) return "board";
    return getGlbTextureMode(selectedCatalog);
  }, [selectedCatalog, selectedPlaced?.outdoorCushionConfig?.enabled]);

  const upholSwatchesOnly = useMemo((): PlannerSwatchMaterial[] => {
    if (filteredBase.length === 0) return [];
    return upholsteryMaterialsFromStore(filteredBase, admin?.companyName);
  }, [filteredBase, admin?.companyName]);

  const showOutdoorCushionPanel = Boolean(
    plannerConfig?.id === "outdoor" &&
      selectedCatalog?.modelUrl &&
      selectedCatalog.supportsOutdoorCushions === true &&
      selectedPlaced &&
      !selectedPlaced.wardrobeConfig,
  );

  const showFabricPartsPanel = Boolean(
    selectedCatalog &&
      catalogItemIsSoftFurnitureMode(selectedCatalog) &&
      selectedCatalog.isFabricCustomizable === true &&
      Array.isArray(selectedCatalog.fabricParts) &&
      selectedCatalog.fabricParts.length > 0 &&
      selectedPlaced &&
      !selectedPlaced.wardrobeConfig &&
      !showOutdoorCushionPanel,
  );

  const gltfFinishList = useMemo((): PlannerSwatchMaterial[] => {
    if (plannerBoardMaterials.length === 0) return [];
    if (gltfFinishMode === "upholstery") {
      return upholsteryMaterialsFromStore(filteredBase, admin?.companyName);
    }
    return materialsFromStore(plannerBoardMaterials, admin?.companyName, {
      forWardrobe: plannerConfig?.id !== "kitchen",
    });
  }, [
    plannerBoardMaterials,
    filteredBase,
    admin?.companyName,
    gltfFinishMode,
    plannerConfig?.id,
  ]);

  const showGltfFinishPicker = Boolean(
    selectedCatalog?.modelUrl &&
      !selectedPlaced?.wardrobeConfig &&
      !showFabricPartsPanel,
  );

  const showWardrobeFinishPickers = Boolean(
    plannerConfig?.id === "bedroom" && selectedPlaced?.wardrobeConfig,
  );

  const bedroomWardrobeFrameMaterials = useMemo(() => {
    if (!showWardrobeFinishPickers || wardrobeBoardMaterials.length === 0) return [];
    return wardrobeCarcassMaterialsFromStore(wardrobeBoardMaterials, admin?.companyName);
  }, [showWardrobeFinishPickers, wardrobeBoardMaterials, admin?.companyName]);

  const bedroomWardrobeDoorMaterials = useMemo(() => {
    if (!showWardrobeFinishPickers || wardrobeBoardMaterials.length === 0) return [];
    return withDefaultWardrobeDoorFinishes(
      doorFrontMaterialsFromStore(wardrobeBoardMaterials, admin?.companyName),
    );
  }, [showWardrobeFinishPickers, wardrobeBoardMaterials, admin?.companyName]);

  const applyWardrobeBedroomFrameMaterial = useCallback(
    (materialId: string) => {
      if (!selectedItemId || !selectedPlaced?.wardrobeConfig) return;
      let next: WardrobeConfig = {
        ...structuredClone(selectedPlaced.wardrobeConfig),
        frameMaterial: materialId,
      };
      next = clampWardrobeConfigMaterialsToAvailable(
        next,
        bedroomWardrobeFrameMaterials,
        bedroomWardrobeDoorMaterials,
      );
      updateItemPlacement(selectedItemId, { wardrobeConfig: next });
    },
    [
      selectedItemId,
      selectedPlaced?.wardrobeConfig,
      bedroomWardrobeFrameMaterials,
      bedroomWardrobeDoorMaterials,
      updateItemPlacement,
    ],
  );

  const applyWardrobeBedroomDoorFrontMaterial = useCallback(
    (materialId: string) => {
      if (!selectedItemId || !selectedPlaced?.wardrobeConfig) return;
      const cfg = structuredClone(selectedPlaced.wardrobeConfig);
      if (cfg.doors.type === "none") return;
      const len = wardrobeDoorPanelMaterialIdsLength(cfg.doors.type, cfg.frame.width, cfg.sections);
      const g = cfg.doorGrainDirection ?? "horizontal";
      const doors = {
        ...cfg.doors,
        doorPanelMaterialIds: Array.from({ length: len }, () => materialId),
        doorPanelGrainDirections: Array.from({ length: len }, () => g),
      };
      let next: WardrobeConfig = { ...cfg, doors };
      next = clampWardrobeConfigMaterialsToAvailable(
        next,
        bedroomWardrobeFrameMaterials,
        bedroomWardrobeDoorMaterials,
      );
      updateItemPlacement(selectedItemId, { wardrobeConfig: next });
    },
    [
      selectedItemId,
      selectedPlaced?.wardrobeConfig,
      bedroomWardrobeFrameMaterials,
      bedroomWardrobeDoorMaterials,
      updateItemPlacement,
    ],
  );

  const wardrobeDoorFinishSampleId =
    selectedPlaced?.wardrobeConfig?.doors.doorPanelMaterialIds[0];

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
    <div className="planner-main">
      <div className="planner-canvas-stack">
        <div className="planner-toolbar">
          <div className="planner-toolbar-row">
            <div className="topbar-section">
              <span className="topbar-stat">
                <strong>{summary.count}</strong> item{summary.count !== 1 ? "s" : ""}
              </span>
              <span className="topbar-divider">|</span>
              <span className="topbar-stat">
                Total: <strong>{formatPrice(summary.totalPrice, currency)}</strong>
              </span>
            </div>
            <div className="topbar-section topbar-toolbar-actions">
              <SendPlannerDesignToAdminDialog
                adminSlug={admin?.slug}
                plannerType={plannerConfig?.id ?? "room"}
                plannerLabel={plannerConfig?.name ?? "Room planner"}
                iconTrigger={false}
                className="btn-toggle"
                buildDesign={() => buildRoomPlannerEmailDesign()}
              />
              <button
                type="button"
                className="btn-toggle"
                title="Download screenshot"
                onClick={() => {
                  const canvas = document.querySelector(
                    ".planner-canvas-wrapper canvas",
                  ) as HTMLCanvasElement | null;
                  if (!canvas) return;
                  const slug = (plannerConfig?.id ?? "planner").replace(/[^a-z0-9-]+/gi, "-");
                  const link = document.createElement("a");
                  link.download = `${slug}-design.png`;
                  link.href = canvas.toDataURL("image/png");
                  link.click();
                }}
              >
                <Download size={14} />
                <span>Screenshot</span>
              </button>
              <button
                className="btn-toggle"
                onClick={() => setShowRoomDesigner(true)}
                title={plannerConfig?.id === "outdoor" ? "Edit patio size and surface" : "Edit room"}
              >
                <Home size={14} />
                <span>{plannerConfig?.id === "outdoor" ? "Space" : "Room"}</span>
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
                title="Top view"
              >
                <Eye size={14} />
                <span>Top</span>
              </button>
              {selectedCatalog && selectedPlaced && selectedItemId && (
                <>
                  <span className="topbar-toolbar-actions-sep" aria-hidden />
                  <span className="topbar-selected-title" title={selectedCatalog.name}>
                    {selectedCatalog.name}
                  </span>
                  <div className="topbar-toolbar-dims-wrap" title={`Dimensions (${lengthUnit})`}>
                    {selectedPlaced.wardrobeConfig ? (
                      <span
                        className="topbar-dims topbar-dims--readonly"
                        title={`Wardrobe footprint (${lengthUnit})`}
                      >
                        <Ruler size={14} />
                        <span className="dim-readonly">
                          {formatLengthLabel(effectiveWidth, lengthUnit)} ×{" "}
                          {formatLengthLabel(effectiveDepth, lengthUnit)} ×{" "}
                          {formatLengthLabel(effectiveHeight, lengthUnit)}
                        </span>
                      </span>
                    ) : (
                      <span className="topbar-dims">
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
                  </div>
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => rotateItem(selectedItemId, -DEG15)}
                    title="Rotate left 15°"
                  >
                    <RotateCcw size={16} />
                  </button>
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => rotateItem(selectedItemId, DEG15)}
                    title="Rotate right 15°"
                  >
                    <RotateCw size={16} />
                  </button>
                  {!selectedPlaced.wardrobeConfig && !selectedCatalog.modelUrl && (
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
                  {selectedPlaced.wardrobeConfig && (
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
                    type="button"
                    className={`btn-icon${selectedPlaced.movable === false ? " active" : ""}`}
                    onClick={() => toggleItemMovable(selectedItemId)}
                    title={selectedPlaced.movable === false ? "Unlock position" : "Lock position"}
                  >
                    {selectedPlaced.movable === false ? <Lock size={16} /> : <Unlock size={16} />}
                  </button>
                  <button
                    type="button"
                    className="btn-icon btn-danger"
                    onClick={deleteSelected}
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          </div>

          <div
            className="planner-toolbar-selection"
            role="region"
            aria-label={selectedCatalog ? "Materials" : undefined}
            aria-hidden={!selectedCatalog}
          >
            {selectedCatalog ? (
              <div className="planner-toolbar-selection-inner">
                {showGltfFinishPicker && gltfFinishList.length > 0 && (
                  <div
                    className="topbar-finish-strip"
                    title={gltfFinishMode === "upholstery" ? "Fabric / upholstery" : "Board / laminate"}
                  >
                    <span className="topbar-finish-label">
                      {gltfFinishMode === "upholstery" ? "Fabric" : "Finish"}
                    </span>
                    <div className="topbar-finish-swatches">
                      {selectedPlaced?.gltfFinishMaterialId && (
                        <button
                          type="button"
                          className="topbar-finish-reset btn-danger-subtle"
                          title="Use original 3D model materials"
                          onClick={() =>
                            selectedItemId && updateItemGltfFinishMaterial(selectedItemId, undefined)
                          }
                        >
                          Reset
                        </button>
                      )}
                      {gltfFinishList.map((m) => {
                        const picked = selectedPlaced?.gltfFinishMaterialId === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            className={`topbar-finish-swatch${picked ? " selected" : ""}`}
                            title={m.name}
                            onClick={() =>
                              selectedItemId && updateItemGltfFinishMaterial(selectedItemId, m.id)
                            }
                          >
                            {m.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={m.imageUrl} alt="" className="topbar-finish-swatch-img" />
                            ) : (
                              <span
                                className="topbar-finish-swatch-color"
                                style={{ background: m.color }}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {showWardrobeFinishPickers &&
                  bedroomWardrobeFrameMaterials.length > 0 &&
                  selectedPlaced?.wardrobeConfig && (
                    <>
                      <div className="topbar-finish-strip" title="Wardrobe carcass laminate">
                        <span className="topbar-finish-label">Frame</span>
                        <div className="topbar-finish-swatches">
                          {bedroomWardrobeFrameMaterials.map((m) => {
                            const picked = selectedPlaced.wardrobeConfig!.frameMaterial === m.id;
                            return (
                              <button
                                key={m.id}
                                type="button"
                                className={`topbar-finish-swatch${picked ? " selected" : ""}`}
                                title={m.name}
                                onClick={() => applyWardrobeBedroomFrameMaterial(m.id)}
                              >
                                {m.imageUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={m.imageUrl} alt="" className="topbar-finish-swatch-img" />
                                ) : (
                                  <span
                                    className="topbar-finish-swatch-color"
                                    style={{ background: m.color }}
                                  />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {selectedPlaced.wardrobeConfig.doors.type !== "none" &&
                        bedroomWardrobeDoorMaterials.length > 0 && (
                          <div className="topbar-finish-strip" title="Wardrobe door fronts">
                            <span className="topbar-finish-label">Doors</span>
                            <div className="topbar-finish-swatches">
                              {bedroomWardrobeDoorMaterials.map((m) => {
                                const picked = wardrobeDoorFinishSampleId === m.id;
                                return (
                                  <button
                                    key={m.id}
                                    type="button"
                                    className={`topbar-finish-swatch${picked ? " selected" : ""}`}
                                    title={m.name}
                                    onClick={() => applyWardrobeBedroomDoorFrontMaterial(m.id)}
                                  >
                                    {m.imageUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={m.imageUrl} alt="" className="topbar-finish-swatch-img" />
                                    ) : (
                                      <span
                                        className="topbar-finish-swatch-color"
                                        style={{ background: m.color }}
                                      />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                    </>
                  )}

                {showOutdoorCushionPanel && selectedCatalog && (
                  <div className="topbar-outdoor-cushions-wrap">
                    <OutdoorCushionTopBar
                      itemId={selectedPlaced!.id}
                      catalogDefaults={selectedCatalog.outdoorCushionDefaults}
                      widthM={effectiveWidth}
                      upholSwatches={upholSwatchesOnly}
                      cushionCfg={selectedPlaced!.outdoorCushionConfig}
                      onSetConfig={setOutdoorCushionConfig}
                    />
                  </div>
                )}
                {showFabricPartsPanel && selectedCatalog && selectedPlaced && (
                  <FabricPartsPanel
                    itemId={selectedPlaced.id}
                    fabricParts={selectedCatalog.fabricParts!}
                    fabricPartMaterialIds={selectedPlaced.fabricPartMaterialIds}
                    upholSwatches={upholSwatchesOnly}
                    onSetPartMaterial={setFabricPartMaterial}
                  />
                )}
              </div>
            ) : null}
          </div>

        </div>
        {children}
      </div>
    </div>
  );
}
