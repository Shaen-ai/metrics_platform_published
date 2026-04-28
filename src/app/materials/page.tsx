"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useResolvedAdmin } from "@/contexts/PublishedTenantProvider";
import { Button, Card, CardContent } from "@/components/ui";
import { formatPrice } from "@/lib/utils";
import { ArrowLeft, Home, Check, Filter } from "lucide-react";
import { getDesignVariables, getSiteDesign } from "../site-designs/registry";

export default function MaterialsPage() {
  const { materials, initializeStore } = useStore();
  const admin = useResolvedAdmin();
  const design = getSiteDesign(admin);
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([]);

  useEffect(() => {
    initializeStore();
  }, [initializeStore]);

  const types = ["all", ...new Set(materials.map((m) => m.type))];
  const materialsTitle = admin?.publicSiteTexts?.materialsTitle?.trim() || "Materials";

  const filteredMaterials = selectedType === "all"
    ? materials
    : materials.filter((m) => m.type === selectedType);

  const toggleMaterial = (materialId: string) => {
    setSelectedMaterials((prev) =>
      prev.includes(materialId)
        ? prev.filter((id) => id !== materialId)
        : [...prev, materialId]
    );
  };

  const getSelectedMaterialsInfo = () => {
    return materials.filter((m) => selectedMaterials.includes(m.id));
  };

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
              <span className="text-lg font-semibold">{materialsTitle}</span>
            </div>
          </div>

          <Link href="/" className="p-2 hover:bg-[var(--muted)] rounded-full transition-colors">
            <Home className="w-5 h-5" />
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Type Filter */}
        <div className="mb-8 flex items-center gap-3 overflow-x-auto pb-2">
          <Filter className="w-5 h-5 text-[var(--muted-foreground)] flex-shrink-0" />
          {types.map((type) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`px-5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all capitalize ${
                selectedType === type
                  ? "bg-[var(--primary)] text-white shadow-sm"
                  : "bg-white hover:bg-[var(--muted)] border border-[var(--border)]"
              }`}
            >
              {type === "all" ? "All Materials" : type}
            </button>
          ))}
        </div>

        {/* Selected Materials Banner */}
        {selectedMaterials.length > 0 && (
          <div className="mb-6 p-4 bg-white rounded-2xl border border-[var(--border)] shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="font-medium">
                  {selectedMaterials.length} material{selectedMaterials.length > 1 ? "s" : ""} selected
                </span>
                <div className="flex gap-2">
                  {getSelectedMaterialsInfo().map((m) => (
                    <div
                      key={m.id}
                      className="w-6 h-6 rounded-full border-2 border-white shadow"
                      style={{ backgroundColor: m.colorCode }}
                      title={m.name}
                    />
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedMaterials([])}>
                  Clear
                </Button>
                <Link href="/editor">
                  <Button size="sm">Use in Editor</Button>
                </Link>
                <Link href={`/planners/kitchen-design?material=${encodeURIComponent(selectedMaterials[0] ?? "")}`}>
                  <Button size="sm" variant="outline" disabled={selectedMaterials.length === 0}>
                    Kitchen Designer
                  </Button>
                </Link>
                <Link href={`/planners/wardrobe?material=${encodeURIComponent(selectedMaterials[0] ?? "")}`}>
                  <Button size="sm" variant="outline" disabled={selectedMaterials.length === 0}>
                    Wardrobe Planner
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Materials Grid */}
        {filteredMaterials.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-[var(--muted-foreground)]">No materials found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredMaterials.map((material) => {
              const isSelected = selectedMaterials.includes(material.id);
              return (
                <Card
                  key={material.id}
                  variant="interactive"
                  className={`overflow-hidden cursor-pointer ${
                    isSelected ? "ring-2 ring-[var(--primary)]" : ""
                  }`}
                  onClick={() => toggleMaterial(material.id)}
                >
                  <div
                    className="aspect-square relative"
                    style={{ backgroundColor: material.colorCode }}
                  >
                    {isSelected && (
                      <div className="absolute inset-0 bg-[var(--primary)]/20 flex items-center justify-center">
                        <div className="w-8 h-8 bg-[var(--primary)] rounded-full flex items-center justify-center">
                          <Check className="w-5 h-5 text-white" />
                        </div>
                      </div>
                    )}
                  </div>
                  <CardContent className="pt-3 pb-3">
                    <h3 className="font-medium text-sm truncate">{material.name}</h3>
                    <p className="text-xs text-[var(--muted-foreground)] capitalize">{material.type}</p>
                    <p className="text-sm font-medium text-[var(--primary)] mt-1">
                      {formatPrice(material.pricePerUnit, admin?.currency || "USD")}/{material.unit}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
