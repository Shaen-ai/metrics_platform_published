"use client";

import { useState, useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import {
  CatalogItem,
  Module,
  Material,
  Admin,
  CanvasObject,
  CartLine,
  CartCatalogLine,
  CartWardrobeLine,
  CartKitchenFurnitureLine,
  CartModulePlannerLine,
  ModuleTemplateSelection,
  ModuleTemplatePriceBreakdown,
  PlannerSavedWardrobe,
} from "./types";
import type { WardrobeConfig } from "@/app/planner/wardrobe/types";
import type { KitchenConfig } from "@/app/planner/kitchen/types";
import { api, ApiNetworkError } from "./api";
import { normalizeApiModule } from "./normalizeApiModule";
import { mapTemplateRowToMaterial, type PublicMaterialTemplateRow } from "./materialTemplateToMaterial";
import { getPublishedAdminSlug } from "./tenant";

interface StoreState {
  admin: Admin | null;
  catalogItems: CatalogItem[];
  modules: Module[];
  materials: Material[];
  initialized: boolean;

  // Custom Design
  canvasObjects: CanvasObject[];
  selectedObjectId: string | null;
  addCanvasObject: (obj: CanvasObject) => void;
  updateCanvasObject: (id: string, updates: Partial<CanvasObject>) => void;
  removeCanvasObject: (id: string) => void;
  selectCanvasObject: (id: string | null) => void;
  clearCanvas: () => void;

  // Module Builder
  builderModules: { module: Module; quantity: number }[];
  addModuleToBuild: (module: Module) => void;
  removeModuleFromBuild: (moduleId: string) => void;
  clearBuild: () => void;
  getBuildTotal: () => number;

  /** User-created modules (Module Planner); persisted locally only. */
  plannerCustomModules: Module[];
  addPlannerCustomModule: (module: Module) => void;
  removePlannerCustomModule: (moduleId: string) => void;

  /** User-saved wardrobes for Bedroom planner; persisted locally only. */
  plannerSavedWardrobes: PlannerSavedWardrobe[];
  addPlannerSavedWardrobe: (entry: PlannerSavedWardrobe) => void;
  removePlannerSavedWardrobe: (id: string) => void;

  // Cart
  cart: CartLine[];
  addToCart: (item: CatalogItem) => void;
  addWardrobeToCart: (payload: { name: string; price: number; config: WardrobeConfig }) => void;
  addKitchenToCart: (payload: { name: string; price: number; config: KitchenConfig }) => void;
  addModulePlannerToCart: (payload: {
    name: string;
    price: number;
    module: Module;
    selection?: ModuleTemplateSelection;
    breakdown?: ModuleTemplatePriceBreakdown;
  }) => void;
  removeFromCart: (lineId: string) => void;
  updateCartQuantity: (lineId: string, quantity: number) => void;
  clearCart: () => void;
  getCartTotal: () => number;

  // Initialize from backend API
  initializeStore: (adminSlug?: string) => Promise<void>;
}

function lineTotal(line: CartLine): number {
  if (line.kind === "catalog") return line.item.price * line.quantity;
  return line.price * line.quantity;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      admin: null,
      catalogItems: [],
      modules: [],
      materials: [],
      initialized: false,
      canvasObjects: [],
      selectedObjectId: null,
      builderModules: [],
      plannerCustomModules: [],
      plannerSavedWardrobes: [],
      cart: [],

      initializeStore: async (adminSlug?: string) => {
        const resolvedSlug = adminSlug || getPublishedAdminSlug();
        try {
          const [adminRes, catalogRes, modulesRes, materialsRes] = await Promise.all([
            api.getAdmin(resolvedSlug),
            api.getCatalog(resolvedSlug),
            api.getModules(resolvedSlug),
            api.getMaterials(resolvedSlug),
          ]);
          const admin = adminRes.data as Admin;
          let materials = (materialsRes.data as Material[]) ?? [];
          if (materials.length === 0) {
            try {
              const tplRes = await api.getPublicMaterialTemplates();
              const rows = (tplRes.data as PublicMaterialTemplateRow[]) ?? [];
              materials = rows.map((row) => mapTemplateRowToMaterial(row, admin.id));
            } catch {
              /* catalog optional */
            }
          }
          const rawModules = (modulesRes.data as Record<string, unknown>[]) ?? [];
          set({
            admin,
            catalogItems: catalogRes.data as CatalogItem[],
            modules: rawModules.map((m) => normalizeApiModule(m)),
            materials,
            initialized: true,
          });
        } catch (e) {
          if (e instanceof ApiNetworkError) {
            console.warn(
              "[Store] API unavailable, using built-in materials. Start backend with: cd backend && php artisan serve"
            );
          } else {
            console.error("Failed to initialize store from API:", e);
          }
          /** Unblocks catalog routes that wait on `initialized` (detail page, 3D strip). */
          set({ initialized: true });
        }
      },

      addCanvasObject: (obj) => {
        set({ canvasObjects: [...get().canvasObjects, obj] });
      },

      updateCanvasObject: (id, updates) => {
        set({
          canvasObjects: get().canvasObjects.map((obj) =>
            obj.id === id ? { ...obj, ...updates } : obj
          ),
        });
      },

      removeCanvasObject: (id) => {
        set({
          canvasObjects: get().canvasObjects.filter((obj) => obj.id !== id),
          selectedObjectId: get().selectedObjectId === id ? null : get().selectedObjectId,
        });
      },

      selectCanvasObject: (id) => set({ selectedObjectId: id }),

      clearCanvas: () => set({ canvasObjects: [], selectedObjectId: null }),

      addModuleToBuild: (module) => {
        const { builderModules } = get();
        const existing = builderModules.find((m) => m.module.id === module.id);
        if (existing) {
          set({
            builderModules: builderModules.map((m) =>
              m.module.id === module.id ? { ...m, quantity: m.quantity + 1 } : m
            ),
          });
        } else {
          set({ builderModules: [...builderModules, { module, quantity: 1 }] });
        }
      },

      removeModuleFromBuild: (moduleId) => {
        set({
          builderModules: get().builderModules.filter((m) => m.module.id !== moduleId),
        });
      },

      clearBuild: () => set({ builderModules: [] }),

      addPlannerCustomModule: (module) => {
        set({ plannerCustomModules: [...get().plannerCustomModules, module] });
      },

      removePlannerCustomModule: (moduleId) => {
        set({
          plannerCustomModules: get().plannerCustomModules.filter((m) => m.id !== moduleId),
        });
      },

      addPlannerSavedWardrobe: (entry) => {
        set({ plannerSavedWardrobes: [...get().plannerSavedWardrobes, entry] });
      },

      removePlannerSavedWardrobe: (id) => {
        set({
          plannerSavedWardrobes: get().plannerSavedWardrobes.filter((w) => w.id !== id),
        });
      },

      getBuildTotal: () => {
        return get().builderModules.reduce(
          (total, { module, quantity }) => total + module.price * quantity,
          0
        );
      },

      addToCart: (item: CatalogItem) => {
        const { cart } = get();
        const existing = cart.find(
          (c): c is CartCatalogLine => c.kind === "catalog" && c.lineId === item.id
        );
        if (existing) {
          set({
            cart: cart.map((c) =>
              c.kind === "catalog" && c.lineId === item.id
                ? { ...c, quantity: c.quantity + 1 }
                : c
            ),
          });
        } else {
          const line: CartCatalogLine = {
            kind: "catalog",
            lineId: item.id,
            item,
            quantity: 1,
          };
          set({ cart: [...cart, line] });
        }
      },

      addWardrobeToCart: ({ name, price, config }) => {
        const line: CartWardrobeLine = {
          kind: "wardrobe",
          lineId: uuidv4(),
          name,
          price,
          quantity: 1,
          config: structuredClone(config),
        };
        set({ cart: [...get().cart, line] });
      },

      addKitchenToCart: ({ name, price, config }) => {
        const line: CartKitchenFurnitureLine = {
          kind: "kitchen-furniture",
          lineId: uuidv4(),
          name,
          price,
          quantity: 1,
          config: structuredClone(config),
        };
        set({ cart: [...get().cart, line] });
      },

      addModulePlannerToCart: ({ name, price, module, selection, breakdown }) => {
        const line: CartModulePlannerLine = {
          kind: "module-planner",
          lineId: uuidv4(),
          name,
          price,
          quantity: 1,
          module: structuredClone(module),
          ...(selection ? { selection: structuredClone(selection) } : {}),
          ...(breakdown ? { breakdown: structuredClone(breakdown) } : {}),
        };
        set({ cart: [...get().cart, line] });
      },

      removeFromCart: (lineId: string) => {
        set({ cart: get().cart.filter((c) => c.lineId !== lineId) });
      },

      updateCartQuantity: (lineId: string, quantity: number) => {
        if (quantity <= 0) {
          set({ cart: get().cart.filter((c) => c.lineId !== lineId) });
        } else {
          set({
            cart: get().cart.map((c) =>
              c.lineId === lineId ? { ...c, quantity } : c
            ),
          });
        }
      },

      clearCart: () => set({ cart: [] }),

      getCartTotal: () => {
        return get().cart.reduce((total, line) => total + lineTotal(line), 0);
      },
    }),
    {
      name: "metrics-published-storage",
      version: 6,
      migrate: (persistedState: unknown, version: number) => {
        let p = persistedState as Record<string, unknown> & { cart?: unknown[] };
        if (version < 2) {
          if (!p?.cart || !Array.isArray(p.cart)) {
            /* keep p */
          } else {
            p = {
              ...p,
              cart: p.cart.map((line: unknown) => {
                if (
                  line &&
                  typeof line === "object" &&
                  "kind" in line &&
                  (line as CartLine).kind === "catalog"
                ) {
                  return line as CartCatalogLine;
                }
                if (
                  line &&
                  typeof line === "object" &&
                  "kind" in line &&
                  (line as CartLine).kind === "wardrobe"
                ) {
                  return line as CartWardrobeLine;
                }
                const l = line as { item?: CatalogItem; quantity?: number };
                if (l?.item?.id) {
                  const catalogLine: CartCatalogLine = {
                    kind: "catalog",
                    lineId: l.item.id,
                    item: l.item,
                    quantity: typeof l.quantity === "number" ? l.quantity : 1,
                  };
                  return catalogLine;
                }
                return line;
              }),
            };
          }
        }
        if (version < 3) {
          const existing = p.plannerCustomModules;
          p = {
            ...p,
            plannerCustomModules: Array.isArray(existing) ? existing : [],
          };
        }
        if (version < 4) {
          /* cart lines may gain kind "module-planner"; older carts unchanged */
        }
        if (version < 5) {
          /* module-planner lines may gain selection + breakdown */
        }
        if (version < 6) {
          const w = p.plannerSavedWardrobes;
          p = {
            ...p,
            plannerSavedWardrobes: Array.isArray(w) ? w : [],
          };
        }
        return p;
      },
      partialize: (state) => ({
        canvasObjects: state.canvasObjects,
        builderModules: state.builderModules,
        plannerCustomModules: state.plannerCustomModules,
        plannerSavedWardrobes: state.plannerSavedWardrobes,
        cart: state.cart,
      }),
    }
  )
);

export function useHydration() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const unsub = useStore.persist.onFinishHydration(() => setHydrated(true));
    if (useStore.persist.hasHydrated()) {
      queueMicrotask(() => setHydrated(true));
    }
    return () => unsub();
  }, []);

  return hydrated;
}
