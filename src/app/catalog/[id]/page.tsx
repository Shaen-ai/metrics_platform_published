"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useStore } from "@/lib/store";
import { Button, Card, CardContent } from "@/components/ui";
import { formatPrice, toRelativeStorageUrl } from "@/lib/utils";
import { ArrowLeft, Home, Plus, ShoppingCart } from "lucide-react";
import CatalogModelViewer from "@/components/CatalogModelViewer";
import { useTranslation } from "@/hooks/useTranslation";
import { getCatalog3dPresentation } from "@/lib/catalog3d";
import {
  catalogFabricSwatchSourceMaterials,
  fabricPartAllowedMaterialIds,
  plannerSwatchesFromMaterialList,
} from "@/lib/plannerMaterials";
import { catalogItemIsSoftFurnitureMode, catalogItemIsUpholstery } from "@/lib/catalogItemCategories";
import type { CatalogItem } from "@/lib/types";
import { track } from "@/lib/analytics";

/** Normalize fabric fields from API (camelCase or snake_case) and infer from `fabricParts` when flag missing. */
function resolveFabricCatalogMeta(item: CatalogItem) {
  const raw = item as CatalogItem & {
    is_fabric_customizable?: boolean;
    fabric_parts?: CatalogItem["fabricParts"];
    available_colors?: { name: string; hex: string }[];
  };
  const fabricParts = raw.fabricParts ?? raw.fabric_parts;
  const isFabricCustomizable = Boolean(
    raw.isFabricCustomizable ??
      raw.is_fabric_customizable ??
      (Array.isArray(fabricParts) && fabricParts.length > 0),
  );
  const availableColors = raw.availableColors ?? raw.available_colors ?? [];
  return {
    isFabricCustomizable,
    fabricParts,
    availableColors,
  };
}

/**
 * Resolve a material image URL so model-viewer can load it without CORS issues:
 * - Backend storage URLs  → site-relative path (Next.js rewrites to API)
 * - External CDN URLs     → /api/image-proxy?url=… (server-side fetch, same-origin)
 * - Already relative URLs → unchanged
 */
