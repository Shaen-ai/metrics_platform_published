"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useStore } from "@/lib/store";
import { formatPrice } from "@/lib/utils";
import { CatalogItem } from "@/lib/types";
import { ArrowLeft, Home, Search, SlidersHorizontal, Package, X, ShoppingCart, Plus } from "lucide-react";
import { useResolvedAdmin } from "@/contexts/PublishedTenantProvider";
import { getDesignVariables, getSiteDesign } from "../site-designs/registry";

type SortOption = "featured" | "price-asc" | "price-desc" | "name-asc";
type LayoutMode = "grid" | "list" | "masonry" | "magazine" | "showcase" | "reels" | "commerce" | "gallery";

const MASONRY_ASPECTS = ["aspect-[3/4]", "aspect-square", "aspect-[4/3]"] as const;

// ─── Drag-aware navigation hook ─────────────────────────────────────────────

function useDragNav(itemId: string) {
  const router = useRouter();
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    pointerStart.current = { x: e.clientX, y: e.clientY };
    dragged.current = false;
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointerStart.current) return;
    const dx = e.clientX - pointerStart.current.x;
    const dy = e.clientY - pointerStart.current.y;
    if (dx * dx + dy * dy > 25) dragged.current = true;
  }, []);

  const onPointerUp = useCallback(() => {
    if (!dragged.current) router.push(`/catalog/${itemId}`);
    pointerStart.current = null;
  }, [router, itemId]);

  const nav = useCallback(() => router.push(`/catalog/${itemId}`), [router, itemId]);

  return { onPointerDown, onPointerMove, onPointerUp, nav };
}

// ─── Media renderer (shared by all card types) ──────────────────────────────

