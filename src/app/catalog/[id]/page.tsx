"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useStore } from "@/lib/store";
import { Button, Card, CardContent } from "@/components/ui";
import { formatPrice } from "@/lib/utils";
import { ArrowLeft, Home, Box } from "lucide-react";
import dynamic from "next/dynamic";

const ModelPreview = dynamic(() => import("@/components/ModelPreview"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2">
      <Box className="w-12 h-12 text-emerald-500 animate-pulse" />
      <span className="text-xs font-medium text-emerald-600">Loading 3D...</span>
    </div>
  ),
});

export default function CatalogDetailPage() {
  const params = useParams();
  const itemId = params.id as string;

  const { catalogItems, initializeStore } = useStore();
  const [selectedImage, setSelectedImage] = useState(0);

  useEffect(() => {
    initializeStore();
  }, [initializeStore]);

  const item = catalogItems.find((i) => i.id === itemId);

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
          {/* Image Gallery */}
          <div>
            <Card className="overflow-hidden mb-4">
              <div className="aspect-square relative bg-[var(--muted)]">
                {item.images[selectedImage] ? (
                  <Image
                    src={item.images[selectedImage]}
                    alt={item.name}
                    fill
                    className="object-cover"
                  />
                ) : item.modelUrl && item.modelStatus === "done" ? (
                  <ModelPreview modelUrl={item.modelUrl} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[var(--muted-foreground)]">
                    No image
                  </div>
                )}
              </div>
            </Card>

            {item.images.length > 1 && (
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
