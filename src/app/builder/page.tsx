"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useStore } from "@/lib/store";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { formatPrice } from "@/lib/utils";
import { ArrowLeft, Home, Plus, Minus, Trash2 } from "lucide-react";
import { getDesignVariables, getSiteDesign } from "../site-designs/registry";

export default function BuilderPage() {
  const {
    modules,
    builderModules,
    addModuleToBuild,
    removeModuleFromBuild,
    clearBuild,
    getBuildTotal,
    admin,
    initializeStore,
  } = useStore();
  const design = getSiteDesign(admin);

  useEffect(() => {
    initializeStore();
  }, [initializeStore]);

  const buildTotal = getBuildTotal();

  return (
    <div className={`min-h-screen ${design.shellClass}`} style={getDesignVariables(admin)}>
      {/* Header */}
      <header className={`sticky top-0 z-50 ${design.headerClass}`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 hover:bg-[var(--muted)] rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[var(--primary)] flex items-center justify-center text-white font-bold text-xs">T</div>
              <span className="text-lg font-semibold">Module Builder</span>
            </div>
          </div>

          <Link href="/" className="p-2 hover:bg-[var(--muted)] rounded-full transition-colors">
            <Home className="w-5 h-5" />
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Available Modules */}
          <div className="lg:col-span-2">
            <h2 className="text-2xl mb-6">Available Modules</h2>
            {modules.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-[var(--border)]">
                <p className="text-[var(--muted-foreground)]">No modules available.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {modules.map((module) => (
                  <Card key={module.id} className="overflow-hidden">
                    <div className="aspect-video relative bg-[var(--muted)]">
                      {module.imageUrl ? (
                        <Image
                          src={module.imageUrl}
                          alt={module.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[var(--muted-foreground)]">
                          No image
                        </div>
                      )}
                    </div>
                    <CardContent className="pt-4">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold">{module.name}</h3>
                        <p className="font-bold text-[var(--primary)]">
                          {formatPrice(module.price, module.currency)}
                        </p>
                      </div>
                      <p className="text-sm text-[var(--muted-foreground)] mb-2 line-clamp-2">
                        {module.description}
                      </p>
                      <p className="text-xs text-[var(--muted-foreground)] mb-3">
                        {module.dimensions.width} x {module.dimensions.height} x {module.dimensions.depth} {module.dimensions.unit}
                      </p>
                      <Button onClick={() => addModuleToBuild(module)} className="w-full">
                        <Plus className="w-4 h-4 mr-2" />
                        Add to Build
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Build Summary */}
          <div>
            <Card className="sticky top-24">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Your Build
                  {builderModules.length > 0 && (
                    <button
                      onClick={clearBuild}
                      className="text-sm text-red-500 hover:underline font-normal"
                    >
                      Clear All
                    </button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {builderModules.length === 0 ? (
                  <div className="text-center py-8 text-[var(--muted-foreground)]">
                    <p className="mb-2">No modules added yet</p>
                    <p className="text-sm">Select modules from the left to start building.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {builderModules.map(({ module, quantity }) => (
                      <div
                        key={module.id}
                        className="flex items-center justify-between p-3 bg-[var(--muted)] rounded-xl"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{module.name}</p>
                          <p className="text-sm text-[var(--muted-foreground)]">
                            {formatPrice(module.price, module.currency)} each
                          </p>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <button
                            onClick={() => {
                              const current = builderModules.find((m) => m.module.id === module.id);
                              if (current && current.quantity > 1) {
                                // Would need updateQuantity method
                              } else {
                                removeModuleFromBuild(module.id);
                              }
                            }}
                            className="p-1 hover:bg-white rounded-lg"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="w-8 text-center">{quantity}</span>
                          <button
                            onClick={() => addModuleToBuild(module)}
                            className="p-1 hover:bg-white rounded-lg"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => removeModuleFromBuild(module.id)}
                            className="p-1 hover:bg-white rounded-lg text-red-500"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}

                    <div className="border-t border-[var(--border)] pt-4">
                      <div className="flex justify-between items-center mb-4">
                        <span className="font-semibold">Total</span>
                        <span className="text-xl font-bold text-[var(--primary)]">
                          {formatPrice(buildTotal, admin?.currency || "USD")}
                        </span>
                      </div>
                      <Link href="/planners">
                        <Button className="w-full">
                          Try in Planner
                        </Button>
                      </Link>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