function ItemMedia({ item, className }: { item: CatalogItem; className?: string }) {
  if (item.images[0]) {
    return (
      <Image
        src={item.images[0]}
        alt={item.name}
        fill
        className={`object-cover transition-transform duration-500 group-hover:scale-105 ${className || ""}`}
      />
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center text-[var(--muted-foreground)]">
      <Package className="w-12 h-12 opacity-30" />
    </div>
  );
}

// ─── Grid / Masonry / Magazine-sub card ─────────────────────────────────────

function GridCard({ item, index, aspectClass = "aspect-[4/3]" }: { item: CatalogItem; index: number; aspectClass?: string }) {
  const { nav } = useDragNav(item.id);
  const addToCart = useStore((s) => s.addToCart);

  return (
    <div
      className="catalog-card-enter group rounded-2xl bg-white border border-[var(--border)] overflow-hidden
                 transition-all duration-300 hover:shadow-xl hover:-translate-y-1.5 hover:border-[var(--primary)]/30 cursor-pointer"
      style={{ animationDelay: `${index * 50}ms` }}
      onClick={nav}
    >
      <div className={`${aspectClass} relative bg-[var(--muted)] overflow-hidden`}>
        <ItemMedia item={item} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/5 to-transparent
                        opacity-0 group-hover:opacity-100 transition-opacity duration-300
                        pointer-events-none flex items-end justify-center pb-5">
          <span
            className="px-5 py-2 bg-white/90 backdrop-blur-sm rounded-full text-sm font-medium shadow-lg
                       transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300
                       pointer-events-auto"
            onClick={(e) => { e.stopPropagation(); nav(); }}
          >
            View Details
          </span>
        </div>
      </div>
      <div className="p-4">
        <span className="inline-block text-xs font-medium text-[var(--primary)] bg-[var(--secondary)] px-2.5 py-0.5 rounded-full">
          {item.category}
        </span>
        <h3 className="font-semibold mt-2 line-clamp-1 text-[var(--foreground)]">{item.name}</h3>
        {item.model && <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{item.model}</p>}
        <div className="flex items-center justify-between mt-2.5">
          <p className="text-lg font-bold text-[var(--primary)]">{formatPrice(item.price, item.currency)}</p>
          <button
            onClick={(e) => { e.stopPropagation(); addToCart(item); }}
            className="p-2 rounded-xl bg-[var(--primary)] text-white hover:brightness-110 transition-all shadow-sm"
            title="Add to cart"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Showcase / List / Commerce row card ────────────────────────────────────

function ShowcaseCard({ item }: { item: CatalogItem }) {
  const { nav } = useDragNav(item.id);

  return (
    <div
      className="group flex overflow-hidden rounded-2xl bg-white border border-[var(--border)]
                 transition-all duration-300 hover:shadow-xl hover:border-[var(--primary)]/30 cursor-pointer"
      onClick={nav}
    >
      <div className="relative shrink-0 overflow-hidden bg-[var(--muted)]" style={{ width: "42%", minHeight: 148 }}>
        <ItemMedia item={item} />
      </div>
      <div className="flex-1 min-w-0 p-4 flex flex-col justify-between">
        <div>
          <span className="inline-block text-xs font-medium text-[var(--primary)] bg-[var(--secondary)] px-2.5 py-0.5 rounded-full mb-2">
            {item.category}
          </span>
          <h3 className="font-semibold text-sm leading-snug line-clamp-2 mb-1">{item.name}</h3>
          {item.description && (
            <p className="text-xs text-[var(--muted-foreground)] leading-relaxed line-clamp-2 mb-2">{item.description}</p>
          )}
        </div>
        <div className="flex items-center justify-between">
          <p className="text-lg font-bold text-[var(--primary)]">{formatPrice(item.price, item.currency)}</p>
          {item.deliveryDays > 0 && (
            <span className="text-xs text-[var(--muted-foreground)]">{item.deliveryDays}d delivery</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Magazine hero ──────────────────────────────────────────────────────────

function MagazineHero({ item }: { item: CatalogItem }) {
  const { nav } = useDragNav(item.id);

  return (
    <div
      className="group relative overflow-hidden rounded-2xl mb-5 cursor-pointer border border-[var(--border)]
                 transition-all duration-300 hover:shadow-xl"
      style={{ aspectRatio: "16/7", minHeight: 180 }}
      onClick={nav}
    >
      <div className="absolute inset-0 bg-[var(--muted)]">
        <ItemMedia item={item} />
      </div>
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.18) 55%, transparent 100%)" }} />
      <div className="absolute top-3 left-3">
        <span className="px-2.5 py-1 rounded-full text-white font-semibold text-xs"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Featured
        </span>
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <span className="inline-block text-xs font-medium text-white/80 bg-white/20 backdrop-blur-sm px-2.5 py-0.5 rounded-full mb-2">
            {item.category}
          </span>
          <h3 className="font-bold text-white text-lg leading-tight line-clamp-2 mb-0.5">{item.name}</h3>
          <p className="text-white font-semibold text-sm" style={{ opacity: 0.9 }}>{formatPrice(item.price, item.currency)}</p>
        </div>
        <span
          className="shrink-0 px-5 py-2 bg-white/90 backdrop-blur-sm rounded-full text-sm font-medium shadow-lg
                     pointer-events-auto cursor-pointer hover:bg-white transition-colors"
          onClick={(e) => { e.stopPropagation(); nav(); }}
        >
          View Details
        </span>
      </div>
    </div>
  );
}

// ─── Reels: portrait cards ──────────────────────────────────────────────────

function ReelCard({ item }: { item: CatalogItem }) {
  const { nav } = useDragNav(item.id);

  return (
    <div
      className="group relative overflow-hidden cursor-pointer rounded-2xl border border-[var(--border)]
                 transition-all duration-300 hover:shadow-xl"
      style={{ aspectRatio: "2/3" }}
      onClick={nav}
    >
      <div className="absolute inset-0 bg-[var(--muted)]">
        <ItemMedia item={item} />
      </div>
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.08) 75%, transparent 100%)" }} />
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <span className="inline-block text-[10px] font-medium text-white/80 bg-white/20 backdrop-blur-sm px-2 py-0.5 rounded-full mb-2">
          {item.category}
        </span>
        <h3 className="font-bold text-white text-xs leading-snug line-clamp-2 mb-1"
          style={{ textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>
          {item.name}
        </h3>
        <p className="font-semibold text-white text-sm" style={{ opacity: 0.92 }}>
          {formatPrice(item.price, item.currency)}
        </p>
      </div>
    </div>
  );
}

// ─── Gallery: tight square grid with hover-reveal ───────────────────────────

function GalleryCell({ item }: { item: CatalogItem }) {
  const { nav } = useDragNav(item.id);

  return (
    <div
      className="group relative overflow-hidden cursor-pointer bg-[var(--muted)]"
      style={{ aspectRatio: "1/1" }}
      onClick={nav}
    >
      <ItemMedia item={item} />
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-3 px-2
                      opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)" }}>
        <p className="text-white text-xs font-semibold line-clamp-1 text-center w-full mb-0.5 pointer-events-none"
          style={{ textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>
          {item.name}
        </p>
        <p className="text-white font-bold text-xs mb-2 pointer-events-none" style={{ opacity: 0.95 }}>
          {formatPrice(item.price, item.currency)}
        </p>
        <span
          className="px-4 py-1.5 bg-white/90 backdrop-blur-sm rounded-full text-xs font-medium shadow-lg
                     pointer-events-auto cursor-pointer hover:bg-white transition-colors"
          onClick={(e) => { e.stopPropagation(); nav(); }}
        >
          View
        </span>
      </div>
    </div>
  );
}

// ─── Layout switcher icons ──────────────────────────────────────────────────

const LAYOUT_OPTIONS: { id: LayoutMode; label: string; icon: React.ReactNode }[] = [
  {
    id: "grid", label: "Grid",
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.4"/><rect x="8" y="1" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.4"/><rect x="1" y="8" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.4"/><rect x="8" y="8" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.4"/></svg>,
  },
  {
    id: "list", label: "List",
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.4"/><path d="M8 3.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M8 5.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><rect x="1" y="9" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.4"/><path d="M8 10.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M8 12.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  },
  {
    id: "masonry", label: "Masonry",
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="5" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.4"/><rect x="8" y="1" width="5" height="4" rx="1.2" stroke="currentColor" strokeWidth="1.4"/><rect x="1" y="10" width="5" height="3" rx="1.2" stroke="currentColor" strokeWidth="1.4"/><rect x="8" y="7" width="5" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.4"/></svg>,
  },
  {
    id: "magazine", label: "Magazine",
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.4"/><rect x="1" y="8" width="3.5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4"/><rect x="5.5" y="8" width="3.5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4"/><rect x="10" y="8" width="3" height="5" rx="1" stroke="currentColor" strokeWidth="1.4"/></svg>,
  },
  {
    id: "showcase", label: "Showcase",
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="5.5" height="4.5" rx="1.2" stroke="currentColor" strokeWidth="1.4"/><path d="M8 2.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M8 4.5h3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><rect x="1" y="8" width="5.5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.4"/><path d="M8 9.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M8 11.5h3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  },
  {
    id: "reels", label: "Reels",
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="5" height="12" rx="1.2" stroke="currentColor" strokeWidth="1.4"/><rect x="8" y="1" width="5" height="12" rx="1.2" stroke="currentColor" strokeWidth="1.4"/><path d="M3 7l2-1.2v2.4L3 7z" fill="currentColor"/></svg>,
  },
  {
    id: "commerce", label: "Commerce",
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="4" height="4" rx="1.2" stroke="currentColor" strokeWidth="1.4"/><path d="M7 3.5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M7 5.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><rect x="1" y="8" width="4" height="4" rx="1.2" stroke="currentColor" strokeWidth="1.4"/><path d="M7 9.5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M7 11.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  },
  {
    id: "gallery", label: "Gallery",
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="3.5" height="3.5" rx="0.8" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1.3"/><rect x="5.25" y="1" width="3.5" height="3.5" rx="0.8" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1.3"/><rect x="9.5" y="1" width="3.5" height="3.5" rx="0.8" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1.3"/><rect x="1" y="5.25" width="3.5" height="3.5" rx="0.8" fill="currentColor" opacity="0.6" stroke="currentColor" strokeWidth="1.3"/><rect x="5.25" y="5.25" width="3.5" height="3.5" rx="0.8" fill="currentColor" stroke="currentColor" strokeWidth="1.3"/><rect x="9.5" y="5.25" width="3.5" height="3.5" rx="0.8" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1.3"/><rect x="1" y="9.5" width="3.5" height="3.5" rx="0.8" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1.3"/><rect x="5.25" y="9.5" width="3.5" height="3.5" rx="0.8" fill="currentColor" opacity="0.5" stroke="currentColor" strokeWidth="1.3"/><rect x="9.5" y="9.5" width="3.5" height="3.5" rx="0.8" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1.3"/></svg>,
  },
];

function LayoutSwitcher({ active, onChange }: { active: LayoutMode; onChange: (l: LayoutMode) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-white border border-[var(--border)] shadow-sm">
      {LAYOUT_OPTIONS.map(({ id, label, icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          title={label}
          className={`relative flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-150 ${
            active === id
              ? "bg-[var(--primary)] text-white shadow-sm"
              : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

function FloatingCartButton() {
  const cart = useStore((s) => s.cart);
  const count = cart.reduce((sum, c) => sum + c.quantity, 0);
  if (count === 0) return null;
  return (
    <Link
      href="/checkout"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-5 py-3 rounded-full
                 bg-[var(--primary)] text-white font-semibold shadow-xl shadow-[var(--primary)]/30
                 hover:brightness-110 transition-all"
    >
      <ShoppingCart className="w-5 h-5" />
      <span>{count}</span>
    </Link>
  );
}

export default function CatalogPage() {
  const { catalogItems, initializeStore } = useStore();
  const admin = useResolvedAdmin();
  const design = getSiteDesign(admin);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("featured");
  const [layout, setLayout] = useState<LayoutMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("catalog-layout") as LayoutMode) || "grid";
    }
    return "grid";
  });

  useEffect(() => {
    initializeStore();
  }, [initializeStore]);

  useEffect(() => {
    localStorage.setItem("catalog-layout", layout);
  }, [layout]);

  const categories = useMemo(() => {
    const cats = catalogItems.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {});
    return [{ name: "all", count: catalogItems.length }, ...Object.entries(cats).map(([name, count]) => ({ name, count }))];
  }, [catalogItems]);

  const filteredAndSortedItems = useMemo(() => {
    let items = catalogItems;
    if (selectedCategory !== "all") {
      items = items.filter((item) => item.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q)
      );
    }
    switch (sortBy) {
      case "price-asc": items = [...items].sort((a, b) => a.price - b.price); break;
      case "price-desc": items = [...items].sort((a, b) => b.price - a.price); break;
      case "name-asc": items = [...items].sort((a, b) => a.name.localeCompare(b.name)); break;
    }
    return items;
  }, [catalogItems, selectedCategory, searchQuery, sortBy]);

  const resetFilters = () => {
    setSelectedCategory("all");
    setSearchQuery("");
    setSortBy("featured");
  };

  const hasActiveFilters = selectedCategory !== "all" || searchQuery.trim() !== "" || sortBy !== "featured";
  const catalogTitle = admin?.publicSiteTexts?.catalogTitle?.trim() || "Our Collection";
  const catalogSubtitle =
    admin?.publicSiteTexts?.catalogSubtitle?.trim() ||
    `${catalogItems.length} ${catalogItems.length === 1 ? "piece" : "pieces"} of handcrafted furniture`;

  const renderItems = () => {
    const items = filteredAndSortedItems;
    if (items.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-[var(--secondary)] flex items-center justify-center mb-6 animate-float">
            <Package className="w-10 h-10 text-[var(--primary)]" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No items found</h3>
          <p className="text-[var(--muted-foreground)] text-center max-w-sm mb-6">
            {searchQuery
              ? `No results for "${searchQuery}". Try a different search term or adjust your filters.`
              : "No items available in this category right now."}
          </p>
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="px-6 py-2.5 rounded-full bg-[var(--primary)] text-white text-sm font-medium
                         hover:brightness-110 transition-all shadow-md shadow-[var(--primary)]/25"
            >
              Reset All Filters
            </button>
          )}
        </div>
      );
    }

    switch (layout) {
      case "masonry":
        return (
          <div className="columns-2 sm:columns-3 gap-4 pb-12">
            {items.map((item, i) => (
              <div key={item.id} className="break-inside-avoid mb-4">
                <GridCard item={item} index={i} aspectClass={MASONRY_ASPECTS[i % MASONRY_ASPECTS.length]} />
              </div>
            ))}
          </div>
        );

      case "magazine":
        return (
          <div className="pb-12">
            <MagazineHero item={items[0]} />
            {items.length > 1 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
                {items.slice(1).map((item, i) => (
                  <GridCard key={item.id} item={item} index={i} />
                ))}
              </div>
            )}
          </div>
        );

      case "showcase":
      case "list":
      case "commerce":
        return (
          <div className="flex flex-col gap-4 pb-12">
            {items.map((item) => (
              <ShowcaseCard key={item.id} item={item} />
            ))}
          </div>
        );

      case "reels":
        return (
          <div className="grid grid-cols-2 gap-3 pb-12">
            {items.map((item) => (
              <ReelCard key={item.id} item={item} />
            ))}
          </div>
        );

      case "gallery":
        return (
          <div className="grid grid-cols-3 gap-px bg-[var(--border)] rounded-2xl overflow-hidden pb-12">
            {items.map((item) => (
              <GalleryCell key={item.id} item={item} />
            ))}
          </div>
        );

      default:
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 pb-12">
            {items.map((item, i) => (
              <GridCard key={item.id} item={item} index={i} />
            ))}
          </div>
        );
    }
  };

  return (
    <div className={`min-h-screen ${design.shellClass}`} style={getDesignVariables(admin)}>
      <header className={`sticky top-0 z-50 ${design.headerClass}`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 hover:bg-[var(--muted)] rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[var(--primary)] flex items-center justify-center text-white font-bold text-xs">
                {admin?.companyName?.[0] || "T"}
              </div>
              <span className="text-lg font-semibold">{catalogTitle}</span>
            </div>
          </div>
          <Link href="/" className="p-2 hover:bg-[var(--muted)] rounded-full transition-colors">
            <Home className="w-5 h-5" />
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6">
        <section className="pt-10 pb-8">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">{catalogTitle}</h1>
          <p className="mt-2 text-[var(--muted-foreground)] text-lg">
            {catalogSubtitle}
          </p>
          <div className="mt-3 w-16 h-1 rounded-full bg-[var(--primary)]" />
        </section>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
            <input
              type="text"
              placeholder="Search furniture..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-full bg-white border border-[var(--border)] text-sm
                         placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]
                         focus:border-transparent transition-shadow"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-[var(--muted)] transition-colors"
              >
                <X className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <SlidersHorizontal className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)] pointer-events-none" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="appearance-none pl-11 pr-10 py-3 rounded-full bg-white border border-[var(--border)] text-sm
                           focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent
                           cursor-pointer transition-shadow"
              >
                <option value="featured">Featured</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="name-asc">Name: A &rarr; Z</option>
              </select>
              <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)] pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <LayoutSwitcher active={layout} onChange={setLayout} />
          </div>
        </div>

        <div className="mb-8 flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat.name}
              onClick={() => setSelectedCategory(cat.name)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                selectedCategory === cat.name
                  ? "bg-[var(--primary)] text-white shadow-md shadow-[var(--primary)]/25"
                  : "bg-white hover:bg-[var(--secondary)] border border-[var(--border)] text-[var(--foreground)]"
              }`}
            >
              {cat.name === "all" ? "All Items" : cat.name}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                selectedCategory === cat.name
                  ? "bg-white/25 text-white"
                  : "bg-[var(--muted)] text-[var(--muted-foreground)]"
              }`}>
                {cat.count}
              </span>
            </button>
          ))}
        </div>

        {renderItems()}
      </main>
      <FloatingCartButton />
    </div>
  );
}
