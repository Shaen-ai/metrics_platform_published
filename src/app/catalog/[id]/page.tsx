"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useStore } from "@/lib/store";
import { Button, Card, CardContent } from "@/components/ui";
import { formatPrice } from "@/lib/utils";
import { ArrowLeft, Home } from "lucide-react";
import CatalogModelViewer from "@/components/CatalogModelViewer";
import { useTranslation } from "@/hooks/useTranslation";
import { getCatalog3dPresentation } from "@/lib/catalog3d";

export default function CatalogDetailPage() {
  const params = useParams();
  const itemId = params.id as string;
  const { t } = useTranslation();
  const [view, setView] = useState<"photos" | "3d">("photos");
  const [selectedImage, setSelectedImage] = useState(0);

  const { catalogItems, initializeStore, initialized } = useStore();

  useEffect(() => {
    initializeStore();
  }, [initializeStore]);

  const item = catalogItems.find((i) => i.id === itemId);

  const td = item ? getCatalog3dPresentation(item) : "none";
  const canShow3d = td === "viewer";
  const generating3d = td === "generating";
  const show3dTab = td !== "none";

  useEffect(() => {
    setSelectedImage(0);
    setView("photos");
  }, [itemId]);

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
                  onClick={() => setView("photos")}
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
                  onClick={() => setView("3d")}
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
                    fallbackImage={item.images[0]}
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
                ) : item.images[selectedImage] ? (
                  <Image
                    src={item.images[selectedImage]}
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
                {item.images.map((img, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImage(index)}
                    className={`w-20 h-20 relative rounded-xl overflow-hidden flex-shrink-0 transition-all ${
                      selectedImage === index
                        ? "ring-2 ring-[var(--primary)]"
                        : "opacity-70 hover:opacity-100"
                    }`}
                  >
                    <Image src={img} alt={`${item.name} ${index + 1}`} fill className="object-cover" />
                  </button>
                ))}
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
              </p>
            </div>

            <p className="text-[var(--muted-foreground)] mb-6 leading-relaxed">{item.description}</p>

            {item.dimensions && (
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

            <Card className="mb-6">
              <CardContent className="p-5">
                <h3 className="font-semibold mb-1">Delivery Time</h3>
                <p className="text-[var(--muted-foreground)]">
                  Estimated delivery in <strong>{item.deliveryDays} days</strong>
                </p>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Link href="/catalog" className="flex-1">
                <Button variant="outline" className="w-full">
                  Back to Catalog
                </Button>
              </Link>
              <Link href="/planners" className="flex-1">
                <Button className="w-full">
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