function proxyCatalogTextureUrl(url: string): string {
  const relative = toRelativeStorageUrl(url);
  // toRelativeStorageUrl returns the original absolute URL when it can't make it relative
  // (i.e. it's an external CDN). Route those through the image proxy to avoid CORS.
  if (relative === url && /^https?:\/\//i.test(url)) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  }
  return relative;
}

function resolveCatalogItemModeId(item: CatalogItem): string | undefined {
  const raw = item as CatalogItem & { mode_id?: string };
  return item.modeId ?? raw.mode_id;
}

export default function CatalogDetailPage() {
  const params = useParams();
  const itemId = params.id as string;
  const router = useRouter();
  const { t } = useTranslation();
  const [viewOverride, setViewOverride] = useState<{ itemId: string; view: "photos" | "3d" } | null>(null);
  const [selectedImageState, setSelectedImageState] = useState<{ itemId: string; index: number } | null>(null);
  const [selectedFabricId, setSelectedFabricId] = useState<string | null>(null);
  const [addedToCart, setAddedToCart] = useState(false);

  const { catalogItems, initializeStore, initialized, materials, admin, addToCart } = useStore();

  useEffect(() => {
    initializeStore();
  }, [initializeStore]);

  const item = catalogItems.find((i) => i.id === itemId);
  const fabricMeta = useMemo(() => (item ? resolveFabricCatalogMeta(item) : null), [item]);

  useEffect(() => {
    if (item) track("storefront_product_viewed", { product_id: item.id, product_name: item.name });
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const showUpholsterySection = useMemo(() => {
    if (!item || !fabricMeta) return false;
    if (!catalogItemIsSoftFurnitureMode(item)) return false;
    if (fabricMeta.isFabricCustomizable) return true;
    return catalogItemIsUpholstery(item);
  }, [item, fabricMeta]);

  const upholsterySwatches = useMemo(() => {
    if (!item || !fabricMeta || !showUpholsterySection) return [];
    const sourceMats = catalogFabricSwatchSourceMaterials(
      {
        isFabricCustomizable: true,
        modeId: resolveCatalogItemModeId(item),
        fabricParts: fabricMeta.fabricParts,
      },
      materials,
    );
    const allSwatches = plannerSwatchesFromMaterialList(sourceMats, admin?.companyName);
    const parts = fabricMeta.fabricParts;
    if (!parts?.length) return allSwatches;

    const hasUnrestricted = parts.some((p) => fabricPartAllowedMaterialIds(p) === null);
    if (hasUnrestricted) return allSwatches;

    const unionIds = [...new Set(parts.flatMap((p) => fabricPartAllowedMaterialIds(p) ?? []))];
    if (unionIds.length === 0) return allSwatches;

    const allowed = new Set(unionIds);
    const filtered = allSwatches.filter((s) => allowed.has(s.id));
    return filtered.length > 0 ? filtered : allSwatches;
  }, [item, fabricMeta, showUpholsterySection, materials, admin?.companyName]);

  const selectedFabric = useMemo(
    () => upholsterySwatches.find((s) => s.id === selectedFabricId) ?? null,
    [upholsterySwatches, selectedFabricId],
  );

  const td = item ? getCatalog3dPresentation(item) : "none";
  const canShow3d = td === "viewer";
  const generating3d = td === "generating";
  const show3dTab = td !== "none";
  const defaultView = canShow3d || generating3d ? "3d" : "photos";
  const view = viewOverride?.itemId === itemId ? viewOverride.view : defaultView;
  const selectedImage = selectedImageState?.itemId === itemId ? selectedImageState.index : 0;
  const selectedImageSrc = item ? toRelativeStorageUrl(item.images[selectedImage]) : "";

  if (!initialized) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl mb-3">Item Not Found</h1>
          <p className="text-[var(--muted-foreground)] mb-6">
            This item doesn&apos;t exist or has been removed.
          </p>
          <Link href="/catalog">
            <Button>Back to Catalog</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/catalog" className="p-2 hover:bg-[var(--muted)] rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[var(--primary)] flex items-center justify-center text-white font-bold text-xs">T</div>
              <span className="text-lg font-semibold">Product Details</span>
            </div>
          </div>

          <Link href="/" className="p-2 hover:bg-[var(--muted)] rounded-full transition-colors">
            <Home className="w-5 h-5" />
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Media: photos + optional 3D */}
          <div>
            {show3dTab && (
              <div className="flex gap-2 mb-4 p-1 rounded-xl bg-[var(--muted)] w-fit">
                <button
                  type="button"
                  onClick={() => setViewOverride({ itemId, view: "photos" })}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    view === "photos"
                      ? "bg-[var(--background)] shadow text-[var(--foreground)]"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                >
                  Photos
                </button>
                <button
                  type="button"
                  onClick={() => setViewOverride({ itemId, view: "3d" })}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    view === "3d"
                      ? "bg-[var(--background)] shadow text-[var(--foreground)]"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                >
                  3D model
                </button>
              </div>
            )}

            <Card className="overflow-hidden mb-4">
              <div className="aspect-square relative bg-[var(--muted)]">
                {view === "3d" && canShow3d && item.modelUrl ? (
                  <CatalogModelViewer
                    src={item.modelUrl}
                    alt={item.name}
                    fallbackImage={toRelativeStorageUrl(item.images[0])}
                    fabricTextureUrl={selectedFabric?.imageUrl ? proxyCatalogTextureUrl(selectedFabric.imageUrl) : undefined}
                  />
                ) : view === "3d" && generating3d ? (
                  <div className="flex flex-col items-center justify-center h-full min-h-[320px] px-6 text-center">
                    <div className="animate-spin rounded-full h-10 w-10 border-2 border-[var(--primary)] border-t-transparent mb-4" />
                    <p className="text-[var(--muted-foreground)]">{t("catalog.loading3d")}</p>
                  </div>
                ) : view === "3d" && td === "failed" ? (
                  <div className="flex flex-col items-center justify-center h-full min-h-[320px] px-6 text-center text-[var(--muted-foreground)]">
                    <p>3D model could not be generated.</p>
                  </div>
                ) : selectedImageSrc ? (
                  <Image
                    src={selectedImageSrc}
                    alt={item.name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[var(--muted-foreground)]">
                    No image
                  </div>
                )}
              </div>
            </Card>

            {view === "photos" && item.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {item.images.map((img, index) => {
                  const thumbnailSrc = toRelativeStorageUrl(img);
                  if (!thumbnailSrc) return null;
                  return (
                  <button
                    key={index}
                    onClick={() => setSelectedImageState({ itemId, index })}
                    className={`w-20 h-20 relative rounded-xl overflow-hidden flex-shrink-0 transition-all ${
                      selectedImage === index
                        ? "ring-2 ring-[var(--primary)]"
                        : "opacity-70 hover:opacity-100"
                    }`}
                  >
                    <Image src={thumbnailSrc} alt={`${item.name} ${index + 1}`} fill className="object-cover" />
                  </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Product Info */}
          <div>
            <div className="mb-6">
              <p className="text-sm text-[var(--muted-foreground)] mb-1">{item.category}</p>
              <h2 className="text-4xl mb-3">{item.name}</h2>
              <p className="text-3xl font-bold text-[var(--primary)]">
                {formatPrice(item.price, item.currency)}
                {item.unit && (
                  <span className="text-base font-normal text-[var(--muted-foreground)] ml-2">
                    / {item.unit}
                  </span>
                )}
              </p>
            </div>

            <p className="text-[var(--muted-foreground)] mb-6 leading-relaxed">{item.description}</p>

            {fabricMeta && fabricMeta.availableColors.length > 0 && (
              <Card className="mb-6">
                <CardContent className="p-5">
                  <h3 className="font-semibold mb-3">Colors</h3>
                  <div className="flex flex-wrap gap-2">
                    {fabricMeta.availableColors.map((c) => (
                      <div
                        key={`${c.name}-${c.hex}`}
                        className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                        title={c.name}
                      >
                        <span
                          className="w-6 h-6 rounded-md border border-[var(--border)] shrink-0"
                          style={{ background: c.hex || "#ccc" }}
                        />
                        <span>{c.name}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {showUpholsterySection && upholsterySwatches.length > 0 && (
              <Card className="mb-6">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">Upholstery</h3>
                    {selectedFabric && (
                      <span className="text-sm text-[var(--muted-foreground)]">
                        {selectedFabric.name}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {upholsterySwatches.map((swatch) => {
                      const picked = selectedFabricId === swatch.id;
                      return (
                        <button
                          key={swatch.id}
                          type="button"
                          title={swatch.name}
                          onClick={() => setSelectedFabricId(picked ? null : swatch.id)}
                          className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                            picked
                              ? "border-[var(--primary)] shadow-md scale-110"
                              : "border-[var(--border)] hover:border-[var(--primary)]/50 hover:scale-105"
                          }`}
                        >
                          {swatch.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={proxyCatalogTextureUrl(swatch.imageUrl)}
                              alt={swatch.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span
                              className="block w-full h-full"
                              style={{ background: swatch.color || "#ccc" }}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {selectedFabric && (
                    <p className="text-xs text-[var(--muted-foreground)] mt-2">
                      Click the selected fabric to deselect. Switch to 3D view to preview on the model.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {item.modeId !== "mode-building-materials" && item.dimensions && (
              <Card className="mb-6">
                <CardContent className="p-5">
                  <h3 className="font-semibold mb-3">Dimensions</h3>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold">{item.dimensions.width}</p>
                      <p className="text-sm text-[var(--muted-foreground)]">Width ({item.dimensions.unit})</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{item.dimensions.height}</p>
                      <p className="text-sm text-[var(--muted-foreground)]">Height ({item.dimensions.unit})</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{item.dimensions.depth}</p>
                      <p className="text-sm text-[var(--muted-foreground)]">Depth ({item.dimensions.unit})</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {item.modeId === "mode-building-materials" && (item.surfaceItemWidthCm || item.surfaceItemHeightCm) && (
              <Card className="mb-6">
                <CardContent className="p-5">
                  <h3 className="font-semibold mb-3">Surface dimensions</h3>
                  <div className="grid grid-cols-2 gap-4 text-center">
                    {item.surfaceItemWidthCm && (
                      <div>
                        <p className="text-2xl font-bold">{item.surfaceItemWidthCm}</p>
                        <p className="text-sm text-[var(--muted-foreground)]">Width (cm)</p>
                      </div>
                    )}
                    {item.surfaceItemHeightCm && (
                      <div>
                        <p className="text-2xl font-bold">{item.surfaceItemHeightCm}</p>
                        <p className="text-sm text-[var(--muted-foreground)]">Height / Length (cm)</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="mb-6">
              <CardContent className="p-5">
                <h3 className="font-semibold mb-1">Delivery Time</h3>
                <p className="text-[var(--muted-foreground)]">
                  Estimated delivery in <strong>{item.deliveryDays} days</strong>
                </p>
              </CardContent>
            </Card>

            <div className="flex flex-row flex-nowrap gap-3 w-full min-w-0">
              <button
                type="button"
                onClick={() => {
                  track("storefront_added_to_cart", { product_id: item.id, product_name: item.name });
                  addToCart(item);
                  setAddedToCart(true);
                  setTimeout(() => setAddedToCart(false), 1500);
                }}
                className="flex flex-1 items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[var(--primary)] text-white font-semibold text-sm transition-all hover:opacity-90 active:scale-95 min-w-0"
              >
                <Plus className="w-4 h-4 shrink-0" />
                {addedToCart ? "Added!" : "Add to Cart"}
              </button>
              <button
                type="button"
                onClick={() => {
                  track("storefront_added_to_cart", { product_id: item.id, product_name: item.name, intent: "order" });
                  addToCart(item);
                  router.push("/checkout");
                }}
                className="flex flex-1 items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[var(--foreground)] text-[var(--background)] font-semibold text-sm transition-all hover:opacity-90 active:scale-95 min-w-0"
              >
                <ShoppingCart className="w-4 h-4 shrink-0" />
                Order
              </button>
              <Link href="/planners" className="flex flex-1 min-w-0">
                <Button className="w-full h-full min-h-[48px] rounded-xl font-semibold text-sm">
                  Try in Planner
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
