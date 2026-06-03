"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Package, Search, Check, X, Loader2 } from "lucide-react";
import { getPublicApiUrl } from "@/lib/publicEnv";
import { formatPrice, toRelativeStorageUrl } from "@/lib/utils";
import {
  catalogItemAllCategoryLabels,
  catalogItemMatchesCategoryFilter,
} from "@/lib/catalogItemCategories";
import { useInteriorDesignStore } from "../store";
import type { SelectedCatalogProduct } from "../store";

interface CatalogRow {
  id: string;
  name: string;
  description: string;
  category: string;
  additionalCategories?: string[];
  allCategories?: string[];
  images: string[];
  price: number;
  currency: string;
}

const MAX_SELECTED = 10;

export default function CatalogProductPicker({
  adminSlug,
  disabled = false,
}: {
  adminSlug: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const fetchedSlugRef = useRef<string | null>(null);

  const selectedCatalogProducts = useInteriorDesignStore((s) => s.selectedCatalogProducts);
  const setSelectedCatalogProducts = useInteriorDesignStore((s) => s.setSelectedCatalogProducts);

  const [localSelection, setLocalSelection] = useState<Map<string, SelectedCatalogProduct>>(
    new Map(),
  );

  const syncLocalFromStore = useCallback(() => {
    const m = new Map<string, SelectedCatalogProduct>();
    for (const p of selectedCatalogProducts) m.set(p.id, p);
    setLocalSelection(m);
  }, [selectedCatalogProducts]);

  const fetchCatalog = useCallback(async () => {
    if (fetchedSlugRef.current === adminSlug && rows.length > 0) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        include_library: "1",
        interior_design_ai: "1",
      });
      const res = await fetch(
        `${getPublicApiUrl()}/public/${encodeURIComponent(adminSlug)}/catalog?${params}`,
        { cache: "no-store", headers: { Accept: "application/json" } },
      );
      if (!res.ok) throw new Error("Failed to load catalog");
      const json = (await res.json()) as { data?: unknown[] };
      const items = Array.isArray(json.data) ? json.data : [];
      const parsed: CatalogRow[] = items
        .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
        .map((r) => ({
          id: String(r.id ?? ""),
          name: typeof r.name === "string" ? r.name : "Item",
          description: typeof r.description === "string" ? r.description : "",
          category: typeof r.category === "string" ? r.category : "",
          additionalCategories: Array.isArray(r.additionalCategories)
            ? (r.additionalCategories as string[])
            : undefined,
          allCategories: Array.isArray(r.allCategories)
            ? (r.allCategories as string[])
            : undefined,
          images: Array.isArray(r.images) ? (r.images as string[]) : [],
          price: Number(r.price) || 0,
          currency: typeof r.currency === "string" ? r.currency : "USD",
        }))
        .filter((r) => r.id);
      setRows(parsed);
      fetchedSlugRef.current = adminSlug;
    } catch {
      /* graceful — grid stays empty */
    } finally {
      setLoading(false);
    }
  }, [adminSlug, rows.length]);

  const handleOpen = useCallback(() => {
    syncLocalFromStore();
    setOpen(true);
    setSearch("");
    setCategory("all");
    fetchCatalog();
  }, [syncLocalFromStore, fetchCatalog]);

  const categories = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const item of rows) {
      for (const label of catalogItemAllCategoryLabels(item)) {
        const slug = label.toLowerCase();
        const cur = counts.get(slug);
        if (!cur) counts.set(slug, { label, count: 1 });
        else counts.set(slug, { label: cur.label, count: cur.count + 1 });
      }
    }
    return [
      { slug: "all", label: "All", count: rows.length },
      ...[...counts.entries()]
        .map(([slug, { label, count }]) => ({ slug, label, count }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [rows]);

  const filtered = useMemo(() => {
    let items = rows;
    if (category !== "all") {
      items = items.filter((item) => catalogItemMatchesCategoryFilter(item, category));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((item) => {
        const labelBlob = catalogItemAllCategoryLabels(item).join(" ").toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          labelBlob.includes(q)
        );
      });
    }
    return items;
  }, [rows, category, search]);

  const toggleItem = useCallback(
    (item: CatalogRow) => {
      setLocalSelection((prev) => {
        const next = new Map(prev);
        if (next.has(item.id)) {
          next.delete(item.id);
        } else {
          if (next.size >= MAX_SELECTED) return prev;
          next.set(item.id, {
            id: item.id,
            name: item.name,
            image: toRelativeStorageUrl(item.images[0]),
            price: item.price,
            currency: item.currency,
          });
        }
        return next;
      });
    },
    [],
  );

  const handleConfirm = useCallback(() => {
    setSelectedCatalogProducts([...localSelection.values()]);
    setOpen(false);
  }, [localSelection, setSelectedCatalogProducts]);

  const handleClear = useCallback(() => {
    setLocalSelection(new Map());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="id-prompt-field">
        <label className="id-prompt-field__label">
          Prioritize catalog products (optional)
        </label>
        <button
          type="button"
          className="id-picker-btn"
          onClick={handleOpen}
          disabled={disabled}
        >
          <Package className="h-4 w-4" />
          Select from Catalog
          {selectedCatalogProducts.length > 0 && (
            <span className="id-picker-btn__badge">{selectedCatalogProducts.length}</span>
          )}
        </button>

        {selectedCatalogProducts.length > 0 && (
          <div className="id-picker-chips">
            {selectedCatalogProducts.map((p) => (
              <div key={p.id} className="id-picker-chip">
                {p.image ? (
                  <img src={p.image} alt="" className="id-picker-chip__img" />
                ) : (
                  <div
                    className="id-picker-chip__img"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "var(--muted, #f0f0f0)",
                    }}
                  >
                    <Package className="h-3 w-3" style={{ opacity: 0.4 }} />
                  </div>
                )}
                <span className="id-picker-chip__name">{p.name}</span>
                <button
                  type="button"
                  className="id-picker-chip__remove"
                  onClick={() =>
                    setSelectedCatalogProducts(
                      selectedCatalogProducts.filter((x) => x.id !== p.id),
                    )
                  }
                  disabled={disabled}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {open && (
        <div className="id-picker-overlay" onClick={() => setOpen(false)}>
          <div className="id-picker-modal" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="id-picker-header">
              <div>
                <h3 className="id-picker-header__title">Select Products for AI</h3>
                <span className="id-picker-header__count">
                  {localSelection.size} / {MAX_SELECTED} selected
                </span>
              </div>
              <button
                type="button"
                className="id-picker-header__close"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Toolbar */}
            <div className="id-picker-toolbar">
              <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
                <Search
                  className="h-4 w-4"
                  style={{
                    position: "absolute",
                    left: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--muted-foreground, #999)",
                    pointerEvents: "none",
                  }}
                />
                <input
                  className="id-picker-search"
                  style={{ paddingLeft: 32 }}
                  placeholder="Search products..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
              </div>
              <select
                className="id-picker-category-select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.label} ({c.count})
                  </option>
                ))}
              </select>
            </div>

            {/* Grid */}
            <div className="id-picker-body">
              <div className="id-picker-grid">
                {loading && (
                  <div className="id-picker-loading">
                    <Loader2 className="h-6 w-6 animate-spin" style={{ margin: "0 auto 8px" }} />
                    Loading catalog...
                  </div>
                )}

                {!loading && filtered.length === 0 && (
                  <div className="id-picker-empty">
                    {rows.length === 0
                      ? "No catalog products available."
                      : "No products match your search."}
                  </div>
                )}

                {!loading &&
                  filtered.map((item) => {
                    const isSelected = localSelection.has(item.id);
                    const atLimit = localSelection.size >= MAX_SELECTED && !isSelected;
                    const imgSrc = toRelativeStorageUrl(item.images[0]);

                    return (
                      <div
                        key={item.id}
                        className={`id-picker-card${isSelected ? " id-picker-card--selected" : ""}${atLimit ? " id-picker-card--disabled" : ""}`}
                        onClick={() => !atLimit && toggleItem(item)}
                      >
                        <div className="id-picker-card__img-wrap">
                          {imgSrc ? (
                            <img
                              src={imgSrc}
                              alt={item.name}
                              className="id-picker-card__img"
                              loading="lazy"
                            />
                          ) : (
                            <div
                              style={{
                                width: "100%",
                                height: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Package
                                className="h-8 w-8"
                                style={{ opacity: 0.25 }}
                              />
                            </div>
                          )}
                          {isSelected && (
                            <div className="id-picker-card__check">
                              <Check className="h-3.5 w-3.5" />
                            </div>
                          )}
                        </div>
                        <div className="id-picker-card__info">
                          <p className="id-picker-card__name">{item.name}</p>
                          <div className="id-picker-card__meta">
                            <span className="id-picker-card__category">
                              {item.category}
                            </span>
                            <span className="id-picker-card__price">
                              {formatPrice(item.price, item.currency)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Footer */}
            <div className="id-picker-footer">
              {localSelection.size > 0 && (
                <button
                  type="button"
                  className="id-picker-footer__clear"
                  onClick={handleClear}
                >
                  Clear all
                </button>
              )}
              <button
                type="button"
                className="id-picker-footer__confirm"
                onClick={handleConfirm}
              >
                Confirm ({localSelection.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
